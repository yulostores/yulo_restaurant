import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ownerApi } from "@/api/owner.api";

export const billKeys = {
  list:    (rId, p={}) => ["bills", rId, "list", p],
  one:     (rId, id)   => ["bills", rId, "bill", id],
  byOrder: (rId, id)   => ["bills", rId, "for-order", id],
};

// params: { status: "open" | "paid", type, tableNumber, from, to, q, page, limit }
export function useBills(restaurantId, params = {}) {
  return useQuery({
    queryKey: billKeys.list(restaurantId, params),
    queryFn: () => ownerApi.listBills(restaurantId, params).then((r) => r.data.data.bills ?? []),
    enabled: !!restaurantId,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

export function useBill(restaurantId, billId) {
  return useQuery({
    queryKey: billKeys.one(restaurantId, billId),
    queryFn: () => ownerApi.getBill(restaurantId, billId).then((r) => r.data.data.bill),
    enabled: !!restaurantId && !!billId,
    staleTime: 30_000,
  });
}

// Counter settlement and payment release both hand back the updated bill; the list and any
// order → bill lookups are refreshed behind it.
function useBillMutation(restaurantId, call) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: call,
    onSuccess: (res, { billId }) => {
      const bill = res?.data?.data?.bill;
      if (bill) qc.setQueryData(billKeys.one(restaurantId, billId), bill);
      qc.invalidateQueries({ queryKey: ["bills", restaurantId] });
    },
  });
}

export function useMarkBillPaid(restaurantId) {
  return useBillMutation(restaurantId, ({ billId, method }) =>
    ownerApi.markBillPaid(restaurantId, billId, method),
  );
}

export function useReleaseBillPayment(restaurantId) {
  return useBillMutation(restaurantId, ({ billId }) =>
    ownerApi.releaseBillPayment(restaurantId, billId),
  );
}

// The bill a given order landed on. `null` (not an error) while the sitting is unbilled,
// which the caller renders as "not billed yet" — see screens/BillDetails.jsx.
export function useBillForOrder(restaurantId, orderId) {
  return useQuery({
    queryKey: billKeys.byOrder(restaurantId, orderId),
    queryFn: () =>
      ownerApi.getBillForOrder(restaurantId, orderId).then((r) => r.data.data.bill ?? null),
    enabled: !!restaurantId && !!orderId,
    staleTime: 30_000,
  });
}
