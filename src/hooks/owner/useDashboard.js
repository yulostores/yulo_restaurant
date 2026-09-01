import { useQuery } from "@tanstack/react-query";
import { ownerApi } from "@/api/owner.api";

// Query key factory — centralised so invalidation targets stay consistent.
export const dashboardKeys = {
  all:          (rId) => ["dashboard", rId],
  kpis:         (rId, period) => ["dashboard", rId, "kpis", period],
  sales:        (rId, period) => ["dashboard", rId, "sales", period],
  topItems:     (rId, period) => ["dashboard", rId, "top-items", period],
  recentOrders: (rId) => ["dashboard", rId, "recent-orders"],
};

// period: "today" | "week" | "month" | "year"

// ── Dashboard KPIs ───────────────────────────────────────────────────
// Returns { revenue, orders, avgOrderValue, dineIn, delivery,
//           cancelledOrders, newCustomers, period }
export function useDashboardKPIs(restaurantId, period = "today") {
  return useQuery({
    queryKey: dashboardKeys.kpis(restaurantId, period),
    queryFn: () => ownerApi.getDashboardKPIs(restaurantId, period).then((r) => r.data.data),
    enabled: !!restaurantId,
    staleTime: 60_000,
    refetchInterval: 120_000,
  });
}

// ── Sales Chart ──────────────────────────────────────────────────────
// Returns { labels: string[], revenue: number[], orders: number[] }
export function useSalesChart(restaurantId, period = "week") {
  return useQuery({
    queryKey: dashboardKeys.sales(restaurantId, period),
    queryFn: () => ownerApi.getSalesChart(restaurantId, period).then((r) => r.data.data),
    enabled: !!restaurantId,
    staleTime: 60_000,
  });
}

// ── Top Items ────────────────────────────────────────────────────────
// Returns [{ menuItemId, name, totalQuantity, totalRevenue }]
export function useTopItems(restaurantId, period = "month") {
  return useQuery({
    queryKey: dashboardKeys.topItems(restaurantId, period),
    queryFn: () => ownerApi.getTopItems(restaurantId, period).then((r) => r.data.data.items ?? []),
    enabled: !!restaurantId,
    staleTime: 5 * 60_000,
  });
}

// ── Recent Orders (server returns the last 10) ────────────────────────
export function useRecentOrders(restaurantId) {
  return useQuery({
    queryKey: dashboardKeys.recentOrders(restaurantId),
    queryFn: () => ownerApi.getRecentOrders(restaurantId).then((r) => r.data.data.orders ?? []),
    enabled: !!restaurantId,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}
