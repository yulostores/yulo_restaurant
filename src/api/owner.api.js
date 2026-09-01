import client from "./client";

// All scoped owner routes live under /api/owner/:restaurantId (API.md).
// `restaurantId` must belong to the authenticated owner or the server returns
// 403 NOT_OWNER. Staff / category / menu-item routes additionally return
// 403 RESTAURANT_NOT_APPROVED until an admin approves the restaurant.

export const ownerApi = {
  // ── Restaurants ───────────────────────────────────────────────────
  listRestaurants:  ()     => client.get("/owner/restaurants"),
  createRestaurant: (body) => client.post("/owner/restaurants", body),

  // ── Restaurant profile (allowed at any approvalStatus) ────────────
  getRestaurantDetail: (rId)       => client.get(`/owner/${rId}/restaurant`),
  updateRestaurant:    (rId, body) => client.patch(`/owner/${rId}/restaurant`, body),

  // ── Settings ─────────────────────────────────────────────────────
  getSettings: (rId) => client.get(`/owner/${rId}/settings`),
  // PATCH /settings accepts multipart/form-data (optional `logo` + `banner`
  // files, max 5 MB each) alongside name/description/cuisineTypes/address/settings.
  updateSettings: (rId, formData) =>
    client.patch(`/owner/${rId}/settings`, formData),

  getHours:    (rId)       => client.get(`/owner/${rId}/settings/hours`),
  updateHours: (rId, body) => client.patch(`/owner/${rId}/settings/hours`, body),

  getDelivery:    (rId)       => client.get(`/owner/${rId}/settings/delivery`),
  updateDelivery: (rId, body) => client.patch(`/owner/${rId}/settings/delivery`, body),

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

  // ── Orders (read-only from owner view) ───────────────────────────
  // params: { status, type: "dine_in"|"delivery", page, limit }
  listOrders: (rId, params = {}) => client.get(`/owner/${rId}/orders`, { params }),
  getOrder:   (rId, orderId)     => client.get(`/owner/${rId}/orders/${orderId}`),

  // ── Bills ────────────────────────────────────────────────────────
  // params: { status: "open"|"paid", page, limit }
  listBills: (rId, params = {}) => client.get(`/owner/${rId}/bills`, { params }),
  getBill:   (rId, billId)      => client.get(`/owner/${rId}/bills/${billId}`),

  // ── Menu Items ───────────────────────────────────────────────────
  // create/update take multipart/form-data (optional `image` file, max 5 MB).
  listMenuItems:     (rId)                   => client.get(`/owner/${rId}/menu-items`),
  getMenuItem:       (rId, itemId)           => client.get(`/owner/${rId}/menu-items/${itemId}`),
  createMenuItem:    (rId, formData)         => client.post(`/owner/${rId}/menu-items`, formData),
  updateMenuItem:    (rId, itemId, formData) => client.patch(`/owner/${rId}/menu-items/${itemId}`, formData),
  deleteMenuItem:    (rId, itemId)           => client.delete(`/owner/${rId}/menu-items/${itemId}`),
  toggleMenuItem:    (rId, itemId)           => client.patch(`/owner/${rId}/menu-items/${itemId}/toggle`),
  updateIngredients: (rId, itemId, ingredients) =>
    client.patch(`/owner/${rId}/menu-items/${itemId}/ingredients`, { ingredients }),

  // ── Categories & Subcategories ───────────────────────────────────
  listCategories:  (rId)            => client.get(`/owner/${rId}/categories`),
  createCategory:  (rId, body)      => client.post(`/owner/${rId}/categories`, body),
  updateCategory:  (rId, cId, body) => client.patch(`/owner/${rId}/categories/${cId}`, body),
  deleteCategory:  (rId, cId)       => client.delete(`/owner/${rId}/categories/${cId}`),

  listSubCategories:  (rId, cId)            => client.get(`/owner/${rId}/categories/${cId}/subcategories`),
  createSubCategory:  (rId, cId, body)      => client.post(`/owner/${rId}/categories/${cId}/subcategories`, body),
  updateSubCategory:  (rId, cId, sId, body) => client.patch(`/owner/${rId}/categories/${cId}/subcategories/${sId}`, body),
  deleteSubCategory:  (rId, cId, sId)       => client.delete(`/owner/${rId}/categories/${cId}/subcategories/${sId}`),

  // ── Tables + QR ──────────────────────────────────────────────────
  listTables:  (rId)                 => client.get(`/owner/${rId}/tables`),
  createTable: (rId, body)           => client.post(`/owner/${rId}/tables`, body),
  updateTable: (rId, tableId, body)  => client.patch(`/owner/${rId}/tables/${tableId}`, body),
  deleteTable: (rId, tableId)        => client.delete(`/owner/${rId}/tables/${tableId}`),
  generateQR:  (rId, tableId)        => client.post(`/owner/${rId}/tables/${tableId}/qr`),
  voidQR:      (rId, tableId)        => client.patch(`/owner/${rId}/tables/${tableId}/qr/void`),

  // ── Discounts ────────────────────────────────────────────────────
  // Created as `draft`; must be published to become `active`.
  // type: "percentage" | "flat_amount" | "free_item" | "tablewise"
  listDiscounts:   (rId)            => client.get(`/owner/${rId}/discounts`),
  createDiscount:  (rId, body)      => client.post(`/owner/${rId}/discounts`, body),
  updateDiscount:  (rId, dId, body) => client.patch(`/owner/${rId}/discounts/${dId}`, body),
  deleteDiscount:  (rId, dId)       => client.delete(`/owner/${rId}/discounts/${dId}`),
  publishDiscount: (rId, dId)       => client.patch(`/owner/${rId}/discounts/${dId}/publish`),
  draftDiscount:   (rId, dId)       => client.patch(`/owner/${rId}/discounts/${dId}/draft`),

  // ── Loyalty Program ──────────────────────────────────────────────
  getLoyalty:    (rId)       => client.get(`/owner/${rId}/loyalty`),
  updateLoyalty: (rId, body) => client.patch(`/owner/${rId}/loyalty`, body),

  listMilestones:  (rId)            => client.get(`/owner/${rId}/loyalty/milestones`),
  createMilestone: (rId, body)      => client.post(`/owner/${rId}/loyalty/milestones`, body),
  updateMilestone: (rId, mId, body) => client.patch(`/owner/${rId}/loyalty/milestones/${mId}`, body),
  deleteMilestone: (rId, mId)       => client.delete(`/owner/${rId}/loyalty/milestones/${mId}`),

  // ── Live Monitor ─────────────────────────────────────────────────
  getLiveStats:      (rId)       => client.get(`/owner/${rId}/live-monitor`),
  getLiveVisitors:   (rId)       => client.get(`/owner/${rId}/live-monitor/visitors`),
  getLiveRepeat:     (rId)       => client.get(`/owner/${rId}/live-monitor/repeat`),
  createTargetOffer: (rId, body) => client.post(`/owner/${rId}/live-monitor/offer`, body),
};
