import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ownerApi } from "@/api/owner.api";

export const menuItemKeys = {
  all:  (rId)     => ["menu-items", rId],
  list: (rId)     => ["menu-items", rId, "list"],
  one:  (rId, id) => ["menu-items", rId, "item", id],
};

// GET /owner/:rId/menu-items returns every item, available or not — filtering
// is a client concern (the endpoint takes no query params).
//
// `enabled` lets callers skip the request while the restaurant is unapproved:
// the route sits behind requireRestaurantApproved and 403s until then, so
// firing it only buys a guaranteed error.
export function useMenuItems(restaurantId, { enabled = true } = {}) {
  return useQuery({
    queryKey: menuItemKeys.list(restaurantId),
    queryFn: () => ownerApi.listMenuItems(restaurantId).then((r) => r.data.data.items ?? []),
    enabled: !!restaurantId && enabled,
    staleTime: 60_000,
    // 401/403/404 won't fix themselves on a retry.
    retry: (count, err) => (err?.status >= 400 && err?.status < 500 ? false : count < 2),
  });
}

export function useMenuItem(restaurantId, itemId) {
  return useQuery({
    queryKey: menuItemKeys.one(restaurantId, itemId),
    queryFn: () => ownerApi.getMenuItem(restaurantId, itemId).then((r) => r.data.data.item),
    enabled: !!restaurantId && !!itemId,
  });
}

export function useToggleMenuItem(restaurantId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (itemId) => ownerApi.toggleMenuItem(restaurantId, itemId),
    onMutate: async (itemId) => {
      await qc.cancelQueries({ queryKey: menuItemKeys.all(restaurantId) });
      const snap = qc.getQueriesData({ queryKey: menuItemKeys.all(restaurantId) });
      qc.setQueriesData({ queryKey: menuItemKeys.all(restaurantId) }, (old) => {
        if (!Array.isArray(old)) return old;
        return old.map((i) => (i._id === itemId ? { ...i, isAvailable: !i.isAvailable } : i));
      });
      return { snap };
    },
    onError: (_e, _v, ctx) => {
      ctx?.snap?.forEach(([key, val]) => qc.setQueryData(key, val));
    },
    onSettled: () => qc.invalidateQueries({ queryKey: menuItemKeys.all(restaurantId) }),
  });
}

// create/update take FormData — the endpoint is multipart/form-data so an
// optional `image` file can ride along.
export function useCreateMenuItem(restaurantId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (formData) => ownerApi.createMenuItem(restaurantId, formData),
    onSuccess: () => qc.invalidateQueries({ queryKey: menuItemKeys.all(restaurantId) }),
  });
}

export function useUpdateMenuItem(restaurantId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ itemId, formData }) => ownerApi.updateMenuItem(restaurantId, itemId, formData),
    onSuccess: () => qc.invalidateQueries({ queryKey: menuItemKeys.all(restaurantId) }),
  });
}

// Soft delete — the server flips isAvailable to false to preserve order history.
export function useDeleteMenuItem(restaurantId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (itemId) => ownerApi.deleteMenuItem(restaurantId, itemId),
    onSettled: () => qc.invalidateQueries({ queryKey: menuItemKeys.all(restaurantId) }),
  });
}

export function useUpdateIngredients(restaurantId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ itemId, ingredients }) =>
      ownerApi.updateIngredients(restaurantId, itemId, ingredients),
    onSuccess: () => qc.invalidateQueries({ queryKey: menuItemKeys.all(restaurantId) }),
  });
}

// ── Categories ────────────────────────────────────────────────────────
export const categoryKeys = {
  all:  (rId)      => ["categories", rId],
  list: (rId)      => ["categories", rId, "list"],
  subs: (rId, cId) => ["categories", rId, cId, "subcategories"],
};

// Same approval gate as menu items — /categories is locked until admin approves.
export function useCategories(restaurantId, { enabled = true } = {}) {
  return useQuery({
    queryKey: categoryKeys.list(restaurantId),
    queryFn: () => ownerApi.listCategories(restaurantId).then((r) => r.data.data.categories ?? []),
    enabled: !!restaurantId && enabled,
    staleTime: 5 * 60_000,
    retry: (count, err) => (err?.status >= 400 && err?.status < 500 ? false : count < 2),
  });
}

export function useSubCategories(restaurantId, categoryId) {
  return useQuery({
    queryKey: categoryKeys.subs(restaurantId, categoryId),
    queryFn: () =>
      ownerApi.listSubCategories(restaurantId, categoryId)
        .then((r) => r.data.data.subCategories ?? []),
    enabled: !!restaurantId && !!categoryId,
    staleTime: 5 * 60_000,
  });
}

export function useCreateCategory(restaurantId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body) => ownerApi.createCategory(restaurantId, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: categoryKeys.all(restaurantId) }),
  });
}

export function useUpdateCategory(restaurantId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ cId, body }) => ownerApi.updateCategory(restaurantId, cId, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: categoryKeys.all(restaurantId) }),
  });
}

export function useDeleteCategory(restaurantId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (cId) => ownerApi.deleteCategory(restaurantId, cId),
    onSuccess: () => qc.invalidateQueries({ queryKey: categoryKeys.all(restaurantId) }),
  });
}

export function useCreateSubCategory(restaurantId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ cId, body }) => ownerApi.createSubCategory(restaurantId, cId, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: categoryKeys.all(restaurantId) }),
  });
}
