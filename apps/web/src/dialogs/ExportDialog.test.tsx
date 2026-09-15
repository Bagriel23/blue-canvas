import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ExportDialog } from "./ExportDialog.js";

const request = vi.fn();
const client = { request };

vi.mock("../state/session.js", () => ({
  useSession: () => ({ client }),
}));
vi.mock("../state/locale.js", () => ({
  useLocale: () => ({
    messages: {
      exportDialog: {
        heading: "Export project",
        scopeProject: "Entire project",
        scopePage: "Current page",
        scopeSelection: "Current selection",
        targetStatic: "HTML / CSS / JavaScript",
        targetReact: "React (Vite)",
        targetPreact: "Preact (Vite)",
        targetDescription: "Choose a portable output format.",
        scopeLabel: "Scope",
        targetLabel: "Format",
        preview: "Export summary",
        fileCount: "{count} files",
        warnings: "{count} warnings",
        start: "Generate export",
        close: "Close",
        download: "Download ZIP",
        generating: "Generating export…",
        generated: "Export ready",
        generatedDescription: "Your files are ready to download.",
        noSelection: "Select a node before exporting it.",
      },
      common: { errorPrefix: "Error" },
    },
  }),
}));

describe("ExportDialog", () => {
  it("requests the selected target and scope, then exposes a ZIP download", async () => {
    request.mockResolvedValueOnce({
      status: 200,
      csrfToken: null,
      data: {
        archiveName: "project.zip",
        files: [{ path: "index.html", content: "<main />" }],
        diagnostics: [],
        manifest: { files: [{ path: "index.html", bytes: 8 }] },
      },
    });
    const createObjectURL = vi.fn(() => "blob:export");
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: createObjectURL,
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn(),
    });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);

    render(
      <ExportDialog
        projectId="project-1"
        currentPageId="page-1"
        currentSelection="node-1"
        onClose={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByLabelText("Scope"), {
      target: { value: "page" },
    });
    fireEvent.change(screen.getByLabelText("Format"), {
      target: { value: "react" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Generate export" }));

    await waitFor(() => expect(screen.getByText("Export ready")).toBeTruthy());
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "POST",
        path: "/api/v1/projects/project-1/exports",
        body: {
          target: "react",
          scope: { type: "page", pageId: "page-1" },
        },
      }),
    );
    expect(screen.getByText("1 files")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Download ZIP" }));
    await waitFor(() => expect(createObjectURL).toHaveBeenCalledOnce());
    expect(click).toHaveBeenCalledOnce();
    click.mockRestore();
  });

  it("surfaces API errors and disables selection export without a selection", async () => {
    request.mockRejectedValueOnce(new Error("Export service unavailable"));
    render(
      <ExportDialog
        projectId="project-1"
        currentPageId="page-1"
        currentSelection={null}
        onClose={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByLabelText("Scope"), {
      target: { value: "selection" },
    });
    expect(screen.getByRole("button", { name: "Generate export" })).toHaveProperty("disabled", true);
    fireEvent.change(screen.getByLabelText("Scope"), {
      target: { value: "project" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Generate export" }));
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(screen.getByRole("alert").textContent).toContain("Error");
  });
});
