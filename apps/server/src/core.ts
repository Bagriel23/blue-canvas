import type {
  AcceptInvitationRequest,
  AddProjectMemberRequest,
  BootstrapAdminRequest,
  CreateInvitationRequest,
  CreatePersonalAccessTokenRequest,
  CreateProjectRequest,
  CreateNamedVersionRequest,
  RestoreNamedVersionRequest,
  CreateCommentRequest,
  UpdateCommentRequest,
  ResolveCommentRequest,
  InviteProjectMemberRequest,
  PersonalAccessTokenScope,
  UpdateProjectMemberRequest,
  UpdateProjectRequest,
} from "@blue-canvas/contracts";
import {
  applyCollaborationState,
  createInitialCollaborationDocument,
  encodeCollaborationState,
  readSemanticDocument,
  replaceSemanticDocument,
} from "@blue-canvas/collaboration";
import {
  applyCommandBatch,
  CommandError,
  createCommandState,
} from "@blue-canvas/commands";
import { deterministicSerialize } from "@blue-canvas/document";
import { getNodeChildren, type DesignNode } from "@blue-canvas/document";
import * as Y from "yjs";

import type {
  Asset,
  AuditEvent,
  PersonalAccessToken,
  Project,
  ProjectComment,
  NamedVersion,
  ProjectMember,
  RepositoryPort,
  Session,
  User,
} from "./domain.js";
import {
  canProjectRole,
  hashesEqual,
  issueSecret,
  sha256,
  type PasswordHasher,
  type ProjectAction,
} from "./security.js";
import type { AssetStorage } from "./storage.js";

export class ApiError extends Error {
  readonly code: string;
  readonly statusCode: number;
  readonly details?: unknown;

  constructor(
    code: string,
    message: string,
    statusCode: number,
    details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

export interface PublicUser {
  id: string;
  email: string;
  displayName: string;
  status: User["status"];
  locale: string;
  isAdmin: boolean;
}

export type Principal =
  | { kind: "session"; user: User; session: Session }
  | { kind: "pat"; user: User; token: PersonalAccessToken };

export interface CoreDependencies {
  repository: RepositoryPort;
  passwordHasher: PasswordHasher;
  storage: AssetStorage;
  setupSecret: string;
  now: () => Date;
}

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const DUMMY_PASSWORD_HASH =
  "$argon2id$v=19$m=19456,t=2,p=1$BwcHBwcHBwcHBwcHBwcHBw$6MTKjeUTHbOBOlmg3n1f3ayBLZgkhcSVPNhhcBlX4uk";

function commandBatchId(idempotencyKey: string): string {
  const hex = sha256(idempotencyKey).slice(0, 32).split("");
  hex[12] = "5";
  hex[16] = ((Number.parseInt(hex[16] ?? "8", 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8).join("")}-${hex.slice(8, 12).join("")}-${hex.slice(12, 16).join("")}-${hex.slice(16, 20).join("")}-${hex.slice(20).join("")}`;
}

export class ApplicationService {
  constructor(private readonly dependencies: CoreDependencies) {}

  async ready(): Promise<boolean> {
    if (!(await this.dependencies.repository.isReady())) return false;
    const cutoff = new Date(this.dependencies.now().getTime() - 10 * 60 * 1000);
    const pending =
      await this.dependencies.repository.listPendingAssets(cutoff);
    for (const asset of pending) {
      const exists = await this.dependencies.storage.exists(asset.storageKey);
      await this.dependencies.repository.transaction(async (repository) => {
        if (exists) {
          const ready = await repository.markAssetReady(asset.id);
          if (!ready) return;
          await this.auditWith(
            repository,
            null,
            "asset.upload.reconcile",
            "asset",
            asset.id,
            asset.projectId,
            `asset-reconcile:${asset.id}`,
            { sha256: asset.sha256 },
          );
          return;
        }
        if (!(await repository.removePendingAsset(asset.id))) return;
        await this.auditWith(
          repository,
          null,
          "asset.upload.discard",
          "asset",
          asset.id,
          asset.projectId,
          `asset-reconcile:${asset.id}`,
          { sha256: asset.sha256 },
        );
      });
    }
    return true;
  }

  async bootstrapAdmin(
    input: BootstrapAdminRequest,
    traceId: string,
  ): Promise<{
    user: PublicUser;
    sessionToken: string;
    csrfToken: string;
    expiresAt: Date;
  }> {
    if (
      !this.dependencies.setupSecret ||
      !hashesEqual(
        sha256(input.setupSecret),
        sha256(this.dependencies.setupSecret),
      )
    ) {
      throw new ApiError("invalid_setup_secret", "Invalid setup secret", 403);
    }
    if ((await this.dependencies.repository.countUsers()) !== 0) {
      throw new ApiError(
        "bootstrap_unavailable",
        "Bootstrap is available only before the first user exists",
        409,
      );
    }
    const now = this.dependencies.now();
    const passwordHash = await this.dependencies.passwordHasher.hash(
      input.password,
    );
    return this.dependencies.repository.transaction(async (repository) => {
      const user = await repository.createBootstrapUser({
        email: input.email,
        displayName: input.displayName,
        passwordHash,
        locale: input.locale,
        now,
      });
      if (!user) {
        throw new ApiError(
          "bootstrap_unavailable",
          "Bootstrap is available only before the first user exists",
          409,
        );
      }
      await this.auditWith(
        repository,
        user.id,
        "user.bootstrap",
        "user",
        user.id,
        null,
        traceId,
        { email: user.email },
      );
      return {
        user: publicUser(user),
        ...(await this.issueSession(user.id, repository)),
      };
    });
  }

  async login(
    email: string,
    password: string,
    traceId: string,
  ): Promise<{
    user: PublicUser;
    sessionToken: string;
    csrfToken: string;
    expiresAt: Date;
  }> {
    const user = await this.dependencies.repository.findUserByEmail(email);
    const passwordMatches = await this.dependencies.passwordHasher.verify(
      user?.passwordHash ?? DUMMY_PASSWORD_HASH,
      password,
    );
    if (!user || user.status !== "active" || !passwordMatches) {
      throw new ApiError(
        "invalid_credentials",
        "Email or password is incorrect",
        401,
      );
    }
    return this.dependencies.repository.transaction(async (repository) => {
      await this.auditWith(
        repository,
        user.id,
        "session.login",
        "user",
        user.id,
        null,
        traceId,
        {},
      );
      return {
        user: publicUser(user),
        ...(await this.issueSession(user.id, repository)),
      };
    });
  }

  async currentSession(principal: Principal): Promise<{
    user: PublicUser;
    csrfToken: string | null;
  }> {
    if (principal.kind === "pat") {
      return { user: publicUser(principal.user), csrfToken: null };
    }
    const csrf = issueSecret();
    await this.dependencies.repository.updateSessionCsrf(
      principal.session.id,
      csrf.hash,
      this.dependencies.now(),
    );
    return { user: publicUser(principal.user), csrfToken: csrf.raw };
  }

  async acceptInvitation(
    input: AcceptInvitationRequest,
    traceId: string,
  ): Promise<{
    user: PublicUser;
    sessionToken: string;
    csrfToken: string;
    expiresAt: Date;
  }> {
    const now = this.dependencies.now();
    const invitation =
      await this.dependencies.repository.findInvitationByTokenHash(
        sha256(input.token),
      );
    if (!invitation || invitation.acceptedAt || invitation.expiresAt <= now) {
      throw new ApiError(
        "invitation_unavailable",
        "Invitation is invalid, expired, or already used",
        410,
      );
    }
    const passwordHash = await this.dependencies.passwordHasher.hash(
      input.password,
    );
    return this.dependencies.repository.transaction(async (repository) => {
      const user = await repository.acceptInvitationAndCreateUser({
        invitationId: invitation.id,
        displayName: input.displayName,
        passwordHash,
        locale: input.locale,
        now,
      });
      if (!user) {
        throw new ApiError(
          "invitation_unavailable",
          "Invitation is invalid, expired, or already used",
          410,
        );
      }
      await this.auditWith(
        repository,
        user.id,
        "invitation.accept",
        "invitation",
        invitation.id,
        invitation.projectId,
        traceId,
        { email: user.email },
      );
      return {
        user: publicUser(user),
        ...(await this.issueSession(user.id, repository)),
      };
    });
  }

  async authenticate(input: {
    sessionToken?: string;
    bearerToken?: string;
    csrfToken?: string;
    mutating: boolean;
    requiredScope?: PersonalAccessTokenScope;
  }): Promise<Principal> {
    if (input.sessionToken && input.bearerToken) {
      throw new ApiError(
        "ambiguous_credentials",
        "Use one authentication method per request",
        400,
      );
    }
    const now = this.dependencies.now();
    if (input.bearerToken) {
      const token =
        await this.dependencies.repository.findPersonalAccessTokenByHash(
          sha256(input.bearerToken),
        );
      if (
        !token ||
        token.revokedAt ||
        (token.expiresAt && token.expiresAt <= now)
      ) {
        throw new ApiError("unauthorized", "Authentication required", 401);
      }
      if (input.requiredScope && !token.scopes.includes(input.requiredScope)) {
        throw new ApiError(
          "insufficient_scope",
          "Personal access token lacks the required scope",
          403,
        );
      }
      const user = await this.activeUser(token.userId);
      await this.dependencies.repository.touchPersonalAccessToken(
        token.id,
        now,
      );
      return { kind: "pat", user, token };
    }
    if (!input.sessionToken) {
      throw new ApiError("unauthorized", "Authentication required", 401);
    }
    const session = await this.dependencies.repository.findSessionByTokenHash(
      sha256(input.sessionToken),
    );
    if (!session || session.revokedAt || session.expiresAt <= now) {
      throw new ApiError("unauthorized", "Authentication required", 401);
    }
    if (
      input.mutating &&
      (!input.csrfToken ||
        !hashesEqual(sha256(input.csrfToken), session.csrfHash))
    ) {
      throw new ApiError("csrf_mismatch", "CSRF token does not match", 403);
    }
    const user = await this.activeUser(session.userId);
    if (input.requiredScope === "admin" && !user.isAdmin) {
      throw new ApiError(
        "insufficient_scope",
        "Administrator access is required",
        403,
      );
    }
    await this.dependencies.repository.touchSession(session.id, now);
    return { kind: "session", user, session };
  }

  async logout(principal: Principal, traceId: string): Promise<void> {
    if (principal.kind !== "session") {
      throw new ApiError(
        "invalid_auth_method",
        "Logout requires a cookie session",
        400,
      );
    }
    await this.dependencies.repository.transaction(async (repository) => {
      await repository.revokeSession(
        principal.session.id,
        this.dependencies.now(),
      );
      await this.auditWith(
        repository,
        principal.user.id,
        "session.logout",
        "session",
        principal.session.id,
        null,
        traceId,
        {},
      );
    });
  }

  async createInvitation(
    principal: Principal,
    input: CreateInvitationRequest,
    traceId: string,
  ): Promise<{ invitationId: string; token: string; expiresAt: Date }> {
    this.requireAdmin(principal);
    if (await this.dependencies.repository.findUserByEmail(input.email)) {
      throw new ApiError("email_exists", "Email is already registered", 409);
    }
    const now = this.dependencies.now();
    const secret = issueSecret();
    const expiresAt = new Date(
      now.getTime() + input.expiresInHours * 60 * 60 * 1000,
    );
    return this.dependencies.repository.transaction(async (repository) => {
      const invitation = await repository.createInvitation({
        email: input.email,
        tokenHash: secret.hash,
        invitedById: principal.user.id,
        projectId: null,
        role: null,
        expiresAt,
        now,
      });
      await this.auditWith(
        repository,
        principal.user.id,
        "invitation.create",
        "invitation",
        invitation.id,
        null,
        traceId,
        { email: input.email, expiresAt: expiresAt.toISOString() },
      );
      return { invitationId: invitation.id, token: secret.raw, expiresAt };
    });
  }

  async inviteProjectMember(
    principal: Principal,
    projectId: string,
    input: InviteProjectMemberRequest,
    traceId: string,
  ): Promise<{ invitationId: string; token: string; expiresAt: Date }> {
    await this.requireProject(principal, projectId, "members:manage");
    if (await this.dependencies.repository.findUserByEmail(input.email)) {
      throw new ApiError(
        "email_exists",
        "Use member add for an existing user",
        409,
      );
    }
    const now = this.dependencies.now();
    const secret = issueSecret();
    const expiresAt = new Date(
      now.getTime() + input.expiresInHours * 60 * 60 * 1000,
    );
    return this.dependencies.repository.transaction(async (repository) => {
      const invitation = await repository.createInvitation({
        email: input.email,
        tokenHash: secret.hash,
        invitedById: principal.user.id,
        projectId,
        role: input.role,
        expiresAt,
        now,
      });
      await this.auditWith(
        repository,
        principal.user.id,
        "project.member.invite",
        "invitation",
        invitation.id,
        projectId,
        traceId,
        {
          email: input.email,
          role: input.role,
          expiresAt: expiresAt.toISOString(),
        },
      );
      return { invitationId: invitation.id, token: secret.raw, expiresAt };
    });
  }

  async createProject(
    principal: Principal,
    input: CreateProjectRequest,
    traceId: string,
  ): Promise<Project> {
    const now = this.dependencies.now();
    return this.dependencies.repository.transaction(async (repository) => {
      const project = await repository.createProject({
        name: input.name,
        ownerId: principal.user.id,
        now,
      });
      await this.auditWith(
        repository,
        principal.user.id,
        "project.create",
        "project",
        project.id,
        project.id,
        traceId,
        { name: project.name },
      );
      return project;
    });
  }

  async listProjects(principal: Principal): Promise<Project[]> {
    return this.dependencies.repository.listProjectsForUser(principal.user.id);
  }

  async applyCommands(
    principal: Principal,
    projectId: string,
    input: {
      baseRevision: number;
      idempotencyKey: string;
      commands: unknown[];
    },
    traceId: string,
  ): Promise<{ revision: number; document: unknown; idempotent: boolean }> {
    await this.requireCollaborationRole(principal, projectId, true);
    return this.dependencies.repository.transaction(async (repository) => {
      await this.requireCollaborationRole(
        principal,
        projectId,
        true,
        repository,
      );
      const receipt = await repository.findCommandReceipt(
        projectId,
        input.idempotencyKey,
      );
      const fingerprint = sha256(
        deterministicSerialize({
          actorId: principal.user.id,
          baseRevision: input.baseRevision,
          commands: input.commands,
        }),
      );
      if (receipt) {
        if (receipt.fingerprint !== fingerprint)
          throw new ApiError(
            "idempotency_conflict",
            "Idempotency key was already used with different commands",
            409,
          );
        return {
          revision: receipt.revision,
          document: receipt.document,
          idempotent: true,
        };
      }

      const current = await repository.findProjectDocument(projectId);
      const currentRevision = current?.revision ?? 0;
      if (input.baseRevision !== currentRevision)
        throw new ApiError(
          "revision_conflict",
          "Document revision changed",
          409,
        );
      const yDocument = new Y.Doc();
      if (current) applyCollaborationState(yDocument, current.state);
      else {
        const project = await repository.findProjectById(projectId);
        if (!project) throw new ApiError("not_found", "Project not found", 404);
        const initial = createInitialCollaborationDocument(
          project.id,
          project.name,
        );
        applyCollaborationState(
          yDocument,
          encodeCollaborationState(initial).state,
        );
        initial.destroy();
      }
      let result;
      try {
        const batchId = commandBatchId(input.idempotencyKey);
        result = applyCommandBatch(
          createCommandState(readSemanticDocument(yDocument)),
          {
            id: batchId,
            actorId: principal.user.id,
            baseRevision: 0,
            commands: input.commands,
          },
        );
      } catch (error) {
        yDocument.destroy();
        if (error instanceof CommandError)
          throw new ApiError("invalid_command_batch", error.message, 400, {
            code: error.code,
          });
        throw error;
      }
      replaceSemanticDocument(yDocument, result.document);
      const encoded = encodeCollaborationState(yDocument);
      const updated = await repository.upsertProjectDocument({
        projectId,
        ...encoded,
        expectedRevision: currentRevision,
        now: this.dependencies.now(),
      });
      yDocument.destroy();
      await repository.createCommandReceipt({
        projectId,
        idempotencyKey: input.idempotencyKey,
        fingerprint,
        revision: updated.revision,
        document: result.document,
        createdAt: this.dependencies.now(),
      });
      await this.auditWith(
        repository,
        principal.user.id,
        "project.commands.apply",
        "project",
        projectId,
        projectId,
        traceId,
        {
          revision: updated.revision,
          commandCount: input.commands.length,
        },
      );
      return {
        revision: updated.revision,
        document: result.document,
        idempotent: false,
      };
    });
  }

  async collaborationAccess(
    principal: Principal,
    projectId: string,
    write: boolean,
  ): Promise<ProjectMember> {
    return this.requireCollaborationRole(principal, projectId, write);
  }

  async getProject(principal: Principal, projectId: string): Promise<Project> {
    await this.requireProject(principal, projectId, "project:read");
    const project =
      await this.dependencies.repository.findProjectById(projectId);
    if (!project) throw new ApiError("not_found", "Project not found", 404);
    return project;
  }

  async updateProject(
    principal: Principal,
    projectId: string,
    input: UpdateProjectRequest,
    traceId: string,
  ): Promise<Project> {
    const action: ProjectAction =
      input.archived !== undefined ? "project:archive" : "project:update";
    await this.requireProject(principal, projectId, action);
    const now = this.dependencies.now();
    const update: { name?: string; archivedAt?: Date | null; now: Date } = {
      now,
    };
    if (input.name !== undefined) update.name = input.name;
    if (input.archived !== undefined)
      update.archivedAt = input.archived ? now : null;
    return this.dependencies.repository.transaction(async (repository) => {
      const project = await repository.updateProject(projectId, update);
      await this.auditWith(
        repository,
        principal.user.id,
        input.archived !== undefined ? "project.archive" : "project.update",
        "project",
        projectId,
        projectId,
        traceId,
        input.name === undefined ? {} : { name: input.name },
      );
      return project;
    });
  }

  async addMember(
    principal: Principal,
    projectId: string,
    input: AddProjectMemberRequest,
    traceId: string,
  ): Promise<ProjectMember> {
    await this.requireProject(principal, projectId, "members:manage");
    const user = await this.dependencies.repository.findUserByEmail(
      input.email,
    );
    if (!user) throw new ApiError("user_not_found", "User not found", 404);
    return this.dependencies.repository.transaction(async (repository) => {
      const member = await repository.addProjectMember({
        projectId,
        userId: user.id,
        role: input.role,
        now: this.dependencies.now(),
      });
      await this.auditWith(
        repository,
        principal.user.id,
        "project.member.add",
        "user",
        user.id,
        projectId,
        traceId,
        { role: input.role },
      );
      return member;
    });
  }

  async updateMember(
    principal: Principal,
    projectId: string,
    userId: string,
    input: UpdateProjectMemberRequest,
    traceId: string,
  ): Promise<ProjectMember> {
    await this.requireProject(principal, projectId, "members:manage");
    const current = await this.dependencies.repository.findProjectMember(
      projectId,
      userId,
    );
    if (!current) throw new ApiError("not_found", "Member not found", 404);
    if (current.role === "owner") {
      throw new ApiError(
        "owner_protected",
        "The project owner role cannot be changed",
        409,
      );
    }
    return this.dependencies.repository.transaction(async (repository) => {
      const member = await repository.updateProjectMember(
        projectId,
        userId,
        input.role,
        this.dependencies.now(),
      );
      if (!member) throw new ApiError("not_found", "Member not found", 404);
      await this.auditWith(
        repository,
        principal.user.id,
        "project.member.update",
        "user",
        userId,
        projectId,
        traceId,
        { role: input.role },
      );
      return member;
    });
  }

  async removeMember(
    principal: Principal,
    projectId: string,
    userId: string,
    traceId: string,
  ): Promise<void> {
    await this.requireProject(principal, projectId, "members:manage");
    const current = await this.dependencies.repository.findProjectMember(
      projectId,
      userId,
    );
    if (!current) throw new ApiError("not_found", "Member not found", 404);
    if (current.role === "owner") {
      throw new ApiError(
        "owner_protected",
        "The project owner cannot be removed",
        409,
      );
    }
    await this.dependencies.repository.transaction(async (repository) => {
      const removed = await repository.removeProjectMember(projectId, userId);
      if (!removed) throw new ApiError("not_found", "Member not found", 404);
      await this.auditWith(
        repository,
        principal.user.id,
        "project.member.remove",
        "user",
        userId,
        projectId,
        traceId,
        {},
      );
    });
  }

  async createPersonalAccessToken(
    principal: Principal,
    input: CreatePersonalAccessTokenRequest,
    traceId: string,
  ): Promise<{ token: PersonalAccessToken; raw: string }> {
    this.requireSession(principal);
    const now = this.dependencies.now();
    const secret = issueSecret();
    const raw = `bcp_${secret.raw}`;
    return this.dependencies.repository.transaction(async (repository) => {
      const token = await repository.createPersonalAccessToken({
        userId: principal.user.id,
        name: input.name,
        tokenHash: sha256(raw),
        scopes: [...new Set(input.scopes)],
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
        now,
      });
      await this.auditWith(
        repository,
        principal.user.id,
        "pat.create",
        "personal_access_token",
        token.id,
        null,
        traceId,
        { name: token.name, scopes: token.scopes },
      );
      return { token, raw };
    });
  }

  async listPersonalAccessTokens(
    principal: Principal,
  ): Promise<PersonalAccessToken[]> {
    this.requireSession(principal);
    return this.dependencies.repository.listPersonalAccessTokens(
      principal.user.id,
    );
  }

  async revokePersonalAccessToken(
    principal: Principal,
    tokenId: string,
    traceId: string,
  ): Promise<void> {
    this.requireSession(principal);
    await this.dependencies.repository.transaction(async (repository) => {
      if (
        !(await repository.revokePersonalAccessToken(
          tokenId,
          principal.user.id,
          this.dependencies.now(),
        ))
      ) {
        throw new ApiError("not_found", "Personal access token not found", 404);
      }
      await this.auditWith(
        repository,
        principal.user.id,
        "pat.revoke",
        "personal_access_token",
        tokenId,
        null,
        traceId,
        {},
      );
    });
  }

  async listAuditEvents(
    principal: Principal,
    projectId?: string,
  ): Promise<AuditEvent[]> {
    if (projectId) {
      await this.requireProject(principal, projectId, "members:manage");
    } else {
      this.requireAdmin(principal);
    }
    return this.dependencies.repository.listAuditEvents(
      projectId === undefined ? { limit: 100 } : { projectId, limit: 100 },
    );
  }

  async uploadAsset(
    principal: Principal,
    projectId: string,
    input: { bytes: Uint8Array; originalName: string; mediaType: string },
    traceId: string,
  ): Promise<Asset> {
    await this.requireProject(principal, projectId, "assets:write");
    const staged = await this.dependencies.storage.stage(input);
    let pending: Asset | undefined;
    let published = false;
    try {
      pending = await this.dependencies.repository.transaction(
        async (repository) => {
          const created = await repository.createAsset({
            projectId,
            uploadedById: principal.user.id,
            sha256: staged.asset.sha256,
            originalName: input.originalName,
            mediaType: input.mediaType,
            size: staged.asset.size,
            storageKey: staged.asset.storageKey,
            status: "pending",
            now: this.dependencies.now(),
          });
          await this.auditWith(
            repository,
            principal.user.id,
            "asset.upload.stage",
            "asset",
            created.id,
            projectId,
            traceId,
            {
              sha256: created.sha256,
              originalName: created.originalName,
              mediaType: created.mediaType,
              size: created.size,
            },
          );
          return created;
        },
      );
      await staged.commit();
      published = true;
      return await this.dependencies.repository.transaction(
        async (repository) => {
          const ready = await repository.markAssetReady(pending?.id ?? "");
          if (!ready) {
            throw new ApiError(
              "asset_publication_conflict",
              "Asset publication could not be finalized",
              409,
            );
          }
          await this.auditWith(
            repository,
            principal.user.id,
            "asset.upload",
            "asset",
            ready.id,
            projectId,
            traceId,
            {
              sha256: ready.sha256,
              originalName: ready.originalName,
              mediaType: ready.mediaType,
              size: ready.size,
            },
          );
          return ready;
        },
      );
    } catch (error) {
      await staged.abort();
      if (pending && !published) {
        try {
          await this.dependencies.repository.transaction(async (repository) => {
            if (!(await repository.removePendingAsset(pending?.id ?? "")))
              return;
            await this.auditWith(
              repository,
              principal.user.id,
              "asset.upload.failed",
              "asset",
              pending?.id ?? null,
              projectId,
              traceId,
              { sha256: pending?.sha256 },
            );
          });
        } catch {
          // A stale pending row is reconciled by readiness after the grace period.
        }
      }
      throw error;
    }
  }

  async createNamedVersion(
    principal: Principal,
    projectId: string,
    input: CreateNamedVersionRequest,
    traceId: string,
  ): Promise<NamedVersion> {
    await this.requireCollaborationRole(principal, projectId, true);
    return this.dependencies.repository.transaction(async (repository) => {
      await this.requireCollaborationRole(
        principal,
        projectId,
        true,
        repository,
      );
      let current = await repository.findProjectDocument(projectId);
      if (!current) {
        const project = await repository.findProjectById(projectId);
        if (!project) throw new ApiError("not_found", "Project not found", 404);
        const initial = encodeCollaborationState(
          createInitialCollaborationDocument(project.id, project.name),
        );
        current = await repository.upsertProjectDocument({
          projectId,
          ...initial,
          now: this.dependencies.now(),
          expectedRevision: 0,
        });
      }
      const version = await repository.createNamedVersion({
        projectId,
        actorId: principal.user.id,
        name: input.name,
        state: current.state,
        stateVector: current.stateVector,
        revision: current.revision,
        restoredFromId: null,
        now: this.dependencies.now(),
      });
      await this.auditWith(
        repository,
        principal.user.id,
        "project.version.create",
        "named_version",
        version.id,
        projectId,
        traceId,
        { name: version.name, revision: version.revision },
      );
      return version;
    });
  }

  async listNamedVersions(
    principal: Principal,
    projectId: string,
  ): Promise<NamedVersion[]> {
    await this.requireCollaborationRole(principal, projectId, false);
    return this.dependencies.repository.listNamedVersions(projectId);
  }

  async getNamedVersion(
    principal: Principal,
    projectId: string,
    versionId: string,
  ): Promise<NamedVersion> {
    await this.requireCollaborationRole(principal, projectId, false);
    const version = await this.dependencies.repository.findNamedVersion(
      projectId,
      versionId,
    );
    if (!version)
      throw new ApiError("not_found", "Named version not found", 404);
    return version;
  }

  async restoreNamedVersion(
    principal: Principal,
    projectId: string,
    versionId: string,
    input: RestoreNamedVersionRequest,
    traceId: string,
  ): Promise<NamedVersion> {
    await this.requireCollaborationRole(principal, projectId, true);
    return this.dependencies.repository.transaction(async (repository) => {
      await this.requireCollaborationRole(
        principal,
        projectId,
        true,
        repository,
      );
      const version = await repository.findNamedVersion(projectId, versionId);
      if (!version)
        throw new ApiError("not_found", "Named version not found", 404);
      const candidate = new Y.Doc();
      applyCollaborationState(candidate, version.state);
      const validated = encodeCollaborationState(candidate);
      const current = await repository.findProjectDocument(projectId);
      const restoredDocument = await repository.upsertProjectDocument({
        projectId,
        ...validated,
        now: this.dependencies.now(),
        expectedRevision: current?.revision ?? 0,
      });
      const restored = await repository.createNamedVersion({
        projectId,
        actorId: principal.user.id,
        name: input.name,
        state: restoredDocument.state,
        stateVector: restoredDocument.stateVector,
        revision: restoredDocument.revision,
        restoredFromId: version.id,
        now: this.dependencies.now(),
      });
      await this.auditWith(
        repository,
        principal.user.id,
        "project.version.restore",
        "named_version",
        restored.id,
        projectId,
        traceId,
        { restoredFromId: version.id, revision: restored.revision },
      );
      return restored;
    });
  }

  async createComment(
    principal: Principal,
    projectId: string,
    input: CreateCommentRequest,
    traceId: string,
  ): Promise<ProjectComment> {
    await this.requireCommentRole(principal, projectId);
    return this.dependencies.repository.transaction(async (repository) => {
      await this.requireCommentRole(principal, projectId, repository);
      await this.validateMentions(repository, projectId, input.mentionUserIds);
      if (input.nodeId)
        await this.validateNodeAnchor(repository, projectId, input.nodeId);
      const comment = await repository.createComment({
        projectId,
        authorId: principal.user.id,
        body: input.body,
        nodeId: input.nodeId ?? null,
        positionX: input.position?.x ?? null,
        positionY: input.position?.y ?? null,
        mentionUserIds: input.mentionUserIds,
        resolvedAt: null,
        resolvedById: null,
        now: this.dependencies.now(),
      });
      await this.auditWith(
        repository,
        principal.user.id,
        "project.comment.create",
        "comment",
        comment.id,
        projectId,
        traceId,
        { nodeId: comment.nodeId, mentions: comment.mentionUserIds.length },
      );
      return comment;
    });
  }

  async listComments(
    principal: Principal,
    projectId: string,
  ): Promise<ProjectComment[]> {
    await this.requireCollaborationRole(principal, projectId, false);
    return this.dependencies.repository.listComments(projectId);
  }

  async getComment(
    principal: Principal,
    projectId: string,
    commentId: string,
  ): Promise<ProjectComment> {
    await this.requireCollaborationRole(principal, projectId, false);
    const comment = await this.dependencies.repository.findComment(
      projectId,
      commentId,
    );
    if (!comment) throw new ApiError("not_found", "Comment not found", 404);
    return comment;
  }

  async updateComment(
    principal: Principal,
    projectId: string,
    commentId: string,
    input: UpdateCommentRequest,
    traceId: string,
  ): Promise<ProjectComment> {
    await this.requireCommentRole(principal, projectId);
    return this.dependencies.repository.transaction(async (repository) => {
      await this.requireCommentRole(principal, projectId, repository);
      const current = await repository.findComment(projectId, commentId);
      if (!current) throw new ApiError("not_found", "Comment not found", 404);
      if (current.authorId !== principal.user.id)
        throw new ApiError(
          "forbidden",
          "Only the comment author can edit it",
          403,
        );
      if (input.mentionUserIds)
        await this.validateMentions(
          repository,
          projectId,
          input.mentionUserIds,
        );
      const updated = await repository.updateComment(projectId, commentId, {
        ...(input.body === undefined ? {} : { body: input.body }),
        ...(input.mentionUserIds === undefined
          ? {}
          : { mentionUserIds: input.mentionUserIds }),
        now: this.dependencies.now(),
      });
      if (!updated) throw new ApiError("not_found", "Comment not found", 404);
      await this.auditWith(
        repository,
        principal.user.id,
        "project.comment.update",
        "comment",
        commentId,
        projectId,
        traceId,
        {},
      );
      return updated;
    });
  }

  async resolveComment(
    principal: Principal,
    projectId: string,
    commentId: string,
    input: ResolveCommentRequest,
    traceId: string,
  ): Promise<ProjectComment> {
    await this.requireCommentRole(principal, projectId);
    return this.dependencies.repository.transaction(async (repository) => {
      await this.requireCommentRole(principal, projectId, repository);
      const updated = await repository.resolveComment(projectId, commentId, {
        resolvedAt: input.resolved ? this.dependencies.now() : null,
        resolvedById: input.resolved ? principal.user.id : null,
        now: this.dependencies.now(),
      });
      if (!updated) throw new ApiError("not_found", "Comment not found", 404);
      await this.auditWith(
        repository,
        principal.user.id,
        input.resolved ? "project.comment.resolve" : "project.comment.reopen",
        "comment",
        commentId,
        projectId,
        traceId,
        {},
      );
      return updated;
    });
  }

  private async issueSession(
    userId: string,
    repository = this.dependencies.repository,
  ): Promise<{
    sessionToken: string;
    csrfToken: string;
    expiresAt: Date;
  }> {
    const sessionSecret = issueSecret();
    const csrfSecret = issueSecret();
    const sessionToken = `bcs_${sessionSecret.raw}`;
    const now = this.dependencies.now();
    const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
    await repository.createSession({
      userId,
      tokenHash: sha256(sessionToken),
      csrfHash: csrfSecret.hash,
      expiresAt,
      now,
    });
    return {
      sessionToken,
      csrfToken: csrfSecret.raw,
      expiresAt,
    };
  }

  private async requireCollaborationRole(
    principal: Principal,
    projectId: string,
    write: boolean,
    repository: RepositoryPort = this.dependencies.repository,
  ): Promise<ProjectMember> {
    const project = await repository.findProjectById(projectId);
    if (!project) throw new ApiError("not_found", "Project not found", 404);
    if (project.archivedAt)
      throw new ApiError(
        "project_archived",
        "Archived projects are read-only",
        409,
      );
    const member = await repository.findProjectMember(
      projectId,
      principal.user.id,
    );
    if (
      !member ||
      (write && member.role !== "owner" && member.role !== "editor")
    )
      throw new ApiError("forbidden", "Project access denied", 403);
    return member;
  }

  private async requireCommentRole(
    principal: Principal,
    projectId: string,
    repository: RepositoryPort = this.dependencies.repository,
  ): Promise<ProjectMember> {
    const member = await this.requireCollaborationRole(
      principal,
      projectId,
      false,
      repository,
    );
    if (member.role === "viewer")
      throw new ApiError("forbidden", "Comment access denied", 403);
    return member;
  }

  private async validateMentions(
    repository: RepositoryPort,
    projectId: string,
    userIds: string[],
  ): Promise<void> {
    if (userIds.length === 0) return;
    const members = await repository.findProjectMembers(projectId);
    const eligible = new Set(members.map(({ userId }) => userId));
    for (const userId of userIds) {
      const user = await repository.findUserById(userId);
      if (!eligible.has(userId) || !user || user.status !== "active")
        throw new ApiError(
          "invalid_mentions",
          "Mentioned users must be active project members",
          400,
        );
    }
  }

  private async validateNodeAnchor(
    repository: RepositoryPort,
    projectId: string,
    nodeId: string,
  ): Promise<void> {
    const persisted = await repository.findProjectDocument(projectId);
    if (!persisted)
      throw new ApiError(
        "invalid_node_anchor",
        "Comment node does not exist",
        400,
      );
    const yDocument = new Y.Doc();
    applyCollaborationState(yDocument, persisted.state);
    const semantic = readSemanticDocument(yDocument);
    const roots = [
      ...semantic.components.map(({ root }) => root),
      ...semantic.pages.flatMap(({ artboards }) =>
        artboards.map(({ root }) => root),
      ),
    ];
    if (!roots.some((root) => nodeTreeContains(root, nodeId)))
      throw new ApiError(
        "invalid_node_anchor",
        "Comment node does not exist",
        400,
      );
  }

  private async activeUser(userId: string): Promise<User> {
    const user = await this.dependencies.repository.findUserById(userId);
    if (!user || user.status !== "active") {
      throw new ApiError("unauthorized", "Authentication required", 401);
    }
    return user;
  }

  private requireAdmin(principal: Principal): void {
    if (!principal.user.isAdmin) {
      throw new ApiError("forbidden", "Administrator access required", 403);
    }
    if (principal.kind === "pat" && !principal.token.scopes.includes("admin")) {
      throw new ApiError(
        "insufficient_scope",
        "Personal access token lacks the required scope",
        403,
      );
    }
  }

  private requireSession(principal: Principal): void {
    if (principal.kind !== "session") {
      throw new ApiError(
        "invalid_auth_method",
        "This operation requires a cookie session",
        403,
      );
    }
  }

  private async requireProject(
    principal: Principal,
    projectId: string,
    action: ProjectAction,
  ): Promise<ProjectMember> {
    const member = await this.dependencies.repository.findProjectMember(
      projectId,
      principal.user.id,
    );
    if (!member || !canProjectRole(member.role, action)) {
      throw new ApiError("forbidden", "Project access denied", 403);
    }
    return member;
  }

  private async auditWith(
    repository: RepositoryPort,
    actorId: string | null,
    action: string,
    targetType: string,
    targetId: string | null,
    projectId: string | null,
    traceId: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    await repository.createAuditEvent({
      actorId,
      action,
      targetType,
      targetId,
      projectId,
      traceId,
      metadata,
      now: this.dependencies.now(),
    });
  }
}

export function publicUser(user: User): PublicUser {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    status: user.status,
    locale: user.locale,
    isAdmin: user.isAdmin,
  };
}

function nodeTreeContains(root: DesignNode, nodeId: string): boolean {
  const pending: DesignNode[] = [root];
  while (pending.length > 0) {
    const current = pending.pop();
    if (!current) continue;
    if (current.id === nodeId) return true;
    pending.push(...getNodeChildren(current));
  }
  return false;
}
