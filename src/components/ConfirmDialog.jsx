// The one confirmation step for actions that can't be taken back — deletes, rejecting or
// cancelling an order, signing staff out, money moving. Routine forward steps (accept,
// preparing, ready, served) stay one tap; this is only for the ones a stray tap would hurt.
//
// The caller keeps the mutation and fires it from `onConfirm` only, then closes the dialog
// (set `open` false) on success and on error. While `pending`, every way out is disabled so
// the dialog can't vanish mid-request.
//
// Rendered into document.body: callers sit inside table rows, transformed sidebars and
// other z-50 overlays (the waiter's bill panel, the bank account form), none of which a
// fixed-position child can reliably escape from in place.

import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function ConfirmDialog({
  open,
  title,
  description,
  children,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  // Shown on the confirm button while the request is in flight.
  pendingLabel,
  tone = "default",
  // A node for the round badge above the title. Omitted: a warning sign for `danger`,
  // nothing for `default`. Pass null to hide it.
  icon,
  iconClassName,
  pending = false,
  onConfirm,
  onCancel,
}) {
  const id = useId();
  const titleId = `${id}-title`;
  const bodyId = `${id}-body`;

  // Escape backs out, like the backdrop — never while the request is in flight. Captured at
  // the window and stopped there so the overlay underneath (which may close on Escape too)
  // doesn't also react to the same key press.
  const onCancelRef = useRef(onCancel);
  onCancelRef.current = onCancel;
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      if (!pending) onCancelRef.current?.();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, pending]);

  // Hand focus back to whatever opened the dialog once it closes.
  useEffect(() => {
    if (!open) return undefined;
    const opener = document.activeElement;
    return () => {
      if (opener && typeof opener.focus === "function" && document.contains(opener)) {
        opener.focus();
      }
    };
  }, [open]);

  if (!open) return null;

  const badge =
    icon === undefined ? (tone === "danger" ? <AlertTriangle className="size-5" /> : null) : icon;
  const body = description ?? children;

  return createPortal(
    // z-[60]: above every z-50 overlay in the app (bill panel, bank form, mobile sidebar).
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
      data-testid="confirm-dialog-backdrop"
      onClick={(e) => {
        e.stopPropagation();
        if (!pending) onCancel?.();
      }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={body ? bodyId : undefined}
        className="w-full max-w-sm rounded-2xl bg-white p-5 text-left shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {badge ? (
          <div
            className={cn(
              "mb-3 flex size-11 items-center justify-center rounded-full",
              tone === "danger" ? "bg-red-50 text-destructive" : "bg-[#FFF4E5] text-[#8A4B00]",
              iconClassName,
            )}
          >
            {badge}
          </div>
        ) : null}
        <h2 id={titleId} className="text-lg font-bold text-foreground">
          {title}
        </h2>
        {body ? (
          <div id={bodyId} className="mt-1.5 space-y-2 text-sm text-muted-foreground">
            {typeof body === "string" ? <p>{body}</p> : body}
          </div>
        ) : null}
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={onCancel} disabled={pending} autoFocus>
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant={tone === "danger" ? "destructive" : "default"}
            onClick={onConfirm}
            disabled={pending}
          >
            {pending && pendingLabel ? pendingLabel : confirmLabel}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
