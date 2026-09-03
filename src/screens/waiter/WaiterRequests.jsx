import { useState } from "react";

import { useStaffAuth } from "@/context/StaffAuthContext";
import { useStaffRequests, useUpdateStaffRequestStatus } from "@/hooks/staff/useRequests";
import WaiterLayout, { WaiterPageHeader } from "./WaiterLayout";
import RequestsBoard from "@/screens/shared/RequestsBoard";

export default function WaiterRequests() {
  const { staff } = useStaffAuth();
  const restaurantId = staff?.restaurantId;

  const { data: requests = [], isLoading, isError } = useStaffRequests(restaurantId);
  const updateStatus = useUpdateStaffRequestStatus(restaurantId);
  const [busyId, setBusyId] = useState(null);

  async function transition(requestId, status) {
    setBusyId(requestId);
    try {
      await updateStatus.mutateAsync({ requestId, status });
    } catch {
      // Surfaced via the row staying in its previous state — a stale board is
      // recovered by the next 15s poll, no separate error UI needed here.
    } finally {
      setBusyId(null);
    }
  }

  return (
    <WaiterLayout>
      <WaiterPageHeader
        title="Customer Requests"
        subtitle="Respond to guest assistance requests from your tables."
      />
      <div className="px-4 py-5 sm:px-5">
        <RequestsBoard
          requests={requests}
          isLoading={isLoading}
          isError={isError}
          busyId={busyId}
          onAcknowledge={(id) => transition(id, "acknowledged")}
          onResolve={(id) => transition(id, "resolved")}
        />
      </div>
    </WaiterLayout>
  );
}
