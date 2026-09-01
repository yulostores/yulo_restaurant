// Manager · Orders (/manager/orders) — GET /api/owner/:rId/orders.
//
// Read-only: the documented API exposes order status transitions only through
// the chef KDS endpoints (staff token, role `chef`) and payment closure only
// through the waiter's mark-paid call. An owner/manager token cannot drive
// either. See API-GAPS.md.

import { useState } from "react";
import { Search } from "lucide-react";

import DashboardLayout from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { useOwnerAuth } from "@/context/OwnerAuthContext";
import { useOwnerOrdersPage } from "@/hooks/owner/useOrders";

// Mirrors the order lifecycle the API documents.
const STATUS_TABS = [
  { value: "",                 label: "All" },
  { value: "placed",           label: "Placed" },
  { value: "confirmed",        label: "Confirmed" },
  { value: "preparing",        label: "Preparing" },
  { value: "ready",            label: "Ready" },
  { value: "out_for_delivery", label: "Out for delivery" },
  { value: "delivered",        label: "Delivered" },
  { value: "cancelled",        label: "Cancelled" },
];

const TYPE_TABS = [
  { value: "",         label: "All types" },
  { value: "dine_in",  label: "Dine-in" },
  { value: "delivery", label: "Delivery" },
];

function statusVariant(status = "") {
  const key = String(status).toLowerCase();
  if (key === "delivered") return "ok";
  if (key === "ready") return "info";
  if (key === "preparing" || key === "out_for_delivery") return "warn";
  if (key === "cancelled") return "danger";
  return "muted";
}

function formatPrice(value) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Number(value) || 0);
}

function formatDateTime(value) {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-IN", {
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
  });
}

export default function ManagerOrders() {
  const { restaurantId } = useOwnerAuth();

  const [status, setStatus] = useState("");
  const [type, setType]     = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage]     = useState(1);

  const params = {
    page,
    limit: 20,
    ...(status ? { status } : {}),
    ...(type ? { type } : {}),
  };

  const { data, isLoading, isError, error } = useOwnerOrdersPage(restaurantId, params);

  const orders = data?.orders ?? [];
  // The orders endpoint has no `search` param — filter the loaded page client-side.
  const visible = search
    ? orders.filter((o) =>
        String(o._id).toLowerCase().includes(search.toLowerCase()) ||
        (o.items ?? []).some((i) => (i.name ?? "").toLowerCase().includes(search.toLowerCase())),
      )
    : orders;

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
        <h1 className="text-2xl font-bold">Orders</h1>
        <p className="text-sm text-muted-foreground">
          Every order across the floor and delivery queue.
        </p>
      </div>

      {isError ? <p className="text-sm text-brand-maroon">Failed to load: {error.message}</p> : null}

      <div className="flex flex-wrap gap-1.5">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.value || "all"}
            type="button"
            onClick={() => { setStatus(tab.value); setPage(1); }}
            className={cn(
              "rounded-full px-3.5 py-1.5 text-sm font-medium transition",
              status === tab.value
                ? "bg-brand-gradient text-white"
                : "border border-brand-cream bg-white text-[#5a403e] hover:bg-brand-cream/30",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-3 space-y-0 pb-4">
          <h2 className="text-base font-bold">
            {data ? `${data.total} orders` : "Orders"}
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={type}
              onChange={(e) => { setType(e.target.value); setPage(1); }}
              className="h-10 rounded-lg border border-input bg-white px-3 text-sm"
            >
              {TYPE_TABS.map((t) => (
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
                  <TableHead>Status</TableHead>
                  <TableHead className="pr-6 text-right">Subtotal</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((o) => (
                  <TableRow key={o._id}>
                    <TableCell className="pl-6 font-semibold">
                      #{String(o._id).slice(-6).toUpperCase()}
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
                    <TableCell>
                      <Badge variant={statusVariant(o.status)} className="capitalize">
                        {(o.status ?? "").replace("_", " ")}
                      </Badge>
                    </TableCell>
                    <TableCell className="pr-6 text-right font-bold">
                      {formatPrice(o.subtotal)}
                    </TableCell>
                  </TableRow>
                ))}
                {visible.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                      {isLoading ? "Loading…" : "No orders match these filters."}
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
