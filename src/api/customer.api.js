import client from "./client";

// Customer uses the shared JWT flow (POST /api/auth/login or the phone/OTP
// endpoints — see auth.api.js). Public restaurant endpoints need no token.

function idempotencyKey() {
  // Guards against duplicate orders on a network retry (API.md § Idempotency).
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export const customerApi = {
  // ── Public Restaurants & Menu (no auth) ───────────────────────────
  // params: { lat, lng, radius, cuisine, page, limit }
  listRestaurants: (params = {}) => client.get("/restaurants", { params }),

  getRestaurant: (restaurantId) => client.get(`/restaurants/${restaurantId}`),

  // Returns { menu: [{ _id, name, subCategories: [{ _id, name, items }], items }] }
  getMenu: (restaurantId) => client.get(`/restaurants/${restaurantId}/menu`),

  getReviews: (restaurantId, params = {}) =>
    client.get(`/restaurants/${restaurantId}/reviews`, { params }),

  // ── Customer Orders ───────────────────────────────────────────────
  // NOTE: the documented POST /api/orders only accepts type "delivery" and
  // requires a deliveryAddress. There is no customer-initiated dine-in order
  // endpoint — dine-in orders are placed by a waiter via the staff API.
  createOrder: (body) =>
    client.post("/orders", body, { headers: { "Idempotency-Key": idempotencyKey() } }),

  listOrders: (params = {}) => client.get("/orders", { params }),
  getOrder:   (orderId)     => client.get(`/orders/${orderId}`),

  // ── Reviews ───────────────────────────────────────────────────────
  createReview: (orderId, { rating, comment }) =>
    client.post(`/reviews/${orderId}/review`, { rating, comment }),

  // ── User Profile ──────────────────────────────────────────────────
  getMe:         ()       => client.get("/users/me"),
  updateMe:      (body)   => client.patch("/users/me", body),
  addAddress:    (body)   => client.post("/users/me/addresses", body),
  removeAddress: (addrId) => client.delete(`/users/me/addresses/${addrId}`),
};
