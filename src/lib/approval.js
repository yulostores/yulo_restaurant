// Restaurant approval lifecycle — one source of truth for the copy and the
// "can this owner use the portal yet?" rule.
//
// The server owns the state machine (Restaurant.approvalStatus):
//   pending → active | rejected     (admin review)
//   active  → suspended → active    (admin lifecycle)
//   active  → expired               (plan lapse)
//
// Only `active` unlocks the portal. The backend independently enforces this on
// /categories, /menu-items and /staff (403 RESTAURANT_NOT_APPROVED); everything
// else — QR, orders, offers, live monitor — is gated here, client-side, because
// those routes have no server-side approval check.

export const APPROVAL_COPY = {
  // The approved state. Unlike the others this locks nothing — it exists so the
  // portal can *say* the restaurant is approved instead of showing nothing at all,
  // which read as "the status never loaded" rather than "you're live".
  active: {
    badge: "Approved",
    tone: "ok",
    title: "Your restaurant is approved and live",
    body:
      "A Yulo admin approved this restaurant. Staff, menu, table QR codes, offers and orders are all unlocked.",
    cta: "Review store details",
  },
  // No restaurant document at all: the owner signed up but never applied.
  none: {
    badge: "Not submitted",
    tone: "warn",
    title: "Add your restaurant to get started",
    body:
      "Your account is ready, but there's no restaurant on file yet. Fill in your store details and submit them — a Yulo admin reviews every application before the portal unlocks.",
    cta: "Add restaurant details",
  },
  pending: {
    badge: "Under review",
    tone: "warn",
    title: "Your restaurant is awaiting admin approval",
    body:
      "We've sent your application to the Yulo admin team. Once they approve it you'll be able to add staff, build your menu, generate table QR codes, run offers and take orders. Until then the portal stays locked — you can keep editing your store details while you wait.",
    cta: "Review store details",
  },
  rejected: {
    badge: "Rejected",
    tone: "danger",
    title: "Your application wasn't approved",
    body:
      "The Yulo admin team rejected this restaurant. Correct the details they flagged and save your store settings — the updated profile goes back for review.",
    cta: "Update store details",
  },
  suspended: {
    badge: "Suspended",
    tone: "info",
    title: "This restaurant is suspended",
    body:
      "A Yulo admin has suspended this restaurant, so staff, menu and ordering are locked. Contact support to have it reactivated — everything unlocks again the moment it is.",
    cta: "Review store details",
  },
  expired: {
    badge: "Expired",
    tone: "muted",
    title: "This restaurant's listing has expired",
    body:
      "The plan for this restaurant has lapsed, so the portal is locked. Renew it to manage staff, menu and orders again.",
    cta: "Review store details",
  },
};

// `approvalStatus` is null when the owner has no restaurant yet.
export function approvalCopy(approvalStatus) {
  if (!approvalStatus) return APPROVAL_COPY.none;
  return APPROVAL_COPY[approvalStatus] ?? APPROVAL_COPY.pending;
}

// Badge label + <Badge variant> for any approval state, including `active`. The
// `tone` values above are named after the Badge variants (ui/badge.jsx) so the
// two stay in step — a status shown as a locked banner on one screen and a chip
// on another should not disagree about its colour.
export function approvalBadge(approvalStatus) {
  const copy = approvalCopy(approvalStatus);
  return { label: copy.badge, variant: copy.tone };
}

// Screens an owner can always reach — they are how an unapproved owner submits
// or corrects the application, plus their own account page.
export const ALWAYS_ALLOWED_PATHS = ["/store-settings", "/profile"];

export function isAlwaysAllowed(pathname) {
  return ALWAYS_ALLOWED_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}
