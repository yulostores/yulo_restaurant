// Full-screen preview for an uploaded compliance document.
//
// The file is fetched through the API as a Blob and shown from an object URL — it is never
// pointed at its storage URL. That is not a preference:
//
//   * Cloudinary refuses to deliver PDFs unless the account opts in ("Allow delivery of
//     PDF and ZIP files", off by default), answering 401 for the file's own URL. Signing
//     the URL does not lift it.
//   * Raw-uploaded files it will deliver, but as `application/octet-stream`, which a
//     browser downloads instead of rendering — so an <iframe> stays blank either way.
//   * A storage URL is readable by anyone who has it, and these are the owner's FSSAI
//     licence, PAN card and bank statement.
//
// The server (services/restaurantDocument.service.js) streams the bytes back with their
// real content type, having authorised the caller's session first.

import { useCallback, useEffect, useState } from "react";
import { Download, Loader2, RefreshCw, X } from "lucide-react";

// The stored `mimeType` is authoritative; documents uploaded before that field existed
// fall back to the URL's extension. Cloudinary serves PDFs from an /image/upload path, so
// the path segment says nothing — only the extension does.
export function isPdfDocument(doc) {
  if (!doc) return false;
  if (doc.mimeType) return doc.mimeType === "application/pdf";
  return /\.pdf($|\?)/i.test(doc.url ?? "");
}

export function documentFileName(doc) {
  if (!doc) return null;
  if (doc.name) return doc.name;
  // Last path segment of the storage URL, query string stripped.
  const segment = (doc.url ?? "").split("?")[0].split("/").pop();
  return segment || null;
}

// What the owner is shown when the preview fails.
//
// Never the raw error. A failure here surfaces as anything from "Request failed with
// status code 504" to a JSON parse error on a gateway's HTML error page — none of which
// an owner can act on, and all of which read as the app being broken rather than as one
// file being temporarily unreachable. The technical detail goes to the console (and, for
// anything server-side, to the server's own log under the same request) instead.
//
// The server's message is only trusted when the error carries an API `code`, which is
// what says it came from our own error envelope rather than from axios or a proxy.
const GENERIC_PREVIEW_ERROR =
  "Sorry, we couldn't preview this document right now. Please try again in a moment.";

const PREVIEW_ERRORS = {
  DOCUMENT_MISSING: "This document is no longer available. Please upload it again.",
  NOT_FOUND: "This document is no longer available. Please upload it again.",
  // The owner's session ended; the portal signs them out on its own, so say only enough
  // to explain the empty panel in the meantime.
  UNAUTHORIZED: "Your session has expired. Please sign in again.",
  TOKEN_EXPIRED: "Your session has expired. Please sign in again.",
};

function previewErrorMessage(err) {
  if (PREVIEW_ERRORS[err?.code]) return PREVIEW_ERRORS[err.code];
  if (err?.code && err?.message) return err.message;
  return GENERIC_PREVIEW_ERROR;
}

/**
 * Loads the document's bytes and hands back an object URL for them.
 *
 * @param {(() => Promise<Blob>) | null} fetchFile fetcher for the open document, or null
 *                                                when the viewer is closed
 * @param {number} attempt bumped to retry the same document
 */
function useDocumentObjectUrl(fetchFile, attempt) {
  const [state, setState] = useState({ url: null, loading: false, error: null });

  useEffect(() => {
    if (!fetchFile) {
      setState({ url: null, loading: false, error: null });
      return;
    }
    let objectUrl = null;
    let cancelled = false;
    setState({ url: null, loading: true, error: null });

    fetchFile()
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setState({ url: objectUrl, loading: false, error: null });
      })
      .catch((err) => {
        if (cancelled) return;
        // Kept out of the UI but not thrown away: this is what makes a support report
        // ("it says try again") traceable back to a status code.
        console.error("[DocumentViewer] preview failed", {
          status: err?.status,
          code: err?.code,
          message: err?.message,
        });
        setState({ url: null, loading: false, error: previewErrorMessage(err) });
      });

    // Revoked on close and on every swap — an owner clicking through six documents would
    // otherwise leak a blob per open, each holding the whole file in memory.
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [fetchFile, attempt]);

  return state;
}

export default function DocumentViewer({ open, title, doc, fetchFile, onClose }) {
  // Escape closes it — this covers the whole screen, and a viewer with no keyboard exit
  // traps anyone not reaching for the mouse.
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // A failed preview is usually transient (a slow storage fetch, a dropped connection), so
  // the owner gets a retry in place rather than having to close and reopen the viewer.
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  useEffect(() => setAttempt(0), [doc?._id]);

  const active = open && !!doc?.url;
  const { url, loading, error } = useDocumentObjectUrl(active ? fetchFile : null, attempt);

  if (!active) return null;

  const isPdf = isPdfDocument(doc);
  const fileName = documentFileName(doc);

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black/80 p-3 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={title ?? "Document preview"}
      // Click the backdrop to dismiss, but not a click that started inside the panel.
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="mx-auto flex h-full w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between gap-3 border-b border-brand-cream/60 px-4 py-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-bold">{title ?? "Document"}</p>
            {fileName ? (
              <p className="truncate text-xs text-muted-foreground">{fileName}</p>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {/* Downloads the already-fetched copy — there is no shareable storage link
                to offer, by design. */}
            {url ? (
              <a
                href={url}
                download={fileName ?? "document"}
                title="Download"
                className="grid h-8 w-8 place-items-center rounded-lg border border-brand-cream text-brand-dark hover:bg-brand-cream/30"
              >
                <Download className="h-4 w-4" />
              </a>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              title="Close"
              className="grid h-8 w-8 place-items-center rounded-lg border border-brand-cream text-brand-dark hover:bg-brand-cream/30"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto bg-brand-cream/20 p-3">
          {loading ? (
            <div className="flex h-full min-h-[60vh] flex-col items-center justify-center gap-2 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              <p className="text-sm">Loading document…</p>
            </div>
          ) : error ? (
            <div className="flex h-full min-h-[60vh] flex-col items-center justify-center gap-3 px-6">
              <p className="max-w-sm text-center text-sm text-brand-maroon">{error}</p>
              <button
                type="button"
                onClick={retry}
                className="inline-flex items-center gap-1.5 rounded-lg border border-brand-cream px-3 py-1.5 text-xs font-semibold text-brand-dark hover:bg-brand-cream/30"
              >
                <RefreshCw className="h-3.5 w-3.5" /> Try again
              </button>
            </div>
          ) : isPdf ? (
            <iframe
              src={url}
              title={title ?? "Document"}
              className="h-full min-h-[60vh] w-full rounded-lg border border-brand-cream/60 bg-white"
            />
          ) : (
            <div className="flex h-full min-h-[60vh] items-center justify-center">
              <img
                src={url}
                alt={title ?? "Document"}
                className="max-h-full max-w-full rounded-lg object-contain"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
