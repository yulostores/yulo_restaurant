import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { staffApi } from "@/api/staff.api";

export const kitchenKeys = {
  queue: (rId) => ["kitchen", rId, "queue"],
  board: (rId) => ["kitchen", rId, "board"],
  order: (rId, orderId) => ["kitchen", rId, "order", orderId],
};

// Orders in "placed" or "confirmed", oldest first.
export function useKitchenQueue(restaurantId) {
  return useQuery({
    queryKey: kitchenKeys.queue(restaurantId),
    queryFn: () => staffApi.getQueue(restaurantId).then((r) => r.data.data.orders ?? []),
    enabled: !!restaurantId,
    refetchInterval: 10_000,
    staleTime: 0,
  });
}

// Kanban buckets — the server returns { placed, confirmed, preparing, ready }.
export function useKitchenBoard(restaurantId) {
  return useQuery({
    queryKey: kitchenKeys.board(restaurantId),
    queryFn: () =>
      staffApi.getBoard(restaurantId).then((r) => {
        const d = r.data.data ?? {};
        return {
          placed:    d.placed    ?? [],
          confirmed: d.confirmed ?? [],
          preparing: d.preparing ?? [],
          ready:     d.ready     ?? [],
        };
      }),
    enabled: !!restaurantId,
    refetchInterval: 10_000,
    staleTime: 0,
  });
}

export function useKitchenOrder(restaurantId, orderId) {
  return useQuery({
    queryKey: kitchenKeys.order(restaurantId, orderId),
    queryFn: () => staffApi.getOrderDetail(restaurantId, orderId).then((r) => r.data.data.order),
    enabled: !!restaurantId && !!orderId,
  });
}

// Status writes use optimistic concurrency control: the caller must send the
// status it currently sees. On 409 CONCURRENT_UPDATE the api layer refetches
// and retries once before surfacing the error.
export function useUpdateOrderStatus(restaurantId) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: ({ orderId, currentStatus, newStatus }) =>
      staffApi.updateOrderStatusWithRetry(restaurantId, orderId, currentStatus, newStatus),

    onMutate: async ({ orderId, newStatus }) => {
      await qc.cancelQueries({ queryKey: kitchenKeys.board(restaurantId) });
      await qc.cancelQueries({ queryKey: kitchenKeys.queue(restaurantId) });

      const prevBoard = qc.getQueryData(kitchenKeys.board(restaurantId));
      const prevQueue = qc.getQueryData(kitchenKeys.queue(restaurantId));

      qc.setQueryData(kitchenKeys.board(restaurantId), (old) => {
        if (!old) return old;
        const all = [
          ...(old.placed ?? []),
          ...(old.confirmed ?? []),
          ...(old.preparing ?? []),
          ...(old.ready ?? []),
        ].map((o) => (String(o._id) === String(orderId) ? { ...o, status: newStatus } : o));

        return {
          placed:    all.filter((o) => o.status === "placed"),
          confirmed: all.filter((o) => o.status === "confirmed"),
          preparing: all.filter((o) => o.status === "preparing"),
          ready:     all.filter((o) => o.status === "ready"),
        };
      });

      // The queue only holds placed/confirmed — drop the order once it moves on.
      if (!["placed", "confirmed"].includes(newStatus)) {
        qc.setQueryData(kitchenKeys.queue(restaurantId), (old) =>
          (old ?? []).filter((o) => String(o._id) !== String(orderId)),
        );
      }

      return { prevBoard, prevQueue };
    },

    onError: (_err, _vars, ctx) => {
      if (ctx?.prevBoard) qc.setQueryData(kitchenKeys.board(restaurantId), ctx.prevBoard);
      if (ctx?.prevQueue) qc.setQueryData(kitchenKeys.queue(restaurantId), ctx.prevQueue);
    },

    onSettled: () => {
      qc.invalidateQueries({ queryKey: kitchenKeys.board(restaurantId) });
      qc.invalidateQueries({ queryKey: kitchenKeys.queue(restaurantId) });
    },
  });
}
