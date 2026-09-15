import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ApiClient } from "../api/client.js";
import { loadDemoDocument } from "../fixtures/demo.js";
import { LocaleProvider, useLocale } from "../state/locale.js";
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

function renderWorkspace(
  fetcher: typeof fetch,
  projectId = "project-1",
  showLocaleSwitcher = false,
) {
  return render(
    <SessionProvider
      client={new ApiClient({ fetch: fetcher })}
      initialSession={session}
    >
      <LocaleProvider initialLocale="en-US">
        <Workspace projectId={projectId} />
        {showLocaleSwitcher ? <LocaleSwitcher /> : null}
      </LocaleProvider>
    </SessionProvider>,
  );
}

function LocaleSwitcher() {
  const { setLocale } = useLocale();
  return (
    <button type="button" onClick={() => setLocale("pt-BR")}>
      Switch locale
    </button>
  );
}

describe("Workspace persistence", () => {
  it("loads the persisted project document instead of the demo fixture", async () => {
    const persisted = loadDemoDocument();
    persisted.name = "Persisted Marketing Site";
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      expect(String(input)).toBe("/api/v1/projects/project-1/document");
      return jsonResponse({
        project: {
          id: "project-1",
          name: persisted.name,
          archived: false,
          role: "owner",
        },
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
            role: "owner",
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
          role: "owner",
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

  it("preserves the optimistic document for a stale idempotent receipt", async () => {
    const persisted = loadDemoDocument();
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({
          project: {
            id: "project-1",
            name: "Persisted project",
            archived: false,
            role: "owner",
          },
          revision: 2,
          document: persisted,
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          revision: 2,
          document: persisted,
          idempotent: true,
        }),
      );

    renderWorkspace(fetcher);
    await waitFor(() =>
      expect(screen.getByText("Persisted project")).toBeTruthy(),
    );
    fireEvent.click(
      screen.getByText("Design internal tools together, offline."),
    );
    fireEvent.change(await screen.findByLabelText("Name"), {
      target: { value: "Optimistic heading" },
    });

    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(screen.getByDisplayValue("Optimistic heading")).toBeTruthy(),
    );
  });

  it("keeps viewer projects read-only even when the workspace is editable", async () => {
    const persisted = loadDemoDocument();
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(
      jsonResponse({
        project: {
          id: "project-1",
          name: "Viewer project",
          archived: false,
          role: "viewer",
        },
        revision: 2,
        document: persisted,
      }),
    );

    renderWorkspace(fetcher);
    await waitFor(() =>
      expect(screen.getByText("Viewer project")).toBeTruthy(),
    );
    fireEvent.click(
      screen.getByText("Design internal tools together, offline."),
    );
    const input = await screen.findByLabelText("Name");
    expect(input.hasAttribute("readonly")).toBe(true);
    expect(screen.queryByRole("button", { name: "Share" })).toBeNull();
    fireEvent.change(input, { target: { value: "Must stay unchanged" } });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("keeps project sharing reserved for owners", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(
      jsonResponse({
        project: {
          id: "project-1",
          name: "Editor project",
          archived: false,
          role: "editor",
        },
        revision: 1,
        document: loadDemoDocument(),
      }),
    );
    renderWorkspace(fetcher);
    await waitFor(() =>
      expect(screen.getByText("Editor project")).toBeTruthy(),
    );
    expect(screen.queryByRole("button", { name: "Share" })).toBeNull();
  });

  it("keeps pending edits when the locale changes", async () => {
    const persisted = loadDemoDocument();
    const pendingCommand = deferred<Response>();
    let documentLoads = 0;
    const fetcher = vi.fn((input: RequestInfo | URL) => {
      if (String(input).endsWith("/document")) {
        documentLoads += 1;
        return Promise.resolve(
          jsonResponse({
            project: {
              id: "project-1",
              name: "Project",
              archived: false,
              role: "owner",
            },
            revision: 2,
            document: persisted,
          }),
        );
      }
      return pendingCommand.promise;
    });

    renderWorkspace(fetcher, "project-1", true);
    await waitFor(() => expect(screen.getByText("Project")).toBeTruthy());
    fireEvent.click(
      screen.getByText("Design internal tools together, offline."),
    );
    fireEvent.change(await screen.findByLabelText("Name"), {
      target: { value: "Pending locale edit" },
    });
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));

    fireEvent.click(screen.getByRole("button", { name: "Switch locale" }));
    expect(documentLoads).toBe(1);
    expect(screen.getByDisplayValue("Pending locale edit")).toBeTruthy();

    pendingCommand.resolve(
      jsonResponse({
        revision: 3,
        document: persisted,
        idempotent: false,
      }),
    );
    await waitFor(() => expect(screen.getByText("Salvo")).toBeTruthy());
  });

  it("reuses the queued idempotency key after a revision conflict", async () => {
    const persisted = loadDemoDocument();
    const conflict = jsonResponse(
      {
        error: {
          code: "revision_conflict",
          message: "Document revision changed",
          traceId: "trace-conflict",
        },
      },
      409,
    );
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({
          project: {
            id: "project-1",
            name: "Project",
            archived: false,
            role: "owner",
          },
          revision: 2,
          document: persisted,
        }),
      )
      .mockResolvedValueOnce(conflict)
      .mockResolvedValueOnce(
        jsonResponse({
          project: {
            id: "project-1",
            name: "Project",
            archived: false,
            role: "owner",
          },
          revision: 3,
          document: persisted,
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ revision: 4, document: persisted, idempotent: false }),
      );

    renderWorkspace(fetcher);
    await waitFor(() => expect(screen.getByText("Project")).toBeTruthy());
    fireEvent.click(
      screen.getByText("Design internal tools together, offline."),
    );
    fireEvent.change(await screen.findByLabelText("Name"), {
      target: { value: "Retried heading" },
    });

    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(4));
    const firstBody = JSON.parse(String(fetcher.mock.calls[1]?.[1]?.body));
    const retryBody = JSON.parse(String(fetcher.mock.calls[3]?.[1]?.body));
    expect(firstBody.idempotencyKey).toBe(retryBody.idempotencyKey);
    expect(retryBody.baseRevision).toBe(3);
  });

  it("shows a retry action when conflict recovery cannot load the latest document", async () => {
    const persisted = loadDemoDocument();
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({
          project: {
            id: "project-1",
            name: "Project",
            archived: false,
            role: "owner",
          },
          revision: 2,
          document: persisted,
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse(
          {
            error: {
              code: "revision_conflict",
              message: "Document revision changed",
              traceId: "trace-conflict",
            },
          },
          409,
        ),
      )
      .mockResolvedValueOnce(
        jsonResponse(
          {
            error: {
              code: "internal_error",
              message: "Unavailable",
              traceId: "trace-load",
            },
          },
          503,
        ),
      )
      .mockResolvedValueOnce(
        jsonResponse({ revision: 3, document: persisted, idempotent: false }),
      );

    renderWorkspace(fetcher);
    await waitFor(() => expect(screen.getByText("Project")).toBeTruthy());
    fireEvent.click(
      screen.getByText("Design internal tools together, offline."),
    );
    fireEvent.change(await screen.findByLabelText("Name"), {
      target: { value: "Kept locally" },
    });

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy(),
    );
    expect(screen.getByText("Kept locally")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(4));
  });

  it("ignores a stale response after switching project", async () => {
    const first = deferred<Response>();
    const second = deferred<Response>();
    const fetcher = vi.fn((input: RequestInfo | URL) => {
      return String(input).endsWith("project-a/document")
        ? first.promise
        : second.promise;
    });
    const view = renderWorkspace(fetcher, "project-a");
    view.rerender(
      <SessionProvider
        client={new ApiClient({ fetch: fetcher })}
        initialSession={session}
      >
        <LocaleProvider initialLocale="en-US">
          <Workspace projectId="project-b" />
        </LocaleProvider>
      </SessionProvider>,
    );
    second.resolve(
      jsonResponse({
        project: {
          id: "project-b",
          name: "Project B",
          archived: false,
          role: "owner",
        },
        revision: 1,
        document: { ...loadDemoDocument(), name: "Project B" },
      }),
    );
    await waitFor(() => expect(screen.getByText("Project B")).toBeTruthy());
    first.resolve(
      jsonResponse({
        project: {
          id: "project-a",
          name: "Project A",
          archived: false,
          role: "owner",
        },
        revision: 1,
        document: { ...loadDemoDocument(), name: "Project A" },
      }),
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.getByText("Project B")).toBeTruthy();
    expect(screen.queryByText("Project A")).toBeNull();
  });

  it("does not apply a stale recovery error after switching project", async () => {
    const recovery = deferred<Response>();
    let projectACalls = 0;
    const fetcher = vi.fn((input: RequestInfo | URL) => {
      const path = String(input);
      if (path.endsWith("project-a/document")) {
        projectACalls += 1;
        if (projectACalls === 1) {
          return Promise.resolve(
            jsonResponse({
              project: {
                id: "project-a",
                name: "Project A",
                archived: false,
                role: "owner",
              },
              revision: 1,
              document: loadDemoDocument(),
            }),
          );
        }
        return recovery.promise;
      }
      if (path.endsWith("project-a/commands")) {
        return Promise.resolve(
          jsonResponse(
            {
              error: {
                code: "revision_conflict",
                message: "Document revision changed",
                traceId: "trace-conflict",
              },
            },
            409,
          ),
        );
      }
      return Promise.resolve(
        jsonResponse({
          project: {
            id: "project-b",
            name: "Project B",
            archived: false,
            role: "owner",
          },
          revision: 2,
          document: { ...loadDemoDocument(), name: "Project B" },
        }),
      );
    });

    const view = renderWorkspace(fetcher, "project-a");
    await waitFor(() => expect(screen.getByText("Project A")).toBeTruthy());
    fireEvent.click(
      screen.getByText("Design internal tools together, offline."),
    );
    fireEvent.change(await screen.findByLabelText("Name"), {
      target: { value: "Pending A" },
    });
    await waitFor(() => expect(projectACalls).toBe(2));

    view.rerender(
      <SessionProvider
        client={new ApiClient({ fetch: fetcher })}
        initialSession={session}
      >
        <LocaleProvider initialLocale="en-US">
          <Workspace projectId="project-b" />
        </LocaleProvider>
      </SessionProvider>,
    );
    await waitFor(() => expect(screen.getByText("Project B")).toBeTruthy());
    recovery.resolve(
      jsonResponse(
        {
          error: {
            code: "internal_error",
            message: "Unavailable",
            traceId: "trace-load",
          },
        },
        503,
      ),
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.getByText("Project B")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
  });

  it("marks client errors as an irreconcilable conflict with retry and discard actions", async () => {
    const persisted = loadDemoDocument();
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({
          project: {
            id: "project-1",
            name: "Project",
            archived: false,
            role: "owner",
          },
          revision: 2,
          document: persisted,
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse(
          {
            error: {
              code: "invalid_command_batch",
              message: "Command rejected",
              traceId: "trace-command",
            },
          },
          400,
        ),
      )
      .mockResolvedValueOnce(
        jsonResponse(
          {
            error: {
              code: "invalid_command_batch",
              message: "Command rejected",
              traceId: "trace-command-retry",
            },
          },
          400,
        ),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          project: {
            id: "project-1",
            name: "Project",
            archived: false,
            role: "owner",
          },
          revision: 2,
          document: persisted,
        }),
      );

    renderWorkspace(fetcher);
    await waitFor(() => expect(screen.getByText("Project")).toBeTruthy());
    fireEvent.click(
      screen.getByText("Design internal tools together, offline."),
    );
    fireEvent.change(await screen.findByLabelText("Name"), {
      target: { value: "Rejected heading" },
    });

    await waitFor(() =>
      expect(screen.getByText("Command rejected")).toBeTruthy(),
    );
    expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Discard" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(3));
    expect(screen.getByText("Rejected heading")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Discard" }));
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(4));
  });
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}
