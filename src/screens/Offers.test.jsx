import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { mockMutation } from "@/test/mutation";

const m = vi.hoisted(() => ({}));

vi.mock("@/context/OwnerAuthContext", () => ({ useOwnerAuth: () => ({ restaurantId: "r1" }) }));
vi.mock("@/components/DashboardLayout", () => ({ default: ({ children }) => <div>{children}</div> }));
vi.mock("@/hooks/owner/useMenuItems", () => ({
  useMenuItems: () => ({ data: [] }),
  useCategories: () => ({ data: [] }),
}));
vi.mock("@/hooks/owner/useDiscounts", () => ({
  useDiscounts: () => ({
    data: [
      { _id: "d1", offerName: "Happy Hour", type: "percentage", percentage: 20, status: "active" },
      { _id: "d2", offerName: "Weekend Treat", type: "percentage", percentage: 10, status: "draft" },
    ],
    isLoading: false,
  }),
  useCreateDiscount: () => m.create,
  useUpdateDiscount: () => m.update,
  useDeleteDiscount: () => m.remove,
  usePublishDiscount: () => m.publish,
}));

import Offers from "./Offers";

beforeEach(() => {
  m.create = mockMutation();
  m.update = mockMutation();
  m.remove = mockMutation();
  m.publish = mockMutation();
});

describe("Offers confirmations", () => {
  it("deletes a live offer only after confirming", async () => {
    const user = userEvent.setup();
    render(<Offers />);

    await user.click(screen.getByRole("button", { name: "Delete Happy Hour" }));
    expect(m.remove.mutateAsync).not.toHaveBeenCalled();
    const dialog = screen.getByRole("alertdialog", { name: 'Delete "Happy Hour"?' });

    await user.click(within(dialog).getByRole("button", { name: "Delete offer" }));
    expect(m.remove.mutateAsync).toHaveBeenCalledWith("d1");
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("does not delete a draft after cancel", async () => {
    const user = userEvent.setup();
    render(<Offers />);

    await user.click(screen.getByRole("button", { name: "Delete" }));
    const dialog = screen.getByRole("alertdialog", { name: 'Delete "Weekend Treat"?' });
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(m.remove.mutateAsync).not.toHaveBeenCalled();
  });

  it("publishes a draft only after confirming", async () => {
    const user = userEvent.setup();
    render(<Offers />);

    await user.click(screen.getByRole("button", { name: "Publish" }));
    expect(m.publish.mutateAsync).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Publish offer" }));
    expect(m.publish.mutateAsync).toHaveBeenCalledWith("d2");
  });

  it("shows the error and closes the dialog when delete fails", async () => {
    m.remove.mutateAsync.mockRejectedValueOnce(Object.assign(new Error("Server said no"), {}));
    const user = userEvent.setup();
    render(<Offers />);

    await user.click(screen.getByRole("button", { name: "Delete Happy Hour" }));
    await user.click(screen.getByRole("button", { name: "Delete offer" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(screen.getByText(/Server said no|went wrong|try again/i)).toBeTruthy();
  });
});
