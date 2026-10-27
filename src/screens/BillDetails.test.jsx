import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

import { mockMutation } from "@/test/mutation";

const m = vi.hoisted(() => ({ toast: { success: () => {}, error: () => {} } }));

vi.mock("@/context/OwnerAuthContext", () => ({ useOwnerAuth: () => ({ restaurantId: "r1" }) }));
vi.mock("@/components/DashboardLayout", () => ({ default: ({ children }) => <div>{children}</div> }));
vi.mock("@/components/BillDocument", () => ({ default: () => null }));
vi.mock("@/components/Toaster", () => ({ useToast: () => m.toast }));
vi.mock("@/hooks/owner/useBills", () => {
  const bill = {
    _id: "b1",
    billNumber: "B-101",
    type: "dine_in",
    status: "open",
    tableNumber: "7",
    createdAt: "2026-10-27T10:00:00.000Z",
    charges: { grandTotal: 840 },
    payment: { isPaid: false },
  };
  const q = { data: bill, isLoading: false, isError: false };
  return {
    useBills: () => ({ data: [], isLoading: false, isError: false }),
    useBill: () => q,
    useBillForOrder: () => ({ data: undefined, isLoading: false, isError: false }),
    useMarkBillPaid: () => m.markPaid,
    useReleaseBillPayment: () => m.release,
  };
});

import BillDetails from "./BillDetails";

function renderBill() {
  return render(
    <MemoryRouter
      initialEntries={["/bill?billId=b1"]}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <BillDetails />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  m.markPaid = mockMutation();
  m.release = mockMutation();
});

describe("BillDetails mark paid", () => {
  it("marks the bill paid only after confirming", async () => {
    const user = userEvent.setup();
    renderBill();

    await user.click(screen.getByRole("button", { name: /^Mark .* as paid$/ }));
    expect(m.markPaid.mutateAsync).not.toHaveBeenCalled();
    screen.getByRole("alertdialog", { name: "Confirm payment received" });

    await user.click(screen.getByRole("button", { name: "Yes, payment received" }));
    expect(m.markPaid.mutateAsync).toHaveBeenCalledWith({ billId: "b1", method: "cash" });
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("does not mark paid after cancel", async () => {
    const user = userEvent.setup();
    renderBill();

    await user.click(screen.getByRole("button", { name: /^Mark .* as paid$/ }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(m.markPaid.mutateAsync).not.toHaveBeenCalled();
  });
});
