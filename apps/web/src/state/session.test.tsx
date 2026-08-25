import { act, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ApiClient } from "../api/client.js";
import { SessionProvider, useSession } from "./session.js";

function jsonResponse(
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

function Consumer() {
  const { session, loading, error } = useSession();
  if (loading) return <div>loading</div>;
  if (error) return <div>error:{error}</div>;
  return <div>user:{session?.user.displayName ?? "anonymous"}</div>;
}

describe("SessionProvider", () => {
  it("bootstraps the current session and stores CSRF token", async () => {
    const session = {
      user: {
        id: "u1",
        email: "user@example.com",
        displayName: "Test User",
        locale: "en-US",
        role: "member",
        status: "active",
      },
      csrfToken: "csrf-1",
      bootstrapRequired: false,
    };
    const fetcher = vi.fn(async () => jsonResponse(200, session));
    const client = new ApiClient({ fetch: fetcher });
    render(
      <SessionProvider client={client}>
        <Consumer />
      </SessionProvider>,
    );
    await waitFor(() =>
      expect(screen.getByText("user:Test User")).toBeTruthy(),
    );
    expect(client.getCsrfToken()).toBe("csrf-1");
  });

  it("shows anonymous state on 401", async () => {
    const fetcher = vi.fn(async () =>
      jsonResponse(401, {
        error: { code: "unauthorized", message: "no", traceId: "t" },
      }),
    );
    const client = new ApiClient({ fetch: fetcher });
    render(
      <SessionProvider client={client}>
        <Consumer />
      </SessionProvider>,
    );
    await waitFor(() =>
      expect(screen.getByText("user:anonymous")).toBeTruthy(),
    );
  });

  it("signs the user in and rotates CSRF", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(401, {
          error: { code: "unauthorized", message: "no", traceId: "t" },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse(
          200,
          {
            user: {
              id: "u1",
              email: "user@example.com",
              displayName: "Signed User",
              locale: "en-US",
              role: "member",
              status: "active",
            },
            csrfToken: "csrf-2",
            bootstrapRequired: false,
          },
          { "x-blue-canvas-csrf": "csrf-2" },
        ),
      );
    const client = new ApiClient({ fetch: fetcher });
    const providerRef: { current: ReturnType<typeof useSession> | null } = {
      current: null,
    };
    function Capture() {
      providerRef.current = useSession();
      return null;
    }
    render(
      <SessionProvider client={client}>
        <Capture />
        <Consumer />
      </SessionProvider>,
    );
    await waitFor(() =>
      expect(screen.getByText("user:anonymous")).toBeTruthy(),
    );
    const captured = providerRef.current;
    if (!captured) throw new Error("session provider did not attach");
    await act(async () => {
      await captured.signIn("user@example.com", "very-long-password");
    });
    expect(screen.getByText("user:Signed User")).toBeTruthy();
    expect(client.getCsrfToken()).toBe("csrf-2");
  });
});
