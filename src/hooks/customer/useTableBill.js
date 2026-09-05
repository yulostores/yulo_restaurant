import { useQuery } from "@tanstack/react-query";
import { customerApi } from "@/api/customer.api";

export const tableBillKeys = {
  one: (restaurantId, tableId) => ["table-bill", restaurantId, tableId],
};

/**
 * The bill for the table this guest scanned into.
 *
 * The endpoint answers 404 while no session is open on the table — which is the normal
 * state before anyone has ordered, not a failure — so that case is mapped to `null` and
 * the screen renders "nothing on your bill yet" instead of an error. Polled while the
 * guest has it open, since the bill grows with every round the table orders.
 */
export function useTableBill(restaurantId, tableId) {
  return useQuery({
    queryKey: tableBillKeys.one(restaurantId, tableId),
    queryFn: () =>
      customerApi
        .getTableBill(restaurantId, tableId)
        .then((r) => r.data.data.bill ?? null)
        .catch((err) => {
          if (err.status === 404) return null;
          throw err;
        }),
    enabled: !!restaurantId && !!tableId,
    staleTime: 10_000,
    refetchInterval: 30_000,
  });
}
