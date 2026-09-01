import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { customerApi } from "@/api/customer.api";

export const customerOrderKeys = {
  all:  ()      => ["customer-orders"],
  list: (p={}) => ["customer-orders", "list", p],
  one:  (id)   => ["customer-orders", "order", id],
};

// params: { page, limit } → { orders, total, page, pages }
export function useCustomerOrders(params = {}, options = {}) {
  return useQuery({
    queryKey: customerOrderKeys.list(params),
    queryFn: () => customerApi.listOrders(params).then((r) => r.data.data.orders ?? []),
    staleTime: 30_000,
    ...options,
  });
}

// Single order — polled while the kitchen works through it.
export function useCustomerOrder(orderId, { pollInterval = 0 } = {}) {
  return useQuery({
    queryKey: customerOrderKeys.one(orderId),
    queryFn: () => customerApi.getOrder(orderId).then((r) => r.data.data.order),
    enabled: !!orderId,
    refetchInterval: pollInterval || false,
    staleTime: 0,
  });
}

// POST /api/orders — delivery orders only (the server rejects any other type).
// An Idempotency-Key is attached by the api layer.
export function usePlaceOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body) => customerApi.createOrder(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: customerOrderKeys.all() }),
  });
}

export function useCreateReview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ orderId, rating, comment }) =>
      customerApi.createReview(orderId, { rating, comment }),
    onSuccess: () => qc.invalidateQueries({ queryKey: customerOrderKeys.all() }),
  });
}

// ── User profile ──────────────────────────────────────────────────────
export const profileKeys = {
  me: () => ["user-profile"],
};

export function useUserProfile(options = {}) {
  return useQuery({
    queryKey: profileKeys.me(),
    queryFn: () => customerApi.getMe().then((r) => r.data.data.user),
    staleTime: 5 * 60_000,
    ...options,
  });
}

export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body) => customerApi.updateMe(body),
    onSuccess: ({ data }) => qc.setQueryData(profileKeys.me(), data.data.user),
  });
}

export function useAddAddress() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body) => customerApi.addAddress(body),
    onSuccess: ({ data }) => qc.setQueryData(profileKeys.me(), data.data.user),
  });
}

export function useRemoveAddress() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (addrId) => customerApi.removeAddress(addrId),
    onSettled: () => qc.invalidateQueries({ queryKey: profileKeys.me() }),
  });
}
