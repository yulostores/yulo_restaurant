import client from "./client";

// Platform admin routes (API.md § Admin). All require an access token with role
// `admin` — any other role gets 403 FORBIDDEN. Every state-changing action is
// written to an internal activity log that is NOT exposed via its own endpoint.
//
// All four list endpoints share the same pagination contract:
//   in:  ?page=&limit=
//   out: { <collection>, total, page, pages }

export const adminApi = {
  // ── Dashboard & reports ──────────────────────────────────────────
  getDashboard: () => client.get("/admin/dashboard"),

  // range: "day" | "week" | "month" | "year" (default "month")
  getRevenueOverview: (range = "month") =>
    client.get("/admin/dashboard/revenue-overview", { params: { range } }),

  getTopStores: (limit = 10) =>
    client.get("/admin/reports/top-stores", { params: { limit } }),

  getTopDeliveryPartners: (limit = 10) =>
    client.get("/admin/reports/top-delivery-partners", { params: { limit } }),

  // ── Stores ───────────────────────────────────────────────────────
  // params: { status, plan, search, page, limit }
  // Response also carries `statusCounts` for the tab counters — computed over
  // the whole collection, independent of the active filters.
  listStores: (params = {}) => client.get("/admin/stores", { params }),
  getStore:   (id)          => client.get(`/admin/stores/${id}`),

  approveStore:    (id)         => client.patch(`/admin/stores/${id}/approve`),
  rejectStore:     (id, reason) => client.patch(`/admin/stores/${id}/reject`, { reason }),
  suspendStore:    (id)         => client.patch(`/admin/stores/${id}/suspend`),
  reactivateStore: (id)         => client.patch(`/admin/stores/${id}/reactivate`),

  // Whitelisted fields only: name, description, cuisineTypes, address,
  // delivery, settings, plan. Anything else is silently dropped.
  updateStore: (id, body) => client.patch(`/admin/stores/${id}`, body),

  addStoreNote: (id, note) => client.post(`/admin/stores/${id}/notes`, { note }),

  // status: "verified" | "rejected"
  verifyDocument: (id, docId, status) =>
    client.patch(`/admin/stores/${id}/documents/${docId}`, { status }),

  // The document's bytes, streamed through the API with their real content type.
  // Never linked to storage directly: the Cloudinary URL is public to anyone holding it
  // and refuses to serve PDFs outright, so the file is fetched here as a Blob and shown
  // from an object URL.
  getStoreDocumentFile: (id, docId) =>
    client
      .get(`/admin/stores/${id}/documents/${docId}/file`, { responseType: "blob" })
      .then((r) => r.data),

  // Soft delete — sets isActive:false, leaves approvalStatus untouched.
  removeStore: (id) => client.delete(`/admin/stores/${id}`),

  // ── Customers ────────────────────────────────────────────────────
  // params: { search, status: "active"|"inactive", page, limit }
  listCustomers: (params = {}) => client.get("/admin/customers", { params }),
  getCustomer:   (id)          => client.get(`/admin/customers/${id}`),
  setCustomerStatus: (id, isActive) =>
    client.patch(`/admin/customers/${id}/status`, { isActive }),

  // ── Delivery partners ────────────────────────────────────────────
  // params: { search, status: "active"|"busy"|"inactive"|"suspended", page, limit }
  listDeliveryPartners: (params = {}) => client.get("/admin/delivery-partners", { params }),
  getDeliveryPartner:   (id)          => client.get(`/admin/delivery-partners/${id}`),
  // multipart/form-data — profile fields plus optional document files.
  createDeliveryPartner: (formData) => client.post("/admin/delivery-partners", formData),
  updateDeliveryPartner: (id, body) => client.patch(`/admin/delivery-partners/${id}`, body),
  removeDeliveryPartner: (id)       => client.delete(`/admin/delivery-partners/${id}`),

  // ── Support tickets ──────────────────────────────────────────────
  // params: { status, priority, category, page, limit }
  listTickets: (params = {}) => client.get("/admin/tickets", { params }),
  getTicket:   (id)          => client.get(`/admin/tickets/${id}`),
  updateTicket: (id, body)   => client.patch(`/admin/tickets/${id}`, body),
  addTicketMessage: (id, text) => client.post(`/admin/tickets/${id}/messages`, { text }),
};
