import {
  applyCollaborationState,
  createInitialCollaborationDocument,
  encodeCollaborationState,
  readSemanticDocument,
  replaceSemanticDocument,
} from "@blue-canvas/collaboration";
import * as Y from "yjs";
import { describe, expect, it, vi } from "vitest";

import { CollaborationManager } from "./collaboration.js";
import { ApplicationService, type Principal } from "./core.js";
import { InMemoryRepository } from "./memory-repository.js";
import type { PasswordHasher } from "./security.js";
import type { AssetStorage } from "./storage.js";

const NOW = new Date("2026-08-24T12:00:00.000Z");

const passwordHasher: PasswordHasher = {
  hash: async () => "hash",
  verify: async () => true,
};

const storage = {
  exists: async () => false,
} as unknown as AssetStorage;

async function fixture() {
  const repository = new InMemoryRepository();
  const service = new ApplicationService({
    repository,
    passwordHasher,
    storage,
    setupSecret: "unused",
    now: () => NOW,
  });
  const user = await repository.createUser({
    email: "owner@example.com",
    displayName: "Owner",
    passwordHash: "hash",
    locale: "pt-BR",
    isAdmin: true,
    now: NOW,
  });
  const session = await repository.createSession({
    userId: user.id,
    tokenHash: "a".repeat(64),
    csrfHash: "b".repeat(64),
    expiresAt: new Date("2026-08-31T12:00:00.000Z"),
    now: NOW,
  });
  const principal: Principal = { kind: "session", user, session };
  const project = await service.createProject(
    principal,
    { name: "Canvas" },
    "project-trace",
  );
  return { repository, service, principal, project };
}

describe("collaboration domain", () => {
  it("converts rebase command errors into a controlled revision conflict", async () => {
    const { repository, service, project } = await fixture();
    const initial = createInitialCollaborationDocument(
      project.id,
      project.name,
    );
    const encoded = encodeCollaborationState(initial);
    await repository.upsertProjectDocument({
      projectId: project.id,
      ...encoded,
      expectedRevision: 0,
      now: NOW,
    });
    initial.destroy();

    const manager = new CollaborationManager({
      repository,
      service,
      now: () => NOW,
    });
    const active = createInitialCollaborationDocument(project.id, project.name);
    (manager.hocuspocus.documents as unknown as Map<string, Y.Doc>).set(
      project.id,
      active,
    );
    try {
      await expect(
        manager.rebaseProjectCommands(
          project.id,
          [
            {
              type: "update-node",
              nodeId: "00000000-0000-4000-8000-000000000999",
              patch: { name: "Renamed" },
            },
          ],
          "00000000-0000-4000-8000-000000000998",
          "rebase-error-123456",
        ),
      ).rejects.toMatchObject({
        code: "revision_conflict",
        statusCode: 409,
      });
      expect(readSemanticDocument(active).name).toBe(project.name);
    } finally {
      manager.hocuspocus.documents.delete(project.id);
      active.destroy();
    }
  });

  it("retries rebase when the active Yjs vector changes while reading persistence", async () => {
    const { repository, service, project } = await fixture();
    const initial = createInitialCollaborationDocument(
      project.id,
      project.name,
    );
    const encoded = encodeCollaborationState(initial);
    await repository.upsertProjectDocument({
      projectId: project.id,
      ...encoded,
      expectedRevision: 0,
      now: NOW,
    });
    await repository.createCommandReceipt({
      projectId: project.id,
      idempotencyKey: "rebase-vector-123456",
      fingerprint: "fingerprint",
      revision: 1,
      document: readSemanticDocument(initial),
      createdAt: NOW,
    });
    initial.destroy();

    const manager = new CollaborationManager({
      repository,
      service,
      now: () => NOW,
    });
    const active = createInitialCollaborationDocument(project.id, project.name);
    (manager.hocuspocus.documents as unknown as Map<string, Y.Doc>).set(
      project.id,
      active,
    );
    vi.spyOn(manager, "flushProject").mockImplementation(async () => {
      const latest = await findProjectDocument(project.id);
      if (!latest) throw new Error("missing persisted document");
      const current = encodeCollaborationState(active);
      await repository.upsertProjectDocument({
        projectId: project.id,
        ...current,
        expectedRevision: latest.revision,
        now: NOW,
      });
    });
    let injectConcurrentEdit = true;
    const findProjectDocument = repository.findProjectDocument.bind(repository);
    vi.spyOn(repository, "findProjectDocument").mockImplementation(
      (projectId) => {
        const result = findProjectDocument(projectId);
        if (!injectConcurrentEdit) return result;
        injectConcurrentEdit = false;
        return result.then((persisted) => {
          queueMicrotask(() => {
            const concurrent = readSemanticDocument(active);
            concurrent.name = "Late edit";
            replaceSemanticDocument(active, concurrent);
          });
          return persisted;
        });
      },
    );

    try {
      await manager.rebaseProjectCommands(
        project.id,
        [
          {
            type: "set-token",
            name: "brand",
            value: { type: "color", value: "#1428A0" },
          },
        ],
        "00000000-0000-4000-8000-000000000998",
        "rebase-vector-123456",
      );
      const persisted = await findProjectDocument(project.id);
      if (!persisted) throw new Error("missing persisted document");
      const restored = new Y.Doc();
      try {
        applyCollaborationState(restored, persisted.state);
        expect(readSemanticDocument(restored)).toMatchObject({
          name: "Late edit",
          tokens: { brand: { type: "color", value: "#1428A0" } },
        });
      } finally {
        restored.destroy();
      }
    } finally {
      manager.hocuspocus.documents.delete(project.id);
      active.destroy();
    }
  });

  it("rolls back the active Yjs rebase when the receipt update fails", async () => {
    const { repository, service, project } = await fixture();
    const initial = createInitialCollaborationDocument(
      project.id,
      project.name,
    );
    const encoded = encodeCollaborationState(initial);
    await repository.upsertProjectDocument({
      projectId: project.id,
      ...encoded,
      expectedRevision: 0,
      now: NOW,
    });
    await repository.createCommandReceipt({
      projectId: project.id,
      idempotencyKey: "rebase-rollback-123456",
      fingerprint: "fingerprint",
      revision: 1,
      document: readSemanticDocument(initial),
      createdAt: NOW,
    });
    initial.destroy();

    const manager = new CollaborationManager({
      repository,
      service,
      now: () => NOW,
    });
    const active = createInitialCollaborationDocument(project.id, project.name);
    (manager.hocuspocus.documents as unknown as Map<string, Y.Doc>).set(
      project.id,
      active,
    );
    vi.spyOn(repository, "updateCommandReceipt").mockRejectedValue(
      new Error("receipt update failed"),
    );

    try {
      await expect(
        manager.rebaseProjectCommands(
          project.id,
          [
            {
              type: "set-token",
              name: "brand",
              value: { type: "color", value: "#1428A0" },
            },
          ],
          "00000000-0000-4000-8000-000000000998",
          "rebase-rollback-123456",
        ),
      ).rejects.toThrow("receipt update failed");
      expect(readSemanticDocument(active).tokens.brand).toBeUndefined();
      const persisted = await repository.findProjectDocument(project.id);
      if (!persisted) throw new Error("missing persisted document");
      const restored = new Y.Doc();
      try {
        applyCollaborationState(restored, persisted.state);
        expect(readSemanticDocument(restored).tokens.brand).toBeUndefined();
      } finally {
        restored.destroy();
      }
    } finally {
      manager.hocuspocus.documents.delete(project.id);
      active.destroy();
    }
  });

  it("serializes project operations through a reentrant project lock", async () => {
    const { repository, service, project } = await fixture();
    const manager = new CollaborationManager({
      repository,
      service,
      now: () => NOW,
    });
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let entered = false;
    let secondCompleted = false;

    const first = manager.withProjectLock(project.id, async () => {
      entered = true;
      await gate;
      return "first";
    });
    while (!entered) await Promise.resolve();
    const second = manager.withProjectLock(project.id, async () => {
      secondCompleted = true;
      return "second";
    });

    await Promise.resolve();
    expect(secondCompleted).toBe(false);
    release();
    await expect(first).resolves.toBe("first");
    await expect(second).resolves.toBe("second");
    expect(secondCompleted).toBe(true);
  });

  it("preserves a concurrent Yjs edit when rebase rollback follows it", async () => {
    const { repository, service, project } = await fixture();
    const initial = createInitialCollaborationDocument(
      project.id,
      project.name,
    );
    const encoded = encodeCollaborationState(initial);
    await repository.upsertProjectDocument({
      projectId: project.id,
      ...encoded,
      expectedRevision: 0,
      now: NOW,
    });
    await repository.createCommandReceipt({
      projectId: project.id,
      idempotencyKey: "rebase-concurrent-123456",
      fingerprint: "fingerprint",
      revision: 1,
      document: readSemanticDocument(initial),
      createdAt: NOW,
    });
    initial.destroy();

    const manager = new CollaborationManager({
      repository,
      service,
      now: () => NOW,
    });
    const active = createInitialCollaborationDocument(project.id, project.name);
    (manager.hocuspocus.documents as unknown as Map<string, Y.Doc>).set(
      project.id,
      active,
    );
    vi.spyOn(manager, "flushProject").mockImplementation(async () => {
      const persisted = await repository.findProjectDocument(project.id);
      if (!persisted) throw new Error("missing persisted document");
      await repository.upsertProjectDocument({
        projectId: project.id,
        ...encodeCollaborationState(active),
        expectedRevision: persisted.revision,
        now: NOW,
      });
    });
    vi.spyOn(repository, "updateCommandReceipt").mockImplementation(
      async () => {
        const concurrent = readSemanticDocument(active);
        concurrent.name = "Concurrent rollback edit";
        replaceSemanticDocument(active, concurrent);
        throw new Error("receipt update failed");
      },
    );

    try {
      await expect(
        manager.rebaseProjectCommands(
          project.id,
          [
            {
              type: "set-token",
              name: "brand",
              value: { type: "color", value: "#1428A0" },
            },
          ],
          "00000000-0000-4000-8000-000000000998",
          "rebase-concurrent-123456",
        ),
      ).rejects.toThrow("receipt update failed");
      expect(readSemanticDocument(active)).toMatchObject({
        name: "Concurrent rollback edit",
        tokens: { brand: { type: "color", value: "#1428A0" } },
      });
    } finally {
      manager.hocuspocus.documents.delete(project.id);
      active.destroy();
    }
  });

  it("destroys the command document when persistence fails", async () => {
    const { repository, service, principal, project } = await fixture();
    const initial = createInitialCollaborationDocument(
      project.id,
      project.name,
    );
    const encoded = encodeCollaborationState(initial);
    initial.destroy();
    await repository.upsertProjectDocument({
      projectId: project.id,
      ...encoded,
      now: NOW,
    });
    vi.spyOn(repository, "upsertProjectDocument").mockRejectedValue(
      new Error("persistence failed"),
    );
    const destroy = vi.spyOn(Y.Doc.prototype, "destroy");

    await expect(
      service.applyCommands(
        principal,
        project.id,
        {
          baseRevision: 1,
          idempotencyKey: "cleanup-command-123456",
          commands: [
            {
              type: "set-token",
              name: "brand",
              value: { type: "color", value: "#1428A0" },
            },
          ],
        },
        "cleanup-trace",
      ),
    ).rejects.toThrow("persistence failed");
    expect(destroy).toHaveBeenCalled();
    destroy.mockRestore();
  });

  it("destroys the initial version document when persistence fails", async () => {
    const { repository, service, principal, project } = await fixture();
    vi.spyOn(repository, "upsertProjectDocument").mockRejectedValue(
      new Error("persistence failed"),
    );
    const destroy = vi.spyOn(Y.Doc.prototype, "destroy");

    await expect(
      service.createNamedVersion(
        principal,
        project.id,
        { name: "Initial" },
        "initial-version-trace",
      ),
    ).rejects.toThrow("persistence failed");
    expect(destroy).toHaveBeenCalled();
    destroy.mockRestore();
  });

  it("creates immutable versions and restores by creating a new revision", async () => {
    const { repository, service, principal, project } = await fixture();
    const initial = encodeCollaborationState(
      createInitialCollaborationDocument(project.id, project.name),
    );
    await repository.upsertProjectDocument({
      projectId: project.id,
      state: initial.state,
      stateVector: initial.stateVector,
      now: NOW,
    });

    const version = await service.createNamedVersion(
      principal,
      project.id,
      { name: "Before changes" },
      "version-trace",
    );
    const restored = await service.restoreNamedVersion(
      principal,
      project.id,
      version.id,
      { name: "Restore before changes" },
      "restore-trace",
    );

    expect(version.revision).toBe(1);
    expect(restored).toMatchObject({
      name: "Restore before changes",
      restoredFromId: version.id,
      revision: 2,
    });
    expect(await service.listNamedVersions(principal, project.id)).toHaveLength(
      2,
    );
    await expect(
      service.getNamedVersion(principal, project.id, version.id),
    ).resolves.toMatchObject({ name: "Before changes", restoredFromId: null });
    expect(
      (
        await repository.listAuditEvents({ projectId: project.id, limit: 20 })
      ).map(({ action }) => action),
    ).toEqual(
      expect.arrayContaining([
        "project.version.create",
        "project.version.restore",
      ]),
    );
  });

  it("enforces comment roles, authorship, resolution, and eligible mentions", async () => {
    const { repository, service, principal, project } = await fixture();
    const commenter = await repository.createUser({
      email: "commenter@example.com",
      displayName: "Commenter",
      passwordHash: "hash",
      locale: "pt-BR",
      isAdmin: false,
      now: NOW,
    });
    const viewer = await repository.createUser({
      email: "viewer@example.com",
      displayName: "Viewer",
      passwordHash: "hash",
      locale: "pt-BR",
      isAdmin: false,
      now: NOW,
    });
    const outsider = await repository.createUser({
      email: "outsider@example.com",
      displayName: "Outsider",
      passwordHash: "hash",
      locale: "pt-BR",
      isAdmin: false,
      now: NOW,
    });
    await repository.addProjectMember({
      projectId: project.id,
      userId: commenter.id,
      role: "commenter",
      now: NOW,
    });
    await repository.addProjectMember({
      projectId: project.id,
      userId: viewer.id,
      role: "viewer",
      now: NOW,
    });
    const commenterPrincipal = {
      kind: "session",
      user: commenter,
      session: principal.session,
    } as const;
    const viewerPrincipal = {
      kind: "session",
      user: viewer,
      session: principal.session,
    } as const;

    const comment = await service.createComment(
      commenterPrincipal,
      project.id,
      {
        body: "Review this",
        position: { x: 0.25, y: 0.75 },
        mentionUserIds: [principal.user.id],
      },
      "comment-trace",
    );

    await expect(
      service.createComment(
        viewerPrincipal,
        project.id,
        { body: "No write", mentionUserIds: [] },
        "viewer-trace",
      ),
    ).rejects.toMatchObject({ code: "forbidden" });
    await expect(
      service.createComment(
        principal,
        project.id,
        { body: "Bad mention", mentionUserIds: [outsider.id] },
        "mention-trace",
      ),
    ).rejects.toMatchObject({ code: "invalid_mentions" });
    await expect(
      service.updateComment(
        principal,
        project.id,
        comment.id,
        { body: "Owner cannot impersonate the author" },
        "update-trace",
      ),
    ).rejects.toMatchObject({ code: "forbidden" });

    const resolved = await service.resolveComment(
      principal,
      project.id,
      comment.id,
      { resolved: true },
      "resolve-trace",
    );
    expect(resolved.resolvedAt).toEqual(NOW);
    await expect(
      service.listComments(viewerPrincipal, project.id),
    ).resolves.toHaveLength(1);
  });

  it("rejects cross-project comment references and dangling node anchors", async () => {
    const { service, principal, project } = await fixture();
    const other = await service.createProject(
      principal,
      { name: "Other" },
      "other-trace",
    );
    const comment = await service.createComment(
      principal,
      project.id,
      { body: "Project one", mentionUserIds: [] },
      "comment-trace",
    );

    await expect(
      service.getComment(principal, other.id, comment.id),
    ).rejects.toMatchObject({
      code: "not_found",
    });
    await expect(
      service.createComment(
        principal,
        project.id,
        {
          body: "Dangling",
          nodeId: "00000000-0000-4000-8000-000000000099",
          mentionUserIds: [],
        },
        "node-trace",
      ),
    ).rejects.toMatchObject({ code: "invalid_node_anchor" });
  });
});
