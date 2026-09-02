import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { authApi } from "@/api/auth.api";
import { setStaffToken, getStaffToken } from "@/api/client";

// Staff sign in with restaurantId + staffCode + PIN (POST /api/staff/auth/login).
// A staff code (W01, C02…) is unique only within one restaurant, so all three
// fields together are the identity — see server/models/StaffMember.js.
//
// The staff token is long-lived (8h) and lives in localStorage so a shift
// survives tab closes and a phone locking itself. Because it outlives the facts
// it was minted from — a member can be deactivated, a restaurant suspended — the
// cached profile is treated as a hint, never as proof: on boot we re-validate
// against GET /api/staff/auth/me and render from whatever that returns.

const PROFILE_KEY = "yulo_staff_profile";

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

function toProfile(member) {
  return {
    id: String(member._id),
    name: member.name,
    role: member.role,
    staffCode: member.staffCode,
    restaurantId: String(member.restaurantId),
    restaurantName: member.restaurantName ?? null,
    restaurantLogo: member.restaurantLogo ?? null,
  };
}

const StaffAuthContext = createContext(null);

export function StaffAuthProvider({ children }) {
  // Optimistic first paint from the cached profile so a returning waiter is not
  // bounced to the login screen for the length of one round trip.
  const [staff, setStaff] = useState(readProfile);
  // False until the token has been checked against the server (or found absent).
  // StaffRoute waits on this instead of redirecting on a still-unknown session.
  const [ready, setReady] = useState(() => !getStaffToken());

  useEffect(() => {
    if (ready) return;
    let cancelled = false;

    authApi
      .staffSession()
      .then(({ data }) => {
        if (cancelled) return;
        const profile = toProfile(data.data.staff);
        writeProfile(profile);
        setStaff(profile);
      })
      .catch(() => {
        // Any failure here means the token cannot be used: expired, revoked, the
        // member deactivated, or the restaurant suspended. The 401 cases are
        // already cleared by the client interceptor; clear the rest too so the
        // login screen starts from a clean slate rather than a ghost profile.
        if (cancelled) return;
        setStaffToken(null);
        localStorage.removeItem(PROFILE_KEY);
        setStaff(null);
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

  const login = useCallback(async ({ restaurantId, staffCode, pin }) => {
    const { data } = await authApi.staffLogin({ restaurantId, staffCode, pin });
    const { staff: member, staffToken } = data.data;
    setStaffToken(staffToken);
    const profile = toProfile(member);
    writeProfile(profile);
    setStaff(profile);
    setReady(true);
    return profile;
  }, []);

  const logout = useCallback(async () => {
    try {
      await authApi.staffLogout();
    } catch {
      /* the token is being discarded either way */
    }
    setStaffToken(null);
    localStorage.removeItem(PROFILE_KEY);
    setStaff(null);
    setReady(true);
  }, []);

  return (
    <StaffAuthContext.Provider
      value={{ staff, ready, login, logout, isAuthenticated: !!staff }}
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
