// Printing a bill. The Bills page used to call window.print() on the whole portal page —
// sidebar, sticky top bar, cream backgrounds and all — which Chrome often turned into a blank
// or clipped page. This prints a receipt of its own instead: a self-contained document (no app
// CSS, no layout to fight) built from the same bill payload and the same lib/bill helpers as
// components/BillDocument.jsx, so the printed copy says exactly what the screen does.

import { billFacts, chargeLines, formatDateTime, formatMoney, paymentSummary } from "@/lib/bill";

const FRAME_ID = "bill-print-frame";

const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const RECEIPT_CSS = `
  @page { margin: 12mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
         color: #111; font-size: 12px; line-height: 1.4; }
  .receipt { max-width: 420px; margin: 0 auto; }
  .center { text-align: center; }
  h1 { font-size: 18px; margin: 0 0 2px; }
  .muted { color: #555; }
  .small { font-size: 11px; }
  hr { border: 0; border-top: 1px dashed #999; margin: 10px 0; }
  .facts { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 12px; }
  .facts dt { color: #555; font-size: 10.5px; }
  .facts dd { margin: 0; font-weight: 600; }
  table { width: 100%; border-collapse: collapse; font-size: inherit; }
  th { text-align: left; font-size: 10.5px; color: #555; border-bottom: 1px solid #ccc; padding: 3px 0; }
  td { padding: 4px 0; vertical-align: top; }
  .num { text-align: right; white-space: nowrap; }
  .note { font-style: italic; color: #555; font-size: 10.5px; }
  .total td { border-top: 1px solid #111; padding-top: 6px; font-size: 15px; font-weight: 700; }
  .paid { font-weight: 600; }
`;

/** The receipt as a complete HTML document. Exported for tests. */
export function buildBillPrintHtml(bill) {
  const r = bill?.restaurant ?? {};
  const address = [r.address?.street, r.address?.city, r.address?.state, r.address?.pincode]
    .filter(Boolean)
    .join(", ");
  const ids = [r.phone && `Ph ${r.phone}`, r.gstNumber && `GSTIN ${r.gstNumber}`, r.fssaiNumber && `FSSAI ${r.fssaiNumber}`]
    .filter(Boolean)
    .join(" · ");

  const facts = billFacts(bill)
    .map((f) => `<div><dt>${escapeHtml(f.label)}</dt><dd>${escapeHtml(f.value)}</dd></div>`)
    .join("");

  const items = (bill?.items ?? [])
    .map(
      (item) => `<tr>
        <td>${escapeHtml(item.name)}${item.notes?.length ? `<div class="note">${escapeHtml(item.notes.join(" · "))}</div>` : ""}</td>
        <td class="num">${escapeHtml(item.quantity)}</td>
        <td class="num">${escapeHtml(formatMoney(item.unitPrice))}</td>
        <td class="num">${escapeHtml(formatMoney(item.lineTotal))}</td>
      </tr>`,
    )
    .join("");

  const charges = chargeLines(bill)
    .map(
      (line) => `<tr>
        <td colspan="3">${escapeHtml(line.label)}${line.sublabel ? `<div class="small muted">${escapeHtml(line.sublabel)}</div>` : ""}</td>
        <td class="num">${escapeHtml(line.tone === "credit" ? `−${formatMoney(Math.abs(line.value))}` : formatMoney(line.value))}</td>
      </tr>`,
    )
    .join("");

  const payment = paymentSummary(bill);
  const paymentText = payment.isPaid
    ? `Paid${payment.method ? ` by ${payment.method}` : ""}${payment.paidAt ? ` · ${formatDateTime(payment.paidAt)}` : ""}` +
      (payment.transactionId ? `<div class="small muted">Txn ${escapeHtml(payment.transactionId)}</div>` : "")
    : payment.status === "cancelled"
      ? "This bill was cancelled."
      : "Not settled yet — this bill is still open.";

  const title = `Bill ${bill?.billNumber ?? bill?.reference ?? ""}`.trim();

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>${RECEIPT_CSS}</style></head>
<body><div class="receipt">
  <div class="center">
    <h1>${escapeHtml(r.name ?? "—")}</h1>
    ${r.legalName && r.legalName !== r.name ? `<div class="muted">${escapeHtml(r.legalName)}</div>` : ""}
    ${address ? `<div class="muted small">${escapeHtml(address)}</div>` : ""}
    ${ids ? `<div class="muted small">${escapeHtml(ids)}</div>` : ""}
  </div>
  <hr>
  <div class="center"><strong>${escapeHtml(title)}</strong>${bill?.tableNumber ? ` · Table ${escapeHtml(bill.tableNumber)}` : ""}</div>
  ${facts ? `<dl class="facts">${facts}</dl>` : ""}
  <hr>
  <table>
    <thead><tr><th>Item</th><th class="num">Qty</th><th class="num">Rate</th><th class="num">Amount</th></tr></thead>
    <tbody>${items || `<tr><td colspan="4" class="center muted">Nothing has been ordered on this bill yet.</td></tr>`}</tbody>
  </table>
  <hr>
  <table>
    <tbody>
      ${charges}
      <tr class="total"><td colspan="3">Total payable</td><td class="num">${escapeHtml(formatMoney(bill?.charges?.grandTotal))}</td></tr>
    </tbody>
  </table>
  <hr>
  <div class="center paid">${payment.isPaid ? paymentText : escapeHtml(paymentText)}</div>
  <p class="center small muted">Thank you for dining with us</p>
</div></body></html>`;
}

/**
 * Prints the bill through a hidden iframe holding only the receipt, so the browser's print
 * dialog (and "Save as PDF") gets the bill and nothing else. The frame is removed once the
 * dialog closes.
 */
export function printBill(bill) {
  // One receipt frame at a time: a previous one is left in place until the next print (or
  // its own afterprint), because removing a frame while Chrome's print preview is still
  // reading it is exactly what produces a blank page.
  document.getElementById(FRAME_ID)?.remove();

  const frame = document.createElement("iframe");
  frame.id = FRAME_ID;
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
  document.body.appendChild(frame);

  const doc = frame.contentDocument;
  doc.open();
  doc.write(buildBillPrintHtml(bill));
  doc.close();

  const win = frame.contentWindow;
  win.addEventListener("afterprint", () => setTimeout(() => frame.remove(), 500), { once: true });
  // Give the frame a tick to lay out before opening the dialog.
  setTimeout(() => {
    win.focus();
    win.print();
  }, 50);
}
