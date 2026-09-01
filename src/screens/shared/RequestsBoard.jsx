// Shared staff view of customer assistance requests (call waiter, need water,
// need bill, …), used by the Waiter and Manager portals.
//
// The documented API has no assistance-request resource at all — nothing to
// list, acknowledge, or resolve. The screen states that plainly instead of
// rendering fixtures. See API-GAPS.md.

import FeatureUnavailable from "@/components/FeatureUnavailable";

export default function RequestsBoard() {
  return (
    <FeatureUnavailable
      title="Customer requests aren't wired up yet"
      note="Guests can't raise assistance requests and staff can't resolve them until the backend exposes this resource."
      needs={[
        "GET    /api/staff/:restaurantId/requests",
        "PATCH  /api/staff/:restaurantId/requests/:id   { status }",
        "POST   /api/restaurants/:id/requests           { type, note, tableId }",
      ]}
    />
  );
}
