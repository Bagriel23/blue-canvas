import { describe, expect, it, vi } from "vitest";

import {
  createHandlers,
  DelegatedIdentityMissing,
  UpstreamApiError,
  type ApiClient,
  type DelegatedIdentity,
} from "./handlers.js";

const identity: DelegatedIdentity = { bearerToken: "pat_test" };

function stubClient(): ApiClient & {
  calls: Parameters<ApiClient["request"]>[];
} {
  const calls: Parameters<ApiClient["request"]>[] = [];
  return {
    calls,
    request: vi.fn(async (method, path, request) => {
      calls.push([method, path, request]);
      return { status: 200, body: { method, path } };
    }),
  };
}

describe("MCP handlers", () => {
  it("reports capabilities and stable protocol version", () => {
    const handlers = createHandlers(stubClient());
    const initialize = handlers.initialize({});
    expect(initialize.protocolVersion).toBe("2025-06-18");
    expect(initialize.capabilities).toMatchObject({
      resources: { listChanged: false },
      tools: { listChanged: false },
    });
    expect(initialize.serverInfo.name).toBe("blue-canvas-mcp");
  });

  it("exposes the documented resources and tools", () => {
    const handlers = createHandlers(stubClient());
    const resources = handlers
      .listResources()
      .resources.map((entry) => entry.uri);
    expect(resources).toEqual([
      "blue-canvas://projects",
      "blue-canvas://kits",
      "blue-canvas://templates",
    ]);
    const tools = handlers.listTools().tools.map((entry) => entry.name);
    expect(tools).toEqual([
      "list_projects",
      "get_project",
      "create_project",
      "apply_commands",
    ]);
  });

  it("reads projects, kits, and templates through the upstream API with delegated identity", async () => {
    const client = stubClient();
    const handlers = createHandlers(client);
    await handlers.readResource(identity, "blue-canvas://projects");
    await handlers.readResource(identity, "blue-canvas://kits");
    await handlers.readResource(identity, "blue-canvas://templates");
    expect(client.calls.map((call) => call[1])).toEqual([
      "/api/v1/projects",
      "/api/v1/library/kits",
      "/api/v1/library/templates",
    ]);
    for (const call of client.calls) {
      expect(call[2].identity.bearerToken).toBe("pat_test");
    }
  });

  it("forwards idempotency key on command batches", async () => {
    const client = stubClient();
    const handlers = createHandlers(client);
    await handlers.callTool(identity, "apply_commands", {
      projectId: "aaaaaaaa-aaaa-7aaa-8aaa-aaaaaaaaaaaa",
      commands: [{ type: "noop" }],
      baseRevision: 3,
      idempotencyKey: "idem-12345678",
    });
    expect(client.calls[0]?.[1]).toBe(
      "/api/v1/projects/aaaaaaaa-aaaa-7aaa-8aaa-aaaaaaaaaaaa/commands",
    );
    expect(client.calls[0]?.[2].idempotencyKey).toBe("idem-12345678");
    expect(client.calls[0]?.[2].body).toMatchObject({
      commands: [{ type: "noop" }],
      baseRevision: 3,
      idempotencyKey: "idem-12345678",
    });
  });

  it("rejects tool calls without a delegated identity", async () => {
    const handlers = createHandlers(stubClient());
    await expect(
      handlers.callTool(
        null as unknown as DelegatedIdentity,
        "list_projects",
        {},
      ),
    ).rejects.toBeInstanceOf(DelegatedIdentityMissing);
  });

  it("propagates upstream failures as UpstreamApiError", async () => {
    const client: ApiClient = {
      request: async () => {
        throw new UpstreamApiError({
          code: "unauthorized",
          message: "PAT revoked",
          status: 401,
        });
      },
    };
    const handlers = createHandlers(client);
    await expect(
      handlers.callTool(identity, "list_projects", {}),
    ).rejects.toBeInstanceOf(UpstreamApiError);
  });
});
