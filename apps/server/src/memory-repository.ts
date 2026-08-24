import { randomUUID } from "node:crypto";

import { ApiError } from "./core.js";
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

export class InMemoryRepository implements RepositoryPort {
  private readonly users = new Map<string, User>();
  private readonly sessions = new Map<string, Session>();
  private readonly invitations = new Map<string, Invitation>();
  private readonly projects = new Map<string, Project>();
  private readonly members = new Map<string, ProjectMember>();
  private readonly personalAccessTokens = new Map<
    string,
    PersonalAccessToken
  >();
  private readonly auditEvents = new Map<string, AuditEvent>();
  private readonly assets = new Map<string, Asset>();

  async isReady(): Promise<boolean> {
    return true;
  }

  async countUsers(): Promise<number> {
    return this.users.size;
  }

  async createBootstrapUser(
    input: Parameters<RepositoryPort["createBootstrapUser"]>[0],
  ): Promise<User | undefined> {
    if (this.users.size !== 0) return undefined;
    return this.insertUser({ ...input, isAdmin: true });
  }

  async createUser(
    input: Parameters<RepositoryPort["createUser"]>[0],
  ): Promise<User> {
    return this.insertUser(input);
  }

  async findUserByEmail(email: string): Promise<User | undefined> {
    return [...this.users.values()].find((user) => user.email === email);
  }

  async findUserById(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async createSession(
    input: Parameters<RepositoryPort["createSession"]>[0],
  ): Promise<Session> {
    const session: Session = {
      id: randomUUID(),
      userId: input.userId,
      tokenHash: input.tokenHash,
      csrfHash: input.csrfHash,
      expiresAt: input.expiresAt,
      revokedAt: null,
      lastSeenAt: input.now,
      createdAt: input.now,
    };
    this.sessions.set(session.id, session);
    return session;
  }

  async findSessionByTokenHash(
    tokenHash: string,
  ): Promise<Session | undefined> {
    return [...this.sessions.values()].find(
      (session) => session.tokenHash === tokenHash,
    );
  }

  async touchSession(id: string, now: Date): Promise<void> {
    const session = this.sessions.get(id);
    if (session) session.lastSeenAt = now;
  }

  async revokeSession(id: string, now: Date): Promise<void> {
    const session = this.sessions.get(id);
    if (session) session.revokedAt = now;
  }

  async createInvitation(
    input: Parameters<RepositoryPort["createInvitation"]>[0],
  ): Promise<Invitation> {
    const invitation: Invitation = {
      id: randomUUID(),
      email: input.email,
      tokenHash: input.tokenHash,
      invitedById: input.invitedById,
      projectId: input.projectId,
      role: input.role,
      expiresAt: input.expiresAt,
      acceptedAt: null,
      createdAt: input.now,
    };
    this.invitations.set(invitation.id, invitation);
    return invitation;
  }

  async findInvitationByTokenHash(
    tokenHash: string,
  ): Promise<Invitation | undefined> {
    return [...this.invitations.values()].find(
      (invitation) => invitation.tokenHash === tokenHash,
    );
  }

  async markInvitationAccepted(id: string, now: Date): Promise<boolean> {
    const invitation = this.invitations.get(id);
    if (!invitation || invitation.acceptedAt) return false;
    invitation.acceptedAt = now;
    return true;
  }

  async acceptInvitationAndCreateUser(
    input: Parameters<RepositoryPort["acceptInvitationAndCreateUser"]>[0],
  ): Promise<User | undefined> {
    const invitation = this.invitations.get(input.invitationId);
    if (
      !invitation ||
      invitation.acceptedAt ||
      invitation.expiresAt <= input.now ||
      [...this.users.values()].some((user) => user.email === invitation.email)
    ) {
      return undefined;
    }
    invitation.acceptedAt = input.now;
    const user = this.insertUser({
      email: invitation.email,
      displayName: input.displayName,
      passwordHash: input.passwordHash,
      locale: input.locale,
      isAdmin: false,
      now: input.now,
    });
    if (invitation.projectId && invitation.role) {
      const member: ProjectMember = {
        id: randomUUID(),
        projectId: invitation.projectId,
        userId: user.id,
        role: invitation.role,
        createdAt: input.now,
        updatedAt: input.now,
      };
      this.members.set(`${member.projectId}:${member.userId}`, member);
    }
    return user;
  }

  async createProject(
    input: Parameters<RepositoryPort["createProject"]>[0],
  ): Promise<Project> {
    const project: Project = {
      id: randomUUID(),
      name: input.name,
      ownerId: input.ownerId,
      archivedAt: null,
      createdAt: input.now,
      updatedAt: input.now,
    };
    this.projects.set(project.id, project);
    await this.addProjectMember({
      projectId: project.id,
      userId: input.ownerId,
      role: "owner",
      now: input.now,
    });
    return project;
  }

  async findProjectById(id: string): Promise<Project | undefined> {
    return this.projects.get(id);
  }

  async listProjectsForUser(userId: string): Promise<Project[]> {
    const projectIds = new Set(
      [...this.members.values()]
        .filter((member) => member.userId === userId)
        .map((member) => member.projectId),
    );
    return [...this.projects.values()].filter((project) =>
      projectIds.has(project.id),
    );
  }

  async updateProject(
    id: string,
    input: Parameters<RepositoryPort["updateProject"]>[1],
  ): Promise<Project> {
    const project = this.projects.get(id);
    if (!project) throw new ApiError("not_found", "Project not found", 404);
    if (input.name !== undefined) project.name = input.name;
    if (input.archivedAt !== undefined) project.archivedAt = input.archivedAt;
    project.updatedAt = input.now;
    return project;
  }

  async findProjectMember(
    projectId: string,
    userId: string,
  ): Promise<ProjectMember | undefined> {
    return this.members.get(`${projectId}:${userId}`);
  }

  async addProjectMember(
    input: Parameters<RepositoryPort["addProjectMember"]>[0],
  ): Promise<ProjectMember> {
    const key = `${input.projectId}:${input.userId}`;
    if (this.members.has(key)) {
      throw new ApiError("member_exists", "User is already a member", 409);
    }
    const member: ProjectMember = {
      id: randomUUID(),
      projectId: input.projectId,
      userId: input.userId,
      role: input.role,
      createdAt: input.now,
      updatedAt: input.now,
    };
    this.members.set(key, member);
    return member;
  }

  async updateProjectMember(
    projectId: string,
    userId: string,
    role: ProjectMember["role"],
    now: Date,
  ): Promise<ProjectMember | undefined> {
    const member = this.members.get(`${projectId}:${userId}`);
    if (!member) return undefined;
    member.role = role;
    member.updatedAt = now;
    return member;
  }

  async removeProjectMember(
    projectId: string,
    userId: string,
  ): Promise<boolean> {
    return this.members.delete(`${projectId}:${userId}`);
  }

  async createPersonalAccessToken(
    input: Parameters<RepositoryPort["createPersonalAccessToken"]>[0],
  ): Promise<PersonalAccessToken> {
    const token: PersonalAccessToken = {
      id: randomUUID(),
      userId: input.userId,
      name: input.name,
      tokenHash: input.tokenHash,
      scopes: [...input.scopes],
      expiresAt: input.expiresAt,
      revokedAt: null,
      lastUsedAt: null,
      createdAt: input.now,
    };
    this.personalAccessTokens.set(token.id, token);
    return token;
  }

  async findPersonalAccessTokenByHash(
    tokenHash: string,
  ): Promise<PersonalAccessToken | undefined> {
    return [...this.personalAccessTokens.values()].find(
      (token) => token.tokenHash === tokenHash,
    );
  }

  async listPersonalAccessTokens(
    userId: string,
  ): Promise<PersonalAccessToken[]> {
    return [...this.personalAccessTokens.values()].filter(
      (token) => token.userId === userId,
    );
  }

  async touchPersonalAccessToken(id: string, now: Date): Promise<void> {
    const token = this.personalAccessTokens.get(id);
    if (token) token.lastUsedAt = now;
  }

  async revokePersonalAccessToken(
    id: string,
    userId: string,
    now: Date,
  ): Promise<boolean> {
    const token = this.personalAccessTokens.get(id);
    if (!token || token.userId !== userId) return false;
    token.revokedAt = now;
    return true;
  }

  async createAuditEvent(
    input: Parameters<RepositoryPort["createAuditEvent"]>[0],
  ): Promise<AuditEvent> {
    const event: AuditEvent = {
      id: randomUUID(),
      actorId: input.actorId,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId,
      projectId: input.projectId,
      traceId: input.traceId,
      metadata: { ...input.metadata },
      createdAt: input.now,
    };
    this.auditEvents.set(event.id, event);
    return event;
  }

  async listAuditEvents(input: {
    projectId?: string;
    limit: number;
  }): Promise<AuditEvent[]> {
    return [...this.auditEvents.values()]
      .filter(
        (event) =>
          input.projectId === undefined || event.projectId === input.projectId,
      )
      .sort(
        (left, right) => right.createdAt.getTime() - left.createdAt.getTime(),
      )
      .slice(0, input.limit);
  }

  async createAsset(
    input: Parameters<RepositoryPort["createAsset"]>[0],
  ): Promise<Asset> {
    const asset: Asset = {
      id: randomUUID(),
      projectId: input.projectId,
      uploadedById: input.uploadedById,
      sha256: input.sha256,
      originalName: input.originalName,
      mediaType: input.mediaType,
      size: input.size,
      storageKey: input.storageKey,
      createdAt: input.now,
    };
    this.assets.set(asset.id, asset);
    return asset;
  }

  snapshot(): unknown {
    return {
      users: [...this.users.values()],
      sessions: [...this.sessions.values()],
      invitations: [...this.invitations.values()],
      projects: [...this.projects.values()],
      members: [...this.members.values()],
      personalAccessTokens: [...this.personalAccessTokens.values()],
      auditEvents: [...this.auditEvents.values()],
      assets: [...this.assets.values()],
    };
  }

  private insertUser(input: {
    email: string;
    displayName: string;
    passwordHash: string;
    locale: string;
    isAdmin: boolean;
    now: Date;
  }): User {
    if ([...this.users.values()].some((user) => user.email === input.email)) {
      throw new ApiError("email_exists", "Email is already registered", 409);
    }
    const user: User = {
      id: randomUUID(),
      email: input.email,
      displayName: input.displayName,
      passwordHash: input.passwordHash,
      status: "active",
      locale: input.locale,
      isAdmin: input.isAdmin,
      createdAt: input.now,
      updatedAt: input.now,
    };
    this.users.set(user.id, user);
    return user;
  }
}
