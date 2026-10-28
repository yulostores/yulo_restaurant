// Contract check (FT): every field the live-activity screens read must exist, with the type they
// expect, in the backend's captured payloads (yulo_backend/docs/live-fixtures, copied into
// ./fixtures/live and kept identical — the backend's own e2e test fails if those drift from the
// API). A field renamed or dropped on either side fails here instead of rendering blank.

import { describe, expect, it } from "vitest";

import sessionsList from "./fixtures/live/owner-sessions-list.json";
import sessionDetail from "./fixtures/live/owner-session-detail.json";
import sessionEvents from "./fixtures/live/owner-session-events.json";
import offerCreated from "./fixtures/live/owner-offer-created.json";
import offerPreview from "./fixtures/live/owner-offer-preview.json";
import offerRevoked from "./fixtures/live/owner-offer-revoked.json";
import offersList from "./fixtures/live/owner-offers-list.json";
import metrics from "./fixtures/live/owner-metrics.json";
import sessionUpdated from "./fixtures/live/socket-session_updated.json";
import activityEvent from "./fixtures/live/socket-activity_event.json";
import offerUpdated from "./fixtures/live/socket-offer_updated.json";
import sessionRemoved from "./fixtures/live/socket-session_removed.json";
import acks from "./fixtures/live/socket-acks.json";

const typeOf = (v) => (v === null ? "null" : Array.isArray(v) ? "array" : typeof v);

/** Each `path: types` must resolve in `obj` to one of `types` ("a|b"). */
function expectFields(obj, spec) {
  for (const [path, types] of Object.entries(spec)) {
    const value = path.split(".").reduce((o, key) => (o == null ? undefined : o[key]), obj);
    expect(types.split("|"), `${path} is ${typeOf(value)}`).toContain(typeOf(value));
  }
}

// What the session list, detail header and socket rows read (owner.api.js @typedef SessionRow).
const SESSION_ROW = {
  id: "string",
  displayName: "string",
  isGuest: "boolean",
  pastOrderCount: "number",
  status: "string",
  startedAt: "string",
  lastActivityAt: "string",
  lastEvent: "object|null",
  "lastEvent.label": "string",
  "cart.itemCount": "number",
  "cart.totalPaise": "number",
  "cart.items": "array",
  cameFromSearch: "string|null",
  eventCount: "number",
  orderId: "string|null",
  offerEligible: "boolean|null",
  notEligibleReason: "string|null",
};

const OFFER = {
  id: "string",
  title: "string",
  type: "string",
  percentage: "number|null",
  flatAmount: "number|null",
  maxDiscountAmount: "number|null",
  status: "string",
  sentAt: "string",
  expiresAt: "string",
  orderId: "string|null",
  redemptionCount: "number",
};

describe("live contract: owner endpoints", () => {
  it("GET …/live/sessions", () => {
    expectFields(sessionsList.data, {
      sessions: "array",
      "summary.live": "number",
      "summary.cartsInProgress": "number",
      "summary.cartsTotalPaise": "number",
      "summary.abandonedLastHour": "number",
    });
    expectFields(sessionsList.data.sessions[0], SESSION_ROW);
    expect(Object.keys(sessionsList.data.sessions[0]).sort()).toEqual(Object.keys(sessionUpdated).sort());
  });

  it("GET …/live/sessions/:id", () => {
    expectFields(sessionDetail.data, { session: "object", "cart.items": "array", "cart.totalPaise": "number", offers: "array" });
    expectFields(sessionDetail.data.session, SESSION_ROW);
    expectFields(sessionDetail.data.cart.items[0], { menuItemId: "string", name: "string", qty: "number", unitPricePaise: "number" });
  });

  it("GET …/live/sessions/:id/events", () => {
    expectFields(sessionEvents.data, { events: "array", nextBefore: "string|null" });
    expectFields(sessionEvents.data.events[0], { id: "string", type: "string", label: "string", at: "string", data: "object" });
  });

  it("POST …/live/offers (sent, preview) and revoke", () => {
    expectFields(offerCreated.data.offer, OFFER);
    expectFields(offerRevoked.data.offer, { ...OFFER, revokedAt: "string" });
    expectFields(offerPreview.data, { wouldSavePaise: "number", cartTotalPaise: "number", eligibleSubtotalPaise: "number" });
  });

  it("GET …/live/offers", () => {
    expectFields(offersList.data, { offers: "array", page: "number", hasMore: "boolean", from: "string", to: "string" });
    expectFields(offersList.data.offers[0], { ...OFFER, customerName: "string", orderTotalPaise: "number|null" });
  });

  it("GET …/live/metrics", () => {
    expectFields(metrics.data, {
      range: "string",
      sent: "number",
      delivered: "number",
      viewed: "number",
      applied: "number",
      redeemed: "number",
      expired: "number",
      revoked: "number",
      conversionRate: "number",
      revenuePaise: "number",
      discountPaise: "number",
    });
  });
});

describe("live contract: socket", () => {
  it("events the dashboard listens to", () => {
    expectFields(sessionUpdated, SESSION_ROW);
    expectFields(activityEvent, { sessionId: "string", id: "string", type: "string", label: "string", at: "string", data: "object" });
    expectFields(offerUpdated, { offerId: "string", sessionId: "string|null", offerStatus: "string", at: "string" });
    expectFields(sessionRemoved, { sessionId: "string" });
  });

  it("join_restaurant ack", () => {
    expect(acks.join_restaurant).toEqual({ ok: true });
    expectFields(acks.join_user_refused, { ok: "boolean", code: "string" });
  });
});
