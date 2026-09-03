import { describe, expect, it, vi } from "vitest";

import { ApiClient, ApiError } from "./client.js";

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

function firstCall<T extends unknown[]>(fetcher: { mock: { calls: T[] } }): T {
  const [call] = fetcher.mock.calls;
  if (!call) throw new Error("fetcher was not called");
  return call;
}

describe("ApiClient", () => {
  it("sends CSRF header on mutating requests when a token is present", async () => {
    const fetcher = vi.fn(async () =>
      jsonResponse(200, { ok: true }, { "x-csrf-token": "rotated" }),
    );
    const client = new ApiClient({ fetch: fetcher, csrfToken: "initial" });
    const result = await client.request({
      method: "POST",
      path: "/api/v1/projects",
      body: { name: "Demo" },
    });
    expect(result.status).toBe(200);
    const [, init] = firstCall(fetcher);
    expect((init?.headers as Record<string, string>)["x-csrf-token"]).toBe(
      "initial",
    );
    expect(client.getCsrfToken()).toBe("rotated");
  });

  it("skips CSRF header when method is GET even with token", async () => {
    const fetcher = vi.fn(async () => jsonResponse(200, {}));
    const client = new ApiClient({ fetch: fetcher, csrfToken: "abc" });
    await client.request({ path: "/api/v1/projects" });
    const [, init] = firstCall(fetcher);
    expect(
      (init?.headers as Record<string, string>)["x-csrf-token"],
    ).toBeUndefined();
  });

  it("throws typed ApiError from a validated error envelope", async () => {
    const fetcher = vi.fn(async () =>
      jsonResponse(400, {
        error: {
          code: "invalid_request",
          message: "Bad",
          traceId: "trace-1",
        },
      }),
    );
    const client = new ApiClient({ fetch: fetcher });
    await expect(
      client.request({ method: "POST", path: "/api/v1/projects", body: {} }),
    ).rejects.toMatchObject({
      name: "ApiError",
      code: "invalid_request",
      status: 400,
      traceId: "trace-1",
    });
  });

  it("wraps non-envelope error bodies with http_error", async () => {
    const fetcher = vi.fn(
      async () =>
        new Response("boom", {
          status: 500,
          headers: { "x-trace-id": "trace-2" },
        }),
    );
    const client = new ApiClient({ fetch: fetcher });
    try {
      await client.request({ path: "/api/v1/projects" });
      throw new Error("expected error");
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).code).toBe("http_error");
      expect((error as ApiError).status).toBe(500);
      expect((error as ApiError).traceId).toBe("trace-2");
    }
  });

  it("prefixes the base URL when configured", async () => {
    const fetcher = vi.fn(async () => jsonResponse(200, {}));
    const client = new ApiClient({
      baseUrl: "https://api.test",
      fetch: fetcher,
    });
    await client.request({ path: "/api/v1/projects" });
    const [url] = firstCall(fetcher);
    expect(url).toBe("https://api.test/api/v1/projects");
  });
});
