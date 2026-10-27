import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import ConfirmDialog from "./ConfirmDialog";

function setup(props = {}) {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  render(
    <ConfirmDialog
      open
      title="Delete 'Paneer Tikka'?"
      description="It can't be undone."
      confirmLabel="Delete"
      onConfirm={onConfirm}
      onCancel={onCancel}
      {...props}
    />,
  );
  return { onConfirm, onCancel, user: userEvent.setup() };
}

describe("ConfirmDialog", () => {
  it("renders nothing while closed", () => {
    render(<ConfirmDialog open={false} title="Hidden" onConfirm={() => {}} onCancel={() => {}} />);
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("renders an accessible alertdialog with focus on Cancel", () => {
    setup();
    const dialog = screen.getByRole("alertdialog", { name: "Delete 'Paneer Tikka'?" });
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(document.getElementById(dialog.getAttribute("aria-describedby")).textContent).toBe(
      "It can't be undone.",
    );
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Cancel" }));
  });

  it("calls onConfirm from the confirm button", async () => {
    const { onConfirm, onCancel, user } = setup();
    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("calls onCancel from Cancel, Escape and the backdrop", async () => {
    const { onConfirm, onCancel, user } = setup();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await user.keyboard("{Escape}");
    await user.click(screen.getByTestId("confirm-dialog-backdrop"));
    expect(onCancel).toHaveBeenCalledTimes(3);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("ignores clicks inside the dialog panel", async () => {
    const { onCancel, user } = setup();
    await user.click(screen.getByRole("alertdialog"));
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("stops Escape from reaching other window listeners", async () => {
    const outer = vi.fn();
    window.addEventListener("keydown", outer);
    const { user } = setup();
    await user.keyboard("{Escape}");
    window.removeEventListener("keydown", outer);
    expect(outer).not.toHaveBeenCalled();
  });

  it("locks every exit and both buttons while pending", async () => {
    const { onConfirm, onCancel, user } = setup({ pending: true, pendingLabel: "Deleting…" });
    const confirm = screen.getByRole("button", { name: "Deleting…" });
    const cancel = screen.getByRole("button", { name: "Cancel" });
    expect(confirm.disabled).toBe(true);
    expect(cancel.disabled).toBe(true);
    await user.click(confirm);
    await user.keyboard("{Escape}");
    await user.click(screen.getByTestId("confirm-dialog-backdrop"));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
  });
});
