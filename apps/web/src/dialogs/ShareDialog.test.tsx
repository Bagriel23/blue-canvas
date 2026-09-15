import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ApiError } from "../api/client.js";
import { ShareDialog } from "./ShareDialog.js";

const request = vi.fn(
  async ({ method = "GET", path }: { method?: string; path: string }) => {
    if (method === "GET" && path.includes("/members")) {
      return {
        status: 200,
        csrfToken: null,
        data: {
          members: [
            {
              userId: "owner",
              displayName: "Owner",
              email: "owner@example.com",
              role: "owner",
              addedAt: "2026-08-24T12:00:00.000Z",
            },
          ],
        },
      };
    }
    if (method === "GET")
      return { status: 200, csrfToken: null, data: { tokens: [] } };
    if (method === "POST" && path.endsWith("/invitations")) {
      throw new ApiError(
        "email_exists",
        "Use member add for an existing user",
        409,
        "trace",
      );
    }
    if (method === "POST" && path.endsWith("/members")) {
      return {
        status: 201,
        csrfToken: null,
        data: {
          member: {
            userId: "designer",
            displayName: "Designer",
            email: "designer@example.com",
            role: "editor",
            addedAt: "2026-08-24T12:00:00.000Z",
          },
        },
      };
    }
    throw new Error(`Unexpected request ${method} ${path}`);
  },
);
const client = { request };

vi.mock("../state/session.js", () => ({
  useSession: () => ({ client }),
}));
vi.mock("../state/locale.js", () => ({
  useLocale: () => ({
    messages: {
      share: {
        heading: "Share project",
        members: "Members",
        tokens: "Tokens",
        close: "Close",
        inviteEmail: "Invite by email",
        inviteRole: "Role",
        invite: "Create invitation",
        invitationCreated: "Invitation link created",
        remove: "Remove",
      },
      common: { loading: "Loading…" },
    },
  }),
}));

describe("ShareDialog", () => {
  it("adds an existing user when invitation reports email_exists", async () => {
    render(<ShareDialog projectId="project-1" onClose={vi.fn()} />);
    const email = await screen.findByLabelText("Invite by email");
    fireEvent.change(email, { target: { value: "designer@example.com" } });
    fireEvent.submit(email.closest("form") as HTMLFormElement);
    await waitFor(() =>
      expect(request).toHaveBeenCalledWith(
        expect.objectContaining({
          method: "POST",
          path: "/api/v1/projects/project-1/members",
        }),
      ),
    );
  });
});
