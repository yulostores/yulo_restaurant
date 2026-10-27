import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { mockMutation } from "@/test/mutation";

const m = vi.hoisted(() => ({}));

vi.mock("@/context/OwnerAuthContext", () => ({
  useOwnerAuth: () => ({ restaurantId: "r1", approvalStatus: "active", isApproved: true }),
}));
vi.mock("@/components/DashboardLayout", () => ({ default: ({ children }) => <div>{children}</div> }));
vi.mock("@/hooks/owner/useStaff", () => ({
  useStaff: () => ({
    data: [
      { _id: "s1", name: "Ravi", role: "waiter", phone: "9876543210", isActive: true },
      { _id: "s2", name: "Meena", role: "chef", phone: "9123456780", isActive: false },
    ],
    isLoading: false,
    isError: false,
  }),
  useCreateStaff: () => m.create,
  useRemoveStaff: () => m.remove,
  useUpdateStaff: () => m.update,
}));

import StaffManagement from "./StaffManagement";

beforeEach(() => {
  m.create = mockMutation();
  m.remove = mockMutation();
  m.update = mockMutation();
});

describe("StaffManagement confirmations", () => {
  it("removes a staff member only after confirming", async () => {
    const user = userEvent.setup();
    render(<StaffManagement />);

    await user.click(screen.getByRole("button", { name: "Remove Ravi" }));
    expect(m.remove.mutateAsync).not.toHaveBeenCalled();
    expect(screen.getByRole("alertdialog", { name: "Remove Ravi?" })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Remove" }));
    expect(m.remove.mutateAsync).toHaveBeenCalledTimes(1);
    expect(m.remove.mutateAsync).toHaveBeenCalledWith("s1");
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("does not remove after cancel", async () => {
    const user = userEvent.setup();
    render(<StaffManagement />);

    await user.click(screen.getByRole("button", { name: "Remove Ravi" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(m.remove.mutateAsync).not.toHaveBeenCalled();
  });

  it("closes the dialog and shows the error when removal fails", async () => {
    m.remove.mutateAsync.mockRejectedValueOnce(new Error("nope"));
    const user = userEvent.setup();
    render(<StaffManagement />);

    await user.click(screen.getByRole("button", { name: "Remove Ravi" }));
    await user.click(screen.getByRole("button", { name: "Remove" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(screen.getByText(/nope|Couldn't remove/)).toBeTruthy();
  });

  it("asks before deactivating, but activates in one tap", async () => {
    const user = userEvent.setup();
    render(<StaffManagement />);

    await user.click(screen.getByRole("button", { name: "Deactivate" }));
    expect(m.update.mutateAsync).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(m.update.mutateAsync).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Deactivate" }));
    const dialog = screen.getByRole("alertdialog", { name: "Deactivate Ravi?" });
    await user.click(dialog.querySelector("button:last-child"));
    expect(m.update.mutateAsync).toHaveBeenCalledWith({ staffId: "s1", isActive: false });

    await user.click(screen.getByRole("button", { name: "Activate" }));
    expect(m.update.mutateAsync).toHaveBeenLastCalledWith({ staffId: "s2", isActive: true });
    expect(m.update.mutateAsync).toHaveBeenCalledTimes(2);
  });

  it("asks before replacing a sign-in phone number", async () => {
    const user = userEvent.setup();
    render(<StaffManagement />);

    await user.click(screen.getByRole("button", { name: "Change Ravi's phone number" }));
    const input = screen.getByLabelText("Mobile number");
    await user.clear(input);
    await user.type(input, "9000000001");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(m.update.mutateAsync).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Change number" }));
    expect(m.update.mutateAsync).toHaveBeenCalledWith({ staffId: "s1", phone: "9000000001" });
  });
});
