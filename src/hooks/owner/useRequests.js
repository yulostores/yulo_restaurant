import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ownerApi } from "@/api/owner.api";

export const ownerRequestKeys = {
  all: (rId, status) => ["owner-requests", rId, status ?? "all"],
};

// Manager view — runs on the owner session (see App.jsx's manager routes comment).
export function useOwnerRequests(restaurantId, status) {
  return useQuery({
    queryKey: ownerRequestKeys.all(restaurantId, status),
    queryFn: () =>
      ownerApi.listRequests(restaurantId, status).then((r) => r.data.data.requests ?? []),
    enabled: !!restaurantId,
    refetchInterval: 15_000,
    staleTime: 0,
  });
}

// status: "acknowledged" | "resolved"
export function useUpdateOwnerRequestStatus(restaurantId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ requestId, status }) =>
      ownerApi.updateRequestStatus(restaurantId, requestId, status),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["owner-requests", restaurantId] }),
  });
}
