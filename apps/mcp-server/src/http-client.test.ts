import { describe, expect, it, vi } from "vitest";

import { createApiClient } from "./http-client.js";
import { UpstreamApiError } from "./handlers.js";

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

describe("createApiClient", () => {
  it("forwards the delegated bearer token and idempotency key", async () => {
    const fetcher = vi.fn(async () => jsonResponse(200, { ok: true }));
    const client = createApiClient({
      baseUrl: "https://api.test",
      fetch: fetcher,
    });
    await client.request("POST", "/api/v1/projects/abc/commands", {
      identity: { bearerToken: "pat_test" },
      body: { commands: [] },
      idempotencyKey: "idem-1",
    });
    const call = fetcher.mock.calls[0];
    if (!call) throw new Error("fetch not called");
    const [url, init] = call;
    expect(url).toBe("https://api.test/api/v1/projects/abc/commands");
    const headers = init?.headers as Record<string, string>;
    expect(headers["authorization"]).toBe("Bearer pat_test");
    expect(headers["idempotency-key"]).toBe("idem-1");
    expect(headers["content-type"]).toBe("application/json");
  });

  it("translates upstream error envelopes", async () => {
    const fetcher = vi.fn(async () =>
      jsonResponse(403, {
        error: { code: "forbidden", message: "no perms", traceId: "t" },
      }),
    );
    const client = createApiClient({
      baseUrl: "https://api.test",
      fetch: fetcher,
    });
    await expect(
      client.request("GET", "/api/v1/projects", {
        identity: { bearerToken: "pat" },
      }),
    ).rejects.toMatchObject({
      name: "UpstreamApiError",
      failure: { code: "forbidden", status: 403 },
    });
  });

  it("wraps opaque errors with upstream_error", async () => {
    const fetcher = vi.fn(async () => new Response("boom", { status: 502 }));
    const client = createApiClient({
      baseUrl: "https://api.test",
      fetch: fetcher,
    });
    try {
      await client.request("GET", "/api/v1/projects", {
        identity: { bearerToken: "pat" },
      });
      throw new Error("expected UpstreamApiError");
    } catch (raw) {
      expect(raw).toBeInstanceOf(UpstreamApiError);
      expect((raw as UpstreamApiError).failure.status).toBe(502);
      expect((raw as UpstreamApiError).failure.code).toBe("upstream_error");
    }
  });
});
