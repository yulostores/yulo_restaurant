import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ownerApi } from "@/api/owner.api";

const staffKeys = {
  all: (rId) => ["staff", rId],
};

// `enabled` lets callers skip the request entirely while the restaurant is
// unapproved — every /staff route 403s until then, so firing it would only
// produce a guaranteed error and pointless retries.
export function useStaff(restaurantId, { enabled = true } = {}) {
  return useQuery({
    queryKey: staffKeys.all(restaurantId),
    queryFn: () => ownerApi.listStaff(restaurantId).then((r) => r.data.data.staff ?? []),
    enabled: !!restaurantId && enabled,
    // 401/403/404 won't fix themselves on a retry.
    retry: (count, err) => (err?.status >= 400 && err?.status < 500 ? false : count < 2),
  });
}

export function useCreateStaff(restaurantId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body) => ownerApi.createStaff(restaurantId, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: staffKeys.all(restaurantId) }),
  });
}

export function useUpdateStaff(restaurantId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ staffId, ...body }) => ownerApi.updateStaff(restaurantId, staffId, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: staffKeys.all(restaurantId) }),
  });
}

export function useRemoveStaff(restaurantId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (staffId) => ownerApi.removeStaff(restaurantId, staffId),
    onSuccess: () => qc.invalidateQueries({ queryKey: staffKeys.all(restaurantId) }),
  });
}
