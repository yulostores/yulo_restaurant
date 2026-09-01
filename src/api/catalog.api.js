import client from "./client";

// Public reference data shared across portals — no auth, no restaurant scope, so it
// belongs neither in owner.api.js (everything there is /api/owner/:restaurantId) nor in
// customer.api.js (the owner portal reads this too).

export const catalogApi = {
  // GET /api/cuisines -> { cuisines: [{ name, restaurantCount }] }, most-used first.
  // Derived from the cuisines restaurants actually use, not a fixed list — see
  // controllers/cuisine.controller.js.
  listCuisines: () => client.get("/cuisines"),
};
