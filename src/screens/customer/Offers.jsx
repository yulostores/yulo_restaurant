// Customer offers. Discounts exist in the API only under the owner-scoped
// /api/owner/:restaurantId/discounts routes, which require a restaurant_owner
// token — there is no public/customer endpoint that lists a restaurant's active
// offers, and POST /api/orders accepts no coupon code. See API-GAPS.md.

import FeatureUnavailable from "@/components/FeatureUnavailable";
import CustomerLayout from "./CustomerLayout";

export default function Offers() {
  return (
    <CustomerLayout title="Offers" showNav activeNav="Offers">
      <div className="px-4 py-6">
        <FeatureUnavailable
          title="Offers aren't available yet"
          note="Restaurants can create discounts, but there's no public endpoint for guests to browse or redeem them."
          needs={[
            "GET  /api/restaurants/:id/discounts        (public, active only)",
            "POST /api/orders  → accept a `couponCode` field",
          ]}
        />
      </div>
    </CustomerLayout>
  );
}
