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

describe("teams and project sharing API", () => {
  let directory: string;
  let dependencies: ServerDependencies;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "blue-canvas-team-api-"));
    dependencies = {
      repository: new InMemoryRepository(),
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

  it("creates and lists teams for the authenticated owner", async () => {
    const app = buildApp(dependencies);
    const bootstrap = await app.inject({
      method: "POST",
      url: "/api/v1/auth/bootstrap-admin",
      payload: {
        email: "owner@example.com",
        displayName: "Owner",
        password: PASSWORD,
        setupSecret: "development setup secret",
      },
    });
    const cookie = cookieFrom(bootstrap);
    const csrf = bootstrap.json().csrfToken as string;

    const created = await app.inject({
      method: "POST",
      url: "/api/v1/teams",
      headers: { cookie, "x-csrf-token": csrf },
      payload: { name: "Studio SEDA" },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json().team).toMatchObject({
      name: "Studio SEDA",
      role: "owner",
    });

    const listed = await app.inject({
      method: "GET",
      url: "/api/v1/teams",
      headers: { cookie },
    });
    expect(listed.statusCode).toBe(200);
    expect(listed.json().teams).toHaveLength(1);
  });

  it("returns project members and keeps project invitations available", async () => {
    const app = buildApp(dependencies);
    const bootstrap = await app.inject({
      method: "POST",
      url: "/api/v1/auth/bootstrap-admin",
      payload: {
        email: "owner@example.com",
        displayName: "Owner",
        password: PASSWORD,
        setupSecret: "development setup secret",
      },
    });
    const cookie = cookieFrom(bootstrap);
    const csrf = bootstrap.json().csrfToken as string;
    const project = await app.inject({
      method: "POST",
      url: "/api/v1/projects",
      headers: { cookie, "x-csrf-token": csrf },
      payload: { name: "Shared canvas" },
    });
    const projectId = project.json().project.id as string;

    const members = await app.inject({
      method: "GET",
      url: `/api/v1/projects/${projectId}/members`,
      headers: { cookie },
    });
    expect(members.statusCode).toBe(200);
    expect(members.json().members).toEqual([
      expect.objectContaining({ email: "owner@example.com", role: "owner" }),
    ]);

    const invitation = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/invitations`,
      headers: { cookie, "x-csrf-token": csrf },
      payload: { email: "designer@example.com", role: "editor" },
    });
    expect(invitation.statusCode).toBe(201);
    expect(invitation.json().manualLink).toContain("accept-invitation");
  });
});
