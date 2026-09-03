import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { customerApi } from "@/api/customer.api";

export const customerRequestKeys = {
  mine: (rId, tableId) => ["customer-requests", rId, tableId],
};

// "Mine" means "this table's" — raising a request is never gated behind login.
export function useMyRequests(restaurantId, tableId) {
  return useQuery({
    queryKey: customerRequestKeys.mine(restaurantId, tableId),
    queryFn: () =>
      customerApi.listMyRequests(restaurantId, tableId).then((r) => r.data.data.requests ?? []),
    enabled: !!restaurantId && !!tableId,
    refetchInterval: 15_000,
  });
}

// body: { type: "call_waiter" | "water" | "bill" | "other", note?, tableId }
export function useCreateRequest(restaurantId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body) => customerApi.createRequest(restaurantId, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["customer-requests", restaurantId] }),
  });
}
