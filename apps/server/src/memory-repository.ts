import { randomUUID } from "node:crypto";

import { ApiError } from "./core.js";
import type {
  Asset,
  AuditEvent,
  Invitation,
  PersonalAccessToken,
  Project,
  ProjectComment,
  ProjectDocument,
  ProjectMember,
  NamedVersion,
  RepositoryPort,
  Session,
  User,
} from "./domain.js";

export class InMemoryRepository implements RepositoryPort {
  private users = new Map<string, User>();
  private sessions = new Map<string, Session>();
  private invitations = new Map<string, Invitation>();
  private projects = new Map<string, Project>();
  private members = new Map<string, ProjectMember>();
  private personalAccessTokens = new Map<string, PersonalAccessToken>();
  private auditEvents = new Map<string, AuditEvent>();
  private assets = new Map<string, Asset>();
  private projectDocuments = new Map<string, ProjectDocument>();
  private namedVersions = new Map<string, NamedVersion>();
  private comments = new Map<string, ProjectComment>();
  private transactionTail: Promise<void> = Promise.resolve();

  async transaction<T>(
    operation: (repository: RepositoryPort) => Promise<T>,
  ): Promise<T> {
    let release = (): void => undefined;
    const preceding = this.transactionTail;
    this.transactionTail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await preceding;
    const snapshot = this.cloneState();
    try {
      return await operation(this);
    } catch (error) {
      this.restoreState(snapshot);
      throw error;
    } finally {
      release();
    }
  }

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
      status: input.status,
      createdAt: input.now,
    };
    this.assets.set(asset.id, asset);
    return asset;
  }

  async listPendingAssets(createdBefore: Date): Promise<Asset[]> {
    return [...this.assets.values()].filter(
      (asset) => asset.status === "pending" && asset.createdAt <= createdBefore,
    );
  }

  async markAssetReady(id: string): Promise<Asset | undefined> {
    const asset = this.assets.get(id);
    if (!asset || asset.status !== "pending") return undefined;
    asset.status = "ready";
    return asset;
  }

  async removePendingAsset(id: string): Promise<boolean> {
    const asset = this.assets.get(id);
    if (!asset || asset.status !== "pending") return false;
    return this.assets.delete(id);
  }

  async findProjectDocument(
    projectId: string,
  ): Promise<ProjectDocument | undefined> {
    return this.projectDocuments.get(projectId);
  }

  async upsertProjectDocument(
    input: Parameters<RepositoryPort["upsertProjectDocument"]>[0],
  ): Promise<ProjectDocument> {
    const current = this.projectDocuments.get(input.projectId);
    if (
      input.expectedRevision !== undefined &&
      (current?.revision ?? 0) !== input.expectedRevision
    ) {
      throw new ApiError("revision_conflict", "Document revision changed", 409);
    }
    const document: ProjectDocument = {
      projectId: input.projectId,
      state: input.state.slice(),
      stateVector: input.stateVector.slice(),
      revision: (current?.revision ?? 0) + 1,
      updatedAt: input.now,
    };
    this.projectDocuments.set(input.projectId, document);
    return document;
  }

  async createNamedVersion(
    input: Parameters<RepositoryPort["createNamedVersion"]>[0],
  ): Promise<NamedVersion> {
    const version: NamedVersion = {
      id: randomUUID(),
      projectId: input.projectId,
      actorId: input.actorId,
      name: input.name,
      state: input.state.slice(),
      stateVector: input.stateVector.slice(),
      revision: input.revision,
      restoredFromId: input.restoredFromId,
      createdAt: input.now,
    };
    this.namedVersions.set(version.id, version);
    return version;
  }

  async listNamedVersions(projectId: string): Promise<NamedVersion[]> {
    return [...this.namedVersions.values()]
      .filter((version) => version.projectId === projectId)
      .sort(
        (left, right) => right.createdAt.getTime() - left.createdAt.getTime(),
      );
  }

  async findNamedVersion(
    projectId: string,
    versionId: string,
  ): Promise<NamedVersion | undefined> {
    const version = this.namedVersions.get(versionId);
    return version?.projectId === projectId ? version : undefined;
  }

  async findProjectMembers(projectId: string): Promise<ProjectMember[]> {
    return [...this.members.values()].filter(
      (member) => member.projectId === projectId,
    );
  }

  async createComment(
    input: Parameters<RepositoryPort["createComment"]>[0],
  ): Promise<ProjectComment> {
    const comment: ProjectComment = {
      id: randomUUID(),
      projectId: input.projectId,
      authorId: input.authorId,
      body: input.body,
      nodeId: input.nodeId,
      positionX: input.positionX,
      positionY: input.positionY,
      mentionUserIds: [...input.mentionUserIds],
      resolvedAt: input.resolvedAt,
      resolvedById: input.resolvedById,
      createdAt: input.now,
      updatedAt: input.now,
    };
    this.comments.set(comment.id, comment);
    return comment;
  }

  async listComments(projectId: string): Promise<ProjectComment[]> {
    return [...this.comments.values()]
      .filter((comment) => comment.projectId === projectId)
      .sort(
        (left, right) => left.createdAt.getTime() - right.createdAt.getTime(),
      );
  }

  async findComment(
    projectId: string,
    commentId: string,
  ): Promise<ProjectComment | undefined> {
    const comment = this.comments.get(commentId);
    return comment?.projectId === projectId ? comment : undefined;
  }

  async updateComment(
    projectId: string,
    commentId: string,
    input: Parameters<RepositoryPort["updateComment"]>[2],
  ): Promise<ProjectComment | undefined> {
    const comment = await this.findComment(projectId, commentId);
    if (!comment) return undefined;
    if (input.body !== undefined) comment.body = input.body;
    if (input.mentionUserIds !== undefined)
      comment.mentionUserIds = [...input.mentionUserIds];
    comment.updatedAt = input.now;
    return comment;
  }

  async resolveComment(
    projectId: string,
    commentId: string,
    input: Parameters<RepositoryPort["resolveComment"]>[2],
  ): Promise<ProjectComment | undefined> {
    const comment = await this.findComment(projectId, commentId);
    if (!comment) return undefined;
    comment.resolvedAt = input.resolvedAt;
    comment.resolvedById = input.resolvedById;
    comment.updatedAt = input.now;
    return comment;
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
      projectDocuments: [...this.projectDocuments.values()],
      namedVersions: [...this.namedVersions.values()],
      comments: [...this.comments.values()],
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

  private cloneState() {
    return structuredClone({
      users: this.users,
      sessions: this.sessions,
      invitations: this.invitations,
      projects: this.projects,
      members: this.members,
      personalAccessTokens: this.personalAccessTokens,
      auditEvents: this.auditEvents,
      assets: this.assets,
      projectDocuments: this.projectDocuments,
      namedVersions: this.namedVersions,
      comments: this.comments,
    });
  }

  private restoreState(snapshot: ReturnType<InMemoryRepository["cloneState"]>) {
    this.users = snapshot.users;
    this.sessions = snapshot.sessions;
    this.invitations = snapshot.invitations;
    this.projects = snapshot.projects;
    this.members = snapshot.members;
    this.personalAccessTokens = snapshot.personalAccessTokens;
    this.auditEvents = snapshot.auditEvents;
    this.assets = snapshot.assets;
    this.projectDocuments = snapshot.projectDocuments;
    this.namedVersions = snapshot.namedVersions;
    this.comments = snapshot.comments;
  }
}
