// Compliance documents — GET/POST/DELETE /owner/:rId/documents.
//
// Each document type has one slot: uploading again replaces what is there and puts it
// back into review, so the mutations below refresh the whole list rather than patching a
// single entry. The settings cache is invalidated alongside it because the restaurant
// record the rest of Store Settings reads carries the same `documents` array.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ownerApi } from "@/api/owner.api";
import { settingsKeys } from "./useSettings";

export const documentKeys = {
  all: (rId) => ["documents", rId],
};

// The six documents admin reviews, in the order they are reviewed. Mirrors
// DOCUMENT_TYPES in server/controllers/owner/document.controller.js and
// STORE_DOCUMENT_TYPES in the super admin portal — the type strings are the contract
// between all three, so a label may be reworded here but a `type` may not.
export const DOCUMENT_TYPES = [
  {
    type: "fssai_license",
    label: "FSSAI License",
    hint: "The food safety licence certificate matching your FSSAI number.",
  },
  {
    type: "business_registration",
    label: "Business Registration",
    hint: "Incorporation certificate, shop & establishment or trade licence.",
  },
  {
    type: "gst_certificate",
    label: "GST Certificate",
    hint: "GST registration certificate (Form REG-06).",
  },
  {
    type: "pan_card",
    label: "Identity Proof (PAN)",
    hint: "PAN card of the legal entity or proprietor.",
  },
  {
    type: "address_proof",
    label: "Address Proof",
    hint: "Utility bill, rent agreement or property tax receipt for the outlet.",
  },
  {
    type: "bank_statement",
    label: "Bank Statement",
    hint: "Cancelled cheque or a recent statement showing the payout account.",
  },
];

// Mirrors the middleware ceiling and filter on POST /owner/:rId/documents, so a bad pick
// fails in the browser instead of costing an upload round trip.
export const MAX_DOCUMENT_BYTES = 5 * 1024 * 1024;
export const ALLOWED_DOCUMENT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
];

export function useDocuments(restaurantId) {
  return useQuery({
    queryKey: documentKeys.all(restaurantId),
    queryFn: () =>
      ownerApi.getDocuments(restaurantId).then((r) => r.data.data.documents ?? []),
    enabled: !!restaurantId,
    staleTime: 60_000,
  });
}

export function useUploadDocument(restaurantId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ type, file }) => ownerApi.uploadDocument(restaurantId, type, file),
    onSuccess: ({ data }) => {
      const documents = data.data?.documents;
      if (documents) qc.setQueryData(documentKeys.all(restaurantId), documents);
      qc.invalidateQueries({ queryKey: settingsKeys.all(restaurantId) });
    },
  });
}

export function useDeleteDocument(restaurantId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (docId) => ownerApi.deleteDocument(restaurantId, docId),
    onSuccess: ({ data }) => {
      const documents = data.data?.documents;
      if (documents) qc.setQueryData(documentKeys.all(restaurantId), documents);
      qc.invalidateQueries({ queryKey: settingsKeys.all(restaurantId) });
    },
  });
}
