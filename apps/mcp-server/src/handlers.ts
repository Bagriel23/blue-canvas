import { z } from "zod";
import {
  createCommentRequestSchema,
  createNamedVersionRequestSchema,
  exportRequestSchema,
  resolveCommentRequestSchema,
  restoreNamedVersionRequestSchema,
  updateCommentRequestSchema,
} from "@blue-canvas/contracts";

export const PROTOCOL_VERSION = "2025-06-18";
export const SERVER_NAME = "blue-canvas-mcp";
export const SERVER_VERSION = "0.1.0";

export interface DelegatedIdentity {
  bearerToken: string;
}

export type ApiJson = Record<string, unknown> | unknown[] | null;

export interface ApiClient {
  request(
    method: "GET" | "POST" | "PATCH" | "DELETE",
    path: string,
    input: {
      identity: DelegatedIdentity;
      body?: unknown;
      idempotencyKey?: string;
    },
  ): Promise<{ status: number; body: ApiJson }>;
}

export interface ApiFailure {
  code: string;
  message: string;
  status: number;
  details?: unknown;
}

export class DelegatedIdentityMissing extends Error {
  constructor() {
    super("Missing delegated identity for MCP request");
    this.name = "DelegatedIdentityMissing";
  }
}

export class UpstreamApiError extends Error {
  constructor(readonly failure: ApiFailure) {
    super(
      `Upstream API failed (${failure.status}) ${failure.code}: ${failure.message}`,
    );
    this.name = "UpstreamApiError";
  }
}

const createProjectSchema = z.strictObject({
  name: z.string().trim().min(1).max(120),
});

const applyCommandsSchema = z.strictObject({
  projectId: z.uuid(),
  commands: z.array(z.record(z.string(), z.unknown())).min(1).max(50),
  baseRevision: z.number().int().nonnegative(),
  idempotencyKey: z.string().min(8).max(128),
});

const listProjectsSchema = z.strictObject({}).optional();

const getProjectSchema = z.strictObject({
  projectId: z.uuid(),
});

const versionSchema = z.strictObject({
  projectId: z.uuid(),
  versionId: z.uuid(),
});
const createVersionSchema = z.strictObject({
  projectId: z.uuid(),
  name: createNamedVersionRequestSchema.shape.name,
});
const restoreVersionSchema = z.strictObject({
  projectId: z.uuid(),
  versionId: z.uuid(),
  name: restoreNamedVersionRequestSchema.shape.name,
  confirmed: z.literal(true),
});
const listCommentsSchema = z.strictObject({ projectId: z.uuid() });
const createCommentSchema = z
  .strictObject({ projectId: z.uuid() })
  .merge(createCommentRequestSchema);
const updateCommentSchema = z
  .strictObject({ projectId: z.uuid(), commentId: z.uuid() })
  .merge(updateCommentRequestSchema);
const resolveCommentSchema = z
  .strictObject({ projectId: z.uuid(), commentId: z.uuid() })
  .merge(resolveCommentRequestSchema);
const exportProjectSchema = z
  .strictObject({ projectId: z.uuid() })
  .merge(exportRequestSchema);

export const resourceDescriptors = [
  {
    uri: "blue-canvas://projects",
    name: "Projects",
    description: "Projects accessible to the delegated user.",
    mimeType: "application/json",
  },
  {
    uri: "blue-canvas://kits",
    name: "Kits",
    description: "Published kits available in the library.",
    mimeType: "application/json",
  },
  {
    uri: "blue-canvas://templates",
    name: "Templates",
    description:
      "Templates available in the library with compatibility diagnostics.",
    mimeType: "application/json",
  },
] as const;

export const toolDescriptors = [
  {
    name: "list_projects",
    description:
      "List projects the delegated user can access, including their role.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    scopes: ["projects:read"],
    resultKind: "json" as const,
  },
  {
    name: "get_project",
    description: "Retrieve a project by id.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string", format: "uuid" },
      },
      required: ["projectId"],
      additionalProperties: false,
    },
    scopes: ["projects:read"],
    resultKind: "json" as const,
  },
  {
    name: "create_project",
    description: "Create a new project. The delegated user becomes its owner.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", minLength: 1, maxLength: 120 },
      },
      required: ["name"],
      additionalProperties: false,
    },
    scopes: ["projects:write"],
    resultKind: "json" as const,
  },
  {
    name: "apply_commands",
    description:
      "Apply a validated command batch to the given project. Requires the caller's current base revision and an idempotency key.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string", format: "uuid" },
        baseRevision: { type: "integer", minimum: 0 },
        idempotencyKey: { type: "string", minLength: 8, maxLength: 128 },
        commands: {
          type: "array",
          minItems: 1,
          maxItems: 50,
          items: { type: "object" },
        },
      },
      required: ["projectId", "baseRevision", "idempotencyKey", "commands"],
      additionalProperties: false,
    },
    scopes: ["projects:write"],
    resultKind: "json" as const,
  },
  {
    name: "list_versions",
    description: "List named versions for a project.",
    inputSchema: {
      type: "object",
      properties: { projectId: { type: "string", format: "uuid" } },
      required: ["projectId"],
      additionalProperties: false,
    },
    scopes: ["projects:read"],
    resultKind: "json" as const,
  },
  {
    name: "get_version",
    description: "Retrieve one named version and its snapshot.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string", format: "uuid" },
        versionId: { type: "string", format: "uuid" },
      },
      required: ["projectId", "versionId"],
      additionalProperties: false,
    },
    scopes: ["projects:read"],
    resultKind: "json" as const,
  },
  {
    name: "create_version",
    description: "Create a named snapshot of the current project.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string", format: "uuid" },
        name: { type: "string", minLength: 1, maxLength: 120 },
      },
      required: ["projectId", "name"],
      additionalProperties: false,
    },
    scopes: ["projects:write"],
    resultKind: "json" as const,
  },
  {
    name: "restore_version",
    description: "Restore a named version and create a new snapshot.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string", format: "uuid" },
        versionId: { type: "string", format: "uuid" },
        name: { type: "string", minLength: 1, maxLength: 120 },
        confirmed: { type: "boolean", const: true },
      },
      required: ["projectId", "versionId", "name", "confirmed"],
      additionalProperties: false,
    },
    scopes: ["projects:write"],
    resultKind: "json" as const,
  },
  {
    name: "list_comments",
    description: "List comments for a project.",
    inputSchema: {
      type: "object",
      properties: { projectId: { type: "string", format: "uuid" } },
      required: ["projectId"],
      additionalProperties: false,
    },
    scopes: ["projects:read"],
    resultKind: "json" as const,
  },
  {
    name: "create_comment",
    description: "Create a comment, optionally anchored to a node.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string", format: "uuid" },
        body: { type: "string", minLength: 1, maxLength: 5000 },
        nodeId: { type: "string", format: "uuid" },
        position: { type: "object" },
        mentionUserIds: {
          type: "array",
          items: { type: "string", format: "uuid" },
        },
      },
      required: ["projectId", "body"],
      additionalProperties: false,
    },
    scopes: ["projects:write"],
    resultKind: "json" as const,
  },
  {
    name: "update_comment",
    description: "Update a comment body or mentions.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string", format: "uuid" },
        commentId: { type: "string", format: "uuid" },
        body: { type: "string", minLength: 1, maxLength: 5000 },
        mentionUserIds: {
          type: "array",
          items: { type: "string", format: "uuid" },
        },
      },
      required: ["projectId", "commentId"],
      additionalProperties: false,
    },
    scopes: ["projects:write"],
    resultKind: "json" as const,
  },
  {
    name: "resolve_comment",
    description: "Resolve or reopen a comment.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string", format: "uuid" },
        commentId: { type: "string", format: "uuid" },
        resolved: { type: "boolean" },
      },
      required: ["projectId", "commentId", "resolved"],
      additionalProperties: false,
    },
    scopes: ["projects:write"],
    resultKind: "json" as const,
  },
  {
    name: "export_project",
    description: "Generate a deterministic HTML, React, or Preact export.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string", format: "uuid" },
        target: { type: "string", enum: ["html", "react", "preact"] },
        scope: { type: "object" },
      },
      required: ["projectId", "target", "scope"],
      additionalProperties: false,
    },
    scopes: ["projects:read", "assets:read"],
    resultKind: "json" as const,
  },
] as const;

export type ToolName = (typeof toolDescriptors)[number]["name"];

export interface Handlers {
  initialize(input: { clientInfo?: unknown }): {
    protocolVersion: string;
    capabilities: Record<string, unknown>;
    serverInfo: { name: string; version: string };
  };
  listResources(): {
    resources: readonly (typeof resourceDescriptors)[number][];
  };
  readResource(
    identity: DelegatedIdentity,
    uri: string,
  ): Promise<{ contents: { uri: string; mimeType: string; text: string }[] }>;
  listTools(): { tools: readonly (typeof toolDescriptors)[number][] };
  callTool(
    identity: DelegatedIdentity,
    name: string,
    input: unknown,
  ): Promise<{ content: { type: "text"; text: string }[] }>;
}

export function createHandlers(client: ApiClient): Handlers {
  const requireIdentity = (
    identity: DelegatedIdentity | null,
  ): DelegatedIdentity => {
    if (!identity || !identity.bearerToken)
      throw new DelegatedIdentityMissing();
    return identity;
  };

  const asText = (payload: unknown): string => JSON.stringify(payload, null, 2);

  const asContent = (payload: unknown) => ({
    contents: [
      {
        uri: "",
        mimeType: "application/json",
        text: asText(payload),
      },
    ],
  });

  const readResource: Handlers["readResource"] = async (identity, uri) => {
    const bearer = requireIdentity(identity);
    switch (uri) {
      case "blue-canvas://projects": {
        const result = await client.request("GET", "/api/v1/projects", {
          identity: bearer,
        });
        return {
          contents: [
            { uri, mimeType: "application/json", text: asText(result.body) },
          ],
        };
      }
      case "blue-canvas://kits": {
        const result = await client.request("GET", "/api/v1/library/kits", {
          identity: bearer,
        });
        return {
          contents: [
            { uri, mimeType: "application/json", text: asText(result.body) },
          ],
        };
      }
      case "blue-canvas://templates": {
        const result = await client.request(
          "GET",
          "/api/v1/library/templates",
          {
            identity: bearer,
          },
        );
        return {
          contents: [
            { uri, mimeType: "application/json", text: asText(result.body) },
          ],
        };
      }
      default:
        throw new UpstreamApiError({
          code: "unknown_resource",
          message: `Unknown resource ${uri}`,
          status: 404,
        });
    }
  };

  const callTool: Handlers["callTool"] = async (identity, name, input) => {
    const bearer = requireIdentity(identity);
    switch (name) {
      case "list_projects": {
        listProjectsSchema.parse(input);
        const result = await client.request("GET", "/api/v1/projects", {
          identity: bearer,
        });
        return { content: [{ type: "text", text: asText(result.body) }] };
      }
      case "get_project": {
        const { projectId } = getProjectSchema.parse(input);
        const result = await client.request(
          "GET",
          `/api/v1/projects/${encodeURIComponent(projectId)}`,
          { identity: bearer },
        );
        return { content: [{ type: "text", text: asText(result.body) }] };
      }
      case "create_project": {
        const body = createProjectSchema.parse(input);
        const result = await client.request("POST", "/api/v1/projects", {
          identity: bearer,
          body,
        });
        return { content: [{ type: "text", text: asText(result.body) }] };
      }
      case "apply_commands": {
        const parsed = applyCommandsSchema.parse(input);
        const { projectId, ...rest } = parsed;
        const result = await client.request(
          "POST",
          `/api/v1/projects/${encodeURIComponent(projectId)}/commands`,
          {
            identity: bearer,
            body: rest,
            idempotencyKey: rest.idempotencyKey,
          },
        );
        return { content: [{ type: "text", text: asText(result.body) }] };
      }
      case "list_versions": {
        const { projectId } = getProjectSchema.parse(input);
        const result = await client.request(
          "GET",
          `/api/v1/projects/${encodeURIComponent(projectId)}/versions`,
          { identity: bearer },
        );
        return { content: [{ type: "text", text: asText(result.body) }] };
      }
      case "get_version": {
        const { projectId, versionId } = versionSchema.parse(input);
        const result = await client.request(
          "GET",
          `/api/v1/projects/${encodeURIComponent(projectId)}/versions/${encodeURIComponent(versionId)}`,
          { identity: bearer },
        );
        return { content: [{ type: "text", text: asText(result.body) }] };
      }
      case "create_version": {
        const { projectId, ...body } = createVersionSchema.parse(input);
        const result = await client.request(
          "POST",
          `/api/v1/projects/${encodeURIComponent(projectId)}/versions`,
          { identity: bearer, body },
        );
        return { content: [{ type: "text", text: asText(result.body) }] };
      }
      case "restore_version": {
        const {
          projectId,
          versionId,
          confirmed: _confirmed,
          ...body
        } = restoreVersionSchema.parse(input);
        const result = await client.request(
          "POST",
          `/api/v1/projects/${encodeURIComponent(projectId)}/versions/${encodeURIComponent(versionId)}/restore`,
          {
            identity: bearer,
            body,
            idempotencyKey: `mcp-restore-${projectId}-${versionId}-${body.name}`,
          },
        );
        return { content: [{ type: "text", text: asText(result.body) }] };
      }
      case "list_comments": {
        const { projectId } = listCommentsSchema.parse(input);
        const result = await client.request(
          "GET",
          `/api/v1/projects/${encodeURIComponent(projectId)}/comments`,
          { identity: bearer },
        );
        return { content: [{ type: "text", text: asText(result.body) }] };
      }
      case "create_comment": {
        const { projectId, ...body } = createCommentSchema.parse(input);
        const result = await client.request(
          "POST",
          `/api/v1/projects/${encodeURIComponent(projectId)}/comments`,
          { identity: bearer, body },
        );
        return { content: [{ type: "text", text: asText(result.body) }] };
      }
      case "update_comment": {
        const { projectId, commentId, ...body } =
          updateCommentSchema.parse(input);
        const result = await client.request(
          "PATCH",
          `/api/v1/projects/${encodeURIComponent(projectId)}/comments/${encodeURIComponent(commentId)}`,
          { identity: bearer, body },
        );
        return { content: [{ type: "text", text: asText(result.body) }] };
      }
      case "resolve_comment": {
        const { projectId, commentId, ...body } =
          resolveCommentSchema.parse(input);
        const result = await client.request(
          "POST",
          `/api/v1/projects/${encodeURIComponent(projectId)}/comments/${encodeURIComponent(commentId)}/resolve`,
          { identity: bearer, body },
        );
        return { content: [{ type: "text", text: asText(result.body) }] };
      }
      case "export_project": {
        const { projectId, ...body } = exportProjectSchema.parse(input);
        const result = await client.request(
          "POST",
          `/api/v1/projects/${encodeURIComponent(projectId)}/exports`,
          { identity: bearer, body },
        );
        return { content: [{ type: "text", text: asText(result.body) }] };
      }
      default:
        throw new UpstreamApiError({
          code: "unknown_tool",
          message: `Unknown tool ${name}`,
          status: 404,
        });
    }
  };

  void asContent;

  return {
    initialize(input) {
      void input;
      return {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: {
          resources: { listChanged: false },
          tools: { listChanged: false },
        },
        serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
      };
    },
    listResources() {
      return { resources: resourceDescriptors };
    },
    readResource,
    listTools() {
      return { tools: toolDescriptors };
    },
    callTool,
  };
}
