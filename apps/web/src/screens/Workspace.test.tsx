import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ApiClient } from "../api/client.js";
import { loadDemoDocument } from "../fixtures/demo.js";
import { LocaleProvider } from "../state/locale.js";
import { SessionProvider } from "../state/session.js";
import { Workspace } from "./Workspace.js";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const session = {
  user: {
    id: "user-1",
    email: "user@example.com",
    displayName: "Test User",
    locale: "en-US" as const,
    status: "active" as const,
    isAdmin: false,
  },
  csrfToken: "csrf-1",
  bootstrapRequired: false,
};

function renderWorkspace(fetcher: typeof fetch) {
  return render(
    <SessionProvider
      client={new ApiClient({ fetch: fetcher })}
      initialSession={session}
    >
      <LocaleProvider initialLocale="en-US">
        <Workspace projectId="project-1" />
      </LocaleProvider>
    </SessionProvider>,
  );
}

describe("Workspace persistence", () => {
  it("loads the persisted project document instead of the demo fixture", async () => {
    const persisted = loadDemoDocument();
    persisted.name = "Persisted Marketing Site";
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      expect(String(input)).toBe("/api/v1/projects/project-1/document");
      return jsonResponse({
        project: { id: "project-1", name: persisted.name, archived: false },
        revision: 4,
        document: persisted,
      });
    });

    renderWorkspace(fetcher);

    expect(screen.getByText("Loading workspace…")).toBeTruthy();
    await waitFor(() =>
      expect(screen.getByText("Persisted Marketing Site")).toBeTruthy(),
    );
  });

  it("shows a retry action when loading the document fails", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse(
          { error: { code: "internal_error", message: "Unavailable" } },
          503,
        ),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          project: {
            id: "project-1",
            name: "Recovered project",
            archived: false,
          },
          revision: 0,
          document: loadDemoDocument(),
        }),
      );

    renderWorkspace(fetcher);

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() =>
      expect(screen.getByText("Recovered project")).toBeTruthy(),
    );
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("persists inspector edits as update-node commands", async () => {
    const persisted = loadDemoDocument();
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(
      jsonResponse({
        project: {
          id: "project-1",
          name: "Persisted project",
          archived: false,
        },
        revision: 2,
        document: persisted,
      }),
    );
    fetcher.mockResolvedValueOnce(
      jsonResponse({
        revision: 3,
        document: { ...persisted, name: "Persisted project" },
        idempotent: false,
      }),
    );

    renderWorkspace(fetcher);
    await waitFor(() =>
      expect(screen.getByText("Persisted project")).toBeTruthy(),
    );
    fireEvent.click(
      screen.getByText("Design internal tools together, offline."),
    );
    await waitFor(() => expect(screen.getByLabelText("Name")).toBeTruthy());
    const input = screen.getByLabelText("Name");
    fireEvent.change(input, { target: { value: "Hero heading" } });

    await waitFor(() =>
      expect(fetcher).toHaveBeenCalledWith(
        "/api/v1/projects/project-1/commands",
        expect.objectContaining({ method: "POST" }),
      ),
    );
    const body = JSON.parse(String(fetcher.mock.calls[1]?.[1]?.body));
    expect(body.baseRevision).toBe(2);
    expect(body.commands).toEqual([
      {
        type: "update-node",
        nodeId: expect.any(String),
        patch: { name: "Hero heading" },
      },
    ]);
  });
});
