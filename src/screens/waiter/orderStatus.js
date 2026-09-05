// How the floor reads — and moves — a ticket.
//
// The kitchen drives the first three steps from its own board (ChefDashboard's
// "Accept Order" → placed→confirmed, "Start Preparing" → confirmed→preparing,
// "Mark as Ready" → preparing→ready). None of those are the waiter's to take, so the
// floor is shown one word for all of them: "Preparing". Only the chef can turn that into
// "Prepared", and only then is there anything for the waiter to do.
//
// That leaves the waiter exactly one action — carrying a prepared round to the table and
// marking it served — which is why this module exposes a single action rather than the
// old walk-the-ticket-forward chain.

// Kitchen status → the state the floor sees. 'confirmed' deliberately collapses into
// "preparing": from the floor's side an accepted-but-not-started round and one on the
// pass look the same — the food isn't ready yet.
const FLOOR_STATUS = {
  placed: "preparing",
  confirmed: "preparing",
  preparing: "preparing",
  ready: "prepared",
  served: "served",
};

const FLOOR_STATUS_LABEL = {
  preparing: "Preparing",
  prepared: "Prepared",
  served: "Served",
  out_for_delivery: "Out for delivery",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

// Delivery/takeaway states (out_for_delivery, delivered, cancelled) pass through
// untouched — they aren't part of the dine-in floor flow but still have to render.
export function floorStatus(status) {
  return FLOOR_STATUS[status] ?? status ?? "preparing";
}

export function floorStatusLabel(status) {
  const key = floorStatus(status);
  return FLOOR_STATUS_LABEL[key] ?? String(key).replace(/_/g, " ");
}

// ── The floor's filters ──────────────────────────────────────────────
//
// Named for rounds, not tables, because that is what the waiter is actually looking for:
// "what am I waiting on" and "what can I carry out" are questions about tickets. Each
// filter narrows to the rounds in that state — a table with one round on the pass and one
// still cooking appears under both, showing only the relevant round each time.
//
// 'completed' is the odd one out: a settled sitting has no live rounds at all, so it is a
// different set of sessions (GET …/waiter/sessions?scope=completed) rather than a filter
// over the open ones. There is deliberately no "Bill requested" filter — the floor raises
// the bill itself from the table card, so a guest-requested-bill state isn't part of this
// flow.
export const FLOOR_FILTERS = [
  { value: "all",       label: "All Orders" },
  { value: "preparing", label: "Preparing" },
  { value: "ready",     label: "Ready To Serve" },
  { value: "served",    label: "Served" },
  { value: "completed", label: "Completed" },
];

// The filter values are the floor's own vocabulary (see FLOOR_STATUS above), except
// "ready", which reads as the waiter's job — carry it out — while the ticket itself is
// 'prepared'.
const FILTER_TO_FLOOR_STATUS = { preparing: "preparing", ready: "prepared", served: "served" };

export function matchesFloorFilter(order, filter) {
  if (filter === "all") return true;
  const want = FILTER_TO_FLOOR_STATUS[filter];
  return want ? floorStatus(order?.status) === want : false;
}

// Whether this filter reads settled sittings instead of the open floor.
export function isCompletedFilter(filter) {
  return filter === "completed";
}

// The floor's one step on a round. The button is offered from the moment the round is
// placed so the waiter can see it coming, but stays inert until the kitchen reports
// 'ready' — the server's transition table would reject anything else anyway. Returns
// null once there is nothing left to serve.
export function serveAction(order) {
  const status = order?.status;
  if (["served", "delivered", "out_for_delivery", "cancelled"].includes(status)) return null;
  return { newStatus: "served", label: "Mark served", enabled: status === "ready" };
}

export const SERVE_BLOCKED_HINT = "Waiting for the kitchen to mark this round ready";

// ── When a sitting can be billed ─────────────────────────────────────
//
// A round the floor has finished with. Mirrors SERVED_ROUND_STATUSES in the server's
// services/billing.service.js: 'served' is the dine-in terminal state the waiter sets,
// 'delivered' is kept for rounds closed out before 'served' existed as a state.
const SERVED_STATUSES = ["served", "delivered"];

// A cancelled round is off the bill entirely, so it never holds the table open; anything
// else the kitchen still has does, because what the table owes isn't final until the last
// round is on it.
export function pendingRounds(session) {
  return (session?.orders ?? []).filter(
    (o) => o?.status !== "cancelled" && !SERVED_STATUSES.includes(o?.status),
  );
}

// Whether the final bill can be raised for this sitting, and — when it can't — the reason
// to show the waiter instead of a button that could only fail. The server enforces the
// same rule (409 ORDERS_PENDING from the waiter bill endpoints), so this is the honest
// reading of the session rather than a second, drifting copy of the rule.
export function billReadiness(session) {
  const orders = (session?.orders ?? []).filter((o) => o?.status !== "cancelled");
  if (orders.length === 0) {
    return { ready: false, pendingCount: 0, reason: "No rounds ordered at this table yet" };
  }

  const pending = pendingRounds(session);
  if (pending.length === 0) return { ready: true, pendingCount: 0, reason: "" };

  return {
    ready: false,
    pendingCount: pending.length,
    reason:
      pending.length === 1
        ? "1 round still to be served"
        : `${pending.length} rounds still to be served`,
  };
}
