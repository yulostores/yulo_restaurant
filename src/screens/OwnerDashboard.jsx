// Owner dashboard — GET /api/owner/:rId/dashboard (+ /sales, /top-items,
// /recent-orders) and the live-monitor + restaurant records for the two stats
// the KPI endpoint doesn't carry.

import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Bar, BarChart, Cell, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { ChevronDown, Flame, Star } from "lucide-react";

import { useOwnerAuth } from "@/context/OwnerAuthContext";
import {
  useDashboardKPIs,
  useSalesChart,
  useTopItems,
  useRecentOrders,
} from "@/hooks/owner/useDashboard";
import { useLiveStats } from "@/hooks/owner/useLiveMonitor";
import { useSettings } from "@/hooks/owner/useSettings";
import DashboardLayout from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  DropdownMenu, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table, TableBody, TableCell,
  TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

// The API's period vocabulary, with the labels shown in the dropdown.
const PERIODS = [
  { label: "Today",      value: "today" },
  { label: "This Week",  value: "week" },
  { label: "This Month", value: "month" },
  { label: "This Year",  value: "year" },
];

const BREAKDOWN_COLORS = {
  "Dine-in":   "#D9480F",
  Delivery:    "#F2A65A",
  Cancelled:   "#B11226",
};

function statusVariant(status) {
  const key = (status ?? "").toLowerCase();
  if (key === "delivered") return "ok";
  if (key === "ready") return "info";
  if (key === "preparing" || key === "out_for_delivery") return "warn";
  if (key === "cancelled") return "danger";
  return "muted";
}

function formatPrice(value) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency", currency: "INR", maximumFractionDigits: 0,
  }).format(Number(value) || 0);
}

function PeriodDropdown({ value, onChange }) {
  const active = PERIODS.find((p) => p.value === value);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-1.5 rounded-lg border-brand-cream/70 text-[13px] font-normal text-[#5f5f5f] hover:bg-[#f5ede4] hover:text-[#24190f]"
        >
          {active?.label ?? "Period"}
          <ChevronDown className="h-3.5 w-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {PERIODS.map((p) => (
          <DropdownMenuItem key={p.value} onClick={() => onChange(p.value)}>
            {p.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function StatCard({ title, value, caption, rating }) {
  return (
    <Card>
      <CardContent className="p-[18px]">
        <span className="text-[13px] text-muted-foreground">{title}</span>
        <strong className="mt-2.5 block text-[28px] font-bold leading-none">{value ?? "—"}</strong>
        {rating != null ? (
          <div className="mt-2 flex gap-0.5 text-brand-saffron">
            {Array.from({ length: 5 }).map((_, i) => (
              <Star
                key={i}
                className={`h-3.5 w-3.5 ${i < Math.round(rating) ? "fill-current" : "opacity-30"}`}
              />
            ))}
          </div>
        ) : null}
        <div className="mt-1.5 text-xs text-muted-foreground">{caption}</div>
      </CardContent>
    </Card>
  );
}

function SkeletonCard() {
  return <div className="h-24 animate-pulse rounded-2xl bg-brand-cream/40" />;
}

export default function OwnerDashboard() {
  const navigate = useNavigate();
  const { restaurantId, approvalStatus } = useOwnerAuth();

  const [kpiPeriod, setKpiPeriod]     = useState("today");
  const [salesPeriod, setSalesPeriod] = useState("week");
  const [hovered, setHovered]         = useState(null);

  const { data: kpis,         isLoading: kpisLoading }   = useDashboardKPIs(restaurantId, kpiPeriod);
  const { data: salesChart,   isLoading: salesLoading }  = useSalesChart(restaurantId, salesPeriod);
  const { data: topItems = [], isLoading: topLoading }   = useTopItems(restaurantId, "month");
  const { data: recentOrders = [], isLoading: ordersLoading } = useRecentOrders(restaurantId);
  // The KPI payload carries no live-table count or rating — those come from the
  // live-monitor and restaurant records.
  const { data: liveStats }  = useLiveStats(restaurantId);
  const { data: restaurant } = useSettings(restaurantId);

  // The sales endpoint returns parallel arrays; recharts wants row objects.
  const salesRows = useMemo(() => {
    if (!salesChart?.labels) return [];
    return salesChart.labels.map((label, i) => ({
      label,
      revenue: salesChart.revenue?.[i] ?? 0,
      orders: salesChart.orders?.[i] ?? 0,
    }));
  }, [salesChart]);

  const breakdown = useMemo(() => {
    if (!kpis) return [];
    const raw = [
      { label: "Dine-in",   value: Number(kpis.dineIn) || 0 },
      { label: "Delivery",  value: Number(kpis.delivery) || 0 },
      { label: "Cancelled", value: Number(kpis.cancelledOrders) || 0 },
    ].filter((s) => s.value > 0);
    const total = raw.reduce((sum, s) => sum + s.value, 0);
    return raw.map((s) => ({
      ...s,
      color: BREAKDOWN_COLORS[s.label],
      percent: total ? Math.round((s.value / total) * 100) : 0,
    }));
  }, [kpis]);

  // ── No restaurant yet ─────────────────────────────────────────────
  if (!restaurantId && !kpisLoading) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <p className="mb-2 text-xl font-bold text-[#24190f]">No restaurant yet</p>
          <p className="mb-6 max-w-sm text-sm text-muted-foreground">
            Submit your restaurant for review to unlock the menu, staff and
            ordering tools.
          </p>
          <button
            type="button"
            onClick={() => navigate("/store-settings")}
            className="rounded-2xl bg-brand-gradient px-6 py-3 text-sm font-bold text-white hover:brightness-105"
          >
            Add your restaurant
          </button>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      {/* Approval banner — menu/staff routes stay locked until an admin approves. */}
      {approvalStatus && approvalStatus !== "active" ? (
        <div className="rounded-2xl border border-brand-cream bg-[#FFF3E0] px-4 py-3 text-sm text-[#8a4b16]">
          <strong className="capitalize">{approvalStatus}</strong> — menu, category and
          staff management unlock once a platform admin approves this restaurant.
        </div>
      ) : null}

      {/* Stat cards */}
      <div className="flex items-center justify-between">
        <h2 className="text-base font-bold">Overview</h2>
        <PeriodDropdown value={kpiPeriod} onChange={setKpiPeriod} />
      </div>
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpisLoading ? (
          Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)
        ) : (
          <>
            <StatCard
              title="Total Orders"
              value={kpis?.orders ?? 0}
              caption={`${kpis?.dineIn ?? 0} dine-in · ${kpis?.delivery ?? 0} delivery`}
            />
            <StatCard
              title="Revenue"
              value={formatPrice(kpis?.revenue)}
              caption={`Avg order ${formatPrice(kpis?.avgOrderValue)}`}
            />
            <StatCard
              title="Live Tables"
              value={liveStats?.openSessions ?? "—"}
              caption={`${liveStats?.activeVisitors ?? 0} active visitors`}
            />
            <StatCard
              title="Average Rating"
              value={restaurant?.avgRating ?? "—"}
              caption={`${restaurant?.totalRatings ?? 0} ratings`}
              rating={restaurant?.avgRating ?? 0}
            />
          </>
        )}
      </section>

      {/* Sales + Breakdown */}
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader className="flex-row items-start justify-between space-y-0 pb-4">
            <h2 className="text-base font-bold">Sales Overview</h2>
            <PeriodDropdown value={salesPeriod} onChange={setSalesPeriod} />
          </CardHeader>
          <CardContent>
            {salesLoading ? (
              <div className="flex h-[240px] animate-pulse items-center justify-center text-sm text-muted-foreground">
                Loading…
              </div>
            ) : salesRows.length === 0 ? (
              <div className="flex h-[240px] items-center justify-center text-sm text-muted-foreground">
                No sales in this period.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={salesRows} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                  <defs>
                    <linearGradient id="barFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#D9480F" />
                      <stop offset="100%" stopColor="#A4161A" />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#8a8a8a" }} />
                  <YAxis
                    tickLine={false} axisLine={false}
                    tick={{ fontSize: 11, fill: "#8a8a8a" }}
                    tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v)}
                  />
                  <Tooltip
                    cursor={{ fill: "rgba(217,72,15,0.06)" }}
                    formatter={(v, name) =>
                      name === "revenue" ? [formatPrice(v), "Sales"] : [v, "Orders"]
                    }
                    contentStyle={{ borderRadius: 12, border: "1px solid #EFE7DD", fontSize: 12 }}
                  />
                  <Bar dataKey="revenue" fill="url(#barFill)" radius={[6, 6, 0, 0]} maxBarSize={34} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-4">
            <h2 className="text-base font-bold">Order Breakdown</h2>
          </CardHeader>
          <CardContent>
            {breakdown.length > 0 ? (
              <>
                <div className="relative mx-auto h-[180px] w-[180px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={breakdown}
                        dataKey="value"
                        nameKey="label"
                        innerRadius={58} outerRadius={88}
                        paddingAngle={2} startAngle={90} endAngle={-270}
                        stroke="none"
                        onMouseEnter={(_, i) => setHovered(breakdown[i])}
                        onMouseLeave={() => setHovered(null)}
                      >
                        {breakdown.map((s) => <Cell key={s.label} fill={s.color} />)}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                    {hovered ? (
                      <>
                        <strong className="text-2xl font-bold" style={{ color: hovered.color }}>
                          {hovered.value}
                        </strong>
                        <span className="max-w-[80px] text-center text-[10px] leading-tight text-muted-foreground">
                          {hovered.label}
                        </span>
                      </>
                    ) : (
                      <>
                        <strong className="text-2xl font-bold">
                          {breakdown.reduce((s, i) => s + i.value, 0)}
                        </strong>
                        <span className="text-[11px] text-muted-foreground">Total Orders</span>
                      </>
                    )}
                  </div>
                </div>
                <p className="mb-3 mt-1 text-[13px] font-semibold">Order Status Breakdown</p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
                  {breakdown.map((s) => (
                    <div key={s.label} className="flex items-center gap-2 text-xs">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: s.color }} />
                      <span className="text-muted-foreground">{s.label}</span>
                      <span className="ml-auto font-semibold">{s.value} ({s.percent}%)</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="flex h-[220px] items-center justify-center text-sm text-muted-foreground">
                {kpisLoading ? "Loading…" : "No orders in this period."}
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      {/* Recent orders */}
      <Card>
        <CardHeader className="flex-row items-start justify-between space-y-0 pb-4">
          <div>
            <h2 className="flex items-center gap-2 text-base font-bold">
              <Flame className="h-4 w-4 text-brand-orange" /> Live Kitchen Activity
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">The 10 most recent orders</p>
          </div>
          <button
            type="button"
            onClick={() => navigate("/orders")}
            className="text-[13px] font-semibold text-brand-orange"
          >
            View All Orders →
          </button>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-brand-cream/60">
                  <TableHead>Order</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Items</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Time</TableHead>
                  <TableHead className="text-right">Subtotal</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ordersLoading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="animate-pulse py-8 text-center text-sm text-muted-foreground">
                      Loading orders…
                    </TableCell>
                  </TableRow>
                ) : recentOrders.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                      No recent orders.
                    </TableCell>
                  </TableRow>
                ) : (
                  recentOrders.map((o) => (
                    <TableRow key={o._id}>
                      <TableCell className="font-semibold">
                        #{String(o._id).slice(-6).toUpperCase()}
                      </TableCell>
                      <TableCell className="capitalize text-muted-foreground">
                        {(o.type ?? "").replace("_", " ") || "—"}
                      </TableCell>
                      <TableCell className="max-w-[260px] truncate">
                        {(o.items ?? []).map((i) => `${i.quantity}× ${i.name}`).join(", ") || "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant={statusVariant(o.status)} className="capitalize">
                          {(o.status ?? "").replace(/_/g, " ")}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {o.createdAt
                          ? new Date(o.createdAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })
                          : "—"}
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        {formatPrice(o.subtotal)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Top selling */}
      <Card>
        <CardHeader className="pb-4">
          <h2 className="text-base font-bold">Top Selling Items — This Month</h2>
        </CardHeader>
        <CardContent>
          {topLoading ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Loading…</p>
          ) : topItems.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No sales data yet.</p>
          ) : (
            topItems.map((item) => (
              <div
                key={item.menuItemId}
                className="flex items-center gap-3 border-b border-[#F6EFE9] py-3 last:border-0"
              >
                <span className="h-11 w-11 shrink-0 rounded-[10px] bg-gradient-to-br from-brand-saffron to-brand-red" />
                <div className="flex min-w-0 flex-col">
                  <span className="truncate font-semibold">{item.name}</span>
                  <span className="text-xs text-muted-foreground">{item.totalQuantity} sold</span>
                </div>
                <span className="ml-auto shrink-0 font-bold text-brand-red">
                  {formatPrice(item.totalRevenue)}
                </span>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </DashboardLayout>
  );
}
