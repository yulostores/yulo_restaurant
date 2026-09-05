// Manager's Dashboard (/manager). The manager view mirrors the owner dashboard
// but drops revenue figures (managers don't see takings).
//
// The backend has no `manager` role or /manager/* endpoints, so this runs on the
// owner session and reads the owner-scoped dashboard + orders endpoints.
// See API-GAPS.md.

import { useMemo, useState } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { Flame, Star } from "lucide-react";

import DashboardLayout from "@/components/DashboardLayout";
import OrderDetailsDialog, {
  orderCode, placedByLabel, statusLabel, statusVariant,
} from "@/components/OrderDetailsDialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useOwnerAuth } from "@/context/OwnerAuthContext";
import {
  useDashboardKPIs,
  useRecentOrders,
  useTopItems,
} from "@/hooks/owner/useDashboard";
import { useOwnerOrders } from "@/hooks/owner/useOrders";
import { useSettings } from "@/hooks/owner/useSettings";

const BREAKDOWN_COLORS = {
  "Dine-in":   "#D9480F",
  Delivery:    "#F0A202",
  Cancelled:   "#B3261E",
};

// Kitchen pipeline buckets — the statuses that still need someone to act. This is also
// what defines the queue table below, which is why 'served' isn't in it.
const KITCHEN_BUCKETS = [
  { key: "placed",    label: "New",       tag: "QUEUED" },
  { key: "confirmed", label: "Confirmed", tag: "ACCEPTED" },
  { key: "preparing", label: "Preparing", tag: "IN KITCHEN" },
  { key: "ready",     label: "Ready",     tag: "TO SERVE" },
];

// Counted alongside them but deliberately outside the queue: a served round has reached
// the table and needs nothing further, so it belongs in the tally, not the work list.
const SERVED_BUCKET = { key: "served", label: "Served", tag: "AT TABLE" };

function formatTime(value) {
  if (!value) return "—";
  return new Date(value).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}

function itemSummary(order) {
  const items = order.items ?? [];
  if (items.length === 0) return "—";
  return items.map((i) => `${i.quantity}× ${i.name}`).join(", ");
}

function StatCard({ title, value, caption, stars }) {
  return (
    <Card>
      <CardContent className="p-[18px]">
        <div className="flex items-center justify-between">
          <span className="text-[13px] text-muted-foreground">{title}</span>
          <span className="h-[22px] w-[22px] rounded-full bg-brand-orange/10" />
        </div>
        <strong className="mt-2.5 block text-[28px] font-bold leading-none">{value}</strong>
        {stars != null ? (
          <div className="mt-2 flex gap-0.5 text-brand-saffron">
            {Array.from({ length: 5 }).map((_, i) => (
              <Star
                key={i}
                className={`h-3.5 w-3.5 ${i < Math.round(stars) ? "fill-current" : "opacity-30"}`}
              />
            ))}
          </div>
        ) : null}
        <div className="mt-1.5 text-xs text-muted-foreground">{caption}</div>
      </CardContent>
    </Card>
  );
}

export default function ManagerDashboard() {
  const { restaurantId } = useOwnerAuth();

  const { data: kpis, isLoading: kpisLoading, isError, error } = useDashboardKPIs(restaurantId, "today");
  const { data: restaurant }   = useSettings(restaurantId);
  const { data: topItems = [] } = useTopItems(restaurantId, "month");
  const { data: recentOrders = [] } = useRecentOrders(restaurantId);
  // Live kitchen view: the owner token can't call the chef KDS endpoints, so the
  // queue is derived from the owner's own order list.
  const { data: liveOrders = [] } = useOwnerOrders(restaurantId, { limit: 50 });
  const [detailOrder, setDetail] = useState(null);

  const breakdown = useMemo(() => {
    if (!kpis) return { total: 0, segments: [] };
    const raw = [
      { label: "Dine-in",   value: Number(kpis.dineIn) || 0 },
      { label: "Delivery",  value: Number(kpis.delivery) || 0 },
      { label: "Cancelled", value: Number(kpis.cancelledOrders) || 0 },
    ].filter((s) => s.value > 0);
    const total = raw.reduce((sum, s) => sum + s.value, 0);
    return {
      total,
      segments: raw.map((s) => ({
        ...s,
        color: BREAKDOWN_COLORS[s.label],
        percent: total ? Math.round((s.value / total) * 100) : 0,
      })),
    };
  }, [kpis]);

  const buckets = useMemo(() => {
    const counts = Object.fromEntries(
      [...KITCHEN_BUCKETS, SERVED_BUCKET].map((b) => [b.key, 0]),
    );
    for (const o of liveOrders) {
      if (counts[o.status] !== undefined) counts[o.status] += 1;
    }
    return counts;
  }, [liveOrders]);

  const queue = useMemo(
    () => liveOrders.filter((o) => KITCHEN_BUCKETS.some((b) => b.key === o.status)),
    [liveOrders],
  );

  if (!restaurantId) {
    return (
      <DashboardLayout>
        <p className="text-muted-foreground">
          No restaurant is linked to this account yet.
        </p>
      </DashboardLayout>
    );
  }

  if (isError) {
    return (
      <DashboardLayout>
        <p className="text-brand-maroon">Failed to load: {error.message}</p>
      </DashboardLayout>
    );
  }

  if (kpisLoading || !kpis) {
    return (
      <DashboardLayout>
        <p className="text-muted-foreground">Loading dashboard…</p>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      {/* Stat cards — manager view omits revenue. */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard title="Total Orders" value={kpis.orders ?? 0} caption="Orders today" />
        <StatCard
          title="Cancelled"
          value={kpis.cancelledOrders ?? 0}
          caption="Cancelled today"
        />
        <StatCard
          title="Average Rating"
          value={restaurant?.avgRating ?? "—"}
          caption={`${restaurant?.totalRatings ?? 0} ratings`}
          stars={restaurant?.avgRating ?? 0}
        />
      </section>

      {/* Order breakdown */}
      <Card>
        <CardHeader className="pb-4">
          <h2 className="text-base font-bold">Order Breakdown — Today</h2>
        </CardHeader>
        <CardContent>
          {breakdown.total === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              No orders recorded today yet.
            </p>
          ) : (
            <>
              <div className="relative mx-auto h-[200px] w-[200px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={breakdown.segments}
                      dataKey="value"
                      nameKey="label"
                      innerRadius={64}
                      outerRadius={96}
                      paddingAngle={2}
                      startAngle={90}
                      endAngle={-270}
                      stroke="none"
                    >
                      {breakdown.segments.map((s) => (
                        <Cell key={s.label} fill={s.color} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v, n) => [`${v}`, n]} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                  <strong className="text-3xl font-bold">{breakdown.total}</strong>
                  <span className="text-[11px] text-muted-foreground">Total Orders</span>
                </div>
              </div>

              <p className="mb-3 mt-2 text-[13px] font-semibold">Order Status Breakdown</p>
              <div className="grid grid-cols-1 gap-x-8 gap-y-2.5 sm:grid-cols-2">
                {breakdown.segments.map((s) => (
                  <div key={s.label} className="flex items-center gap-2 text-xs">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: s.color }} />
                    <span className="text-muted-foreground">{s.label}</span>
                    <span className="ml-auto font-semibold">{s.value} ({s.percent}%)</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Live kitchen activity */}
      <Card>
        <CardHeader className="pb-4">
          <h2 className="flex items-center gap-2 text-base font-bold">
            <Flame className="h-4 w-4 text-brand-orange" /> Live Kitchen Activity
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Active orders and preparation queue
          </p>
        </CardHeader>
        <CardContent>
          <div className="mb-5 grid grid-cols-2 gap-3.5 sm:grid-cols-3 lg:grid-cols-5">
            {[...KITCHEN_BUCKETS, SERVED_BUCKET].map((bucket) => (
              <div
                key={bucket.key}
                className="rounded-xl border border-brand-cream/60 bg-[#fffaf7] p-3.5"
              >
                <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
                  <span>{bucket.label}</span>
                  <span className="rounded-md bg-brand-orange/10 px-1.5 py-0.5 text-[9px] font-bold tracking-wide text-brand-orange">
                    {bucket.tag}
                  </span>
                </div>
                <strong className="text-2xl font-bold">{buckets[bucket.key]}</strong>
              </div>
            ))}
          </div>

          <h3 className="mb-1 text-sm font-bold">Current Kitchen Queue</h3>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-brand-cream/60">
                  <TableHead>Order</TableHead>
                  <TableHead>Table</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Items</TableHead>
                  <TableHead>Taken by</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Placed</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {queue.map((o) => (
                  <TableRow key={o._id} onClick={() => setDetail(o)} className="cursor-pointer">
                    <TableCell className="font-semibold">{orderCode(o)}</TableCell>
                    <TableCell>
                      {o.tableNumber ? (
                        <span className="font-medium">Table {o.tableNumber}</span>
                      ) : (
                        <span className="text-muted-foreground">&mdash;</span>
                      )}
                      {o.batchNumber > 1 ? (
                        <span className="block text-xs text-muted-foreground">
                          Round {o.batchNumber}
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell className="capitalize text-muted-foreground">
                      {(o.type ?? "").replace("_", " ") || "—"}
                    </TableCell>
                    <TableCell className="max-w-[220px] truncate">{itemSummary(o)}</TableCell>
                    <TableCell className="max-w-[150px] truncate text-muted-foreground">
                      {placedByLabel(o)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(o.status)}>{statusLabel(o.status)}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatTime(o.createdAt)}
                    </TableCell>
                  </TableRow>
                ))}
                {queue.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                      Kitchen queue is clear.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Top selling + recent orders */}
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-4">
            <h2 className="text-base font-bold">Top Selling Items</h2>
          </CardHeader>
          <CardContent>
            {topItems.map((item) => (
              <div
                key={item.menuItemId}
                className="flex items-center gap-3 border-b border-[#F6EFE9] py-3 last:border-0"
              >
                <span className="h-11 w-11 shrink-0 rounded-[10px] bg-gradient-to-br from-brand-saffron to-brand-red" />
                <div className="flex min-w-0 flex-col">
                  <span className="truncate font-semibold">{item.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {item.totalQuantity} sold
                  </span>
                </div>
                <span className="ml-auto shrink-0 font-bold text-brand-red">
                  ₹{Number(item.totalRevenue ?? 0).toLocaleString("en-IN")}
                </span>
              </div>
            ))}
            {topItems.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">No sales data yet.</p>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-4">
            <h2 className="text-base font-bold">Recent Orders</h2>
          </CardHeader>
          <CardContent>
            {recentOrders.map((order) => (
              <button
                type="button"
                key={order._id}
                onClick={() => setDetail(order)}
                className="flex w-full items-center justify-between gap-3 border-b border-[#F6EFE9] py-3.5 text-left last:border-0 hover:bg-brand-cream/20"
              >
                <div className="flex min-w-0 flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <span className="font-semibold">{orderCode(order)}</span>
                    {order.tableNumber ? (
                      <span className="rounded-full bg-brand-cream/50 px-2 py-0.5 text-[11px] font-bold text-[#5a403e]">
                        Table {order.tableNumber}
                        {order.batchNumber > 1 ? " \u00b7 R" + order.batchNumber : ""}
                      </span>
                    ) : null}
                    <span className="text-xs text-muted-foreground">
                      {formatTime(order.createdAt)}
                    </span>
                  </div>
                  <span className="truncate text-xs text-muted-foreground">
                    {itemSummary(order)}
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                    {placedByLabel(order)}
                  </span>
                </div>
                <Badge variant={statusVariant(order.status)} className="shrink-0">
                  {statusLabel(order.status)}
                </Badge>
              </button>
            ))}
            {recentOrders.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">No orders yet.</p>
            ) : null}
          </CardContent>
        </Card>
      </section>

      <OrderDetailsDialog order={detailOrder} onClose={() => setDetail(null)} />
    </DashboardLayout>
  );
}
