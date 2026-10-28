// Builders for live-activity tests, from the backend's contract fixtures
// (yulo_backend/docs/live-fixtures, copied into ./fixtures/live): the shapes are the API's own;
// only ids, dates and the fields a test is about are filled in.

import sessionsList from "./fixtures/live/owner-sessions-list.json";
import sessionDetail from "./fixtures/live/owner-session-detail.json";
import sessionEvents from "./fixtures/live/owner-session-events.json";
import metrics from "./fixtures/live/owner-metrics.json";
import activityEvent from "./fixtures/live/socket-activity_event.json";

const clone = (value) => JSON.parse(JSON.stringify(value));
const minutesAgo = (m) => new Date(Date.now() - m * 60_000).toISOString();

/** A session row (the list / session_updated shape). */
export function sessionRow({ id = "s1", ago = 1, ...overrides } = {}) {
  const row = clone(sessionsList.data.sessions[0]);
  return {
    ...row,
    id,
    startedAt: minutesAgo(ago + 5),
    lastActivityAt: minutesAgo(ago),
    lastEvent: { ...row.lastEvent, at: minutesAgo(ago) },
    ...overrides,
  };
}

/** `{ sessions, summary }` as GET …/live/sessions returns it. */
export function sessionsPage(sessions, summary = {}) {
  return { sessions, summary: { ...clone(sessionsList.data.summary), ...summary } };
}

/** `{ session, cart, offers }` for one session. */
export function detailFor(row, overrides = {}) {
  const detail = clone(sessionDetail.data);
  return {
    ...detail,
    session: row,
    cart: { ...detail.cart, items: detail.cart.items.map((l, i) => ({ ...l, menuItemId: `m${i}` })), updatedAt: row.lastActivityAt },
    offers: detail.offers.map((o, i) => ({ ...o, id: `o${i}` })),
    ...overrides,
  };
}

/** One timeline page; events get ids e1… */
export function eventsPage(ids, nextBefore = null) {
  const template = clone(sessionEvents.data.events[0]);
  return {
    events: ids.map((id, i) => ({ ...template, id, label: `Event ${id}`, at: minutesAgo(i) })),
    nextBefore,
  };
}

/** An `activity_event` socket payload. */
export function activityEventFor(sessionId, id = "e-new") {
  return { ...clone(activityEvent), sessionId, id, label: "Viewed Butter Naan", at: new Date().toISOString() };
}

export function metricsToday(overrides = {}) {
  return { ...clone(metrics.data), ...overrides };
}

/** A fake owner socket (the interface of createOwnerSocket) the test can drive. */
export function fakeOwnerSocket(initialState = "connected") {
  const handlers = new Map();
  const listeners = new Set();
  let state = initialState;
  return {
    setRestaurant: () => {},
    disconnect: () => {},
    on(event, fn) {
      if (!handlers.has(event)) handlers.set(event, new Set());
      handlers.get(event).add(fn);
      return () => handlers.get(event).delete(fn);
    },
    emit: (event, payload) => [...(handlers.get(event) ?? [])].forEach((fn) => fn(payload)),
    getState: () => state,
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    setState(next) {
      state = next;
      listeners.forEach((fn) => fn(next));
    },
  };
}
