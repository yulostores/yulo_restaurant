// Live order tracking — GET /api/orders/:id, polled while the order is open.
// The steps mirror the order lifecycle the API documents.

import { useParams } from "react-router-dom";
import { Check, XCircle } from "lucide-react";

import { cn } from "@/lib/utils";
import { useCustomerOrder } from "@/hooks/customer/useCustomerOrders";
import CustomerLayout, { formatPrice } from "./CustomerLayout";

// Terminal states stop the poll. 'served' is the dine-in end of the line — the waiter
// has brought the food to the table — and nothing follows it until the bill is settled.
const DONE = ["served", "delivered", "cancelled"];

// A dine-in order ends at 'served'; a delivery one runs on through dispatch. Both share
// the first four steps, so the tail is chosen per order type rather than showing a diner
// a delivery step that will never happen.
const COMMON_STEPS = [
  { key: "placed",    label: "Order placed", note: "We've received your order." },
  { key: "confirmed", label: "Confirmed",    note: "The restaurant accepted it." },
  { key: "preparing", label: "Preparing",    note: "Your food is being cooked." },
];

const DINE_IN_STEPS = [
  ...COMMON_STEPS,
  { key: "ready",  label: "Ready",  note: "Plated and on its way to your table." },
  { key: "served", label: "Served", note: "Enjoy your meal!" },
];

const DELIVERY_STEPS = [
  ...COMMON_STEPS,
  { key: "ready",            label: "Ready",            note: "Packed and ready to go." },
  { key: "out_for_delivery", label: "Out for delivery", note: "On the way to you." },
  { key: "delivered",        label: "Delivered",        note: "Enjoy your meal!" },
];

function stepsFor(order) {
  return order?.type === "dine_in" ? DINE_IN_STEPS : DELIVERY_STEPS;
}

export default function OrderStatus() {
  const { orderId } = useParams();

  const { data: order, isLoading, isError, error } = useCustomerOrder(orderId, {
    pollInterval: 15_000,
  });

  if (isError) {
    return (
      <CustomerLayout title="Order status" showBack>
        <p className="px-5 py-10 text-center text-sm text-brand-maroon">
          Couldn&apos;t load this order: {error.message}
        </p>
      </CustomerLayout>
    );
  }

  if (isLoading || !order) {
    return (
      <CustomerLayout title="Order status" showBack>
        <p className="px-5 py-10 text-center text-sm text-muted-foreground">Loading…</p>
      </CustomerLayout>
    );
  }

  const cancelled = order.status === "cancelled";
  const steps = stepsFor(order);
  const currentIndex = steps.findIndex((s) => s.key === order.status);
  const settled = DONE.includes(order.status);

  return (
    <CustomerLayout title="Order status" showBack showNav activeNav="Menu">
      <div className="space-y-4 px-4 py-4">
        <section className="rounded-2xl border border-brand-cream/70 bg-white p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">
                Order #{String(order._id).slice(-6).toUpperCase()}
              </p>
              <p className="text-lg font-bold capitalize">
                {(order.status ?? "").replace(/_/g, " ")}
              </p>
            </div>
            <span className="text-lg font-bold text-brand-red">
              {formatPrice(order.subtotal)}
            </span>
          </div>
          {!settled ? (
            <p className="mt-2 text-xs text-muted-foreground">
              This page refreshes automatically every 15 seconds.
            </p>
          ) : null}
        </section>

        {cancelled ? (
          <section className="flex items-start gap-3 rounded-2xl border border-brand-cream/70 bg-[#FCE9E4] p-4">
            <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-brand-maroon" />
            <div>
              <p className="font-bold text-brand-maroon">Order cancelled</p>
              <p className="text-sm text-brand-maroon/80">
                Contact the restaurant if you weren&apos;t expecting this.
              </p>
            </div>
          </section>
        ) : (
          <section className="rounded-2xl border border-brand-cream/70 bg-white p-4">
            <ol className="space-y-0">
              {steps.map((step, i) => {
                const done = currentIndex >= 0 && i <= currentIndex;
                const active = i === currentIndex;
                const last = i === steps.length - 1;
                return (
                  <li key={step.key} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <span
                        className={cn(
                          "grid h-7 w-7 shrink-0 place-items-center rounded-full border-2 transition",
                          done
                            ? "border-brand-orange bg-brand-orange text-white"
                            : "border-brand-cream bg-white text-transparent",
                        )}
                      >
                        <Check className="h-3.5 w-3.5" />
                      </span>
                      {!last ? (
                        <span
                          className={cn(
                            "w-0.5 flex-1",
                            done ? "bg-brand-orange" : "bg-brand-cream",
                          )}
                        />
                      ) : null}
                    </div>
                    <div className={cn("pb-6", last && "pb-0")}>
                      <p className={cn("font-semibold", active && "text-brand-orange")}>
                        {step.label}
                      </p>
                      <p className="text-xs text-muted-foreground">{step.note}</p>
                    </div>
                  </li>
                );
              })}
            </ol>
          </section>
        )}

        <section className="rounded-2xl border border-brand-cream/70 bg-white p-4">
          <p className="mb-3 text-sm font-bold">Items</p>
          {(order.items ?? []).map((item, i) => (
            <div
              key={item.menuItemId ?? i}
              className="flex justify-between border-b border-[#F6EFE9] py-2 text-sm last:border-0"
            >
              <span className="min-w-0 truncate">{item.quantity} × {item.name}</span>
              <span className="shrink-0 font-semibold">
                {formatPrice(item.subtotal ?? item.price * item.quantity)}
              </span>
            </div>
          ))}
        </section>
      </div>
    </CustomerLayout>
  );
}
