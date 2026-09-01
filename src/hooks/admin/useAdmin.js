import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminApi } from "@/api/admin.api";

export const adminKeys = {
  dashboard: ()      => ["admin", "dashboard"],
  revenue:   (range) => ["admin", "revenue", range],
  topStores: (limit) => ["admin", "top-stores", limit],
  topPartners: (limit) => ["admin", "top-partners", limit],
  stores:    (p={}) => ["admin", "stores", p],
  store:     (id)   => ["admin", "store", id],
  customers: (p={}) => ["admin", "customers", p],
  customer:  (id)   => ["admin", "customer", id],
  partners:  (p={}) => ["admin", "partners", p],
  partner:   (id)   => ["admin", "partner", id],
  tickets:   (p={}) => ["admin", "tickets", p],
  ticket:    (id)   => ["admin", "ticket", id],
};

// ── Dashboard & reports ──────────────────────────────────────────────
// { stores: {pending,active,suspended,rejected,expired}, customers,
//   tickets: {open,in_progress,resolved,closed}, revenue: {total,orders} }
export function useAdminDashboard() {
  return useQuery({
    queryKey: adminKeys.dashboard(),
    queryFn: () => adminApi.getDashboard().then((r) => r.data.data),
    staleTime: 60_000,
    refetchInterval: 120_000,
  });
}

// { range, points: [{ date, revenue, orders }] }
export function useRevenueOverview(range = "month") {
  return useQuery({
    queryKey: adminKeys.revenue(range),
    queryFn: () => adminApi.getRevenueOverview(range).then((r) => r.data.data),
    staleTime: 60_000,
  });
}

export function useTopStores(limit = 10) {
  return useQuery({
    queryKey: adminKeys.topStores(limit),
    queryFn: () => adminApi.getTopStores(limit).then((r) => r.data.data.stores ?? []),
    staleTime: 5 * 60_000,
  });
}

export function useTopDeliveryPartners(limit = 10) {
  return useQuery({
    queryKey: adminKeys.topPartners(limit),
    queryFn: () => adminApi.getTopDeliveryPartners(limit).then((r) => r.data.data.partners ?? []),
    staleTime: 5 * 60_000,
  });
}

// ── Stores ───────────────────────────────────────────────────────────
// params: { status, plan, search, page, limit }
// → { stores, total, page, pages, statusCounts }
export function useAdminStores(params = {}) {
  return useQuery({
    queryKey: adminKeys.stores(params),
    queryFn: () => adminApi.listStores(params).then((r) => r.data.data),
    staleTime: 30_000,
    placeholderData: (prev) => prev, // keep the table on screen while filters change
  });
}

export function useAdminStore(id) {
  return useQuery({
    queryKey: adminKeys.store(id),
    queryFn: () => adminApi.getStore(id).then((r) => r.data.data.store),
    enabled: !!id,
  });
}

// One mutation factory for every store lifecycle transition, so the screens
// don't each re-implement invalidation.
export function useStoreAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ action, id, reason }) => {
      switch (action) {
        case "approve":    return adminApi.approveStore(id);
        case "reject":     return adminApi.rejectStore(id, reason);
        case "suspend":    return adminApi.suspendStore(id);
        case "reactivate": return adminApi.reactivateStore(id);
        case "remove":     return adminApi.removeStore(id);
        default: throw new Error(`Unknown store action: ${action}`);
      }
    },
    onSuccess: (_d, { id }) => {
      qc.invalidateQueries({ queryKey: ["admin", "stores"] });
      qc.invalidateQueries({ queryKey: adminKeys.store(id) });
      qc.invalidateQueries({ queryKey: adminKeys.dashboard() });
    },
  });
}

export function useUpdateStore() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }) => adminApi.updateStore(id, body),
    onSuccess: (_d, { id }) => {
      qc.invalidateQueries({ queryKey: ["admin", "stores"] });
      qc.invalidateQueries({ queryKey: adminKeys.store(id) });
    },
  });
}

export function useAddStoreNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, note }) => adminApi.addStoreNote(id, note),
    onSuccess: (_d, { id }) => qc.invalidateQueries({ queryKey: adminKeys.store(id) }),
  });
}

export function useVerifyDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, docId, status }) => adminApi.verifyDocument(id, docId, status),
    onSuccess: (_d, { id }) => qc.invalidateQueries({ queryKey: adminKeys.store(id) }),
  });
}

// ── Customers ────────────────────────────────────────────────────────
export function useAdminCustomers(params = {}) {
  return useQuery({
    queryKey: adminKeys.customers(params),
    queryFn: () => adminApi.listCustomers(params).then((r) => r.data.data),
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });
}

export function useSetCustomerStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, isActive }) => adminApi.setCustomerStatus(id, isActive),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "customers"] }),
  });
}

// ── Delivery partners ────────────────────────────────────────────────
export function useDeliveryPartners(params = {}) {
  return useQuery({
    queryKey: adminKeys.partners(params),
    queryFn: () => adminApi.listDeliveryPartners(params).then((r) => r.data.data),
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });
}

export function useCreateDeliveryPartner() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (formData) => adminApi.createDeliveryPartner(formData),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "partners"] }),
  });
}

export function useUpdateDeliveryPartner() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }) => adminApi.updateDeliveryPartner(id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "partners"] }),
  });
}

export function useRemoveDeliveryPartner() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => adminApi.removeDeliveryPartner(id),
    onSettled: () => qc.invalidateQueries({ queryKey: ["admin", "partners"] }),
  });
}

// ── Support tickets ──────────────────────────────────────────────────
export function useTickets(params = {}) {
  return useQuery({
    queryKey: adminKeys.tickets(params),
    queryFn: () => adminApi.listTickets(params).then((r) => r.data.data),
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });
}

export function useTicket(id) {
  return useQuery({
    queryKey: adminKeys.ticket(id),
    queryFn: () => adminApi.getTicket(id).then((r) => r.data.data.ticket),
    enabled: !!id,
  });
}

export function useUpdateTicket() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }) => adminApi.updateTicket(id, body),
    onSuccess: (_d, { id }) => {
      qc.invalidateQueries({ queryKey: ["admin", "tickets"] });
      qc.invalidateQueries({ queryKey: adminKeys.ticket(id) });
      qc.invalidateQueries({ queryKey: adminKeys.dashboard() });
    },
  });
}

export function useAddTicketMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, text }) => adminApi.addTicketMessage(id, text),
    onSuccess: (_d, { id }) => {
      qc.invalidateQueries({ queryKey: adminKeys.ticket(id) });
      qc.invalidateQueries({ queryKey: ["admin", "tickets"] });
    },
  });
}
