import { randomUUID } from "node:crypto";

import cookie from "@fastify/cookie";
import multipart from "@fastify/multipart";
import {
  acceptInvitationRequestSchema,
  addProjectMemberRequestSchema,
  bootstrapAdminRequestSchema,
  createInvitationRequestSchema,
  createPersonalAccessTokenRequestSchema,
  createProjectRequestSchema,
  loginRequestSchema,
  inviteProjectMemberRequestSchema,
  updateProjectMemberRequestSchema,
  updateProjectRequestSchema,
  type PersonalAccessTokenScope,
} from "@blue-canvas/contracts";
import Fastify, {
  LogController,
  type FastifyInstance,
  type FastifyReply,
  type FastifyRequest,
} from "fastify";
import { ZodError, type ZodType } from "zod";

import {
  ApiError,
  ApplicationService,
  publicUser,
  type Principal,
} from "./core.js";
import type { RepositoryPort } from "./domain.js";
import type { PasswordHasher } from "./security.js";
import { MAX_ASSET_BYTES, type AssetStorage } from "./storage.js";

const SESSION_COOKIE = "blue_canvas_session";

export interface ServerDependencies {
  repository: RepositoryPort;
  passwordHasher: PasswordHasher;
  storage: AssetStorage;
  setupSecret: string;
  production: boolean;
  now?: () => Date;
}

function parse<T>(schema: ZodType<T>, value: unknown): T {
  return schema.parse(value);
}

function identifier(request: FastifyRequest, key: string): string {
  const value = (request.params as Record<string, unknown>)[key];
  if (typeof value !== "string" || !/^[a-zA-Z0-9-]{1,64}$/.test(value)) {
    throw new ApiError("invalid_parameter", `Invalid ${key}`, 400);
  }
  return value;
}

function bearerToken(request: FastifyRequest): string | undefined {
  const authorization = request.headers.authorization;
  if (!authorization) return undefined;
  const match = /^Bearer ([^\s]+)$/i.exec(authorization);
  if (!match?.[1]) {
    throw new ApiError(
      "invalid_authorization",
      "Invalid Authorization header",
      400,
    );
  }
  return match[1];
}

function setSessionCookie(
  reply: FastifyReply,
  token: string,
  expiresAt: Date,
  production: boolean,
): void {
  reply.setCookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "strict",
    path: "/",
    secure: production,
    expires: expiresAt,
  });
}

function tokenResponse(token: {
  id: string;
  name: string;
  scopes: string[];
  expiresAt: Date | null;
  revokedAt: Date | null;
  lastUsedAt: Date | null;
  createdAt: Date;
}) {
  return {
    id: token.id,
    name: token.name,
    scopes: token.scopes,
    expiresAt: token.expiresAt,
    revokedAt: token.revokedAt,
    lastUsedAt: token.lastUsedAt,
    createdAt: token.createdAt,
  };
}

function assetResponse(asset: {
  id: string;
  projectId: string;
  sha256: string;
  originalName: string;
  mediaType: string;
  size: number;
  createdAt: Date;
}) {
  return {
    id: asset.id,
    projectId: asset.projectId,
    sha256: asset.sha256,
    originalName: asset.originalName,
    mediaType: asset.mediaType,
    size: asset.size,
    createdAt: asset.createdAt,
  };
}

export function buildApp(dependencies: ServerDependencies): FastifyInstance {
  const app = Fastify({
    logger: {
      redact: [
        "req.headers.authorization",
        "req.headers.cookie",
        "req.body.password",
        "req.body.setupSecret",
        "req.body.token",
        "res.headers.set-cookie",
      ],
    },
    requestIdHeader: false,
    genReqId: (request) => {
      const supplied = request.headers["x-request-id"];
      return typeof supplied === "string" &&
        /^[a-zA-Z0-9._:-]{1,128}$/.test(supplied)
        ? supplied
        : randomUUID();
    },
    logController: new LogController({
      requestIdLogLabel: "traceId",
      disableRequestLogging: true,
    }),
  });
  const service = new ApplicationService({
    repository: dependencies.repository,
    passwordHasher: dependencies.passwordHasher,
    storage: dependencies.storage,
    setupSecret: dependencies.setupSecret,
    now: dependencies.now ?? (() => new Date()),
  });

  void app.register(cookie);
  void app.register(multipart, {
    limits: { files: 1, fileSize: MAX_ASSET_BYTES },
  });

  app.addHook("onRequest", async (request, reply) => {
    void reply.header("x-request-id", request.id);
  });

  app.setNotFoundHandler(async (request, reply) => {
    return reply.code(404).send({
      error: {
        code: "not_found",
        message: "Route not found",
        traceId: request.id,
      },
    });
  });

  app.setErrorHandler(async (error, request, reply) => {
    if (error instanceof ApiError) {
      const details =
        error.details === undefined ? {} : { details: error.details };
      return reply.code(error.statusCode).send({
        error: {
          code: error.code,
          message: error.message,
          ...details,
          traceId: request.id,
        },
      });
    }
    if (error instanceof ZodError) {
      return reply.code(400).send({
        error: {
          code: "validation_error",
          message: "Request validation failed",
          details: error.issues,
          traceId: request.id,
        },
      });
    }
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error.code === "FST_REQ_FILE_TOO_LARGE" ||
        error.code === "FST_FILES_LIMIT")
    ) {
      return reply.code(413).send({
        error: {
          code: "asset_too_large",
          message: "Asset exceeds the upload limit",
          traceId: request.id,
        },
      });
    }
    request.log.error({ err: error }, "request failed");
    return reply.code(500).send({
      error: {
        code: "internal_error",
        message: "Internal server error",
        traceId: request.id,
      },
    });
  });

  async function authenticate(
    request: FastifyRequest,
    options: { mutating?: boolean; scope?: PersonalAccessTokenScope } = {},
  ): Promise<Principal> {
    const input: Parameters<ApplicationService["authenticate"]>[0] = {
      mutating: options.mutating ?? false,
    };
    const sessionToken = request.cookies[SESSION_COOKIE];
    const bearer = bearerToken(request);
    const csrf = request.headers["x-csrf-token"];
    if (sessionToken !== undefined) input.sessionToken = sessionToken;
    if (bearer !== undefined) input.bearerToken = bearer;
    if (typeof csrf === "string") input.csrfToken = csrf;
    if (options.scope !== undefined) input.requiredScope = options.scope;
    return service.authenticate(input);
  }

  app.get("/api/v1/health", async () => ({ status: "ok" }));
  app.get("/api/v1/ready", async (_request, reply) => {
    let ready = false;
    try {
      ready = await service.ready();
    } catch {
      // Readiness deliberately hides adapter details.
    }
    if (!ready) {
      throw new ApiError("not_ready", "Service is not ready", 503);
    }
    return reply.send({ status: "ready" });
  });

  app.post("/api/v1/auth/bootstrap-admin", async (request, reply) => {
    const result = await service.bootstrapAdmin(
      parse(bootstrapAdminRequestSchema, request.body),
      request.id,
    );
    setSessionCookie(
      reply,
      result.sessionToken,
      result.expiresAt,
      dependencies.production,
    );
    return reply.code(201).send({
      user: result.user,
      csrfToken: result.csrfToken,
      expiresAt: result.expiresAt,
    });
  });

  app.post("/api/v1/auth/login", async (request, reply) => {
    const input = parse(loginRequestSchema, request.body);
    const result = await service.login(input.email, input.password, request.id);
    setSessionCookie(
      reply,
      result.sessionToken,
      result.expiresAt,
      dependencies.production,
    );
    return reply.send({
      user: result.user,
      csrfToken: result.csrfToken,
      expiresAt: result.expiresAt,
    });
  });

  app.post("/api/v1/auth/invitations/accept", async (request, reply) => {
    const result = await service.acceptInvitation(
      parse(acceptInvitationRequestSchema, request.body),
      request.id,
    );
    setSessionCookie(
      reply,
      result.sessionToken,
      result.expiresAt,
      dependencies.production,
    );
    return reply.code(201).send({
      user: result.user,
      csrfToken: result.csrfToken,
      expiresAt: result.expiresAt,
    });
  });

  app.get("/api/v1/auth/me", async (request) => {
    const principal = await authenticate(request);
    return { user: publicUser(principal.user) };
  });

  app.post("/api/v1/auth/logout", async (request, reply) => {
    const principal = await authenticate(request, { mutating: true });
    await service.logout(principal, request.id);
    reply.clearCookie(SESSION_COOKIE, { path: "/" });
    return reply.code(204).send();
  });

  app.post("/api/v1/invitations", async (request, reply) => {
    const principal = await authenticate(request, {
      mutating: true,
      scope: "admin",
    });
    const result = await service.createInvitation(
      principal,
      parse(createInvitationRequestSchema, request.body),
      request.id,
    );
    return reply.code(201).send({
      invitation: {
        id: result.invitationId,
        expiresAt: result.expiresAt,
      },
      token: result.token,
      manualLink: `/accept-invitation?token=${encodeURIComponent(result.token)}`,
    });
  });

  app.post("/api/v1/projects", async (request, reply) => {
    const principal = await authenticate(request, {
      mutating: true,
      scope: "projects:write",
    });
    const project = await service.createProject(
      principal,
      parse(createProjectRequestSchema, request.body),
      request.id,
    );
    return reply.code(201).send({ project });
  });

  app.get("/api/v1/projects", async (request) => {
    const principal = await authenticate(request, { scope: "projects:read" });
    return { projects: await service.listProjects(principal) };
  });

  app.get("/api/v1/projects/:projectId", async (request) => {
    const principal = await authenticate(request, { scope: "projects:read" });
    return {
      project: await service.getProject(
        principal,
        identifier(request, "projectId"),
      ),
    };
  });

  app.patch("/api/v1/projects/:projectId", async (request) => {
    const principal = await authenticate(request, {
      mutating: true,
      scope: "projects:write",
    });
    return {
      project: await service.updateProject(
        principal,
        identifier(request, "projectId"),
        parse(updateProjectRequestSchema, request.body),
        request.id,
      ),
    };
  });

  app.post("/api/v1/projects/:projectId/archive", async (request) => {
    const principal = await authenticate(request, {
      mutating: true,
      scope: "projects:write",
    });
    return {
      project: await service.updateProject(
        principal,
        identifier(request, "projectId"),
        { archived: true },
        request.id,
      ),
    };
  });

  app.post("/api/v1/projects/:projectId/members", async (request, reply) => {
    const principal = await authenticate(request, {
      mutating: true,
      scope: "projects:write",
    });
    const member = await service.addMember(
      principal,
      identifier(request, "projectId"),
      parse(addProjectMemberRequestSchema, request.body),
      request.id,
    );
    return reply.code(201).send({ member });
  });

  app.post(
    "/api/v1/projects/:projectId/invitations",
    async (request, reply) => {
      const principal = await authenticate(request, {
        mutating: true,
        scope: "projects:write",
      });
      const result = await service.inviteProjectMember(
        principal,
        identifier(request, "projectId"),
        parse(inviteProjectMemberRequestSchema, request.body),
        request.id,
      );
      return reply.code(201).send({
        invitation: { id: result.invitationId, expiresAt: result.expiresAt },
        token: result.token,
        manualLink: `/accept-invitation?token=${encodeURIComponent(result.token)}`,
      });
    },
  );

  app.patch("/api/v1/projects/:projectId/members/:userId", async (request) => {
    const principal = await authenticate(request, {
      mutating: true,
      scope: "projects:write",
    });
    return {
      member: await service.updateMember(
        principal,
        identifier(request, "projectId"),
        identifier(request, "userId"),
        parse(updateProjectMemberRequestSchema, request.body),
        request.id,
      ),
    };
  });

  app.delete(
    "/api/v1/projects/:projectId/members/:userId",
    async (request, reply) => {
      const principal = await authenticate(request, {
        mutating: true,
        scope: "projects:write",
      });
      await service.removeMember(
        principal,
        identifier(request, "projectId"),
        identifier(request, "userId"),
        request.id,
      );
      return reply.code(204).send();
    },
  );

  app.post("/api/v1/personal-access-tokens", async (request, reply) => {
    const principal = await authenticate(request, { mutating: true });
    const result = await service.createPersonalAccessToken(
      principal,
      parse(createPersonalAccessTokenRequestSchema, request.body),
      request.id,
    );
    return reply.code(201).send({
      personalAccessToken: tokenResponse(result.token),
      token: result.raw,
    });
  });

  app.get("/api/v1/personal-access-tokens", async (request) => {
    const principal = await authenticate(request);
    return {
      tokens: (await service.listPersonalAccessTokens(principal)).map(
        tokenResponse,
      ),
    };
  });

  app.delete(
    "/api/v1/personal-access-tokens/:tokenId",
    async (request, reply) => {
      const principal = await authenticate(request, { mutating: true });
      await service.revokePersonalAccessToken(
        principal,
        identifier(request, "tokenId"),
        request.id,
      );
      return reply.code(204).send();
    },
  );

  app.get("/api/v1/audit-events", async (request) => {
    const principal = await authenticate(request, { scope: "admin" });
    return { events: await service.listAuditEvents(principal) };
  });

  app.get("/api/v1/projects/:projectId/audit-events", async (request) => {
    const principal = await authenticate(request, { scope: "projects:read" });
    return {
      events: await service.listAuditEvents(
        principal,
        identifier(request, "projectId"),
      ),
    };
  });

  app.post("/api/v1/projects/:projectId/assets", async (request, reply) => {
    const principal = await authenticate(request, {
      mutating: true,
      scope: "assets:write",
    });
    const file = await request.file();
    if (!file)
      throw new ApiError("file_required", "Asset file is required", 400);
    const bytes = await file.toBuffer();
    const asset = await service.uploadAsset(
      principal,
      identifier(request, "projectId"),
      {
        bytes,
        originalName: file.filename,
        mediaType: file.mimetype,
      },
      request.id,
    );
    return reply.code(201).send({ asset: assetResponse(asset) });
  });

  return app;
}
