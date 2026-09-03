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
    const fetcher = vi.fn(async () =>
      jsonResponse(200, {
        ...session,
        user: { ...session.user, isAdmin: false },
      }),
    );
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
    expect(fetcher.mock.calls[0]?.[0]).toBe("/api/v1/auth/me");
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
          { "x-csrf-token": "csrf-2" },
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
    expect(fetcher.mock.calls[1]?.[0]).toBe("/api/v1/auth/login");
  });

  it("uses the auth logout endpoint and sends the server CSRF header", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(200, {
          user: {
            id: "u1",
            email: "u@example.com",
            displayName: "User",
            locale: "en-US",
            status: "active",
            isAdmin: false,
          },
          csrfToken: "csrf-1",
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
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
      </SessionProvider>,
    );
    await waitFor(() => expect(providerRef.current?.session).not.toBeNull());
    await act(async () => {
      await providerRef.current?.signOut();
    });
    expect(fetcher.mock.calls[1]?.[0]).toBe("/api/v1/auth/logout");
    expect(
      (fetcher.mock.calls[1]?.[1]?.headers as Record<string, string>)[
        "x-csrf-token"
      ],
    ).toBe("csrf-1");
  });
});
