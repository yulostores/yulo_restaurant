import { useQuery } from "@tanstack/react-query";
import { customerApi } from "@/api/customer.api";

export const menuKeys = {
  list:       (p)   => ["restaurants", p],
  menu:       (rId) => ["customer-menu", rId],
  restaurant: (rId) => ["customer-restaurant", rId],
  reviews:    (rId) => ["customer-reviews", rId],
};

// Public restaurant discovery — params: { lat, lng, radius, cuisine, page, limit }
export function useRestaurants(params = {}) {
  return useQuery({
    queryKey: menuKeys.list(params),
    queryFn: () => customerApi.listRestaurants(params).then((r) => r.data.data),
    staleTime: 60_000,
  });
}

// Public menu — no auth. Server returns a category tree:
// [{ _id, name, subCategories: [{ _id, name, items }], items }]
export function useRestaurantMenu(restaurantId) {
  return useQuery({
    queryKey: menuKeys.menu(restaurantId),
    queryFn: () => customerApi.getMenu(restaurantId).then((r) => r.data.data.menu ?? []),
    enabled: !!restaurantId,
    staleTime: 5 * 60_000,
  });
}

export function useRestaurant(restaurantId) {
  return useQuery({
    queryKey: menuKeys.restaurant(restaurantId),
    queryFn: () => customerApi.getRestaurant(restaurantId).then((r) => r.data.data.restaurant),
    enabled: !!restaurantId,
    staleTime: 10 * 60_000,
  });
}

export function useRestaurantReviews(restaurantId, params = {}) {
  return useQuery({
    queryKey: [...menuKeys.reviews(restaurantId), params],
    queryFn: () => customerApi.getReviews(restaurantId, params).then((r) => r.data.data),
    enabled: !!restaurantId,
    staleTime: 5 * 60_000,
  });
}

// Flattens the category tree into a single item list, tagging each item with
// the category (and subcategory) it came from — most screens want a flat list.
export function flattenMenu(menu = []) {
  const out = [];
  for (const category of menu) {
    for (const item of category.items ?? []) {
      out.push({ ...item, categoryName: category.name, subCategoryName: null });
    }
    for (const sub of category.subCategories ?? []) {
      for (const item of sub.items ?? []) {
        out.push({ ...item, categoryName: category.name, subCategoryName: sub.name });
      }
    }
  }
  return out;
}
