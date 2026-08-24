import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { buildApp } from "../src/app.js";
import { ApiError } from "../src/core.js";
import {
  createPrismaClient,
  PrismaRepository,
} from "../src/prisma-repository.js";
import { ArgonPasswordHasher } from "../src/security.js";
import { LocalAssetStorage } from "../src/storage.js";

const database = {
  host: process.env.DATABASE_HOST ?? "127.0.0.1",
  port: Number(process.env.DATABASE_PORT ?? "3306"),
  database: process.env.DATABASE_NAME ?? "blue_canvas",
  user: process.env.DATABASE_USER ?? "blue_canvas",
  password: process.env.DATABASE_PASSWORD ?? "blue_canvas_dev",
};

const prisma = createPrismaClient(database);
const repository = new PrismaRepository(prisma);
const now = new Date("2026-08-24T12:00:00.000Z");

beforeEach(async () => {
  await prisma.auditEvent.deleteMany();
  await prisma.asset.deleteMany();
  await prisma.personalAccessToken.deleteMany();
  await prisma.projectMember.deleteMany();
  await prisma.project.deleteMany();
  await prisma.invitation.deleteMany();
  await prisma.session.deleteMany();
  await prisma.user.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("Prisma repository", () => {
  it("rolls back a mutation when its audit insert fails", async () => {
    const owner = await repository.createUser({
      email: "transaction-owner@example.com",
      displayName: "Transaction Owner",
      passwordHash: "$argon2id$test",
      locale: "en-US",
      isAdmin: true,
      now,
    });

    await expect(
      repository.transaction(async (transaction) => {
        const project = await transaction.createProject({
          name: "Must roll back",
          ownerId: owner.id,
          now,
        });
        await transaction.createAuditEvent({
          actorId: "missing-actor",
          action: "project.create",
          targetType: "project",
          targetId: project.id,
          projectId: project.id,
          traceId: "rollback-trace",
          metadata: {},
          now,
        });
      }),
    ).rejects.toThrow();

    await expect(repository.listProjectsForUser(owner.id)).resolves.toEqual([]);
    await expect(repository.listAuditEvents({ limit: 10 })).resolves.toEqual(
      [],
    );
  });

  it("rolls back invitation acceptance when its audit insert fails", async () => {
    const admin = await repository.createUser({
      email: "acceptance-rollback-admin@example.com",
      displayName: "Admin",
      passwordHash: "$argon2id$test",
      locale: "en-US",
      isAdmin: true,
      now,
    });
    const invitation = await repository.createInvitation({
      email: "acceptance-rollback@example.com",
      tokenHash: "f".repeat(64),
      invitedById: admin.id,
      projectId: null,
      role: null,
      expiresAt: new Date("2026-08-25T12:00:00.000Z"),
      now,
    });

    await expect(
      repository.transaction(async (transaction) => {
        const user = await transaction.acceptInvitationAndCreateUser({
          invitationId: invitation.id,
          displayName: "Rolled Back",
          passwordHash: "$argon2id$test",
          locale: "en-US",
          now,
        });
        if (!user) throw new Error("Invitation acceptance unexpectedly failed");
        await transaction.createAuditEvent({
          actorId: "missing-actor",
          action: "invitation.accept",
          targetType: "invitation",
          targetId: invitation.id,
          projectId: null,
          traceId: "acceptance-rollback-trace",
          metadata: {},
          now,
        });
      }),
    ).rejects.toThrow();

    await expect(
      repository.findUserByEmail("acceptance-rollback@example.com"),
    ).resolves.toBeUndefined();
    await expect(
      repository.findInvitationByTokenHash(invitation.tokenHash),
    ).resolves.toMatchObject({ acceptedAt: null });
  });

  it("persists users, projects, memberships, scoped tokens, assets, and audits", async () => {
    expect(await repository.isReady()).toBe(true);
    const owner = await repository.createUser({
      email: "owner@example.com",
      displayName: "Owner",
      passwordHash: "$argon2id$test",
      locale: "en-US",
      isAdmin: true,
      now,
    });
    const project = await repository.createProject({
      name: "Persistent project",
      ownerId: owner.id,
      now,
    });
    const token = await repository.createPersonalAccessToken({
      userId: owner.id,
      name: "automation",
      tokenHash: "a".repeat(64),
      scopes: ["projects:read", "assets:write"],
      expiresAt: null,
      now,
    });
    const asset = await repository.createAsset({
      projectId: project.id,
      uploadedById: owner.id,
      sha256: "b".repeat(64),
      originalName: "pixel.png",
      mediaType: "image/png",
      size: 68,
      storageKey: `bb/${"b".repeat(64)}`,
      status: "ready",
      now,
    });
    await repository.createAuditEvent({
      actorId: owner.id,
      action: "asset.upload",
      targetType: "asset",
      targetId: asset.id,
      projectId: project.id,
      traceId: "integration-trace",
      metadata: { mediaType: "image/png" },
      now,
    });

    expect(await repository.listProjectsForUser(owner.id)).toHaveLength(1);
    expect(
      await repository.findProjectMember(project.id, owner.id),
    ).toMatchObject({
      role: "owner",
    });
    expect(
      await repository.findPersonalAccessTokenByHash(token.tokenHash),
    ).toMatchObject({ scopes: ["projects:read", "assets:write"] });
    expect(
      await repository.listAuditEvents({ projectId: project.id, limit: 10 }),
    ).toMatchObject([{ traceId: "integration-trace" }]);
  });

  it("maps normalized-email and project-member conflicts to stable errors", async () => {
    const user = await repository.createUser({
      email: "unique@example.com",
      displayName: "Unique",
      passwordHash: "$argon2id$test",
      locale: "en-US",
      isAdmin: false,
      now,
    });
    await expect(
      repository.createUser({
        email: "unique@example.com",
        displayName: "Duplicate",
        passwordHash: "$argon2id$test",
        locale: "en-US",
        isAdmin: false,
        now,
      }),
    ).rejects.toMatchObject({
      code: "email_exists",
      statusCode: 409,
    } satisfies Partial<ApiError>);
    const project = await repository.createProject({
      name: "Unique membership",
      ownerId: user.id,
      now,
    });
    await expect(
      repository.addProjectMember({
        projectId: project.id,
        userId: user.id,
        role: "viewer",
        now,
      }),
    ).rejects.toMatchObject({
      code: "member_exists",
      statusCode: 409,
    } satisfies Partial<ApiError>);
  });

  it("serializes bootstrap and invitation consumption", async () => {
    const bootstrapInput = (email: string) => ({
      email,
      displayName: "Admin",
      passwordHash: "$argon2id$test",
      locale: "en-US",
      now,
    });
    const bootstrapUsers = await Promise.all([
      repository.createBootstrapUser(bootstrapInput("first@example.com")),
      repository.createBootstrapUser(bootstrapInput("second@example.com")),
    ]);
    const admin = bootstrapUsers.find((user) => user !== undefined);
    expect(bootstrapUsers.filter((user) => user !== undefined)).toHaveLength(1);
    if (!admin) throw new Error("Bootstrap did not create an administrator");

    const project = await repository.createProject({
      name: "Invitation project",
      ownerId: admin.id,
      now,
    });

    const invitation = await repository.createInvitation({
      email: "invited@example.com",
      tokenHash: "c".repeat(64),
      invitedById: admin.id,
      projectId: project.id,
      role: "editor",
      expiresAt: new Date("2026-08-25T12:00:00.000Z"),
      now,
    });
    const acceptance = {
      invitationId: invitation.id,
      displayName: "Invited",
      passwordHash: "$argon2id$test",
      locale: "en-US",
      now,
    };
    const acceptedUsers = await Promise.all([
      repository.acceptInvitationAndCreateUser(acceptance),
      repository.acceptInvitationAndCreateUser(acceptance),
    ]);
    expect(acceptedUsers.filter((user) => user !== undefined)).toHaveLength(1);
    const acceptedUser = acceptedUsers.find((user) => user !== undefined);
    if (!acceptedUser) throw new Error("Invitation was not accepted");
    await expect(
      repository.findProjectMember(project.id, acceptedUser.id),
    ).resolves.toMatchObject({ role: "editor" });
  });

  it("allows only one of multiple invitations for the same email to be accepted", async () => {
    const admin = await repository.createUser({
      email: "multiple-invites-admin@example.com",
      displayName: "Admin",
      passwordHash: "$argon2id$test",
      locale: "en-US",
      isAdmin: true,
      now,
    });
    const invitationInput = (tokenHash: string) => ({
      email: "same-invitee@example.com",
      tokenHash,
      invitedById: admin.id,
      projectId: null,
      role: null,
      expiresAt: new Date("2026-08-25T12:00:00.000Z"),
      now,
    });
    const first = await repository.createInvitation(
      invitationInput("d".repeat(64)),
    );
    const second = await repository.createInvitation(
      invitationInput("e".repeat(64)),
    );
    const acceptance = (invitationId: string) =>
      repository.acceptInvitationAndCreateUser({
        invitationId,
        displayName: "Same Invitee",
        passwordHash: "$argon2id$test",
        locale: "en-US",
        now,
      });

    const accepted = await Promise.all([
      acceptance(first.id),
      acceptance(second.id),
    ]);

    expect(accepted.filter(Boolean)).toHaveLength(1);
    expect(
      await repository.findUserByEmail("same-invitee@example.com"),
    ).toBeDefined();
  });

  it("returns stable HTTP conflicts through the real Prisma repository", async () => {
    const directory = await mkdtemp(join(tmpdir(), "blue-canvas-prisma-http-"));
    const app = buildApp({
      repository,
      passwordHasher: new ArgonPasswordHasher(),
      storage: await LocalAssetStorage.create(directory),
      setupSecret: "integration setup secret",
      production: false,
      now: () => now,
    });
    try {
      const bootstrap = await app.inject({
        method: "POST",
        url: "/api/v1/auth/bootstrap-admin",
        payload: {
          email: "http-admin@example.com",
          displayName: "HTTP Admin",
          password: "correct horse battery staple",
          setupSecret: "integration setup secret",
        },
      });
      expect(bootstrap.statusCode).toBe(201);
      const cookieHeader = bootstrap.headers["set-cookie"];
      const cookie = (
        Array.isArray(cookieHeader) ? cookieHeader[0] : cookieHeader
      )?.split(";", 1)[0];
      if (!cookie) throw new Error("Bootstrap cookie missing");
      const headers = {
        cookie,
        "x-csrf-token": bootstrap.json().csrfToken as string,
      };
      const projectResponse = await app.inject({
        method: "POST",
        url: "/api/v1/projects",
        headers,
        payload: { name: "HTTP conflicts" },
      });
      const projectId = projectResponse.json().project.id as string;
      await repository.createUser({
        email: "http-member@example.com",
        displayName: "HTTP Member",
        passwordHash: "$argon2id$test",
        locale: "en-US",
        isAdmin: false,
        now,
      });
      const memberRequest = {
        method: "POST" as const,
        url: `/api/v1/projects/${projectId}/members`,
        headers,
        payload: { email: "http-member@example.com", role: "viewer" },
      };
      expect((await app.inject(memberRequest)).statusCode).toBe(201);
      const duplicateMember = await app.inject(memberRequest);
      expect(duplicateMember.statusCode).toBe(409);
      expect(duplicateMember.json().error.code).toBe("member_exists");

      const invitationRequest = {
        method: "POST" as const,
        url: "/api/v1/invitations",
        headers,
        payload: { email: "http-race@example.com" },
      };
      const [firstInvitation, secondInvitation] = await Promise.all([
        app.inject(invitationRequest),
        app.inject(invitationRequest),
      ]);
      const accept = (token: string) =>
        app.inject({
          method: "POST",
          url: "/api/v1/auth/invitations/accept",
          payload: {
            token,
            displayName: "HTTP Race",
            password: "correct horse battery staple",
          },
        });
      const accepted = await Promise.all([
        accept(firstInvitation.json().token as string),
        accept(secondInvitation.json().token as string),
      ]);
      expect(accepted.map((response) => response.statusCode).sort()).toEqual([
        201, 410,
      ]);
    } finally {
      await app.close();
      await rm(directory, { recursive: true, force: true });
    }
  });
});
