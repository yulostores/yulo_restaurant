// Incoming Orders (/incoming-orders) — the restaurant's approval inbox.
//
// Every customer order (delivery app checkout, table QR) arrives here as status "placed"
// and goes nowhere else: the chef KDS, the waiter portal and rider search only see it once
// it is accepted on this screen. Rejecting it cancels the order and the customer is shown
// the reason. Orders nobody answers are cancelled automatically by the server after
// `approvalTimeoutMinutes`, so each card counts down to that.
//
// Waiter-placed orders never appear here — the waiter taking the order in person is the
// restaurant accepting it.
//
// Data: GET /api/owner/:rId/orders/pending (polled — see hooks/owner/useOrderApproval.js),
// PATCH …/orders/:id/accept, PATCH …/orders/:id/reject { reason }.

import { useEffect, useMemo, useState } from "react";
import {
  BellRing, Bike, Check, Clock, Leaf, MapPin, UtensilsCrossed, Volume2, VolumeX, X,
} from "lucide-react";

import { useOwnerAuth } from "@/context/OwnerAuthContext";
import {
  PENDING_POLL_MS, useAcceptOrder, usePendingOrders, useRejectOrder,
} from "@/hooks/owner/useOrderApproval";
import DashboardLayout from "@/components/DashboardLayout";
import OrderDetailsDialog, {
  customerLabel, formatPrice, formatTime, minutesSince, orderCode, placedByLabel,
} from "@/components/OrderDetailsDialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { errorMessage } from "@/lib/errors";
import { isOrderSoundOn, setOrderSoundOn } from "@/lib/orderAlert";
import { cn } from "@/lib/utils";

const DEFAULT_TIMEOUT_MINUTES = 15;
// Below this many minutes left, the countdown turns red.
const URGENT_MINUTES = 3;

// Re-renders every `ms` so "waiting 4m" and the countdown move without a refetch.
function useNow(ms = 15_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

// What the owner needs to know about the money before accepting. `awaitingPayment` (from
// the server) covers the one blocking case — online and not yet paid.
function paymentInfo(order) {
  if (order.awaitingPayment) {
    return {
      label: order.paymentStatus === "failed" ? "Online · payment failed" : "Online · awaiting payment",
      variant: "warn",
    };
  }
  if (order.paymentStatus === "paid") {
    return { label: order.paymentMethod === "online" ? "Paid online" : "Paid", variant: "ok" };
  }
  if (order.type === "dine_in") return { label: "Pay at table", variant: "muted" };
  if (order.paymentMethod === "card" || order.paymentMethod === "upi") {
    return { label: `${order.paymentMethod === "card" ? "Card" : "UPI"} · on hand-over`, variant: "info" };
  }
  return {
    label: order.type === "takeaway" ? "Cash at pickup" : "Cash on delivery",
    variant: "info",
  };
}

function whereLabel(order) {
  if (order.type === "dine_in") {
    return order.tableNumber ? `Table ${order.tableNumber}` : "Dine-in";
  }
  return order.type === "takeaway" ? "Takeaway" : "Delivery";
}

function addressLine(address) {
  if (!address) return null;
  const head = [address.houseNumber, address.building].filter(Boolean).join(", ");
  const rest = [address.street, address.area, address.city, address.pincode]
    .filter(Boolean)
    .join(", ");
  return [head, rest].filter(Boolean).join(" · ") || null;
}

/* ── Reject dialog ── */
function RejectDialog({ order, reasons, busy, error, onCancel, onConfirm }) {
  const presets = (reasons ?? []).filter((r) => r.toLowerCase() !== "other");
  const [choice, setChoice] = useState(null); // a preset, or "other"
  const [custom, setCustom] = useState("");

  const reason = choice === "other" ? custom.trim() : choice;
  const valid = Boolean(reason) && reason.length >= 3;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`Reject order ${orderCode(order)}`}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onCancel();
      }}
    >
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl">
        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-lg font-bold">Reject {orderCode(order)}?</h2>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:bg-brand-cream/40"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="mb-4 text-sm text-muted-foreground">
          The order will be cancelled and the customer will see this reason.
          {order.paymentMethod === "online" && order.paymentStatus === "paid"
            ? " They paid online, so it will be flagged for a refund."
            : ""}
        </p>

        <div className="flex flex-wrap gap-2">
          {presets.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setChoice(r)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs font-semibold transition",
                choice === r
                  ? "border-brand-maroon bg-[#FCE9E4] text-brand-maroon"
                  : "border-brand-cream text-[#5a403e] hover:border-brand-maroon/40",
              )}
            >
              {r}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setChoice("other")}
            className={cn(
              "rounded-full border px-3 py-1.5 text-xs font-semibold transition",
              choice === "other"
                ? "border-brand-maroon bg-[#FCE9E4] text-brand-maroon"
                : "border-brand-cream text-[#5a403e] hover:border-brand-maroon/40",
            )}
          >
            Other…
          </button>
        </div>

        {choice === "other" ? (
          <textarea
            autoFocus
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            maxLength={200}
            rows={3}
            placeholder="Tell the customer why (at least 3 characters)"
            className="mt-3 w-full resize-none rounded-xl border border-brand-cream px-3 py-2 text-sm outline-none focus:border-brand-orange"
          />
        ) : null}

        {error ? (
          <p className="mt-3 rounded-lg bg-[#FCE9E4] px-3 py-2 text-sm text-brand-maroon">{error}</p>
        ) : null}

        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="flex-1 rounded-xl border border-brand-cream py-2.5 text-sm font-bold text-[#24190f] hover:bg-brand-cream/20"
          >
            Keep order
          </button>
          <button
            type="button"
            disabled={!valid || busy}
            onClick={() => onConfirm(reason)}
            className="flex-1 rounded-xl bg-brand-maroon py-2.5 text-sm font-bold text-white transition hover:brightness-110 disabled:opacity-50"
          >
            {busy ? "Rejecting…" : "Reject order"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── One pending order ── */
function ApprovalCard({ order, now, timeoutMinutes, busy, onAccept, onReject, onView }) {
  const waited = minutesSince(order.createdAt, now);
  const left = Math.max(0, timeoutMinutes - waited);
  const urgent = left <= URGENT_MINUTES;
  const payment = paymentInfo(order);
  const items = order.items ?? [];
  const who = customerLabel(order);
  const address = order.type === "delivery" ? addressLine(order.deliveryAddress) : null;
  const total = order.grandTotal ?? order.subtotal;

  return (
    <Card className={cn("flex flex-col overflow-hidden", urgent && "border-brand-maroon/50")}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-brand-cream/60 bg-[#FFF8F3] px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-bold">{orderCode(order)}</span>
          <span className="inline-flex items-center gap-1 rounded-full bg-brand-cream/60 px-2.5 py-1 text-[11px] font-bold text-[#5a403e]">
            {order.type === "dine_in" ? (
              <UtensilsCrossed className="h-3 w-3" />
            ) : (
              <Bike className="h-3 w-3" />
            )}
            {whereLabel(order)}
            {order.type === "dine_in" && (order.round ?? order.batchNumber) > 1
              ? ` · Round ${order.round ?? order.batchNumber}`
              : ""}
          </span>
          <Badge variant={payment.variant}>{payment.label}</Badge>
        </div>
        <span
          className={cn(
            "inline-flex items-center gap-1 text-xs font-bold",
            urgent ? "text-brand-maroon" : "text-muted-foreground",
          )}
          title={`Placed at ${formatTime(order.createdAt)}`}
        >
          <Clock className="h-3.5 w-3.5" />
          {waited === 0 ? "just now" : `${waited}m ago`}
          {" · "}
          {left === 0 ? "auto-cancelling…" : `auto-cancels in ${left}m`}
        </span>
      </div>

      <CardContent className="flex flex-1 flex-col gap-3 p-4">
        <div>
          <p className="text-sm font-semibold">{who ?? "Customer"}</p>
          <p className="text-xs text-muted-foreground">{placedByLabel(order)}</p>
          {address ? (
            <p className="mt-1 flex items-start gap-1 text-xs text-muted-foreground">
              <MapPin className="mt-0.5 h-3 w-3 shrink-0" />
              <span>{address}</span>
            </p>
          ) : null}
        </div>

        <div className="rounded-xl border border-brand-cream/60">
          {items.map((item, i) => (
            <div
              key={item.menuItemId ?? i}
              className="flex items-start justify-between gap-3 border-b border-brand-cream/50 px-3 py-2 last:border-0"
            >
              <div className="min-w-0">
                <p className="text-sm">
                  <span className="font-bold">{item.quantity}×</span> {item.name}
                </p>
                {item.note ? <p className="text-xs text-muted-foreground">“{item.note}”</p> : null}
              </div>
              <span className="shrink-0 text-sm text-muted-foreground">
                {formatPrice((item.price ?? 0) * (item.quantity ?? 0))}
              </span>
            </div>
          ))}
        </div>

        {order.specialInstructions ? (
          <p className="text-xs italic text-muted-foreground">
            Kitchen note: “{order.specialInstructions}”
          </p>
        ) : null}

        {order.cookingRequests || order.extraCutlery || order.vegFleetOptIn ? (
          <div className="flex flex-wrap gap-1.5">
            {order.cookingRequests ? <Badge variant="muted">Cooking requests</Badge> : null}
            {order.extraCutlery ? <Badge variant="muted">Extra cutlery</Badge> : null}
            {order.vegFleetOptIn ? (
              <Badge variant="ok" className="gap-1">
                <Leaf className="h-3 w-3" /> Veg-only delivery
              </Badge>
            ) : null}
          </div>
        ) : null}

        <div className="mt-auto flex items-center justify-between pt-1">
          <button
            type="button"
            onClick={onView}
            className="text-xs font-semibold text-brand-orange underline-offset-2 hover:underline"
          >
            View full details
          </button>
          <span className="text-base font-bold">{formatPrice(total)}</span>
        </div>

        {order.awaitingPayment ? (
          <p className="rounded-lg bg-[#FFF3E0] px-3 py-2 text-xs text-[#D9480F]">
            The customer hasn't finished paying online yet. You can accept it once the payment
            goes through — or reject it now.
          </p>
        ) : null}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onReject}
            disabled={busy}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-brand-maroon/40 py-2.5 text-sm font-bold text-brand-maroon transition hover:bg-[#FCE9E4] disabled:opacity-50"
          >
            <X className="h-4 w-4" /> Reject
          </button>
          <button
            type="button"
            onClick={onAccept}
            disabled={busy || order.awaitingPayment}
            title={order.awaitingPayment ? "Waiting for the customer's online payment" : undefined}
            className="flex flex-[2] items-center justify-center gap-1.5 rounded-xl bg-brand-gradient py-2.5 text-sm font-bold text-white transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Check className="h-4 w-4" /> {busy ? "Working…" : "Accept order"}
          </button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function IncomingOrders() {
  const { restaurantId } = useOwnerAuth();
  const now = useNow();

  const { data, isLoading, isError, error, dataUpdatedAt } = usePendingOrders(restaurantId);
  const accept = useAcceptOrder(restaurantId);
  const reject = useRejectOrder(restaurantId);

  // Several cards can be mid-request at once (accept one, then another before the first
  // answers) — each keeps its own busy state until its own request settles.
  const [busyIds, setBusyIds] = useState(() => new Set());
  const setBusy = (id, on) =>
    setBusyIds((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  const [notice, setNotice] = useState(null); // { tone: "ok" | "error", text }
  const [rejecting, setRejecting] = useState(null);
  const [rejectError, setRejectError] = useState("");
  const [viewing, setViewing] = useState(null);
  const [soundOn, setSoundOn] = useState(isOrderSoundOn);

  const orders = useMemo(() => data?.orders ?? [], [data]);
  const timeoutMinutes = data?.approvalTimeoutMinutes ?? DEFAULT_TIMEOUT_MINUTES;
  const count = data?.count ?? orders.length;

  // A notice is about one action — let it fade rather than linger over later ones.
  useEffect(() => {
    if (!notice) return undefined;
    const id = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(id);
  }, [notice]);

  async function handleAccept(order) {
    setBusy(order._id, true);
    setNotice(null);
    try {
      await accept.mutateAsync({ orderId: order._id });
      setNotice({
        tone: "ok",
        text: `${orderCode(order)} accepted — sent to the kitchen${order.type === "delivery" ? " and rider search has started" : ""}.`,
      });
    } catch (err) {
      setNotice({ tone: "error", text: errorMessage(err, "Couldn't accept that order. Please try again.") });
    } finally {
      setBusy(order._id, false);
    }
  }

  async function handleReject(reason) {
    const order = rejecting;
    setBusy(order._id, true);
    setRejectError("");
    try {
      await reject.mutateAsync({ orderId: order._id, reason });
      setRejecting(null);
      setNotice({ tone: "ok", text: `${orderCode(order)} rejected. The customer has been told why.` });
    } catch (err) {
      if (err?.code === "ORDER_ALREADY_DECIDED") {
        setRejecting(null);
        setNotice({ tone: "error", text: errorMessage(err) });
      } else {
        setRejectError(errorMessage(err, "Couldn't reject that order. Please try again."));
      }
    } finally {
      setBusy(order._id, false);
    }
  }

  function toggleSound() {
    setOrderSoundOn(!soundOn);
    setSoundOn(!soundOn);
  }

  return (
    <DashboardLayout>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          {/* max-w-none: styles.css caps every h1 at 12ch, which wraps this title. */}
          <h1 className="max-w-none text-2xl font-bold">
            Incoming Orders
            {count > 0 ? (
              <span className="ml-2 inline-block rounded-full bg-brand-maroon px-2.5 py-0.5 align-middle font-sans text-sm font-bold text-white">
                {count}
              </span>
            ) : null}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            New customer orders wait here until you accept them — only then do they reach the
            kitchen and your waiters. Unanswered orders are cancelled automatically after{" "}
            {timeoutMinutes} minutes.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">
            Refreshes every {Math.round(PENDING_POLL_MS / 1000)}s
            {dataUpdatedAt ? ` · updated ${formatTime(dataUpdatedAt)}` : ""}
          </span>
          <button
            type="button"
            onClick={toggleSound}
            className="flex items-center gap-1.5 rounded-lg border border-brand-cream px-3 py-1.5 text-xs font-semibold text-[#5a403e] hover:bg-brand-cream/30"
            aria-pressed={soundOn}
          >
            {soundOn ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
            Sound {soundOn ? "on" : "off"}
          </button>
        </div>
      </div>

      {notice ? (
        <p
          className={cn(
            "rounded-xl px-4 py-2.5 text-sm",
            notice.tone === "ok" ? "bg-[#E8F5EC] text-[#2E7D32]" : "bg-[#FCE9E4] text-brand-maroon",
          )}
          role="status"
        >
          {notice.text}
        </p>
      ) : null}

      {isError ? (
        <p className="rounded-xl bg-[#FCE9E4] px-4 py-2.5 text-sm text-brand-maroon">
          {errorMessage(error, "Couldn't load incoming orders. Retrying…")}
        </p>
      ) : null}

      {isLoading ? (
        <p className="animate-pulse py-10 text-center text-sm text-muted-foreground">
          Loading incoming orders…
        </p>
      ) : orders.length === 0 && !isError ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-16 text-center">
            <BellRing className="h-10 w-10 text-brand-orange/60" />
            <p className="font-bold">No orders waiting</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              New orders will appear here with a sound alert. Keep this portal open during
              service.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {orders.map((order) => (
            <ApprovalCard
              key={order._id}
              order={order}
              now={now}
              timeoutMinutes={timeoutMinutes}
              busy={busyIds.has(order._id)}
              onAccept={() => handleAccept(order)}
              onReject={() => {
                setRejectError("");
                setRejecting(order);
              }}
              onView={() => setViewing(order)}
            />
          ))}
        </div>
      )}

      {count > orders.length ? (
        <p className="text-center text-xs text-muted-foreground">
          Showing the {orders.length} oldest of {count} waiting orders.
        </p>
      ) : null}

      {rejecting ? (
        <RejectDialog
          order={rejecting}
          reasons={data?.rejectionReasons}
          busy={busyIds.has(rejecting._id)}
          error={rejectError}
          onCancel={() => setRejecting(null)}
          onConfirm={handleReject}
        />
      ) : null}

      {viewing ? <OrderDetailsDialog order={viewing} onClose={() => setViewing(null)} /> : null}
    </DashboardLayout>
  );
}
