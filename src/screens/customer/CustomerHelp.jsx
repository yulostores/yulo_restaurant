// Customer assistance requests (call waiter, need water, need the bill, …).
// The documented API has no assistance-request resource, so there is nothing to
// raise or track here yet. See API-GAPS.md.

import FeatureUnavailable from "@/components/FeatureUnavailable";
import CustomerLayout from "./CustomerLayout";

export default function CustomerHelp() {
  return (
    <CustomerLayout title="Help" showNav activeNav="Help">
      <div className="px-4 py-6">
        <FeatureUnavailable
          title="In-app assistance isn't wired up yet"
          note="Calling a waiter or asking for the bill from your phone needs an endpoint the API doesn't expose yet. Please ask a member of staff directly."
          needs={[
            "POST /api/restaurants/:id/requests    { type, note, tableId }",
            "GET  /api/restaurants/:id/requests    (the guest's own requests)",
          ]}
        />
      </div>
    </CustomerLayout>
  );
}
