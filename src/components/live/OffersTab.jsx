// The Offers tab: every personal offer sent (customer, discount, status, sent time, a countdown
// while it is open, the order it was used on), by IST date range and page, and the offer
// funnel for today / 7 days / 30 days. Status chips move live with `offer_updated`.

import { useState } from "react";
import { Info } from "lucide-react";

import RevokeOfferButton, { OPEN_OFFER_STATUSES } from "@/components/live/RevokeOfferButton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatDateTime } from "@/lib/bill";
import { offerErrorText, offerValueText, paiseText } from "@/lib/offerRules";
import { useLiveOffers, useNow, useOfferMetrics } from "@/hooks/owner/useLiveSessions";

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_RANGE_DAYS = 90;

export const OFFER_STATUS_CHIP = {
  sent: { label: "Sent", variant: "info" },
  delivered: { label: "Delivered", variant: "info" },
  viewed: { label: "Viewed", variant: "info" },
  applied: { label: "In cart", variant: "warn" },
  redeemed: { label: "Used", variant: "ok" },
  expired: { label: "Expired", variant: "muted" },
  revoked: { label: "Revoked", variant: "danger" },
};

// API.md → Metrics: how each number is counted.
export const FUNNEL_DEFINITIONS =
  "Counts are over offers sent in the range (IST days, including today). A stage counts every offer that ever reached it, so the funnel never goes up: an offer that was used was also viewed and applied. Conversion = used ÷ sent. Revenue and discount add up the orders the offers were used on, leaving out cancelled orders.";

const istDate = (date) => date.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

export function defaultRange(now = new Date()) {
  return { from: istDate(new Date(now.getTime() - 29 * DAY_MS)), to: istDate(now) };
}

/** Why a from/to pair can't be used, or null. */
export function rangeError({ from, to }) {
  if (!from || !to) return "Choose both dates.";
  const days = Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS) + 1;
  if (days < 1) return "The start date must be on or before the end date.";
  if (days > MAX_RANGE_DAYS) return `Choose at most ${MAX_RANGE_DAYS} days.`;
  return null;
}

function expiresIn(iso, now) {
  const minutes = Math.ceil((Date.parse(iso) - now) / 60_000);
  if (minutes <= 0) return "ending";
  if (minutes < 60) return `in ${minutes} min`;
  return `in ${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}

function Funnel({ restaurantId }) {
  const [range, setRange] = useState("today");
  const [showHelp, setShowHelp] = useState(false);
  const { data, isLoading, isError, error } = useOfferMetrics(restaurantId, range);
  const steps = [
    ["Sent", "sent"],
    ["Delivered", "delivered"],
    ["Viewed", "viewed"],
    ["In cart", "applied"],
    ["Used", "redeemed"],
  ];

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-1.5 text-base font-bold">
            Offer results
            <button
              type="button"
              aria-label="How these are counted"
              aria-expanded={showHelp}
              onClick={() => setShowHelp((v) => !v)}
              className="text-muted-foreground hover:text-foreground"
            >
              <Info className="h-4 w-4" />
            </button>
          </h2>
          <div className="flex gap-1.5" role="group" aria-label="Range">
            {[
              ["today", "Today"],
              ["7d", "7 days"],
              ["30d", "30 days"],
            ].map(([key, label]) => (
              <Button key={key} size="sm" variant={range === key ? "default" : "outline"} aria-pressed={range === key} onClick={() => setRange(key)}>
                {label}
              </Button>
            ))}
          </div>
        </div>
        {showHelp ? (
          <p role="note" className="rounded-lg bg-[#FCFAF7] p-3 text-xs text-muted-foreground">
            {FUNNEL_DEFINITIONS}
          </p>
        ) : null}
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="h-16 animate-pulse rounded-xl bg-brand-cream/40" aria-label="Loading results" />
        ) : isError ? (
          <p className="text-sm text-muted-foreground">{offerErrorText(error)}</p>
        ) : (
          <div className="space-y-3" data-testid={`funnel-${range}`}>
            <ol className="grid grid-cols-5 gap-2 text-center">
              {steps.map(([label, key]) => (
                <li key={key} className="rounded-xl bg-[#FCFAF7] p-2">
                  <p className="text-lg font-bold">{data[key]}</p>
                  <p className="text-[11px] text-muted-foreground">{label}</p>
                </li>
              ))}
            </ol>
            <p className="text-sm">
              <strong>{Math.round(data.conversionRate * 100)}%</strong> converted · revenue{" "}
              <strong>{paiseText(data.revenuePaise)}</strong> · discount given <strong>{paiseText(data.discountPaise)}</strong>
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function OffersTab({ restaurantId }) {
  const [draft, setDraft] = useState(defaultRange);
  const [range, setRange] = useState(defaultRange);
  const [page, setPage] = useState(1);
  const now = useNow();
  const { data, isLoading, isError, error, isFetching } = useLiveOffers(restaurantId, { ...range, page });
  const draftError = rangeError(draft);

  const apply = (event) => {
    event.preventDefault();
    if (draftError) return;
    setRange(draft);
    setPage(1);
  };

  return (
    <div className="space-y-4">
      <Funnel restaurantId={restaurantId} />

      <Card>
        <CardHeader className="pb-3">
          <h2 className="text-base font-bold">Offers sent</h2>
          <form onSubmit={apply} className="flex flex-wrap items-end gap-3" aria-label="Date range">
            <div className="space-y-1">
              <Label htmlFor="offers-from">From</Label>
              <Input id="offers-from" type="date" value={draft.from} onChange={(e) => setDraft((d) => ({ ...d, from: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="offers-to">To</Label>
              <Input id="offers-to" type="date" value={draft.to} onChange={(e) => setDraft((d) => ({ ...d, to: e.target.value }))} />
            </div>
            <Button type="submit" size="sm" variant="outline" disabled={!!draftError}>
              Show
            </Button>
            {draftError ? <p className="text-xs text-brand-maroon">{draftError}</p> : null}
          </form>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <p className="p-6 text-sm text-muted-foreground">Loading…</p>
          ) : isError ? (
            <p className="p-6 text-sm text-muted-foreground">{offerErrorText(error)}</p>
          ) : data.offers.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">No offers sent in these dates.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm" aria-busy={isFetching}>
                <thead>
                  <tr className="border-b border-brand-cream/60 text-left text-xs text-muted-foreground">
                    <th className="px-4 py-2 font-medium">Customer</th>
                    <th className="px-4 py-2 font-medium">Discount</th>
                    <th className="px-4 py-2 font-medium">Status</th>
                    <th className="px-4 py-2 font-medium">Sent</th>
                    <th className="px-4 py-2 font-medium">Expires</th>
                    <th className="px-4 py-2 font-medium">Order</th>
                    <th className="px-4 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {data.offers.map((offer) => {
                    const chip = OFFER_STATUS_CHIP[offer.status] ?? { label: offer.status, variant: "muted" };
                    const open = OPEN_OFFER_STATUSES.includes(offer.status);
                    return (
                      <tr key={offer.id} className="border-b border-brand-cream/40">
                        <td className="px-4 py-2 font-semibold">{offer.customerName}</td>
                        <td className="px-4 py-2">
                          {offer.title}
                          <span className="block text-xs text-muted-foreground">{offerValueText(offer)}</span>
                        </td>
                        <td className="px-4 py-2">
                          <Badge variant={chip.variant}>{chip.label}</Badge>
                        </td>
                        <td className="px-4 py-2 text-muted-foreground">{formatDateTime(offer.sentAt)}</td>
                        <td className="px-4 py-2 text-muted-foreground">{open ? expiresIn(offer.expiresAt, now) : "—"}</td>
                        <td className="px-4 py-2">
                          {offer.orderId ? `#${offer.orderId.slice(-6).toUpperCase()} · ${paiseText(offer.orderTotalPaise)}` : "—"}
                        </td>
                        <td className="px-4 py-2 text-right">
                          <RevokeOfferButton restaurantId={restaurantId} offer={offer} customerName={offer.customerName} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <div className="flex items-center justify-between px-4 py-3 text-sm">
            <span className="text-muted-foreground">Page {page}</span>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
                Previous
              </Button>
              <Button size="sm" variant="outline" disabled={!data?.hasMore} onClick={() => setPage((p) => p + 1)}>
                Next
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
