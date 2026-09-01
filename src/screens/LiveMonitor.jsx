// Live Monitor (/live-monitor) — GET /api/owner/:rId/live-monitor,
// /live-monitor/visitors and /live-monitor/repeat.
//
// Also lets the owner fire a targeted flash offer, which the server broadcasts
// to every active visitor as a `targeted_offer` Socket.IO event.

import { useState } from "react";
import { Zap } from "lucide-react";

import { useOwnerAuth } from "@/context/OwnerAuthContext";
import {
  useCreateTargetedOffer,
  useLiveRepeat,
  useLiveStats,
  useLiveVisitors,
} from "@/hooks/owner/useLiveMonitor";
import DashboardLayout from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function formatPrice(value) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency", currency: "INR", maximumFractionDigits: 0,
  }).format(Number(value) || 0);
}

// `lastSeen` is a unix timestamp in seconds.
function lastSeenLabel(seconds) {
  if (!seconds) return "—";
  const mins = Math.max(0, Math.round((Date.now() / 1000 - seconds) / 60));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  return `${Math.round(mins / 60)}h ago`;
}

function StatCard({ title, value, sub }) {
  return (
    <Card>
      <CardContent className="p-5">
        <p className="text-sm text-muted-foreground">{title}</p>
        <p className="mt-1 text-3xl font-bold">{value ?? "—"}</p>
        {sub ? <p className="mt-1 text-xs text-muted-foreground">{sub}</p> : null}
      </CardContent>
    </Card>
  );
}

const EMPTY_OFFER = { offerName: "", percentage: "", minutes: "30" };

export default function LiveMonitor() {
  const { restaurantId } = useOwnerAuth();

  const { data: stats,           isLoading: statsLoading }    = useLiveStats(restaurantId);
  const { data: visitors = [],   isLoading: visitorsLoading } = useLiveVisitors(restaurantId);
  const { data: repeat = [],     isLoading: repeatLoading }   = useLiveRepeat(restaurantId);
  const createOffer = useCreateTargetedOffer(restaurantId);

  const [offer, setOffer] = useState(EMPTY_OFFER);
  const [offerNote, setOfferNote] = useState("");

  async function fireOffer(event) {
    event.preventDefault();
    setOfferNote("");
    const percentage = Number(offer.percentage);
    if (!offer.offerName.trim() || !percentage) {
      setOfferNote("Give the offer a name and a percentage.");
      return;
    }
    const start = new Date();
    const end = new Date(start.getTime() + (Number(offer.minutes) || 30) * 60_000);
    try {
      await createOffer.mutateAsync({
        offerName: offer.offerName.trim(),
        type: "percentage",
        percentage,
        startDate: start.toISOString(),
        endDate: end.toISOString(),
      });
      setOffer(EMPTY_OFFER);
      setOfferNote("Offer broadcast to active visitors.");
    } catch (err) {
      setOfferNote(err.message);
    }
  }

  if (!restaurantId) {
    return (
      <DashboardLayout>
        <p className="text-muted-foreground">No restaurant is linked to this account yet.</p>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div>
        <h1 className="text-2xl font-bold">Live Monitor</h1>
        <p className="text-sm text-muted-foreground">
          Live data — refreshes every 30 seconds.
        </p>
      </div>

      {/* Stats */}
      <section className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {statsLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-2xl bg-brand-cream/40" />
          ))
        ) : (
          <>
            <StatCard
              title="Active Visitors"
              value={stats?.activeVisitors ?? 0}
              sub="Seen in the last 5 min"
            />
            <StatCard
              title="Open Sessions"
              value={stats?.openSessions ?? 0}
              sub="Tables currently seated"
            />
            <StatCard
              title="Pending Orders"
              value={stats?.pendingOrders ?? 0}
              sub="Awaiting the kitchen"
            />
            <StatCard
              title="Today's GMV"
              value={formatPrice(stats?.todayGMV)}
              sub="Gross merchandise value"
            />
          </>
        )}
      </section>

      {/* Targeted offer */}
      <Card>
        <CardHeader className="pb-3">
          <h2 className="flex items-center gap-2 text-base font-bold">
            <Zap className="h-4 w-4 text-brand-orange" /> Flash Offer
          </h2>
          <p className="text-xs text-muted-foreground">
            Pushed live to everyone currently browsing your menu.
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={fireOffer} className="flex flex-wrap items-end gap-4">
            <div className="space-y-1.5">
              <Label>Offer name</Label>
              <Input
                value={offer.offerName}
                onChange={(e) => setOffer((o) => ({ ...o, offerName: e.target.value }))}
                placeholder="Flash 10% off"
                className="w-56"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Discount %</Label>
              <Input
                value={offer.percentage}
                onChange={(e) => setOffer((o) => ({ ...o, percentage: e.target.value }))}
                placeholder="10"
                inputMode="numeric"
                className="w-24"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Valid for (min)</Label>
              <Input
                value={offer.minutes}
                onChange={(e) => setOffer((o) => ({ ...o, minutes: e.target.value }))}
                inputMode="numeric"
                className="w-28"
              />
            </div>
            <Button
              type="submit"
              disabled={createOffer.isPending}
              className="bg-brand-gradient text-white hover:brightness-105"
            >
              {createOffer.isPending ? "Broadcasting…" : "Broadcast"}
            </Button>
            {offerNote ? (
              <span className="text-sm text-muted-foreground">{offerNote}</span>
            ) : null}
          </form>
        </CardContent>
      </Card>

      {/* Active visitors */}
      <Card>
        <CardHeader className="pb-3">
          <h2 className="text-base font-bold">Active Visitors</h2>
          <p className="text-xs text-muted-foreground">
            Visitors drop off after 5 minutes of inactivity.
          </p>
        </CardHeader>
        <CardContent>
          {visitorsLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : visitors.length === 0 ? (
            <p className="text-sm text-muted-foreground">No active visitors right now.</p>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {visitors.map((v) => (
                <div
                  key={v.userId}
                  className="flex items-center justify-between rounded-xl border border-brand-cream/60 px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{v.name ?? "Guest"}</p>
                    <p className="text-xs text-muted-foreground">
                      {v.tableId ? `Table ${String(v.tableId).slice(-4).toUpperCase()} · ` : ""}
                      {lastSeenLabel(v.lastSeen)}
                    </p>
                  </div>
                  <Badge variant="ok">Active</Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Repeat visitors */}
      <Card>
        <CardHeader className="pb-3">
          <h2 className="text-base font-bold">Repeat Customers</h2>
          <p className="text-xs text-muted-foreground">
            Guests who have ordered here more than once.
          </p>
        </CardHeader>
        <CardContent>
          {repeatLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : repeat.length === 0 ? (
            <p className="text-sm text-muted-foreground">No repeat customers yet.</p>
          ) : (
            <div className="divide-y divide-brand-cream/40">
              {repeat.map((v) => (
                <div key={v._id} className="flex items-center justify-between py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{v.name ?? "Guest"}</p>
                    <p className="truncate text-xs text-muted-foreground">{v.email}</p>
                  </div>
                  <span className="shrink-0 text-sm font-bold text-brand-orange">
                    {v.orderCount} orders
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </DashboardLayout>
  );
}
