// Small rules behind fixes from the full owner-portal test: how a customer's own
// cancellation reads to the restaurant, the offers table's status label, and the store
// settings field rules for cuisine tags and dates (twins of the server's validateField).
import { describe, expect, it } from "vitest";

import { ownerCancellationReason } from "@/components/OrderDetailsDialog";
import { offerStatus } from "@/screens/Offers";
import { fieldError } from "@/lib/fieldRules";

describe("ownerCancellationReason", () => {
  it("drops the customer's own voice", () => {
    expect(ownerCancellationReason({ cancelledBy: "customer", cancellationReason: "Cancelled by you" })).toBeNull();
    expect(
      ownerCancellationReason({
        cancelledBy: "customer",
        cancellationReason: "Cancelled by you after preparation started — no refund",
      }),
    ).toBe("After preparation started — no refund to the customer");
  });

  it("keeps every other reason as written", () => {
    expect(ownerCancellationReason({ cancelledBy: "restaurant", cancellationReason: "Item out of stock" })).toBe("Item out of stock");
    expect(ownerCancellationReason({ cancelledBy: "customer", cancellationReason: "Changed my mind" })).toBe("Changed my mind");
    expect(ownerCancellationReason({ cancelledBy: "customer" })).toBeNull();
  });
});

describe("offerStatus", () => {
  const at = Date.parse("2026-11-03T08:00:00Z");
  it("says Scheduled before the start and Ended after the end", () => {
    expect(offerStatus({ status: "active", startDate: "2026-11-10T00:00:00Z", endDate: "2026-11-20T00:00:00Z" }, at).label).toBe("Scheduled");
    expect(offerStatus({ status: "active", startDate: "2026-10-01T00:00:00Z", endDate: "2026-10-20T00:00:00Z" }, at).label).toBe("Ended");
    expect(offerStatus({ status: "active", startDate: "2026-11-01T00:00:00Z", endDate: "2026-11-20T00:00:00Z" }, at).label).toBe("Active");
    expect(offerStatus({ status: "draft" }, at).label).toBe("Draft");
    expect(offerStatus({ status: "expired" }, at).label).toBe("Ended");
  });
});

describe("fieldError for tags and dates", () => {
  const tags = { label: "Cuisine Types", type: "tags", maxItems: 2, itemMaxLength: 5 };
  const date = { label: "FSSAI Expiry Date", type: "date" };
  it("limits the list and each entry", () => {
    expect(fieldError(tags, ["Thai"])).toBeNull();
    expect(fieldError(tags, ["a", "b", "c"])).toMatch(/at most 2/);
    expect(fieldError(tags, ["Mughlai"])).toMatch(/at most 5 characters/);
  });
  it("refuses a date that isn't one", () => {
    expect(fieldError(date, "2027-03-31")).toBeNull();
    expect(fieldError(date, "not-a-date")).toMatch(/valid date/);
  });
});
