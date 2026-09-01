import { useQuery } from "@tanstack/react-query";
import { ownerApi } from "@/api/owner.api";

// The owner view is read-only — order status transitions belong to the kitchen
// (staff) endpoints, and payment is closed out by the waiter's mark-paid call.
export const orderKeys = {
  all:  (rId)       => ["owner-orders", rId],
  list: (rId, p={}) => ["owner-orders", rId, "list", p],
  one:  (rId, id)   => ["owner-orders", rId, "order", id],
};

// params: { status, type: "dine_in" | "delivery", page, limit }
export function useOwnerOrders(restaurantId, params = {}) {
  return useQuery({
    queryKey: orderKeys.list(restaurantId, params),
    queryFn: () => ownerApi.listOrders(restaurantId, params).then((r) => r.data.data.orders ?? []),
    enabled: !!restaurantId,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

// Same call, but keeps the pagination envelope for table footers.
export function useOwnerOrdersPage(restaurantId, params = {}) {
  return useQuery({
    queryKey: [...orderKeys.list(restaurantId, params), "page"],
    queryFn: () => ownerApi.listOrders(restaurantId, params).then((r) => r.data.data),
    enabled: !!restaurantId,
    staleTime: 30_000,
  });
}

export function useOwnerOrder(restaurantId, orderId) {
  return useQuery({
    queryKey: orderKeys.one(restaurantId, orderId),
    queryFn: () => ownerApi.getOrder(restaurantId, orderId).then((r) => r.data.data.order),
    enabled: !!restaurantId && !!orderId,
    staleTime: 15_000,
  });
}
