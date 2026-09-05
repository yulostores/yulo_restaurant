import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { staffApi } from "@/api/staff.api";

export const waiterKeys = {
  // Scoped, because the open floor and the day's settled sittings are two different
  // reads of the same endpoint and must not overwrite each other in the cache.
  sessions:    (rId, scope = "open") => ["waiter", rId, "sessions", scope],
  allSessions: (rId) => ["waiter", rId, "sessions"],
  menu:     (rId) => ["waiter", rId, "menu"],
  tables:   (rId) => ["waiter", rId, "tables"],
  bill:     (rId, sessionId) => ["waiter", rId, "bill", sessionId],
};

// ── Table sessions, each with its orders and a runningTotal ──────────
// scope "open" is the live floor; "completed" is today's settled sittings, which the
// dashboard's Completed filter reads. A closed sitting can't change, so that scope isn't
// polled — only `enabled` callers pay for it at all.
export function useWaiterSessions(restaurantId, scope = "open", options = {}) {
  const enabled = (options.enabled ?? true) && !!restaurantId;
  return useQuery({
    queryKey: waiterKeys.sessions(restaurantId, scope),
    queryFn: () => staffApi.getSessions(restaurantId, scope).then((r) => r.data.data.sessions ?? []),
    enabled,
    refetchInterval: scope === "open" ? 15_000 : false,
    staleTime: scope === "open" ? 0 : 30_000,
  });
}

// ── Menu for placing orders — same shape as the public menu endpoint ─
// { menu: [{ _id, name, subCategories: [{ _id, name, items }], items }] }
export function useWaiterMenu(restaurantId) {
  return useQuery({
    queryKey: waiterKeys.menu(restaurantId),
    queryFn: () => staffApi.getMenu(restaurantId).then((r) => r.data.data.menu ?? []),
    enabled: !!restaurantId,
    staleTime: 5 * 60_000, // menu rarely changes during service
  });
}

// ── Tables, each with its current open session (or null) ─────────────
export function useWaiterTables(restaurantId) {
  return useQuery({
    queryKey: waiterKeys.tables(restaurantId),
    queryFn: () => staffApi.getTables(restaurantId).then((r) => r.data.data.tables ?? []),
    enabled: !!restaurantId,
    staleTime: 60_000,
  });
}

// ── Bill for a session (idempotent — safe to call repeatedly) ────────
// The server refuses to raise the bill while a round is still unserved (409
// ORDERS_PENDING). That's a rule, not a blip — retrying it just delays the message the
// waiter needs, so 4xx answers are taken at their word.
export function useSessionBill(restaurantId, sessionId) {
  return useQuery({
    queryKey: waiterKeys.bill(restaurantId, sessionId),
    queryFn: () => staffApi.getBill(restaurantId, sessionId).then((r) => r.data.data.bill),
    enabled: !!restaurantId && !!sessionId,
    staleTime: 30_000,
    retry: (count, err) => (err?.status >= 400 && err?.status < 500 ? false : count < 1),
  });
}

// ── Create a dine-in order for an open table session ─────────────────
// body: { tableSessionId, items: [{ menuItemId, quantity }], specialInstructions? }
export function useCreateOrder(restaurantId) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (body) => staffApi.createOrder(restaurantId, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: waiterKeys.allSessions(restaurantId) });
      qc.invalidateQueries({ queryKey: waiterKeys.tables(restaurantId) });
    },
  });
}

// ── Close the bill and free the table ────────────────────────────────
export function useMarkPaid(restaurantId) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: ({ sessionId, paymentMethod }) =>
      staffApi.markPaid(restaurantId, sessionId, paymentMethod),
    onSuccess: (_data, { sessionId }) => {
      qc.invalidateQueries({ queryKey: waiterKeys.allSessions(restaurantId) });
      qc.invalidateQueries({ queryKey: waiterKeys.tables(restaurantId) });
      qc.invalidateQueries({ queryKey: waiterKeys.bill(restaurantId, sessionId) });
    },
  });
}

// ── Move a ticket along — the waiter's own status transition ─────────
// newStatus: "confirmed" | "preparing" | "ready" | "served". "served" is the
// step only the floor can report; the server enforces the same transition
// table the chef KDS uses.
export function useUpdateOrderStatus(restaurantId) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: ({ orderId, newStatus }) =>
      staffApi.waiterUpdateOrderStatus(restaurantId, orderId, newStatus),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: waiterKeys.allSessions(restaurantId) });
      qc.invalidateQueries({ queryKey: waiterKeys.tables(restaurantId) });
    },
  });
}

// ── Scan a table QR — qrToken is the tableId from the QR URL ─────────
export function useScanTable(restaurantId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (qrToken) => staffApi.scanTable(restaurantId, qrToken),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: waiterKeys.allSessions(restaurantId) });
      qc.invalidateQueries({ queryKey: waiterKeys.tables(restaurantId) });
    },
  });
}
