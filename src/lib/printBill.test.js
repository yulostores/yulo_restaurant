import { describe, expect, it } from "vitest";

import { buildBillPrintHtml } from "./printBill";

const bill = {
  billNumber: "INV-000001",
  type: "dine_in",
  tableNumber: "01",
  guestCount: 1,
  status: "paid",
  restaurant: {
    name: "Amir's Cafe",
    legalName: "Amir Suhail",
    phone: "7658548656",
    address: { street: "Baner", city: "Pune", state: "Maharashtra", pincode: "411069" },
  },
  items: [{ name: "Chai <hot>", quantity: 1, unitPrice: 1, lineTotal: 1 }],
  charges: { grandTotal: 13 },
  chargeBreakdown: {
    lines: [
      { key: "item_total", label: "Item total", amountPaise: 100 },
      { key: "service_charge", label: "Service charge", amountPaise: 10 },
      { key: "platform_fee", label: "Platform fee", sublabel: "incl. ₹1.83 GST", amountPaise: 1200 },
      { key: "round_off", label: "Round off", amountPaise: -10 },
      { key: "grand_total", label: "Total", amountPaise: 1300 },
    ],
  },
  payment: { isPaid: true, method: "cash", paidAt: "2026-10-31T18:10:00Z" },
};

describe("buildBillPrintHtml", () => {
  const html = buildBillPrintHtml(bill);

  it("is a complete, standalone document with the bill in it", () => {
    expect(html.startsWith("<!DOCTYPE html>")).toBe(true);
    expect(html).toContain("<title>Bill INV-000001</title>");
    expect(html).toContain("Amir's Cafe");
    expect(html).toContain("Baner, Pune, Maharashtra, 411069");
    expect(html).toContain("Ph 7658548656");
    expect(html).toContain("Table 01");
  });

  it("prints every item and charge line and the total, as the screen shows them", () => {
    for (const text of ["Item total", "Service charge", "Platform fee", "incl. ₹1.83 GST", "Round off", "Total payable"]) {
      expect(html).toContain(text);
    }
    expect(html).toContain("₹13.00");
    expect(html).toContain("Paid by cash");
  });

  it("escapes text from the bill so it can't inject markup", () => {
    expect(html).toContain("Chai &lt;hot&gt;");
    expect(html).not.toContain("<hot>");
  });

  it("says when a bill is still open", () => {
    const open = buildBillPrintHtml({ ...bill, status: "open", payment: { isPaid: false } });
    expect(open).toContain("Not settled yet");
  });
});
