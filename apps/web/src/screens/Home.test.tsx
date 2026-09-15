import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Home } from "./Home.js";

const request = vi.fn(async () => ({
  data: {
    projects: [
      { id: "owner", name: "Editable", archived: false, role: "owner" },
      { id: "viewer", name: "Read only", archived: false, role: "viewer" },
      { id: "archived", name: "Archived", archived: true, role: "owner" },
    ],
  },
}));

vi.mock("../state/session.js", () => ({
  useSession: () => ({ client: { request } }),
}));
vi.mock("../state/locale.js", () => ({
  useLocale: () => ({
    messages: {
      home: {
        heading: "Projects",
        empty: "Empty",
        createButton: "New project",
        createHeading: "Create",
        projectName: "Project name",
        open: "Open",
        kicker: "Workspace",
        lede: "Build",
        studioStatus: "Local",
        createDescription: "Start",
        saveTemplate: "Save as template",
        templateSaved: "Saved",
      },
      common: { loading: "Loading…" },
    },
  }),
}));

describe("Home template action", () => {
  it("shows save template only for active owners and editors", async () => {
    render(<Home onOpen={vi.fn()} />);
    expect(await screen.findByText("Editable")).toBeTruthy();
    expect(
      screen.getAllByRole("button", { name: "Save as template" }),
    ).toHaveLength(1);
  });
});
