// Manage Orders (/orders) — GET /api/owner/:rId/orders.
//
// Read-only by design: the API routes order status changes through the chef KDS
// (staff token) and payment closure through the waiter's mark-paid call, so an
// owner token cannot mutate an order. See API-GAPS.md.

import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronDown, ChevronUp, Receipt, Search } from "lucide-react";

import { useOwnerAuth } from "@/context/OwnerAuthContext";
import { useOwnerOrdersPage } from "@/hooks/owner/useOrders";
import DashboardLayout from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell,
  TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

// The order lifecycle exactly as the API documents it.
const FILTERS = [
  { value: "",                 label: "All Orders" },
  { value: "placed",           label: "Placed" },
  { value: "confirmed",        label: "Confirmed" },
  { value: "preparing",        label: "Preparing" },
  { value: "ready",            label: "Ready" },
  { value: "out_for_delivery", label: "Out for delivery" },
  { value: "delivered",        label: "Delivered" },
  { value: "cancelled",        label: "Cancelled" },
];

const TYPES = [
  { value: "",         label: "All types" },
  { value: "dine_in",  label: "Dine-in" },
  { value: "delivery", label: "Delivery" },
];

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

function formatDateTime(value) {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-IN", {
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
  });
}

function OrderRow({ order, expanded, onToggle, onViewBill }) {
  const shortId = `#${String(order._id).slice(-6).toUpperCase()}`;
  return (
    <>
      <TableRow>
        <TableCell className="font-semibold">{shortId}</TableCell>
        <TableCell className="capitalize text-muted-foreground">
          {(order.type ?? "").replace("_", " ") || "—"}
        </TableCell>
        <TableCell className="max-w-[240px] truncate">
          {(order.items ?? []).map((i) => `${i.quantity}× ${i.name}`).join(", ") || "—"}
        </TableCell>
        <TableCell className="text-muted-foreground">{formatDateTime(order.createdAt)}</TableCell>
        <TableCell>
          <Badge variant={statusVariant(order.status)} className="capitalize">
            {(order.status ?? "").replace(/_/g, " ")}
          </Badge>
        </TableCell>
        <TableCell className="text-right font-semibold">{formatPrice(order.subtotal)}</TableCell>
        <TableCell className="text-right">
          <div className="flex justify-end gap-1">
            <button
              type="button"
              onClick={onToggle}
              className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:bg-brand-cream/30"
              aria-label={expanded ? "Collapse" : "Expand"}
            >
              {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
            <button
              type="button"
              onClick={onViewBill}
              className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:bg-brand-cream/30"
              aria-label="View bill"
            >
              <Receipt className="h-4 w-4" />
            </button>
          </div>
        </TableCell>
      </TableRow>

      {expanded ? (
        <TableRow className="bg-[#FCFAF7]">
          <TableCell colSpan={7} className="py-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  Items
                </p>
                {(order.items ?? []).map((item, i) => (
                  <div
                    key={item.menuItemId ?? i}
                    className="flex justify-between border-b border-[#F1E7DC] py-1.5 text-sm last:border-0"
                  >
                    <span>{item.quantity} × {item.name}</span>
                    <span className="font-medium">
                      {formatPrice(item.subtotal ?? item.price * item.quantity)}
                    </span>
                  </div>
                ))}
              </div>
              <div className="space-y-2 text-sm">
                {order.specialInstructions ? (
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                      Instructions
                    </p>
                    <p className="text-muted-foreground">“{order.specialInstructions}”</p>
                  </div>
                ) : null}
                {order.deliveryAddress ? (
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                      Delivery address
                    </p>
                    <p className="text-muted-foreground">
                      {[
                        order.deliveryAddress.street,
                        order.deliveryAddress.city,
                        order.deliveryAddress.pincode,
                      ].filter(Boolean).join(", ")}
                    </p>
                  </div>
                ) : null}
                {order.batchNumber ? (
                  <p className="text-muted-foreground">Batch #{order.batchNumber}</p>
                ) : null}
              </div>
            </div>
          </TableCell>
        </TableRow>
      ) : null}
    </>
  );
}

export default function ManageOrders() {
  const navigate = useNavigate();
  const { restaurantId } = useOwnerAuth();

  const [status, setStatus] = useState("");
  const [type, setType]     = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage]     = useState(1);
  const [expandedId, setExpandedId] = useState(null);

  const params = {
    page,
    limit: 20,
    ...(status ? { status } : {}),
    ...(type ? { type } : {}),
  };

  const { data, isLoading, isError, error } = useOwnerOrdersPage(restaurantId, params);
  const orders = data?.orders ?? [];

  // The endpoint has no search param — filter the loaded page locally.
  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return orders;
    return orders.filter((o) =>
      String(o._id).toLowerCase().includes(term) ||
      (o.items ?? []).some((i) => (i.name ?? "").toLowerCase().includes(term)),
    );
  }, [orders, search]);

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
        <h1 className="text-2xl font-bold">Manage Orders</h1>
        <p className="text-sm text-muted-foreground">
          Every order across dine-in and delivery.
        </p>
      </div>

      {isError ? <p className="text-sm text-brand-maroon">Failed to load: {error.message}</p> : null}

      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f.value || "all"}
            type="button"
            onClick={() => { setStatus(f.value); setPage(1); }}
            className={cn(
              "rounded-full px-3.5 py-1.5 text-sm font-medium transition",
              status === f.value
                ? "bg-brand-gradient text-white"
                : "border border-brand-cream bg-white text-[#5a403e] hover:bg-brand-cream/30",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-3 space-y-0 pb-4">
          <h2 className="text-base font-bold">{data ? `${data.total} orders` : "Orders"}</h2>
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
                  <TableHead>Order</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Items</TableHead>
                  <TableHead>Placed</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Subtotal</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((order) => (
                  <OrderRow
                    key={order._id}
                    order={order}
                    expanded={expandedId === order._id}
                    onToggle={() =>
                      setExpandedId((id) => (id === order._id ? null : order._id))
                    }
                    onViewBill={() => navigate("/bill")}
                  />
                ))}
                {visible.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                      {isLoading ? "Loading orders…" : "No orders match these filters."}
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
