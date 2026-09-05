import client from "./client";

// All staff routes require the staffToken (Authorization: Bearer <staffToken>).
// Attach { _staff: true } so the request interceptor picks it over accessToken.

const S = { _staff: true }; // shorthand config flag

function idempotencyKey() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export const staffApi = {
  // ── Kitchen / KDS (role: chef) ───────────────────────────────────
  // Active orders with status "placed" or "confirmed", oldest first.
  getQueue: (restaurantId) =>
    client.get(`/staff/${restaurantId}/kitchen/queue`, S),

  // Kanban buckets: { placed, confirmed, preparing, ready }
  getBoard: (restaurantId) =>
    client.get(`/staff/${restaurantId}/kitchen/board`, S),

  getOrderDetail: (restaurantId, orderId) =>
    client.get(`/staff/${restaurantId}/kitchen/orders/${orderId}`, S),

  // Optimistic concurrency control — the server rejects the write with
  // 409 CONCURRENT_UPDATE if `currentStatus` no longer matches.
  // Allowed transitions (API.md):
  //   placed    -> confirmed | cancelled
  //   confirmed -> preparing | cancelled
  //   preparing -> ready     | cancelled
  //   ready     -> out_for_delivery | delivered | cancelled
  updateOrderStatus: (restaurantId, orderId, currentStatus, newStatus) =>
    client.patch(
      `/staff/${restaurantId}/kitchen/orders/${orderId}/status`,
      { currentStatus, newStatus },
      S,
    ),

  // Refetches the order and retries once when another client won the race.
  async updateOrderStatusWithRetry(restaurantId, orderId, currentStatus, newStatus) {
    try {
      return await staffApi.updateOrderStatus(restaurantId, orderId, currentStatus, newStatus);
    } catch (err) {
      if (err.code !== "CONCURRENT_UPDATE") throw err;
      const { data } = await staffApi.getOrderDetail(restaurantId, orderId);
      const fresh = data.data.order.status;
      return staffApi.updateOrderStatus(restaurantId, orderId, fresh, newStatus);
    }
  },

  // ── Waiter (role: waiter) ────────────────────────────────────────
  // qrToken is the table's _id, taken from the `tableId` query param of the
  // scanned QR URL (…/menu?restaurantId=<id>&tableId=<id>).
  scanTable: (restaurantId, qrToken) =>
    client.post(`/staff/${restaurantId}/waiter/tables/scan`, { qrToken }, S),

  getTables: (restaurantId) =>
    client.get(`/staff/${restaurantId}/waiter/tables`, S),

  getMenu: (restaurantId) =>
    client.get(`/staff/${restaurantId}/waiter/menu`, S),

  // body: { tableSessionId, items: [{ menuItemId, quantity }], specialInstructions? }
  createOrder: (restaurantId, body) =>
    client.post(`/staff/${restaurantId}/waiter/orders`, body, {
      ...S,
      headers: { "Idempotency-Key": idempotencyKey() },
    }),

  // Waiter-driven status change. The waiter owns the "served" step — the food
  // reaching the table — which the chef KDS has no way to know about. Allowed:
  // confirmed | preparing | ready | served, and the server still enforces the
  // same transition table the KDS uses, so a step can never be skipped backwards.
  waiterUpdateOrderStatus: (restaurantId, orderId, newStatus) =>
    client.patch(`/staff/${restaurantId}/waiter/orders/${orderId}/status`, { newStatus }, S),

  // Open table sessions with their orders and a runningTotal. Each session also
  // carries its `tableNumber`, and each order its `round` and `staff`.
  // scope: "open" (the live floor) | "completed" (today's settled sittings).
  getSessions: (restaurantId, scope = "open") =>
    client.get(`/staff/${restaurantId}/waiter/sessions`, { ...S, params: { scope } }),

  getBill: (restaurantId, sessionId) =>
    client.get(`/staff/${restaurantId}/waiter/sessions/${sessionId}/bill`, S),

  // paymentMethod: "cash" | "upi" | "card" | "online"
  markPaid: (restaurantId, sessionId, paymentMethod = "cash") =>
    client.post(
      `/staff/${restaurantId}/waiter/sessions/${sessionId}/bill/mark-paid`,
      { paymentMethod },
      S,
    ),

  // ── Customer Requests (role: waiter) ──────────────────────────────
  // status: "pending" | "acknowledged" | "resolved"; omit to get all.
  listRequests: (restaurantId, status) =>
    client.get(`/staff/${restaurantId}/requests`, { ...S, params: status ? { status } : {} }),

  // Allowed transitions: pending -> acknowledged | resolved; acknowledged -> resolved.
  updateRequestStatus: (restaurantId, requestId, status) =>
    client.patch(`/staff/${restaurantId}/requests/${requestId}`, { status }, S),
};
