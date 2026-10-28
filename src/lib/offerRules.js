// Personal offers — the rules the owner's form checks before anything is sent, in one place.
// They mirror the backend exactly (server/config/liveActivity.config.js, § Rules in
// LIVE_ACTIVITY_IMPLEMENTATION_PROMPTS.md); the server checks them again and is the authority.

import { errorMessage } from "@/lib/errors";

export const OFFER_LIMITS = Object.freeze({
  titleMax: 40,
  percentageMin: 1,
  percentageMax: 50,
  flatMin: 1,
  flatMax: 500,
  capMin: 1,
  capMax: 500,
  itemsMax: 20,
  perCustomerPerDay: 3,
});

export const EXPIRY_CHOICES = Object.freeze([
  { minutes: 15, label: "15 minutes" },
  { minutes: 30, label: "30 minutes" },
  { minutes: 60, label: "1 hour" },
  { minutes: 180, label: "3 hours" },
  { minutes: 1440, label: "24 hours" },
]);

// Why the Send button is off — the session row's `notEligibleReason`.
export const NOT_ELIGIBLE_TEXT = Object.freeze({
  GUEST: "Guest — not eligible",
  OPTED_OUT: "Customer turned off activity sharing",
  OFFER_OPEN: "Already has an active offer",
  DAILY_LIMIT: `Daily limit reached (${OFFER_LIMITS.perCustomerPerDay} per day)`,
  SESSION_CLOSED: "Customer has left",
});

// The preview's `issue`, in words.
export const PREVIEW_ISSUE_TEXT = Object.freeze({
  NO_CART: "No items in cart yet",
  OFFER_NOT_APPLICABLE: "None of the chosen dishes are in their cart",
  DISCOUNT_MIN_VALUE: "Their cart is below the minimum order",
});

// Every error the offer endpoints can answer with, in plain words (API.md § Error codes).
export const OFFER_ERROR_TEXT = Object.freeze({
  SESSION_NOT_FOUND: "This customer's visit is no longer available.",
  GUEST_NOT_ELIGIBLE: "Guests can't receive offers.",
  OPTED_OUT: "This customer turned off activity sharing.",
  SESSION_CLOSED: "The customer has left.",
  OFFER_ALREADY_ACTIVE: "This customer already has an open offer from you.",
  DAILY_OFFER_LIMIT: `Daily limit reached — at most ${OFFER_LIMITS.perCustomerPerDay} offers per customer per day.`,
  OFFER_TOO_LARGE: "The discount is outside the allowed range: 1–50% or ₹1–₹500, with a cap of at most ₹500.",
  INVALID_EXPIRY: "Choose how long the offer lasts: 10 minutes to 24 hours.",
  ITEM_NOT_IN_MENU: "One of the chosen dishes isn't on your menu any more.",
  OFFER_NOT_REVOCABLE: "This offer is already being used or has ended.",
  OFFER_NOT_FOUND: "This offer no longer exists.",
  RATE_LIMITED: "Too many offers in a minute — please wait a moment and try again.",
  VALIDATION_ERROR: "Some offer details aren't valid. Check them and try again.",
});

export const offerErrorText = (err) => OFFER_ERROR_TEXT[err?.code] ?? errorMessage(err);

/** Rupees without empty paise: "₹100", "₹95.50". */
export const rupees = (value) => {
  const amount = Number(value) || 0;
  const whole = Number.isInteger(amount);
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: whole ? 0 : 2,
  }).format(amount);
};

/** Paise from the API, the same way. */
export const paiseText = (paise) => rupees((paise ?? 0) / 100);

/** "15% off (up to ₹100)" / "₹50 off". */
export const offerValueText = ({ type, percentage, flatAmount, maxDiscountAmount }) =>
  type === "percentage" ? `${percentage}% off (up to ${rupees(maxDiscountAmount)})` : `${rupees(flatAmount)} off`;

export const expiryLabel = (minutes) => EXPIRY_CHOICES.find((c) => c.minutes === Number(minutes))?.label ?? `${minutes} minutes`;

export const EMPTY_OFFER_FORM = Object.freeze({
  title: "",
  type: "percentage",
  value: "",
  maxDiscount: "100",
  minimumOrder: "",
  expiresInMinutes: 30,
  items: [],
});

const isWhole = (text) => /^\d+$/.test(String(text).trim());

/**
 * Field → message for everything the server would refuse, checked the same way it does.
 * An empty object means the form can be sent.
 */
export function validateOfferForm(form) {
  const L = OFFER_LIMITS;
  const errors = {};
  const title = form.title.trim();
  if (!title) errors.title = "Give the offer a title — the customer sees it.";
  else if (title.length > L.titleMax) errors.title = `At most ${L.titleMax} characters.`;

  const [min, max] = form.type === "percentage" ? [L.percentageMin, L.percentageMax] : [L.flatMin, L.flatMax];
  const value = Number(form.value);
  if (!isWhole(form.value)) errors.value = "Enter a whole number.";
  else if (value < min || value > max) {
    errors.value = form.type === "percentage" ? `Between ${min}% and ${max}%.` : `Between ${rupees(min)} and ${rupees(max)}.`;
  }

  const cap = Number(form.maxDiscount);
  if (String(form.maxDiscount).trim() === "") errors.maxDiscount = "A maximum discount is required.";
  else if (!isWhole(form.maxDiscount)) errors.maxDiscount = "Enter a whole number of rupees.";
  else if (cap < L.capMin || cap > L.capMax) errors.maxDiscount = `Between ${rupees(L.capMin)} and ${rupees(L.capMax)}.`;
  else if (form.type === "flat_amount" && !errors.value && cap < value) errors.maxDiscount = "Must be at least the flat amount.";

  if (String(form.minimumOrder).trim() !== "" && !isWhole(form.minimumOrder)) {
    errors.minimumOrder = "Enter a whole number of rupees, or leave it empty.";
  }
  if (!EXPIRY_CHOICES.some((c) => c.minutes === Number(form.expiresInMinutes))) errors.expiresInMinutes = "Choose how long it lasts.";
  if (form.items.length > L.itemsMax) errors.items = `At most ${L.itemsMax} dishes.`;
  return errors;
}

/** The POST /live/offers body for a valid form. */
export function offerBody(form, sessionId, { preview = false } = {}) {
  const isPercentage = form.type === "percentage";
  return {
    sessionId,
    title: form.title.trim(),
    type: form.type,
    ...(isPercentage ? { percentage: Number(form.value) } : { flatAmount: Number(form.value) }),
    maxDiscountAmount: Number(form.maxDiscount),
    ...(String(form.minimumOrder).trim() !== "" ? { minimumOrderValue: Number(form.minimumOrder) } : {}),
    expiresInMinutes: Number(form.expiresInMinutes),
    ...(form.items.length ? { applicableItems: form.items } : {}),
    ...(preview ? { preview: true } : {}),
  };
}
