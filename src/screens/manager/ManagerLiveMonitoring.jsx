// Manager · Live Monitoring (/manager/live) — GET /api/owner/:rId/live-monitor,
// /live-monitor/visitors and /live-monitor/repeat.
//
// Runs on the owner session: the backend has no manager role. See API-GAPS.md.

import DashboardLayout from "@/components/DashboardLayout";
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
  useLiveRepeat,
  useLiveStats,
  useLiveVisitors,
} from "@/hooks/owner/useLiveMonitor";

function formatPrice(value) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Number(value) || 0);
}

// `lastSeen` comes back as a unix timestamp in seconds.
function lastSeenLabel(seconds) {
  if (!seconds) return "—";
  const mins = Math.max(0, Math.round((Date.now() / 1000 - seconds) / 60));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  return `${Math.round(mins / 60)}h ago`;
}

function StatCard({ title, value, caption }) {
  return (
    <Card>
      <CardContent className="p-[18px]">
        <span className="text-[13px] text-muted-foreground">{title}</span>
        <strong className="mt-2.5 block text-[28px] font-bold leading-none">{value}</strong>
        {caption ? <div className="mt-1.5 text-xs text-muted-foreground">{caption}</div> : null}
      </CardContent>
    </Card>
  );
}

export default function ManagerLiveMonitoring() {
  const { restaurantId } = useOwnerAuth();

  const { data: stats, isLoading: statsLoading, isError, error } = useLiveStats(restaurantId);
  const { data: visitors = [], isLoading: visitorsLoading } = useLiveVisitors(restaurantId);
  const { data: repeat = [], isLoading: repeatLoading }     = useLiveRepeat(restaurantId);

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
        <h1 className="text-2xl font-bold">Live Monitoring</h1>
        <p className="text-sm text-muted-foreground">
          Real-time visitor and floor activity. Refreshes every 30 seconds.
        </p>
      </div>

      {isError ? (
        <p className="text-sm text-brand-maroon">Failed to load: {error.message}</p>
      ) : null}

      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          title="Active Visitors"
          value={statsLoading ? "…" : stats?.activeVisitors ?? 0}
          caption="Seen in the last 5 min"
        />
        <StatCard
          title="Open Sessions"
          value={statsLoading ? "…" : stats?.openSessions ?? 0}
          caption="Tables currently seated"
        />
        <StatCard
          title="Pending Orders"
          value={statsLoading ? "…" : stats?.pendingOrders ?? 0}
          caption="Awaiting the kitchen"
        />
        <StatCard
          title="Today's GMV"
          value={statsLoading ? "…" : formatPrice(stats?.todayGMV)}
          caption="Gross merchandise value"
        />
      </section>

      <Card>
        <CardHeader className="pb-4">
          <h2 className="text-base font-bold">Active Visitors</h2>
          <p className="text-xs text-muted-foreground">
            Visitors drop off this list after 5 minutes of inactivity.
          </p>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-brand-cream/60">
                  <TableHead className="pl-6">Visitor</TableHead>
                  <TableHead>Table</TableHead>
                  <TableHead className="pr-6">Last seen</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visitors.map((v) => (
                  <TableRow key={v.userId}>
                    <TableCell className="pl-6 font-semibold">{v.name ?? "Guest"}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {v.tableId ? String(v.tableId).slice(-6).toUpperCase() : "—"}
                    </TableCell>
                    <TableCell className="pr-6 text-muted-foreground">
                      {lastSeenLabel(v.lastSeen)}
                    </TableCell>
                  </TableRow>
                ))}
                {visitors.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="py-8 text-center text-muted-foreground">
                      {visitorsLoading ? "Loading…" : "No active visitors right now."}
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-4">
          <h2 className="text-base font-bold">Repeat Customers</h2>
          <p className="text-xs text-muted-foreground">
            Guests who have ordered here more than once.
          </p>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-brand-cream/60">
                  <TableHead className="pl-6">Customer</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead className="pr-6 text-right">Orders</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {repeat.map((c) => (
                  <TableRow key={c._id}>
                    <TableCell className="pl-6 font-semibold">{c.name ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{c.email ?? "—"}</TableCell>
                    <TableCell className="pr-6 text-right font-bold">{c.orderCount}</TableCell>
                  </TableRow>
                ))}
                {repeat.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="py-8 text-center text-muted-foreground">
                      {repeatLoading ? "Loading…" : "No repeat customers yet."}
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </DashboardLayout>
  );
}
