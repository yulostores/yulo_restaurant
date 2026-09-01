// Order placed confirmation — GET /api/orders/:id.

import { useNavigate, useParams } from "react-router-dom";
import { CheckCircle2 } from "lucide-react";

import { useCustomerOrder } from "@/hooks/customer/useCustomerOrders";
import CustomerLayout, { formatPrice } from "./CustomerLayout";

export default function Confirmation() {
  const { orderId } = useParams();
  const navigate = useNavigate();

  const { data: order, isLoading, isError, error } = useCustomerOrder(orderId);

  if (isError) {
    return (
      <CustomerLayout title="Order">
        <p className="px-5 py-10 text-center text-sm text-brand-maroon">
          Couldn&apos;t load this order: {error.message}
        </p>
      </CustomerLayout>
    );
  }

  if (isLoading || !order) {
    return (
      <CustomerLayout title="Order">
        <p className="px-5 py-10 text-center text-sm text-muted-foreground">Loading order…</p>
      </CustomerLayout>
    );
  }

  const footer = (
    <button
      type="button"
      onClick={() => navigate(`/order/status/${order._id}`)}
      className="w-full rounded-xl bg-brand-gradient py-3.5 text-base font-bold text-white transition hover:brightness-105"
    >
      Track this order
    </button>
  );

  return (
    <CustomerLayout footer={footer}>
      <div className="flex flex-col items-center gap-2 bg-brand-gradient px-5 pb-10 pt-12 text-center text-white">
        <CheckCircle2 className="h-14 w-14" />
        <h1 className="text-2xl font-bold">Order placed</h1>
        <p className="text-sm opacity-90">
          Order #{String(order._id).slice(-6).toUpperCase()}
        </p>
      </div>

      <div className="-mt-6 space-y-4 rounded-t-3xl bg-brand-page px-5 pt-6">
        <section className="rounded-2xl border border-brand-cream/70 bg-white p-4">
          <p className="mb-3 text-sm font-bold">Items</p>
          {(order.items ?? []).map((item, i) => (
            <div
              key={item.menuItemId ?? i}
              className="flex justify-between border-b border-[#F6EFE9] py-2 text-sm last:border-0"
            >
              <span className="min-w-0 truncate">
                {item.quantity} × {item.name}
              </span>
              <span className="shrink-0 font-semibold">
                {formatPrice(item.subtotal ?? item.price * item.quantity)}
              </span>
            </div>
          ))}
          <div className="mt-3 flex justify-between border-t border-brand-cream/70 pt-3">
            <span className="font-bold">Subtotal</span>
            <span className="font-bold text-brand-red">{formatPrice(order.subtotal)}</span>
          </div>
        </section>

        {order.deliveryAddress ? (
          <section className="rounded-2xl border border-brand-cream/70 bg-white p-4">
            <p className="mb-1.5 text-sm font-bold">Delivering to</p>
            <p className="text-sm text-muted-foreground">
              {[
                order.deliveryAddress.street,
                order.deliveryAddress.city,
                order.deliveryAddress.state,
                order.deliveryAddress.pincode,
              ].filter(Boolean).join(", ")}
            </p>
          </section>
        ) : null}

        {order.specialInstructions ? (
          <section className="rounded-2xl border border-brand-cream/70 bg-white p-4">
            <p className="mb-1.5 text-sm font-bold">Your note</p>
            <p className="text-sm text-muted-foreground">“{order.specialInstructions}”</p>
          </section>
        ) : null}
      </div>
    </CustomerLayout>
  );
}
