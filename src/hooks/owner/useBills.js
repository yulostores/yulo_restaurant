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
  const qc = useQueryClient();
  const mutation = useBillMutation(restaurantId, ({ billId, method, expectedTotal }) =>
    ownerApi.markBillPaid(restaurantId, billId, method, expectedTotal),
  );
  // A refused settle because the bill moved on: fetch it again so the new total is on screen.
  return {
    ...mutation,
    mutateAsync: (vars) =>
      mutation.mutateAsync(vars).catch((err) => {
        if (err?.code === "BILL_TOTAL_CHANGED") qc.invalidateQueries({ queryKey: ["bills", restaurantId] });
        throw err;
      }),
  };
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

// ── Generating and editing a bill (owner) ─────────────────────────────

export function useOpenTables(restaurantId) {
  return useQuery({
    queryKey: ["bills", restaurantId, "open-tables"],
    queryFn: () => ownerApi.listOpenTables(restaurantId).then((r) => r.data.data.tables ?? []),
    enabled: !!restaurantId,
    staleTime: 15_000,
    refetchInterval: 30_000,
  });
}

export function useGenerateBill(restaurantId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ sessionId }) => ownerApi.generateBill(restaurantId, sessionId).then((r) => r.data.data.bill),
    onSuccess: (bill) => {
      if (bill?._id) qc.setQueryData(billKeys.one(restaurantId, bill._id), bill);
      qc.invalidateQueries({ queryKey: ["bills", restaurantId] });
    },
  });
}

export function useEditBillItem(restaurantId) {
  return useBillMutation(restaurantId, ({ billId, orderId, lineIndex, quantity }) =>
    ownerApi.editBillItem(restaurantId, billId, { orderId, lineIndex, quantity }),
  );
}

export function useSetBillDiscount(restaurantId) {
  return useBillMutation(restaurantId, ({ billId, type, value }) =>
    ownerApi.setBillDiscount(restaurantId, billId, { type, value }),
  );
}

export function useSetBillServiceCharge(restaurantId) {
  return useBillMutation(restaurantId, ({ billId, enabled }) =>
    ownerApi.setBillServiceCharge(restaurantId, billId, { enabled }),
  );
}
