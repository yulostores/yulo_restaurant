// Reports (/admin/reports) — GET /api/admin/reports/top-stores and
// /top-delivery-partners, plus the revenue overview series.

import { useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import {
  useRevenueOverview,
  useTopDeliveryPartners,
  useTopStores,
} from "@/hooks/admin/useAdmin";
import AdminLayout, { formatNumber, formatPrice } from "./AdminLayout";

const RANGES = ["day", "week", "month", "year"];
const LIMITS = [5, 10, 25];

export default function AdminReports() {
  const [range, setRange] = useState("month");
  const [limit, setLimit] = useState(10);

  const { data: revenue, isLoading: revenueLoading } = useRevenueOverview(range);
  const { data: stores = [], isLoading: storesLoading } = useTopStores(limit);
  const { data: partners = [], isLoading: partnersLoading } = useTopDeliveryPartners(limit);

  const points = (revenue?.points ?? []).map((p) => ({
    ...p,
    label: new Date(p.date).toLocaleDateString("en-IN",
      range === "day"  ? { hour: "2-digit" }
      : range === "year" ? { month: "short" }
      : { day: "numeric", month: "short" }),
  }));

  return (
    <AdminLayout title="Reports" subtitle="Revenue trends and platform leaderboards.">
      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 space-y-0 pb-3">
          <h2 className="text-base font-bold">Revenue &amp; Orders</h2>
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
            <p className="py-10 text-center text-sm text-muted-foreground">Loading…</p>
          ) : points.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              No revenue recorded in this window.
            </p>
          ) : (
            <div className="h-[280px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={points} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
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
                    cursor={{ fill: "rgba(217,72,15,0.06)" }}
                  />
                  <Bar dataKey="revenue" fill="#D9480F" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Leaderboard size
        </span>
        {LIMITS.map((l) => (
          <button
            key={l}
            type="button"
            onClick={() => setLimit(l)}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-semibold transition",
              limit === l
                ? "bg-brand-gradient text-white"
                : "border border-brand-cream bg-white text-[#5a403e] hover:bg-brand-cream/30",
            )}
          >
            Top {l}
          </button>
        ))}
      </div>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <h2 className="text-base font-bold">Top Stores by Revenue</h2>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="border-brand-cream/60">
                  <TableHead className="pl-6">Store</TableHead>
                  <TableHead>Orders</TableHead>
                  <TableHead>Rating</TableHead>
                  <TableHead className="pr-6 text-right">Revenue</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stores.map((s) => (
                  <TableRow key={s.restaurantId}>
                    <TableCell className="pl-6 font-semibold">{s.name ?? "—"}</TableCell>
                    <TableCell>{formatNumber(s.orders)}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {s.avgRating ? `★ ${s.avgRating}` : "—"}
                    </TableCell>
                    <TableCell className="pr-6 text-right font-bold">
                      {formatPrice(s.revenue)}
                    </TableCell>
                  </TableRow>
                ))}
                {stores.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="py-10 text-center text-muted-foreground">
                      {storesLoading ? "Loading…" : "No paid orders yet."}
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <h2 className="text-base font-bold">Top Delivery Partners</h2>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="border-brand-cream/60">
                  <TableHead className="pl-6">Partner</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="pr-6 text-right">Deliveries</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {partners.map((p) => (
                  <TableRow key={p._id}>
                    <TableCell className="pl-6 font-semibold">{p.fullName ?? "—"}</TableCell>
                    <TableCell className="capitalize text-muted-foreground">
                      {p.status ?? "—"}
                    </TableCell>
                    <TableCell className="pr-6 text-right font-bold">
                      {formatNumber(p.totalDeliveries)}
                    </TableCell>
                  </TableRow>
                ))}
                {partners.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="py-10 text-center text-muted-foreground">
                      {partnersLoading ? "Loading…" : "No delivery partners yet."}
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </section>
    </AdminLayout>
  );
}
