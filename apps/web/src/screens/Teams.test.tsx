import { fireEvent, render, screen } from "@testing-library/react";
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
            role: "member",
            createdAt: "2026-08-24T12:00:00.000Z",
            updatedAt: "2026-08-24T12:00:00.000Z",
          },
        ],
      },
    };
  }
  if (path === "/api/v1/teams/team-1") {
    return {
      status: 200,
      csrfToken: null,
      data: {
        members: [
          {
            userId: "member-1",
            id: "member-row",
            displayName: "Member",
            email: "member@example.com",
            role: "member",
            addedAt: "2026-08-24T12:00:00.000Z",
          },
        ],
      },
    };
  }
  throw new Error(`Unexpected path ${path}`);
});
const client = { request };

vi.mock("../state/session.js", () => ({
  useSession: () => ({ client }),
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
        collaborationStatus: "Shared workspace",
        inviteLabel: "Add teammate",
        addMember: "Add member",
        roleLabel: "role",
        roleOwner: "Owner",
        roleAdmin: "Admin",
        roleMember: "Member",
        remove: "Remove",
        emailPlaceholder: "designer@company.com",
      },
      common: { loading: "Loading…" },
      share: { close: "Close" },
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

  it("hides member controls when the viewer is only a team member", async () => {
    render(<Teams />);
    fireEvent.click(await screen.findByRole("button", { name: "Manage team" }));
    expect(await screen.findByText("Member")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Remove" })).toBeNull();
    expect(screen.queryByRole("combobox", { name: /Member role/ })).toBeNull();
  });
});
