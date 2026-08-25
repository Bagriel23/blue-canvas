import { describe, expect, it, vi } from "vitest";

import { BridgeSession, parseIncoming, serialize } from "./bridge.js";

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

describe("stdio bridge", () => {
  it("parses and serializes JSON-RPC envelopes with trailing newline", () => {
    const envelope = parseIncoming('{"jsonrpc":"2.0","id":1,"method":"ping"}');
    expect(envelope.method).toBe("ping");
    const line = serialize({ jsonrpc: "2.0", id: 1, result: {} });
    expect(line.endsWith("\n")).toBe(true);
  });

  it("rejects non-JSON-RPC input", () => {
    expect(() => parseIncoming('{"id":1}')).toThrow(/Not a JSON-RPC 2\.0/);
    expect(() => parseIncoming("")).toThrow(/Empty line/);
  });

  it("forwards messages with bearer auth and remembers the session id", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(
          200,
          { jsonrpc: "2.0", id: 1, result: {} },
          {
            "mcp-session-id": "session-123",
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(null, {
          status: 204,
          headers: { "mcp-session-id": "session-123" },
        }),
      );
    const session = new BridgeSession({
      mcpUrl: "https://mcp.test/mcp",
      bearerToken: "pat_test",
      fetch: fetcher as unknown as typeof globalThis.fetch,
    });
    const first = await session.forward({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
    });
    expect(first?.result).toEqual({});
    expect(session.getSessionId()).toBe("session-123");
    const firstCall = fetcher.mock.calls[0];
    if (!firstCall) throw new Error("fetch not called");
    const [, initOne] = firstCall;
    expect((initOne?.headers as Record<string, string>)["authorization"]).toBe(
      "Bearer pat_test",
    );
    const second = await session.forward({
      jsonrpc: "2.0",
      method: "notifications/initialized",
    });
    expect(second).toBeNull();
    const secondCall = fetcher.mock.calls[1];
    if (!secondCall) throw new Error("fetch not called twice");
    const [, initTwo] = secondCall;
    expect((initTwo?.headers as Record<string, string>)["mcp-session-id"]).toBe(
      "session-123",
    );
  });
});
