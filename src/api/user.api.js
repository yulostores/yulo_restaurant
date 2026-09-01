import client from "./client";

// /api/users/me is shared by customers and restaurant owners (API.md
// § Customer — Profile: "role `customer` or `restaurant_owner`"), so both
// portals read and edit their account through it.
//
// Documented editable fields are `name` and `phone`. There is no password-change
// endpoint and no notification-preferences resource — see API-GAPS.md.

export const userApi = {
  getMe:    ()     => client.get("/users/me"),
  updateMe: (body) => client.patch("/users/me", body),

  addAddress:    (body)   => client.post("/users/me/addresses", body),
  removeAddress: (addrId) => client.delete(`/users/me/addresses/${addrId}`),
};
