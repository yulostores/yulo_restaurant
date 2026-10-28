// The live customer dashboard (Live Monitor and Manager · Live Monitoring — one owner login).
// Who is browsing right now, what is in their cart, and each visit's timeline, kept current
// over the socket (useLiveSocket). Customers appear by first name only.
// API.md § Live Activity & Personal Offers.

import { useEffect, useRef, useState } from "react";
import { Gift, RefreshCw, Search, ShoppingBag } from "lucide-react";

import RevokeOfferButton from "@/components/live/RevokeOfferButton";
import SendOfferDialog from "@/components/live/SendOfferDialog";
import { OFFER_STATUS_CHIP } from "@/components/live/OffersTab";
import { NOT_ELIGIBLE_TEXT, offerValueText } from "@/lib/offerRules";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { formatMoney, formatTime } from "@/lib/bill";
import { SOCKET_STATES, useOwnerSocketState } from "@/lib/socket";
import { cn } from "@/lib/utils";
import {
  SESSION_FILTERS,
  timeAgo,
  useLiveSessions,
  useLiveSocket,
  useNow,
  useOfferMetrics,
  useSessionDetail,
  useSessionEvents,
} from "@/hooks/owner/useLiveSessions";

/** Paise from the API, shown with the portal's one money format. */
export const formatPaise = (paise) => formatMoney((paise ?? 0) / 100);

// Text on every chip — the colour is never the only signal.
export const STATUS_CHIP = {
  active: { label: "Active", variant: "ok" },
  idle: { label: "Idle", variant: "muted" },
  abandoned: { label: "Abandoned", variant: "warn" },
  converted: { label: "Ordered", variant: "info" },
  ended: { label: "Left", variant: "muted" },
};

const isNotEnabled = (error) => error?.status === 404;

function StatusChip({ status }) {
  const chip = STATUS_CHIP[status] ?? { label: status, variant: "muted" };
  return <Badge variant={chip.variant}>{chip.label}</Badge>;
}

function ConnectionDot() {
  const state = useOwnerSocketState();
  const live = state === SOCKET_STATES.CONNECTED;
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-semibold" role="status">
      <span className={cn("h-2.5 w-2.5 rounded-full", live ? "bg-[#2E7D32]" : "bg-[#D9480F] animate-pulse")} aria-hidden />
      {live ? "Live" : state === SOCKET_STATES.RECONNECTING ? "Reconnecting…" : "Offline — refreshing every 30 s"}
    </span>
  );
}

function HeaderStrip({ summary, metrics }) {
  const items = [
    { label: "Browsing now", value: summary?.live ?? 0 },
    {
      label: "Carts in progress",
      value: summary?.cartsInProgress ?? 0,
      sub: formatPaise(summary?.cartsTotalPaise),
    },
    { label: "Abandoned (last hour)", value: summary?.abandonedLastHour ?? 0 },
    {
      label: "Offers today",
      value: metrics ? `${metrics.sent} sent → ${metrics.redeemed} used` : "—",
      sub: metrics ? `${Math.round((metrics.conversionRate ?? 0) * 100)}% converted` : null,
    },
  ];
  return (
    <section className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Live summary">
      {items.map((item) => (
        <Card key={item.label}>
          <CardContent className="p-4">
            <p className="text-xs font-medium text-muted-foreground">{item.label}</p>
            <p className="mt-1 text-xl font-bold">{item.value}</p>
            {item.sub ? <p className="text-xs text-muted-foreground">{item.sub}</p> : null}
          </CardContent>
        </Card>
      ))}
    </section>
  );
}

function SessionRowView({ row, selected, now, onSelect, onKeyDown, buttonRef }) {
  return (
    <li role="option" aria-selected={selected}>
      <button
        type="button"
        ref={buttonRef}
        tabIndex={selected ? 0 : -1}
        onClick={() => onSelect(row.id)}
        onKeyDown={onKeyDown}
        className={cn(
          "w-full rounded-xl border px-4 py-3 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange",
          selected ? "border-brand-orange bg-[#FFF6EF]" : "border-brand-cream/60 hover:bg-[#FCFAF7]",
        )}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">
              {row.displayName}
              {row.pastOrderCount > 0 ? (
                <span className="ml-2 text-xs font-medium text-brand-orange">
                  Returning · {row.pastOrderCount} past order{row.pastOrderCount === 1 ? "" : "s"}
                </span>
              ) : null}
            </p>
            <p className="truncate text-xs text-muted-foreground">{row.lastEvent?.label ?? "Just arrived"}</p>
          </div>
          <StatusChip status={row.status} />
        </div>
        <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {row.cart.itemCount > 0
              ? `${row.cart.itemCount} item${row.cart.itemCount === 1 ? "" : "s"} · ${formatPaise(row.cart.totalPaise)}`
              : "Empty cart"}
          </span>
          <span>{timeAgo(row.lastActivityAt, now)}</span>
        </div>
        {!row.offerEligible && row.notEligibleReason ? (
          <p className="mt-1 text-[11px] text-muted-foreground">{NOT_ELIGIBLE_TEXT[row.notEligibleReason]}</p>
        ) : null}
      </button>
    </li>
  );
}

function SessionList({ sessions, selectedId, onSelect }) {
  const now = useNow();
  const buttons = useRef([]);
  const index = Math.max(0, sessions.findIndex((s) => s.id === selectedId));

  // Arrow keys move through the list (and open the row); Home / End jump.
  const onKeyDown = (event) => {
    const moves = { ArrowDown: 1, ArrowUp: -1 };
    let next = null;
    if (event.key in moves) next = Math.min(sessions.length - 1, Math.max(0, index + moves[event.key]));
    if (event.key === "Home") next = 0;
    if (event.key === "End") next = sessions.length - 1;
    if (next === null) return;
    event.preventDefault();
    onSelect(sessions[next].id);
    buttons.current[next]?.focus();
  };

  return (
    <ul role="listbox" aria-label="Customers browsing now" className="space-y-2">
      {sessions.map((row, i) => (
        <SessionRowView
          key={row.id}
          row={row}
          now={now}
          selected={row.id === selectedId || (!selectedId && i === 0)}
          onSelect={onSelect}
          onKeyDown={onKeyDown}
          buttonRef={(el) => {
            buttons.current[i] = el;
          }}
        />
      ))}
    </ul>
  );
}

function SessionDetail({ restaurantId, sessionId }) {
  const detail = useSessionDetail(restaurantId, sessionId);
  const events = useSessionEvents(restaurantId, sessionId);
  const now = useNow();
  const [sending, setSending] = useState(false);

  if (detail.isLoading) {
    return <div className="h-64 animate-pulse rounded-2xl bg-brand-cream/40" aria-label="Loading visit" />;
  }
  if (detail.isError) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">
          This visit is no longer available.
        </CardContent>
      </Card>
    );
  }
  const { session, cart, offers } = detail.data;
  const timeline = events.data?.pages.flatMap((page) => page.events) ?? [];

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold">{session.displayName}</h2>
            <p className="text-xs text-muted-foreground">
              {session.pastOrderCount > 0 ? `Returning · ${session.pastOrderCount} past orders · ` : "First visit · "}
              Started {formatTime(session.startedAt)} · active {timeAgo(session.lastActivityAt, now)}
            </p>
            {session.cameFromSearch ? (
              <p className="mt-1 inline-flex items-center gap-1 text-xs text-[#5a403e]">
                <Search className="h-3 w-3" /> Came from search: “{session.cameFromSearch}”
              </p>
            ) : null}
          </div>
          <StatusChip status={session.status} />
        </div>
        <div className="flex flex-wrap items-center gap-3 pt-1">
          <Button
            size="sm"
            disabled={!session.offerEligible}
            onClick={() => setSending(true)}
            className="bg-brand-gradient text-white hover:brightness-105"
            aria-describedby={session.offerEligible ? undefined : `why-${session.id}`}
          >
            <Gift /> Send offer
          </Button>
          {!session.offerEligible && session.notEligibleReason ? (
            <span id={`why-${session.id}`} className="text-xs text-muted-foreground">
              {NOT_ELIGIBLE_TEXT[session.notEligibleReason]}
            </span>
          ) : null}
        </div>
        {sending ? (
          <SendOfferDialog restaurantId={restaurantId} session={session} onClose={() => setSending(false)} />
        ) : null}
      </CardHeader>
      <CardContent className="space-y-5">
        <section aria-label="Cart">
          <h3 className="mb-2 flex items-center gap-1.5 text-sm font-bold">
            <ShoppingBag className="h-4 w-4" /> Cart
          </h3>
          {cart.items.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing in the cart.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="pb-1 font-medium">Item</th>
                  <th className="pb-1 text-right font-medium">Qty</th>
                  <th className="pb-1 text-right font-medium">Price</th>
                  <th className="pb-1 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {cart.items.map((line) => (
                  <tr key={line.menuItemId} className="border-t border-brand-cream/40">
                    <td className="py-1.5">{line.name}</td>
                    <td className="py-1.5 text-right">{line.qty}</td>
                    <td className="py-1.5 text-right">{formatPaise(line.unitPricePaise)}</td>
                    <td className="py-1.5 text-right">{formatPaise(line.unitPricePaise * line.qty)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-brand-cream/60 font-semibold">
                  <td className="pt-2" colSpan={3}>
                    Cart total (with charges)
                  </td>
                  <td className="pt-2 text-right">{formatPaise(cart.totalPaise)}</td>
                </tr>
              </tfoot>
            </table>
          )}
        </section>

        {offers.length > 0 ? (
          <section aria-label="Offers in this visit">
            <h3 className="mb-2 text-sm font-bold">Offers sent</h3>
            <ul className="space-y-1.5">
              {offers.map((offer) => (
                <li key={offer.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="min-w-0 truncate">
                    {offer.title} · <span className="text-muted-foreground">{offerValueText(offer)}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <Badge variant={OFFER_STATUS_CHIP[offer.status]?.variant ?? "muted"}>
                      {OFFER_STATUS_CHIP[offer.status]?.label ?? offer.status}
                    </Badge>
                    <RevokeOfferButton restaurantId={restaurantId} offer={offer} customerName={session.displayName} />
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section aria-label="Timeline">
          <h3 className="mb-2 text-sm font-bold">Timeline</h3>
          {events.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (
            <ol className="space-y-1.5">
              {timeline.map((event) => (
                <li key={event.id} className="flex justify-between gap-3 text-sm">
                  <span>{event.label}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{formatTime(event.at)}</span>
                </li>
              ))}
            </ol>
          )}
          {events.hasNextPage ? (
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              disabled={events.isFetchingNextPage}
              onClick={() => events.fetchNextPage()}
            >
              {events.isFetchingNextPage ? "Loading…" : "Load earlier"}
            </Button>
          ) : null}
        </section>
      </CardContent>
    </Card>
  );
}

export default function LiveDashboard({ restaurantId }) {
  const [filter, setFilter] = useState("all");
  const [selectedId, setSelectedId] = useState(null);
  const detailRef = useRef(null);

  useLiveSocket(restaurantId, {
    onSessionRemoved: (sessionId) => setSelectedId((current) => (current === sessionId ? null : current)),
  });
  const list = useLiveSessions(restaurantId, filter);
  const metrics = useOfferMetrics(restaurantId, "today");
  const sessions = list.data?.sessions ?? [];
  const openId = selectedId && sessions.some((s) => s.id === selectedId) ? selectedId : sessions[0]?.id ?? null;

  const select = (id) => {
    setSelectedId(id);
    // Narrow screens stack the detail under the list: bring it into view.
    if (window.matchMedia?.("(max-width: 1023px)").matches) detailRef.current?.scrollIntoView?.({ behavior: "smooth" });
  };

  // A row that left the current filter (or the list) no longer holds the selection.
  useEffect(() => {
    if (selectedId && list.data && !sessions.some((s) => s.id === selectedId)) setSelectedId(null);
  }, [list.data, selectedId, sessions]);

  if (isNotEnabled(list.error)) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <h2 className="text-base font-bold">Live customer activity isn't switched on yet</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Ask the Yulo team to turn it on for your restaurant. Then you'll see customers browsing
            your menu here as it happens.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter customers">
          {Object.entries(SESSION_FILTERS).map(([key, f]) => (
            <Button
              key={key}
              size="sm"
              variant={filter === key ? "default" : "outline"}
              aria-pressed={filter === key}
              onClick={() => setFilter(key)}
            >
              {f.label}
            </Button>
          ))}
        </div>
        <ConnectionDot />
      </div>

      <HeaderStrip summary={list.data?.summary} metrics={metrics.data} />

      {list.isLoading ? (
        <div className="space-y-2" aria-label="Loading customers">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-xl bg-brand-cream/40" />
          ))}
        </div>
      ) : list.isError ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
            <p className="text-sm text-muted-foreground">Couldn't load live customers: {list.error.message}</p>
            <Button variant="outline" size="sm" onClick={() => list.refetch()}>
              <RefreshCw /> Try again
            </Button>
          </CardContent>
        </Card>
      ) : sessions.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            No customers browsing right now.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <SessionList sessions={sessions} selectedId={openId} onSelect={select} />
          </div>
          <div className="lg:col-span-3" ref={detailRef}>
            {openId ? <SessionDetail restaurantId={restaurantId} sessionId={openId} /> : null}
          </div>
        </div>
      )}
    </div>
  );
}
