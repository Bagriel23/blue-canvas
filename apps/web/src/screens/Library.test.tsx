import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Library } from "./Library.js";

const request = vi.fn(async ({ path }: { path: string }) => {
  if (path === "/api/v1/library/kits") return { data: { kits: [] } };
  if (path === "/api/v1/library/templates") return { data: { templates: [] } };
  if (path === "/api/v1/templates") {
    return {
      data: {
        templates: [
          {
            id: "template-1",
            ownerId: "user-1",
            sourceProjectId: "project-1",
            name: "SEDA launch",
            description: "A reusable launch canvas",
            createdAt: "2026-08-24T12:00:00.000Z",
            updatedAt: "2026-08-24T12:00:00.000Z",
          },
        ],
      },
    };
  }
  if (path === "/api/v1/templates/template-1/projects") {
    return { data: { project: { id: "project-copy" } } };
  }
  throw new Error(`Unexpected path ${path}`);
});

vi.mock("../state/session.js", () => ({
  useSession: () => ({ client: { request } }),
}));
vi.mock("../state/locale.js", () => ({
  useLocale: () => ({
    messages: {
      library: {
        heading: "Library",
        empty: "Nothing here",
        kits: "Kits",
        templates: "Templates",
        kicker: "Resources",
        lede: "Reusable blocks",
        myTemplates: "My templates",
        useTemplate: "Use template",
        projectName: "New project name",
        createProject: "Create project",
        cancel: "Cancel",
        templateUsed: "Project created",
      },
      common: { loading: "Loading…" },
    },
  }),
}));

describe("Library project templates", () => {
  it("lists personal templates and creates a project from one", async () => {
    const onOpen = vi.fn();
    render(<Library onOpen={onOpen} />);

    expect(await screen.findByText("SEDA launch")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Use template" }));
    fireEvent.change(screen.getByLabelText("New project name"), {
      target: { value: "SEDA copy" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create project" }));

    await waitFor(() => expect(onOpen).toHaveBeenCalledWith("project-copy"));
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "POST",
        path: "/api/v1/templates/template-1/projects",
        body: { name: "SEDA copy" },
      }),
    );
  });
});
