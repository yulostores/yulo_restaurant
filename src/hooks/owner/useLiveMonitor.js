import { useQuery } from "@tanstack/react-query";
import { ownerApi } from "@/api/owner.api";

export const liveMonitorKeys = {
  stats:    (rId) => ["live-monitor", rId, "stats"],
  repeat:   (rId) => ["live-monitor", rId, "repeat"],
};

// { restaurantId, openSessions, pendingOrders, activeVisitors, gmv } — `gmv` in rupees.
export function useLiveStats(restaurantId) {
  return useQuery({
    queryKey: liveMonitorKeys.stats(restaurantId),
    queryFn: () => ownerApi.getLiveStats(restaurantId).then((r) => r.data.data),
    enabled: !!restaurantId,
    refetchInterval: 30_000,
    staleTime: 0,
  });
}

// [{ _id, name (first name), orderCount, lastOrder }] — customers with more than one order here.
export function useLiveRepeat(restaurantId) {
  return useQuery({
    queryKey: liveMonitorKeys.repeat(restaurantId),
    queryFn: () => ownerApi.getLiveRepeat(restaurantId).then((r) => r.data.data.visitors ?? []),
    enabled: !!restaurantId,
    refetchInterval: 60_000,
    staleTime: 0,
  });
}
