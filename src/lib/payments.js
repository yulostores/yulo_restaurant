// Shared reading of the Payments & Payouts data (src/hooks/owner/usePayments.js) — the money
// formatting, the dates, and which badge each server status gets. Nothing here computes an
// amount: every figure is the server's, in paise, and every owner-facing sentence comes from
// its `ownerView` (server/utils/payoutStatus.js is the source of the statuses below).

/** ₹1,986.40 from 198640 paise. Negative amounts keep their sign: −₹12.42. */
export function rupees(paise) {
  const n = (Number(paise) || 0) / 100;
  const text = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(n));
  return n < 0 ? `−${text}` : text;
}

const IST = "Asia/Kolkata";

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

// Date parts in IST. Months are named here ("Sep", as the design writes them) — en-IN's own
// short month for September is "Sept".
function parts(value, options) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-IN", {
      ...options,
      month: options.month ? "numeric" : undefined,
      timeZone: IST,
    })
      .formatToParts(new Date(value))
      .map((part) => [part.type, part.value]),
  );
  if (p.month) p.month = MONTHS[Number(p.month) - 1];
  if (p.day) p.day = String(Number(p.day)); // "7", not "07"
  return p;
}

// "Mon 12 Oct 2026" — payout dates are calendar days in IST, the settlement time zone. Built
// from parts: toLocaleDateString puts its own commas in ("Mon, 12 Oct, 2026").
export function payoutDay(value) {
  if (!value) return "—";
  const p = parts(value, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  return `${p.weekday} ${p.day} ${p.month} ${p.year}`;
}

// "5 Oct 2026"
export function dayLabel(value) {
  if (!value) return "—";
  const p = parts(value, { day: "numeric", month: "short", year: "numeric" });
  return `${p.day} ${p.month} ${p.year}`;
}

// "7 Oct"
export function shortDay(value) {
  if (!value) return "—";
  const p = parts(value, { day: "numeric", month: "short" });
  return `${p.day} ${p.month}`;
}

// "28 Sep 2026, 7:42 pm"
export function dateTime(value) {
  if (!value) return "—";
  const p = parts(value, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  return `${p.day} ${p.month} ${p.year}, ${p.hour}:${p.minute} ${String(p.dayPeriod ?? "").toLowerCase()}`.trim();
}

// "28 Sep–4 Oct 2026" (or "21–27 Sep 2026" inside one month).
export function periodLabel(period) {
  if (!period?.start || !period?.end) return "—";
  const s = parts(period.start, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  const e = parts(period.end, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  if (s.year !== e.year)
    return `${s.day} ${s.month} ${s.year}–${e.day} ${e.month} ${e.year}`;
  if (s.month === e.month) return `${s.day}–${e.day} ${e.month} ${e.year}`;
  return `${s.day} ${s.month}–${e.day} ${e.month} ${e.year}`;
}

// ── Badges ────────────────────────────────────────────────────────────────────
// Variants are ui/badge.jsx's.

// One order's (or bill's) payment status.
export const ORDER_STATUS = {
  pending: { label: "Pending", variant: "info" },
  eligible: { label: "Eligible", variant: "ok" },
  on_hold: { label: "On hold", variant: "danger" },
  settled: { label: "Settled", variant: "ok" },
  refunded: { label: "Refunded", variant: "muted" },
};

export const orderStatusBadge = (status) =>
  ORDER_STATUS[status] ?? { label: status ?? "—", variant: "muted" };

// A statement's bank transfer. The badge text is the server's ownerView.status when there is
// one (it already reads "On hold" / "Carried forward" for a held statement); the variant
// follows that text.
const TRANSFER_VARIANTS = {
  "Not scheduled": "muted",
  Scheduled: "info",
  Processing: "warn",
  Paid: "ok",
  Failed: "danger",
  "On hold": "danger",
  "Carried forward": "muted",
};
const TRANSFER_LABELS = {
  not_scheduled: "Not scheduled",
  scheduled: "Scheduled",
  processing: "Processing",
  paid: "Paid",
  failed: "Failed",
  carried_forward: "Carried forward",
};

export function transferBadge({ ownerView, transferStatus, eligibility } = {}) {
  const label =
    ownerView?.status ??
    (eligibility === "on_hold"
      ? "On hold"
      : (TRANSFER_LABELS[transferStatus] ?? "—"));
  return { label, variant: TRANSFER_VARIANTS[label] ?? "muted" };
}

// Status filter options for the payout history (the server's transferStatus values).
export const TRANSFER_FILTERS = [
  { value: "not_scheduled", label: "Not scheduled" },
  { value: "scheduled", label: "Scheduled" },
  { value: "processing", label: "Processing" },
  { value: "paid", label: "Paid" },
  { value: "failed", label: "Failed" },
  { value: "carried_forward", label: "Carried forward" },
];

export const ORDER_FILTERS = Object.entries(ORDER_STATUS).map(
  ([value, { label }]) => ({ value, label }),
);

// ── Payment types ─────────────────────────────────────────────────────────────

const COUNTER_METHOD = { cash: "Cash", upi: "UPI", card: "Card" };

export function paymentTypeLabel(paymentType, counterMethod) {
  const method = COUNTER_METHOD[counterMethod] ?? null;
  switch (paymentType) {
    case "online":
      return "Paid Online";
    case "dine_in_online":
      return "Dine-in · paid online";
    case "dine_in_counter":
      return method
        ? `Dine-in · ${method} at table`
        : "Dine-in · paid at table";
    case "counter":
      return method
        ? `Takeaway · ${method} at counter`
        : "Takeaway · paid at counter";
    case "cod":
      return "Cash on delivery";
    default:
      return "—";
  }
}

// What the "Customer paid" cell says when the money didn't go through Yulo.
export function customerPaidText(row) {
  if (row.customerPaidPaise != null) return rupees(row.customerPaidPaise);
  if (row.paymentType === "dine_in_counter") return "Paid at table";
  if (row.paymentType === "counter") return "Paid at counter";
  return "—";
}

// Where "View Details" goes for a Payments table row.
export const paymentDetailPath = (row) =>
  row.kind === "bill"
    ? `/payments/bills/${row.id}`
    : `/payments/orders/${row.id}`;
