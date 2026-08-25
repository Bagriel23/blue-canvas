import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildApp } from "./app.js";
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

describe("collaboration HTTP API", () => {
  let directory: string;
  let repository: InMemoryRepository;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "blue-canvas-collab-api-"));
    repository = new InMemoryRepository();
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it("exposes version and comment resources without leaking Yjs snapshots", async () => {
    const app = buildApp({
      repository,
      passwordHasher: new ArgonPasswordHasher(),
      storage: await LocalAssetStorage.create(directory),
      setupSecret: "development setup secret",
      production: false,
      now: () => new Date("2026-08-24T12:00:00.000Z"),
    });
    const bootstrap = await app.inject({
      method: "POST",
      url: "/api/v1/auth/bootstrap-admin",
      payload: {
        email: "admin@example.com",
        displayName: "Admin",
        password: PASSWORD,
        setupSecret: "development setup secret",
      },
    });
    const headers = {
      cookie: cookieFrom(bootstrap),
      "x-csrf-token": bootstrap.json().csrfToken as string,
    };
    const createdProject = await app.inject({
      method: "POST",
      url: "/api/v1/projects",
      headers,
      payload: { name: "Shared project" },
    });
    const projectId = createdProject.json().project.id as string;

    const version = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/versions`,
      headers,
      payload: { name: "First" },
    });
    const comment = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/comments`,
      headers,
      payload: { body: "Review", position: { x: 0, y: 1 } },
    });
    const versions = await app.inject({
      method: "GET",
      url: `/api/v1/projects/${projectId}/versions`,
      headers: { cookie: headers.cookie },
    });
    const comments = await app.inject({
      method: "GET",
      url: `/api/v1/projects/${projectId}/comments`,
      headers: { cookie: headers.cookie },
    });

    expect(version.statusCode).toBe(201);
    expect(version.json().version).toMatchObject({
      name: "First",
      revision: 1,
    });
    expect(version.body).not.toContain("stateVector");
    expect(comment.statusCode).toBe(201);
    expect(comment.json().comment).toMatchObject({
      body: "Review",
      position: { x: 0, y: 1 },
      mentionUserIds: [],
    });
    expect(versions.json().versions).toHaveLength(1);
    expect(comments.json().comments).toHaveLength(1);
    await app.close();
  });
});
