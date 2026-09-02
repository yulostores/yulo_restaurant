// The six compliance documents admin reviews, one upload slot each.
//
// Store Settings has always captured the *numbers* off these documents (FSSAI, GST, PAN,
// registration) while the super admin's review panel asked for the documents themselves —
// so every store showed "0/6 Documents Uploaded" there with no way for an owner to change
// that. This is that missing half: what an owner uploads here is what a reviewer opens
// there, with the same per-document verified / rejected state read back on both sides.

import { useCallback, useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Eye,
  FileText,
  Loader2,
  Trash2,
  Upload,
  XCircle,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import DocumentViewer, { documentFileName } from "@/components/DocumentViewer";
import {
  ALLOWED_DOCUMENT_TYPES,
  DOCUMENT_TYPES,
  MAX_DOCUMENT_BYTES,
  useDeleteDocument,
  useDocuments,
  useUploadDocument,
} from "@/hooks/owner/useDocuments";
import { ownerApi } from "@/api/owner.api";
import { errorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";

const STATUS_STYLES = {
  verified: {
    label: "Verified",
    icon: CheckCircle2,
    className: "border border-[#BFE3CB] bg-[#F1F9F3] text-[#2E7D32]",
  },
  rejected: {
    label: "Rejected",
    icon: XCircle,
    className: "border border-red-200 bg-red-50 text-brand-maroon",
  },
  pending: {
    label: "Under review",
    icon: AlertCircle,
    className: "border border-[#F5C99B] bg-[#FFF7ED] text-[#D9480F]",
  },
};

function StatusPill({ status }) {
  const style = STATUS_STYLES[status] ?? STATUS_STYLES.pending;
  const Icon = style.icon;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold",
        style.className,
      )}
    >
      <Icon className="h-3 w-3" />
      {style.label}
    </span>
  );
}

const formatBytes = (bytes) =>
  bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;

function DocumentRow({ definition, doc, onUpload, onDelete, onView, busy, error }) {
  const inputRef = useRef(null);
  // A verified document is settled — the server answers 409 to a replacement, so the
  // controls that would produce one are not offered.
  const locked = doc?.status === "verified";

  return (
    <div
      className={cn(
        "rounded-xl border px-3 py-3",
        doc?.status === "rejected"
          ? "border-red-200 bg-red-50/60"
          : "border-brand-cream/70",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2.5">
          <span
            className={cn(
              "mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg",
              doc?.url
                ? "bg-brand-cream/60 text-brand-maroon"
                : "bg-brand-cream/25 text-muted-foreground",
            )}
          >
            <FileText className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{definition.label}</p>
            <p className="truncate text-xs text-muted-foreground">
              {doc?.url ? documentFileName(doc) : definition.hint}
            </p>
          </div>
        </div>
        {doc?.url ? <StatusPill status={doc.status} /> : null}
      </div>

      {doc?.status === "rejected" ? (
        <p className="mt-2 text-xs text-brand-maroon">
          This document was rejected during review. Upload a clearer or corrected copy — it
          goes straight back into review.
        </p>
      ) : null}
      {error ? <p className="mt-2 text-xs text-brand-maroon">{error}</p> : null}

      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <input
          ref={inputRef}
          type="file"
          accept={ALLOWED_DOCUMENT_TYPES.join(",")}
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            // Reset first: picking the same file twice in a row fires no change event
            // otherwise, which makes a retry after a failed upload look like a dead button.
            e.target.value = "";
            if (file) onUpload(file);
          }}
        />
        {doc?.url ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={onView}
            className="h-8 gap-1.5 px-2.5 text-xs"
          >
            <Eye className="h-3.5 w-3.5" /> View
          </Button>
        ) : null}
        {locked ? null : (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
            className="h-8 gap-1.5 px-2.5 text-xs"
          >
            {busy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Upload className="h-3.5 w-3.5" />
            )}
            {busy ? "Uploading…" : doc?.url ? "Replace" : "Upload"}
          </Button>
        )}
        {doc?.url && !locked ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={onDelete}
            className="h-8 gap-1.5 px-2.5 text-xs text-brand-maroon hover:bg-red-50"
          >
            <Trash2 className="h-3.5 w-3.5" /> Remove
          </Button>
        ) : null}
      </div>
    </div>
  );
}

export default function ComplianceDocuments({ restaurantId, className }) {
  const { data: documents = [], isLoading, isError } = useDocuments(restaurantId);
  const uploadMutation = useUploadDocument(restaurantId);
  const deleteMutation = useDeleteDocument(restaurantId);

  // Which document type a request is in flight for, so only that row shows a spinner.
  const [busyType, setBusyType] = useState(null);
  // Per-row error keyed by document type — a size/type rejection belongs next to the row
  // that caused it, not in a banner at the top of the card.
  const [errors, setErrors] = useState({});
  // Only the document *type* is held: verifying or replacing refetches the list, and a
  // snapshotted copy would keep the viewer pointed at the previous file.
  const [viewingType, setViewingType] = useState(null);

  const byType = Object.fromEntries(documents.map((d) => [d.type, d]));
  const viewedDoc = viewingType ? byType[viewingType] : null;
  const viewedDefinition = viewingType
    ? DOCUMENT_TYPES.find((d) => d.type === viewingType)
    : null;

  // Stable across renders so the viewer doesn't refetch the file on every keystroke
  // elsewhere on the page — it reloads only when the document being viewed changes.
  const viewedDocId = viewedDoc?._id;
  const fetchViewedFile = useCallback(
    () => ownerApi.getDocumentFile(restaurantId, viewedDocId),
    [restaurantId, viewedDocId],
  );

  const uploadedCount = DOCUMENT_TYPES.filter(({ type }) => byType[type]?.url).length;
  const verifiedCount = DOCUMENT_TYPES.filter(
    ({ type }) => byType[type]?.status === "verified",
  ).length;

  const setError = (type, message) =>
    setErrors((prev) => ({ ...prev, [type]: message || undefined }));

  const handleUpload = async (type, file) => {
    // Checked here as well as on the server so an oversized or wrong-typed pick fails
    // instantly instead of after a full upload.
    if (!ALLOWED_DOCUMENT_TYPES.includes(file.type)) {
      setError(type, "Upload a JPG, PNG, WebP or PDF file.");
      return;
    }
    if (file.size > MAX_DOCUMENT_BYTES) {
      setError(type, `That file is ${formatBytes(file.size)}. The limit is 5 MB.`);
      return;
    }
    setError(type, null);
    setBusyType(type);
    try {
      await uploadMutation.mutateAsync({ type, file });
    } catch (err) {
      setError(type, errorMessage(err, "Upload failed. Please try again."));
    } finally {
      setBusyType(null);
    }
  };

  const handleDelete = async (type, docId) => {
    setError(type, null);
    setBusyType(type);
    try {
      await deleteMutation.mutateAsync(docId);
    } catch (err) {
      setError(type, errorMessage(err, "Could not remove that document."));
    } finally {
      setBusyType(null);
    }
  };

  return (
    <Card className={className}>
      <CardHeader className="flex-row items-start justify-between space-y-0 pb-4">
        <div>
          <h2 className="text-base font-bold">Compliance Documents</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Upload a scan or photo of each document. Our team reviews them and marks each
            one verified — this is what your approval is decided on.
          </p>
        </div>
        <p className="shrink-0 pl-3 text-right text-xs leading-tight text-muted-foreground">
          <span className="text-sm font-bold text-brand-dark">
            {uploadedCount}/{DOCUMENT_TYPES.length}
          </span>
          <br />
          uploaded
          {uploadedCount > 0 ? (
            <>
              <br />
              <span className="text-[#2E7D32]">{verifiedCount} verified</span>
            </>
          ) : null}
        </p>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading documents…</p>
        ) : isError ? (
          <p className="text-sm text-brand-maroon">
            Could not load your documents. Refresh the page to try again.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
            {DOCUMENT_TYPES.map((definition) => {
              const doc = byType[definition.type];
              return (
                <DocumentRow
                  key={definition.type}
                  definition={definition}
                  doc={doc}
                  busy={busyType === definition.type}
                  error={errors[definition.type]}
                  onUpload={(file) => handleUpload(definition.type, file)}
                  onDelete={() => handleDelete(definition.type, doc?._id)}
                  onView={() => setViewingType(definition.type)}
                />
              );
            })}
          </div>
        )}
        <p className="mt-3 text-[11px] text-muted-foreground">
          JPG, PNG, WebP or PDF · up to 5 MB each. Uploading again replaces the previous
          file and sends it back for review. A verified document can only be changed by
          platform support.
        </p>
      </CardContent>

      <DocumentViewer
        open={!!viewedDoc}
        title={viewedDefinition?.label}
        doc={viewedDoc}
        fetchFile={fetchViewedFile}
        onClose={() => setViewingType(null)}
      />
    </Card>
  );
}
