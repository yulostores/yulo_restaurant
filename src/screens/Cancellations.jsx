// Cancellations (/cancellations) — GET /api/owner/:rId/orders?status=cancelled.
//
// The API exposes no cancellation-reason, refund or approval resource, so this
// screen reports the cancelled orders it can see. See API-GAPS.md.

import { useMemo, useState } from "react";
import { Search, XCircle } from "lucide-react";

import { useOwnerAuth } from "@/context/OwnerAuthContext";
import { useOwnerOrdersPage } from "@/hooks/owner/useOrders";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell,
  TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

const TYPES = [
  { value: "",         label: "All types" },
  { value: "dine_in",  label: "Dine-in" },
  { value: "delivery", label: "Delivery" },
];

function formatPrice(value) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency", currency: "INR", maximumFractionDigits: 0,
  }).format(Number(value) || 0);
}

function formatDateTime(value) {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-IN", {
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
  });
}

function StatCard({ label, value }) {
  return (
    <Card>
      <CardContent className="p-4">
        <span className="text-[13px] text-muted-foreground">{label}</span>
        <strong className="mt-2 block text-2xl font-bold leading-none">{value}</strong>
      </CardContent>
    </Card>
  );
}

export default function Cancellations() {
  const { restaurantId } = useOwnerAuth();

  const [type, setType]     = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage]     = useState(1);

  const params = {
    status: "cancelled",
    page,
    limit: 20,
    ...(type ? { type } : {}),
  };

  const { data, isLoading, isError, error } = useOwnerOrdersPage(restaurantId, params);
  const orders = data?.orders ?? [];

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return orders;
    return orders.filter((o) =>
      String(o._id).toLowerCase().includes(term) ||
      (o.items ?? []).some((i) => (i.name ?? "").toLowerCase().includes(term)),
    );
  }, [orders, search]);

  const lostValue = useMemo(
    () => orders.reduce((sum, o) => sum + (Number(o.subtotal) || 0), 0),
    [orders],
  );

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
        <h1 className="text-2xl font-bold">Cancellations</h1>
        <p className="text-sm text-muted-foreground">
          Orders that were cancelled before they could be fulfilled.
        </p>
      </div>

      {isError ? <p className="text-sm text-brand-maroon">Failed to load: {error.message}</p> : null}

      <section className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <StatCard label="Cancelled orders" value={data?.total ?? "—"} />
        <StatCard label="Value on this page" value={formatPrice(lostValue)} />
        <StatCard label="On this page" value={orders.length} />
      </section>

      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-3 space-y-0 pb-4">
          <h2 className="text-base font-bold">Cancelled orders</h2>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={type}
              onChange={(e) => { setType(e.target.value); setPage(1); }}
              className="h-10 rounded-lg border border-input bg-white px-3 text-sm"
            >
              {TYPES.map((t) => (
                <option key={t.value || "all"} value={t.value}>{t.label}</option>
              ))}
            </select>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filter this page…"
                className="w-56 pl-9"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-brand-cream/60">
                  <TableHead className="pl-6">Order</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Items</TableHead>
                  <TableHead>Placed</TableHead>
                  <TableHead className="pr-6 text-right">Value</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((o) => (
                  <TableRow key={o._id}>
                    <TableCell className="pl-6">
                      <span className="flex items-center gap-2 font-semibold">
                        <XCircle className={cn("h-4 w-4 shrink-0 text-brand-maroon")} />
                        #{String(o._id).slice(-6).toUpperCase()}
                      </span>
                    </TableCell>
                    <TableCell className="capitalize text-muted-foreground">
                      {(o.type ?? "").replace("_", " ") || "—"}
                    </TableCell>
                    <TableCell className="max-w-[280px] truncate">
                      {(o.items ?? []).map((i) => `${i.quantity}× ${i.name}`).join(", ") || "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDateTime(o.createdAt)}
                    </TableCell>
                    <TableCell className="pr-6 text-right font-semibold">
                      {formatPrice(o.subtotal)}
                    </TableCell>
                  </TableRow>
                ))}
                {visible.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                      {isLoading ? "Loading…" : "No cancelled orders. Nice."}
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {data && data.pages > 1 ? (
        <div className="flex items-center justify-center gap-3">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">Page {data.page} of {data.pages}</span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= data.pages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      ) : null}
    </DashboardLayout>
  );
}
