// Operating hours as the API stores them: an array of
// { day, isOpen, openTime, closeTime } where the times are HHMM integers
// (900 = 09:00, 2200 = 22:00) — see models/Restaurant.js `operatingHoursSchema`.
//
// Shared so the owner's Store Settings form and the customer's QR landing screen read
// the same encoding. The customer screen used to look for an `openingHours` map of
// { monday: { open, close } } string times, which no endpoint has ever returned, so its
// hours line and its open/closed badge were both dead.

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

// "HH:MM", the value an <input type="time"> expects.
export function hhmmToTime(value) {
  if (value == null) return "";
  const n = Number(value);
  if (!Number.isFinite(n)) return "";
  return `${String(Math.floor(n / 100)).padStart(2, "0")}:${String(n % 100).padStart(2, "0")}`;
}

export function timeToHhmm(time) {
  if (!time) return null;
  const [h, m] = time.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 100 + m;
}

// "9:00 AM" — for reading, not for editing.
export function formatHhmm(value) {
  const time = hhmmToTime(value);
  if (!time) return "";
  const [h, m] = time.split(":").map(Number);
  const suffix = h < 12 ? "AM" : "PM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, "0")} ${suffix}`;
}

export function hoursForDay(operatingHours, date = new Date()) {
  if (!Array.isArray(operatingHours)) return null;
  const day = WEEKDAYS[date.getDay()];
  return operatingHours.find((h) => h.day === day) ?? null;
}

// "9:00 AM – 10:00 PM" for today, or null when the restaurant has no entry for today or
// is marked closed on it.
export function todayHoursLabel(operatingHours, date = new Date()) {
  const slot = hoursForDay(operatingHours, date);
  if (!slot || slot.isOpen === false) return null;
  const open = formatHhmm(slot.openTime);
  const close = formatHhmm(slot.closeTime);
  return open && close ? `${open} – ${close}` : null;
}

// Whether the restaurant is serving right now. Returns null when there are no hours on
// record — "unknown" is not the same as "closed", and callers shouldn't show a red badge
// for a restaurant that simply never filled its hours in.
export function isOpenNow(operatingHours, date = new Date()) {
  const slot = hoursForDay(operatingHours, date);
  if (!slot) return null;
  if (slot.isOpen === false) return false;
  if (slot.openTime == null || slot.closeTime == null) return null;

  const now = date.getHours() * 100 + date.getMinutes();
  // A closing time at or before the opening time runs past midnight (18:00 → 02:00).
  return slot.closeTime <= slot.openTime
    ? now >= slot.openTime || now < slot.closeTime
    : now >= slot.openTime && now < slot.closeTime;
}
