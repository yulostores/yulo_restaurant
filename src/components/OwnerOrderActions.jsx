// The owner's own kitchen / floor buttons on an order — for when the chef or a waiter is busy
// and the order shouldn't wait for them. QR (dine-in) and customer-app (delivery / takeaway)
// orders alike: PATCH /api/owner/:rId/orders/:orderId/status, the same steps and side effects
// as the chef KDS and the waiter portal, recorded on the order as the owner's.
//
// Not offered: a waiting ('placed') order — that is Accept / Reject on Incoming Orders — and,
// once a rider has a delivery order, "out for delivery" / "delivered": the rider's pickup code
// and the customer's delivery code move those.

import { useState } from "react";
import { Ban, Bike, CheckCircle2, ChefHat, ConciergeBell, PackageCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useToast } from "@/components/Toaster";
import { useUpdateOrderStatus } from "@/hooks/owner/useOrders";
import { cn } from "@/lib/utils";

const RIDER_HOLDS = ["assigned", "picked_up"];

const STEP = {
  preparing: { label: "Start preparing", icon: ChefHat, done: "Preparing" },
  ready: { label: "Mark ready", icon: CheckCircle2, done: "Ready" },
  served: { label: "Mark served", icon: ConciergeBell, done: "Served" },
  out_for_delivery: { label: "Out for delivery", icon: Bike, done: "Out for delivery" },
  delivered: { label: "Mark delivered", icon: PackageCheck, done: "Delivered" },
  picked_up: { label: "Handed to customer", icon: PackageCheck, done: "Handed over" },
};

const CANCEL_REASONS = ["Item out of stock", "Kitchen is too busy", "Restaurant closing", "Customer asked to cancel"];

export const riderHasIt = (order) => order?.type === "delivery" && RIDER_HOLDS.includes(order?.deliveryAssignment?.status);

/** The next steps the owner can take on `order`, most likely first: [{ status, key }]. */
export function ownerSteps(order) {
  if (!order) return [];
  const { status, type } = order;
  const rider = riderHasIt(order);
  const steps = [];
  if (status === "confirmed") steps.push("preparing");
  if (status === "preparing") {
    steps.push("ready");
    if (type === "dine_in") steps.push("served");
  }
  if (status === "ready") {
    if (type === "dine_in") steps.push("served");
    if (type === "takeaway") steps.push("picked_up");
    if (type === "delivery" && !rider) steps.push("out_for_delivery");
  }
  if (status === "out_for_delivery" && type === "delivery" && !rider) steps.push("delivered");
  return steps.map((key) => ({ key, status: key === "picked_up" ? "delivered" : key }));
}

/** Whether the owner can still cancel it (after accepting, before the food has left). */
export const ownerCanCancel = (order) =>
  ["confirmed", "preparing", "ready"].includes(order?.status) && order?.deliveryAssignment?.status !== "picked_up";

function CancelOrderDialog({ code, busy, onClose, onConfirm }) {
  const [reason, setReason] = useState("");
  const valid = reason.trim().length >= 3;
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
      role="alertdialog"
      aria-modal="true"
      aria-label={`Cancel order ${code}`}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div className="w-full max-w-md space-y-4 rounded-2xl bg-white p-5 shadow-xl">
        <div>
          <h2 className="text-lg font-bold">Cancel {code}?</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            The customer sees this reason. An online payment is refunded in full.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {CANCEL_REASONS.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setReason(r)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-semibold",
                reason === r ? "border-brand-orange bg-[#FFF6EF] text-brand-orange" : "border-brand-cream text-[#5a403e]",
              )}
            >
              {r}
            </button>
          ))}
        </div>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value.slice(0, 200))}
          rows={2}
          placeholder="Reason for the customer"
          aria-label="Reason for the customer"
          className="w-full rounded-xl border border-brand-cream px-3 py-2 text-sm outline-none focus:border-brand-orange"
        />
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Keep order
          </Button>
          <Button variant="destructive" disabled={!valid || busy} onClick={() => onConfirm(reason.trim())}>
            {busy ? "Cancelling…" : "Cancel order"}
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * The buttons for one order. `compact` (table rows) shows only the main next step; the full
 * set (order details) adds the others and Cancel. Renders nothing when there is nothing to do.
 */
export default function OwnerOrderActions({ order, restaurantId, code, compact = false, onUpdated, className }) {
  const toast = useToast();
  const update = useUpdateOrderStatus(restaurantId);
  const [cancelling, setCancelling] = useState(false);
  const steps = ownerSteps(order);
  const shown = compact ? steps.slice(0, 1) : steps;
  const canCancel = !compact && ownerCanCancel(order);
  const riderNote = !compact && riderHasIt(order) && ["ready", "preparing", "confirmed", "out_for_delivery"].includes(order.status);

  if (shown.length === 0 && !canCancel && !riderNote) return null;

  async function run(step, reason) {
    try {
      const updated = await update.mutateAsync({ orderId: order._id, newStatus: step.status, reason });
      toast.success(step.status === "cancelled" ? `${code} cancelled` : `${code}: ${STEP[step.key]?.done ?? step.status}`);
      setCancelling(false);
      onUpdated?.(updated);
    } catch (err) {
      toast.error(err, "Couldn't update the order");
    }
  }

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)} onClick={(e) => e.stopPropagation()}>
      {shown.map((step, i) => {
        const { label, icon: Icon } = STEP[step.key];
        return (
          <Button
            key={step.key}
            size="sm"
            variant={i === 0 ? "default" : "outline"}
            disabled={update.isPending}
            onClick={() => run(step)}
            className="gap-1.5"
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </Button>
        );
      })}
      {canCancel ? (
        <Button size="sm" variant="ghost" disabled={update.isPending} onClick={() => setCancelling(true)} className="gap-1.5 text-brand-maroon">
          <Ban className="h-3.5 w-3.5" /> Cancel order
        </Button>
      ) : null}
      {riderNote ? (
        <p className="w-full text-xs text-muted-foreground">
          A rider has this order: it goes out for delivery when they enter the pickup code, and is delivered with the
          customer&apos;s code.
        </p>
      ) : null}
      {cancelling ? (
        <CancelOrderDialog
          code={code}
          busy={update.isPending}
          onClose={() => setCancelling(false)}
          onConfirm={(reason) => run({ key: "cancelled", status: "cancelled" }, reason)}
        />
      ) : null}
    </div>
  );
}
