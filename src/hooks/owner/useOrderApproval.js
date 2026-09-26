import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ownerApi } from "@/api/owner.api";
import { orderKeys } from "./useOrders";

// Customer orders waiting for the restaurant to accept or reject them.
//
// The portal has no socket connection, so the inbox is polled. 10 s is the compromise
// between a customer staring at "waiting for the restaurant" and the API budget; it
// keeps polling in a background tab too (refetchIntervalInBackground), because that is
// exactly when the owner needs the new-order alert — the portal is open on a counter
// tablet behind another window.
export const approvalKeys = {
  pending: (rId) => ["owner-orders", rId, "pending"],
};

export const PENDING_POLL_MS = 10_000;

// { orders[], count, rejectionReasons[] } — see ownerApi.listPendingOrders.
export function usePendingOrders(restaurantId, { enabled = true } = {}) {
  return useQuery({
    queryKey: approvalKeys.pending(restaurantId),
    queryFn: () => ownerApi.listPendingOrders(restaurantId).then((r) => r.data.data),
    enabled: !!restaurantId && enabled,
    refetchInterval: PENDING_POLL_MS,
    refetchIntervalInBackground: true,
    staleTime: 0,
    // A 4xx here (not approved, not the owner) won't fix itself on retry.
    retry: (count, err) => (err?.status >= 400 && err?.status < 500 ? false : count < 2),
  });
}

// Removes the decided order from the cached inbox straight away, so the card leaves the
// screen on tap rather than on the next poll — and puts it back if the server refuses.
function useDecision(restaurantId, mutationFn) {
  const qc = useQueryClient();
  const key = approvalKeys.pending(restaurantId);

  return useMutation({
    mutationFn,
    onMutate: async ({ orderId }) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData(key);
      qc.setQueryData(key, (old) => {
        if (!old) return old;
        const orders = (old.orders ?? []).filter((o) => String(o._id) !== String(orderId));
        // Only count it off if it was actually in the cached list — a poll may already
        // have dropped it (expired, cancelled), and decrementing again would undercount.
        const removed = (old.orders ?? []).length - orders.length;
        return { ...old, orders, count: Math.max(0, (old.count ?? 0) - removed) };
      });
      return { previous };
    },
    onError: (err, _vars, ctx) => {
      // Already decided elsewhere (another tab, the customer cancelled, the timeout): the
      // card really is gone, so don't resurrect it — the refetch below settles the rest.
      if (err?.code !== "ORDER_ALREADY_DECIDED" && ctx?.previous) {
        qc.setQueryData(key, ctx.previous);
      }
    },
    onSettled: () => {
      // The inbox, and every other order list, which now shows it accepted/cancelled.
      qc.invalidateQueries({ queryKey: orderKeys.all(restaurantId) });
    },
  });
}

export function useAcceptOrder(restaurantId) {
  return useDecision(restaurantId, ({ orderId }) =>
    ownerApi.acceptOrder(restaurantId, orderId).then((r) => r.data.data.order),
  );
}

export function useRejectOrder(restaurantId) {
  return useDecision(restaurantId, ({ orderId, reason }) =>
    ownerApi.rejectOrder(restaurantId, orderId, reason).then((r) => r.data.data.order),
  );
}
