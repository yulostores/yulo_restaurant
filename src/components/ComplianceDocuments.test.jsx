import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { mockMutation } from "@/test/mutation";

const m = vi.hoisted(() => ({}));

vi.mock("@/components/DocumentViewer", () => ({
  default: () => null,
  documentFileName: (doc) => doc.fileName ?? "file.pdf",
}));
vi.mock("@/hooks/owner/useDocuments", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    useDocuments: () => ({
      data: [{ _id: "doc1", type: actual.DOCUMENT_TYPES[0].type, url: "https://x/y.pdf", status: "pending" }],
      isLoading: false,
      isError: false,
    }),
    useUploadDocument: () => m.upload,
    useDeleteDocument: () => m.remove,
  };
});

import ComplianceDocuments from "./ComplianceDocuments";

beforeEach(() => {
  m.upload = mockMutation();
  m.remove = mockMutation();
});

describe("ComplianceDocuments remove", () => {
  it("removes a document only after confirming", async () => {
    const user = userEvent.setup();
    render(<ComplianceDocuments restaurantId="r1" />);

    await user.click(screen.getByRole("button", { name: /Remove/ }));
    expect(m.remove.mutateAsync).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Remove document" }));
    expect(m.remove.mutateAsync).toHaveBeenCalledWith("doc1");
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("does not remove after clicking the backdrop", async () => {
    const user = userEvent.setup();
    render(<ComplianceDocuments restaurantId="r1" />);

    await user.click(screen.getByRole("button", { name: /Remove/ }));
    await user.click(screen.getByTestId("confirm-dialog-backdrop"));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(m.remove.mutateAsync).not.toHaveBeenCalled();
  });
});
