// Manager · Customer Requests (/manager/requests) — monitor and resolve guest
// assistance requests across the floor.

import { useState } from "react";

import { useOwnerAuth } from "@/context/OwnerAuthContext";
import { useOwnerRequests, useUpdateOwnerRequestStatus } from "@/hooks/owner/useRequests";
import DashboardLayout from "@/components/DashboardLayout";
import RequestsBoard from "@/screens/shared/RequestsBoard";

export default function ManagerRequests() {
  const { restaurantId } = useOwnerAuth();

  const { data: requests = [], isLoading, isError } = useOwnerRequests(restaurantId);
  const updateStatus = useUpdateOwnerRequestStatus(restaurantId);
  const [busyId, setBusyId] = useState(null);

  async function transition(requestId, status) {
    setBusyId(requestId);
    try {
      await updateStatus.mutateAsync({ requestId, status });
    } catch {
      // Recovered by the next 15s poll — see WaiterRequests.jsx for the same choice.
    } finally {
      setBusyId(null);
    }
  }

  return (
    <DashboardLayout>
      <div>
        <h1 className="text-2xl font-bold">Customer Requests</h1>
        <p className="text-sm text-muted-foreground">
          Monitor and resolve guest assistance requests across the restaurant.
        </p>
      </div>
      <RequestsBoard
        requests={requests}
        isLoading={isLoading}
        isError={isError}
        busyId={busyId}
        onAcknowledge={(id) => transition(id, "acknowledged")}
        onResolve={(id) => transition(id, "resolved")}
      />
    </DashboardLayout>
  );
}
