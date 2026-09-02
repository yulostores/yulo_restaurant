// Store review drawer (/admin/stores → "Review"). Everything the owner submitted
// through the restaurant portal, so an admin approves or rejects on evidence
// rather than on a store name in a table row.
//
//   GET   /api/admin/stores/:id                   full document (ownerId populated)
//   PATCH /api/admin/stores/:id/approve           → approvalStatus "active"
//   PATCH /api/admin/stores/:id/reject { reason } → "rejected", reason shown to the owner
//   PATCH /api/admin/stores/:id/suspend | /reactivate
//   PATCH /api/admin/stores/:id/documents/:docId { status }
//   POST  /api/admin/stores/:id/notes { note }
//
// The owner portal polls GET /owner/restaurants while unapproved, so a decision
// made here reaches their screen within a minute (or on their next tab focus)
// without a re-login.

import { useCallback, useState } from "react";
import { X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  useAddStoreNote,
  useAdminStore,
  useStoreAction,
  useVerifyDocument,
} from "@/hooks/admin/useAdmin";
import DocumentViewer, { documentFileName } from "@/components/DocumentViewer";
import { adminApi } from "@/api/admin.api";
import { formatHhmm } from "@/lib/hours";

const STATUS_VARIANT = {
  active: "ok",
  pending: "warn",
  suspended: "info",
  rejected: "danger",
  expired: "muted",
  verified: "ok",
};

const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

const DOC_LABEL = {
  fssai_license: "FSSAI licence",
  business_registration: "Business registration",
  gst_certificate: "GST certificate",
  pan_card: "PAN card",
  address_proof: "Address proof",
  bank_statement: "Bank statement",
};

function formatDate(value) {
  if (!value) return "";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString();
}

function Row({ label, value }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-brand-cream/50 py-2 last:border-0">
      <span className="shrink-0 text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className="min-w-0 break-words text-right text-sm font-medium">{value || "—"}</span>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <section className="rounded-xl border border-brand-cream bg-white p-4">
      <h3 className="mb-1 text-sm font-bold">{title}</h3>
      {children}
    </section>
  );
}

// A store is only worth approving once the owner has filled in enough to trade
// on. Nothing here blocks approval — it is a checklist for the reviewer, since
// the server accepts an approve on any pending store.
function completeness(store) {
  const a = store.address ?? {};
  const s = store.settings ?? {};
  return [
    { label: "Restaurant name", ok: !!store.name },
    { label: "Street address", ok: !!a.street },
    { label: "City", ok: !!a.city },
    { label: "Pincode", ok: !!a.pincode },
    { label: "Map location", ok: (store.location?.coordinates ?? []).length === 2 },
    { label: "Contact phone", ok: !!store.phone },
    { label: "Contact email", ok: !!store.email },
    { label: "Cuisine types", ok: (store.cuisineTypes ?? []).length > 0 },
    { label: "Opening hours", ok: (store.operatingHours ?? []).length > 0 },
    { label: "Legal entity type", ok: !!s.legalEntityType },
    { label: "PAN number", ok: !!s.panNumber },
    { label: "GST number", ok: !!s.gstNumber },
    { label: "FSSAI / health permit", ok: !!s.healthPermitId },
  ];
}

export default function StoreReviewPanel({ storeId, onClose }) {
  const { data: store, isLoading, isError, error } = useAdminStore(storeId);
  const storeAction = useStoreAction();
  const addNote = useAddStoreNote();
  const verifyDoc = useVerifyDocument();

  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [actionError, setActionError] = useState("");
  // Held as a document *type* rather than the document itself, so verifying one keeps
  // the viewer in step with the refetched store instead of showing a stale status.
  const [viewingDocType, setViewingDocType] = useState(null);

  async function run(action, extra) {
    setActionError("");
    try {
      await storeAction.mutateAsync({ action, id: storeId, ...extra });
      // Approve/reject close the review out; suspend/reactivate keep it open.
      if (action === "approve" || action === "reject") onClose();
    } catch (err) {
      setActionError(err.message);
    }
  }

  async function submitRejection(e) {
    e.preventDefault();
    if (!reason.trim()) return;
    await run("reject", { reason: reason.trim() });
  }

  async function submitNote(e) {
    e.preventDefault();
    if (!note.trim()) return;
    setActionError("");
    try {
      await addNote.mutateAsync({ id: storeId, note: note.trim() });
      setNote("");
    } catch (err) {
      setActionError(err.message);
    }
  }

  const checklist = store ? completeness(store) : [];
  const missing = checklist.filter((c) => !c.ok);
  const settings = store?.settings ?? {};
  const hours = store?.operatingHours ?? [];
  const viewedDoc = viewingDocType
    ? (store?.documents ?? []).find((d) => d.type === viewingDocType)
    : null;
  const viewedDocId = viewedDoc?._id;
  // Stable identity so the viewer fetches the file once per document, not per render.
  const fetchViewedFile = useCallback(
    () => adminApi.getStoreDocumentFile(storeId, viewedDocId),
    [storeId, viewedDocId],
  );

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden="true" />

      <aside
        role="dialog"
        aria-label="Store review"
        className="relative flex h-full w-full max-w-2xl flex-col overflow-y-auto bg-brand-page shadow-2xl"
      >
        <header className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-brand-cream bg-brand-page px-5 py-4">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-bold">{store?.name ?? "Store review"}</h2>
            <p className="text-sm text-muted-foreground">
              {store
                ? `Submitted ${formatDate(store.submittedAt ?? store.createdAt) || "—"}${
                    store.reviewedAt ? ` · reviewed ${formatDate(store.reviewedAt)}` : ""
                  }`
                : "Loading…"}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {store ? (
              <Badge variant={STATUS_VARIANT[store.approvalStatus] ?? "muted"} className="capitalize">
                {store.approvalStatus}
              </Badge>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:bg-brand-cream/40"
              aria-label="Close review"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </header>

        <div className="flex flex-1 flex-col gap-4 px-5 py-5">
          {isLoading ? <p className="text-sm text-muted-foreground">Loading store…</p> : null}
          {isError ? (
            <p className="text-sm text-brand-maroon">Failed to load: {error.message}</p>
          ) : null}
          {actionError ? <p className="text-sm text-brand-maroon">{actionError}</p> : null}

          {store ? (
            <>
              {store.approvalStatus === "rejected" && store.rejectionReason ? (
                <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-brand-maroon">
                  <span className="font-semibold">Rejected: </span>
                  {store.rejectionReason}
                </p>
              ) : null}

              {/* The API has no resubmit endpoint — a rejected owner just re-saves
                  their store settings, which bumps updatedAt and nothing else.
                  This is the only signal that the application was corrected. */}
              {store.approvalStatus === "rejected" &&
              store.reviewedAt &&
              store.updatedAt &&
              new Date(store.updatedAt) > new Date(store.reviewedAt) ? (
                <p className="rounded-xl border border-[#F5C99B] bg-[#FFF7ED] px-4 py-3 text-sm">
                  The owner has edited their details since this rejection (last saved{" "}
                  {formatDate(store.updatedAt)}). Re-check the sections below before
                  deciding again.
                </p>
              ) : null}

              <Section title="Application checklist">
                <p className="mb-2 text-xs text-muted-foreground">
                  {missing.length === 0
                    ? "The owner has filled in every detail this review looks at."
                    : `${missing.length} of ${checklist.length} details are still blank — approving now lets the owner trade with an incomplete profile.`}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {checklist.map((c) => (
                    <span
                      key={c.label}
                      className={
                        c.ok
                          ? "rounded-full bg-emerald-50 px-2.5 py-1 text-xs text-emerald-700"
                          : "rounded-full bg-amber-50 px-2.5 py-1 text-xs text-amber-800"
                      }
                    >
                      {c.ok ? "✓" : "•"} {c.label}
                    </span>
                  ))}
                </div>
              </Section>

              <Section title="Owner">
                <Row label="Name" value={store.ownerId?.name} />
                <Row label="Email" value={store.ownerId?.email} />
                <Row label="Phone" value={store.ownerId?.phone} />
              </Section>

              <Section title="Restaurant">
                <Row label="Description" value={store.description} />
                <Row label="Cuisines" value={(store.cuisineTypes ?? []).join(", ")} />
                <Row label="Established" value={store.establishedYear} />
                <Row label="Public phone" value={store.phone} />
                <Row label="Public email" value={store.email} />
                <Row label="Website" value={store.website} />
                <Row label="Plan" value={store.plan} />
              </Section>

              <Section title="Address">
                <Row label="Street" value={store.address?.street} />
                <Row label="City" value={store.address?.city} />
                <Row label="State" value={store.address?.state} />
                <Row label="Pincode" value={store.address?.pincode} />
                <Row
                  label="Map point"
                  value={
                    (store.location?.coordinates ?? []).length === 2
                      // Stored as GeoJSON [lng, lat]; shown lat, lng.
                      ? `${store.location.coordinates[1]}, ${store.location.coordinates[0]}`
                      : ""
                  }
                />
              </Section>

              <Section title="Legal & licensing">
                <Row label="Legal entity" value={settings.legalEntityType} />
                <Row label="Owner on record" value={settings.ownerName} />
                <Row label="PAN" value={settings.panNumber} />
                <Row label="GST number" value={settings.gstNumber} />
                <Row label="FSSAI / health permit" value={settings.healthPermitId} />
                <Row label="Licence expiry" value={formatDate(settings.licenseExpiry)} />
                <Row label="Trade licence no." value={settings.registrationNo} />
                <Row label="Trade licence expiry" value={formatDate(settings.tradeLicenseExpiry)} />
              </Section>

              <Section title="Opening hours">
                {hours.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Not set yet.</p>
                ) : (
                  DAYS.map((day) => {
                    const h = hours.find((x) => x.day === day);
                    return (
                      <Row
                        key={day}
                        label={day}
                        value={
                          !h || !h.isOpen
                            ? "Closed"
                            : `${formatHhmm(h.openTime) || "—"} – ${formatHhmm(h.closeTime) || "—"}`
                        }
                      />
                    );
                  })
                )}
              </Section>

              <Section title="Documents">
                {(store.documents ?? []).length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Nothing uploaded yet. The owner uploads these from Store Settings →
                    Compliance Documents; until then, only the licence numbers above are
                    available to check against.
                  </p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {store.documents.map((d) => (
                      <li
                        key={d._id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-[#FCFAF7] px-3 py-2"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium">{DOC_LABEL[d.type] ?? d.type}</p>
                          {d.url ? (
                            <button
                              type="button"
                              onClick={() => setViewingDocType(d.type)}
                              className="text-xs text-blue-700 underline"
                            >
                              View {documentFileName(d)}
                            </button>
                          ) : null}
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant={STATUS_VARIANT[d.status] ?? "muted"} className="capitalize">
                            {d.status}
                          </Badge>
                          {d.status === "pending" ? (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={verifyDoc.isPending}
                                onClick={() =>
                                  verifyDoc.mutate({ id: storeId, docId: d._id, status: "verified" })
                                }
                              >
                                Verify
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={verifyDoc.isPending}
                                onClick={() =>
                                  verifyDoc.mutate({ id: storeId, docId: d._id, status: "rejected" })
                                }
                              >
                                Reject
                              </Button>
                            </>
                          ) : null}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </Section>

              <Section title="Internal notes">
                {(store.adminNotes ?? []).length === 0 ? (
                  <p className="mb-3 text-sm text-muted-foreground">No notes yet.</p>
                ) : (
                  <ul className="mb-3 flex flex-col gap-2">
                    {store.adminNotes.map((n, i) => (
                      <li key={`${n.addedAt}-${i}`} className="rounded-lg bg-[#FCFAF7] px-3 py-2 text-sm">
                        <p>{n.note}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">{formatDate(n.addedAt)}</p>
                      </li>
                    ))}
                  </ul>
                )}
                <form onSubmit={submitNote} className="flex gap-2">
                  <Input
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Note for other admins — never shown to the owner"
                  />
                  <Button type="submit" variant="outline" disabled={!note.trim() || addNote.isPending}>
                    Add
                  </Button>
                </form>
              </Section>
            </>
          ) : null}
        </div>

        {/* Decision bar */}
        {store ? (
          <footer className="sticky bottom-0 border-t border-brand-cream bg-white px-5 py-4">
            {rejecting ? (
              <form onSubmit={submitRejection} className="flex flex-col gap-2">
                <label
                  htmlFor="reject-reason"
                  className="text-xs uppercase tracking-wide text-brand-red"
                >
                  Reason for rejection — the owner sees this verbatim
                </label>
                <Textarea
                  id="reject-reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={3}
                  placeholder="e.g. The FSSAI licence number doesn't match the registered entity name."
                />
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setRejecting(false)}>
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={!reason.trim() || storeAction.isPending}
                    className="bg-brand-maroon text-white hover:brightness-110"
                  >
                    {storeAction.isPending ? "Rejecting…" : "Confirm rejection"}
                  </Button>
                </div>
              </form>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="max-w-xs text-xs text-muted-foreground">
                  {store.approvalStatus === "pending"
                    ? "Approving unlocks staff, menu, QR codes, offers and ordering in the owner's portal."
                    : "The owner's portal picks up this status within a minute."}
                </p>
                <div className="flex gap-2">
                  {store.approvalStatus === "pending" ? (
                    <>
                      <Button variant="outline" onClick={() => setRejecting(true)}>
                        Reject
                      </Button>
                      <Button
                        disabled={storeAction.isPending}
                        onClick={() => run("approve")}
                        className="bg-brand-gradient text-white hover:brightness-105"
                      >
                        {storeAction.isPending ? "Approving…" : "Approve store"}
                      </Button>
                    </>
                  ) : null}
                  {store.approvalStatus === "active" ? (
                    <Button
                      variant="outline"
                      disabled={storeAction.isPending}
                      onClick={() => run("suspend")}
                    >
                      Suspend
                    </Button>
                  ) : null}
                  {store.approvalStatus === "suspended" ? (
                    <Button
                      disabled={storeAction.isPending}
                      onClick={() => run("reactivate")}
                      className="bg-brand-gradient text-white hover:brightness-105"
                    >
                      Reactivate
                    </Button>
                  ) : null}
                  {store.approvalStatus === "rejected" ? (
                    <Button
                      disabled={storeAction.isPending}
                      onClick={() => run("approve")}
                      className="bg-brand-gradient text-white hover:brightness-105"
                    >
                      Approve anyway
                    </Button>
                  ) : null}
                </div>
              </div>
            )}
          </footer>
        ) : null}
      </aside>

      {/* Opened in place — a reviewer should not have to leave the panel, or hand a raw
          asset URL to a new tab, to look at what they are approving. */}
      <DocumentViewer
        open={!!viewedDoc}
        title={DOC_LABEL[viewedDoc?.type] ?? viewedDoc?.type}
        doc={viewedDoc}
        fetchFile={fetchViewedFile}
        onClose={() => setViewingDocType(null)}
      />
    </div>
  );
}
