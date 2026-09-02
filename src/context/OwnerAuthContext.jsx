import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { authApi } from "@/api/auth.api";
import { ownerApi } from "@/api/owner.api";
import {
  setAccessToken,
  getAccessToken,
  refreshSession,
  isAuthFailure,
} from "@/api/client";

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
  // False until GET /owner/restaurants has answered at least once this session.
  // ApprovalGate waits on this so a page refresh doesn't flash the locked screen
  // at an owner whose cached restaurant is stale.
  const [restaurantsLoaded, setRestaurantsLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  // Non-null when the last GET /owner/restaurants failed. Distinct from "this
  // owner has no restaurant" — see refreshRestaurant below.
  const [restaurantsError, setRestaurantsError] = useState(null);

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
  //
  // Only a 401 ends the session. Every other failure — a 429 from the API rate
  // limiter (a dashboard load fires ~25 calls, so a few quick reloads trip it),
  // a 5xx, a dropped connection — leaves the refresh cookie perfectly valid, and
  // signing the owner out over one would be wrong. The screens' next request
  // carries no token, gets a 401 UNAUTHORIZED, and the client interceptor
  // refreshes then, so the portal recovers on its own.
  useEffect(() => {
    if (!user || getAccessToken("owner")) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    refreshSession("owner")
      .catch((err) => {
        if (cancelled || !isAuthFailure(err)) return;
        setUser(null);
        setRestaurant(null);
        localStorage.removeItem(PROFILE_KEY);
        localStorage.removeItem(RESTAURANT_KEY);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-reads GET /owner/restaurants and replaces the cached copy. This is how an
  // admin's approve/reject reaches the portal: `approvalStatus` lives on the
  // restaurant document, and the cached one in localStorage would otherwise stay
  // "pending" until the owner signed in again.
  // Deliberately no `getAccessToken("owner")` guard: when the mount refresh above failed
  // transiently the owner is still signed in, just tokenless. The request goes out
  // bare, comes back 401 UNAUTHORIZED, and the client interceptor refreshes and
  // replays it — which is how the portal heals itself. Bailing out here instead
  // would leave `restaurantsLoaded` false forever and hang ApprovalGate.
  const refreshRestaurant = useCallback(async () => {
    setRefreshing(true);
    try {
      const { data } = await ownerApi.listRestaurants();
      const list = data.data.restaurants ?? [];
      // Keep the same restaurant selected across refreshes; fall back to the first.
      setRestaurant((current) => {
        if (list.length === 0) return null;
        return list.find((r) => r._id === current?._id) ?? list[0];
      });
      setRestaurantsError(null);
      setRestaurantsLoaded(true);
      return list;
    } catch (err) {
      // A failed load must not read as "this owner has no restaurant" — that
      // would drop an approved owner onto the create-restaurant form. Surface
      // the failure and let ApprovalGate offer a retry instead.
      setRestaurantsError(err);
      setRestaurantsLoaded(true);
      throw err;
    } finally {
      setRefreshing(false);
    }
  }, []);

  // Once the session is settled, load the owner's restaurants. Covers login and
  // page refresh, and re-runs on every mount so the cached approvalStatus is
  // verified against the server rather than trusted.
  useEffect(() => {
    if (!user) {
      setRestaurantsLoaded(true);
      return;
    }
    if (loading) return; // still minting an access token
    refreshRestaurant().catch(() => { /* surfaced via restaurantsError */ });
  }, [user, loading, refreshRestaurant]);

  // While the restaurant is not yet approved, poll for the admin's decision and
  // re-check whenever the tab regains focus, so the portal unlocks on its own
  // instead of making the owner reload. Stops once it's active.
  useEffect(() => {
    if (!user || !restaurant || restaurant.approvalStatus === "active") return;

    const check = () => { refreshRestaurant().catch(() => {}); };
    const id = setInterval(check, 60_000);
    window.addEventListener("focus", check);
    return () => {
      clearInterval(id);
      window.removeEventListener("focus", check);
    };
  }, [user, restaurant, refreshRestaurant]);

  // Kept for callers that want the list back (StoreSettings after creating one).
  const fetchRestaurants = refreshRestaurant;

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
    setAccessToken("owner", accessToken);
    setUser(u);
    try {
      await refreshRestaurant();
    } catch { /* non-critical — the mount effect retries */ }
    return u;
  }, [refreshRestaurant]);

  const signup = useCallback(async ({ name, email, password, phone }) => {
    const { data } = await authApi.ownerSignup({ name, email, password, phone });
    const { user: u, accessToken } = data.data;
    setAccessToken("owner", accessToken);
    setUser(u);
    // A fresh owner has no restaurant yet — ApprovalGate sends them straight to
    // /store-settings to submit one for admin review.
    setRestaurant(null);
    setRestaurantsLoaded(true);
    return u;
  }, []);

  const logout = useCallback(async () => {
    try { await authApi.ownerLogout(); } catch { /* silent */ }
    setAccessToken("owner", null);
    setUser(null);
    setRestaurant(null);
    setRestaurantsLoaded(true);
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
        hasRestaurant: !!restaurant,
        loading,
        restaurantsLoaded,
        restaurantsError,
        refreshing,
        refreshRestaurant,
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
