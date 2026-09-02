import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { authApi } from "@/api/auth.api";
import {
  setAccessToken,
  getAccessToken,
  refreshSession,
  isAuthFailure,
} from "@/api/client";

// Super-admin auth (POST /api/admin/auth/login). There is no public admin
// signup — accounts are provisioned server-side via scripts/seedSuperAdmin.js.
// Refresh is the shared POST /api/auth/refresh.

const PROFILE_KEY = "yulo_admin_profile";

function readProfile() {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

const AdminAuthContext = createContext(null);

export function AdminAuthProvider({ children }) {
  const [admin, setAdmin]     = useState(() => readProfile());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (admin) localStorage.setItem(PROFILE_KEY, JSON.stringify(admin));
    else       localStorage.removeItem(PROFILE_KEY);
  }, [admin]);

  // Only a real 401 ends the session — a 429, 5xx or dropped connection leaves
  // the refresh cookie valid, so keep the admin signed in and let the client
  // interceptor refresh on the next request. See OwnerAuthContext for the full
  // reasoning.
  useEffect(() => {
    if (!admin || getAccessToken("admin")) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    refreshSession("admin")
      .catch((err) => {
        if (cancelled || !isAuthFailure(err)) return;
        setAdmin(null);
        localStorage.removeItem(PROFILE_KEY);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const login = useCallback(async ({ email, password }) => {
    const { data } = await authApi.adminLogin({ email, password });
    const { user, accessToken } = data.data;
    setAccessToken("admin", accessToken);
    setAdmin(user);
    return user;
  }, []);

  const logout = useCallback(async () => {
    try { await authApi.adminLogout(); } catch { /* silent */ }
    setAccessToken("admin", null);
    setAdmin(null);
  }, []);

  return (
    <AdminAuthContext.Provider
      value={{ admin, loading, login, logout, isAuthenticated: !!admin }}
    >
      {children}
    </AdminAuthContext.Provider>
  );
}

export function useAdminAuth() {
  const ctx = useContext(AdminAuthContext);
  if (!ctx) throw new Error("useAdminAuth must be inside AdminAuthProvider");
  return ctx;
}
