import { randomUUID } from "node:crypto";

import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import {
  personalAccessTokenScopeSchema,
  type PersonalAccessTokenScope,
} from "@blue-canvas/contracts";
import { z } from "zod";
import {
  parseKitManifest,
  parseTemplateManifest,
  type KitRecord,
  type TemplateRecord,
} from "@blue-canvas/library";

import type {
  Asset,
  AuditEvent,
  Invitation,
  PersonalAccessToken,
  Project,
  ProjectComment,
  ProjectTemplate,
  StoredKitRecord,
  StoredTemplateRecord,
  ProjectDocument,
  CommandReceipt,
  ProjectMember,
  Team,
  TeamMember,
  NamedVersion,
  RepositoryPort,
  Session,
  User,
} from "./domain.js";
import { ApiError } from "./core.js";
import {
  Prisma,
  PrismaClient,
  type Asset as PrismaAsset,
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

function asset(value: PrismaAsset): Asset {
  return { ...value, status: z.enum(["pending", "ready"]).parse(value.status) };
}

function projectDocument(value: {
  projectId: string;
  state: Uint8Array;
  stateVector: Uint8Array;
  revision: number;
  updatedAt: Date;
}): ProjectDocument {
  return {
    ...value,
    state: new Uint8Array(value.state),
    stateVector: new Uint8Array(value.stateVector),
  };
}

function commandReceipt(value: {
  id: string;
  projectId: string;
  idempotencyKey: string;
  fingerprint: string;
  revision: number;
  document: unknown;
  createdAt: Date;
}): CommandReceipt {
  return { ...value };
}

function prismaBytes(value: Uint8Array): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(value);
}

function namedVersion(value: {
  id: string;
  projectId: string;
  actorId: string;
  name: string;
  state: Uint8Array;
  stateVector: Uint8Array;
  revision: number;
  restoredFromId: string | null;
  createdAt: Date;
}): NamedVersion {
  return {
    ...value,
    state: new Uint8Array(value.state),
    stateVector: new Uint8Array(value.stateVector),
  };
}

function projectComment(value: {
  id: string;
  projectId: string;
  authorId: string;
  body: string;
  nodeId: string | null;
  positionX: number | null;
  positionY: number | null;
  resolvedAt: Date | null;
  resolvedById: string | null;
  createdAt: Date;
  updatedAt: Date;
  mentions: { userId: string }[];
}): ProjectComment {
  return {
    ...value,
    mentionUserIds: value.mentions.map(({ userId }) => userId).sort(),
  };
}

function storedKit(value: {
  manifest: unknown;
  status: string;
  authorId: string;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): StoredKitRecord {
  return {
    manifest: parseKitManifest(value.manifest),
    status: z.enum(["draft", "published", "deprecated"]).parse(value.status),
    authorId: value.authorId,
    ...(value.publishedAt
      ? { publishedAt: value.publishedAt.toISOString() }
      : {}),
    createdAt: value.createdAt.toISOString(),
    updatedAt: value.updatedAt.toISOString(),
  };
}

function storedTemplate(value: {
  manifest: unknown;
  status: string;
  authorId: string;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): StoredTemplateRecord {
  return {
    manifest: parseTemplateManifest(value.manifest),
    status: z.enum(["draft", "published", "deprecated"]).parse(value.status),
    authorId: value.authorId,
    ...(value.publishedAt
      ? { publishedAt: value.publishedAt.toISOString() }
      : {}),
    createdAt: value.createdAt.toISOString(),
    updatedAt: value.updatedAt.toISOString(),
  };
}

function isPrismaError(error: unknown, code: string): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError && error.code === code
  );
}

export class PrismaRepository implements RepositoryPort {
  constructor(
    readonly client: PrismaClient | Prisma.TransactionClient,
    private readonly inTransaction = false,
  ) {}

  async transaction<T>(
    operation: (repository: RepositoryPort) => Promise<T>,
  ): Promise<T> {
    if (this.inTransaction) return operation(this);
    return (this.client as PrismaClient).$transaction((transaction) =>
      operation(new PrismaRepository(transaction, true)),
    );
  }

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
    return this.withinTransaction(async (transaction) => {
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
    try {
      return await this.client.user.create({
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
    } catch (error) {
      if (isPrismaError(error, "P2002")) {
        throw new ApiError("email_exists", "Email is already registered", 409);
      }
      throw error;
    }
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

  async updateSessionCsrf(
    id: string,
    csrfHash: string,
    now: Date,
  ): Promise<void> {
    await this.client.session.update({
      where: { id },
      data: { csrfHash, lastSeenAt: now },
    });
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
    return this.withinTransaction(async (transaction) => {
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
      let user: User;
      try {
        user = await transaction.user.create({
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
      } catch (error) {
        if (!isPrismaError(error, "P2002")) throw error;
        await transaction.invitation.update({
          where: { id: invitation.id },
          data: { acceptedAt: null },
        });
        return undefined;
      }
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
    return this.withinTransaction(async (transaction) => {
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

  async createProjectTemplate(
    input: Parameters<RepositoryPort["createProjectTemplate"]>[0],
  ): Promise<ProjectTemplate> {
    const value = await this.client.projectTemplate.create({
      data: {
        id: randomUUID(),
        ownerId: input.ownerId,
        sourceProjectId: input.sourceProjectId,
        name: input.name,
        description: input.description,
        document: input.document as Prisma.InputJsonValue,
        createdAt: input.now,
        updatedAt: input.now,
      },
    });
    return value;
  }

  async listProjectTemplatesForUser(
    userId: string,
  ): Promise<ProjectTemplate[]> {
    return this.client.projectTemplate.findMany({
      where: { ownerId: userId },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    });
  }

  async findProjectTemplateById(
    id: string,
  ): Promise<ProjectTemplate | undefined> {
    return (
      (await this.client.projectTemplate.findUnique({ where: { id } })) ??
      undefined
    );
  }

  async createLibraryKit(record: KitRecord): Promise<KitRecord> {
    const value = await this.client.libraryKit.create({
      data: {
        id: record.manifest.id,
        manifest: record.manifest as unknown as Prisma.InputJsonValue,
        status: record.status,
        authorId: record.authorId,
        publishedAt: record.publishedAt ? new Date(record.publishedAt) : null,
        createdAt: new Date(record.createdAt),
        updatedAt: new Date(record.updatedAt),
      },
    });
    return storedKit(value);
  }

  async upsertLibraryKit(record: KitRecord): Promise<KitRecord> {
    const value = await this.client.libraryKit.upsert({
      where: { id: record.manifest.id },
      create: {
        id: record.manifest.id,
        manifest: record.manifest as unknown as Prisma.InputJsonValue,
        status: record.status,
        authorId: record.authorId,
        publishedAt: record.publishedAt ? new Date(record.publishedAt) : null,
        createdAt: new Date(record.createdAt),
        updatedAt: new Date(record.updatedAt),
      },
      update: {
        manifest: record.manifest as unknown as Prisma.InputJsonValue,
        status: record.status,
        authorId: record.authorId,
        publishedAt: record.publishedAt ? new Date(record.publishedAt) : null,
        updatedAt: new Date(record.updatedAt),
      },
    });
    return storedKit(value);
  }

  async listLibraryKits(): Promise<KitRecord[]> {
    return (
      await this.client.libraryKit.findMany({
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      })
    ).map(storedKit);
  }

  async updateLibraryKit(record: KitRecord): Promise<KitRecord | undefined> {
    const result = await this.client.libraryKit.updateMany({
      where: { id: record.manifest.id },
      data: {
        manifest: record.manifest as unknown as Prisma.InputJsonValue,
        status: record.status,
        authorId: record.authorId,
        publishedAt: record.publishedAt ? new Date(record.publishedAt) : null,
        createdAt: new Date(record.createdAt),
        updatedAt: new Date(record.updatedAt),
      },
    });
    if (result.count !== 1) return undefined;
    return storedKit(
      await this.client.libraryKit.findUniqueOrThrow({
        where: { id: record.manifest.id },
      }),
    );
  }

  async deleteLibraryKit(id: string): Promise<boolean> {
    const result = await this.client.libraryKit.deleteMany({ where: { id } });
    return result.count === 1;
  }

  async createLibraryTemplate(record: TemplateRecord): Promise<TemplateRecord> {
    const value = await this.client.libraryTemplate.create({
      data: {
        id: record.manifest.id,
        manifest: record.manifest as unknown as Prisma.InputJsonValue,
        status: record.status,
        authorId: record.authorId,
        publishedAt: record.publishedAt ? new Date(record.publishedAt) : null,
        createdAt: new Date(record.createdAt),
        updatedAt: new Date(record.updatedAt),
      },
    });
    return storedTemplate(value);
  }

  async upsertLibraryTemplate(record: TemplateRecord): Promise<TemplateRecord> {
    const value = await this.client.libraryTemplate.upsert({
      where: { id: record.manifest.id },
      create: {
        id: record.manifest.id,
        manifest: record.manifest as unknown as Prisma.InputJsonValue,
        status: record.status,
        authorId: record.authorId,
        publishedAt: record.publishedAt ? new Date(record.publishedAt) : null,
        createdAt: new Date(record.createdAt),
        updatedAt: new Date(record.updatedAt),
      },
      update: {
        manifest: record.manifest as unknown as Prisma.InputJsonValue,
        status: record.status,
        authorId: record.authorId,
        publishedAt: record.publishedAt ? new Date(record.publishedAt) : null,
        updatedAt: new Date(record.updatedAt),
      },
    });
    return storedTemplate(value);
  }

  async listLibraryTemplates(): Promise<TemplateRecord[]> {
    return (
      await this.client.libraryTemplate.findMany({
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      })
    ).map(storedTemplate);
  }

  async updateLibraryTemplate(
    record: TemplateRecord,
  ): Promise<TemplateRecord | undefined> {
    const result = await this.client.libraryTemplate.updateMany({
      where: { id: record.manifest.id },
      data: {
        manifest: record.manifest as unknown as Prisma.InputJsonValue,
        status: record.status,
        authorId: record.authorId,
        publishedAt: record.publishedAt ? new Date(record.publishedAt) : null,
        createdAt: new Date(record.createdAt),
        updatedAt: new Date(record.updatedAt),
      },
    });
    if (result.count !== 1) return undefined;
    return storedTemplate(
      await this.client.libraryTemplate.findUniqueOrThrow({
        where: { id: record.manifest.id },
      }),
    );
  }

  async deleteLibraryTemplate(id: string): Promise<boolean> {
    const result = await this.client.libraryTemplate.deleteMany({
      where: { id },
    });
    return result.count === 1;
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

  async lockProjectForWrite(
    projectId: string,
    userId: string,
  ): Promise<ProjectMember | undefined> {
    const members = await this.client.$queryRaw<
      Array<{
        id: string;
        projectId: string;
        userId: string;
        role: ProjectMember["role"];
        createdAt: Date;
        updatedAt: Date;
      }>
    >`
      SELECT id
        , projectId
        , userId
        , role
        , createdAt
        , updatedAt
      FROM project_members
      WHERE projectId = ${projectId} AND userId = ${userId}
      FOR UPDATE`;
    return members[0];
  }

  async addProjectMember(
    input: Parameters<RepositoryPort["addProjectMember"]>[0],
  ): Promise<ProjectMember> {
    try {
      return await this.client.projectMember.create({
        data: {
          id: randomUUID(),
          projectId: input.projectId,
          userId: input.userId,
          role: input.role,
          createdAt: input.now,
          updatedAt: input.now,
        },
      });
    } catch (error) {
      if (isPrismaError(error, "P2002")) {
        throw new ApiError("member_exists", "User is already a member", 409);
      }
      throw error;
    }
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

  async createTeam(
    input: Parameters<RepositoryPort["createTeam"]>[0],
  ): Promise<Team> {
    return this.withinTransaction(async (transaction) => {
      const team = await transaction.team.create({
        data: {
          id: randomUUID(),
          name: input.name,
          ownerId: input.ownerId,
          createdAt: input.now,
          updatedAt: input.now,
        },
      });
      await transaction.teamMember.create({
        data: {
          id: randomUUID(),
          teamId: team.id,
          userId: input.ownerId,
          role: "owner",
          createdAt: input.now,
          updatedAt: input.now,
        },
      });
      return team;
    });
  }

  async listTeamsForUser(userId: string): Promise<Team[]> {
    return this.client.team.findMany({
      where: { members: { some: { userId } } },
      orderBy: { updatedAt: "desc" },
    });
  }

  async findTeamById(id: string): Promise<Team | undefined> {
    return (await this.client.team.findUnique({ where: { id } })) ?? undefined;
  }

  async findTeamMember(
    teamId: string,
    userId: string,
  ): Promise<TeamMember | undefined> {
    return (
      (await this.client.teamMember.findUnique({
        where: { teamId_userId: { teamId, userId } },
      })) ?? undefined
    );
  }

  async listTeamMembers(teamId: string): Promise<TeamMember[]> {
    return this.client.teamMember.findMany({ where: { teamId } });
  }

  async addTeamMember(
    input: Parameters<RepositoryPort["addTeamMember"]>[0],
  ): Promise<TeamMember> {
    try {
      const member = await this.client.teamMember.create({
        data: {
          id: randomUUID(),
          teamId: input.teamId,
          userId: input.userId,
          role: input.role,
          createdAt: input.now,
          updatedAt: input.now,
        },
      });
      await this.client.team.update({
        where: { id: input.teamId },
        data: { updatedAt: input.now },
      });
      return member;
    } catch (error) {
      if (isPrismaError(error, "P2002")) {
        throw new ApiError(
          "team_member_exists",
          "User is already a team member",
          409,
        );
      }
      throw error;
    }
  }

  async updateTeamMember(
    teamId: string,
    userId: string,
    role: TeamMember["role"],
    now: Date,
  ): Promise<TeamMember | undefined> {
    const result = await this.client.teamMember.updateMany({
      where: { teamId, userId },
      data: { role, updatedAt: now },
    });
    if (result.count === 0) return undefined;
    await this.client.team.update({
      where: { id: teamId },
      data: { updatedAt: now },
    });
    return this.findTeamMember(teamId, userId);
  }

  async removeTeamMember(
    teamId: string,
    userId: string,
    now: Date,
  ): Promise<boolean> {
    const result = await this.client.teamMember.deleteMany({
      where: { teamId, userId },
    });
    if (result.count === 1) {
      await this.client.team.update({
        where: { id: teamId },
        data: { updatedAt: now },
      });
    }
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
    return asset(
      await this.client.asset.create({
        data: {
          id: randomUUID(),
          projectId: input.projectId,
          uploadedById: input.uploadedById,
          sha256: input.sha256,
          originalName: input.originalName,
          mediaType: input.mediaType,
          size: input.size,
          storageKey: input.storageKey,
          status: input.status,
          createdAt: input.now,
        },
      }),
    );
  }

  async listPendingAssets(createdBefore: Date): Promise<Asset[]> {
    return (
      await this.client.asset.findMany({
        where: { status: "pending", createdAt: { lte: createdBefore } },
        orderBy: { createdAt: "asc" },
      })
    ).map(asset);
  }

  async markAssetReady(id: string): Promise<Asset | undefined> {
    const result = await this.client.asset.updateMany({
      where: { id, status: "pending" },
      data: { status: "ready" },
    });
    if (result.count === 0) return undefined;
    const value = await this.client.asset.findUnique({ where: { id } });
    return value ? asset(value) : undefined;
  }

  async removePendingAsset(id: string): Promise<boolean> {
    const result = await this.client.asset.deleteMany({
      where: { id, status: "pending" },
    });
    return result.count === 1;
  }

  async findProjectDocument(
    projectId: string,
  ): Promise<ProjectDocument | undefined> {
    const value = await this.client.projectDocument.findUnique({
      where: { projectId },
    });
    return value ? projectDocument(value) : undefined;
  }

  async upsertProjectDocument(
    input: Parameters<RepositoryPort["upsertProjectDocument"]>[0],
  ): Promise<ProjectDocument> {
    if (input.expectedRevision === 0) {
      try {
        return projectDocument(
          await this.client.projectDocument.create({
            data: {
              projectId: input.projectId,
              state: prismaBytes(input.state),
              stateVector: prismaBytes(input.stateVector),
              revision: 1,
              updatedAt: input.now,
            },
          }),
        );
      } catch (error) {
        if (isPrismaError(error, "P2002"))
          throw new ApiError(
            "revision_conflict",
            "Document revision changed",
            409,
          );
        throw error;
      }
    }
    if (input.expectedRevision !== undefined) {
      const result = await this.client.projectDocument.updateMany({
        where: {
          projectId: input.projectId,
          revision: input.expectedRevision,
        },
        data: {
          state: prismaBytes(input.state),
          stateVector: prismaBytes(input.stateVector),
          revision: { increment: 1 },
          updatedAt: input.now,
        },
      });
      if (result.count !== 1)
        throw new ApiError(
          "revision_conflict",
          "Document revision changed",
          409,
        );
      const value = await this.client.projectDocument.findUniqueOrThrow({
        where: { projectId: input.projectId },
      });
      return projectDocument(value);
    }
    const value = await this.client.projectDocument.upsert({
      where: { projectId: input.projectId },
      create: {
        projectId: input.projectId,
        state: prismaBytes(input.state),
        stateVector: prismaBytes(input.stateVector),
        revision: 1,
        updatedAt: input.now,
      },
      update: {
        state: prismaBytes(input.state),
        stateVector: prismaBytes(input.stateVector),
        revision: { increment: 1 },
        updatedAt: input.now,
      },
    });
    return projectDocument(value);
  }

  async findCommandReceipt(
    projectId: string,
    idempotencyKey: string,
  ): Promise<CommandReceipt | undefined> {
    const value = await this.client.commandReceipt.findUnique({
      where: { projectId_idempotencyKey: { projectId, idempotencyKey } },
    });
    return value ? commandReceipt(value) : undefined;
  }

  async createCommandReceipt(
    input: Omit<CommandReceipt, "id">,
  ): Promise<CommandReceipt> {
    try {
      const value = await this.client.commandReceipt.create({
        data: {
          id: randomUUID(),
          projectId: input.projectId,
          idempotencyKey: input.idempotencyKey,
          fingerprint: input.fingerprint,
          revision: input.revision,
          document: input.document as Prisma.InputJsonValue,
          createdAt: input.createdAt,
        },
      });
      return commandReceipt(value);
    } catch (error) {
      if (isPrismaError(error, "P2002")) {
        throw new ApiError(
          "idempotency_conflict",
          "Idempotency key already exists",
          409,
        );
      }
      throw error;
    }
  }

  async updateCommandReceipt(input: {
    projectId: string;
    idempotencyKey: string;
    revision: number;
    document: unknown;
  }): Promise<CommandReceipt | undefined> {
    const result = await this.client.commandReceipt.updateMany({
      where: {
        projectId: input.projectId,
        idempotencyKey: input.idempotencyKey,
      },
      data: {
        revision: input.revision,
        document: input.document as Prisma.InputJsonValue,
      },
    });
    if (result.count !== 1) return undefined;
    const value = await this.client.commandReceipt.findUniqueOrThrow({
      where: {
        projectId_idempotencyKey: {
          projectId: input.projectId,
          idempotencyKey: input.idempotencyKey,
        },
      },
    });
    return commandReceipt(value);
  }

  async createNamedVersion(
    input: Parameters<RepositoryPort["createNamedVersion"]>[0],
  ): Promise<NamedVersion> {
    return namedVersion(
      await this.client.namedVersion.create({
        data: {
          id: randomUUID(),
          projectId: input.projectId,
          actorId: input.actorId,
          name: input.name,
          state: prismaBytes(input.state),
          stateVector: prismaBytes(input.stateVector),
          revision: input.revision,
          restoredFromId: input.restoredFromId,
          createdAt: input.now,
        },
      }),
    );
  }

  async listNamedVersions(projectId: string): Promise<NamedVersion[]> {
    return (
      await this.client.namedVersion.findMany({
        where: { projectId },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      })
    ).map(namedVersion);
  }

  async findNamedVersion(
    projectId: string,
    versionId: string,
  ): Promise<NamedVersion | undefined> {
    const value = await this.client.namedVersion.findFirst({
      where: { id: versionId, projectId },
    });
    return value ? namedVersion(value) : undefined;
  }

  async findProjectMembers(projectId: string): Promise<ProjectMember[]> {
    return this.client.projectMember.findMany({ where: { projectId } });
  }

  async createComment(
    input: Parameters<RepositoryPort["createComment"]>[0],
  ): Promise<ProjectComment> {
    return projectComment(
      await this.client.projectComment.create({
        data: {
          id: randomUUID(),
          projectId: input.projectId,
          authorId: input.authorId,
          body: input.body,
          nodeId: input.nodeId,
          positionX: input.positionX,
          positionY: input.positionY,
          resolvedAt: input.resolvedAt,
          resolvedById: input.resolvedById,
          createdAt: input.now,
          updatedAt: input.now,
          mentions: {
            create: input.mentionUserIds.map((userId) => ({ userId })),
          },
        },
        include: { mentions: true },
      }),
    );
  }

  async listComments(projectId: string): Promise<ProjectComment[]> {
    return (
      await this.client.projectComment.findMany({
        where: { projectId },
        include: { mentions: true },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      })
    ).map(projectComment);
  }

  async findComment(
    projectId: string,
    commentId: string,
  ): Promise<ProjectComment | undefined> {
    const value = await this.client.projectComment.findFirst({
      where: { id: commentId, projectId },
      include: { mentions: true },
    });
    return value ? projectComment(value) : undefined;
  }

  async updateComment(
    projectId: string,
    commentId: string,
    input: Parameters<RepositoryPort["updateComment"]>[2],
  ): Promise<ProjectComment | undefined> {
    return this.withinTransaction(async (transaction) => {
      const exists = await transaction.projectComment.findFirst({
        where: { id: commentId, projectId },
        select: { id: true },
      });
      if (!exists) return undefined;
      if (input.mentionUserIds !== undefined) {
        await transaction.commentMention.deleteMany({ where: { commentId } });
        if (input.mentionUserIds.length > 0) {
          await transaction.commentMention.createMany({
            data: input.mentionUserIds.map((userId) => ({ commentId, userId })),
          });
        }
      }
      const value = await transaction.projectComment.update({
        where: { id: commentId },
        data: {
          ...(input.body === undefined ? {} : { body: input.body }),
          updatedAt: input.now,
        },
        include: { mentions: true },
      });
      return projectComment(value);
    });
  }

  async resolveComment(
    projectId: string,
    commentId: string,
    input: Parameters<RepositoryPort["resolveComment"]>[2],
  ): Promise<ProjectComment | undefined> {
    const result = await this.client.projectComment.updateMany({
      where: { id: commentId, projectId },
      data: {
        resolvedAt: input.resolvedAt,
        resolvedById: input.resolvedById,
        updatedAt: input.now,
      },
    });
    if (result.count !== 1) return undefined;
    return this.findComment(projectId, commentId);
  }

  private async withinTransaction<T>(
    operation: (transaction: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    if (this.inTransaction) {
      return operation(this.client as Prisma.TransactionClient);
    }
    return (this.client as PrismaClient).$transaction(operation);
  }
}

export function parseScopes(value: unknown): PersonalAccessTokenScope[] {
  return scopesSchema.parse(value);
}
