import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { activityEventFor, eventsPage, fakeOwnerSocket, sessionRow, sessionsPage } from "@/test/liveFixtures";

const socketState = vi.hoisted(() => ({ value: "connected" }));
vi.mock("@/lib/socket", async (importOriginal) => ({
  ...(await importOriginal()),
  useOwnerSocketState: () => socketState.value,
}));
const api = vi.hoisted(() => ({}));
vi.mock("@/api/owner.api", () => ({ ownerApi: api }));

import {
  liveKeys,
  patchDetailOffer,
  prependEvent,
  removeSession,
  upsertSession,
  useLiveSessions,
  useLiveSocket,
} from "./useLiveSessions";

const R = "r1";
let qc;
let owner;
const wrapper = ({ children }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
const ids = (data) => data.sessions.map((s) => s.id);

beforeEach(() => {
  qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  owner = fakeOwnerSocket();
  socketState.value = "connected";
});
afterEach(() => qc.clear());

describe("cache patches", () => {
  it("session_updated inserts, updates and resorts newest first", () => {
    let data = sessionsPage([sessionRow({ id: "a", ago: 5 }), sessionRow({ id: "b", ago: 10 })]);
    data = upsertSession(data, sessionRow({ id: "c", ago: 1 }), "all");
    expect(ids(data)).toEqual(["c", "a", "b"]);
    data = upsertSession(data, sessionRow({ id: "b", ago: 0, status: "active" }), "all");
    expect(ids(data)).toEqual(["b", "c", "a"]);
  });

  it("a row that no longer matches the list's filter leaves it", () => {
    const data = sessionsPage([sessionRow({ id: "a", status: "active" })]);
    expect(ids(upsertSession(data, sessionRow({ id: "a", ago: 0, status: "abandoned" }), "active"))).toEqual([]);
    const empty = sessionRow({ id: "a", ago: 0, cart: { itemCount: 0, totalPaise: 0, items: [] } });
    expect(ids(upsertSession(data, empty, "cart"))).toEqual([]);
  });

  it("a stale session_updated (older than the cached row) is ignored", () => {
    const fresh = sessionRow({ id: "a", ago: 1, eventCount: 9 });
    const data = sessionsPage([fresh]);
    const stale = sessionRow({ id: "a", ago: 5, eventCount: 3 });
    expect(upsertSession(data, stale, "all")).toBe(data);
  });

  it("session_removed deletes; activity_event prepends once; offer_updated moves the chip", () => {
    expect(ids(removeSession(sessionsPage([sessionRow({ id: "a" }), sessionRow({ id: "b" })]), "a"))).toEqual(["b"]);

    const pages = { pages: [eventsPage(["e1", "e2"], "cursor")], pageParams: [null] };
    const once = prependEvent(pages, activityEventFor("a", "e0"));
    expect(once.pages[0].events.map((e) => e.id)).toEqual(["e0", "e1", "e2"]);
    expect(prependEvent(once, activityEventFor("a", "e0"))).toBe(once);
    expect(once.pages[0].events[0]).not.toHaveProperty("sessionId");

    const detail = { offers: [{ id: "o1", status: "sent" }] };
    expect(patchDetailOffer(detail, { offerId: "o1", offerStatus: "redeemed", orderId: "ord" }).offers[0]).toEqual({
      id: "o1",
      status: "redeemed",
      orderId: "ord",
    });
  });
});

describe("useLiveSocket", () => {
  const mount = (onSessionRemoved) =>
    renderHook(() => useLiveSocket(R, { owner, onSessionRemoved }), { wrapper });

  it("patches every cached list and the open session from session_updated", () => {
    qc.setQueryData(liveKeys.sessions(R, "all"), sessionsPage([sessionRow({ id: "a", ago: 5 })]));
    qc.setQueryData(liveKeys.sessions(R, "abandoned"), sessionsPage([]));
    qc.setQueryData(liveKeys.session(R, "a"), { session: sessionRow({ id: "a", ago: 5 }), cart: {}, offers: [] });
    mount();

    act(() => owner.emit("session_updated", sessionRow({ id: "a", ago: 0, eventCount: 7 })));
    expect(qc.getQueryData(liveKeys.sessions(R, "all")).sessions[0].eventCount).toBe(7);
    expect(ids(qc.getQueryData(liveKeys.sessions(R, "abandoned")))).toEqual([]);
    expect(qc.getQueryData(liveKeys.session(R, "a")).session.eventCount).toBe(7);

    act(() => owner.emit("session_updated", sessionRow({ id: "b", ago: 0, status: "abandoned" })));
    expect(ids(qc.getQueryData(liveKeys.sessions(R, "abandoned")))).toEqual(["b"]);
  });

  it("session_removed deletes the row and tells the screen", () => {
    qc.setQueryData(liveKeys.sessions(R, "all"), sessionsPage([sessionRow({ id: "a" })]));
    qc.setQueryData(liveKeys.session(R, "a"), { session: sessionRow({ id: "a" }) });
    const removed = vi.fn();
    mount(removed);
    act(() => owner.emit("session_removed", { sessionId: "a" }));
    expect(ids(qc.getQueryData(liveKeys.sessions(R, "all")))).toEqual([]);
    expect(qc.getQueryData(liveKeys.session(R, "a"))).toBeUndefined();
    expect(removed).toHaveBeenCalledWith("a");
  });

  it("activity_event prepends to that session's timeline once", () => {
    qc.setQueryData(liveKeys.events(R, "a"), { pages: [eventsPage(["e1"])], pageParams: [null] });
    mount();
    act(() => owner.emit("activity_event", activityEventFor("a", "e9")));
    act(() => owner.emit("activity_event", activityEventFor("a", "e9")));
    expect(qc.getQueryData(liveKeys.events(R, "a")).pages[0].events.map((e) => e.id)).toEqual(["e9", "e1"]);
  });

  it("offer_updated moves the chip and refreshes metrics", () => {
    qc.setQueryData(liveKeys.session(R, "a"), { offers: [{ id: "o1", status: "sent" }] });
    const invalidate = vi.spyOn(qc, "invalidateQueries");
    mount();
    act(() => owner.emit("offer_updated", { offerId: "o1", sessionId: "a", offerStatus: "delivered" }));
    expect(qc.getQueryData(liveKeys.session(R, "a")).offers[0].status).toBe("delivered");
    expect(invalidate).toHaveBeenCalledWith({ queryKey: liveKeys.allMetrics(R) });
  });

  it("back in the room after a gap: every live query is refetched", () => {
    const invalidate = vi.spyOn(qc, "invalidateQueries");
    mount();
    act(() => owner.setState("reconnecting"));
    expect(invalidate).not.toHaveBeenCalled();
    act(() => owner.setState("connected"));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: liveKeys.sessionLists(R) });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: liveKeys.sessionDetails(R) });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: liveKeys.allEvents(R) });
  });
});

describe("polling fallback", () => {
  beforeEach(() => {
    api.listLiveSessions = vi.fn(async () => ({ data: { data: sessionsPage([sessionRow()]) } }));
  });

  const intervalOf = (filter) => qc.getQueryCache().find({ queryKey: liveKeys.sessions(R, filter) }).options.refetchInterval;

  it("polls every 30 s while the socket is down, not while it is live", async () => {
    socketState.value = "reconnecting";
    const offline = renderHook(() => useLiveSessions(R, "all"), { wrapper });
    await waitFor(() => expect(offline.result.current.isSuccess).toBe(true));
    expect(intervalOf("all")).toBe(30_000);
    offline.unmount();

    socketState.value = "connected";
    const live = renderHook(() => useLiveSessions(R, "active"), { wrapper });
    await waitFor(() => expect(live.result.current.isSuccess).toBe(true));
    expect(intervalOf("active")).toBe(false);
    expect(api.listLiveSessions).toHaveBeenLastCalledWith(R, { status: "active,idle", limit: 50 });
  });
});
