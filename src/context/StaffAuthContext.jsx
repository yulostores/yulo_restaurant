import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { authApi } from "@/api/auth.api";
import { setStaffToken, getStaffToken } from "@/api/client";

// Staff sign in with their own phone number and a one-time code sent to it
// (POST /api/staff/auth/otp/send, then /otp/verify). The owner registers the number
// in /staff; the same number can be staff at more than one restaurant, so every
// login is for the restaurant picked first on the login screen.
//
// A session lasts exactly 24 hours from sign-in and is never refreshed — every
// waiter and chef signs in again the next day. The token lives in localStorage so
// a shift survives tab closes and a phone locking itself; because it outlives the
// facts it was minted from (a member can be deactivated, their phone changed, a
// restaurant suspended), the cached profile is treated as a hint, never as proof:
// on boot we re-validate against GET /api/staff/auth/me and render from that.

const PROFILE_KEY = "yulo_staff_profile";
// Where staff work (and sign in) — see homeRouteForRole and App.jsx.
const STAFF_PATHS = ["/waiter", "/chef", "/staff/login"];

function readProfile() {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeProfile(profile) {
  try {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  } catch {
    /* private mode / quota — the session still works for this tab */
  }
}

// When the session ends, on THIS device's clock. Restaurant tablets often have the wrong
// date or time; comparing the server's expiresAt with such a clock would sign a waiter out
// hours early — or, a day off, the instant they sign in. The server also says how many
// seconds are left, which is correct whatever the device clock says.
function localExpiry({ expiresInSeconds, expiresAt }) {
  if (typeof expiresInSeconds === "number" && Number.isFinite(expiresInSeconds)) {
    return new Date(Date.now() + Math.max(0, expiresInSeconds) * 1000).toISOString();
  }
  return expiresAt ?? null;
}

function toProfile(member, expiresAt) {
  return {
    id: String(member._id),
    name: member.name,
    role: member.role,
    staffCode: member.staffCode,
    phone: member.phone ?? null,
    restaurantId: String(member.restaurantId),
    restaurantName: member.restaurantName ?? null,
    restaurantLogo: member.restaurantLogo ?? null,
    // ISO time the 24h session ends.
    expiresAt: expiresAt ?? null,
  };
}

const isExpired = (profile) =>
  !!profile?.expiresAt && Date.now() >= new Date(profile.expiresAt).getTime();

// The session is genuinely over, as opposed to the check merely failing (no signal,
// a server hiccup): only these may sign a waiter out mid-shift.
const isSessionOver = (err) =>
  err?.status === 401 || (err?.status === 403 && err?.code === "RESTAURANT_UNAVAILABLE");

const StaffAuthContext = createContext(null);

// What the device held at load: a usable cached shift, or a reason the old one is over.
// A profile from the PIN login has no expiry at all — its token no longer works.
function initialSession() {
  const cached = readProfile();
  if (!cached) return { profile: null, ended: false };
  if (!cached.expiresAt || isExpired(cached)) return { profile: null, ended: true };
  return { profile: cached, ended: false };
}

export function StaffAuthProvider({ children }) {
  const [initial] = useState(initialSession);
  // Optimistic first paint from the cached profile so a returning waiter is not
  // bounced to the login screen for the length of one round trip.
  const [staff, setStaff] = useState(initial.profile);
  // True when this device's previous shift ran out (24h) or was from the old PIN
  // login — the login screen says so instead of silently showing an empty form.
  const [sessionEnded, setSessionEnded] = useState(initial.ended);
  // False until the token has been checked against the server (or found absent).
  // StaffRoute waits on this instead of redirecting on a still-unknown session.
  const [ready, setReady] = useState(() => !getStaffToken() || !staff);

  const clearSession = useCallback(() => {
    setStaffToken(null);
    localStorage.removeItem(PROFILE_KEY);
    setStaff(null);
  }, []);

  // Boot: a stored token with no usable profile (old PIN login, expired) is dropped
  // straight away; otherwise it's re-validated.
  useEffect(() => {
    if (!staff && (getStaffToken() || initial.ended)) {
      setStaffToken(null);
      localStorage.removeItem(PROFILE_KEY);
    }
    if (ready) return undefined;
    let cancelled = false;

    authApi
      .staffSession()
      .then(({ data }) => {
        if (cancelled) return;
        const profile = toProfile(data.data.staff, localExpiry(data.data));
        writeProfile(profile);
        setStaff(profile);
      })
      .catch((err) => {
        if (cancelled) return;
        // Expired, revoked, deactivated, phone changed, restaurant suspended: the login
        // screen starts from a clean slate. Anything else — a dropped connection, a 5xx —
        // keeps the cached shift; the next call will tell.
        if (isSessionOver(err)) clearSession();
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });

    return () => {
      cancelled = true;
    };
    // Runs once: `ready` only ever goes false -> true.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // End the shift the moment the 24h are up, even if the screen is just sitting open.
  // Timers are throttled or frozen in a background tab, so the check also runs
  // whenever the tab comes back into view.
  const expiryTimer = useRef(null);
  useEffect(() => {
    clearTimeout(expiryTimer.current);
    if (!staff?.expiresAt) return undefined;

    const endIfExpired = () => {
      if (!isExpired(staff)) return false;
      // Another tab may have signed in since; its session, not this stale one, is what's
      // stored now — leave it alone and let the storage listener below reload this tab.
      if (readProfile()?.expiresAt && readProfile().expiresAt !== staff.expiresAt) return true;
      clearSession();
      if (!window.location.pathname.startsWith("/staff/login")) {
        window.location.replace("/staff/login?session=ended");
      }
      return true;
    };
    if (endIfExpired()) return undefined;

    const ms = new Date(staff.expiresAt).getTime() - Date.now();
    expiryTimer.current = setTimeout(endIfExpired, Math.min(ms + 500, 2 ** 31 - 1));
    const onVisible = () => {
      if (document.visibilityState === "visible") endIfExpired();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      clearTimeout(expiryTimer.current);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [staff, clearSession]);

  // Tabs share one stored session. When another tab signs in (a new day, or a different
  // member on a shared tablet) or signs out, this tab reloads to match rather than carry
  // on with a token or profile that is no longer the device's.
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key !== "yulo_staff_token" || e.newValue === e.oldValue) return;
      // Only the staff screens: this provider wraps the whole portal, and an owner tab
      // (a half-filled form) must not reload because a waiter signed in next to it.
      if (!STAFF_PATHS.some((p) => window.location.pathname.startsWith(p))) return;
      window.location.reload();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // Step 1: ask for a code. Resolves with { otpBypass, devOtp } flags from the server.
  const requestCode = useCallback(async ({ restaurantId, phone }) => {
    const { data } = await authApi.staffOtpSend({ restaurantId, phone });
    return data.data ?? {};
  }, []);

  // Step 2: exchange the code for the day's session.
  const verifyCode = useCallback(async ({ restaurantId, phone, code }) => {
    const { data } = await authApi.staffOtpVerify({ restaurantId, phone, code });
    const { staff: member, staffToken } = data.data;
    setStaffToken(staffToken);
    const profile = toProfile(member, localExpiry(data.data));
    writeProfile(profile);
    setStaff(profile);
    setSessionEnded(false);
    setReady(true);
    return profile;
  }, []);

  const logout = useCallback(async () => {
    try {
      await authApi.staffLogout();
    } catch {
      /* the token is being discarded either way */
    }
    clearSession();
    setReady(true);
  }, [clearSession]);

  return (
    <StaffAuthContext.Provider
      value={{ staff, ready, sessionEnded, requestCode, verifyCode, logout, isAuthenticated: !!staff }}
    >
      {children}
    </StaffAuthContext.Provider>
  );
}

export function useStaffAuth() {
  const ctx = useContext(StaffAuthContext);
  if (!ctx) throw new Error("useStaffAuth must be inside StaffAuthProvider");
  return ctx;
}

// Where a signed-in member belongs. Used by both the login screen and StaffRoute
// so the two can never disagree about which portal a role opens.
export function homeRouteForRole(role) {
  return role === "chef" ? "/chef" : "/waiter";
}
