import { randomUUID } from "node:crypto";

import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import {
  personalAccessTokenScopeSchema,
  type PersonalAccessTokenScope,
} from "@blue-canvas/contracts";
import { z } from "zod";

import type {
  Asset,
  AuditEvent,
  Invitation,
  PersonalAccessToken,
  Project,
  ProjectMember,
  RepositoryPort,
  Session,
  User,
} from "./domain.js";
import {
  Prisma,
  PrismaClient,
  type AuditEvent as PrismaAuditEvent,
  type PersonalAccessToken as PrismaPersonalAccessToken,
} from "./generated/prisma/client.js";

export interface DatabaseConnectionConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
}

export function createPrismaClient(
  config: DatabaseConnectionConfig,
): PrismaClient {
  const adapter = new PrismaMariaDb({
    ...config,
    connectionLimit: 10,
    connectTimeout: 10_000,
    acquireTimeout: 10_000,
  });
  return new PrismaClient({ adapter });
}

const scopesSchema = z.array(personalAccessTokenScopeSchema);
const metadataSchema = z.record(z.string(), z.unknown());

function personalAccessToken(
  value: PrismaPersonalAccessToken,
): PersonalAccessToken {
  return { ...value, scopes: scopesSchema.parse(value.scopes) };
}

function auditEvent(value: PrismaAuditEvent): AuditEvent {
  return { ...value, metadata: metadataSchema.parse(value.metadata) };
}

export class PrismaRepository implements RepositoryPort {
  constructor(readonly client: PrismaClient) {}

  async isReady(): Promise<boolean> {
    await this.client.$queryRaw`SELECT 1`;
    return true;
  }

  async countUsers(): Promise<number> {
    return this.client.user.count();
  }

  async createBootstrapUser(
    input: Parameters<RepositoryPort["createBootstrapUser"]>[0],
  ): Promise<User | undefined> {
    return this.client.$transaction(async (transaction) => {
      await transaction.$queryRaw`SELECT name FROM system_locks WHERE name = 'bootstrap' FOR UPDATE`;
      const rows = await transaction.$queryRaw<{ count: bigint | number }[]>`
        SELECT COUNT(*) AS count FROM users FOR UPDATE
      `;
      if (Number(rows[0]?.count) !== 0) return undefined;
      return transaction.user.create({
        data: {
          id: randomUUID(),
          email: input.email,
          displayName: input.displayName,
          passwordHash: input.passwordHash,
          status: "active",
          locale: input.locale,
          isAdmin: true,
          createdAt: input.now,
          updatedAt: input.now,
        },
      });
    });
  }

  async createUser(
    input: Parameters<RepositoryPort["createUser"]>[0],
  ): Promise<User> {
    return this.client.user.create({
      data: {
        id: randomUUID(),
        email: input.email,
        displayName: input.displayName,
        passwordHash: input.passwordHash,
        status: "active",
        locale: input.locale,
        isAdmin: input.isAdmin,
        createdAt: input.now,
        updatedAt: input.now,
      },
    });
  }

  async findUserByEmail(email: string): Promise<User | undefined> {
    return (
      (await this.client.user.findUnique({ where: { email } })) ?? undefined
    );
  }

  async findUserById(id: string): Promise<User | undefined> {
    return (await this.client.user.findUnique({ where: { id } })) ?? undefined;
  }

  async createSession(
    input: Parameters<RepositoryPort["createSession"]>[0],
  ): Promise<Session> {
    return this.client.session.create({
      data: {
        id: randomUUID(),
        userId: input.userId,
        tokenHash: input.tokenHash,
        csrfHash: input.csrfHash,
        expiresAt: input.expiresAt,
        revokedAt: null,
        lastSeenAt: input.now,
        createdAt: input.now,
      },
    });
  }

  async findSessionByTokenHash(
    tokenHash: string,
  ): Promise<Session | undefined> {
    return (
      (await this.client.session.findUnique({ where: { tokenHash } })) ??
      undefined
    );
  }

  async touchSession(id: string, now: Date): Promise<void> {
    await this.client.session.update({
      where: { id },
      data: { lastSeenAt: now },
    });
  }

  async revokeSession(id: string, now: Date): Promise<void> {
    await this.client.session.update({
      where: { id },
      data: { revokedAt: now },
    });
  }

  async createInvitation(
    input: Parameters<RepositoryPort["createInvitation"]>[0],
  ): Promise<Invitation> {
    return this.client.invitation.create({
      data: {
        id: randomUUID(),
        email: input.email,
        tokenHash: input.tokenHash,
        invitedById: input.invitedById,
        projectId: input.projectId,
        role: input.role,
        expiresAt: input.expiresAt,
        acceptedAt: null,
        createdAt: input.now,
      },
    });
  }

  async findInvitationByTokenHash(
    tokenHash: string,
  ): Promise<Invitation | undefined> {
    return (
      (await this.client.invitation.findUnique({ where: { tokenHash } })) ??
      undefined
    );
  }

  async markInvitationAccepted(id: string, now: Date): Promise<boolean> {
    const result = await this.client.invitation.updateMany({
      where: { id, acceptedAt: null },
      data: { acceptedAt: now },
    });
    return result.count === 1;
  }

  async acceptInvitationAndCreateUser(
    input: Parameters<RepositoryPort["acceptInvitationAndCreateUser"]>[0],
  ): Promise<User | undefined> {
    return this.client.$transaction(async (transaction) => {
      const rows = await transaction.$queryRaw<
        {
          id: string;
          email: string;
          acceptedAt: Date | null;
          expiresAt: Date;
          projectId: string | null;
          role: ProjectMember["role"] | null;
        }[]
      >`
        SELECT id, email, acceptedAt, expiresAt, projectId, role
        FROM invitations
        WHERE id = ${input.invitationId}
        FOR UPDATE
      `;
      const invitation = rows[0];
      if (
        !invitation ||
        invitation.acceptedAt !== null ||
        invitation.expiresAt <= input.now
      ) {
        return undefined;
      }
      await transaction.invitation.update({
        where: { id: invitation.id },
        data: { acceptedAt: input.now },
      });
      const user = await transaction.user.create({
        data: {
          id: randomUUID(),
          email: invitation.email,
          displayName: input.displayName,
          passwordHash: input.passwordHash,
          status: "active",
          locale: input.locale,
          isAdmin: false,
          createdAt: input.now,
          updatedAt: input.now,
        },
      });
      if (invitation.projectId && invitation.role) {
        await transaction.projectMember.create({
          data: {
            id: randomUUID(),
            projectId: invitation.projectId,
            userId: user.id,
            role: invitation.role,
            createdAt: input.now,
            updatedAt: input.now,
          },
        });
      }
      return user;
    });
  }

  async createProject(
    input: Parameters<RepositoryPort["createProject"]>[0],
  ): Promise<Project> {
    return this.client.$transaction(async (transaction) => {
      const project = await transaction.project.create({
        data: {
          id: randomUUID(),
          name: input.name,
          ownerId: input.ownerId,
          archivedAt: null,
          createdAt: input.now,
          updatedAt: input.now,
        },
      });
      await transaction.projectMember.create({
        data: {
          id: randomUUID(),
          projectId: project.id,
          userId: input.ownerId,
          role: "owner",
          createdAt: input.now,
          updatedAt: input.now,
        },
      });
      return project;
    });
  }

  async findProjectById(id: string): Promise<Project | undefined> {
    return (
      (await this.client.project.findUnique({ where: { id } })) ?? undefined
    );
  }

  async listProjectsForUser(userId: string): Promise<Project[]> {
    return this.client.project.findMany({
      where: { members: { some: { userId } } },
      orderBy: { updatedAt: "desc" },
    });
  }

  async updateProject(
    id: string,
    input: Parameters<RepositoryPort["updateProject"]>[1],
  ): Promise<Project> {
    const data: Prisma.ProjectUpdateInput = { updatedAt: input.now };
    if (input.name !== undefined) data.name = input.name;
    if (input.archivedAt !== undefined) data.archivedAt = input.archivedAt;
    return this.client.project.update({ where: { id }, data });
  }

  async findProjectMember(
    projectId: string,
    userId: string,
  ): Promise<ProjectMember | undefined> {
    return (
      (await this.client.projectMember.findUnique({
        where: { projectId_userId: { projectId, userId } },
      })) ?? undefined
    );
  }

  async addProjectMember(
    input: Parameters<RepositoryPort["addProjectMember"]>[0],
  ): Promise<ProjectMember> {
    return this.client.projectMember.create({
      data: {
        id: randomUUID(),
        projectId: input.projectId,
        userId: input.userId,
        role: input.role,
        createdAt: input.now,
        updatedAt: input.now,
      },
    });
  }

  async updateProjectMember(
    projectId: string,
    userId: string,
    role: ProjectMember["role"],
    now: Date,
  ): Promise<ProjectMember | undefined> {
    const result = await this.client.projectMember.updateMany({
      where: { projectId, userId },
      data: { role, updatedAt: now },
    });
    if (result.count === 0) return undefined;
    return this.findProjectMember(projectId, userId);
  }

  async removeProjectMember(
    projectId: string,
    userId: string,
  ): Promise<boolean> {
    const result = await this.client.projectMember.deleteMany({
      where: { projectId, userId },
    });
    return result.count === 1;
  }

  async createPersonalAccessToken(
    input: Parameters<RepositoryPort["createPersonalAccessToken"]>[0],
  ): Promise<PersonalAccessToken> {
    const value = await this.client.personalAccessToken.create({
      data: {
        id: randomUUID(),
        userId: input.userId,
        name: input.name,
        tokenHash: input.tokenHash,
        scopes: input.scopes,
        expiresAt: input.expiresAt,
        revokedAt: null,
        lastUsedAt: null,
        createdAt: input.now,
      },
    });
    return personalAccessToken(value);
  }

  async findPersonalAccessTokenByHash(
    tokenHash: string,
  ): Promise<PersonalAccessToken | undefined> {
    const value = await this.client.personalAccessToken.findUnique({
      where: { tokenHash },
    });
    return value ? personalAccessToken(value) : undefined;
  }

  async listPersonalAccessTokens(
    userId: string,
  ): Promise<PersonalAccessToken[]> {
    return (
      await this.client.personalAccessToken.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
      })
    ).map(personalAccessToken);
  }

  async touchPersonalAccessToken(id: string, now: Date): Promise<void> {
    await this.client.personalAccessToken.update({
      where: { id },
      data: { lastUsedAt: now },
    });
  }

  async revokePersonalAccessToken(
    id: string,
    userId: string,
    now: Date,
  ): Promise<boolean> {
    const result = await this.client.personalAccessToken.updateMany({
      where: { id, userId },
      data: { revokedAt: now },
    });
    return result.count === 1;
  }

  async createAuditEvent(
    input: Parameters<RepositoryPort["createAuditEvent"]>[0],
  ): Promise<AuditEvent> {
    const value = await this.client.auditEvent.create({
      data: {
        id: randomUUID(),
        actorId: input.actorId,
        action: input.action,
        targetType: input.targetType,
        targetId: input.targetId,
        projectId: input.projectId,
        traceId: input.traceId,
        metadata: input.metadata as Prisma.InputJsonObject,
        createdAt: input.now,
      },
    });
    return auditEvent(value);
  }

  async listAuditEvents(input: {
    projectId?: string;
    limit: number;
  }): Promise<AuditEvent[]> {
    const query: Prisma.AuditEventFindManyArgs = {
      orderBy: { createdAt: "desc" },
      take: input.limit,
    };
    if (input.projectId !== undefined)
      query.where = { projectId: input.projectId };
    return (await this.client.auditEvent.findMany(query)).map(auditEvent);
  }

  async createAsset(
    input: Parameters<RepositoryPort["createAsset"]>[0],
  ): Promise<Asset> {
    return this.client.asset.create({
      data: {
        id: randomUUID(),
        projectId: input.projectId,
        uploadedById: input.uploadedById,
        sha256: input.sha256,
        originalName: input.originalName,
        mediaType: input.mediaType,
        size: input.size,
        storageKey: input.storageKey,
        createdAt: input.now,
      },
    });
  }
}

export function parseScopes(value: unknown): PersonalAccessTokenScope[] {
  return scopesSchema.parse(value);
}
