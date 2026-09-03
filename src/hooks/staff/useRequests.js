import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { staffApi } from "@/api/staff.api";

export const staffRequestKeys = {
  all: (rId, status) => ["staff-requests", rId, status ?? "all"],
};

// [{ _id, tableId: { _id, identifier }, type, note, status, createdAt, ... }]
export function useStaffRequests(restaurantId, status) {
  return useQuery({
    queryKey: staffRequestKeys.all(restaurantId, status),
    queryFn: () =>
      staffApi.listRequests(restaurantId, status).then((r) => r.data.data.requests ?? []),
    enabled: !!restaurantId,
    refetchInterval: 15_000,
    staleTime: 0,
  });
}

// status: "acknowledged" | "resolved"
export function useUpdateStaffRequestStatus(restaurantId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ requestId, status }) =>
      staffApi.updateRequestStatus(restaurantId, requestId, status),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["staff-requests", restaurantId] }),
  });
}
