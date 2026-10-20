// The bank account settlements are paid into — GET/PUT /owner/:rId/payout-account — and the
// payout schedule around it (GET /owner/:rId/payments/settings).
//
// The account endpoints work at any approvalStatus, so an owner can add the account while
// the application is still under review. The payments endpoint is for approved restaurants
// only (403 RESTAURANT_NOT_APPROVED otherwise), so its query waits for approval.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ownerApi } from "@/api/owner.api";
import { documentKeys } from "./useDocuments";

export const payoutAccountKeys = {
  account: (rId) => ["payout-account", rId],
  paymentSettings: (rId) => ["payments", rId, "settings"],
};

export function usePayoutAccount(restaurantId) {
  return useQuery({
    queryKey: payoutAccountKeys.account(restaurantId),
    queryFn: () =>
      ownerApi.getPayoutAccount(restaurantId).then((r) => r.data.data.account),
    enabled: !!restaurantId,
    staleTime: 60_000,
  });
}

// { account, frequency, nextScheduledPayout | null } — the next payout exactly as an admin
// scheduled it. Null until one is scheduled; the page then says so rather than guessing a day.
export function usePaymentSettings(restaurantId, { enabled = true } = {}) {
  return useQuery({
    queryKey: payoutAccountKeys.paymentSettings(restaurantId),
    queryFn: () =>
      ownerApi.getPaymentSettings(restaurantId).then((r) => r.data.data),
    enabled: !!restaurantId && enabled,
    staleTime: 60_000,
  });
}

// Resolves to { account, changed, changeRequested, message } — `message` is the server's own
// summary of what happened (saved / change requested / request withdrawn / no changes).
export function useSavePayoutAccount(restaurantId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body) =>
      ownerApi
        .savePayoutAccount(restaurantId, body)
        .then((r) => ({ ...r.data.data, message: r.data.message })),
    onSuccess: ({ account }) => {
      if (account)
        qc.setQueryData(payoutAccountKeys.account(restaurantId), account);
      qc.invalidateQueries({
        queryKey: payoutAccountKeys.paymentSettings(restaurantId),
      });
      // The proof document's link to the account is set on save.
      qc.invalidateQueries({ queryKey: documentKeys.all(restaurantId) });
    },
  });
}
