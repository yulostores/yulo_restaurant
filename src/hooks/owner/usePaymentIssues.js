// Payment issues (/payments/issues…) — GET/POST /owner/:rId/payment-issues. A ticket never
// changes a payout; it is the restaurant's line to Yulo support about one.
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { ownerApi } from "@/api/owner.api";

export const paymentIssueKeys = {
  all: (rId) => ["payment-issues", rId],
  list: (rId, params) => ["payment-issues", rId, "list", params],
  detail: (rId, id) => ["payment-issues", rId, "detail", id],
};

export function usePaymentIssues(restaurantId, params) {
  const p = Object.fromEntries(
    Object.entries(params ?? {}).filter(([, v]) => v != null && v !== ""),
  );
  return useQuery({
    queryKey: paymentIssueKeys.list(restaurantId, p),
    queryFn: () =>
      ownerApi.listPaymentIssues(restaurantId, p).then((r) => r.data.data),
    enabled: !!restaurantId,
    placeholderData: keepPreviousData,
    staleTime: 15_000,
  });
}

// Polls while open, so support's replies show up without a reload.
export function usePaymentIssue(restaurantId, ticketId) {
  return useQuery({
    queryKey: paymentIssueKeys.detail(restaurantId, ticketId),
    queryFn: () =>
      ownerApi
        .getPaymentIssue(restaurantId, ticketId)
        .then((r) => r.data.data.ticket),
    enabled: !!restaurantId && !!ticketId,
    refetchInterval: (query) =>
      query.state.data?.status === "resolved" ? false : 30_000,
  });
}

// fields: { issueType, description, contactEmail, contactPhone?, settlementId? | orderId? | billId? }
export function useCreatePaymentIssue(restaurantId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ fields, file }) =>
      ownerApi
        .createPaymentIssue(restaurantId, fields, file)
        .then((r) => r.data.data.ticket),
    onSuccess: (ticket) => {
      qc.setQueryData(
        paymentIssueKeys.detail(restaurantId, ticket._id),
        ticket,
      );
      qc.invalidateQueries({
        queryKey: ["payment-issues", restaurantId, "list"],
      });
    },
  });
}

export function useAddPaymentIssueMessage(restaurantId, ticketId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ text, file }) =>
      ownerApi
        .addPaymentIssueMessage(restaurantId, ticketId, text, file)
        .then((r) => r.data.data.ticket),
    onSuccess: (ticket) => {
      qc.setQueryData(paymentIssueKeys.detail(restaurantId, ticketId), ticket);
      qc.invalidateQueries({
        queryKey: ["payment-issues", restaurantId, "list"],
      });
    },
  });
}

// Opens an attachment in a new tab from the bytes the API streams (no storage URL ever).
export function useOpenAttachment(restaurantId, ticketId) {
  return useMutation({
    mutationFn: async ({ attachmentId }) => {
      // Open the tab synchronously (inside the click) so a popup blocker allows it, then
      // point it at the file once it has arrived.
      const tab = window.open("", "_blank");
      try {
        const blob = await ownerApi.getPaymentIssueAttachment(
          restaurantId,
          ticketId,
          attachmentId,
        );
        const url = URL.createObjectURL(blob);
        if (tab) tab.location.href = url;
        else window.location.assign(url);
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
      } catch (err) {
        tab?.close();
        throw err;
      }
    },
  });
}
