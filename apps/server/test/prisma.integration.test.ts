import { afterAll, beforeEach, describe, expect, it } from "vitest";

import {
  createPrismaClient,
  PrismaRepository,
} from "../src/prisma-repository.js";

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
      size: 9,
      storageKey: `bb/${"b".repeat(64)}`,
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

  it("enforces normalized-email and project-member uniqueness in MariaDB", async () => {
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
    ).rejects.toThrow();
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
    ).rejects.toThrow();
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
});
