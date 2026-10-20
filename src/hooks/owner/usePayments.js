// The Payments & Payouts screens (/payments…) — GET /owner/:rId/payments/{overview, history,
// statements/:id, orders/:id, bills/:id}. Approved restaurants only (the routes sit behind
// ApprovalGate). Read-only: nothing here changes money; an admin schedules and pays.
import { keepPreviousData, useMutation, useQuery } from "@tanstack/react-query";
import { ownerApi } from "@/api/owner.api";

export const paymentKeys = {
  overview: (rId, params) => ["payments", rId, "overview", params],
  history: (rId, params) => ["payments", rId, "history", params],
  statement: (rId, id) => ["payments", rId, "statement", id],
  order: (rId, kind, id) => ["payments", rId, kind, id],
};

// Drops empty filters so "all" and "unset" share one cache entry.
const clean = (params) =>
  Object.fromEntries(
    Object.entries(params ?? {}).filter(([, v]) => v != null && v !== ""),
  );

export function usePaymentsOverview(restaurantId, params) {
  const p = clean(params);
  return useQuery({
    queryKey: paymentKeys.overview(restaurantId, p),
    queryFn: () =>
      ownerApi.getPaymentsOverview(restaurantId, p).then((r) => r.data.data),
    enabled: !!restaurantId,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
}

export function usePayoutHistory(restaurantId, params) {
  const p = clean(params);
  return useQuery({
    queryKey: paymentKeys.history(restaurantId, p),
    queryFn: () =>
      ownerApi.getPayoutHistory(restaurantId, p).then((r) => r.data.data),
    enabled: !!restaurantId,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
}

export function usePaymentStatement(restaurantId, statementId) {
  return useQuery({
    queryKey: paymentKeys.statement(restaurantId, statementId),
    queryFn: () =>
      ownerApi
        .getPaymentStatement(restaurantId, statementId)
        .then((r) => r.data.data),
    enabled: !!restaurantId && !!statementId,
    staleTime: 30_000,
  });
}

// kind: "order" | "bill"
export function useOrderPayment(restaurantId, kind, id) {
  return useQuery({
    queryKey: paymentKeys.order(restaurantId, kind, id),
    queryFn: () =>
      (kind === "bill"
        ? ownerApi.getBillPayment(restaurantId, id)
        : ownerApi.getOrderPayment(restaurantId, id)
      ).then((r) => r.data.data),
    enabled: !!restaurantId && !!id,
    staleTime: 30_000,
  });
}

// Downloads the statement's CSV as a file.
export function useExportStatementCsv(restaurantId) {
  return useMutation({
    mutationFn: async ({ statementId, filename }) => {
      const blob = await ownerApi.exportStatementCsv(restaurantId, statementId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    },
  });
}

// Saves a blob as a file.
function saveFile(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Downloads a weekly statement's PDF. Pass the statement id.
export function useStatementPdf(restaurantId) {
  return useMutation({
    mutationFn: async (statementId) => {
      const { blob, filename } = await ownerApi.downloadStatementPdf(
        restaurantId,
        statementId,
      );
      saveFile(blob, filename ?? `yulo-statement-${statementId}.pdf`);
    },
  });
}

// Downloads one order's (or dine-in bill's) payment statement PDF. Pass { kind, id }.
export function usePaymentPdf(restaurantId) {
  return useMutation({
    mutationFn: async ({ kind, id }) => {
      const { blob, filename } = await ownerApi.downloadPaymentPdf(
        restaurantId,
        kind,
        id,
      );
      saveFile(
        blob,
        filename ?? `yulo-${kind === "bill" ? "bill" : "order"}-${id}.pdf`,
      );
    },
  });
}

// What to tell the owner when a PDF download fails: a 404 means this server doesn't produce the
// PDF (yet) — the CSV still works; anything else is a retry.
export function pdfErrorMessage(err) {
  const status = err?.response?.status ?? err?.status;
  return status === 404
    ? "The PDF isn't available yet. Use Download CSV for now."
    : "Couldn't download the PDF. Please try again.";
}
