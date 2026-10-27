// The last check before a dine-in bill is closed as paid at the counter. Marking it paid closes
// the bill, frees the table and books the sale against the restaurant, and none of that can be
// undone from here — one stray tap on the wrong table's bill used to do all of it. Shared by the
// owner's Bills screen and the waiter's bill panel so both ask the same question.

import { Wallet } from "lucide-react";

import ConfirmDialog from "@/components/ConfirmDialog";
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
  return (
    <ConfirmDialog
      open={open}
      title="Confirm payment received"
      icon={<Wallet className="size-5" />}
      confirmLabel="Yes, payment received"
      pendingLabel="Closing…"
      pending={pending}
      onConfirm={onConfirm}
      onCancel={onCancel}
    >
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
    </ConfirmDialog>
  );
}
