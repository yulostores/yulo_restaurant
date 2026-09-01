import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { authApi } from "@/api/auth.api";
import { ownerApi } from "@/api/owner.api";
import { setAccessToken, getAccessToken } from "@/api/client";

// Owner auth uses the owner-only endpoints: POST /api/owner/auth/{signup,login,logout}.
// A customer or admin account is rejected there with 401 INVALID_CREDENTIALS.
// Refresh is the shared POST /api/auth/refresh (keys off the refreshToken cookie).
//
// Access token stays in memory; only non-sensitive display data is persisted.

const PROFILE_KEY = "yulo_owner_profile";
const RESTAURANT_KEY = "yulo_owner_restaurant";

function readJson(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

const OwnerAuthContext = createContext(null);

export function OwnerAuthProvider({ children }) {
  const [user, setUser] = useState(() => readJson(PROFILE_KEY));
  const [restaurant, setRestaurant] = useState(() => readJson(RESTAURANT_KEY));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (restaurant) localStorage.setItem(RESTAURANT_KEY, JSON.stringify(restaurant));
    else localStorage.removeItem(RESTAURANT_KEY);
  }, [restaurant]);

  useEffect(() => {
    if (user) localStorage.setItem(PROFILE_KEY, JSON.stringify(user));
    else localStorage.removeItem(PROFILE_KEY);
  }, [user]);

  // On mount: profile exists but the in-memory token is gone (page refresh) —
  // silently mint a new access token from the refresh cookie.
  useEffect(() => {
    if (user && !getAccessToken()) {
      authApi.refresh()
        .then(({ data }) => setAccessToken(data.data.accessToken))
        .catch(() => {
          setUser(null);
          setRestaurant(null);
          localStorage.removeItem(PROFILE_KEY);
          localStorage.removeItem(RESTAURANT_KEY);
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Once we have a token and no restaurant selected, load the owner's
  // restaurants and pick the first. Covers both login and page refresh.
  useEffect(() => {
    if (!user || !getAccessToken() || restaurant) return;

    ownerApi.listRestaurants()
      .then(({ data }) => {
        const list = data.data.restaurants ?? [];
        if (list.length > 0) setRestaurant(list[0]);
      })
      .catch(() => { /* non-critical — screens render their empty state */ });
  }, [user, restaurant]);

  const fetchRestaurants = useCallback(async () => {
    const { data } = await ownerApi.listRestaurants();
    const list = data.data.restaurants ?? [];
    if (list.length > 0) setRestaurant(list[0]);
    return list;
  }, []);

  // The cached copies below are display-only (top bar name, avatar, restaurant name) and
  // are otherwise refreshed just at login. A screen that saves one of those fields calls
  // these so the chrome updates immediately instead of showing the old value until the
  // next sign-in — /profile for the user, /store-settings for the restaurant.
  const updateUser = useCallback(
    (patch) => setUser((u) => (u ? { ...u, ...patch } : u)),
    [],
  );
  const updateRestaurant = useCallback(
    (patch) => setRestaurant((r) => (r ? { ...r, ...patch } : r)),
    [],
  );

  const login = useCallback(async ({ email, password }) => {
    const { data } = await authApi.ownerLogin({ email, password });
    const { user: u, accessToken } = data.data;
    setAccessToken(accessToken);
    setUser(u);
    try {
      const { data: rData } = await ownerApi.listRestaurants();
      const list = rData.data.restaurants ?? [];
      if (list.length > 0) setRestaurant(list[0]);
    } catch { /* non-critical */ }
    return u;
  }, []);

  const signup = useCallback(async ({ name, email, password, phone }) => {
    const { data } = await authApi.ownerSignup({ name, email, password, phone });
    const { user: u, accessToken } = data.data;
    setAccessToken(accessToken);
    setUser(u);
    // A fresh owner has no restaurant yet — StoreSettings prompts them to
    // submit one for admin review.
    return u;
  }, []);

  const logout = useCallback(async () => {
    try { await authApi.ownerLogout(); } catch { /* silent */ }
    setAccessToken(null);
    setUser(null);
    setRestaurant(null);
  }, []);

  return (
    <OwnerAuthContext.Provider
      value={{
        user,
        restaurant,
        restaurantId: restaurant?._id ?? null,
        // "pending" | "active" | "suspended" | "rejected" | "expired"
        approvalStatus: restaurant?.approvalStatus ?? null,
        isApproved: restaurant?.approvalStatus === "active",
        loading,
        login,
        signup,
        logout,
        fetchRestaurants,
        updateUser,
        updateRestaurant,
        isAuthenticated: !!user,
      }}
    >
      {children}
    </OwnerAuthContext.Provider>
  );
}

export function useOwnerAuth() {
  const ctx = useContext(OwnerAuthContext);
  if (!ctx) throw new Error("useOwnerAuth must be inside OwnerAuthProvider");
  return ctx;
}

// Safe version — returns null outside the provider.
export function useOwnerAuthSafe() {
  return useContext(OwnerAuthContext);
}
