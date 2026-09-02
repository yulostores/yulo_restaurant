import client from "./client";

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
// /api/auth/refresh and /api/auth/logout are shared across customer/owner/admin
// because they key off the refreshToken cookie, not the login endpoint used.

export const authApi = {
  // ── Shared (customer / owner / admin) ───────────────────────────────────
  // Prefer refreshSession() from api/client — it is single-flight, retries
  // transient failures and tells an expired session apart from a flaky one.
  refresh: () => client.post("/auth/refresh"),
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

  // ── Staff (PIN-based) ───────────────────────────────────────────────────
  // _staff: true tells the interceptor to attach the staff token, not the
  // owner access token. Login itself needs no token.
  // NOTE: the server identifies the staff member by restaurantId + PIN alone —
  // there is no staffCode in the request body.
  staffLogin: ({ restaurantId, pin }) =>
    client.post("/staff/auth/login", { restaurantId, pin }),
  staffLogout: () => client.post("/staff/auth/logout", {}, { _staff: true }),
};
