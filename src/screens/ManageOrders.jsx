// Manage Orders (/orders).
//
// Two views over the same data, because the floor and the back office ask different
// questions of it:
//
//   By table  — GET /api/owner/:rId/orders/by-table. The table is the unit; under each
//               one sit that sitting's rounds in the order they were placed, each with
//               its time, quantity, the staff member who took it and its own status.
//               This is the view the floor actually works in, and the one that answers
//               "what is table 4 waiting on".
//   All orders — GET /api/owner/:rId/orders. The flat, paginated audit list, now carrying
//               the table and the staff member on every row.
//
// Status is read-only here by design: transitions belong to the chef KDS and to the
// waiter portal (which owns the "served" step). This screen reflects them — it does not
// drive them.

import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ChevronDown, ChevronUp, LayoutList, Receipt, Search, UtensilsCrossed, Users,
} from "lucide-react";

import { useOwnerAuth } from "@/context/OwnerAuthContext";
import { useOrdersByTable, useOwnerOrdersPage } from "@/hooks/owner/useOrders";
import DashboardLayout from "@/components/DashboardLayout";
import OrderDetailsDialog, {
  formatDateTime, formatPrice, formatTime, orderCode, placedByLabel,
  statusLabel, statusVariant,
} from "@/components/OrderDetailsDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell,
  TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

// The order lifecycle exactly as the API documents it, plus the waiter-owned 'served'.
const FILTERS = [
  { value: "",                 label: "All Orders" },
  { value: "placed",           label: "Placed" },
  { value: "confirmed",        label: "Confirmed" },
  { value: "preparing",        label: "Preparing" },
  { value: "ready",            label: "Ready" },
  { value: "served",           label: "Served" },
  { value: "out_for_delivery", label: "Out for delivery" },
  { value: "delivered",        label: "Delivered" },
  { value: "cancelled",        label: "Cancelled" },
];

const TYPES = [
  { value: "",         label: "All types" },
  { value: "dine_in",  label: "Dine-in" },
  { value: "delivery", label: "Delivery" },
];

const SCOPES = [
  { value: "active", label: "Active tables", hint: "Anything still being cooked, served or billed" },
  { value: "today",  label: "Today",         hint: "Every table that ordered since midnight" },
  { value: "all",    label: "All time",      hint: "The full dine-in history" },
];

function itemSummary(items = [], max = 3) {
  const shown = items.slice(0, max).map((i) => `${i.quantity}× ${i.name}`).join(", ");
  const extra = items.length - max;
  return extra > 0 ? `${shown} +${extra} more` : shown || "No items";
}

function itemCount(items = []) {
  return items.reduce((n, i) => n + (i.quantity ?? 0), 0);
}

// ── By-table view ────────────────────────────────────────────────────

function RoundRow({ order, onView }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-brand-cream/50 px-4 py-3 last:border-0 sm:flex-nowrap">
      <div className="flex w-[92px] shrink-0 flex-col">
        <span className="text-sm font-bold">Round {order.round ?? order.batchNumber ?? "—"}</span>
        <span className="text-xs text-muted-foreground">{formatTime(order.createdAt)}</span>
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm">{itemSummary(order.items)}</p>
        <p className="text-xs text-muted-foreground">
          {itemCount(order.items)} {itemCount(order.items) === 1 ? "item" : "items"} ·{" "}
          {orderCode(order)} · {placedByLabel(order)}
        </p>
      </div>

      <Badge variant={statusVariant(order.status)} className="shrink-0">
        {statusLabel(order.status)}
      </Badge>

      <span className="w-[76px] shrink-0 text-right text-sm font-semibold">
        {formatPrice(order.subtotal)}
      </span>

      <Button variant="outline" size="sm" className="shrink-0" onClick={() => onView(order)}>
        View details
      </Button>
    </div>
  );
}

function TableGroup({ group, expanded, onToggle, onView }) {
  const { summary, session } = group;
  const sittings = group.sittings ?? [];
  const staffNames = summary.staff.map((s) => s.name).filter(Boolean);

  return (
    <div className="overflow-hidden rounded-2xl border border-brand-cream/60 bg-white">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3.5 text-left hover:bg-brand-cream/20"
        aria-expanded={expanded}
      >
        <div className="flex min-w-[132px] items-center gap-3">
          <span className="grid h-11 min-w-[2.75rem] shrink-0 place-items-center rounded-xl bg-brand-cream/50 px-2 text-base font-bold text-[#5a403e]">
            {group.tableNumber}
          </span>
          <div>
            <p className="text-sm font-bold">Table {group.tableNumber}</p>
            <p className="text-xs text-muted-foreground">
              {session ? (session.status ?? "").replace(/_/g, " ") : "no open sitting"}
            </p>
          </div>
        </div>

        <Badge variant={statusVariant(summary.status)} className="shrink-0">
          {statusLabel(summary.status)}
        </Badge>

        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <UtensilsCrossed className="h-3.5 w-3.5" />
            {summary.orderCount} {summary.orderCount === 1 ? "round" : "rounds"} ·{" "}
            {summary.itemCount} items
            {sittings.length > 1 ? ` · ${sittings.length} sittings` : ""}
          </span>
          {session?.guestCount ? (
            <span className="inline-flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5" />
              {session.guestCount} {session.guestCount === 1 ? "guest" : "guests"}
            </span>
          ) : null}
          {staffNames.length > 0 ? (
            <span className="truncate">Served by {staffNames.join(", ")}</span>
          ) : (
            <span>No staff attributed</span>
          )}
          {summary.lastOrderAt ? (
            <span>Last order {formatTime(summary.lastOrderAt)}</span>
          ) : null}
        </div>

        <span className="ml-auto flex shrink-0 items-center gap-2">
          <span className="text-base font-bold">{formatPrice(summary.subtotal)}</span>
          {expanded ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </span>
      </button>

      {expanded ? (
        <div className="border-t border-brand-cream/60 bg-[#FCFAF7]">
          {sittings.length === 0 ? (
            <p className="px-4 py-5 text-sm text-muted-foreground">
              No orders on this table in this period.
            </p>
          ) : (
            sittings.map((sitting, i) => (
              <div key={String(sitting.sessionId ?? i)}>
                {/* A table is reused all evening and each party's rounds restart at 1, so
                    the sitting has to be named — otherwise "Round 1" appears twice under
                    one table and means two different things. */}
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-brand-cream/50 bg-brand-cream/25 px-4 py-2">
                  <span className="text-[11px] font-bold uppercase tracking-wide text-[#5a403e]">
                    {sitting.isOpen ? "Current sitting" : "Earlier sitting"}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    opened {formatDateTime(sitting.openedAt)}
                  </span>
                  {sitting.guestCount ? (
                    <span className="text-xs text-muted-foreground">
                      · {sitting.guestCount} {sitting.guestCount === 1 ? "guest" : "guests"}
                    </span>
                  ) : null}
                  {sitting.waiter?.name ? (
                    <span className="text-xs text-muted-foreground">
                      · waiter {sitting.waiter.name}
                    </span>
                  ) : null}
                  <span className="ml-auto text-xs font-semibold text-[#5a403e]">
                    {sitting.orders.length} {sitting.orders.length === 1 ? "round" : "rounds"} ·{" "}
                    {formatPrice(sitting.subtotal)}
                  </span>
                </div>
                {sitting.orders.length === 0 ? (
                  <p className="px-4 py-4 text-sm text-muted-foreground">
                    This table is occupied but hasn’t ordered yet.
                  </p>
                ) : (
                  sitting.orders.map((order) => (
                    <RoundRow key={order._id} order={order} onView={onView} />
                  ))
                )}
              </div>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}

// ── Flat view ────────────────────────────────────────────────────────

function OrderRow({ order, onView, onViewBill }) {
  return (
    <TableRow>
      <TableCell className="font-semibold">{orderCode(order)}</TableCell>
      <TableCell>
        {order.tableNumber ? (
          <span className="font-medium">Table {order.tableNumber}</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
        {order.round ?? order.batchNumber ? (
          <span className="block text-xs text-muted-foreground">
            Round {order.round ?? order.batchNumber}
          </span>
        ) : null}
      </TableCell>
      <TableCell className="capitalize text-muted-foreground">
        {(order.type ?? "").replace("_", " ") || "—"}
      </TableCell>
      <TableCell className="max-w-[220px] truncate">{itemSummary(order.items)}</TableCell>
      <TableCell className="text-muted-foreground">{placedByLabel(order)}</TableCell>
      <TableCell className="text-muted-foreground">{formatDateTime(order.createdAt)}</TableCell>
      <TableCell>
        <Badge variant={statusVariant(order.status)}>{statusLabel(order.status)}</Badge>
      </TableCell>
      <TableCell className="text-right font-semibold">{formatPrice(order.subtotal)}</TableCell>
      <TableCell className="text-right">
        <div className="flex justify-end gap-1">
          <Button variant="outline" size="sm" onClick={() => onView(order)}>
            Details
          </Button>
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
  );
}

// ── Screen ───────────────────────────────────────────────────────────

export default function ManageOrders() {
  const navigate = useNavigate();
  const { restaurantId } = useOwnerAuth();

  const [view, setView]     = useState("tables"); // "tables" | "list"
  const [scope, setScope]   = useState("active");
  const [status, setStatus] = useState("");
  const [type, setType]     = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage]     = useState(1);
  const [expanded, setExpanded]   = useState({});
  const [detailOrder, setDetail]  = useState(null);

  // The by-table view searches server-side, so the raw box can't drive the query key —
  // every keystroke would be its own request. The flat view filters locally and is
  // unaffected, hence one debounced value alongside the live one.
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const listParams = {
    page,
    limit: 20,
    ...(status ? { status } : {}),
    ...(type ? { type } : {}),
  };

  const byTable = useOrdersByTable(restaurantId, {
    scope,
    ...(debouncedSearch.trim() ? { search: debouncedSearch } : {}),
  });
  const flat = useOwnerOrdersPage(restaurantId, listParams);

  const groups = byTable.data ?? [];
  const orders = flat.data?.orders ?? [];

  // The flat endpoint has no search param — filter the loaded page locally, now including
  // the table number and the staff member so the search box means the same thing in both
  // views.
  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return orders;
    return orders.filter(
      (o) =>
        String(o._id).toLowerCase().includes(term) ||
        String(o.tableNumber ?? "").toLowerCase().includes(term) ||
        (o.staff?.name ?? "").toLowerCase().includes(term) ||
        (o.items ?? []).some((i) => (i.name ?? "").toLowerCase().includes(term)),
    );
  }, [orders, search]);

  const activeScope = SCOPES.find((s) => s.value === scope);

  if (!restaurantId) {
    return (
      <DashboardLayout>
        <p className="text-muted-foreground">No restaurant is linked to this account yet.</p>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Manage Orders</h1>
          <p className="text-sm text-muted-foreground">
            {view === "tables"
              ? "Each table with its rounds — who took them, when, and where they are now."
              : "Every order across dine-in and delivery."}
          </p>
        </div>
        <div className="flex rounded-xl border border-brand-cream bg-white p-1">
          {[
            { value: "tables", label: "By table", icon: UtensilsCrossed },
            { value: "list",   label: "All orders", icon: LayoutList },
          ].map((v) => {
            const Icon = v.icon;
            return (
              <button
                key={v.value}
                type="button"
                onClick={() => setView(v.value)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-sm font-medium transition",
                  view === v.value
                    ? "bg-brand-gradient text-white"
                    : "text-[#5a403e] hover:bg-brand-cream/30",
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {v.label}
              </button>
            );
          })}
        </div>
      </div>

      {view === "tables" ? (
        <>
          <div className="flex flex-wrap items-center gap-1.5">
            {SCOPES.map((s) => (
              <button
                key={s.value}
                type="button"
                onClick={() => setScope(s.value)}
                className={cn(
                  "rounded-full px-3.5 py-1.5 text-sm font-medium transition",
                  scope === s.value
                    ? "bg-brand-gradient text-white"
                    : "border border-brand-cream bg-white text-[#5a403e] hover:bg-brand-cream/30",
                )}
              >
                {s.label}
              </button>
            ))}
            <div className="relative ml-auto">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Table, item, staff or order id…"
                className="w-64 pl-9"
              />
            </div>
          </div>

          {byTable.isError ? (
            <p className="text-sm text-brand-maroon">
              Failed to load tables: {byTable.error.message}
            </p>
          ) : null}

          <p className="text-xs text-muted-foreground">{activeScope?.hint}</p>

          <div className="space-y-3">
            {byTable.isLoading ? (
              <div className="h-20 animate-pulse rounded-2xl bg-brand-cream/40" />
            ) : groups.length === 0 ? (
              <div className="rounded-2xl border border-brand-cream/60 bg-white py-14 text-center text-sm text-muted-foreground">
                {scope === "active"
                  ? "No tables are active right now."
                  : "No dine-in orders match this filter."}
              </div>
            ) : (
              groups.map((group) => {
                const key = String(group.tableId ?? group.tableNumber);
                return (
                  <TableGroup
                    key={key}
                    group={group}
                    expanded={Boolean(expanded[key])}
                    onToggle={() => setExpanded((e) => ({ ...e, [key]: !e[key] }))}
                    onView={setDetail}
                  />
                );
              })
            )}
          </div>
        </>
      ) : (
        <>
          {flat.isError ? (
            <p className="text-sm text-brand-maroon">Failed to load: {flat.error.message}</p>
          ) : null}

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
              <h2 className="text-base font-bold">
                {flat.data ? `${flat.data.total} orders` : "Orders"}
              </h2>
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
                      <TableHead>Table</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Items</TableHead>
                      <TableHead>Taken by</TableHead>
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
                        onView={setDetail}
                        onViewBill={() => navigate("/bill")}
                      />
                    ))}
                    {visible.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={9} className="py-10 text-center text-muted-foreground">
                          {flat.isLoading ? "Loading orders…" : "No orders match these filters."}
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {flat.data && flat.data.pages > 1 ? (
            <div className="flex items-center justify-center gap-3">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                Previous
              </Button>
              <span className="text-sm text-muted-foreground">
                Page {flat.data.page} of {flat.data.pages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= flat.data.pages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          ) : null}
        </>
      )}

      <OrderDetailsDialog order={detailOrder} onClose={() => setDetail(null)} />
    </DashboardLayout>
  );
}
