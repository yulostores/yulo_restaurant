// The bill, rendered. One component behind every portal that shows a bill — the owner
// console's Bills page, the waiter's settle sheet and the guest's own bill in the QR app —
// so the receipt a customer pays against is the same document the restaurant and the
// platform later read.
//
// Everything on screen comes from the API's bill payload (server-side:
// services/billView.service.js). Nothing is computed, defaulted or assumed here: no tax
// rate, no service charge, no table number. A field the bill doesn't carry is not drawn.

import { useState } from "react";
import { ChevronDown, ChevronUp, MapPin, Receipt, Utensils } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  billFacts,
  chargeLines,
  formatDateTime,
  formatMoney,
  formatTime,
  humanize,
  paymentSummary,
  placedByLabel,
} from "@/lib/bill";

/* ── The restaurant issuing the bill ─────────────────────────────────
   Taken from the bill's own snapshot of the restaurant, so a receipt keeps naming the
   place, GSTIN and licence it was actually raised against even after those change. */
export function BillHeader({ bill, className }) {
  const r = bill?.restaurant;
  const address = [r?.address?.street, r?.address?.city, r?.address?.state, r?.address?.pincode]
    .filter(Boolean)
    .join(", ");

  return (
    <div className={cn("flex items-start gap-3", className)}>
      {r?.logo ? (
        <img
          src={r.logo}
          alt=""
          className="h-12 w-12 shrink-0 rounded-xl object-cover ring-1 ring-brand-cream/70"
        />
      ) : (
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-brand-cream/50 text-brand-orange">
          <Utensils className="h-5 w-5" />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-base font-bold leading-tight">{r?.name ?? "—"}</p>
        {r?.legalName && r.legalName !== r.name ? (
          <p className="truncate text-xs text-muted-foreground">{r.legalName}</p>
        ) : null}
        {address ? (
          <p className="mt-0.5 flex items-start gap-1 text-xs text-muted-foreground">
            <MapPin className="mt-0.5 h-3 w-3 shrink-0" />
            <span className="min-w-0">{address}</span>
          </p>
        ) : null}
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
          {r?.phone ? <span>Ph {r.phone}</span> : null}
          {r?.gstNumber ? <span>GSTIN {r.gstNumber}</span> : null}
          {r?.fssaiNumber ? <span>FSSAI {r.fssaiNumber}</span> : null}
        </div>
      </div>
    </div>
  );
}

/* ── The table, front and centre ─────────────────────────────────────
   The single thing a guest checks first and the floor identifies a bill by. Rendered as
   its own badge rather than buried in the detail grid. */
export function BillTableBadge({ bill, className }) {
  if (!bill?.tableNumber) return null;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full bg-brand-gradient px-3 py-1 text-xs font-bold text-white",
        className,
      )}
    >
      Table {bill.tableNumber}
      {bill.guestCount ? <span className="opacity-80">· {bill.guestCount} guests</span> : null}
    </span>
  );
}

/* ── Bill no., type, who served it, when it ran ───────────────────── */
export function BillFacts({ bill, className }) {
  const facts = billFacts(bill);
  if (facts.length === 0) return null;
  return (
    <dl className={cn("grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-3", className)}>
      {facts.map((fact) => (
        <div key={fact.key} className="min-w-0">
          <dt className="text-muted-foreground">{fact.label}</dt>
          <dd className="truncate font-semibold text-[#24190f]">{fact.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/* ── What was eaten, one line per dish across the whole sitting ───── */
export function BillItems({ bill, className }) {
  const items = bill?.items ?? [];
  if (items.length === 0) {
    return (
      <p className={cn("py-6 text-center text-sm text-muted-foreground", className)}>
        Nothing has been ordered on this bill yet.
      </p>
    );
  }
  return (
    <ul className={cn("divide-y divide-brand-cream/50", className)}>
      {items.map((item, i) => (
        <li key={`${item.name}-${item.unitPrice}-${i}`} className="flex gap-3 py-2 text-sm">
          <span className="w-8 shrink-0 font-semibold text-brand-orange">{item.quantity}×</span>
          <span className="min-w-0 flex-1">
            <span className="block font-medium">{item.name}</span>
            <span className="block text-xs text-muted-foreground">
              {formatMoney(item.unitPrice)} each
            </span>
            {item.notes?.length ? (
              <span className="block text-xs italic text-muted-foreground">
                {item.notes.join(" · ")}
              </span>
            ) : null}
          </span>
          <span className="shrink-0 font-semibold">{formatMoney(item.lineTotal)}</span>
        </li>
      ))}
    </ul>
  );
}

/* ── Order history: every round that was fired against this bill ─────
   This is what the "View details" button opens. A sitting is ordered in rounds, and the
   bill's total only makes sense next to them — including a round that was cancelled,
   which is shown struck through rather than quietly omitted. */
export function BillOrderHistory({ bill, className }) {
  const batches = bill?.batches ?? [];
  if (batches.length === 0) {
    return (
      <p className={cn("py-4 text-sm text-muted-foreground", className)}>
        No orders have been placed on this bill yet.
      </p>
    );
  }

  return (
    <ol className={cn("space-y-3", className)}>
      {batches.map((batch, i) => {
        const cancelled = batch.status === "cancelled";
        return (
          <li
            key={batch.orderId ?? i}
            className={cn(
              "rounded-xl border border-brand-cream/60 bg-white p-3",
              cancelled && "opacity-70",
            )}
          >
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
              <span className="flex items-center gap-2 text-sm font-bold">
                <Receipt className="h-3.5 w-3.5 shrink-0 text-brand-orange" />
                Round {batch.round ?? i + 1}
                {batch.orderCode ? (
                  <span className="font-mono text-[11px] font-normal text-muted-foreground">
                    #{batch.orderCode}
                  </span>
                ) : null}
              </span>
              <span
                className={cn(
                  "text-sm font-semibold",
                  cancelled && "text-muted-foreground line-through",
                )}
              >
                {formatMoney(batch.batchTotal)}
              </span>
            </div>

            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
              {batch.placedAt ? <span>{formatTime(batch.placedAt)}</span> : null}
              <span>{placedByLabel(batch)}</span>
              {batch.status ? <span className="capitalize">{humanize(batch.status)}</span> : null}
              {batch.itemCount ? <span>{batch.itemCount} items</span> : null}
            </div>

            <ul className="mt-2 space-y-1 border-t border-brand-cream/50 pt-2 text-xs">
              {(batch.items ?? []).map((item, j) => (
                <li key={`${item.name}-${j}`} className="flex justify-between gap-3">
                  <span className="min-w-0">
                    <span className={cn(cancelled && "line-through")}>
                      {item.quantity} × {item.name}
                    </span>
                    {item.note ? (
                      <span className="block italic text-muted-foreground">{item.note}</span>
                    ) : null}
                  </span>
                  <span className={cn("shrink-0", cancelled && "line-through")}>
                    {formatMoney(item.lineTotal)}
                  </span>
                </li>
              ))}
            </ul>

            {cancelled ? (
              <p className="mt-2 text-[11px] font-semibold text-brand-maroon">
                Cancelled — not charged on this bill.
              </p>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

/* ── Every charge that makes up the total ────────────────────────── */
export function BillCharges({ bill, className }) {
  const lines = chargeLines(bill);
  return (
    <div className={cn("space-y-1.5 text-sm", className)}>
      {lines.map((line) => (
        <div key={line.key} className="flex justify-between gap-3">
          <span className="text-muted-foreground">{line.label}</span>
          <span className={cn("font-medium", line.tone === "credit" && "text-brand-green")}>
            {line.tone === "credit"
              ? `−${formatMoney(Math.abs(line.value))}`
              : formatMoney(line.value)}
          </span>
        </div>
      ))}
      <div className="flex justify-between gap-3 border-t border-brand-cream/70 pt-2 text-base">
        <span className="font-bold">Total payable</span>
        <span className="font-bold text-brand-red">{formatMoney(bill?.charges?.grandTotal)}</span>
      </div>
    </div>
  );
}

/* ── Settled or still open, and against what reference ───────────── */
export function BillPaymentStrip({ bill, className }) {
  const payment = paymentSummary(bill);

  if (!payment.isPaid) {
    return (
      <p
        className={cn(
          "rounded-xl bg-brand-cream/40 px-3 py-2.5 text-center text-xs font-semibold text-[#5a403e]",
          className,
        )}
      >
        {payment.status === "cancelled"
          ? "This bill was cancelled."
          : "Not settled yet — this bill is still open."}
      </p>
    );
  }

  return (
    <div
      className={cn(
        "rounded-xl bg-emerald-50 px-3 py-2.5 text-center text-xs font-semibold text-emerald-700",
        className,
      )}
    >
      Paid{payment.method ? ` by ${payment.method}` : ""}
      {payment.paidAt ? ` · ${formatDateTime(payment.paidAt)}` : ""}
      {payment.transactionId ? (
        <span className="mt-0.5 block font-mono text-[10px] font-normal opacity-80">
          Txn {payment.transactionId}
        </span>
      ) : null}
    </div>
  );
}

/**
 * The whole receipt. `defaultHistoryOpen` seeds the "View details" disclosure; pass
 * `historyOpen`/`onToggleHistory` to drive it from a button elsewhere on the screen
 * (the owner console puts one in the page header).
 */
export default function BillDocument({
  bill,
  historyOpen,
  onToggleHistory,
  defaultHistoryOpen = false,
  footer,
  className,
}) {
  const [internalOpen, setInternalOpen] = useState(defaultHistoryOpen);
  const controlled = historyOpen !== undefined;
  const open = controlled ? historyOpen : internalOpen;
  const toggle = () => (controlled ? onToggleHistory?.(!open) : setInternalOpen((v) => !v));

  if (!bill) return null;

  return (
    <div className={cn("space-y-4", className)}>
      <BillHeader bill={bill} />

      <div className="flex flex-wrap items-center gap-2">
        <BillTableBadge bill={bill} />
        <span className="rounded-full border border-brand-cream bg-white px-3 py-1 text-xs font-bold">
          {bill.billNumber ?? bill.reference}
        </span>
      </div>

      <BillFacts bill={bill} className="rounded-xl bg-brand-cream/25 p-3" />

      <div>
        <h3 className="mb-1 text-sm font-bold">Items</h3>
        <BillItems bill={bill} />
      </div>

      <div>
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          className="flex w-full items-center justify-between rounded-xl border border-brand-cream bg-white px-3 py-2.5 text-sm font-semibold transition hover:bg-brand-cream/25"
        >
          <span>
            View details
            {bill.orderCount ? (
              <span className="ml-1.5 font-normal text-muted-foreground">
                · {bill.orderCount} {bill.orderCount === 1 ? "round" : "rounds"}
                {bill.cancelledOrderCount
                  ? `, ${bill.cancelledOrderCount} cancelled`
                  : ""}
              </span>
            ) : null}
          </span>
          {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
        {open ? (
          <div className="mt-3">
            <h3 className="mb-2 text-sm font-bold">Order history</h3>
            <BillOrderHistory bill={bill} />
          </div>
        ) : null}
      </div>

      <BillCharges bill={bill} className="border-t border-brand-cream/70 pt-3" />
      <BillPaymentStrip bill={bill} />
      {footer}
    </div>
  );
}
