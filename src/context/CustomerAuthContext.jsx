import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { authApi } from "@/api/auth.api";
import { setAccessToken, getAccessToken } from "@/api/client";

// Customer auth: email/password (POST /api/auth/{signup,login}) or phone/OTP
// (POST /api/auth/customer/otp/{send,verify}). Signup always creates a
// `customer` — the endpoint takes no role field.
//
// Access token in memory, refresh token in an HttpOnly cookie, display profile
// in localStorage.

const PROFILE_KEY = "yulo_customer_profile";

function readProfile() {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

const CustomerAuthContext = createContext(null);

export function CustomerAuthProvider({ children }) {
  const [customer, setCustomer] = useState(() => readProfile());
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    if (customer) localStorage.setItem(PROFILE_KEY, JSON.stringify(customer));
    else          localStorage.removeItem(PROFILE_KEY);
  }, [customer]);

  // Silent refresh if the profile survived a reload but the token did not.
  useEffect(() => {
    if (customer && !getAccessToken()) {
      authApi.refresh()
        .then(({ data }) => setAccessToken(data.data.accessToken))
        .catch(() => { setCustomer(null); localStorage.removeItem(PROFILE_KEY); })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const login = useCallback(async ({ email, password }) => {
    const { data } = await authApi.customerLogin({ email, password });
    const { user: u, accessToken } = data.data;
    setAccessToken(accessToken);
    setCustomer(u);
    return u;
  }, []);

  const signup = useCallback(async ({ name, email, password }) => {
    const { data } = await authApi.customerSignup({ name, email, password });
    const { user: u, accessToken } = data.data;
    setAccessToken(accessToken);
    setCustomer(u);
    return u;
  }, []);

  // ── Phone / OTP ──────────────────────────────────────────────────────
  // Returns { phone, devOtp? } — devOtp is only present outside production.
  const sendOtp = useCallback(async (phone) => {
    const { data } = await authApi.customerOtpSend({ phone });
    return data.data;
  }, []);

  const verifyOtp = useCallback(async ({ phone, code, tosAccepted = true }) => {
    const { data } = await authApi.customerOtpVerify({ phone, code, tosAccepted });
    const { user: u, accessToken, isNewUser } = data.data;
    setAccessToken(accessToken);
    setCustomer(u);
    return { user: u, isNewUser };
  }, []);

  const logout = useCallback(async () => {
    try { await authApi.logout(); } catch { /* silent */ }
    setAccessToken(null);
    setCustomer(null);
  }, []);

  return (
    <CustomerAuthContext.Provider
      value={{
        customer,
        loading,
        login,
        signup,
        sendOtp,
        verifyOtp,
        logout,
        isAuthenticated: !!customer,
      }}
    >
      {children}
    </CustomerAuthContext.Provider>
  );
}

export function useCustomerAuth() {
  const ctx = useContext(CustomerAuthContext);
  if (!ctx) throw new Error("useCustomerAuth must be inside CustomerAuthProvider");
  return ctx;
}
