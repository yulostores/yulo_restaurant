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
  // Orders the restaurant has accepted ("confirmed") and the kitchen hasn't started.
  // New customer orders ("placed") never appear — the owner accepts them first.
  getQueue: (restaurantId) =>
    client.get(`/staff/${restaurantId}/kitchen/queue`, S),

  // Kanban buckets: { preparing, ready, completed }
  getBoard: (restaurantId) =>
    client.get(`/staff/${restaurantId}/kitchen/board`, S),

  getOrderDetail: (restaurantId, orderId) =>
    client.get(`/staff/${restaurantId}/kitchen/orders/${orderId}`, S),

  // Optimistic concurrency control — the server rejects the write with
  // 409 CONCURRENT_UPDATE if `currentStatus` no longer matches.
  // Allowed transitions for the kitchen (API.md). 'placed' -> 'confirmed' is NOT the
  // kitchen's — it is the owner accepting the order; touching a 'placed' order answers
  // 409 ORDER_AWAITING_APPROVAL.
  //   confirmed -> preparing | cancelled
  //   preparing -> ready     | served | cancelled
  //   ready     -> served | out_for_delivery | delivered | cancelled
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
  // qrToken is the table's _id, read out of the scanned QR by src/lib/tableQr.js
  // (…/?r=<id>&t=<id>, or the older …/menu?restaurantId=<id>&tableId=<id>).
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
  // preparing | ready | served, and the server still enforces the same transition
  // table the KDS uses, so a step can never be skipped backwards. A round still
  // awaiting the restaurant's approval answers 409 ORDER_AWAITING_APPROVAL.
  waiterUpdateOrderStatus: (restaurantId, orderId, newStatus) =>
    client.patch(`/staff/${restaurantId}/waiter/orders/${orderId}/status`, { newStatus }, S),

  // Open table sessions with their orders and a runningTotal. Each session also
  // carries its `tableNumber`, and each order its `round` and `staff`.
  // scope: "open" (the live floor) | "completed" (today's settled sittings).
  getSessions: (restaurantId, scope = "open") =>
    client.get(`/staff/${restaurantId}/waiter/sessions`, { ...S, params: { scope } }),

  getBill: (restaurantId, sessionId) =>
    client.get(`/staff/${restaurantId}/waiter/sessions/${sessionId}/bill`, S),

  // Settles the bill at the counter. method: "cash" | "upi" | "card" — an online payment
  // is the guest's own (QR menu) and is never marked by the floor. 409 PAID_ONLINE while the
  // guest's online payment is going through, 409 BILL_ALREADY_PAID, 409 ORDERS_PENDING.
  markPaid: (restaurantId, sessionId, method = "cash") =>
    client.post(
      `/staff/${restaurantId}/waiter/sessions/${sessionId}/bill/mark-paid`,
      { method },
      S,
    ),

  // Releases a bill held for a guest's online payment they abandoned (closed the payment
  // sheet, walked to the counter) — re-opens the table and re-prices the bill. 409
  // PAYMENT_IN_PROGRESS while that payment is actually going through.
  releasePayment: (restaurantId, sessionId) =>
    client.post(`/staff/${restaurantId}/waiter/sessions/${sessionId}/bill/release-payment`, {}, S),

  // ── Customer Requests (role: waiter) ──────────────────────────────
  // status: "pending" | "acknowledged" | "resolved"; omit to get all.
  listRequests: (restaurantId, status) =>
    client.get(`/staff/${restaurantId}/requests`, { ...S, params: status ? { status } : {} }),

  // Allowed transitions: pending -> acknowledged | resolved; acknowledged -> resolved.
  updateRequestStatus: (restaurantId, requestId, status) =>
    client.patch(`/staff/${restaurantId}/requests/${requestId}`, { status }, S),
};
