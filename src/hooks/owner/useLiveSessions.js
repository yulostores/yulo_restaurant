// Live customer activity — the owner's dashboard data (API.md § Live Activity & Personal
// Offers). REST through TanStack Query; the socket (src/lib/socket.js) keeps the cache current:
// useLiveSocket patches rows, timelines and offer chips as events arrive, and refetches
// whatever it may have missed after every (re)join. While the socket is down, the queries fall
// back to polling every 30 s.

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { ownerApi } from "@/api/owner.api";
import { SOCKET_STATES, getOwnerSocket, useOwnerSocketState } from "@/lib/socket";

const POLL_MS = 30_000;
const SUMMARY_REFRESH_MS = 10_000;

export const liveKeys = {
  all: (rId) => ["live", rId],
  sessions: (rId, filter) => ["live", rId, "sessions", filter],
  sessionLists: (rId) => ["live", rId, "sessions"],
  session: (rId, sessionId) => ["live", rId, "session", sessionId],
  sessionDetails: (rId) => ["live", rId, "session"],
  events: (rId, sessionId) => ["live", rId, "events", sessionId],
  allEvents: (rId) => ["live", rId, "events"],
  metrics: (rId, range) => ["live", rId, "metrics", range],
  allMetrics: (rId) => ["live", rId, "metrics"],
  offers: (rId, params) => ["live", rId, "offers", params],
  allOffers: (rId) => ["live", rId, "offers"],
};

// The list filters. "Active" is everyone still browsing (active or idle); "With cart" is the
// default statuses narrowed to sessions holding items.
export const SESSION_FILTERS = Object.freeze({
  all: { label: "All", statuses: ["active", "idle", "abandoned"], withCart: false },
  active: { label: "Active", statuses: ["active", "idle"], withCart: false },
  abandoned: { label: "Abandoned", statuses: ["abandoned"], withCart: false },
  cart: { label: "With cart", statuses: ["active", "idle", "abandoned"], withCart: true },
});

const filterOf = (key) => SESSION_FILTERS[key] ?? SESSION_FILTERS.all;

/** Whether a session row belongs in the list for a filter. */
export function matchesFilter(row, filterKey) {
  const filter = filterOf(filterKey);
  if (!filter.statuses.includes(row.status)) return false;
  return !filter.withCart || (row.cart?.itemCount ?? 0) > 0;
}

const time = (iso) => (iso ? new Date(iso).getTime() : 0);
const newestFirst = (a, b) => time(b.lastActivityAt) - time(a.lastActivityAt) || (a.id < b.id ? 1 : -1);

// ─── Cache patches (pure, so they can be tested without a socket) ─────────

/**
 * A `session_updated` row applied to one cached list: replaced or inserted and resorted, or
 * dropped when it no longer matches the list's filter. A row older than the cached one (events
 * delivered out of order) changes nothing.
 */
export function upsertSession(data, row, filterKey) {
  if (!data?.sessions) return data;
  const existing = data.sessions.find((s) => s.id === row.id);
  if (existing && time(row.lastActivityAt) < time(existing.lastActivityAt)) return data;
  const others = data.sessions.filter((s) => s.id !== row.id);
  const sessions = matchesFilter(row, filterKey) ? [...others, row].sort(newestFirst) : others;
  return { ...data, sessions };
}

/** A session the customer hid (opted out) leaves every list. */
export function removeSession(data, sessionId) {
  if (!data?.sessions) return data;
  return { ...data, sessions: data.sessions.filter((s) => s.id !== sessionId) };
}

/** The open session's header follows its row (unless the row is older). */
export function patchDetailSession(detail, row) {
  if (!detail?.session || detail.session.id !== row.id) return detail;
  if (time(row.lastActivityAt) < time(detail.session.lastActivityAt)) return detail;
  return { ...detail, session: row };
}

/**
 * Whether a `session_updated` row says the open session's cart moved on from the one its detail
 * shows. The row carries only names and quantities, while the detail's cart table needs prices,
 * so a change is refetched rather than patched — before, the panel kept the cart it opened with
 * ("Nothing in the cart.") while the row beside it showed what the customer had just added.
 */
export function detailCartChanged(detail, row) {
  if (!detail?.cart || detail.session?.id !== row.id || !row.cart) return false;
  if (time(row.lastActivityAt) < time(detail.session.lastActivityAt)) return false;
  if ((row.cart.totalPaise ?? 0) !== (detail.cart.totalPaise ?? 0)) return true;
  const lines = (items) => (items ?? []).map((i) => `${i.name}×${i.qty}`).join("|");
  return lines(row.cart.items) !== lines(detail.cart.items);
}

/** An `activity_event` goes on top of the timeline's newest page — once, however often it arrives. */
export function prependEvent(pages, event) {
  if (!pages?.pages?.length) return pages;
  if (pages.pages.some((page) => page.events.some((e) => e.id === event.id))) return pages;
  const { sessionId, ...view } = event;
  const [first, ...rest] = pages.pages;
  return { ...pages, pages: [{ ...first, events: [view, ...first.events] }, ...rest] };
}

/** An `offer_updated` moves the offer's chip in one page of the offers table. */
export function patchOffersPage(page, update) {
  if (!page?.offers) return page;
  if (!page.offers.some((offer) => offer.id === update.offerId)) return page;
  return patchDetailOffer(page, update);
}

/** An `offer_updated` moves the offer's chip in the open session. */
export function patchDetailOffer(detail, update) {
  if (!detail?.offers) return detail;
  return {
    ...detail,
    offers: detail.offers.map((offer) =>
      offer.id === update.offerId
        ? { ...offer, status: update.offerStatus, ...(update.orderId ? { orderId: update.orderId } : {}) }
        : offer,
    ),
  };
}

// ─── Queries ───────────────────────────────────────────────────────────────

// A 404 means the feature is off for this restaurant — not worth retrying.
const retryUnless404 = (count, err) => err?.status !== 404 && count < 2;

const usePollingWhileOffline = () => {
  const state = useOwnerSocketState();
  return state === SOCKET_STATES.CONNECTED ? false : POLL_MS;
};

/** `{ sessions, summary }` for a filter key (see SESSION_FILTERS). */
export function useLiveSessions(restaurantId, filterKey = "all") {
  const refetchInterval = usePollingWhileOffline();
  return useQuery({
    queryKey: liveKeys.sessions(restaurantId, filterKey),
    queryFn: () =>
      ownerApi
        .listLiveSessions(restaurantId, { status: filterOf(filterKey).statuses.join(","), limit: 50 })
        .then((r) => {
          const data = r.data.data;
          return { ...data, sessions: data.sessions.filter((row) => matchesFilter(row, filterKey)) };
        }),
    enabled: !!restaurantId,
    refetchInterval,
    retry: retryUnless404,
  });
}

/** `{ session, cart, offers }` for the open session. */
export function useSessionDetail(restaurantId, sessionId) {
  const refetchInterval = usePollingWhileOffline();
  return useQuery({
    queryKey: liveKeys.session(restaurantId, sessionId),
    queryFn: () => ownerApi.getLiveSession(restaurantId, sessionId).then((r) => r.data.data),
    enabled: !!restaurantId && !!sessionId,
    refetchInterval,
    retry: retryUnless404,
  });
}

/** The open session's timeline, newest first; `fetchNextPage()` loads earlier events. */
export function useSessionEvents(restaurantId, sessionId) {
  return useInfiniteQuery({
    queryKey: liveKeys.events(restaurantId, sessionId),
    queryFn: ({ pageParam }) =>
      ownerApi
        .listLiveSessionEvents(restaurantId, sessionId, { limit: 50, ...(pageParam ? { before: pageParam } : {}) })
        .then((r) => r.data.data),
    initialPageParam: null,
    getNextPageParam: (last) => last.nextBefore ?? undefined,
    enabled: !!restaurantId && !!sessionId,
    retry: retryUnless404,
  });
}

/** Offer funnel for "today" | "7d" | "30d". */
export function useOfferMetrics(restaurantId, range = "today") {
  const refetchInterval = usePollingWhileOffline();
  return useQuery({
    queryKey: liveKeys.metrics(restaurantId, range),
    queryFn: () => ownerApi.getLiveMetrics(restaurantId, range).then((r) => r.data.data),
    enabled: !!restaurantId,
    refetchInterval,
    retry: retryUnless404,
  });
}

/** The offers table: `{ offers, from, to, page, limit, hasMore }` for an IST date range and page. */
export function useLiveOffers(restaurantId, { from, to, page = 1, limit = 20 } = {}) {
  const refetchInterval = usePollingWhileOffline();
  const params = { ...(from ? { from } : {}), ...(to ? { to } : {}), page, limit };
  return useQuery({
    queryKey: liveKeys.offers(restaurantId, params),
    queryFn: () => ownerApi.listLiveOffers(restaurantId, params).then((r) => r.data.data),
    enabled: !!restaurantId,
    refetchInterval,
    retry: retryUnless404,
    placeholderData: (previous) => previous,
  });
}

// After any offer change, everything that shows offers or eligibility is refetched.
const refreshAfterOfferChange = (qc, restaurantId) =>
  Promise.all(
    [liveKeys.sessionLists, liveKeys.sessionDetails, liveKeys.allOffers, liveKeys.allMetrics].map((key) =>
      qc.invalidateQueries({ queryKey: key(restaurantId) }),
    ),
  );

/** Sends a personal offer (POST /live/offers). Resolves `{ offer }`. */
export function useSendOffer(restaurantId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body) => ownerApi.sendLiveOffer(restaurantId, body).then((r) => r.data.data),
    onSettled: () => refreshAfterOfferChange(qc, restaurantId),
  });
}

/** Revokes an open offer. */
export function useRevokeOffer(restaurantId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (offerId) => ownerApi.revokeLiveOffer(restaurantId, offerId).then((r) => r.data.data),
    onSettled: () => refreshAfterOfferChange(qc, restaurantId),
  });
}

const PREVIEW_DEBOUNCE_MS = 400;

/**
 * The server's dry run of an offer against the customer's current cart (`preview: true`), 400 ms
 * after `body` last changed. `body` null (an invalid form) clears it. A response that arrives
 * after a newer request was sent is discarded. Returns `{ status: "idle"|"loading"|"ready"|
 * "error", preview, error }`.
 */
export function useOfferPreview(restaurantId, body) {
  const [result, setResult] = useState({ status: "idle", preview: null, error: null });
  const latest = useRef(0);
  const key = body ? JSON.stringify(body) : null;

  useEffect(() => {
    const requestId = ++latest.current;
    if (!key || !restaurantId) {
      setResult({ status: "idle", preview: null, error: null });
      return undefined;
    }
    setResult((r) => ({ ...r, status: "loading" }));
    const timer = setTimeout(() => {
      ownerApi
        .sendLiveOffer(restaurantId, { ...JSON.parse(key), preview: true })
        .then((r) => {
          if (requestId === latest.current) setResult({ status: "ready", preview: r.data.data, error: null });
        })
        .catch((error) => {
          if (requestId === latest.current) setResult({ status: "error", preview: null, error });
        });
    }, PREVIEW_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [key, restaurantId]);

  return result;
}

// ─── Socket → cache ────────────────────────────────────────────────────────

/**
 * Joins `restaurantId`'s owner room while mounted and keeps the cache in step with what the
 * server pushes. `onSessionRemoved(sessionId)` lets the screen close a detail panel whose
 * customer just opted out. `owner` is injectable for tests.
 */
export function useLiveSocket(restaurantId, { onSessionRemoved, owner = getOwnerSocket() } = {}) {
  const qc = useQueryClient();
  const removedRef = useRef(onSessionRemoved);
  removedRef.current = onSessionRemoved;

  useEffect(() => {
    if (!restaurantId) return undefined;
    owner.setRestaurant(restaurantId);
    return () => owner.setRestaurant(null);
  }, [owner, restaurantId]);

  useEffect(() => {
    if (!restaurantId) return undefined;
    let summaryTimer = null;
    // Rows are patched in place; the header strip's totals are refreshed from the server at
    // most every 10 s rather than recomputed from a partial page.
    const refreshSummarySoon = () => {
      if (summaryTimer) return;
      summaryTimer = setTimeout(() => {
        summaryTimer = null;
        qc.invalidateQueries({ queryKey: liveKeys.sessionLists(restaurantId) });
      }, SUMMARY_REFRESH_MS);
    };

    const forEachList = (patch) => {
      for (const [key, data] of qc.getQueriesData({ queryKey: liveKeys.sessionLists(restaurantId) })) {
        qc.setQueryData(key, patch(data, key[3]));
      }
    };

    const offs = [
      owner.on("session_updated", (row) => {
        forEachList((data, filterKey) => upsertSession(data, row, filterKey));
        const detailKey = liveKeys.session(restaurantId, row.id);
        const cartChanged = detailCartChanged(qc.getQueryData(detailKey), row);
        qc.setQueryData(detailKey, (detail) => patchDetailSession(detail, row));
        if (cartChanged) qc.invalidateQueries({ queryKey: detailKey });
        refreshSummarySoon();
      }),
      owner.on("session_removed", ({ sessionId }) => {
        forEachList((data) => removeSession(data, sessionId));
        qc.removeQueries({ queryKey: liveKeys.session(restaurantId, sessionId) });
        qc.removeQueries({ queryKey: liveKeys.events(restaurantId, sessionId) });
        removedRef.current?.(sessionId);
        refreshSummarySoon();
      }),
      owner.on("activity_event", (event) => {
        qc.setQueryData(liveKeys.events(restaurantId, event.sessionId), (pages) => prependEvent(pages, event));
      }),
      owner.on("offer_updated", (update) => {
        if (update.sessionId) {
          qc.setQueryData(liveKeys.session(restaurantId, update.sessionId), (detail) => patchDetailOffer(detail, update));
        }
        for (const [key, page] of qc.getQueriesData({ queryKey: liveKeys.allOffers(restaurantId) })) {
          qc.setQueryData(key, patchOffersPage(page, update));
        }
        qc.invalidateQueries({ queryKey: liveKeys.allMetrics(restaurantId) });
      }),
      // Back in the room after a gap: refetch everything that may have changed meanwhile.
      owner.subscribe((state) => {
        if (state !== SOCKET_STATES.CONNECTED) return;
        qc.invalidateQueries({ queryKey: liveKeys.sessionLists(restaurantId) });
        qc.invalidateQueries({ queryKey: liveKeys.sessionDetails(restaurantId) });
        qc.invalidateQueries({ queryKey: liveKeys.allEvents(restaurantId) });
        qc.invalidateQueries({ queryKey: liveKeys.allMetrics(restaurantId) });
      }),
    ];
    return () => {
      clearTimeout(summaryTimer);
      for (const off of offs) off();
    };
  }, [owner, qc, restaurantId]);
}

// ─── One shared clock for "x min ago" labels ───────────────────────────────

const TICK_MS = 15_000;
const tickListeners = new Set();
let tickTimer = null;
let tickNow = Date.now();

function subscribeTick(listener) {
  tickListeners.add(listener);
  if (!tickTimer) {
    tickNow = Date.now();
    tickTimer = setInterval(() => {
      tickNow = Date.now();
      for (const fn of tickListeners) fn();
    }, TICK_MS);
  }
  return () => {
    tickListeners.delete(listener);
    if (tickListeners.size === 0) {
      clearInterval(tickTimer);
      tickTimer = null;
    }
  };
}

/** The current time, updated every 15 s by one timer shared by every label on the page. */
export function useNow() {
  return useSyncExternalStore(subscribeTick, () => tickNow, () => tickNow);
}

/** "just now", "3 min ago", "2 h ago". */
export function timeAgo(iso, now = Date.now()) {
  const minutes = Math.floor(Math.max(0, now - time(iso)) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  return `${Math.floor(minutes / 60)} h ago`;
}
