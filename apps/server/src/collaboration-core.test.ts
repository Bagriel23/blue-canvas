import {
  createInitialCollaborationDocument,
  encodeCollaborationState,
} from "@blue-canvas/collaboration";
import { describe, expect, it } from "vitest";

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
