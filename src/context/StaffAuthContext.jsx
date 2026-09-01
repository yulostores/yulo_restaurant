import { createContext, useCallback, useContext, useState } from "react";
import { authApi } from "@/api/auth.api";
import { setStaffToken, getStaffToken } from "@/api/client";

// Staff sign in with restaurantId + PIN (POST /api/staff/auth/login). The server
// identifies the member from the PIN alone — there is no staff code in the body.
// The staff token is long-lived (8h) and lives in localStorage so the session
// survives tab closes and mobile browser restarts during a shift.

const PROFILE_KEY = "yulo_staff_profile";

function readProfile() {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

const StaffAuthContext = createContext(null);

export function StaffAuthProvider({ children }) {
  const [staff, setStaff] = useState(() => {
    const profile = readProfile();
    // Rehydrate the token into the client module for the Axios interceptor.
    if (profile) getStaffToken();
    return profile;
  });

  const login = useCallback(async ({ restaurantId, pin }) => {
    const { data } = await authApi.staffLogin({ restaurantId, pin });
    const { staff: member, staffToken } = data.data;
    setStaffToken(staffToken);
    const profile = {
      id: member._id,
      name: member.name,
      role: member.role,
      restaurantId: member.restaurantId ?? restaurantId,
    };
    localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
    setStaff(profile);
    return profile;
  }, []);

  const logout = useCallback(async () => {
    try { await authApi.staffLogout(); } catch { /* silent */ }
    setStaffToken(null);
    localStorage.removeItem(PROFILE_KEY);
    setStaff(null);
  }, []);

  return (
    <StaffAuthContext.Provider
      value={{ staff, login, logout, isAuthenticated: !!staff }}
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
