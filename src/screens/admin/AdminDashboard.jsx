// Platform Dashboard (/admin) — GET /api/admin/dashboard, plus the revenue
// overview chart and the top-stores report.

import { useState } from "react";
import {
  CheckCircle2,
  CircleSlash,
  Clock,
  IndianRupee,
  LifeBuoy,
  PauseCircle,
  Store,
  Users,
  Utensils,
  XCircle,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  useAdminDashboard,
  useRevenueOverview,
  useTopStores,
} from "@/hooks/admin/useAdmin";
import AdminLayout, { formatNumber, formatPrice } from "./AdminLayout";

const STORE_STATES = [
  { key: "pending",   label: "Pending",   icon: Clock,        tone: "text-[#D9480F]" },
  { key: "active",    label: "Active",    icon: CheckCircle2, tone: "text-brand-green" },
  { key: "suspended", label: "Suspended", icon: PauseCircle,  tone: "text-[#1565C0]" },
  { key: "rejected",  label: "Rejected",  icon: XCircle,      tone: "text-brand-maroon" },
  { key: "expired",   label: "Expired",   icon: CircleSlash,  tone: "text-muted-foreground" },
];

const TICKET_STATES = [
  { key: "open",        label: "Open" },
  { key: "in_progress", label: "In progress" },
  { key: "resolved",    label: "Resolved" },
  { key: "closed",      label: "Closed" },
];

const RANGES = ["day", "week", "month", "year"];

function StatCard({ icon: Icon, label, value, tone }) {
  return (
    <Card>
      <CardContent className="p-4">
        <span className={cn("grid h-9 w-9 place-items-center rounded-full bg-brand-orange/10", tone ?? "text-brand-orange")}>
          <Icon className="h-[18px] w-[18px]" />
        </span>
        <strong className="mt-3 block text-2xl font-bold leading-none">{value}</strong>
        <span className="mt-1 block text-[11px] uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
      </CardContent>
    </Card>
  );
}

export default function AdminDashboard() {
  const [range, setRange] = useState("month");

  const { data, isLoading, isError, error } = useAdminDashboard();
  const { data: revenue, isLoading: revenueLoading } = useRevenueOverview(range);
  const { data: topStores = [], isLoading: topLoading } = useTopStores(5);

  if (isError) {
    return (
      <AdminLayout title="Platform Dashboard">
        <p className="text-sm text-brand-maroon">Failed to load: {error.message}</p>
      </AdminLayout>
    );
  }

  if (isLoading || !data) {
    return (
      <AdminLayout title="Platform Dashboard">
        <p className="text-sm text-muted-foreground">Loading dashboard…</p>
      </AdminLayout>
    );
  }

  const stores = data.stores ?? {};
  const tickets = data.tickets ?? {};
  const totalStores = Object.values(stores).reduce((a, b) => a + (Number(b) || 0), 0);
  const openTickets = (Number(tickets.open) || 0) + (Number(tickets.in_progress) || 0);

  const chartPoints = (revenue?.points ?? []).map((p) => ({
    ...p,
    label: new Date(p.date).toLocaleDateString("en-IN",
      range === "day"  ? { hour: "2-digit" }
      : range === "year" ? { month: "short" }
      : { day: "numeric", month: "short" }),
  }));

  return (
    <AdminLayout
      title="Platform Dashboard"
      subtitle="Stores, customers, revenue, and support load across the platform."
    >
      {/* Headline totals */}
      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard icon={Store} label="Total Stores" value={formatNumber(totalStores)} />
        <StatCard icon={Users} label="Customers" value={formatNumber(data.customers)} />
        <StatCard
          icon={IndianRupee}
          label="Revenue (all time)"
          value={formatPrice(data.revenue?.total)}
          tone="text-brand-green"
        />
        <StatCard icon={Utensils} label="Paid Orders" value={formatNumber(data.revenue?.orders)} />
      </section>

      {/* Store pipeline */}
      <Card>
        <CardHeader className="pb-3">
          <h2 className="text-base font-bold">Store Pipeline</h2>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          {STORE_STATES.map((s) => {
            const Icon = s.icon;
            return (
              <div
                key={s.key}
                className="flex items-center justify-between rounded-xl border border-brand-cream/70 px-4 py-3"
              >
                <span className="flex items-center gap-2 text-sm font-medium">
                  <Icon className={cn("h-4 w-4", s.tone)} />
                  {s.label}
                </span>
                <span className="text-lg font-bold">{formatNumber(stores[s.key])}</span>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Revenue chart */}
      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 space-y-0 pb-3">
          <h2 className="text-base font-bold">Revenue Overview</h2>
          <div className="flex gap-1.5">
            {RANGES.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRange(r)}
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-semibold capitalize transition",
                  range === r
                    ? "bg-brand-gradient text-white"
                    : "border border-brand-cream bg-white text-[#5a403e] hover:bg-brand-cream/30",
                )}
              >
                {r}
              </button>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          {revenueLoading ? (
            <p className="py-10 text-center text-sm text-muted-foreground">Loading chart…</p>
          ) : chartPoints.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              No revenue recorded in this window.
            </p>
          ) : (
            <div className="h-[260px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartPoints} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="adminRevenue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#D9480F" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#D9480F" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F0E6DC" vertical={false} />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    fontSize={12}
                    tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v)}
                  />
                  <Tooltip
                    formatter={(v, name) =>
                      name === "revenue" ? [formatPrice(v), "Revenue"] : [formatNumber(v), "Orders"]
                    }
                  />
                  <Area
                    type="monotone"
                    dataKey="revenue"
                    stroke="#D9480F"
                    strokeWidth={2}
                    fill="url(#adminRevenue)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Top stores */}
        <Card>
          <CardHeader className="pb-3">
            <h2 className="text-base font-bold">Top Stores by Revenue</h2>
          </CardHeader>
          <CardContent>
            {topLoading ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Loading…</p>
            ) : topStores.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">No paid orders yet.</p>
            ) : (
              topStores.map((s) => (
                <div
                  key={s.restaurantId}
                  className="flex items-center justify-between border-b border-[#F6EFE9] py-3 last:border-0"
                >
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{s.name ?? "Unnamed store"}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatNumber(s.orders)} orders
                      {s.avgRating ? ` · ★ ${s.avgRating}` : ""}
                    </p>
                  </div>
                  <span className="shrink-0 font-bold">{formatPrice(s.revenue)}</span>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Support load */}
        <Card>
          <CardHeader className="flex-row items-center gap-2 space-y-0 pb-3">
            <LifeBuoy className="h-4 w-4 text-brand-orange" />
            <h2 className="text-base font-bold">Support Tickets</h2>
          </CardHeader>
          <CardContent>
            <p className="mb-3 text-sm text-muted-foreground">
              <strong className="text-lg text-foreground">{formatNumber(openTickets)}</strong>{" "}
              needing attention
            </p>
            {TICKET_STATES.map((t) => (
              <div
                key={t.key}
                className="flex items-center justify-between border-b border-[#F6EFE9] py-2.5 last:border-0"
              >
                <span className="text-sm">{t.label}</span>
                <span className="font-semibold">{formatNumber(tickets[t.key])}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </section>
    </AdminLayout>
  );
}
