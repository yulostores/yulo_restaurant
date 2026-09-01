import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ownerApi } from "@/api/owner.api";
import { discountKeys } from "./useDiscounts";

export const liveMonitorKeys = {
  stats:    (rId) => ["live-monitor", rId, "stats"],
  visitors: (rId) => ["live-monitor", rId, "visitors"],
  repeat:   (rId) => ["live-monitor", rId, "repeat"],
};

// { activeVisitors, openSessions, pendingOrders, todayGMV }
// Also pushed over Socket.IO as a `live_stats` event every 30s.
export function useLiveStats(restaurantId) {
  return useQuery({
    queryKey: liveMonitorKeys.stats(restaurantId),
    queryFn: () => ownerApi.getLiveStats(restaurantId).then((r) => r.data.data),
    enabled: !!restaurantId,
    refetchInterval: 30_000,
    staleTime: 0,
  });
}

// [{ userId, name, lastSeen, tableId }] — Redis-backed, expires after 5 min idle.
export function useLiveVisitors(restaurantId) {
  return useQuery({
    queryKey: liveMonitorKeys.visitors(restaurantId),
    queryFn: () => ownerApi.getLiveVisitors(restaurantId).then((r) => r.data.data.visitors ?? []),
    enabled: !!restaurantId,
    refetchInterval: 30_000,
    staleTime: 0,
  });
}

// [{ _id, name, email, orderCount }] — customers with more than one order here.
export function useLiveRepeat(restaurantId) {
  return useQuery({
    queryKey: liveMonitorKeys.repeat(restaurantId),
    queryFn: () => ownerApi.getLiveRepeat(restaurantId).then((r) => r.data.data.visitors ?? []),
    enabled: !!restaurantId,
    refetchInterval: 60_000,
    staleTime: 0,
  });
}

// Creates a discount and broadcasts it to active visitors as a
// `targeted_offer` Socket.IO event. Body matches the discount schema.
export function useCreateTargetedOffer(restaurantId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body) => ownerApi.createTargetOffer(restaurantId, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: discountKeys.all(restaurantId) }),
  });
}
