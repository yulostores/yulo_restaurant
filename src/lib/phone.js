// Indian mobile numbers as the staff login uses them: 10 digits, no country code —
// the same shape the backend stores (server/utils/phone.js). The owner types a staff
// member's number once and the member types it at every login, so both screens go
// through these helpers.

// The number in whatever was typed or pasted ("+91 98765 43210", "098765…"). Anything
// that isn't a 10-digit number after dropping a country code / leading 0 is returned as
// the raw digits, so isValidPhone() rejects it — silently cutting a stray 11th digit
// would send a number nobody typed.
export function toPhoneDigits(value) {
  let digits = String(value ?? "").replace(/\D/g, "");
  // Only an exact 12 ("91" + number) or 11 ("0" + number) is a prefix. Checking just
  // "longer than 10" would, on a number that itself starts 91 (9123456780), strip it the
  // moment an 11th digit is typed.
  if (digits.length === 12 && digits.startsWith("91")) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  return digits;
}

// Indian mobile numbers are 10 digits starting 6-9.
export const isValidPhone = (digits) => /^[6-9]\d{9}$/.test(String(digits ?? ""));

// What a phone field may hold while it's being typed: digits, a leading "+", spaces
// and dashes. The field keeps the text as typed and the number is read from the whole
// of it (toPhoneDigits) — cleaning up keystroke by keystroke turned a typed
// "+91 98765 43210" into "9198765432" before the prefix could be recognised.
export function sanitizePhoneInput(value) {
  return String(value ?? "").replace(/[^\d+\s-]/g, "").slice(0, 17);
}

// "98765 43210" — as it's read aloud.
export function formatPhone(digits) {
  const d = String(digits ?? "");
  return d.length > 5 ? `${d.slice(0, 5)} ${d.slice(5)}` : d;
}
