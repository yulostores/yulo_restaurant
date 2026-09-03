import axios from "axios";
import { API_BASE } from "./config";

// One session per portal, kept apart end to end.
//
// The owner portal and the customer QR app are served from the same origin, and
// the super admin portal from a sibling port that shares the browser cookie jar.
// A single access-token slot meant whichever provider refreshed last won, and
// the owner screens went out carrying a customer token. Each portal keeps its
// own token here, and asks the server for its own refresh cookie (?portal=, see
// server/utils/refreshCookie.js).
//
// Access tokens live in memory only — never localStorage.
// The staff token is the exception: it goes to localStorage so it survives tab
// closes and mobile browser background kills (waiters and chefs work long shifts
// and refresh the page often).
export const PORTALS = ["owner", "customer", "admin"];

const _tokens = { owner: null, customer: null, admin: null };
let _staffToken = null;

export function assertPortal(portal) {
  if (!PORTALS.includes(portal)) throw new Error(`Unknown portal: ${portal}`);
  return portal;
}

export function setAccessToken(portal, token) {
  _tokens[assertPortal(portal)] = token;
}
export function getAccessToken(portal) {
  return _tokens[assertPortal(portal)];
}

export function setStaffToken(token) {
  _staffToken = token;
  if (token) localStorage.setItem("yulo_staff_token", token);
  else localStorage.removeItem("yulo_staff_token");
}
export function getStaffToken() {
  if (!_staffToken) _staffToken = localStorage.getItem("yulo_staff_token");
  return _staffToken;
}

// Single Axios instance for all API calls.
const client = axios.create({
  baseURL: `${API_BASE}/api`,
  withCredentials: true,
});

// Which session a request belongs to. Role-scoped paths answer for themselves;
// the handful of endpoints two portals share (/users/me, /cuisines) are tagged
// by the caller with `_portal`, because the URL cannot say who is asking.
export function portalForRequest(config) {
  if (config._staff) return "staff";
  if (config._portal) return assertPortal(config._portal);
  const url = config.url ?? "";
  if (url.startsWith("/owner")) return "owner";
  if (url.startsWith("/admin")) return "admin";
  if (url.startsWith("/staff")) return "staff";
  return "customer";
}

// ── Request interceptor ─────────────────────────────────────────────────────
client.interceptors.request.use((config) => {
  const portal = portalForRequest(config);
  const token = portal === "staff" ? getStaffToken() : getAccessToken(portal);
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// ── Session refresh ─────────────────────────────────────────────────────────
// POST /api/auth/refresh mints a new access token from that portal's httpOnly
// refresh cookie. It is called on a raw axios instance so the response
// interceptor below can never recurse into itself.
//
// Single-flight per portal: a page load mounts several auth providers and fires
// a burst of screen queries, all of which can discover a missing or expired
// token at the same moment. They share one in-flight request rather than
// stampeding the endpoint.
const _refreshing = { owner: null, customer: null, admin: null };
const _blockedUntil = { owner: 0, customer: 0, admin: 0 };
const _lastError = { owner: null, customer: null, admin: null };

// After a transient failure, hold off briefly. Without this, a still-unhealthy
// endpoint would be hit once per screen query (each 401 below asks for a
// refresh), turning one bad moment into a burst.
const COOLDOWN_MS = 5000;

export function refreshSession(portal) {
  assertPortal(portal);
  if (_refreshing[portal]) return _refreshing[portal];
  if (Date.now() < _blockedUntil[portal]) return Promise.reject(_lastError[portal]);

  _refreshing[portal] = attemptRefresh(portal).finally(() => {
    _refreshing[portal] = null;
  });
  return _refreshing[portal];
}

async function attemptRefresh(portal, attempt = 0) {
  try {
    // No request body on purpose: an `{}` payload makes axios set
    // Content-Type: application/json, which turns this into a preflighted CORS
    // request. The endpoint reads only the refresh cookie, and a failed
    // preflight surfaces as a network error — hiding the 401 that tells us the
    // session is actually over.
    const { data } = await axios.post(
      `${API_BASE}/api/auth/refresh?portal=${portal}`,
      undefined,
      { withCredentials: true },
    );
    const token = data.data.accessToken;
    setAccessToken(portal, token);
    _blockedUntil[portal] = 0;
    _lastError[portal] = null;
    return token;
  } catch (rawErr) {
    const err = normalise(rawErr, rawErr.response?.data?.code);
    // A dropped connection or a server hiccup is worth one more try; an auth
    // failure or a rate limit is not (the limiter window is a full minute).
    const worthRetrying = err.status === undefined || err.status >= 500;
    if (worthRetrying && attempt < 2) {
      await new Promise((r) => setTimeout(r, 300 * 2 ** attempt));
      return attemptRefresh(portal, attempt + 1);
    }
    if (isAuthFailure(err)) {
      setAccessToken(portal, null);
      for (const handler of _sessionEndedHandlers[portal]) handler();
    } else {
      _lastError[portal] = err;
      _blockedUntil[portal] = Date.now() + COOLDOWN_MS;
    }
    throw err;
  }
}

// True only when the refresh cookie itself is gone, expired or rejected — i.e.
// the session really is over and the user has to sign in again.
//
// Everything else (429 from the rate limiter, 5xx, a dropped connection, a CORS
// failure) is transient: the cookie is still in the browser and the next attempt
// will very likely succeed, so callers must NOT tear the session down for those.
export function isAuthFailure(err) {
  return err?.status === 401;
}

// ── Session-ended notification ──────────────────────────────────────────────
// A refresh answering 401 means that portal's session is genuinely over — the
// cookie is gone, expired or rejected — and no later request can heal it.
//
// The auth providers used to learn this only from their own mount-time refresh,
// so a session that ended mid-visit left the portal mounted and looking signed
// in while every screen failed in its own words ("Could not load your documents.
// Refresh the page to try again.") — and the reload each of them invites is what
// finally signs the owner out, which reads as the reload having caused it. The
// providers subscribe here instead, so the session ends where it actually ended.
const _sessionEndedHandlers = {
  owner: new Set(),
  customer: new Set(),
  admin: new Set(),
};

export function onSessionEnded(portal, handler) {
  const handlers = _sessionEndedHandlers[assertPortal(portal)];
  handlers.add(handler);
  return () => handlers.delete(handler);
}

// ── Response interceptor — auto-refresh for owner/customer/admin tokens ─────
// Retried on any 401 a fresh access token could fix: TOKEN_EXPIRED, a revoked
// INVALID_TOKEN, and UNAUTHORIZED (no token attached at all — which is what the
// screens send when an earlier refresh failed transiently). Retrying UNAUTHORIZED
// is what lets a portal heal itself instead of sitting there signed in but
// unable to load anything.
const RECOVERABLE_401 = new Set(["TOKEN_EXPIRED", "INVALID_TOKEN", "UNAUTHORIZED"]);

// A failed request made with `responseType: "blob"` (document previews) hands back an
// error body that is a Blob, not the parsed envelope — so `data.code` and `data.message`
// are both undefined. That silently costs more than a vague message: the 401 auto-refresh
// below keys off `code`, so without this a document fetch on an expired token would fail
// outright instead of healing like every other call. Read the blob back into the envelope
// the rest of this interceptor expects.
async function unpackBlobError(err) {
  const data = err.response?.data;
  if (typeof Blob === "undefined" || !(data instanceof Blob)) return;
  if (data.type && !data.type.includes("json")) return;
  try {
    err.response.data = JSON.parse(await data.text());
  } catch {
    // Not JSON after all — leave it alone and let normalise fall back to err.message.
  }
}

client.interceptors.response.use(
  (res) => res,
  async (err) => {
    await unpackBlobError(err);
    const original = err.config ?? {};
    const code = err.response?.data?.code;
    const portal = original.url === undefined ? null : portalForRequest(original);

    // Staff token expired or revoked — clear storage and redirect to login.
    // The redirect is skipped when the login screen is already mounted: its own
    // boot check (GET /staff/auth/me) is exactly the call that surfaces a stale
    // token, and replacing the URL with the one already showing would reload the
    // page instead of letting StaffAuthContext fall through to the form.
    if (
      portal === "staff" &&
      (code === "TOKEN_EXPIRED" || code === "INVALID_TOKEN") &&
      err.response?.status === 401
    ) {
      setStaffToken(null);
      localStorage.removeItem("yulo_staff_profile");
      if (!window.location.pathname.startsWith("/staff/login")) {
        window.location.replace("/staff/login");
      }
      return Promise.reject(normalise(err, code));
    }

    // Only auto-refresh owner/customer/admin access tokens, not staff tokens —
    // staff sign in with a PIN and have no refresh cookie.
    if (
      err.response?.status === 401 &&
      RECOVERABLE_401.has(code) &&
      !original._retried &&
      portal &&
      portal !== "staff"
    ) {
      original._retried = true;
      try {
        const token = await refreshSession(portal);
        original.headers = { ...original.headers, Authorization: `Bearer ${token}` };
        return client(original);
      } catch (refreshErr) {
        return Promise.reject(refreshErr);
      }
    }

    return Promise.reject(normalise(err, code));
  },
);

// Unwrap Axios error so callers get a plain Error with the API message.
function normalise(err, code) {
  const message = err.response?.data?.message ?? err.message ?? "Request failed";
  const apiError = new Error(message);
  apiError.code = code ?? err.response?.data?.code;
  apiError.status = err.response?.status;
  apiError.details = err.response?.data?.details;
  return apiError;
}

export default client;
