// Shared reading of payment issues (support tickets about a payout, an order or a bill —
// API.md → Payment issues). Labels and badges only; every fact comes from the server.

export const ISSUE_TYPES = [
  { value: "wrong_deduction", label: "Wrong deduction" },
  { value: "missing_order", label: "Missing order" },
  { value: "payout_not_received", label: "Payout not received" },
];

export const issueTypeLabel = (value) =>
  ISSUE_TYPES.find((t) => t.value === value)?.label ?? "Payment issue";

// The ticket's own status (badges in the list and on the panel). Variants are ui/badge.jsx's.
export const TICKET_STATUS = {
  open: { label: "Open", variant: "info" },
  in_review: { label: "In review", variant: "warn" },
  awaiting_restaurant: { label: "Awaiting restaurant", variant: "danger" },
  resolved: { label: "Resolved", variant: "ok" },
};

export const ticketStatusBadge = (status) =>
  TICKET_STATUS[status] ?? { label: status ?? "—", variant: "muted" };

export const TICKET_FILTERS = Object.entries(TICKET_STATUS).map(
  ([value, { label }]) => ({ value, label }),
);

// What the owner is told the ticket is waiting on.
export function ownerStage(status) {
  if (status === "awaiting_restaurant") return "Yulo needs more information";
  if (status === "resolved") return "Issue resolved";
  return "Awaiting review";
}

// The attachment rule, as the server enforces it (services/supportTicket.service.js).
export const ATTACHMENT_TYPES = ["application/pdf", "image/jpeg", "image/png"];
export const ATTACHMENT_MAX_BYTES = 5 * 1024 * 1024;

export function attachmentProblem(file) {
  if (!ATTACHMENT_TYPES.includes(file.type)) return "Attach a PDF, JPG or PNG";
  if (file.size > ATTACHMENT_MAX_BYTES) return "The file must be under 5 MB";
  return null;
}

// "PDF · 240 KB"
export function fileMeta({ mimeType, size }) {
  const kind =
    mimeType === "application/pdf"
      ? "PDF"
      : mimeType === "image/png"
        ? "PNG"
        : mimeType === "image/jpeg"
          ? "JPG"
          : "File";
  if (!size) return kind;
  const kb = size / 1024;
  return `${kind} · ${kb >= 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(kb))} KB`}`;
}

export const PRIVACY_NOTE =
  "Share only the relevant bank-statement page and hide unrelated transactions. Never include your full account number, card details, OTP or password.";
