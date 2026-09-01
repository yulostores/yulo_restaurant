import client from "./client";

// /api/users/me is shared by customers and restaurant owners (API.md
// § Customer — Profile: "role `customer` or `restaurant_owner`"), so both
// portals read and edit their account through it.
//
// Documented editable fields are `name` and `phone`. There is no password-change
// endpoint — see API-GAPS.md.

export const userApi = {
  getMe:    ()     => client.get("/users/me"),
  updateMe: (body) => client.patch("/users/me", body),

  // Same endpoint, sent as multipart/form-data so an `avatar` file (max 2 MB, JPEG/PNG/
  // WebP) can ride along with the text fields. Axios derives the multipart boundary from
  // the FormData itself, so setting Content-Type by hand here would corrupt the body.
  updateMeMultipart: (formData) => client.patch("/users/me", formData),

  addAddress:    (body)   => client.post("/users/me/addresses", body),
  removeAddress: (addrId) => client.delete(`/users/me/addresses/${addrId}`),
};

// Serialises a profile patch into FormData, appending a File as-is. Mirrors
// buildSettingsFormData in hooks/owner/useSettings.js.
export function buildProfileFormData(patch = {}) {
  const fd = new FormData();
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined || value === null) continue;
    if (value instanceof File || value instanceof Blob) fd.append(key, value);
    else if (typeof value === "object") fd.append(key, JSON.stringify(value));
    else fd.append(key, String(value));
  }
  return fd;
}
