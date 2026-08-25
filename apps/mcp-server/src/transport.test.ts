import { describe, expect, it } from "vitest";

import {
  createHandlers,
  UpstreamApiError,
  type ApiClient,
} from "./handlers.js";
import {
  dispatch,
  JSON_RPC_ERROR_CODES,
  type JsonRpcRequest,
} from "./transport.js";

const identity = { bearerToken: "pat_test" };

function stubClient(): ApiClient {
  return {
    request: async (method, path) => ({
      status: 200,
      body: { method, path },
    }),
  };
}

function fail(
  status: number,
  code = "unauthorized",
  message = "denied",
): ApiClient {
  return {
    request: async () => {
      throw new UpstreamApiError({ code, message, status });
    },
  };
}

const buildRequest = (
  method: string,
  params?: unknown,
  id = 1,
): JsonRpcRequest => {
  const request: JsonRpcRequest = { jsonrpc: "2.0", method, id };
  if (params !== undefined) request.params = params;
  return request;
};

describe("MCP JSON-RPC transport", () => {
  it("returns a valid initialize result", async () => {
    const handlers = createHandlers(stubClient());
    const response = await dispatch(
      handlers,
      identity,
      buildRequest("initialize"),
    );
    expect(response?.result).toMatchObject({ protocolVersion: "2025-06-18" });
  });

  it("returns null for notifications so the transport can 204", async () => {
    const handlers = createHandlers(stubClient());
    expect(
      await dispatch(handlers, identity, {
        jsonrpc: "2.0",
        method: "notifications/initialized",
      }),
    ).toBeNull();
  });

  it("rejects tool calls without identity as unauthorized", async () => {
    const handlers = createHandlers(stubClient());
    const response = await dispatch(
      handlers,
      null,
      buildRequest("tools/call", { name: "list_projects", arguments: {} }),
    );
    expect(response?.error?.code).toBe(JSON_RPC_ERROR_CODES.unauthorized);
  });

  it("wraps upstream failures in a data envelope", async () => {
    const handlers = createHandlers(fail(401, "unauthorized", "PAT revoked"));
    const response = await dispatch(
      handlers,
      identity,
      buildRequest("tools/call", { name: "list_projects", arguments: {} }),
    );
    expect(response?.error?.code).toBe(JSON_RPC_ERROR_CODES.upstream);
    expect(response?.error?.data).toMatchObject({
      code: "unauthorized",
      status: 401,
    });
  });

  it("reports invalid parameters", async () => {
    const handlers = createHandlers(stubClient());
    const response = await dispatch(
      handlers,
      identity,
      buildRequest("tools/call", { name: "apply_commands", arguments: {} }),
    );
    expect(response?.error?.code).toBe(JSON_RPC_ERROR_CODES.invalidParams);
  });

  it("returns methodNotFound for unknown methods", async () => {
    const handlers = createHandlers(stubClient());
    const response = await dispatch(
      handlers,
      identity,
      buildRequest("unknown"),
    );
    expect(response?.error?.code).toBe(JSON_RPC_ERROR_CODES.methodNotFound);
  });
});
