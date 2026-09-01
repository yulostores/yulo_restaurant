// Cart — review items, adjust quantities, pick a delivery address, place the
// order (POST /api/orders, guarded against double-taps by an Idempotency-Key).
//
// Two constraints come straight from the API contract:
//   1. Customer orders are delivery-only. `type` must be "delivery" and a
//      deliveryAddress is required — there is no customer dine-in order
//      endpoint, so a guest at a table orders through their waiter.
//   2. The order body has no coupon field and returns only a `subtotal`.
//      Taxes/discounts are computed server-side on the dine-in Bill, so this
//      screen shows the subtotal and never invents a tax rate or a coupon.
// See API-GAPS.md.

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Minus, Plus, ShoppingBag, Trash2, Utensils } from "lucide-react";

import { usePlaceOrder, useUserProfile } from "@/hooks/customer/useCustomerOrders";
import { cn } from "@/lib/utils";
import CustomerLayout, { FoodThumb, VegDot, formatPrice } from "./CustomerLayout";
import { useCustomer } from "./CustomerApp";

function addressLabel(a) {
  return [a.label, [a.street, a.city, a.pincode].filter(Boolean).join(", ")]
    .filter(Boolean)
    .join(" — ");
}

export default function Cart() {
  const navigate = useNavigate();
  const { session, cart, cartTotal, setQuantity, removeFromCart, clearCart } = useCustomer();

  const { data: profile, isLoading: profileLoading } = useUserProfile();
  const placeOrderMutation = usePlaceOrder();

  const [addressId, setAddressId] = useState("");
  const [instructions, setInstructions] = useState("");
  const [error, setError] = useState("");

  const addresses = profile?.savedAddresses ?? [];
  const placing = placeOrderMutation.isPending;

  // Default to the first saved address once the profile arrives.
  useEffect(() => {
    if (!addressId && addresses.length > 0) setAddressId(addresses[0]._id);
  }, [addresses, addressId]);

  async function placeOrder() {
    if (placing || cart.length === 0) return;
    const address = addresses.find((a) => a._id === addressId);
    if (!address) {
      setError("Add a delivery address to your account before ordering.");
      return;
    }
    setError("");
    try {
      const { data } = await placeOrderMutation.mutateAsync({
        restaurantId: session.restaurantId,
        type: "delivery",
        items: cart.map((line) => ({
          menuItemId: line.menuItemId,
          quantity: line.quantity,
        })),
        deliveryAddress: {
          street: address.street,
          city: address.city,
          state: address.state,
          pincode: address.pincode,
          coordinates: address.location?.coordinates,
        },
        ...(instructions.trim() ? { specialInstructions: instructions.trim() } : {}),
      });
      clearCart();
      navigate(`/order/confirmation/${data.data.order._id}`);
    } catch (err) {
      setError(err.message);
    }
  }

  if (cart.length === 0) {
    return (
      <CustomerLayout title="Cart" showNav activeNav="Cart">
        <div className="flex flex-col items-center gap-3 px-8 py-20 text-center">
          <ShoppingBag className="h-10 w-10 text-brand-orange" />
          <p className="font-bold">Your cart is empty</p>
          <p className="text-sm text-muted-foreground">Add a few dishes from the menu to get started.</p>
          <button
            type="button"
            onClick={() => navigate("/order/menu")}
            className="mt-2 rounded-xl bg-brand-gradient px-5 py-2.5 text-sm font-bold text-white"
          >
            Browse menu
          </button>
        </div>
      </CustomerLayout>
    );
  }

  const canOrder = addresses.length > 0 && !!session.restaurantId;

  const footer = (
    <button
      type="button"
      onClick={placeOrder}
      disabled={placing || !canOrder}
      className="flex w-full items-center justify-between rounded-xl bg-brand-gradient px-4 py-3.5 text-white transition hover:brightness-105 disabled:opacity-50"
    >
      <span className="text-sm font-semibold">{placing ? "Placing order…" : "Place order"}</span>
      <span className="text-base font-bold">{formatPrice(cartTotal)}</span>
    </button>
  );

  return (
    <CustomerLayout title="Cart" showNav activeNav="Cart" footer={footer}>
      <div className="space-y-4 px-4 py-4">
        {/* Dine-in guests can't self-order — the API has no dine-in customer route. */}
        {session.tableId ? (
          <div className="flex gap-3 rounded-2xl border border-brand-cream bg-[#FFF3E0] p-3.5">
            <Utensils className="mt-0.5 h-4 w-4 shrink-0 text-[#D9480F]" />
            <p className="text-xs leading-relaxed text-[#8a4b16]">
              You scanned a table QR. Dine-in orders are placed by your waiter — show
              them this cart, or place a delivery order to your saved address below.
            </p>
          </div>
        ) : null}

        {error ? (
          <p className="rounded-lg bg-[#FCE9E4] px-3 py-2 text-sm text-brand-maroon">{error}</p>
        ) : null}

        {/* Lines */}
        <div className="space-y-2">
          {cart.map((line) => (
            <div
              key={line.menuItemId}
              className="flex items-center gap-3 rounded-2xl border border-brand-cream/70 bg-white p-3"
            >
              <FoodThumb src={line.image} alt={line.name} className="h-14 w-14 shrink-0 rounded-lg" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <VegDot type={line.foodType} />
                  <p className="truncate text-sm font-bold">{line.name}</p>
                </div>
                <p className="text-sm text-brand-red">{formatPrice(line.price)}</p>
                {line.specialInstructions ? (
                  <p className="truncate text-[11px] text-muted-foreground">
                    “{line.specialInstructions}”
                  </p>
                ) : null}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() => setQuantity(line.menuItemId, line.quantity - 1)}
                  className="grid h-7 w-7 place-items-center rounded-lg bg-brand-cream/40"
                  aria-label="Decrease"
                >
                  <Minus className="h-3.5 w-3.5" />
                </button>
                <span className="w-5 text-center text-sm font-bold">{line.quantity}</span>
                <button
                  type="button"
                  onClick={() => setQuantity(line.menuItemId, line.quantity + 1)}
                  className="grid h-7 w-7 place-items-center rounded-lg bg-brand-cream/40"
                  aria-label="Increase"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => removeFromCart(line.menuItemId)}
                  className="grid h-7 w-7 place-items-center rounded-lg text-brand-maroon"
                  aria-label="Remove"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Delivery address */}
        <section className="rounded-2xl border border-brand-cream/70 bg-white p-4">
          <p className="mb-2 text-sm font-bold">Deliver to</p>
          {profileLoading ? (
            <p className="text-sm text-muted-foreground">Loading your addresses…</p>
          ) : addresses.length === 0 ? (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                You have no saved addresses. Add one to place a delivery order.
              </p>
              <button
                type="button"
                onClick={() => navigate("/order/profile")}
                className="rounded-lg border border-brand-cream px-3 py-1.5 text-xs font-bold text-brand-orange"
              >
                Add an address
              </button>
            </div>
          ) : (
            <div className="space-y-1.5">
              {addresses.map((a) => (
                <label
                  key={a._id}
                  className={cn(
                    "flex cursor-pointer items-start gap-2.5 rounded-xl border p-3 text-sm transition",
                    addressId === a._id
                      ? "border-brand-orange bg-brand-orange/5"
                      : "border-brand-cream/70",
                  )}
                >
                  <input
                    type="radio"
                    name="address"
                    checked={addressId === a._id}
                    onChange={() => setAddressId(a._id)}
                    className="mt-0.5 accent-[#D9480F]"
                  />
                  <span>{addressLabel(a)}</span>
                </label>
              ))}
            </div>
          )}
        </section>

        {/* Order note */}
        <section className="rounded-2xl border border-brand-cream/70 bg-white p-4">
          <label className="mb-2 block text-sm font-bold">Order note</label>
          <textarea
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            placeholder="Anything the kitchen should know?"
            rows={2}
            className="w-full resize-none rounded-xl border border-brand-cream bg-white px-3 py-2 text-sm outline-none focus:border-brand-orange"
          />
        </section>

        {/* Summary — subtotal only; the server is the source of truth for
            taxes, charges and discounts. */}
        <section className="rounded-2xl border border-brand-cream/70 bg-white p-4">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Item subtotal</span>
            <span className="font-semibold">{formatPrice(cartTotal)}</span>
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            Delivery charges, taxes and any applicable discounts are calculated by the
            restaurant and shown on your final bill.
          </p>
        </section>
      </div>
    </CustomerLayout>
  );
}
