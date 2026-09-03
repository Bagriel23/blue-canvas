import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  HocuspocusProvider,
  HocuspocusProviderWebsocket,
} from "@hocuspocus/provider";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import WebSocket from "ws";
import * as Y from "yjs";
import { applyCollaborationState } from "@blue-canvas/collaboration";

import { buildApp, type ServerDependencies } from "./app.js";
import { InMemoryRepository } from "./memory-repository.js";
import { ArgonPasswordHasher, sha256 } from "./security.js";
import { LocalAssetStorage } from "./storage.js";

const PASSWORD = "correct horse battery staple";

function cookieFrom(response: { headers: Record<string, unknown> }): string {
  const header = response.headers["set-cookie"];
  const cookie = Array.isArray(header) ? header[0] : header;
  if (typeof cookie !== "string") throw new Error("No session cookie returned");
  return cookie.split(";", 1)[0] ?? "";
}

function webSocketWithCookie(cookie: string): typeof WebSocket {
  return class extends WebSocket {
    constructor(address: string | URL, protocols?: string | string[]) {
      super(address, protocols, { headers: { cookie } });
    }
  } as typeof WebSocket;
}

function waitForProvider(provider: HocuspocusProvider): Promise<void> {
  if (provider.isSynced) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const events: string[] = [];
    const timeout = setTimeout(
      () =>
        reject(
          new Error(
            `provider sync timed out: ${events.join(",")}; authenticated=${String(provider.isAuthenticated)}; attached=${String(provider.isAttached)}; socketStatus=${provider.configuration.websocketProvider.status}`,
          ),
        ),
      5_000,
    );
    provider.on("status", ({ status }: { status: string }) =>
      events.push(`status:${status}`),
    );
    provider.on("close", ({ event }: { event: { code: number } }) =>
      events.push(`close:${event.code}`),
    );
    provider.on("synced", ({ state }: { state: boolean }) => {
      if (!state) return;
      clearTimeout(timeout);
      resolve();
    });
    provider.on("authenticationFailed", ({ reason }: { reason: string }) => {
      clearTimeout(timeout);
      reject(new Error(reason));
    });
  });
}

function waitForAuthenticationFailure(
  provider: HocuspocusProvider,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("authentication failure timed out")),
      5_000,
    );
    provider.on("authenticationFailed", ({ reason }: { reason: string }) => {
      clearTimeout(timeout);
      resolve(reason);
    });
    provider.on("synced", () => {
      clearTimeout(timeout);
      reject(new Error("provider unexpectedly synchronized"));
    });
  });
}

function waitForProviderClose(provider: HocuspocusProvider): Promise<string> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("provider close timed out")),
      5_000,
    );
    provider.on("close", ({ event }: { event: { reason: string } }) => {
      clearTimeout(timeout);
      resolve(event.reason);
    });
  });
}

function provider(input: {
  url: string;
  name: string;
  document: Y.Doc;
  token: string;
  WebSocketPolyfill: typeof WebSocket;
}): HocuspocusProvider {
  const result = new HocuspocusProvider({
    name: input.name,
    document: input.document,
    token: input.token,
    websocketProvider: new HocuspocusProviderWebsocket({
      url: input.url,
      WebSocketPolyfill: input.WebSocketPolyfill,
    }),
  });
  result.attach();
  return result;
}

async function waitUntil(predicate: () => boolean): Promise<void> {
  const deadline = Date.now() + 5_000;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error("condition timed out");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

describe("Hocuspocus collaboration", () => {
  let directory: string;
  let repository: InMemoryRepository;
  let dependencies: ServerDependencies;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "blue-canvas-collab-ws-"));
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

  it("syncs two authenticated clients, awareness, convergence, and persisted reconnect", async () => {
    const app = buildApp(dependencies);
    await app.listen({ host: "127.0.0.1", port: 0 });
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
    const cookie = cookieFrom(bootstrap);
    const csrf = bootstrap.json().csrfToken as string;
    const project = await app.inject({
      method: "POST",
      url: "/api/v1/projects",
      headers: { cookie, "x-csrf-token": csrf },
      payload: { name: "Realtime" },
    });
    const projectId = project.json().project.id as string;
    const address = app.server.address();
    if (!address || typeof address === "string")
      throw new Error("missing address");
    const url = `ws://127.0.0.1:${address.port}/api/v1/collaboration`;

    const firstDocument = new Y.Doc();
    const secondDocument = new Y.Doc();
    const ProviderSocket = webSocketWithCookie(cookie);
    const first = provider({
      url,
      name: projectId,
      document: firstDocument,
      token: csrf,
      WebSocketPolyfill: ProviderSocket,
    });
    const second = provider({
      url,
      name: projectId,
      document: secondDocument,
      token: csrf,
      WebSocketPolyfill: ProviderSocket,
    });
    await Promise.all([waitForProvider(first), waitForProvider(second)]);

    first.awareness?.setLocalStateField("user", { name: "First" });
    firstDocument.getMap("content").set("left", "A");
    secondDocument.getMap("content").set("right", "B");
    await waitUntil(
      () =>
        secondDocument.getMap("content").get("left") === "A" &&
        firstDocument.getMap("content").get("right") === "B" &&
        (second.awareness?.getStates().size ?? 0) >= 2,
    );
    expect(Y.encodeStateAsUpdate(firstDocument)).toEqual(
      Y.encodeStateAsUpdate(secondDocument),
    );

    firstDocument.getMap("content").set("immediate", "latest");
    const versionResponse = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/versions`,
      headers: { cookie, "x-csrf-token": csrf },
      payload: { name: "Converged" },
    });
    expect(versionResponse.statusCode).toBe(201);
    const versionId = versionResponse.json().version.id as string;
    const version = await dependencies.repository.findNamedVersion(
      projectId,
      versionId,
    );
    expect(version).toBeDefined();
    const versionDocument = new Y.Doc();
    if (!version) throw new Error("version was not persisted");
    applyCollaborationState(versionDocument, version.state);
    expect(versionDocument.getMap("content").get("immediate")).toBe("latest");
    versionDocument.destroy();
    firstDocument.getMap("content").set("later", "discard me");
    await waitUntil(
      () => secondDocument.getMap("content").get("later") === "discard me",
    );
    await new Promise((resolve) => setTimeout(resolve, 150));
    const restoreResponse = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/versions/${versionId}/restore`,
      headers: { cookie, "x-csrf-token": csrf },
      payload: { name: "Restore converged" },
    });
    expect(restoreResponse.statusCode).toBe(201);

    first.destroy();
    second.destroy();
    await app.close();

    const restarted = buildApp(dependencies);
    await restarted.listen({ host: "127.0.0.1", port: 0 });
    const restartedAddress = restarted.server.address();
    if (!restartedAddress || typeof restartedAddress === "string")
      throw new Error("missing restarted address");
    const restoredDocument = new Y.Doc();
    const restored = provider({
      url: `ws://127.0.0.1:${restartedAddress.port}/api/v1/collaboration`,
      name: projectId,
      document: restoredDocument,
      token: csrf,
      WebSocketPolyfill: ProviderSocket,
    });
    await waitForProvider(restored);
    expect(restoredDocument.getMap("content").toJSON()).toEqual({
      left: "A",
      right: "B",
      immediate: "latest",
    });
    restored.destroy();
    await restarted.close();
  }, 15_000);

  it("rejects nonmembers and revalidates a downgraded editor before mutation", async () => {
    const app = buildApp(dependencies);
    await app.listen({ host: "127.0.0.1", port: 0 });
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
    const ownerCookie = cookieFrom(bootstrap);
    const ownerCsrf = bootstrap.json().csrfToken as string;
    const ownerId = bootstrap.json().user.id as string;
    const projectResponse = await app.inject({
      method: "POST",
      url: "/api/v1/projects",
      headers: { cookie: ownerCookie, "x-csrf-token": ownerCsrf },
      payload: { name: "Permissions" },
    });
    const projectId = projectResponse.json().project.id as string;
    const editor = await repository.createUser({
      email: "editor@example.com",
      displayName: "Editor",
      passwordHash: "hash",
      locale: "pt-BR",
      isAdmin: false,
      now: new Date("2026-08-24T12:00:00.000Z"),
    });
    await repository.addProjectMember({
      projectId,
      userId: editor.id,
      role: "editor",
      now: new Date("2026-08-24T12:00:00.000Z"),
    });
    const editorToken = "bcs_editor_session_token";
    const editorCsrf = "editor-csrf-token";
    await repository.createSession({
      userId: editor.id,
      tokenHash: sha256(editorToken),
      csrfHash: sha256(editorCsrf),
      expiresAt: new Date("2026-08-31T12:00:00.000Z"),
      now: new Date("2026-08-24T12:00:00.000Z"),
    });
    const outsider = await repository.createUser({
      email: "outsider@example.com",
      displayName: "Outsider",
      passwordHash: "hash",
      locale: "pt-BR",
      isAdmin: false,
      now: new Date("2026-08-24T12:00:00.000Z"),
    });
    const outsiderToken = "bcs_outsider_session_token";
    const outsiderCsrf = "outsider-csrf-token";
    await repository.createSession({
      userId: outsider.id,
      tokenHash: sha256(outsiderToken),
      csrfHash: sha256(outsiderCsrf),
      expiresAt: new Date("2026-08-31T12:00:00.000Z"),
      now: new Date("2026-08-24T12:00:00.000Z"),
    });
    const address = app.server.address();
    if (!address || typeof address === "string")
      throw new Error("missing address");
    const url = `ws://127.0.0.1:${address.port}/api/v1/collaboration`;

    const outsiderProvider = provider({
      url,
      name: projectId,
      document: new Y.Doc(),
      token: outsiderCsrf,
      WebSocketPolyfill: webSocketWithCookie(
        `blue_canvas_session=${outsiderToken}`,
      ),
    });
    await expect(waitForAuthenticationFailure(outsiderProvider)).resolves.toBe(
      "permission-denied",
    );
    const expiredToken = "bcs_expired_editor_session";
    const expiredCsrf = "expired-editor-csrf";
    await repository.createSession({
      userId: editor.id,
      tokenHash: sha256(expiredToken),
      csrfHash: sha256(expiredCsrf),
      expiresAt: new Date("2026-08-23T12:00:00.000Z"),
      now: new Date("2026-08-20T12:00:00.000Z"),
    });
    const expiredProvider = provider({
      url,
      name: projectId,
      document: new Y.Doc(),
      token: expiredCsrf,
      WebSocketPolyfill: webSocketWithCookie(
        `blue_canvas_session=${expiredToken}`,
      ),
    });
    await expect(waitForAuthenticationFailure(expiredProvider)).resolves.toBe(
      "permission-denied",
    );

    const ownerDocument = new Y.Doc();
    const editorDocument = new Y.Doc();
    const ownerProvider = provider({
      url,
      name: projectId,
      document: ownerDocument,
      token: ownerCsrf,
      WebSocketPolyfill: webSocketWithCookie(ownerCookie),
    });
    const editorProvider = provider({
      url,
      name: projectId,
      document: editorDocument,
      token: editorCsrf,
      WebSocketPolyfill: webSocketWithCookie(
        `blue_canvas_session=${editorToken}`,
      ),
    });
    await Promise.all([
      waitForProvider(ownerProvider),
      waitForProvider(editorProvider),
    ]);
    const patRaw = "bcp_revoked_collaboration_token";
    const pat = await repository.createPersonalAccessToken({
      userId: ownerId,
      name: "Realtime",
      tokenHash: sha256(patRaw),
      scopes: ["projects:read", "projects:write"],
      expiresAt: null,
      now: new Date("2026-08-24T12:00:00.000Z"),
    });
    const patDocument = new Y.Doc();
    const patProvider = provider({
      url,
      name: projectId,
      document: patDocument,
      token: patRaw,
      WebSocketPolyfill: WebSocket,
    });
    await waitForProvider(patProvider);
    const revokedClose = waitForProviderClose(patProvider);
    await repository.revokePersonalAccessToken(
      pat.id,
      ownerId,
      new Date("2026-08-24T12:00:00.000Z"),
    );
    patDocument.getMap("content").set("revoked", true);
    await expect(revokedClose).resolves.toBe("authorization-revoked");
    expect(ownerDocument.getMap("content").has("revoked")).toBe(false);

    await repository.updateProjectMember(
      projectId,
      editor.id,
      "commenter",
      new Date("2026-08-24T12:00:00.000Z"),
    );
    editorDocument.getMap("content").set("commenter-forbidden", true);
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(ownerDocument.getMap("content").has("commenter-forbidden")).toBe(
      false,
    );
    await repository.updateProjectMember(
      projectId,
      editor.id,
      "viewer",
      new Date("2026-08-24T12:00:00.000Z"),
    );
    editorDocument.getMap("content").set("viewer-forbidden", true);
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(ownerDocument.getMap("content").has("viewer-forbidden")).toBe(false);
    expect(editorProvider.authorizedScope).toBe("read-write");
    expect(ownerId).not.toBe(editor.id);

    outsiderProvider.destroy();
    expiredProvider.destroy();
    ownerProvider.destroy();
    editorProvider.destroy();
    patProvider.destroy();
    await app.close();
  }, 15_000);

  it("caps concurrent writers and closes oversized updates", async () => {
    const app = buildApp(dependencies);
    await app.listen({ host: "127.0.0.1", port: 0 });
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
    const cookie = cookieFrom(bootstrap);
    const csrf = bootstrap.json().csrfToken as string;
    const projectResponse = await app.inject({
      method: "POST",
      url: "/api/v1/projects",
      headers: { cookie, "x-csrf-token": csrf },
      payload: { name: "Capacity" },
    });
    const projectId = projectResponse.json().project.id as string;
    const address = app.server.address();
    if (!address || typeof address === "string")
      throw new Error("missing address");
    const url = `ws://127.0.0.1:${address.port}/api/v1/collaboration`;
    const ProviderSocket = webSocketWithCookie(cookie);
    const providers: HocuspocusProvider[] = [];
    for (let index = 0; index < 10; index += 1) {
      const current = provider({
        url,
        name: projectId,
        document: new Y.Doc(),
        token: csrf,
        WebSocketPolyfill: ProviderSocket,
      });
      providers.push(current);
      await waitForProvider(current);
    }
    const overflow = provider({
      url,
      name: projectId,
      document: new Y.Doc(),
      token: csrf,
      WebSocketPolyfill: ProviderSocket,
    });
    await expect(waitForAuthenticationFailure(overflow)).resolves.toBe(
      "editor-limit-reached",
    );

    const rejected = providers[0]
      ? waitForProviderClose(providers[0])
      : Promise.reject(new Error("provider missing"));
    providers[0]?.document
      .getMap("content")
      .set("oversized", "x".repeat(1024 * 1024 + 16 * 1024));
    await expect(rejected).resolves.toBe("update-rejected");

    overflow.destroy();
    providers.forEach((current) => current.destroy());
    await app.close();
  }, 20_000);
});
