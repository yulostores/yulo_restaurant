import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ownerApi } from "@/api/owner.api";

export const settingsKeys = {
  all:      (rId) => ["settings", rId],
  main:     (rId) => ["settings", rId, "main"],
  hours:    (rId) => ["settings", rId, "hours"],
  delivery: (rId) => ["settings", rId, "delivery"],
  // Not restaurant-scoped — the contract is the same for every store, and the create
  // step needs it before a restaurant id exists.
  requirements: () => ["settings", "requirements"],
};

// GET /owner/settings-requirements — which fields the form shows, which of them are
// mandatory, and the rules each value must satisfy. The screen renders its labels,
// required markers, dropdown options and input limits from this rather than holding its
// own copy, so the client and PATCH /settings can't drift apart on what a valid store
// profile is. It changes only when the server does, hence the long staleTime.
export function useSettingsRequirements() {
  return useQuery({
    queryKey: settingsKeys.requirements(),
    queryFn: () =>
      ownerApi.getSettingsRequirements().then((r) => r.data.data.requirements),
    staleTime: 60 * 60_000,
  });
}

// GET /owner/:rId/settings — the restaurant record (name, logo, banner, …)
export function useSettings(restaurantId) {
  return useQuery({
    queryKey: settingsKeys.main(restaurantId),
    queryFn: () =>
      ownerApi.getSettings(restaurantId).then((r) => r.data.data.restaurant ?? r.data.data),
    enabled: !!restaurantId,
    staleTime: 5 * 60_000,
  });
}

// PATCH /settings is multipart/form-data so `logo` and `banner` files can ride
// along. Callers pass a FormData built by buildSettingsFormData below.
export function useUpdateSettings(restaurantId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (formData) => ownerApi.updateSettings(restaurantId, formData),
    onSuccess: ({ data }) => {
      const restaurant = data.data?.restaurant;
      if (restaurant) qc.setQueryData(settingsKeys.main(restaurantId), restaurant);
      qc.invalidateQueries({ queryKey: settingsKeys.all(restaurantId) });
    },
  });
}

// Serialises a settings patch into FormData. Objects/arrays are JSON-encoded;
// File values are appended as-is.
export function buildSettingsFormData(patch = {}) {
  const fd = new FormData();
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined || value === null) continue;
    if (value instanceof File || value instanceof Blob) fd.append(key, value);
    else if (typeof value === "object") fd.append(key, JSON.stringify(value));
    else fd.append(key, String(value));
  }
  return fd;
}

// ── Operating hours ───────────────────────────────────────────────────
// { operatingHours: [{ day, isOpen, openTime, closeTime }] } — times are HHMM ints.
export function useHours(restaurantId) {
  return useQuery({
    queryKey: settingsKeys.hours(restaurantId),
    queryFn: () =>
      ownerApi.getHours(restaurantId).then((r) => r.data.data.operatingHours ?? []),
    enabled: !!restaurantId,
    staleTime: 5 * 60_000,
  });
}

export function useUpdateHours(restaurantId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (operatingHours) => ownerApi.updateHours(restaurantId, { operatingHours }),
    onSuccess: () => qc.invalidateQueries({ queryKey: settingsKeys.all(restaurantId) }),
  });
}

// ── Delivery config ───────────────────────────────────────────────────
// { radiusKm, baseCharge, freeThreshold, estimatedMinutes }
export function useDeliverySettings(restaurantId) {
  return useQuery({
    queryKey: settingsKeys.delivery(restaurantId),
    // GET /settings/delivery answers { data: { delivery: {...} } } — unwrapping only to
    // `data` handed callers an object whose radiusKm/baseCharge/… were all undefined.
    queryFn: () => ownerApi.getDelivery(restaurantId).then((r) => r.data.data.delivery ?? r.data.data),
    enabled: !!restaurantId,
    staleTime: 5 * 60_000,
  });
}

export function useUpdateDelivery(restaurantId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body) => ownerApi.updateDelivery(restaurantId, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: settingsKeys.all(restaurantId) }),
  });
}
