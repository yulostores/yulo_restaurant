import client from "./client";

// All scoped owner routes live under /api/owner/:restaurantId (API.md).
// `restaurantId` must belong to the authenticated owner or the server returns
// 403 NOT_OWNER. Staff / category / menu-item routes additionally return
// 403 RESTAURANT_NOT_APPROVED until an admin approves the restaurant.

// A PDF response as { blob, filename } — the server's Content-Disposition name when present.
const pdfFile = (r) => {
  const header = r.headers?.["content-disposition"] ?? "";
  const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(header);
  return {
    blob: r.data,
    filename: match ? decodeURIComponent(match[1]) : null,
  };
};

export const ownerApi = {
  // ── Restaurants ───────────────────────────────────────────────────
  listRestaurants: () => client.get("/owner/restaurants"),
  createRestaurant: (body) => client.post("/owner/restaurants", body),

  // ── Restaurant profile (allowed at any approvalStatus) ────────────
  getRestaurantDetail: (rId) => client.get(`/owner/${rId}/restaurant`),
  updateRestaurant: (rId, body) =>
    client.patch(`/owner/${rId}/restaurant`, body),

  // ── Settings ─────────────────────────────────────────────────────
  // The store-settings field contract — labels, which details are mandatory, the pattern
  // each has to match, dropdown options, brand-image limits. Not restaurant-scoped: the
  // "Add Your Restaurant" step is built from it too, and that runs before any restaurant
  // exists. Served from server/config/storeSettings.config.js, the same module the PATCH
  // below is validated against.
  getSettingsRequirements: () => client.get("/owner/settings-requirements"),

  getSettings: (rId) => client.get(`/owner/${rId}/settings`),
  // PATCH /settings accepts multipart/form-data (optional `logo` + `banner`
  // files, max 5 MB each) alongside name/description/cuisineTypes/address/settings.
  updateSettings: (rId, formData) =>
    client.patch(`/owner/${rId}/settings`, formData),

  getHours: (rId) => client.get(`/owner/${rId}/settings/hours`),
  updateHours: (rId, body) =>
    client.patch(`/owner/${rId}/settings/hours`, body),

  getDelivery: (rId) => client.get(`/owner/${rId}/settings/delivery`),
  updateDelivery: (rId, body) =>
    client.patch(`/owner/${rId}/settings/delivery`, body),

  // ── Compliance documents (allowed at any approvalStatus) ─────────
  // The scans behind the licence numbers above. Admin reviews each one and marks it
  // verified or rejected; a rejected one is fixed by uploading again, which resets it
  // to pending. Uploaded one at a time: multipart with the file under `document` and
  // the document's `type` alongside it. JPEG/PNG/WebP/PDF, 5 MB max.
  getDocuments: (rId) => client.get(`/owner/${rId}/documents`),
  uploadDocument: (rId, type, file) => {
    const fd = new FormData();
    fd.append("type", type);
    fd.append("document", file);
    return client.post(`/owner/${rId}/documents`, fd);
  },
  deleteDocument: (rId, docId) =>
    client.delete(`/owner/${rId}/documents/${docId}`),
  // The document's bytes, streamed through the API with their real content type. The
  // stored Cloudinary URL is deliberately not linkable — see the server's
  // services/restaurantDocument.service.js.
  getDocumentFile: (rId, docId) =>
    client
      .get(`/owner/${rId}/documents/${docId}/file`, { responseType: "blob" })
      .then((r) => r.data),

  // ── Bank account (allowed at any approvalStatus) ──────────────────
  // Where settlements are paid. Never returns the full number — last four digits only.
  // Body: { accountHolderName, accountNumber, confirmAccountNumber, ifsc, bankName?,
  // branch?, accountType: "savings" | "current" }. Once the account is verified, a save is a
  // change REQUEST (account.pendingChange) and payouts keep going to the verified account
  // until Yulo verifies the new one. 503 ENCRYPTION_NOT_CONFIGURED if the server can't store it.
  getPayoutAccount: (rId) => client.get(`/owner/${rId}/payout-account`),
  savePayoutAccount: (rId, body) =>
    client.put(`/owner/${rId}/payout-account`, body),

  // ── Payments (approved restaurants) ───────────────────────────────
  // The masked account plus the next scheduled payout, as an admin scheduled it — the
  // portal never guesses a payout day.
  getPaymentSettings: (rId) => client.get(`/owner/${rId}/payments/settings`),
  // The Payments & Payouts screens (API.md → Owner — Payments & Payouts). Money in PAISE;
  // every status label and owner-facing sentence comes from the server.
  getPaymentsOverview: (rId, params) =>
    client.get(`/owner/${rId}/payments/overview`, { params }),
  getPayoutHistory: (rId, params) =>
    client.get(`/owner/${rId}/payments/history`, { params }),
  getPaymentStatement: (rId, statementId) =>
    client.get(`/owner/${rId}/payments/statements/${statementId}`),
  getOrderPayment: (rId, orderId) =>
    client.get(`/owner/${rId}/payments/orders/${orderId}`),
  getBillPayment: (rId, billId) =>
    client.get(`/owner/${rId}/payments/bills/${billId}`),

  // ── Payment issues (approved restaurants) ─────────────────────────
  // A ticket about a payout (settlementId), an order (orderId) or a bill (billId). Create and
  // reply take one optional `attachment` (PDF / JPG / PNG, 5 MB) — multipart then, JSON
  // otherwise. Attachments come back through the API, never as a storage URL.
  listPaymentIssues: (rId, params) =>
    client.get(`/owner/${rId}/payment-issues`, { params }),
  getPaymentIssue: (rId, ticketId) =>
    client.get(`/owner/${rId}/payment-issues/${ticketId}`),
  createPaymentIssue: (rId, fields, file) => {
    if (!file) return client.post(`/owner/${rId}/payment-issues`, fields);
    const fd = new FormData();
    for (const [k, v] of Object.entries(fields))
      if (v != null && v !== "") fd.append(k, v);
    fd.append("attachment", file);
    return client.post(`/owner/${rId}/payment-issues`, fd);
  },
  addPaymentIssueMessage: (rId, ticketId, text, file) => {
    if (!file)
      return client.post(`/owner/${rId}/payment-issues/${ticketId}/messages`, {
        text,
      });
    const fd = new FormData();
    fd.append("text", text);
    fd.append("attachment", file);
    return client.post(`/owner/${rId}/payment-issues/${ticketId}/messages`, fd);
  },
  getPaymentIssueAttachment: (rId, ticketId, attachmentId) =>
    client
      .get(
        `/owner/${rId}/payment-issues/${ticketId}/attachments/${attachmentId}`,
        { responseType: "blob" },
      )
      .then((r) => r.data),
  // The statement's per-order CSV (the settlement export).
  exportStatementCsv: (rId, statementId) =>
    client
      .get(`/owner/${rId}/settlements/${statementId}/export`, {
        responseType: "blob",
      })
      .then((r) => r.data),
  // PDFs: the weekly statement, and one order's / dine-in bill's payment statement. Resolve to
  // { blob, filename } — the name from the server's Content-Disposition when it sends one.
  downloadStatementPdf: (rId, statementId) =>
    client
      .get(`/owner/${rId}/settlements/${statementId}/pdf`, {
        responseType: "blob",
      })
      .then(pdfFile),
  downloadPaymentPdf: (rId, kind, id) =>
    client
      .get(
        `/owner/${rId}/payments/${kind === "bill" ? "bills" : "orders"}/${id}/pdf`,
        { responseType: "blob" },
      )
      .then(pdfFile),

  // ── Dashboard ────────────────────────────────────────────────────
  // period: "today" | "week" | "month" | "year"
  getDashboardKPIs: (rId, period = "today") =>
    client.get(`/owner/${rId}/dashboard`, { params: { period } }),
  getSalesChart: (rId, period = "week") =>
    client.get(`/owner/${rId}/dashboard/sales`, { params: { period } }),
  getTopItems: (rId, period = "month") =>
    client.get(`/owner/${rId}/dashboard/top-items`, { params: { period } }),
  // Always returns the last 10 orders — takes no params.
  getRecentOrders: (rId) => client.get(`/owner/${rId}/dashboard/recent-orders`),

  // ── Orders ───────────────────────────────────────────────────────
  // Every order carries its resolved `table`, `staff` (who rang it in), `waiter`
  // (assigned to the sitting) and `statusHistory` — see the server's
  // services/orderView.service.js.
  // params: { status, type: "dine_in"|"delivery", tableId, page, limit }
  listOrders: (rId, params = {}) =>
    client.get(`/owner/${rId}/orders`, { params }),
  getOrder: (rId, orderId) => client.get(`/owner/${rId}/orders/${orderId}`),

  // ── Order approval ───────────────────────────────────────────────
  // A customer order (delivery app, table QR) arrives as status "placed" and waits here:
  // the kitchen, the waiters and rider search only see it once the owner accepts it.
  // Waiter-placed orders skip this step. Unanswered orders auto-cancel after the
  // server's ORDER_APPROVAL_TIMEOUT_MINUTES (default 15).
  //
  // Pending: oldest first, { orders[], count, rejectionReasons[] }; each order also
  // carries `awaitingPayment` (online, unpaid — accepting it answers 409 PAYMENT_PENDING).
  listPendingOrders: (rId) => client.get(`/owner/${rId}/orders/pending`),
  // 409 ORDER_ALREADY_DECIDED if it was accepted/rejected/cancelled/expired meanwhile.
  acceptOrder: (rId, orderId) =>
    client.patch(`/owner/${rId}/orders/${orderId}/accept`),
  // reason: 3–200 chars, shown to the customer. The bare word "Other" is refused (400).
  rejectOrder: (rId, orderId, reason) =>
    client.patch(`/owner/${rId}/orders/${orderId}/reject`, { reason }),

  // Dine-in orders grouped table -> sitting -> rounds.
  // scope: "active" (default) | "today" | "all"
  listOrdersByTable: (rId, params = {}) =>
    client.get(`/owner/${rId}/orders/by-table`, { params }),

  // ── Bills ────────────────────────────────────────────────────────
  // params: { status: "open"|"paid", type, tableNumber, from, to, q, page, limit }
  listBills: (rId, params = {}) =>
    client.get(`/owner/${rId}/bills`, { params }),
  getBill: (rId, billId) => client.get(`/owner/${rId}/bills/${billId}`),
  // Settle a dine-in bill paid at the counter. method: "cash" | "upi" | "card".
  // 409 PAID_ONLINE (the guest is paying online), BILL_ALREADY_PAID, ORDERS_PENDING.
  markBillPaid: (rId, billId, method) =>
    client.post(`/owner/${rId}/bills/${billId}/mark-paid`, { method }),
  // Release a bill held for a guest's abandoned online payment. 409 PAYMENT_IN_PROGRESS
  // while that payment is going through.
  releaseBillPayment: (rId, billId) =>
    client.post(`/owner/${rId}/bills/${billId}/release-payment`, {}),
  // The bill an order ended up on — a dine-in order resolves to its table session's bill,
  // a delivery/takeaway order to its own. Answers 200 with `bill: null` when the sitting
  // has not been billed yet.
  getBillForOrder: (rId, orderId) =>
    client.get(`/owner/${rId}/orders/${orderId}/bill`),

  // ── Menu Items ───────────────────────────────────────────────────
  // create/update take multipart/form-data (optional `image` file, max 5 MB).
  listMenuItems: (rId) => client.get(`/owner/${rId}/menu-items`),
  getMenuItem: (rId, itemId) =>
    client.get(`/owner/${rId}/menu-items/${itemId}`),
  createMenuItem: (rId, formData) =>
    client.post(`/owner/${rId}/menu-items`, formData),
  updateMenuItem: (rId, itemId, formData) =>
    client.patch(`/owner/${rId}/menu-items/${itemId}`, formData),
  deleteMenuItem: (rId, itemId) =>
    client.delete(`/owner/${rId}/menu-items/${itemId}`),
  toggleMenuItem: (rId, itemId) =>
    client.patch(`/owner/${rId}/menu-items/${itemId}/toggle`),
  updateIngredients: (rId, itemId, ingredients) =>
    client.patch(`/owner/${rId}/menu-items/${itemId}/ingredients`, {
      ingredients,
    }),

  // ── Staff ────────────────────────────────────────────────────────
  // role: "waiter" | "chef". `pin` is 4–8 digits and is only ever sent, never
  // returned (`pinHash` is stripped server-side). DELETE is a soft delete that
  // just sets isActive:false.
  listStaff: (rId) => client.get(`/owner/${rId}/staff`),
  createStaff: (rId, body) => client.post(`/owner/${rId}/staff`, body),
  updateStaff: (rId, staffId, body) =>
    client.patch(`/owner/${rId}/staff/${staffId}`, body),
  removeStaff: (rId, staffId) =>
    client.delete(`/owner/${rId}/staff/${staffId}`),

  // ── Categories & Subcategories ───────────────────────────────────
  listCategories: (rId) => client.get(`/owner/${rId}/categories`),
  createCategory: (rId, body) => client.post(`/owner/${rId}/categories`, body),
  updateCategory: (rId, cId, body) =>
    client.patch(`/owner/${rId}/categories/${cId}`, body),
  deleteCategory: (rId, cId) =>
    client.delete(`/owner/${rId}/categories/${cId}`),

  listSubCategories: (rId, cId) =>
    client.get(`/owner/${rId}/categories/${cId}/subcategories`),
  createSubCategory: (rId, cId, body) =>
    client.post(`/owner/${rId}/categories/${cId}/subcategories`, body),
  updateSubCategory: (rId, cId, sId, body) =>
    client.patch(`/owner/${rId}/categories/${cId}/subcategories/${sId}`, body),
  deleteSubCategory: (rId, cId, sId) =>
    client.delete(`/owner/${rId}/categories/${cId}/subcategories/${sId}`),

  // ── Tables + QR ──────────────────────────────────────────────────
  listTables: (rId) => client.get(`/owner/${rId}/tables`),
  createTable: (rId, body) => client.post(`/owner/${rId}/tables`, body),
  updateTable: (rId, tableId, body) =>
    client.patch(`/owner/${rId}/tables/${tableId}`, body),
  deleteTable: (rId, tableId) =>
    client.delete(`/owner/${rId}/tables/${tableId}`),
  generateQR: (rId, tableId) =>
    client.post(`/owner/${rId}/tables/${tableId}/qr`),
  voidQR: (rId, tableId) =>
    client.patch(`/owner/${rId}/tables/${tableId}/qr/void`),

  // ── Discounts ────────────────────────────────────────────────────
  // Created as `draft`; must be published to become `active`.
  // type: "percentage" | "flat_amount" | "free_item" | "tablewise"
  // create/update take a plain object, or a FormData when the offer image rides along
  // (axios sets the multipart boundary itself — never set Content-Type by hand).
  listDiscounts: (rId) => client.get(`/owner/${rId}/discounts`),
  createDiscount: (rId, body) => client.post(`/owner/${rId}/discounts`, body),
  updateDiscount: (rId, dId, body) =>
    client.patch(`/owner/${rId}/discounts/${dId}`, body),
  deleteDiscount: (rId, dId) => client.delete(`/owner/${rId}/discounts/${dId}`),
  publishDiscount: (rId, dId) =>
    client.patch(`/owner/${rId}/discounts/${dId}/publish`),
  draftDiscount: (rId, dId) =>
    client.patch(`/owner/${rId}/discounts/${dId}/draft`),

  // ── Loyalty Program ──────────────────────────────────────────────
  getLoyalty: (rId) => client.get(`/owner/${rId}/loyalty`),
  updateLoyalty: (rId, body) => client.patch(`/owner/${rId}/loyalty`, body),

  listMilestones: (rId) => client.get(`/owner/${rId}/loyalty/milestones`),
  createMilestone: (rId, body) =>
    client.post(`/owner/${rId}/loyalty/milestones`, body),
  updateMilestone: (rId, mId, body) =>
    client.patch(`/owner/${rId}/loyalty/milestones/${mId}`, body),
  deleteMilestone: (rId, mId) =>
    client.delete(`/owner/${rId}/loyalty/milestones/${mId}`),

  // ── Live Monitor ─────────────────────────────────────────────────
  getLiveStats: (rId) => client.get(`/owner/${rId}/live-monitor`),
  getLiveVisitors: (rId) => client.get(`/owner/${rId}/live-monitor/visitors`),
  getLiveRepeat: (rId) => client.get(`/owner/${rId}/live-monitor/repeat`),
  createTargetOffer: (rId, body) =>
    client.post(`/owner/${rId}/live-monitor/offer`, body),

  // ── Customer Requests (manager view — runs on the owner session) ──
  // status: "pending" | "acknowledged" | "resolved"; omit to get all.
  listRequests: (rId, status) =>
    client.get(`/owner/${rId}/requests`, { params: status ? { status } : {} }),
  updateRequestStatus: (rId, requestId, status) =>
    client.patch(`/owner/${rId}/requests/${requestId}`, { status }),
};
