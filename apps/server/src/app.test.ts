import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { InjectOptions } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildApp, type ServerDependencies } from "./app.js";
import type { AuditEvent, RepositoryPort, Session } from "./domain.js";
import { InMemoryRepository } from "./memory-repository.js";
import { ArgonPasswordHasher, type PasswordHasher } from "./security.js";
import {
  type AssetStorage,
  type AssetStorageInput,
  LocalAssetStorage,
} from "./storage.js";

const PASSWORD = "correct horse battery staple";

class AuditFailingRepository extends InMemoryRepository {
  failNextAudit = false;
  failNextAssetReady = false;
  failNextCommit = false;
  failNextSession = false;

  override async transaction<T>(
    operation: (repository: RepositoryPort) => Promise<T>,
  ): Promise<T> {
    return super.transaction(async (repository) => {
      const result = await operation(repository);
      if (this.failNextCommit) {
        this.failNextCommit = false;
        throw new Error("injected commit failure");
      }
      return result;
    });
  }

  override async createAuditEvent(
    input: Parameters<InMemoryRepository["createAuditEvent"]>[0],
  ): Promise<AuditEvent> {
    if (this.failNextAudit) {
      this.failNextAudit = false;
      throw new Error("injected audit failure");
    }
    return super.createAuditEvent(input);
  }

  override async markAssetReady(id: string) {
    if (this.failNextAssetReady) {
      this.failNextAssetReady = false;
      throw new Error("injected asset finalization failure");
    }
    return super.markAssetReady(id);
  }

  override async createSession(
    input: Parameters<InMemoryRepository["createSession"]>[0],
  ): Promise<Session> {
    if (this.failNextSession) {
      this.failNextSession = false;
      throw new Error("injected session failure");
    }
    return super.createSession(input);
  }
}

class RecordingPasswordHasher implements PasswordHasher {
  readonly verifiedHashes: string[] = [];
  private readonly delegate = new ArgonPasswordHasher();

  hash(password: string): Promise<string> {
    return this.delegate.hash(password);
  }

  async verify(passwordHash: string, password: string): Promise<boolean> {
    this.verifiedHashes.push(passwordHash);
    return this.delegate.verify(passwordHash, password);
  }
}

class PublishFailingStorage implements AssetStorage {
  constructor(private readonly delegate: AssetStorage) {}

  inspect(input: AssetStorageInput) {
    return this.delegate.inspect(input);
  }

  exists(storageKey: string) {
    return this.delegate.exists(storageKey);
  }

  async stage(input: AssetStorageInput) {
    const staged = await this.delegate.stage(input);
    return {
      ...staged,
      commit: async () => {
        throw new Error("injected publication failure");
      },
    };
  }

  put(input: AssetStorageInput) {
    return this.delegate.put(input);
  }

  read(storageKey: string) {
    return this.delegate.read(storageKey);
  }

  delete(storageKey: string) {
    return this.delegate.delete(storageKey);
  }
}

function cookieFrom(response: { headers: Record<string, unknown> }): string {
  const header = response.headers["set-cookie"];
  const cookie = Array.isArray(header) ? header[0] : header;
  if (typeof cookie !== "string") throw new Error("No session cookie returned");
  return cookie.split(";", 1)[0] ?? "";
}

function multipartPng(): { body: Buffer; contentType: string } {
  const boundary = "blue-canvas-test-boundary";
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64",
  );
  return {
    contentType: `multipart/form-data; boundary=${boundary}`,
    body: Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="pixel.png"\r\nContent-Type: image/png\r\n\r\n`,
      ),
      png,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]),
  };
}

describe("application server", () => {
  let directory: string;
  let repository: InMemoryRepository;
  let dependencies: ServerDependencies;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "blue-canvas-api-"));
    repository = new InMemoryRepository();
    dependencies = {
      repository,
      passwordHasher: new ArgonPasswordHasher(),
      storage: await LocalAssetStorage.create(directory),
      setupSecret: "development setup secret",
      production: false,
      now: () => new Date("2026-08-24T12:00:00.000Z"),
    };
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  async function bootstrap() {
    const app = buildApp(dependencies);
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/auth/bootstrap-admin",
      payload: {
        email: "ADMIN@example.com",
        displayName: "Admin",
        password: PASSWORD,
        setupSecret: "development setup secret",
      },
    });
    expect(response.statusCode).toBe(201);
    return {
      app,
      cookie: cookieFrom(response),
      csrf: response.json().csrfToken as string,
      user: response.json().user as { id: string },
    };
  }

  async function createInvitedUser(email: string) {
    const admin = await bootstrap();
    const invitation = await admin.app.inject({
      method: "POST",
      url: "/api/v1/invitations",
      headers: { cookie: admin.cookie, "x-csrf-token": admin.csrf },
      payload: { email },
    });
    expect(invitation.statusCode).toBe(201);
    const manualLink = new URL(
      invitation.json().manualLink as string,
      "https://blue-canvas.test",
    );
    expect(manualLink.search).toBe("");
    expect(new URLSearchParams(manualLink.hash.slice(1)).get("token")).toBe(
      invitation.json().token,
    );
    const accepted = await admin.app.inject({
      method: "POST",
      url: "/api/v1/auth/invitations/accept",
      payload: {
        token: invitation.json().token,
        displayName: "Invited User",
        password: PASSWORD,
      },
    });
    expect(accepted.statusCode).toBe(201);
    return {
      ...admin,
      invitedUser: accepted.json().user as { id: string },
      invitedCookie: cookieFrom(accepted),
      invitedCsrf: accepted.json().csrfToken as string,
    };
  }

  it("reports liveness, readiness, trace IDs, and error envelopes", async () => {
    const app = buildApp(dependencies);
    const health = await app.inject({ method: "GET", url: "/api/v1/health" });
    const ready = await app.inject({ method: "GET", url: "/api/v1/ready" });
    const missing = await app.inject({
      method: "GET",
      url: "/api/v1/not-found",
      headers: { "x-request-id": "test-trace-id" },
    });

    expect(health.json()).toEqual({ status: "ok" });
    expect(ready.json()).toEqual({ status: "ready" });
    expect(missing.statusCode).toBe(404);
    expect(missing.json()).toEqual({
      error: {
        code: "not_found",
        message: "Route not found",
        traceId: "test-trace-id",
      },
    });

    const invalidTrace = await app.inject({
      method: "GET",
      url: "/api/v1/not-found",
      headers: { "x-request-id": "x".repeat(200) },
    });
    expect(invalidTrace.json().error.traceId).toMatch(/^[a-f0-9-]{36}$/);
  });

  it("reports repository readiness failures as unavailable", async () => {
    const unavailableRepository = new InMemoryRepository();
    unavailableRepository.isReady = async () => {
      throw new Error("database unavailable");
    };
    const unavailable = buildApp({
      ...dependencies,
      repository: unavailableRepository,
    });
    const response = await unavailable.inject({
      method: "GET",
      url: "/api/v1/ready",
    });

    expect(response.statusCode).toBe(503);
    expect(response.json().error.code).toBe("not_ready");
  });

  it("allows bootstrap only once and only with the configured secret", async () => {
    const app = buildApp(dependencies);
    const denied = await app.inject({
      method: "POST",
      url: "/api/v1/auth/bootstrap-admin",
      payload: {
        email: "admin@example.com",
        displayName: "Admin",
        password: PASSWORD,
        setupSecret: "wrong secret",
      },
    });
    expect(denied.statusCode).toBe(403);

    const admin = await bootstrap();
    const second = await admin.app.inject({
      method: "POST",
      url: "/api/v1/auth/bootstrap-admin",
      payload: {
        email: "other@example.com",
        displayName: "Other",
        password: PASSWORD,
        setupSecret: "development setup secret",
      },
    });
    expect(second.statusCode).toBe(409);
  });

  it("creates only one administrator under concurrent bootstrap requests", async () => {
    const app = buildApp(dependencies);
    const payload = (email: string) => ({
      method: "POST" as const,
      url: "/api/v1/auth/bootstrap-admin",
      payload: {
        email,
        displayName: "Admin",
        password: PASSWORD,
        setupSecret: "development setup secret",
      },
    });

    const responses = await Promise.all([
      app.inject(payload("first@example.com")),
      app.inject(payload("second@example.com")),
    ]);

    expect(responses.map((response) => response.statusCode).sort()).toEqual([
      201, 409,
    ]);
    expect(await repository.countUsers()).toBe(1);
  });

  it("creates one-time invitations without persisting the raw token", async () => {
    const admin = await bootstrap();
    const invitation = await admin.app.inject({
      method: "POST",
      url: "/api/v1/invitations",
      headers: { cookie: admin.cookie, "x-csrf-token": admin.csrf },
      payload: { email: "new@example.com" },
    });
    const token = invitation.json().token as string;

    expect(invitation.statusCode).toBe(201);
    const manualLink = new URL(
      invitation.json().manualLink as string,
      "https://blue-canvas.test",
    );
    expect(manualLink.search).toBe("");
    expect(new URLSearchParams(manualLink.hash.slice(1)).get("token")).toBe(
      token,
    );
    expect(JSON.stringify(repository.snapshot())).not.toContain(token);

    const accepted = await admin.app.inject({
      method: "POST",
      url: "/api/v1/auth/invitations/accept",
      payload: {
        token,
        displayName: "New User",
        password: PASSWORD,
      },
    });
    expect(accepted.statusCode).toBe(201);

    const reused = await admin.app.inject({
      method: "POST",
      url: "/api/v1/auth/invitations/accept",
      payload: {
        token,
        displayName: "New User",
        password: PASSWORD,
      },
    });
    expect(reused.statusCode).toBe(410);
  });

  it("verifies Argon2 for absent and disabled users with identical failures", async () => {
    const passwordHasher = new RecordingPasswordHasher();
    const app = buildApp({ ...dependencies, passwordHasher });
    const bootstrap = await app.inject({
      method: "POST",
      url: "/api/v1/auth/bootstrap-admin",
      payload: {
        email: "disabled@example.com",
        displayName: "Disabled",
        password: PASSWORD,
        setupSecret: "development setup secret",
      },
    });
    expect(bootstrap.statusCode).toBe(201);
    const snapshot = repository.snapshot() as {
      users: { status: "active" | "disabled" }[];
    };
    const disabled = snapshot.users[0];
    if (!disabled) throw new Error("Bootstrap user missing");
    disabled.status = "disabled";

    const missing = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      headers: { "x-request-id": "login-enumeration" },
      payload: { email: "missing@example.com", password: PASSWORD },
    });
    const disabledResponse = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      headers: { "x-request-id": "login-enumeration" },
      payload: { email: "disabled@example.com", password: PASSWORD },
    });

    expect(passwordHasher.verifiedHashes).toHaveLength(2);
    expect(passwordHasher.verifiedHashes[0]).toMatch(/^\$argon2id\$/u);
    expect(disabledResponse.statusCode).toBe(401);
    expect(missing.body).toBe(disabledResponse.body);
  });

  it("rolls back bootstrap when its audit event fails", async () => {
    const failingRepository = new AuditFailingRepository();
    failingRepository.failNextAudit = true;
    const app = buildApp({ ...dependencies, repository: failingRepository });

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/auth/bootstrap-admin",
      payload: {
        email: "rollback@example.com",
        displayName: "Rollback",
        password: PASSWORD,
        setupSecret: "development setup secret",
      },
    });

    expect(response.statusCode).toBe(500);
    expect(await failingRepository.countUsers()).toBe(0);
    expect(failingRepository.snapshot()).toMatchObject({
      sessions: [],
      auditEvents: [],
    });
  });

  it("rolls back every audited mutation when audit insertion fails", async () => {
    const failingRepository = new AuditFailingRepository();
    repository = failingRepository;
    dependencies = { ...dependencies, repository: failingRepository };
    const admin = await bootstrap();
    const assertAuditRollback = async (request: InjectOptions) => {
      const before = JSON.stringify(failingRepository.snapshot());
      failingRepository.failNextAudit = true;
      const response = await admin.app.inject(request);
      expect(response.statusCode).toBe(500);
      expect(JSON.stringify(failingRepository.snapshot())).toBe(before);
    };
    const authHeaders = {
      cookie: admin.cookie,
      "x-csrf-token": admin.csrf,
    };

    await assertAuditRollback({
      method: "POST",
      url: "/api/v1/invitations",
      headers: authHeaders,
      payload: { email: "rolled-back-invite@example.com" },
    });
    await assertAuditRollback({
      method: "POST",
      url: "/api/v1/projects",
      headers: authHeaders,
      payload: { name: "Rolled back project" },
    });

    const projectResponse = await admin.app.inject({
      method: "POST",
      url: "/api/v1/projects",
      headers: authHeaders,
      payload: { name: "Atomic project" },
    });
    const projectId = projectResponse.json().project.id as string;
    await assertAuditRollback({
      method: "PATCH",
      url: `/api/v1/projects/${projectId}`,
      headers: authHeaders,
      payload: { name: "Rolled back name" },
    });
    await assertAuditRollback({
      method: "POST",
      url: `/api/v1/projects/${projectId}/archive`,
      headers: authHeaders,
    });
    await assertAuditRollback({
      method: "POST",
      url: `/api/v1/projects/${projectId}/invitations`,
      headers: authHeaders,
      payload: {
        email: "rolled-back-project-invite@example.com",
        role: "editor",
      },
    });

    const memberUser = await failingRepository.createUser({
      email: "atomic-member@example.com",
      displayName: "Atomic Member",
      passwordHash: await dependencies.passwordHasher.hash(PASSWORD),
      locale: "en-US",
      isAdmin: false,
      now: dependencies.now?.() ?? new Date(),
    });
    await assertAuditRollback({
      method: "POST",
      url: `/api/v1/projects/${projectId}/members`,
      headers: authHeaders,
      payload: { email: memberUser.email, role: "editor" },
    });
    await admin.app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/members`,
      headers: authHeaders,
      payload: { email: memberUser.email, role: "editor" },
    });
    await assertAuditRollback({
      method: "PATCH",
      url: `/api/v1/projects/${projectId}/members/${memberUser.id}`,
      headers: authHeaders,
      payload: { role: "viewer" },
    });
    await assertAuditRollback({
      method: "DELETE",
      url: `/api/v1/projects/${projectId}/members/${memberUser.id}`,
      headers: authHeaders,
    });

    await assertAuditRollback({
      method: "POST",
      url: "/api/v1/personal-access-tokens",
      headers: authHeaders,
      payload: { name: "rolled back PAT", scopes: ["projects:read"] },
    });
    const patResponse = await admin.app.inject({
      method: "POST",
      url: "/api/v1/personal-access-tokens",
      headers: authHeaders,
      payload: { name: "atomic PAT", scopes: ["projects:read"] },
    });
    await assertAuditRollback({
      method: "DELETE",
      url: `/api/v1/personal-access-tokens/${patResponse.json().personalAccessToken.id as string}`,
      headers: authHeaders,
    });

    const upload = multipartPng();
    const filesBefore = await readdir(directory, { recursive: true });
    await assertAuditRollback({
      method: "POST",
      url: `/api/v1/projects/${projectId}/assets`,
      headers: { ...authHeaders, "content-type": upload.contentType },
      payload: upload.body,
    });
    expect(await readdir(directory, { recursive: true })).toEqual(filesBefore);

    const invitation = await admin.app.inject({
      method: "POST",
      url: "/api/v1/invitations",
      headers: authHeaders,
      payload: { email: "rolled-back-acceptance@example.com" },
    });
    await assertAuditRollback({
      method: "POST",
      url: "/api/v1/auth/invitations/accept",
      payload: {
        token: invitation.json().token,
        displayName: "Rolled Back Acceptance",
        password: PASSWORD,
      },
    });
    await assertAuditRollback({
      method: "POST",
      url: "/api/v1/auth/logout",
      headers: authHeaders,
    });
  });

  it("rolls back a login audit when session creation fails", async () => {
    const failingRepository = new AuditFailingRepository();
    repository = failingRepository;
    dependencies = { ...dependencies, repository: failingRepository };
    const admin = await bootstrap();
    const before = JSON.stringify(failingRepository.snapshot());
    failingRepository.failNextSession = true;

    const response = await admin.app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email: "admin@example.com", password: PASSWORD },
    });

    expect(response.statusCode).toBe(500);
    expect(JSON.stringify(failingRepository.snapshot())).toBe(before);
  });

  it("does not publish an asset when its database transaction fails to commit", async () => {
    const failingRepository = new AuditFailingRepository();
    repository = failingRepository;
    dependencies = { ...dependencies, repository: failingRepository };
    const admin = await bootstrap();
    const project = await admin.app.inject({
      method: "POST",
      url: "/api/v1/projects",
      headers: { cookie: admin.cookie, "x-csrf-token": admin.csrf },
      payload: { name: "Commit failure" },
    });
    const beforeRepository = JSON.stringify(failingRepository.snapshot());
    const beforeFiles = await readdir(directory, { recursive: true });
    const upload = multipartPng();
    failingRepository.failNextCommit = true;

    const response = await admin.app.inject({
      method: "POST",
      url: `/api/v1/projects/${project.json().project.id as string}/assets`,
      headers: {
        cookie: admin.cookie,
        "x-csrf-token": admin.csrf,
        "content-type": upload.contentType,
      },
      payload: upload.body,
    });

    expect(response.statusCode).toBe(500);
    expect(JSON.stringify(failingRepository.snapshot())).toBe(beforeRepository);
    expect(await readdir(directory, { recursive: true })).toEqual(beforeFiles);
  });

  it("does not retain an asset row when staged publication fails", async () => {
    const realStorage = await LocalAssetStorage.create(directory);
    dependencies = {
      ...dependencies,
      storage: new PublishFailingStorage(realStorage),
    };
    const admin = await bootstrap();
    const project = await admin.app.inject({
      method: "POST",
      url: "/api/v1/projects",
      headers: { cookie: admin.cookie, "x-csrf-token": admin.csrf },
      payload: { name: "Publication failure" },
    });
    const upload = multipartPng();

    const response = await admin.app.inject({
      method: "POST",
      url: `/api/v1/projects/${project.json().project.id as string}/assets`,
      headers: {
        cookie: admin.cookie,
        "x-csrf-token": admin.csrf,
        "content-type": upload.contentType,
      },
      payload: upload.body,
    });

    expect(response.statusCode).toBe(500);
    expect(repository.snapshot()).toMatchObject({ assets: [] });
    expect(await readdir(directory, { recursive: true })).toEqual([]);
  });

  it("reconciles a stale pending asset after database finalization fails", async () => {
    const failingRepository = new AuditFailingRepository();
    let currentTime = new Date("2026-08-24T12:00:00.000Z");
    repository = failingRepository;
    dependencies = {
      ...dependencies,
      repository: failingRepository,
      now: () => currentTime,
    };
    const admin = await bootstrap();
    const project = await admin.app.inject({
      method: "POST",
      url: "/api/v1/projects",
      headers: { cookie: admin.cookie, "x-csrf-token": admin.csrf },
      payload: { name: "Reconciled publication" },
    });
    const upload = multipartPng();
    failingRepository.failNextAssetReady = true;

    const response = await admin.app.inject({
      method: "POST",
      url: `/api/v1/projects/${project.json().project.id as string}/assets`,
      headers: {
        cookie: admin.cookie,
        "x-csrf-token": admin.csrf,
        "content-type": upload.contentType,
      },
      payload: upload.body,
    });
    expect(response.statusCode).toBe(500);
    expect(failingRepository.snapshot()).toMatchObject({
      assets: [{ status: "pending" }],
    });

    currentTime = new Date("2026-08-24T12:11:00.000Z");
    const readiness = await admin.app.inject({ url: "/api/v1/ready" });

    expect(readiness.statusCode).toBe(200);
    expect(failingRepository.snapshot()).toMatchObject({
      assets: [{ status: "ready" }],
    });
  });

  it("consumes an invitation once under concurrent acceptance", async () => {
    const admin = await bootstrap();
    const invitation = await admin.app.inject({
      method: "POST",
      url: "/api/v1/invitations",
      headers: { cookie: admin.cookie, "x-csrf-token": admin.csrf },
      payload: { email: "race@example.com" },
    });
    const payload = {
      token: invitation.json().token,
      displayName: "Race User",
      password: PASSWORD,
    };
    const responses = await Promise.all([
      admin.app.inject({
        method: "POST",
        url: "/api/v1/auth/invitations/accept",
        payload,
      }),
      admin.app.inject({
        method: "POST",
        url: "/api/v1/auth/invitations/accept",
        payload,
      }),
    ]);

    expect(responses.map((response) => response.statusCode).sort()).toEqual([
      201, 410,
    ]);
  });

  it("uses HttpOnly strict cookies and requires CSRF for cookie mutations", async () => {
    const admin = await bootstrap();
    const setCookie = (
      await admin.app.inject({
        method: "POST",
        url: "/api/v1/auth/login",
        payload: { email: "admin@example.com", password: PASSWORD },
      })
    ).headers["set-cookie"];
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("SameSite=Strict");
    expect(setCookie).toContain("Path=/");

    const me = await admin.app.inject({
      method: "GET",
      url: "/api/v1/auth/me",
      headers: { cookie: admin.cookie },
    });
    expect(me.json().user.email).toBe("admin@example.com");

    const withoutCsrf = await admin.app.inject({
      method: "POST",
      url: "/api/v1/projects",
      headers: { cookie: admin.cookie },
      payload: { name: "Denied" },
    });
    expect(withoutCsrf.statusCode).toBe(403);
    expect(withoutCsrf.json().error.code).toBe("csrf_mismatch");

    const logout = await admin.app.inject({
      method: "POST",
      url: "/api/v1/auth/logout",
      headers: { cookie: admin.cookie, "x-csrf-token": admin.csrf },
    });
    expect(logout.statusCode).toBe(204);

    const afterLogout = await admin.app.inject({
      method: "GET",
      url: "/api/v1/auth/me",
      headers: { cookie: admin.cookie },
    });
    expect(afterLogout.statusCode).toBe(401);
  });

  it("enforces project membership and reserves member management for owners", async () => {
    const context = await createInvitedUser("viewer@example.com");
    const created = await context.app.inject({
      method: "POST",
      url: "/api/v1/projects",
      headers: { cookie: context.cookie, "x-csrf-token": context.csrf },
      payload: { name: "Design system" },
    });
    const projectId = created.json().project.id as string;

    const added = await context.app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/members`,
      headers: { cookie: context.cookie, "x-csrf-token": context.csrf },
      payload: { email: "viewer@example.com", role: "viewer" },
    });
    expect(added.statusCode).toBe(201);

    const visible = await context.app.inject({
      method: "GET",
      url: `/api/v1/projects/${projectId}`,
      headers: { cookie: context.invitedCookie },
    });
    expect(visible.statusCode).toBe(200);

    const forbidden = await context.app.inject({
      method: "PATCH",
      url: `/api/v1/projects/${projectId}`,
      headers: {
        cookie: context.invitedCookie,
        "x-csrf-token": context.invitedCsrf,
      },
      payload: { name: "Unauthorized rename" },
    });
    expect(forbidden.statusCode).toBe(403);

    const ownerRemoval = await context.app.inject({
      method: "DELETE",
      url: `/api/v1/projects/${projectId}/members/${context.user.id}`,
      headers: { cookie: context.cookie, "x-csrf-token": context.csrf },
    });
    expect(ownerRemoval.statusCode).toBe(409);
  });

  it("reserves both archive and unarchive operations for project owners", async () => {
    const context = await createInvitedUser("editor@example.com");
    const created = await context.app.inject({
      method: "POST",
      url: "/api/v1/projects",
      headers: { cookie: context.cookie, "x-csrf-token": context.csrf },
      payload: { name: "Archive permissions" },
    });
    const projectId = created.json().project.id as string;
    await context.app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/members`,
      headers: { cookie: context.cookie, "x-csrf-token": context.csrf },
      payload: { email: "editor@example.com", role: "editor" },
    });

    const response = await context.app.inject({
      method: "PATCH",
      url: `/api/v1/projects/${projectId}`,
      headers: {
        cookie: context.invitedCookie,
        "x-csrf-token": context.invitedCsrf,
      },
      payload: { archived: false },
    });
    expect(response.statusCode).toBe(403);
  });

  it("lets owners invite, update, and remove project members", async () => {
    const owner = await bootstrap();
    const created = await owner.app.inject({
      method: "POST",
      url: "/api/v1/projects",
      headers: { cookie: owner.cookie, "x-csrf-token": owner.csrf },
      payload: { name: "Invited project" },
    });
    const projectId = created.json().project.id as string;
    const invitation = await owner.app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/invitations`,
      headers: { cookie: owner.cookie, "x-csrf-token": owner.csrf },
      payload: { email: "project-editor@example.com", role: "editor" },
    });
    expect(invitation.statusCode).toBe(201);
    const manualLink = new URL(
      invitation.json().manualLink as string,
      "https://blue-canvas.test",
    );
    expect(manualLink.search).toBe("");
    expect(new URLSearchParams(manualLink.hash.slice(1)).get("token")).toBe(
      invitation.json().token,
    );

    const accepted = await owner.app.inject({
      method: "POST",
      url: "/api/v1/auth/invitations/accept",
      payload: {
        token: invitation.json().token,
        displayName: "Project Editor",
        password: PASSWORD,
      },
    });
    const userId = accepted.json().user.id as string;
    const memberCookie = cookieFrom(accepted);
    const memberCsrf = accepted.json().csrfToken as string;
    const editable = await owner.app.inject({
      method: "PATCH",
      url: `/api/v1/projects/${projectId}`,
      headers: { cookie: memberCookie, "x-csrf-token": memberCsrf },
      payload: { name: "Edited after invitation" },
    });
    expect(editable.statusCode).toBe(200);

    const updated = await owner.app.inject({
      method: "PATCH",
      url: `/api/v1/projects/${projectId}/members/${userId}`,
      headers: { cookie: owner.cookie, "x-csrf-token": owner.csrf },
      payload: { role: "viewer" },
    });
    expect(updated.statusCode).toBe(200);
    const denied = await owner.app.inject({
      method: "PATCH",
      url: `/api/v1/projects/${projectId}`,
      headers: { cookie: memberCookie, "x-csrf-token": memberCsrf },
      payload: { name: "Denied after downgrade" },
    });
    expect(denied.statusCode).toBe(403);

    const removed = await owner.app.inject({
      method: "DELETE",
      url: `/api/v1/projects/${projectId}/members/${userId}`,
      headers: { cookie: owner.cookie, "x-csrf-token": owner.csrf },
    });
    expect(removed.statusCode).toBe(204);
    const invisible = await owner.app.inject({
      method: "GET",
      url: `/api/v1/projects/${projectId}`,
      headers: { cookie: memberCookie },
    });
    expect(invisible.statusCode).toBe(403);
  });

  it("audits only the successful request during concurrent member removal", async () => {
    const owner = await bootstrap();
    const project = await owner.app.inject({
      method: "POST",
      url: "/api/v1/projects",
      headers: { cookie: owner.cookie, "x-csrf-token": owner.csrf },
      payload: { name: "Concurrent removal" },
    });
    const member = await repository.createUser({
      email: "concurrent-remove@example.com",
      displayName: "Concurrent Remove",
      passwordHash: await dependencies.passwordHasher.hash(PASSWORD),
      locale: "en-US",
      isAdmin: false,
      now: dependencies.now?.() ?? new Date(),
    });
    const projectId = project.json().project.id as string;
    await owner.app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/members`,
      headers: { cookie: owner.cookie, "x-csrf-token": owner.csrf },
      payload: { email: member.email, role: "viewer" },
    });
    const removal = () =>
      owner.app.inject({
        method: "DELETE",
        url: `/api/v1/projects/${projectId}/members/${member.id}`,
        headers: { cookie: owner.cookie, "x-csrf-token": owner.csrf },
      });

    const responses = await Promise.all([removal(), removal()]);

    expect(responses.map(({ statusCode }) => statusCode).sort()).toEqual([
      204, 404,
    ]);
    const snapshot = repository.snapshot() as {
      auditEvents: { action: string; targetId: string | null }[];
    };
    expect(
      snapshot.auditEvents.filter(
        ({ action, targetId }) =>
          action === "project.member.remove" && targetId === member.id,
      ),
    ).toHaveLength(1);
  });

  it("accepts bearer tokens without CSRF but enforces their scopes", async () => {
    const admin = await bootstrap();
    const createdProject = await admin.app.inject({
      method: "POST",
      url: "/api/v1/projects",
      headers: { cookie: admin.cookie, "x-csrf-token": admin.csrf },
      payload: { name: "PAT project" },
    });
    const projectId = createdProject.json().project.id as string;
    const createdToken = await admin.app.inject({
      method: "POST",
      url: "/api/v1/personal-access-tokens",
      headers: { cookie: admin.cookie, "x-csrf-token": admin.csrf },
      payload: { name: "reader", scopes: ["projects:read"] },
    });
    const token = createdToken.json().token as string;
    expect(JSON.stringify(repository.snapshot())).not.toContain(token);

    const listed = await admin.app.inject({
      method: "GET",
      url: "/api/v1/projects",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(listed.statusCode).toBe(200);

    const denied = await admin.app.inject({
      method: "PATCH",
      url: `/api/v1/projects/${projectId}`,
      headers: { authorization: `Bearer ${token}` },
      payload: { name: "Denied" },
    });
    expect(denied.statusCode).toBe(403);
    expect(denied.json().error.code).toBe("insufficient_scope");

    const escalation = await admin.app.inject({
      method: "POST",
      url: "/api/v1/personal-access-tokens",
      headers: { authorization: `Bearer ${token}` },
      payload: { name: "writer", scopes: ["projects:write"] },
    });
    expect(escalation.statusCode).toBe(403);
    expect(escalation.json().error.code).toBe("invalid_auth_method");

    const tokenList = await admin.app.inject({
      method: "GET",
      url: "/api/v1/personal-access-tokens",
      headers: { cookie: admin.cookie },
    });
    expect(tokenList.json().tokens[0]).not.toHaveProperty("tokenHash");
  });

  it("uploads validated assets for editors without exposing storage keys", async () => {
    const admin = await bootstrap();
    const created = await admin.app.inject({
      method: "POST",
      url: "/api/v1/projects",
      headers: { cookie: admin.cookie, "x-csrf-token": admin.csrf },
      payload: { name: "Assets" },
    });
    const upload = multipartPng();
    const response = await admin.app.inject({
      method: "POST",
      url: `/api/v1/projects/${created.json().project.id}/assets`,
      headers: {
        cookie: admin.cookie,
        "x-csrf-token": admin.csrf,
        "content-type": upload.contentType,
      },
      payload: upload.body,
    });

    expect(response.statusCode).toBe(201);
    expect(response.json().asset).toMatchObject({
      originalName: "pixel.png",
      mediaType: "image/png",
      size: 68,
    });
    expect(response.json().asset).not.toHaveProperty("storageKey");
  });

  it("restricts audit logs and never records raw credentials", async () => {
    const context = await createInvitedUser("member@example.com");
    const denied = await context.app.inject({
      method: "GET",
      url: "/api/v1/audit-events",
      headers: { cookie: context.invitedCookie },
    });
    expect(denied.statusCode).toBe(403);

    const events = await context.app.inject({
      method: "GET",
      url: "/api/v1/audit-events",
      headers: { cookie: context.cookie },
    });
    expect(events.statusCode).toBe(200);
    expect(JSON.stringify(events.json())).not.toContain(PASSWORD);
    expect(events.json().events.length).toBeGreaterThan(0);
  });
});
