import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { mockMutation } from "@/test/mutation";

const m = vi.hoisted(() => ({}));

vi.mock("@/context/OwnerAuthContext", () => ({ useOwnerAuth: () => ({ restaurantId: "r1" }) }));
vi.mock("@/components/DashboardLayout", () => ({ default: ({ children }) => <div>{children}</div> }));
vi.mock("@/hooks/owner/useTables", () => ({
  useTables: () => ({
    data: [{ _id: "t1", identifier: "T4", capacity: 4, isActive: true, qrCode: { status: "active" } }],
    isLoading: false,
    isError: false,
  }),
  useCreateTable: () => m.create,
  useUpdateTable: () => m.update,
  useDeleteTable: () => m.remove,
  useGenerateQR: () => m.qr,
}));

import ManagerTables from "./ManagerTables";

beforeEach(() => {
  m.create = mockMutation();
  m.update = mockMutation();
  m.remove = mockMutation();
  m.qr = mockMutation();
});

describe("ManagerTables confirmations", () => {
  it("deletes a table only after confirming", async () => {
    const user = userEvent.setup();
    render(<ManagerTables />);

    await user.click(screen.getByRole("button", { name: "Delete table T4" }));
    expect(m.remove.mutateAsync).not.toHaveBeenCalled();
    screen.getByRole("alertdialog", { name: "Delete table T4?" });

    await user.click(screen.getByRole("button", { name: "Delete table" }));
    expect(m.remove.mutateAsync).toHaveBeenCalledWith("t1");
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("does not delete after Escape", async () => {
    const user = userEvent.setup();
    render(<ManagerTables />);

    await user.click(screen.getByRole("button", { name: "Delete table T4" }));
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(m.remove.mutateAsync).not.toHaveBeenCalled();
  });

  it("asks before switching a table off", async () => {
    const user = userEvent.setup();
    render(<ManagerTables />);

    await user.click(screen.getByRole("switch"));
    expect(m.update.mutateAsync).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Deactivate table" }));
    expect(m.update.mutateAsync).toHaveBeenCalledWith({ tableId: "t1", body: { isActive: false } });
  });

  it("keeps QR generation one tap", async () => {
    const user = userEvent.setup();
    render(<ManagerTables />);
    await user.click(screen.getByRole("button", { name: /QR/ }));
    expect(m.qr.mutateAsync).toHaveBeenCalledWith("t1");
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });
});
