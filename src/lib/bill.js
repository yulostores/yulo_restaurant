// Shared reading of a bill, for every screen that shows one — the owner console's Bills
// page, the waiter's settle sheet, and the guest's own bill in the QR app.
//
// The API returns one bill shape for all of them (server-side:
// services/billView.service.js), and this module is its client-side counterpart: the same
// labels, the same rounding, the same order of charge lines, so a guest and an owner
// looking at one bill never read two different documents.
//
// Nothing here invents a figure. Every amount comes from `bill.charges`, which the server
// computes from the restaurant's own configured GST and service-charge percentages.

export function formatMoney(value) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value) || 0);
}

export function formatDateTime(value) {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatTime(value) {
  if (!value) return "—";
  return new Date(value).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}

// "dine_in" -> "Dine in". The API's own enum values, made readable without a lookup table
// that would drift the moment a new type is added.
export function humanize(value) {
  const text = String(value ?? "").replace(/_/g, " ").trim();
  return text ? text[0].toUpperCase() + text.slice(1) : "";
}

const PLACED_BY_LABEL = {
  waiter: "Waiter",
  guest: "Guest (QR)",
  customer: "Customer app",
  system: "System",
};

export function placedByLabel(batch) {
  if (batch?.staffName) return batch.staffName;
  // humanize returns "" for an unknown/absent value, which is falsy but not nullish —
  // legacy rounds carry no placedBy at all and would otherwise render as a blank gap.
  return PLACED_BY_LABEL[batch?.placedBy] ?? (humanize(batch?.placedBy) || "—");
}

/**
 * The charge breakdown, in the order a receipt prints it. Zero-value lines are dropped —
 * a restaurant that levies no service charge should not have a "Service charge ₹0.00"
 * line on every bill it issues — except the item total, which always prints.
 *
 * `tone: "credit"` marks a line that comes off the total (discounts) so callers style it
 * consistently rather than each deciding for itself.
 */
export function chargeLines(bill) {
  const c = bill?.charges ?? {};
  const lines = [{ key: "subtotal", label: "Item total", value: c.subtotal ?? 0 }];

  for (const [i, d] of (bill?.discountsApplied ?? []).entries()) {
    if (!d.amount) continue;
    lines.push({
      key: `discount-${d.discountId ?? i}`,
      label: d.code ? `Discount (${d.code})` : d.description || "Discount",
      value: -d.amount,
      tone: "credit",
    });
  }

  // A dine-in bill states GST as its two intra-state halves, the way an Indian restaurant
  // bill does. Delivery is taxed by the platform's own cart tax, so it prints as one line.
  if (bill?.type === "dine_in" && c.gstAmount) {
    lines.push({ key: "cgst", label: `CGST (${c.cgstPercent}%)`, value: c.cgstAmount });
    lines.push({ key: "sgst", label: `SGST (${c.sgstPercent}%)`, value: c.sgstAmount });
  } else if (c.gstAmount) {
    lines.push({ key: "gst", label: `GST (${c.gstPercent}%)`, value: c.gstAmount });
  }

  if (c.serviceChargeAmount) {
    lines.push({
      key: "service",
      label: `Service charge (${c.serviceChargePercent}%)`,
      value: c.serviceChargeAmount,
    });
  }
  if (c.deliveryFee) lines.push({ key: "delivery", label: "Delivery fee", value: c.deliveryFee });
  if (c.platformFee) lines.push({ key: "platform", label: "Platform fee", value: c.platformFee });
  if (c.tip) lines.push({ key: "tip", label: "Tip", value: c.tip });

  return lines;
}

/**
 * The identifying details printed above the items — what the bill is, whose table it is,
 * who served it and when. Entries with no value are dropped rather than rendered as a
 * dash, so a delivery bill doesn't show an empty "Table" row and vice versa.
 */
export function billFacts(bill) {
  if (!bill) return [];
  const facts = [
    { key: "billNumber", label: "Bill no.", value: bill.billNumber ?? bill.reference },
    { key: "type", label: "Order type", value: humanize(bill.type) },
    { key: "table", label: "Table", value: bill.tableNumber },
    { key: "guests", label: "Guests", value: bill.guestCount ? String(bill.guestCount) : null },
    { key: "waiter", label: "Served by", value: bill.waiter?.name },
    { key: "customer", label: "Guest", value: bill.customer?.name },
    { key: "phone", label: "Contact", value: bill.customer?.phone },
    {
      key: "address",
      label: "Delivered to",
      value: [bill.deliveryAddress?.street, bill.deliveryAddress?.city].filter(Boolean).join(", ") || null,
    },
    { key: "opened", label: "Opened", value: bill.openedAt ? formatDateTime(bill.openedAt) : null },
    { key: "closed", label: "Closed", value: bill.closedAt ? formatDateTime(bill.closedAt) : null },
    { key: "rounds", label: "Rounds", value: bill.orderCount ? String(bill.orderCount) : null },
    { key: "session", label: "Session", value: bill.sessionCode },
  ];
  return facts.filter((f) => f.value);
}

export function paymentSummary(bill) {
  const p = bill?.payment ?? {};
  return {
    isPaid: Boolean(p.isPaid),
    status: p.status ?? bill?.status ?? "open",
    method: p.method ?? null,
    paidAt: p.paidAt ?? null,
    transactionId: p.transactionId ?? null,
  };
}
