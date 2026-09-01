// The API client (api/client.js) normalises every failed response into an Error
// carrying `code`/`status` from the server envelope. Anything without those came
// from the browser instead — a bug, a dropped connection, a CORS block — and its
// message ("x is not a function", "Network Error") means nothing to a restaurant
// owner, so it never reaches the screen.

// Server codes we phrase ourselves, because the raw copy leaks internals or is
// too terse to act on. Everything else falls through to the server's message,
// which is written for end users.
const FRIENDLY = {
  RESTAURANT_NOT_APPROVED: "This restaurant is still under review.",
  NOT_OWNER: "You don't have access to this restaurant.",
  FORBIDDEN: "You don't have access to this restaurant.",
  UNAUTHORIZED: "Your session has expired. Please sign in again.",
  TOKEN_EXPIRED: "Your session has expired. Please sign in again.",
  INVALID_TOKEN: "Your session has expired. Please sign in again.",
  RATE_LIMITED: "Too many attempts. Please wait a moment and try again.",
  VALIDATION_ERROR: null, // keep the server's field-level message
};

export function isApiError(err) {
  return !!(err && (err.code || err.status));
}

/**
 * User-facing message for a caught error.
 * @param {unknown} err       the caught error
 * @param {string}  fallback  copy shown for anything not from the API
 */
export function errorMessage(err, fallback = "Something went wrong. Please try again.") {
  if (!isApiError(err)) return fallback;
  if (err.code && err.code in FRIENDLY && FRIENDLY[err.code]) return FRIENDLY[err.code];
  if (err.status >= 500) return "The server is having trouble right now. Please try again.";
  return err.message || fallback;
}

// True when the error is just "the restaurant isn't approved yet" — screens
// already show a dedicated notice for that and shouldn't double up with a
// red error banner.
export function isNotApprovedError(err) {
  return err?.code === "RESTAURANT_NOT_APPROVED";
}
