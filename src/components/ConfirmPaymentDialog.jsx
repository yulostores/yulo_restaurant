// The last check before a dine-in bill is closed as paid at the counter. Marking it paid closes
// the bill, frees the table and books the sale against the restaurant, and none of that can be
// undone from here — one stray tap on the wrong table's bill used to do all of it. Shared by the
// owner's Bills screen and the waiter's bill panel so both ask the same question.

import { useEffect } from "react";
import { Wallet } from "lucide-react";

import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/bill";

export default function ConfirmPaymentDialog({
  open,
  amount,
  methodLabel,
  tableNumber,
  pending = false,
  onConfirm,
  onCancel,
}) {
  // Escape backs out, like the backdrop — never while the request is in flight.
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape" && !pending) onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, pending, onCancel]);

  if (!open) return null;

  return (
    // Above the waiter's bill panel, which is itself a z-50 overlay.
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
      onClick={() => !pending && onCancel()}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-payment-title"
        aria-describedby="confirm-payment-body"
        className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex size-11 items-center justify-center rounded-full bg-[#FFF4E5]">
          <Wallet className="size-5 text-[#8A4B00]" />
        </div>
        <h2 id="confirm-payment-title" className="text-lg font-bold">
          Confirm payment received
        </h2>
        <div id="confirm-payment-body" className="mt-1.5 space-y-2 text-sm text-muted-foreground">
          <p>
            Have you received{" "}
            <span className="font-bold text-foreground">{formatMoney(amount)}</span> by{" "}
            <span className="font-bold text-foreground">{methodLabel}</span>
            {tableNumber ? (
              <>
                {" "}for <span className="font-bold text-foreground">Table {tableNumber}</span>
              </>
            ) : null}
            ?
          </p>
          <p>This closes the bill and frees the table. It can&apos;t be undone.</p>
        </div>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={onCancel} disabled={pending} autoFocus>
            Cancel
          </Button>
          <Button onClick={onConfirm} disabled={pending}>
            {pending ? "Closing…" : "Yes, payment received"}
          </Button>
        </div>
      </div>
    </div>
  );
}
