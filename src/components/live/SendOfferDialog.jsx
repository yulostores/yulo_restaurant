// Send a personal offer to the customer in one live visit. The form checks every rule
// before anything is sent (src/lib/offerRules.js); while it's valid, the server prices it
// against the customer's current cart (a `preview: true` dry run) so the owner sees exactly
// what they'd save. Sending goes through ConfirmDialog. API.md → Send an offer.

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Gift, X } from "lucide-react";

import ConfirmDialog from "@/components/ConfirmDialog";
import { useToast } from "@/components/Toaster";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useMenuItems } from "@/hooks/owner/useMenuItems";
import { useOfferPreview, useSendOffer } from "@/hooks/owner/useLiveSessions";
import {
  EMPTY_OFFER_FORM,
  EXPIRY_CHOICES,
  NOT_ELIGIBLE_TEXT,
  OFFER_LIMITS,
  PREVIEW_ISSUE_TEXT,
  expiryLabel,
  offerBody,
  offerErrorText,
  offerValueText,
  paiseText,
  validateOfferForm,
} from "@/lib/offerRules";
import { cn } from "@/lib/utils";

function FieldError({ id, message }) {
  return message ? (
    <p id={id} className="text-xs text-brand-maroon">
      {message}
    </p>
  ) : null;
}

function PreviewLine({ valid, eligible, preview }) {
  let text;
  if (!eligible) text = null;
  else if (!valid) text = "Fill in the offer to see what they'd save.";
  else if (preview.status === "error") text = offerErrorText(preview.error);
  else if (preview.status !== "ready") text = "Checking their cart…";
  else if (preview.preview.issue) text = PREVIEW_ISSUE_TEXT[preview.preview.issue] ?? "Nothing to save on their cart right now";
  else {
    const { cartTotalPaise, wouldSavePaise } = preview.preview;
    text = `On their ${paiseText(cartTotalPaise)} cart: ${paiseText(wouldSavePaise)} off`;
  }
  return text ? (
    <p aria-live="polite" data-testid="offer-preview" className="rounded-lg bg-[#FFF6EF] px-3 py-2 text-sm font-medium text-[#5a403e]">
      {text}
    </p>
  ) : null;
}

export default function SendOfferDialog({ restaurantId, session, onClose }) {
  const id = useId();
  const toast = useToast();
  const [form, setForm] = useState(EMPTY_OFFER_FORM);
  const [dirty, setDirty] = useState({});
  const [capTouched, setCapTouched] = useState(false);
  const [dishQuery, setDishQuery] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [sendError, setSendError] = useState(null);
  const sending = useRef(false);

  const send = useSendOffer(restaurantId);
  const { data: menu = [] } = useMenuItems(restaurantId);
  const eligible = Boolean(session.offerEligible);
  const errors = validateOfferForm(form);
  const valid = Object.keys(errors).length === 0;
  const preview = useOfferPreview(restaurantId, valid && eligible ? offerBody(form, session.id) : null);

  // The customer can become ineligible while the dialog is open (left, opted out, another
  // owner's tab sent an offer): the reason shows, and an open confirmation goes away.
  useEffect(() => {
    if (!eligible) setConfirming(false);
  }, [eligible]);

  // Escape closes, except mid-send.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape" && !send.isPending && !confirming) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [confirming, onClose, send.isPending]);

  const set = (field, value) => {
    setForm((f) => {
      const next = { ...f, [field]: value };
      // A flat offer's cap follows its amount until the owner sets the cap themselves.
      if (next.type === "flat_amount" && !capTouched && (field === "value" || field === "type")) next.maxDiscount = next.value;
      if (field === "type" && value === "percentage" && !capTouched) next.maxDiscount = EMPTY_OFFER_FORM.maxDiscount;
      return next;
    });
    setDirty((d) => ({ ...d, [field]: true }));
    setSendError(null);
  };
  const show = (field) => (dirty[field] ? errors[field] : undefined);

  const dishes = useMemo(() => {
    const q = dishQuery.trim().toLowerCase();
    return menu.filter((item) => !q || item.name.toLowerCase().includes(q)).slice(0, 50);
  }, [menu, dishQuery]);
  const toggleDish = (dishId) =>
    set("items", form.items.includes(dishId) ? form.items.filter((d) => d !== dishId) : [...form.items, dishId]);

  const review = (event) => {
    event.preventDefault();
    setDirty({ title: true, value: true, maxDiscount: true, minimumOrder: true, expiresInMinutes: true, items: true });
    if (!valid || !eligible) return;
    setConfirming(true);
  };

  const confirmSend = async () => {
    if (sending.current) return; // a second click while the first is in flight
    sending.current = true;
    try {
      await send.mutateAsync(offerBody(form, session.id));
      toast.success(`Offer sent to ${session.displayName}`);
      onClose();
    } catch (err) {
      setConfirming(false);
      setSendError(offerErrorText(err));
    } finally {
      sending.current = false;
    }
  };

  const terms = {
    type: form.type,
    percentage: form.value,
    flatAmount: form.value,
    maxDiscountAmount: form.maxDiscount,
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => !send.isPending && !confirming && onClose()}>
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        onSubmit={review}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[90vh] w-full max-w-lg space-y-4 overflow-y-auto rounded-2xl bg-white p-5 shadow-xl"
        noValidate
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id={`${id}-title`} className="flex items-center gap-2 text-lg font-bold">
              <Gift className="h-5 w-5 text-brand-orange" /> Send an offer to {session.displayName}
            </h2>
            <p className="text-xs text-muted-foreground">Only they see it. Restaurant-funded, usable once.</p>
          </div>
          <button type="button" aria-label="Close" onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        {!eligible ? (
          <p role="alert" className="rounded-lg bg-[#FCE9E4] px-3 py-2 text-sm text-[#B11226]">
            Can't send: {NOT_ELIGIBLE_TEXT[session.notEligibleReason] ?? "this customer can't receive offers right now"}
          </p>
        ) : null}

        <div className="space-y-1.5">
          <div className="flex justify-between">
            <Label htmlFor={`${id}-name`}>Title</Label>
            <span className={cn("text-xs", form.title.trim().length > OFFER_LIMITS.titleMax ? "text-brand-maroon" : "text-muted-foreground")}>
              {form.title.trim().length}/{OFFER_LIMITS.titleMax}
            </span>
          </div>
          <Input
            id={`${id}-name`}
            value={form.title}
            onChange={(e) => set("title", e.target.value)}
            placeholder="A treat for you"
            aria-invalid={!!show("title")}
            aria-describedby={`${id}-name-error`}
          />
          <FieldError id={`${id}-name-error`} message={show("title")} />
        </div>

        <fieldset className="space-y-1.5">
          <legend className="text-sm font-medium">Discount type</legend>
          <div className="flex gap-4 text-sm">
            {[
              ["percentage", "Percentage"],
              ["flat_amount", "Flat amount"],
            ].map(([value, label]) => (
              <label key={value} className="flex items-center gap-1.5">
                <input type="radio" name={`${id}-type`} value={value} checked={form.type === value} onChange={() => set("type", value)} />
                {label}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-value`}>{form.type === "percentage" ? "Discount (%)" : "Discount (₹)"}</Label>
            <Input
              id={`${id}-value`}
              inputMode="numeric"
              value={form.value}
              onChange={(e) => set("value", e.target.value)}
              placeholder={form.type === "percentage" ? "1–50" : "1–500"}
              aria-invalid={!!show("value")}
              aria-describedby={`${id}-value-error`}
            />
            <FieldError id={`${id}-value-error`} message={show("value")} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-cap`}>Maximum discount (₹)</Label>
            <Input
              id={`${id}-cap`}
              inputMode="numeric"
              value={form.maxDiscount}
              onChange={(e) => {
                setCapTouched(true);
                set("maxDiscount", e.target.value);
              }}
              aria-invalid={!!show("maxDiscount")}
              aria-describedby={`${id}-cap-error`}
            />
            <FieldError id={`${id}-cap-error`} message={show("maxDiscount")} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-min`}>Minimum order (₹, optional)</Label>
            <Input
              id={`${id}-min`}
              inputMode="numeric"
              value={form.minimumOrder}
              onChange={(e) => set("minimumOrder", e.target.value)}
              placeholder="None"
              aria-invalid={!!show("minimumOrder")}
              aria-describedby={`${id}-min-error`}
            />
            <FieldError id={`${id}-min-error`} message={show("minimumOrder")} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-expiry`}>Valid for</Label>
            <select
              id={`${id}-expiry`}
              value={form.expiresInMinutes}
              onChange={(e) => set("expiresInMinutes", Number(e.target.value))}
              className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
            >
              {EXPIRY_CHOICES.map((choice) => (
                <option key={choice.minutes} value={choice.minutes}>
                  {choice.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={`${id}-dishes`}>Dishes (optional — empty means the whole order)</Label>
          <Input id={`${id}-dishes`} value={dishQuery} onChange={(e) => setDishQuery(e.target.value)} placeholder="Search dishes" />
          <ul className="max-h-36 space-y-1 overflow-y-auto rounded-lg border border-brand-cream/60 p-2 text-sm" aria-label="Dishes">
            {dishes.map((item) => {
              const checked = form.items.includes(item._id);
              const full = !checked && form.items.length >= OFFER_LIMITS.itemsMax;
              return (
                <li key={item._id}>
                  <label className={cn("flex items-center gap-2", full && "opacity-50")}>
                    <input type="checkbox" checked={checked} disabled={full} onChange={() => toggleDish(item._id)} />
                    {item.name}
                  </label>
                </li>
              );
            })}
            {dishes.length === 0 ? <li className="text-muted-foreground">No dishes match.</li> : null}
          </ul>
          <p className="text-xs text-muted-foreground">
            {form.items.length}/{OFFER_LIMITS.itemsMax} chosen
          </p>
          <FieldError message={show("items")} />
        </div>

        <PreviewLine valid={valid} eligible={eligible} preview={preview} />
        {sendError ? (
          <p role="alert" className="text-sm text-brand-maroon">
            {sendError}
          </p>
        ) : null}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={!eligible || send.isPending} className="bg-brand-gradient text-white hover:brightness-105">
            Review & send
          </Button>
        </div>
      </form>

      <ConfirmDialog
        open={confirming}
        title={`Send ${offerValueText(terms)} to ${session.displayName}, valid ${expiryLabel(form.expiresInMinutes)}?`}
        description={`"${form.title.trim()}" goes to their app now. It can be revoked until they use it.`}
        icon={<Gift className="size-5" />}
        confirmLabel="Send offer"
        pendingLabel="Sending…"
        pending={send.isPending}
        onConfirm={confirmSend}
        onCancel={() => setConfirming(false)}
      />
    </div>
  );
}
