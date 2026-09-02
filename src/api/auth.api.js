import client, { assertPortal } from "./client";

// Each portal has its OWN login endpoint (API.md § Authentication). A token
// minted by one portal is only usable for that portal's role, and each login
// endpoint rejects credentials belonging to another role with
// 401 INVALID_CREDENTIALS — never a "wrong role" error.
//
//   Customer        POST /api/auth/login
//   Restaurant owner POST /api/owner/auth/login
//   Super admin     POST /api/admin/auth/login
//   Staff (PIN)     POST /api/staff/auth/login
//
// /api/auth/refresh and /api/auth/logout are shared across customer/owner/admin,
// but each portal has its OWN httpOnly refresh cookie (server/utils/refreshCookie.js)
// because cookies ignore the port and the portals share one browser jar.
//   refresh — name the cookie with ?portal=. Omitting it makes the server fall
//             back to the pre-split shared cookie, find nothing, and answer
//             401 INVALID_TOKEN "No refresh token".
//   logout  — authenticated, so the server picks the cookie from req.user.role.

export const authApi = {
  // ── Shared (customer / owner / admin) ───────────────────────────────────
  // Prefer refreshSession() from api/client — it is single-flight, retries
  // transient failures and tells an expired session apart from a flaky one.
  refresh: (portal) => client.post(`/auth/refresh?portal=${assertPortal(portal)}`),
  logout:  () => client.post("/auth/logout"),

  // ── Customer ────────────────────────────────────────────────────────────
  // Always creates a `customer` account — there is no `role` field.
  customerSignup: ({ name, email, password }) =>
    client.post("/auth/signup", { name, email, password }),
  customerLogin: ({ email, password }) =>
    client.post("/auth/login", { email, password }),

  // Customer phone/OTP login. `devOtp` is present in the response outside
  // production only.
  customerOtpSend: ({ phone }) =>
    client.post("/auth/customer/otp/send", { phone }),
  customerOtpVerify: ({ phone, code, tosAccepted }) =>
    client.post("/auth/customer/otp/verify", { phone, code, tosAccepted }),

  // ── Restaurant owner ────────────────────────────────────────────────────
  ownerSignup: ({ name, email, password, phone }) =>
    client.post("/owner/auth/signup", { name, email, password, phone }),
  ownerLogin: ({ email, password }) =>
    client.post("/owner/auth/login", { email, password }),
  ownerLogout: () => client.post("/owner/auth/logout"),

  // ── Super admin ─────────────────────────────────────────────────────────
  // No public signup — admins are provisioned via scripts/seedSuperAdmin.js.
  adminLogin: ({ email, password }) =>
    client.post("/admin/auth/login", { email, password }),
  adminLogout: () => client.post("/admin/auth/logout"),

  // ── Staff (staff code + PIN) ────────────────────────────────────────────
  // _staff: true tells the interceptor to attach the staff token, not the
  // owner access token. Login and the restaurant picker need no token.
  //
  // Credentials are issued by the restaurant owner in /staff (StaffManagement):
  // the auto-assigned staffCode (W01, C02…) plus the PIN the owner set. A staff
  // code is only unique WITHIN a restaurant, so restaurantId is part of the
  // identity, not a hint — which is why the picker comes first on the login screen.
  staffRestaurantSearch: ({ q, lat, lng, signal }) =>
    client.get("/staff/auth/restaurants", {
      params: { q, ...(lat != null && lng != null ? { lat, lng } : {}) },
      signal,
    }),
  staffLogin: ({ restaurantId, staffCode, pin }) =>
    client.post("/staff/auth/login", { restaurantId, staffCode, pin }),
  // Re-validates the localStorage token on boot: it outlives deactivation and
  // restaurant suspension, so the cached profile alone is not proof of a session.
  staffSession: () => client.get("/staff/auth/me", { _staff: true }),
  staffLogout: () => client.post("/staff/auth/logout", {}, { _staff: true }),
};
