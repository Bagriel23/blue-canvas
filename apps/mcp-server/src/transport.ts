import { z } from "zod";

import {
  DelegatedIdentityMissing,
  UpstreamApiError,
  type DelegatedIdentity,
  type Handlers,
} from "./handlers.js";

export const jsonRpcRequestSchema = z.strictObject({
  jsonrpc: z.literal("2.0"),
  id: z.union([z.string(), z.number()]).optional(),
  method: z.string().min(1),
  params: z.unknown().optional(),
});

export type JsonRpcRequest = z.infer<typeof jsonRpcRequestSchema>;

export interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

export const JSON_RPC_ERROR_CODES = {
  parseError: -32700,
  invalidRequest: -32600,
  methodNotFound: -32601,
  invalidParams: -32602,
  internalError: -32603,
  unauthorized: -32001,
  upstream: -32010,
} as const;

export function successResponse(
  id: string | number | null,
  result: unknown,
): JsonRpcResponse {
  return { jsonrpc: "2.0", id, result };
}

export function errorResponse(
  id: string | number | null,
  code: number,
  message: string,
  data?: unknown,
): JsonRpcResponse {
  const error: JsonRpcResponse["error"] = { code, message };
  if (data !== undefined) error.data = data;
  return { jsonrpc: "2.0", id, error };
}

export async function dispatch(
  handlers: Handlers,
  identity: DelegatedIdentity | null,
  request: JsonRpcRequest,
): Promise<JsonRpcResponse | null> {
  const id = request.id ?? null;
  try {
    switch (request.method) {
      case "initialize": {
        const params = (request.params as { clientInfo?: unknown }) ?? {};
        return successResponse(id, handlers.initialize(params));
      }
      case "notifications/initialized":
      case "notifications/cancelled":
      case "notifications/roots/list_changed":
        return null;
      case "ping":
        return successResponse(id, {});
      case "resources/list":
        return successResponse(id, handlers.listResources());
      case "resources/read": {
        const params = z
          .strictObject({ uri: z.string().min(1) })
          .parse(request.params);
        const result = await handlers.readResource(
          requireIdentity(identity),
          params.uri,
        );
        return successResponse(id, result);
      }
      case "tools/list":
        return successResponse(id, handlers.listTools());
      case "tools/call": {
        const params = z
          .strictObject({
            name: z.string().min(1),
            arguments: z.unknown().optional(),
          })
          .parse(request.params);
        const result = await handlers.callTool(
          requireIdentity(identity),
          params.name,
          params.arguments,
        );
        return successResponse(id, result);
      }
      default:
        return errorResponse(
          id,
          JSON_RPC_ERROR_CODES.methodNotFound,
          `Method not found: ${request.method}`,
        );
    }
  } catch (raw) {
    if (raw instanceof DelegatedIdentityMissing) {
      return errorResponse(id, JSON_RPC_ERROR_CODES.unauthorized, raw.message);
    }
    if (raw instanceof UpstreamApiError) {
      return errorResponse(
        id,
        JSON_RPC_ERROR_CODES.upstream,
        raw.failure.message,
        {
          code: raw.failure.code,
          status: raw.failure.status,
          details: raw.failure.details,
        },
      );
    }
    if (raw instanceof z.ZodError) {
      return errorResponse(
        id,
        JSON_RPC_ERROR_CODES.invalidParams,
        "Invalid parameters",
        raw.issues,
      );
    }
    if (raw instanceof Error) {
      return errorResponse(id, JSON_RPC_ERROR_CODES.internalError, raw.message);
    }
    return errorResponse(
      id,
      JSON_RPC_ERROR_CODES.internalError,
      "Internal MCP error",
    );
  }
}

function requireIdentity(
  identity: DelegatedIdentity | null,
): DelegatedIdentity {
  if (!identity) throw new DelegatedIdentityMissing();
  return identity;
}
