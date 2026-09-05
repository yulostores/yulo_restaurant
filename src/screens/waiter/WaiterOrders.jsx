// Waiter · Active Orders — GET /api/staff/:rId/waiter/sessions, grouped by table.
//
// The floor owns the last step of a ticket's life: the kitchen can say a dish is ready,
// but only the person who carried it knows it reached the table. That's the "Mark served"
// button here, which PATCHes /waiter/orders/:orderId/status and is reflected immediately
// in the owner portal's Manage Orders and dashboard feed.
//
// It is also the *only* step the floor takes: everything before it belongs to the
// kitchen, so the button sits disabled until the chef marks the round ready. See
// ./orderStatus.js.

import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Loader2 } from "lucide-react";

import { useStaffAuth } from "@/context/StaffAuthContext";
import { useUpdateOrderStatus, useWaiterSessions, useWaiterTables } from "@/hooks/staff/useWaiter";
import { cn } from "@/lib/utils";
import WaiterLayout, { WaiterPageHeader, formatPrice } from "./WaiterLayout";
import { SERVE_BLOCKED_HINT, floorStatus, floorStatusLabel, serveAction } from "./orderStatus";

// Keyed by the floor's reading of a ticket, not the kitchen's raw status.
const STATUS_TONE = {
  preparing:        "bg-[#FFF3E0] text-[#D9480F]",
  prepared:         "bg-[#E8F5EC] text-brand-green",
  served:           "bg-[#E8F5EC] text-[#2E7D32]",
  out_for_delivery: "bg-[#FFF3E0] text-[#D9480F]",
  delivered:        "bg-[#F3F4F6] text-[#5F5F5F]",
  cancelled:        "bg-[#FCE9E4] text-brand-maroon",
};

// The furthest-behind ticket sets the table's headline status.
const STATUS_RANK = ["placed", "confirmed", "preparing", "ready", "served", "delivered"];

function tableStatus(orders = []) {
  const live = orders.filter((o) => o.status !== "cancelled");
  if (live.length === 0) return "placed";
  return live.reduce((worst, o) => {
    const a = STATUS_RANK.indexOf(worst);
    const b = STATUS_RANK.indexOf(o.status);
    return b >= 0 && (a < 0 || b < a) ? o.status : worst;
  }, live[0].status);
}

function formatTime(value) {
  if (!value) return "—";
  return new Date(value).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}

function StatusPill({ status }) {
  return (
    <span
      className={cn(
        "shrink-0 rounded-full px-3 py-1 text-xs font-bold",
        STATUS_TONE[floorStatus(status)] ?? "bg-[#F3F4F6] text-[#5F5F5F]",
      )}
    >
      {floorStatusLabel(status)}
    </span>
  );
}

function RoundRow({ order, onAdvance, pending }) {
  const action = serveAction(order);
  const items = order.items ?? [];
  const qty = items.reduce((n, i) => n + (i.quantity ?? 0), 0);

  return (
    <div className="border-t border-brand-cream/60 px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-bold">
            Round {order.round ?? order.batchNumber ?? "—"}
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              {formatTime(order.createdAt)} · {qty} {qty === 1 ? "item" : "items"}
            </span>
          </p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {items.map((i) => `${i.quantity}× ${i.name}`).join(", ") || "No items"}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Taken by{" "}
            {order.staff?.name ??
              (order.placedBy === "guest" ? "the guest (table QR)" : "the customer app")}
          </p>
          {order.specialInstructions ? (
            <p className="mt-1 text-xs italic text-muted-foreground">
              “{order.specialInstructions}”
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <StatusPill status={order.status} />
          <span className="text-sm font-bold text-brand-red">{formatPrice(order.subtotal)}</span>
        </div>
      </div>

      {action ? (
        <button
          type="button"
          disabled={!action.enabled || pending}
          title={action.enabled ? undefined : SERVE_BLOCKED_HINT}
          onClick={() => onAdvance(order, action.newStatus)}
          className={cn(
            "mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition",
            !action.enabled
              ? "cursor-not-allowed bg-brand-cream/50 text-muted-foreground"
              : pending
                ? "bg-brand-orange/60 text-white"
                : "bg-brand-gradient text-white hover:opacity-90",
          )}
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {action.label}
        </button>
      ) : null}
    </div>
  );
}

export default function WaiterOrders() {
  const { staff } = useStaffAuth();
  const restaurantId = staff?.restaurantId;

  const { data: sessions = [], isLoading, isError, error } = useWaiterSessions(restaurantId);
  const { data: tables = [] } = useWaiterTables(restaurantId);
  const advance = useUpdateOrderStatus(restaurantId);

  const [openTables, setOpenTables] = useState({});
  const [pendingOrderId, setPendingOrderId] = useState(null);
  const [actionError, setActionError] = useState(null);

  // The sessions endpoint now returns `tableNumber` directly; the tables query is the
  // fallback for a server that hasn't been redeployed yet.
  const tableLabelById = useMemo(
    () => Object.fromEntries(tables.map((t) => [t._id, t.identifier])),
    [tables],
  );

  const rows = useMemo(
    () =>
      sessions.map((s) => {
        const orders = s.orders ?? [];
        return {
          id: s._id,
          label: s.tableNumber ?? tableLabelById[s.tableId] ?? "—",
          status: tableStatus(orders),
          orders,
          guestCount: s.guestCount,
          batches: s.batchCount ?? orders.length,
          total: s.runningTotal ?? 0,
        };
      }),
    [sessions, tableLabelById],
  );

  async function handleAdvance(order, newStatus) {
    setActionError(null);
    setPendingOrderId(order._id);
    try {
      await advance.mutateAsync({ orderId: order._id, newStatus });
    } catch (err) {
      setActionError(err?.message ?? "Could not update this order — please try again.");
    } finally {
      setPendingOrderId(null);
    }
  }

  return (
    <WaiterLayout>
      <WaiterPageHeader
        title="Active Orders"
        subtitle="Live tickets per table. Mark each round served once it reaches the table."
      />

      <div className="px-4 py-5 sm:px-5">
        {isError ? (
          <p className="mb-4 text-sm text-brand-maroon">Failed to load orders: {error.message}</p>
        ) : null}
        {actionError ? (
          <p className="mb-4 text-sm text-brand-maroon">{actionError}</p>
        ) : null}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {isLoading ? (
            <p className="col-span-2 text-sm text-muted-foreground">Loading orders…</p>
          ) : rows.length === 0 ? (
            <div className="col-span-2 rounded-2xl border border-brand-cream/60 bg-white py-14 text-center text-sm text-muted-foreground">
              No open tables right now.
            </div>
          ) : (
            rows.map((row) => {
              const open = Boolean(openTables[row.id]);
              return (
                <div
                  key={row.id}
                  className="overflow-hidden rounded-2xl border border-brand-cream/60 bg-white shadow-sm"
                >
                  <button
                    type="button"
                    onClick={() => setOpenTables((t) => ({ ...t, [row.id]: !t[row.id] }))}
                    className="w-full p-5 text-left"
                    aria-expanded={open}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-lg font-bold">Table {row.label}</span>
                      <div className="flex items-center gap-2">
                        <StatusPill status={row.status} />
                        {open ? (
                          <ChevronUp className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                    </div>

                    <p className="mt-2 text-sm text-muted-foreground">
                      {row.orders
                        .flatMap((o) => o.items ?? [])
                        .slice(0, 4)
                        .map((i) => `${i.quantity}× ${i.name}`)
                        .join(", ") || "No items yet"}
                    </p>

                    <div className="mt-4 flex items-center justify-between border-t border-brand-cream/60 pt-3">
                      <span className="text-xs text-muted-foreground">
                        {row.batches} {row.batches === 1 ? "round" : "rounds"}
                        {row.guestCount ? ` · ${row.guestCount} guests` : ""}
                      </span>
                      <span className="font-bold text-brand-red">{formatPrice(row.total)}</span>
                    </div>
                  </button>

                  {open
                    ? row.orders.map((order) => (
                        <RoundRow
                          key={order._id}
                          order={order}
                          onAdvance={handleAdvance}
                          pending={pendingOrderId === order._id}
                        />
                      ))
                    : null}
                </div>
              );
            })
          )}
        </div>
      </div>
    </WaiterLayout>
  );
}
