// One page for Live Monitor (/live-monitor) and Manager · Live Monitoring (/manager/live) —
// both run on the owner's login. The live customer dashboard, plus the restaurant figures the
// old page had that still carry data: open tables, pending orders, today's GMV, and repeat
// customers (first name and order count only — never email or phone).

import { useState } from "react";

import DashboardLayout from "@/components/DashboardLayout";
import LiveDashboard from "@/components/live/LiveDashboard";
import OffersTab from "@/components/live/OffersTab";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { useOwnerAuth } from "@/context/OwnerAuthContext";
import { useLiveRepeat, useLiveStats } from "@/hooks/owner/useLiveMonitor";
import { formatMoney } from "@/lib/bill";

function StatCard({ title, value, caption }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs font-medium text-muted-foreground">{title}</p>
        <p className="mt-1 text-xl font-bold">{value}</p>
        <p className="text-xs text-muted-foreground">{caption}</p>
      </CardContent>
    </Card>
  );
}

export default function LiveMonitorPage({ title }) {
  const { restaurantId } = useOwnerAuth();
  const { data: stats, isLoading: statsLoading } = useLiveStats(restaurantId);
  const { data: repeat = [], isLoading: repeatLoading } = useLiveRepeat(restaurantId);
  const [tab, setTab] = useState("customers");

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
        <h1 className="text-2xl font-bold">{title}</h1>
        <p className="text-sm text-muted-foreground">
          Customers browsing your menu right now — first names only.
        </p>
      </div>

      <div role="tablist" aria-label="Live Monitor" className="flex gap-2">
        {[
          ["customers", "Customers"],
          ["offers", "Offers"],
        ].map(([key, label]) => (
          <Button key={key} role="tab" aria-selected={tab === key} variant={tab === key ? "default" : "outline"} size="sm" onClick={() => setTab(key)}>
            {label}
          </Button>
        ))}
      </div>

      {tab === "customers" ? <LiveDashboard restaurantId={restaurantId} /> : <OffersTab restaurantId={restaurantId} />}

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3" aria-label="Restaurant today">
        <StatCard title="Open tables" value={statsLoading ? "…" : stats?.openSessions ?? 0} caption="Tables currently seated" />
        <StatCard title="Pending orders" value={statsLoading ? "…" : stats?.pendingOrders ?? 0} caption="Awaiting the kitchen" />
        <StatCard title="Today's GMV" value={statsLoading ? "…" : formatMoney(stats?.gmv)} caption="Gross merchandise value" />
      </section>

      <Card>
        <CardHeader className="pb-3">
          <h2 className="text-base font-bold">Repeat customers</h2>
          <p className="text-xs text-muted-foreground">Customers who have ordered here more than once.</p>
        </CardHeader>
        <CardContent>
          {repeatLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : repeat.length === 0 ? (
            <p className="text-sm text-muted-foreground">No repeat customers yet.</p>
          ) : (
            <ul className="divide-y divide-brand-cream/40">
              {repeat.map((v) => (
                <li key={v._id} className="flex items-center justify-between py-2.5">
                  <span className="truncate text-sm font-semibold">{v.name}</span>
                  <span className="shrink-0 text-sm font-bold text-brand-orange">{v.orderCount} orders</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </DashboardLayout>
  );
}
