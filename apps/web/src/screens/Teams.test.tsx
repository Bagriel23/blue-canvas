import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Teams } from "./Teams.js";

const request = vi.fn(async ({ path }: { path: string }) => {
  if (path === "/api/v1/teams") {
    return {
      status: 200,
      csrfToken: null,
      data: {
        teams: [
          {
            id: "team-1",
            name: "Studio SEDA",
            role: "owner",
            createdAt: "2026-08-24T12:00:00.000Z",
            updatedAt: "2026-08-24T12:00:00.000Z",
          },
        ],
      },
    };
  }
  throw new Error(`Unexpected path ${path}`);
});

vi.mock("../state/session.js", () => ({
  useSession: () => ({ client: { request } }),
}));
vi.mock("../state/locale.js", () => ({
  useLocale: () => ({
    messages: {
      teams: {
        heading: "Teams",
        kicker: "Collaboration / 03",
        lede: "Bring people and projects together.",
        createHeading: "Create a team",
        createDescription: "A shared home for your studio.",
        name: "Team name",
        createButton: "Create team",
        empty: "No teams yet.",
        members: "members",
        open: "Manage team",
      },
      common: { loading: "Loading…" },
    },
  }),
}));

describe("Teams", () => {
  it("lists teams and exposes creation controls", async () => {
    render(<Teams />);
    expect(await screen.findByText("Studio SEDA")).toBeTruthy();
    expect(screen.getByLabelText("Team name")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Create team" })).toBeTruthy();
  });
});
