import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ownerApi } from "@/api/owner.api";

export const loyaltyKeys = {
  all:        (rId) => ["loyalty", rId],
  program:    (rId) => ["loyalty", rId, "program"],
  milestones: (rId) => ["loyalty", rId, "milestones"],
};

// { isActive, pointsPerRupee, redemptionRate, minimumRedemption }
export function useLoyaltyProgram(restaurantId) {
  return useQuery({
    queryKey: loyaltyKeys.program(restaurantId),
    queryFn: () => ownerApi.getLoyalty(restaurantId).then((r) => r.data.data.program ?? null),
    enabled: !!restaurantId,
    staleTime: 5 * 60_000,
  });
}

// PATCH upserts — safe to call before a program exists.
export function useUpdateLoyaltyProgram(restaurantId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body) => ownerApi.updateLoyalty(restaurantId, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: loyaltyKeys.all(restaurantId) }),
  });
}

export function useMilestones(restaurantId) {
  return useQuery({
    queryKey: loyaltyKeys.milestones(restaurantId),
    queryFn: () => ownerApi.listMilestones(restaurantId).then((r) => r.data.data.milestones ?? []),
    enabled: !!restaurantId,
    staleTime: 5 * 60_000,
  });
}

export function useCreateMilestone(restaurantId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body) => ownerApi.createMilestone(restaurantId, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: loyaltyKeys.milestones(restaurantId) }),
  });
}

export function useUpdateMilestone(restaurantId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ mId, body }) => ownerApi.updateMilestone(restaurantId, mId, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: loyaltyKeys.milestones(restaurantId) }),
  });
}

export function useDeleteMilestone(restaurantId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (mId) => ownerApi.deleteMilestone(restaurantId, mId),
    onSettled: () => qc.invalidateQueries({ queryKey: loyaltyKeys.milestones(restaurantId) }),
  });
}
