// Payment issues — Figma 144:6988 (Report payment issue drawer) and 144:5747 (submitted and
// tracking panel). The report drawer opens from a statement or an order / bill page; once
// submitted the same drawer becomes the ticket's tracking panel, which is also the body of
// /payments/issues/:ticketId.
//
//   POST /owner/:rId/payment-issues                      (JSON, or multipart with `attachment`)
//   GET  /owner/:rId/payment-issues/:ticketId
//   POST /owner/:rId/payment-issues/:ticketId/messages   ("Add information")
//   GET  /owner/:rId/payment-issues/:ticketId/attachments/:attachmentId
//
// A ticket never changes a payout. Messages are masked by the server (account / card numbers,
// OTPs) before they are stored; the panel shows them as stored.

import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { FileText, Loader2, Paperclip, X } from "lucide-react";

import { useToast } from "@/components/Toaster";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useOwnerAuth } from "@/context/OwnerAuthContext";
import {
  useAddPaymentIssueMessage,
  useCreatePaymentIssue,
  useOpenAttachment,
  usePaymentIssue,
} from "@/hooks/owner/usePaymentIssues";
import {
  ISSUE_TYPES,
  PRIVACY_NOTE,
  attachmentProblem,
  fileMeta,
  issueTypeLabel,
  ownerStage,
  ticketStatusBadge,
} from "@/lib/paymentIssues";
import {
  dateTime,
  dayLabel,
  periodLabel,
  rupees,
  shortDay,
  transferBadge,
} from "@/lib/payments";
import { cn } from "@/lib/utils";
import { StatusBadge, Steps } from "./parts";
import { Badge, Button } from "./ui";

// ── Small pieces ──────────────────────────────────────────────────────────────

// The record the issue is about, as a card ("Payout · 21–27 Sep 2026 [Paid] ₹1,986.40 …").
// `context` is built by the page that opens the drawer (before a ticket exists) or from the
// ticket's `linkedRecord` (after).
export function ContextCard({ context }) {
  if (!context) return null;
  return (
    <div className="rounded-[12px] bg-[#efece4] px-4 py-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium">{context.title}</p>
        {context.badge ? <StatusBadge badge={context.badge} /> : null}
      </div>
      {context.amountPaise != null ? (
        <p className="pay-figure mt-1 text-[24px] font-semibold text-[#14594a]">
          {rupees(context.amountPaise)}
        </p>
      ) : null}
      {context.lines?.filter(Boolean).map((line) => (
        <p key={line} className="mt-1 text-[12px] leading-4 text-[#596059]">
          {line}
        </p>
      ))}
      {context.reference ? (
        <p className="mt-1 font-mono text-[12px] text-[#1a1d1b]">
          {context.reference}
        </p>
      ) : null}
      {context.link ? (
        <Link
          to={context.link.to}
          className="mt-3 inline-block text-sm font-medium text-[#14594a] hover:underline"
        >
          {context.link.label}
        </Link>
      ) : null}
    </div>
  );
}

// The ticket's linkedRecord → a ContextCard.
export function contextFromLinkedRecord(record) {
  if (!record) return null;
  if (record.kind === "payout") {
    return {
      title: `Payout · ${periodLabel(record.period)}`,
      badge: transferBadge({
        transferStatus: record.transferStatus,
        eligibility: record.eligibility,
      }),
      amountPaise: record.amountPaise,
      lines: [
        [
          record.transferStatus === "paid" && record.paidAt
            ? `Paid ${dayLabel(record.paidAt)}`
            : null,
          record.last4 ? `Bank ending ${record.last4}` : null,
        ]
          .filter(Boolean)
          .join(" · "),
        record.bankReference ? `Bank reference ${record.bankReference}` : null,
      ],
      link: {
        to: `/payments/statements/${record.settlementId}`,
        label: "View payout detail",
      },
    };
  }
  const isBill = record.kind === "bill";
  return {
    title: `${isBill ? "Bill" : "Order"} ${record.displayNo ?? ""} · ${shortDay(record.date)}`,
    badge: record.transferStatus
      ? transferBadge({ transferStatus: record.transferStatus })
      : null,
    amountPaise: record.amountPaise,
    lines: [
      record.statement
        ? `In the statement for ${periodLabel(record.statement.period)}`
        : "Not in a weekly statement yet",
    ],
    link: {
      to: isBill
        ? `/payments/bills/${record.billId}`
        : `/payments/orders/${record.orderId}`,
      label: isBill ? "View bill payment" : "View order payment",
    },
  };
}

// Pick / show / remove one attachment.
function AttachmentPicker({
  variant = "outline",
  file,
  onChange,
  error,
  onError,
  label = "Add supporting attachment",
}) {
  const input = useRef(null);
  function pick(e) {
    const chosen = e.target.files?.[0];
    e.target.value = "";
    if (!chosen) return;
    const problem = attachmentProblem(chosen);
    if (problem) {
      onError(problem);
      return;
    }
    onError("");
    onChange(chosen);
  }
  return (
    <div>
      <input
        ref={input}
        type="file"
        accept="application/pdf,image/jpeg,image/png"
        className="hidden"
        onChange={pick}
      />
      {file ? (
        <div className="flex items-center gap-3 rounded-lg bg-[#efece4] px-3 py-2.5">
          <FileText className="h-4 w-4 shrink-0 text-[#14594a]" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{file.name}</p>
            <p className="text-[11px] text-muted-foreground">
              {fileMeta({ mimeType: file.type, size: file.size })}
            </p>
          </div>
          <button
            type="button"
            onClick={() => window.open(URL.createObjectURL(file), "_blank")}
            className="text-xs font-semibold text-[#14594a] hover:underline"
          >
            View
          </button>
          <button
            type="button"
            onClick={() => onChange(null)}
            className="text-xs font-semibold text-[#b3421e] hover:underline"
          >
            Remove
          </button>
        </div>
      ) : (
        <Button
          type="button"
          variant={variant}
          onClick={() => input.current?.click()}
        >
          <Paperclip /> {label}
        </Button>
      )}
      {error ? (
        <p role="alert" className="mt-1 text-[11px] text-[#b3421e]">
          {error}
        </p>
      ) : (
        <p className="mt-1 text-[11px] text-muted-foreground">
          PDF, JPG or PNG, up to 5 MB.
        </p>
      )}
    </div>
  );
}

function Field({ label, htmlFor, required, optional, error, children }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor} className="text-xs font-semibold">
        {label}
        {required ? <span className="text-[#b3421e]"> *</span> : null}
        {optional ? (
          <span className="font-normal text-muted-foreground"> · Optional</span>
        ) : null}
      </Label>
      {children}
      {error ? (
        <p role="alert" className="text-[11px] text-[#b3421e]">
          {error}
        </p>
      ) : null}
    </div>
  );
}

// zod's flatten() on the server: { fieldErrors: { field: [message, …] } }.
function serverFieldErrors(err) {
  const fieldErrors = err?.details?.fieldErrors ?? {};
  return Object.fromEntries(
    Object.entries(fieldErrors).map(([field, messages]) => [
      field,
      [].concat(messages)[0],
    ]),
  );
}

// ── Drawer shell ──────────────────────────────────────────────────────────────

function Drawer({ title, subtitle, onClose, children, labelledBy }) {
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/40"
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelledBy}
    >
      <button
        type="button"
        aria-label="Close"
        className="flex-1 cursor-default"
        onClick={onClose}
      />
      <div className="flex h-full w-full max-w-[520px] flex-col overflow-y-auto bg-white shadow-xl">
        <div className="flex items-start justify-between gap-4 border-b border-[#e3dfd4] px-6 py-5">
          <div>
            <h2 id={labelledBy} className="text-xl font-bold">
              {title}
            </h2>
            {subtitle ? (
              <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-1 text-sm font-medium text-[#14594a] hover:underline"
          >
            <X className="h-4 w-4" /> Close
          </button>
        </div>
        <div className="flex-1 px-6 py-5">{children}</div>
      </div>
    </div>
  );
}

// ── Report form ───────────────────────────────────────────────────────────────

const DESCRIPTION_MIN = 10;
const DESCRIPTION_MAX = 4000;

function ReportForm({ link, context, defaultType, onSubmitted, onCancel }) {
  const { restaurantId, user } = useOwnerAuth();
  const toast = useToast();
  const create = useCreatePaymentIssue(restaurantId);
  const [issueType, setIssueType] = useState(defaultType ?? "");
  const [description, setDescription] = useState("");
  const [contactEmail, setContactEmail] = useState(user?.email ?? "");
  const [contactPhone, setContactPhone] = useState("");
  const [file, setFile] = useState(null);
  const [fileError, setFileError] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [serverErrors, setServerErrors] = useState({});

  const errors = {};
  if (!issueType) errors.issueType = "Choose what the issue is about";
  if (description.trim().length < DESCRIPTION_MIN)
    errors.description = "Describe the issue (at least 10 characters)";
  else if (description.trim().length > DESCRIPTION_MAX)
    errors.description = "Keep it under 4,000 characters";
  if (!/^\S+@\S+\.\S+$/.test(contactEmail.trim()))
    errors.contactEmail = "Enter a valid email";
  if (contactPhone.trim() && !/^\+?[\d\s-]{7,20}$/.test(contactPhone.trim()))
    errors.contactPhone = "Enter a valid phone number";
  const errorFor = (field) =>
    (submitted ? errors[field] : null) ?? serverErrors[field] ?? null;

  async function submit(e) {
    e.preventDefault();
    setSubmitted(true);
    setServerErrors({});
    if (Object.keys(errors).length > 0) return;
    try {
      const ticket = await create.mutateAsync({
        fields: {
          issueType,
          description: description.trim(),
          contactEmail: contactEmail.trim(),
          ...(contactPhone.trim() ? { contactPhone: contactPhone.trim() } : {}),
          ...link,
        },
        file,
      });
      toast.success(`Payment issue submitted — ticket ${ticket.ticketNumber}`);
      onSubmitted(ticket);
    } catch (err) {
      const fieldErrors = serverFieldErrors(err);
      if (Object.keys(fieldErrors).length > 0) setServerErrors(fieldErrors);
      if (err.code === "INVALID_FILE_TYPE" || err.code === "LIMIT_FILE_SIZE")
        setFileError(err.message);
      toast.error(err, "Couldn't submit the payment issue. Please try again.");
    }
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-5">
      <ContextCard context={context} />

      <Field label="Category" required error={errorFor("issueType")}>
        <div
          className="flex flex-wrap gap-2"
          role="radiogroup"
          aria-label="Category"
        >
          {ISSUE_TYPES.map((t) => (
            <button
              key={t.value}
              type="button"
              role="radio"
              aria-checked={issueType === t.value}
              onClick={() => setIssueType(t.value)}
              className={cn(
                "rounded-full border px-4 py-2 text-sm font-medium",
                issueType === t.value
                  ? "border-[#14594a] bg-[#14594a] text-white"
                  : "border-[#14594a]/40 bg-white text-[#14594a] hover:bg-[#e0efea]",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </Field>

      <Field
        label="Description"
        htmlFor="issue-description"
        required
        error={errorFor("description")}
      >
        <Textarea
          id="issue-description"
          rows={5}
          maxLength={DESCRIPTION_MAX}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What looks wrong? Include the dates and amounts you expected."
        />
      </Field>

      <Field label="Supporting attachment" optional>
        <AttachmentPicker
          file={file}
          onChange={setFile}
          error={fileError}
          onError={setFileError}
        />
      </Field>

      <Field
        label="Contact email"
        htmlFor="issue-email"
        required
        error={errorFor("contactEmail")}
      >
        <Input
          id="issue-email"
          type="email"
          value={contactEmail}
          onChange={(e) => setContactEmail(e.target.value)}
        />
      </Field>

      <Field
        label="Phone"
        htmlFor="issue-phone"
        optional
        error={errorFor("contactPhone")}
      >
        <Input
          id="issue-phone"
          type="tel"
          value={contactPhone}
          onChange={(e) => setContactPhone(e.target.value)}
        />
      </Field>
      <p className="-mt-3 text-[11px] text-muted-foreground">
        We&apos;ll use these details to contact you about this payment issue.
      </p>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={create.isPending} className="h-10 px-5">
          {create.isPending ? <Loader2 className="animate-spin" /> : null}
          Submit payment issue
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={create.isPending}
        >
          Cancel
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground">{PRIVACY_NOTE}</p>
    </form>
  );
}

// ── Tracking panel ────────────────────────────────────────────────────────────

function AttachmentRow({ attachment, onOpen, opening }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-[#e3dfd4] px-3 py-2">
      <FileText className="h-4 w-4 shrink-0 text-[#14594a]" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm">{attachment.name}</p>
        <p className="text-[11px] text-muted-foreground">
          {fileMeta(attachment)}
        </p>
      </div>
      <button
        type="button"
        onClick={() => onOpen(attachment._id)}
        disabled={opening}
        className="text-xs font-semibold text-[#14594a] hover:underline disabled:opacity-60"
      >
        View attachment
      </button>
    </div>
  );
}

function issueSteps(ticket) {
  const p = ticket.progress ?? {};
  const awaiting = ticket.status === "awaiting_restaurant";
  return [
    {
      key: "submitted",
      title: "Issue submitted",
      detail: `${dayLabel(p.submittedAt)} · Submitted by you`,
      done: true,
    },
    {
      key: "review",
      title: "Awaiting review",
      detail: p.reviewedAt
        ? `Reviewed ${dayLabel(p.reviewedAt)}`
        : "Payment details received — not reviewed yet",
      done: !!p.reviewedAt,
    },
    {
      key: "response",
      title: awaiting ? "Yulo needs more information" : "Support response",
      detail: awaiting
        ? "See the request below and add the information"
        : p.firstResponseAt
          ? `First reply ${dayLabel(p.firstResponseAt)}`
          : "No response yet",
      done: !!p.firstResponseAt,
      tone: awaiting ? "danger" : undefined,
    },
    {
      key: "resolved",
      title: "Issue resolved",
      detail: p.resolvedAt ? dayLabel(p.resolvedAt) : "Not yet resolved",
      done: !!p.resolvedAt,
    },
  ];
}

export function TicketPanel({ ticket }) {
  const { restaurantId } = useOwnerAuth();
  const toast = useToast();
  const reply = useAddPaymentIssueMessage(restaurantId, ticket._id);
  const openAttachment = useOpenAttachment(restaurantId, ticket._id);
  const [text, setText] = useState("");
  const [file, setFile] = useState(null);
  const [fileError, setFileError] = useState("");

  async function view(attachmentId) {
    try {
      await openAttachment.mutateAsync({ attachmentId });
    } catch (err) {
      toast.error(err, "Couldn't open the attachment. Please try again.");
    }
  }

  async function addUpdate(e) {
    e.preventDefault();
    if (!text.trim()) {
      toast.error("Write the information you want to add");
      return;
    }
    try {
      await reply.mutateAsync({ text: text.trim(), file });
      setText("");
      setFile(null);
      toast.success("Information added to your ticket");
    } catch (err) {
      if (err.code === "INVALID_FILE_TYPE" || err.code === "LIMIT_FILE_SIZE")
        setFileError(err.message);
      toast.error(err, "Couldn't add the information. Please try again.");
    }
  }

  const badge = ticketStatusBadge(ticket.status);
  const messages = ticket.messages ?? [];
  const awaiting = ticket.status === "awaiting_restaurant";

  return (
    <div className="space-y-6">
      <ContextCard context={contextFromLinkedRecord(ticket.linkedRecord)} />

      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-3">
          <p className="font-mono text-xs">{ticket.ticketNumber}</p>
          <Badge variant={badge.variant}>{badge.label}</Badge>
        </div>
        <p className="text-sm font-semibold">
          {issueTypeLabel(ticket.issueType)}
        </p>
        <p className="whitespace-pre-line text-sm">{ticket.description}</p>
        {ticket.descriptionRedacted ? (
          <p className="text-[11px] text-muted-foreground">
            Numbers that looked like account, card or OTP details were hidden.
          </p>
        ) : null}
        {(ticket.attachments ?? []).map((a) => (
          <AttachmentRow
            key={a._id}
            attachment={a}
            onOpen={view}
            opening={openAttachment.isPending}
          />
        ))}
        <p className="text-xs text-muted-foreground">
          Contact:{" "}
          {[ticket.contact?.email, ticket.contact?.phone]
            .filter(Boolean)
            .join(" · ") || "—"}
        </p>
      </div>

      {awaiting && ticket.awaitingInformation ? (
        <div className="rounded-xl border border-[#FCD9B8] bg-[#FFF7ED] px-4 py-3 text-sm text-[#9A3412]">
          <p className="font-semibold">Yulo needs more information</p>
          <p className="mt-1 whitespace-pre-line">
            {ticket.awaitingInformation}
          </p>
        </div>
      ) : null}

      <section>
        <h3 className="mb-3 text-base font-bold">
          Issue status · {ownerStage(ticket.status)}
        </h3>
        <Steps steps={issueSteps(ticket)} />
      </section>

      <section>
        <h3 className="mb-3 text-base font-bold">Responses</h3>
        {messages.length === 0 ? (
          <div className="rounded-xl bg-[#efece4] px-4 py-3 text-sm">
            <p className="font-medium">No support response yet</p>
            <p className="text-muted-foreground">
              Updates and requests for more information will appear here when
              available.
            </p>
          </div>
        ) : (
          <ol className="space-y-3">
            {messages.map((m) => (
              <li
                key={m._id}
                className={cn(
                  "rounded-xl px-4 py-3 text-sm",
                  m.from === "support"
                    ? m.requestsInformation
                      ? "border border-[#FCD9B8] bg-[#FFF7ED]"
                      : "bg-[#e0efea]"
                    : "bg-[#efece4]",
                )}
              >
                <p className="mb-1 text-[11px] font-semibold text-muted-foreground">
                  {m.from === "support"
                    ? m.requestsInformation
                      ? "Yulo support · asked for information"
                      : "Yulo support"
                    : "You"}{" "}
                  · {dateTime(m.sentAt)}
                </p>
                <p className="whitespace-pre-line">{m.text}</p>
                {(m.attachments ?? []).map((a) => (
                  <div key={a._id} className="mt-2">
                    <AttachmentRow
                      attachment={a}
                      onOpen={view}
                      opening={openAttachment.isPending}
                    />
                  </div>
                ))}
              </li>
            ))}
          </ol>
        )}
      </section>

      <form onSubmit={addUpdate} className="space-y-3">
        <Label
          htmlFor={`issue-update-${ticket._id}`}
          className="text-sm font-semibold"
        >
          Add information
        </Label>
        <Textarea
          id={`issue-update-${ticket._id}`}
          rows={4}
          maxLength={4000}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={
            awaiting
              ? "Answer Yulo's question…"
              : "Share additional details relevant to this payout…"
          }
        />
        <AttachmentPicker
          file={file}
          onChange={setFile}
          error={fileError}
          onError={setFileError}
          label="Attach file"
          variant="ghost"
        />
        <Button type="submit" variant="outline" disabled={reply.isPending}>
          {reply.isPending ? <Loader2 className="animate-spin" /> : null}
          Add update
        </Button>
        <p className="text-[11px] text-muted-foreground">{PRIVACY_NOTE}</p>
      </form>
    </div>
  );
}

// ── The drawer the pages open ─────────────────────────────────────────────────

// link: { settlementId } | { orderId } | { billId }. context: what ContextCard shows before the
// ticket exists (the page already has the payout / order in hand).
// The submitted ticket, kept current (support's replies, the owner's own updates).
function LiveTicketPanel({ initial }) {
  const { restaurantId } = useOwnerAuth();
  const { data } = usePaymentIssue(restaurantId, initial._id);
  return <TicketPanel ticket={data ?? initial} />;
}

export function ReportIssueDrawer({ link, context, defaultType, onClose }) {
  const [ticket, setTicket] = useState(null);
  return ticket ? (
    <Drawer
      title="Payment issue submitted"
      labelledBy="issue-drawer-title"
      onClose={onClose}
    >
      <div className="mb-5 rounded-xl bg-[#e0efea] px-4 py-3 text-sm text-[#14594a]">
        <p className="font-semibold">We&apos;ve received your payment issue</p>
        <p>
          Your ticket is {ticket.ticketNumber}. Follow the review and any
          requests for more information here, or under{" "}
          <Link
            to={`/payments/issues/${ticket._id}`}
            className="font-semibold underline"
          >
            Payment issues
          </Link>
          .
        </p>
      </div>
      <LiveTicketPanel initial={ticket} />
    </Drawer>
  ) : (
    <Drawer
      title="Report payment issue"
      labelledBy="issue-drawer-title"
      onClose={onClose}
    >
      <ReportForm
        link={link}
        context={context}
        defaultType={defaultType}
        onSubmitted={setTicket}
        onCancel={onClose}
      />
    </Drawer>
  );
}

// The "Report payment issue" card on the statement and order pages.
// The way into "Report payment issue" as the frames draw it: an outline pill (the drawer), with
// the restaurant's issue list beside it.
export function ReportIssueCard({ onReport, className }) {
  return (
    <div className={cn("flex flex-wrap items-center gap-3", className)}>
      <Button variant="outline" onClick={onReport}>
        Report payment issue
      </Button>
      <Link
        to="/payments/issues"
        className="text-[14px] font-medium text-[#14594a] hover:underline"
      >
        Your payment issues
      </Link>
    </div>
  );
}
