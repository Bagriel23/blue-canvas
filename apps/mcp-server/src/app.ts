import Fastify, {
  LogController,
  type FastifyInstance,
  type FastifyRequest,
} from "fastify";
import { randomUUID } from "node:crypto";

import { createHandlers, type ApiClient, type Handlers } from "./handlers.js";
import {
  dispatch,
  errorResponse,
  jsonRpcRequestSchema,
  JSON_RPC_ERROR_CODES,
  type JsonRpcResponse,
} from "./transport.js";

export interface McpServerDependencies {
  apiClient: ApiClient;
}

const SESSION_HEADER = "mcp-session-id";
const IDENTITY_HEADER_LIST = ["mcp-bearer-token", "authorization"] as const;

export function buildMcpServer(
  dependencies: McpServerDependencies,
): FastifyInstance {
  const handlers: Handlers = createHandlers(dependencies.apiClient);
  const server = Fastify({
    logger: {
      redact: ["req.headers.authorization", "req.headers.mcp-bearer-token"],
    },
    requestIdHeader: false,
    genReqId: (request) => {
      const supplied = request.headers["x-request-id"];
      return typeof supplied === "string" &&
        /^[a-zA-Z0-9._:-]{1,128}$/u.test(supplied)
        ? supplied
        : randomUUID();
    },
    logController: new LogController({
      requestIdLogLabel: "traceId",
      disableRequestLogging: true,
    }),
  });

  server.addHook("onRequest", async (request, reply) => {
    void reply.header("x-request-id", request.id);
  });

  server.get("/health", async () => ({ status: "ok" }));

  server.post("/mcp", async (request, reply) => {
    const body = request.body;
    const parsed = jsonRpcRequestSchema.safeParse(body);
    if (!parsed.success) {
      return reply
        .code(400)
        .send(
          errorResponse(
            null,
            JSON_RPC_ERROR_CODES.invalidRequest,
            "Invalid JSON-RPC request",
            parsed.error.issues,
          ),
        );
    }
    const identity = extractIdentity(request);
    const sessionId = ensureSession(request, reply);
    void sessionId;
    const response = await dispatch(handlers, identity, parsed.data);
    if (response === null) return reply.code(204).send();
    return reply.code(200).send(response satisfies JsonRpcResponse);
  });

  return server;
}

function ensureSession(
  request: FastifyRequest,
  reply: import("fastify").FastifyReply,
): string {
  const supplied = request.headers[SESSION_HEADER];
  if (
    typeof supplied === "string" &&
    /^[a-zA-Z0-9._:-]{1,128}$/u.test(supplied)
  ) {
    void reply.header(SESSION_HEADER, supplied);
    return supplied;
  }
  const next = randomUUID();
  void reply.header(SESSION_HEADER, next);
  return next;
}

function extractIdentity(
  request: FastifyRequest,
): { bearerToken: string } | null {
  for (const header of IDENTITY_HEADER_LIST) {
    const value = request.headers[header];
    if (typeof value !== "string") continue;
    const match = /^Bearer\s+([\w.-]+)$/i.exec(value);
    if (match?.[1]) return { bearerToken: match[1] };
    if (header === "mcp-bearer-token" && value.length > 0) {
      return { bearerToken: value };
    }
  }
  return null;
}
