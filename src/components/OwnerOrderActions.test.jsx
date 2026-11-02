import { describe, expect, it } from "vitest";

import { ownerCanCancel, ownerSteps } from "./OwnerOrderActions";

const steps = (order) => ownerSteps(order).map((s) => s.key);

describe("ownerSteps", () => {
  it("QR / dine-in: preparing → ready or served → served", () => {
    expect(steps({ status: "confirmed", type: "dine_in" })).toEqual(["preparing"]);
    expect(steps({ status: "preparing", type: "dine_in" })).toEqual(["ready", "served"]);
    expect(steps({ status: "ready", type: "dine_in" })).toEqual(["served"]);
    expect(steps({ status: "served", type: "dine_in" })).toEqual([]);
  });

  it("takeaway is handed over at the counter", () => {
    expect(ownerSteps({ status: "ready", type: "takeaway" })).toEqual([{ key: "picked_up", status: "delivered" }]);
  });

  it("delivery: the restaurant sends it out only when no rider has it", () => {
    expect(steps({ status: "ready", type: "delivery", deliveryAssignment: { status: "unassigned" } })).toEqual(["out_for_delivery"]);
    expect(steps({ status: "ready", type: "delivery", deliveryAssignment: { status: "assigned" } })).toEqual([]);
    expect(steps({ status: "out_for_delivery", type: "delivery", deliveryAssignment: { status: "picked_up" } })).toEqual([]);
    expect(steps({ status: "out_for_delivery", type: "delivery", deliveryAssignment: { status: "unassigned" } })).toEqual(["delivered"]);
  });

  it("nothing for a waiting order — that is Accept / Reject", () => {
    expect(steps({ status: "placed", type: "delivery" })).toEqual([]);
    expect(ownerCanCancel({ status: "placed" })).toBe(false);
  });

  it("cancel after accepting, until the food has left", () => {
    expect(ownerCanCancel({ status: "preparing", type: "dine_in" })).toBe(true);
    expect(ownerCanCancel({ status: "ready", type: "delivery", deliveryAssignment: { status: "picked_up" } })).toBe(false);
    expect(ownerCanCancel({ status: "served", type: "dine_in" })).toBe(false);
  });
});
