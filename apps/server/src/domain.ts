import type {
  PersonalAccessTokenScope,
  ProjectRole,
} from "@blue-canvas/contracts";

export type UserStatus = "active" | "disabled";

export interface User {
  id: string;
  email: string;
  displayName: string;
  passwordHash: string;
  status: UserStatus;
  locale: string;
  isAdmin: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Session {
  id: string;
  userId: string;
  tokenHash: string;
  csrfHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
  lastSeenAt: Date;
  createdAt: Date;
}

export interface Invitation {
  id: string;
  email: string;
  tokenHash: string;
  invitedById: string;
  projectId: string | null;
  role: ProjectRole | null;
  expiresAt: Date;
  acceptedAt: Date | null;
  createdAt: Date;
}

export interface Project {
  id: string;
  name: string;
  ownerId: string;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProjectMember {
  id: string;
  projectId: string;
  userId: string;
  role: ProjectRole;
  createdAt: Date;
  updatedAt: Date;
}

export interface PersonalAccessToken {
  id: string;
  userId: string;
  name: string;
  tokenHash: string;
  scopes: PersonalAccessTokenScope[];
  expiresAt: Date | null;
  revokedAt: Date | null;
  lastUsedAt: Date | null;
  createdAt: Date;
}

export interface AuditEvent {
  id: string;
  actorId: string | null;
  action: string;
  targetType: string;
  targetId: string | null;
  projectId: string | null;
  traceId: string;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

export interface Asset {
  id: string;
  projectId: string;
  uploadedById: string;
  sha256: string;
  originalName: string;
  mediaType: string;
  size: number;
  storageKey: string;
  status: "pending" | "ready";
  createdAt: Date;
}

export interface ProjectDocument {
  projectId: string;
  state: Uint8Array;
  stateVector: Uint8Array;
  revision: number;
  updatedAt: Date;
}

export interface NamedVersion {
  id: string;
  projectId: string;
  actorId: string;
  name: string;
  state: Uint8Array;
  stateVector: Uint8Array;
  revision: number;
  restoredFromId: string | null;
  createdAt: Date;
}

export interface ProjectComment {
  id: string;
  projectId: string;
  authorId: string;
  body: string;
  nodeId: string | null;
  positionX: number | null;
  positionY: number | null;
  mentionUserIds: string[];
  resolvedAt: Date | null;
  resolvedById: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface RepositoryPort {
  transaction<T>(
    operation: (repository: RepositoryPort) => Promise<T>,
  ): Promise<T>;
  isReady(): Promise<boolean>;
  countUsers(): Promise<number>;
  createBootstrapUser(input: {
    email: string;
    displayName: string;
    passwordHash: string;
    locale: string;
    now: Date;
  }): Promise<User | undefined>;
  createUser(input: {
    email: string;
    displayName: string;
    passwordHash: string;
    locale: string;
    isAdmin: boolean;
    now: Date;
  }): Promise<User>;
  findUserByEmail(email: string): Promise<User | undefined>;
  findUserById(id: string): Promise<User | undefined>;
  createSession(input: {
    userId: string;
    tokenHash: string;
    csrfHash: string;
    expiresAt: Date;
    now: Date;
  }): Promise<Session>;
  findSessionByTokenHash(tokenHash: string): Promise<Session | undefined>;
  touchSession(id: string, now: Date): Promise<void>;
  revokeSession(id: string, now: Date): Promise<void>;
  createInvitation(input: {
    email: string;
    tokenHash: string;
    invitedById: string;
    projectId: string | null;
    role: ProjectRole | null;
    expiresAt: Date;
    now: Date;
  }): Promise<Invitation>;
  findInvitationByTokenHash(tokenHash: string): Promise<Invitation | undefined>;
  markInvitationAccepted(id: string, now: Date): Promise<boolean>;
  acceptInvitationAndCreateUser(input: {
    invitationId: string;
    displayName: string;
    passwordHash: string;
    locale: string;
    now: Date;
  }): Promise<User | undefined>;
  createProject(input: {
    name: string;
    ownerId: string;
    now: Date;
  }): Promise<Project>;
  findProjectById(id: string): Promise<Project | undefined>;
  listProjectsForUser(userId: string): Promise<Project[]>;
  updateProject(
    id: string,
    input: { name?: string; archivedAt?: Date | null; now: Date },
  ): Promise<Project>;
  findProjectMember(
    projectId: string,
    userId: string,
  ): Promise<ProjectMember | undefined>;
  addProjectMember(input: {
    projectId: string;
    userId: string;
    role: ProjectRole;
    now: Date;
  }): Promise<ProjectMember>;
  updateProjectMember(
    projectId: string,
    userId: string,
    role: ProjectRole,
    now: Date,
  ): Promise<ProjectMember | undefined>;
  removeProjectMember(projectId: string, userId: string): Promise<boolean>;
  createPersonalAccessToken(input: {
    userId: string;
    name: string;
    tokenHash: string;
    scopes: PersonalAccessTokenScope[];
    expiresAt: Date | null;
    now: Date;
  }): Promise<PersonalAccessToken>;
  findPersonalAccessTokenByHash(
    tokenHash: string,
  ): Promise<PersonalAccessToken | undefined>;
  listPersonalAccessTokens(userId: string): Promise<PersonalAccessToken[]>;
  touchPersonalAccessToken(id: string, now: Date): Promise<void>;
  revokePersonalAccessToken(
    id: string,
    userId: string,
    now: Date,
  ): Promise<boolean>;
  createAuditEvent(
    input: Omit<AuditEvent, "id" | "createdAt"> & {
      now: Date;
    },
  ): Promise<AuditEvent>;
  listAuditEvents(input: {
    projectId?: string;
    limit: number;
  }): Promise<AuditEvent[]>;
  createAsset(
    input: Omit<Asset, "id" | "createdAt"> & { now: Date },
  ): Promise<Asset>;
  listPendingAssets(createdBefore: Date): Promise<Asset[]>;
  markAssetReady(id: string): Promise<Asset | undefined>;
  removePendingAsset(id: string): Promise<boolean>;
  findProjectDocument(projectId: string): Promise<ProjectDocument | undefined>;
  upsertProjectDocument(input: {
    projectId: string;
    state: Uint8Array;
    stateVector: Uint8Array;
    now: Date;
    expectedRevision?: number;
  }): Promise<ProjectDocument>;
  createNamedVersion(
    input: Omit<NamedVersion, "id" | "createdAt"> & { now: Date },
  ): Promise<NamedVersion>;
  listNamedVersions(projectId: string): Promise<NamedVersion[]>;
  findNamedVersion(
    projectId: string,
    versionId: string,
  ): Promise<NamedVersion | undefined>;
  findProjectMembers(projectId: string): Promise<ProjectMember[]>;
  createComment(
    input: Omit<ProjectComment, "id" | "createdAt" | "updatedAt"> & {
      now: Date;
    },
  ): Promise<ProjectComment>;
  listComments(projectId: string): Promise<ProjectComment[]>;
  findComment(
    projectId: string,
    commentId: string,
  ): Promise<ProjectComment | undefined>;
  updateComment(
    projectId: string,
    commentId: string,
    input: { body?: string; mentionUserIds?: string[]; now: Date },
  ): Promise<ProjectComment | undefined>;
  resolveComment(
    projectId: string,
    commentId: string,
    input: { resolvedAt: Date | null; resolvedById: string | null; now: Date },
  ): Promise<ProjectComment | undefined>;
}
