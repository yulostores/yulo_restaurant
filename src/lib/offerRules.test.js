import { describe, expect, it } from "vitest";

import { EMPTY_OFFER_FORM, offerBody, offerValueText, paiseText, validateOfferForm } from "./offerRules";

const form = (overrides = {}) => ({ ...EMPTY_OFFER_FORM, title: "A treat", value: "15", ...overrides });

describe("validateOfferForm mirrors § Rules", () => {
  it("accepts a valid percentage and a valid flat offer", () => {
    expect(validateOfferForm(form())).toEqual({});
    expect(validateOfferForm(form({ type: "flat_amount", value: "50", maxDiscount: "50" }))).toEqual({});
  });

  it.each([
    ["51%", { value: "51" }, "value"],
    ["0%", { value: "0" }, "value"],
    ["₹501 flat", { type: "flat_amount", value: "501", maxDiscount: "500" }, "value"],
    ["₹0 flat", { type: "flat_amount", value: "0", maxDiscount: "50" }, "value"],
    ["a fractional value", { value: "10.5" }, "value"],
    ["cap ₹501", { maxDiscount: "501" }, "maxDiscount"],
    ["a missing cap", { maxDiscount: "" }, "maxDiscount"],
    ["a flat cap below the flat amount", { type: "flat_amount", value: "100", maxDiscount: "50" }, "maxDiscount"],
    ["a 41-character title", { title: "x".repeat(41) }, "title"],
    ["an empty (whitespace-only) title", { title: "   " }, "title"],
    ["a fractional minimum order", { minimumOrder: "99.5" }, "minimumOrder"],
    ["an expiry that isn't offered", { expiresInMinutes: 9 }, "expiresInMinutes"],
    ["21 dishes", { items: Array.from({ length: 21 }, (_, i) => `m${i}`) }, "items"],
  ])("blocks %s", (_name, overrides, field) => {
    const errors = validateOfferForm(form(overrides));
    expect(Object.keys(errors)).toContain(field);
  });

  it("a 40-character title is fine (counted after trimming)", () => {
    expect(validateOfferForm(form({ title: `  ${"x".repeat(40)}  ` }))).toEqual({});
  });
});

describe("offerBody", () => {
  it("builds exactly the fields the API accepts", () => {
    expect(offerBody(form({ minimumOrder: "200", items: ["m1"], expiresInMinutes: 60 }), "s1")).toEqual({
      sessionId: "s1",
      title: "A treat",
      type: "percentage",
      percentage: 15,
      maxDiscountAmount: 100,
      minimumOrderValue: 200,
      expiresInMinutes: 60,
      applicableItems: ["m1"],
    });
    expect(offerBody(form({ type: "flat_amount", value: "50", maxDiscount: "50" }), "s1", { preview: true })).toEqual({
      sessionId: "s1",
      title: "A treat",
      type: "flat_amount",
      flatAmount: 50,
      maxDiscountAmount: 50,
      expiresInMinutes: 30,
      preview: true,
    });
  });

  it("texts", () => {
    expect(offerValueText({ type: "percentage", percentage: 15, maxDiscountAmount: 100 })).toBe("15% off (up to ₹100)");
    expect(offerValueText({ type: "flat_amount", flatAmount: 50 })).toBe("₹50 off");
    expect(paiseText(64000)).toBe("₹640");
    expect(paiseText(9550)).toBe("₹95.50");
  });
});
