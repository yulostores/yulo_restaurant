// Everything known about a single order, in one panel.
//
// The list views deliberately show a summary line per order — a table with four rounds
// on it is unreadable if every line item is inlined. This is where the rest lives: which
// table and sitting the order belongs to, which round of that sitting it is, who rang it
// in, every line item with its quantity, price and note, and the full status timeline
// with the time and person behind each transition.
//
// The timeline comes from the server's Order.statusHistory. Orders placed before that
// field existed carry only their 'placed' entry (see the backfill script), so the panel
// degrades to showing the current status alone rather than pretending to a history it
// doesn't have.

import { X } from "lucide-react";

import { Badge } from "@/components/ui/badge";

const STATUS_LABEL = {
  placed: "Placed",
  confirmed: "Confirmed",
  preparing: "Preparing",
  ready: "Ready to serve",
  served: "Served",
  out_for_delivery: "Out for delivery",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

export function statusLabel(status) {
  return STATUS_LABEL[status] ?? String(status ?? "").replace(/_/g, " ") ?? "—";
}

export function statusVariant(status) {
  const key = String(status ?? "").toLowerCase();
  if (key === "served" || key === "delivered") return "ok";
  if (key === "ready") return "info";
  if (key === "preparing" || key === "out_for_delivery") return "warn";
  if (key === "cancelled") return "danger";
  return "muted";
}

export function formatPrice(value) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Number(value) || 0);
}

export function formatTime(value) {
  if (!value) return "—";
  return new Date(value).toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDateTime(value) {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// "Waiter Ravi", "Guest (QR)", "Customer app" — one line that answers "who put this in".
export function placedByLabel(order) {
  if (order?.staff?.name) {
    const role = order.staff.role ? order.staff.role[0].toUpperCase() + order.staff.role.slice(1) : "Staff";
    return `${role} · ${order.staff.name}`;
  }
  if (order?.placedBy === "guest") return "Guest · table QR";
  if (order?.placedBy === "customer") return "Customer · app";
  return "—";
}

export function orderCode(order) {
  return `#${String(order?._id ?? "").slice(-6).toUpperCase()}`;
}

function Field({ label, children }) {
  return (
    <div>
      <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm font-medium text-[#24190f]">{children ?? "—"}</p>
    </div>
  );
}

function Timeline({ history, currentStatus }) {
  // Nothing recorded (a pre-statusHistory order) — the current status is all there is.
  if (!history || history.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No transition history recorded for this order. Current status:{" "}
        <span className="font-medium text-[#24190f]">{statusLabel(currentStatus)}</span>.
      </p>
    );
  }

  return (
    <ol className="space-y-0">
      {history.map((entry, i) => {
        const last = i === history.length - 1;
        const who = entry.staff?.name
          ? `${entry.staff.name}${entry.staff.role ? ` (${entry.staff.role})` : ""}`
          : entry.byRole && entry.byRole !== "system"
            ? entry.byRole
            : null;
        return (
          <li key={`${entry.status}-${entry.at ?? i}`} className="flex gap-3">
            {/* Rail: dot + connector, so each step reads as a step and not a table row. */}
            <div className="flex flex-col items-center">
              <span
                className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${
                  last ? "bg-brand-orange" : "bg-brand-cream"
                }`}
              />
              {!last ? <span className="w-px flex-1 bg-brand-cream" /> : null}
            </div>
            <div className={last ? "pb-0" : "pb-4"}>
              <p className="text-sm font-semibold text-[#24190f]">{statusLabel(entry.status)}</p>
              <p className="text-xs text-muted-foreground">
                {formatDateTime(entry.at)}
                {who ? ` · by ${who}` : ""}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export default function OrderDetailsDialog({ order, onClose }) {
  if (!order) return null;

  const items = order.items ?? [];
  const itemCount = items.reduce((n, i) => n + (i.quantity ?? 0), 0);
  const tableLabel = order.tableNumber ? `Table ${order.tableNumber}` : null;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black/60 p-3 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={`Order ${orderCode(order)}`}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="mx-auto flex max-h-full w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-brand-cream/60 px-5 py-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-base font-bold">{orderCode(order)}</p>
              <Badge variant={statusVariant(order.status)}>{statusLabel(order.status)}</Badge>
              {tableLabel ? (
                <span className="rounded-full bg-brand-cream/50 px-2.5 py-1 text-[11px] font-bold text-[#5a403e]">
                  {tableLabel}
                </span>
              ) : null}
              {order.round ?? order.batchNumber ? (
                <span className="rounded-full bg-[#F3F4F6] px-2.5 py-1 text-[11px] font-bold text-[#5F5F5F]">
                  Round {order.round ?? order.batchNumber}
                </span>
              ) : null}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {(order.type ?? "").replace("_", " ")} · placed {formatDateTime(order.createdAt)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-brand-cream/40"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Table">{order.tableNumber ? `Table ${order.tableNumber}` : "—"}</Field>
            <Field label="Taken by">{placedByLabel(order)}</Field>
            <Field label="Table waiter">{order.waiter?.name ?? "Not assigned"}</Field>
            <Field label="Round">{order.round ?? order.batchNumber ?? "—"}</Field>
            <Field label="Placed at">{formatDateTime(order.createdAt)}</Field>
            <Field label="Served at">{order.servedAt ? formatDateTime(order.servedAt) : "—"}</Field>
            {order.session ? (
              <>
                <Field label="Sitting opened">{formatDateTime(order.session.openedAt)}</Field>
                <Field label="Guests">{order.session.guestCount ?? "—"}</Field>
                <Field label="Sitting status">
                  {(order.session.status ?? "").replace(/_/g, " ") || "—"}
                </Field>
              </>
            ) : null}
          </div>

          <div className="mt-5">
            <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
              Items ({itemCount})
            </p>
            <div className="rounded-xl border border-brand-cream/60">
              {items.map((item, i) => (
                <div
                  key={item.menuItemId ?? i}
                  className="flex items-start justify-between gap-3 border-b border-brand-cream/50 px-3.5 py-2.5 last:border-0"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium">
                      <span className="text-muted-foreground">{item.quantity} ×</span> {item.name}
                    </p>
                    {item.note ? (
                      <p className="text-xs text-muted-foreground">“{item.note}”</p>
                    ) : null}
                    <p className="text-xs text-muted-foreground">{formatPrice(item.price)} each</p>
                  </div>
                  <span className="shrink-0 text-sm font-semibold">
                    {formatPrice((item.price ?? 0) * (item.quantity ?? 0))}
                  </span>
                </div>
              ))}
              {items.length === 0 ? (
                <p className="px-3.5 py-4 text-sm text-muted-foreground">No items on this order.</p>
              ) : null}
            </div>
            <div className="mt-2 flex justify-between px-1 text-sm font-bold">
              <span>Subtotal</span>
              <span>{formatPrice(order.subtotal)}</span>
            </div>
          </div>

          {order.specialInstructions ? (
            <div className="mt-5">
              <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                Kitchen instructions
              </p>
              <p className="text-sm text-muted-foreground">“{order.specialInstructions}”</p>
            </div>
          ) : null}

          {order.deliveryAddress?.street ? (
            <div className="mt-5">
              <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                Delivery address
              </p>
              <p className="text-sm text-muted-foreground">
                {[order.deliveryAddress.street, order.deliveryAddress.city]
                  .filter(Boolean)
                  .join(", ")}
              </p>
            </div>
          ) : null}

          <div className="mt-5">
            <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
              Status timeline
            </p>
            <Timeline history={order.statusHistory} currentStatus={order.status} />
          </div>
        </div>
      </div>
    </div>
  );
}
