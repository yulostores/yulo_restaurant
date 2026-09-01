import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { authApi } from "@/api/auth.api";
import { setAccessToken, getAccessToken } from "@/api/client";

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

  useEffect(() => {
    if (admin && !getAccessToken()) {
      authApi.refresh()
        .then(({ data }) => setAccessToken(data.data.accessToken))
        .catch(() => { setAdmin(null); localStorage.removeItem(PROFILE_KEY); })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const login = useCallback(async ({ email, password }) => {
    const { data } = await authApi.adminLogin({ email, password });
    const { user, accessToken } = data.data;
    setAccessToken(accessToken);
    setAdmin(user);
    return user;
  }, []);

  const logout = useCallback(async () => {
    try { await authApi.adminLogout(); } catch { /* silent */ }
    setAccessToken(null);
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
