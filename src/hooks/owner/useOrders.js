import { useQuery } from "@tanstack/react-query";
import { ownerApi } from "@/api/owner.api";

// The owner view is read-only — order status transitions belong to the kitchen
// (staff) and waiter endpoints, and payment is closed out by the waiter's mark-paid call.
export const orderKeys = {
  all:     (rId)       => ["owner-orders", rId],
  list:    (rId, p={}) => ["owner-orders", rId, "list", p],
  one:     (rId, id)   => ["owner-orders", rId, "order", id],
  byTable: (rId, p={}) => ["owner-orders", rId, "by-table", p],
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

// ── Dine-in orders grouped table -> sitting -> rounds ────────────────
// Each entry: { tableId, tableNumber, capacity, session, orders[], summary }
// where `summary` carries { orderCount, itemCount, subtotal, status, staff[],
// firstOrderAt, lastOrderAt } and every order carries `round`, `staff`,
// `waiter` and `statusHistory`.
//
// params: { scope: "active" | "today" | "all", search }
export function useOrdersByTable(restaurantId, params = {}) {
  return useQuery({
    queryKey: orderKeys.byTable(restaurantId, params),
    queryFn: () =>
      ownerApi.listOrdersByTable(restaurantId, params).then((r) => r.data.data.tables ?? []),
    enabled: !!restaurantId,
    // Service-floor data: a ticket the kitchen or a waiter just moved should surface
    // here within seconds, not on the next full page load.
    staleTime: 5_000,
    refetchInterval: 15_000,
  });
}
