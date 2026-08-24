import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildApp, type ServerDependencies } from "./app.js";
import { InMemoryRepository } from "./memory-repository.js";
import { ArgonPasswordHasher } from "./security.js";
import { LocalAssetStorage } from "./storage.js";

const PASSWORD = "correct horse battery staple";

function cookieFrom(response: { headers: Record<string, unknown> }): string {
  const header = response.headers["set-cookie"];
  const cookie = Array.isArray(header) ? header[0] : header;
  if (typeof cookie !== "string") throw new Error("No session cookie returned");
  return cookie.split(";", 1)[0] ?? "";
}

function multipartPng(): { body: Buffer; contentType: string } {
  const boundary = "blue-canvas-test-boundary";
  const png = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00,
  ]);
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
    expect(invitation.json().manualLink).toContain(encodeURIComponent(token));
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
      size: 9,
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
