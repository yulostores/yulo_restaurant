// QR landing screen — the entry point after scanning a table QR. The QR URL
// carries ?restaurantId=&tableId=, which CustomerApp writes into the session.
// Restaurant details come from GET /api/restaurants/:id.

import { useNavigate } from "react-router-dom";
import { Clock, MapPin, QrCode, Star, Utensils } from "lucide-react";

import { useRestaurant } from "@/hooks/customer/useMenu";
import CustomerLayout, { formatPrice } from "./CustomerLayout";
import { useCustomer } from "./CustomerApp";

// The API returns openingHours as { monday: { open, close }, … } in 24h strings.
function todayHours(openingHours) {
  if (!openingHours) return null;
  const day = new Date().toLocaleDateString("en-US", { weekday: "long" }).toLowerCase();
  const slot = openingHours[day];
  if (!slot?.open || !slot?.close) return null;
  return `${slot.open} – ${slot.close}`;
}

function addressLine(address) {
  if (!address) return null;
  return [address.street, address.city, address.state, address.pincode]
    .filter(Boolean)
    .join(", ");
}

export default function QrLanding() {
  const navigate = useNavigate();
  const { session, cartTotal, auth } = useCustomer();

  const { data: restaurant, isLoading, isError, error } = useRestaurant(session.restaurantId);

  function start() {
    navigate(auth.isAuthenticated ? "/order/menu" : "/order/login");
  }

  // No restaurant in the URL or the stored session — the QR wasn't scanned.
  if (!session.restaurantId) {
    return (
      <CustomerLayout>
        <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-8 text-center">
          <QrCode className="h-10 w-10 text-brand-orange" />
          <h1 className="text-xl font-bold">Scan a table QR to start</h1>
          <p className="text-sm text-muted-foreground">
            This page needs a restaurant to open. Scan the QR code on your table,
            or use the link your restaurant shared.
          </p>
        </div>
      </CustomerLayout>
    );
  }

  const hours = todayHours(restaurant?.openingHours);
  const address = addressLine(restaurant?.address);
  const closed = restaurant && restaurant.isOpen === false;

  return (
    <CustomerLayout>
      <div className="flex min-h-screen flex-col">
        <div className="bg-brand-gradient px-5 pb-10 pt-8 text-white">
          <div className="flex items-center gap-2 text-sm font-medium opacity-90">
            <QrCode className="h-4 w-4" /> Scan successful
          </div>
          <h1 className="mt-3 text-2xl font-bold">Welcome to</h1>
          <p className="text-3xl font-extrabold">
            {isLoading ? "…" : restaurant?.name ?? "This restaurant"}
          </p>
          {restaurant?.description ? (
            <p className="mt-1 text-sm opacity-90">{restaurant.description}</p>
          ) : null}
        </div>

        <div className="-mt-6 flex-1 space-y-4 rounded-t-3xl bg-brand-page px-5 pt-6">
          {isError ? (
            <p className="text-sm text-brand-maroon">Couldn&apos;t load this restaurant: {error.message}</p>
          ) : null}

          <div className="rounded-2xl border border-brand-cream/70 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-orange/10 px-3 py-1 text-xs font-bold text-brand-orange">
                <Utensils className="h-3.5 w-3.5" />
                {session.tableId ? "Dine-in" : "Ordering"}
              </span>
              {restaurant ? (
                <span
                  className={`rounded-full px-3 py-1 text-xs font-bold ${
                    closed ? "bg-[#FCE9E4] text-brand-maroon" : "bg-[#E8F5EC] text-brand-green"
                  }`}
                >
                  {closed ? "Closed" : "Open now"}
                </span>
              ) : null}
            </div>

            {restaurant ? (
              <div className="mt-4 space-y-2 text-sm text-muted-foreground">
                {restaurant.avgRating ? (
                  <p className="flex items-center gap-2">
                    <Star className="h-4 w-4 fill-brand-saffron text-brand-saffron" />
                    <span className="font-semibold text-foreground">{restaurant.avgRating}</span>
                    ({Number(restaurant.totalRatings ?? 0).toLocaleString("en-IN")} reviews)
                  </p>
                ) : null}
                {address ? (
                  <p className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 shrink-0" /> {address}
                  </p>
                ) : null}
                {hours ? (
                  <p className="flex items-center gap-2">
                    <Clock className="h-4 w-4 shrink-0" /> {hours}
                  </p>
                ) : null}
              </div>
            ) : (
              <p className="mt-4 text-sm text-muted-foreground">
                {isLoading ? "Loading restaurant…" : ""}
              </p>
            )}
          </div>

          {closed ? (
            <p className="rounded-2xl bg-[#FCE9E4] p-4 text-center text-sm font-medium text-brand-maroon">
              This restaurant is currently closed. You can browse the menu but cannot place an order.
            </p>
          ) : null}
        </div>

        <div className="sticky bottom-0 border-t border-brand-cream/60 bg-brand-page/95 px-5 py-4 backdrop-blur">
          <button
            type="button"
            onClick={start}
            className="w-full rounded-xl bg-brand-gradient py-3.5 text-base font-bold text-white transition hover:brightness-105"
          >
            {auth.isAuthenticated ? "Browse Menu" : "Start Ordering"}
          </button>
          {cartTotal > 0 ? (
            <p className="mt-2 text-center text-xs text-muted-foreground">
              You have {formatPrice(cartTotal)} in your cart
            </p>
          ) : null}
        </div>
      </div>
    </CustomerLayout>
  );
}
