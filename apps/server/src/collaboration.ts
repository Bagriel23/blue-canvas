import { randomUUID } from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";

import {
  applyCollaborationState,
  createInitialCollaborationDocument,
  encodeCollaborationState,
  MAX_COLLABORATION_UPDATE_BYTES,
  readSemanticDocument,
  replaceSemanticDocument,
  validateProspectiveUpdate,
} from "@blue-canvas/collaboration";
import type { ProjectRole } from "@blue-canvas/contracts";
import {
  Hocuspocus,
  type Connection,
  type Document as HocuspocusDocument,
} from "@hocuspocus/server";
import {
  applyCommandBatch,
  CommandError,
  createCommandState,
} from "@blue-canvas/commands";
import type { FastifyRequest } from "fastify";
import type WebSocket from "ws";

import { ApiError, ApplicationService, type Principal } from "./core.js";
import type { RepositoryPort } from "./domain.js";

const MAX_EDITORS_PER_PROJECT = 10;
const PROJECT_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type CollaborationCredential =
  | { kind: "session"; sessionToken: string; csrfToken: string }
  | { kind: "pat"; bearerToken: string };

interface CollaborationContext {
  credential?: CollaborationCredential;
  projectId?: string;
  role?: ProjectRole;
  userId?: string;
  writerReserved?: boolean;
}

export interface CollaborationManagerDependencies {
  repository: RepositoryPort;
  service: ApplicationService;
  now: () => Date;
}

export class CollaborationManager {
  readonly hocuspocus: Hocuspocus<CollaborationContext>;
  private readonly writers = new Map<string, Set<string>>();
  private readonly restoring = new Set<string>();
  private readonly projectLocks = new Map<string, Promise<void>>();
  private readonly lockContext = new AsyncLocalStorage<Set<string>>();
  private readonly messageReleases = new Map<string, () => void>();
  private readonly restoreGenerations = new Map<string, number>();

  constructor(private readonly dependencies: CollaborationManagerDependencies) {
    this.hocuspocus = new Hocuspocus<CollaborationContext>({
      quiet: true,
      debounce: 100,
      maxDebounce: 1_000,
      unloadImmediately: true,
      timeout: 30_000,
      maxUnauthenticatedQueueSize: MAX_COLLABORATION_UPDATE_BYTES + 64 * 1024,
      maxUnauthenticatedQueueMessages: 100,
      maxPendingDocuments: 1,
      flushDelay: 0,
      flushMaxBytes: MAX_COLLABORATION_UPDATE_BYTES,
      onAuthenticate: async (payload) => {
        if (!PROJECT_ID.test(payload.documentName)) throw permissionDenied();
        if (this.restoring.has(payload.documentName))
          throw permissionDenied("document-restoring");
        const credential = credentialFrom(
          payload.requestHeaders,
          payload.token,
        );
        const principal = await authenticateCredential(
          dependencies.service,
          credential,
          false,
        );
        const member = await dependencies.service.collaborationAccess(
          principal,
          payload.documentName,
          false,
        );
        const canWrite = credentialCanWrite(credential, principal, member.role);
        payload.connectionConfig.readOnly = !canWrite;
        const context: CollaborationContext = {
          credential,
          projectId: payload.documentName,
          role: member.role,
          userId: principal.user.id,
          writerReserved: false,
        };
        if (canWrite) {
          this.reserveWriter(payload.documentName, payload.socketId);
          context.writerReserved = true;
        }
        return context;
      },
      onLoadDocument: async ({ document, documentName }) =>
        this.withProjectLock(documentName, async () => {
          const persisted =
            await dependencies.repository.findProjectDocument(documentName);
          if (persisted) {
            applyCollaborationState(document, persisted.state);
            encodeCollaborationState(document);
            return document;
          }
          const project =
            await dependencies.repository.findProjectById(documentName);
          if (!project || project.archivedAt) throw permissionDenied();
          const initial = createInitialCollaborationDocument(
            project.id,
            project.name,
          );
          try {
            const encoded = encodeCollaborationState(initial);
            await dependencies.repository.upsertProjectDocument({
              projectId: documentName,
              ...encoded,
              expectedRevision: 0,
              now: dependencies.now(),
            });
            applyCollaborationState(document, encoded.state);
          } catch (error) {
            if (
              !(error instanceof ApiError) ||
              error.code !== "revision_conflict"
            )
              throw error;
            const concurrent =
              await dependencies.repository.findProjectDocument(documentName);
            if (!concurrent) throw error;
            applyCollaborationState(document, concurrent.state);
          } finally {
            initial.destroy();
          }
          return document;
        }),
      beforeHandleMessage: async ({ documentName, socketId }) => {
        const key = messageLockKey(documentName, socketId);
        const generation = this.restoreGenerations.get(documentName) ?? 0;
        const release = await this.acquireProjectLock(documentName);
        if (
          this.restoring.has(documentName) ||
          generation !== (this.restoreGenerations.get(documentName) ?? 0)
        ) {
          release();
          throw permissionDenied("document-restoring");
        }
        this.messageReleases.set(key, release);
      },
      afterHandleMessage: async ({ documentName, socketId }) => {
        const key = messageLockKey(documentName, socketId);
        const release = this.messageReleases.get(key);
        if (release) {
          this.messageReleases.delete(key);
          release();
        }
      },
      beforeSync: async ({
        context,
        connection,
        document,
        documentName,
        payload,
        type,
      }) => {
        const operation = async () => {
          if (this.restoring.has(documentName)) {
            connection.close({ code: 1008, reason: "document-restoring" });
            throw permissionDenied("document-restoring");
          }
          if (type !== 1 && type !== 2) return;
          const canWrite = await this.revalidate(
            context,
            documentName,
            connection,
          );
          connection.readOnly = !canWrite;
          if (!canWrite) return;
          try {
            validateProspectiveUpdate(document, payload);
          } catch {
            connection.readOnly = true;
            connection.close({ code: 1009, reason: "update-rejected" });
          }
        };
        return this.messageReleases.has(
          messageLockKey(documentName, connection.socketId),
        )
          ? operation()
          : this.withProjectLock(documentName, operation);
      },
      onStoreDocument: async ({ document, documentName }) =>
        this.withProjectLock(documentName, async () => {
          const encoded = encodeCollaborationState(document);
          const persisted =
            await dependencies.repository.findProjectDocument(documentName);
          if (
            persisted &&
            bytesEqual(persisted.stateVector, encoded.stateVector)
          )
            return;
          await dependencies.repository.upsertProjectDocument({
            projectId: documentName,
            ...encoded,
            now: dependencies.now(),
          });
        }),
      onDisconnect: async ({ context, documentName, socketId }) => {
        if (context.writerReserved) this.releaseWriter(documentName, socketId);
      },
    });
  }

  handle(socket: WebSocket, request: FastifyRequest): void {
    const connection = this.hocuspocus.handleConnection(
      socket,
      webRequest(request),
    );
    socket.on("message", (data) => {
      const bytes = Array.isArray(data)
        ? Uint8Array.from(Buffer.concat(data))
        : Uint8Array.from(data as Uint8Array);
      connection.handleMessage(bytes);
    });
    socket.on("close", (code, reason) => {
      connection.handleClose({ code, reason: reason.toString() });
    });
    socket.on("error", () => {
      connection.handleClose({ code: 1011, reason: "websocket-error" });
    });
  }

  async prepareRestore(
    projectId: string,
    reserved = false,
  ): Promise<() => void> {
    if (this.restoring.has(projectId) && !reserved)
      throw new ApiError(
        "restore_in_progress",
        "A restore is already in progress",
        409,
      );
    const ownsReservation = !this.restoring.has(projectId);
    if (ownsReservation) this.reserveRestore(projectId);
    try {
      return await this.withProjectLock(projectId, () =>
        this.prepareRestoreUnlocked(projectId),
      );
    } catch (error) {
      if (ownsReservation) this.cancelRestore(projectId);
      throw error;
    }
  }

  reserveRestore(projectId: string): void {
    if (this.restoring.has(projectId))
      throw new ApiError(
        "restore_in_progress",
        "A restore is already in progress",
        409,
      );
    this.restoring.add(projectId);
    this.restoreGenerations.set(
      projectId,
      (this.restoreGenerations.get(projectId) ?? 0) + 1,
    );
  }

  cancelRestore(projectId: string): void {
    this.restoring.delete(projectId);
    this.restoreGenerations.set(
      projectId,
      (this.restoreGenerations.get(projectId) ?? 0) + 1,
    );
  }

  private async prepareRestoreUnlocked(projectId: string): Promise<() => void> {
    try {
      const document = this.hocuspocus.documents.get(projectId);
      if (document) {
        await this.storeActiveDocument(document);
        this.hocuspocus.closeConnections(projectId);
        await waitForNoConnections(document);
        await this.hocuspocus.unloadDocument(document);
      }
      return () => {
        this.cancelRestore(projectId);
      };
    } catch (error) {
      this.cancelRestore(projectId);
      throw error;
    }
  }

  async flushProject(projectId: string): Promise<void> {
    await this.withProjectLock(projectId, () =>
      this.flushProjectUnlocked(projectId),
    );
  }

  private async flushProjectUnlocked(projectId: string): Promise<void> {
    const document = this.hocuspocus.documents.get(projectId);
    if (document) await this.storeActiveDocument(document);
  }

  async withProjectLock<T>(
    projectId: string,
    operation: () => Promise<T>,
  ): Promise<T> {
    const held = this.lockContext.getStore();
    if (held?.has(projectId)) return operation();

    const release = await this.acquireProjectLock(projectId);
    try {
      const nextHeld = new Set(held ?? []);
      nextHeld.add(projectId);
      return await this.lockContext.run(nextHeld, operation);
    } finally {
      release();
    }
  }

  private async acquireProjectLock(projectId: string): Promise<() => void> {
    if (this.lockContext.getStore()?.has(projectId)) return () => undefined;
    const preceding = this.projectLocks.get(projectId) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => {
      release = () => {
        resolve();
        if (this.projectLocks.get(projectId) === current)
          this.projectLocks.delete(projectId);
      };
    });
    this.projectLocks.set(projectId, current);
    await preceding;
    return release;
  }

  captureProjectStateVector(projectId: string): Uint8Array | undefined {
    const document = this.hocuspocus.documents.get(projectId);
    return document
      ? encodeCollaborationState(document).stateVector
      : undefined;
  }

  async applyProjectSnapshot(
    projectId: string,
    snapshot: unknown,
    expectedStateVector?: Uint8Array,
  ): Promise<boolean> {
    const document = this.hocuspocus.documents.get(projectId);
    if (!document) return true;
    if (
      expectedStateVector &&
      !bytesEqual(
        expectedStateVector,
        encodeCollaborationState(document).stateVector,
      )
    )
      return false;
    document.transact(
      () => {
        replaceSemanticDocument(document, snapshot);
      },
      { source: "local", skipStoreHooks: true },
    );
    return true;
  }

  async rebaseProjectCommands(
    projectId: string,
    commands: unknown[],
    actorId: string,
    idempotencyKey: string,
  ): Promise<{ revision: number; document: unknown }> {
    return this.withProjectLock(projectId, () =>
      this.rebaseProjectCommandsUnlocked(
        projectId,
        commands,
        actorId,
        idempotencyKey,
      ),
    );
  }

  private async rebaseProjectCommandsUnlocked(
    projectId: string,
    commands: unknown[],
    actorId: string,
    idempotencyKey: string,
  ): Promise<{ revision: number; document: unknown }> {
    const document = this.hocuspocus.documents.get(projectId);
    if (!document)
      throw new ApiError("not_found", "Project document not found", 404);

    const previous = structuredClone(readSemanticDocument(document));
    let committed = false;
    try {
      let rebased;
      document.transact(
        () => {
          rebased = applyCommandBatch(
            createCommandState(readSemanticDocument(document)),
            {
              id: randomUUID(),
              actorId,
              baseRevision: 0,
              commands,
            },
          );
          replaceSemanticDocument(document, rebased.document);
        },
        { source: "local", skipStoreHooks: true },
      );
      if (!rebased) throw new Error("Command rebase produced no document");
      const rebasedDocument = structuredClone(readSemanticDocument(document));
      const encoded = encodeCollaborationState(document);
      const updated = await this.dependencies.repository.transaction(
        async (repository) => {
          const persisted = await repository.findProjectDocument(projectId);
          const result = await repository.upsertProjectDocument({
            projectId,
            ...encoded,
            expectedRevision: persisted?.revision ?? 0,
            now: this.dependencies.now(),
          });
          const receipt = await repository.updateCommandReceipt({
            projectId,
            idempotencyKey,
            revision: result.revision,
            document: rebasedDocument,
          });
          if (!receipt)
            throw new ApiError("not_found", "Command receipt not found", 404);
          return result;
        },
      );
      committed = true;
      const currentStateVector = encodeCollaborationState(document).stateVector;
      if (!bytesEqual(encoded.stateVector, currentStateVector)) {
        await this.flushProject(projectId);
        const latest =
          await this.dependencies.repository.findProjectDocument(projectId);
        if (latest) {
          await this.dependencies.repository.updateCommandReceipt({
            projectId,
            idempotencyKey,
            revision: latest.revision,
            document: readSemanticDocument(document),
          });
          return {
            revision: latest.revision,
            document: readSemanticDocument(document),
          };
        }
      }
      return {
        revision: updated.revision,
        document: rebasedDocument,
      };
    } catch (error) {
      if (!committed) {
        document.transact(
          () => {
            replaceSemanticDocument(document, previous);
          },
          { source: "local", skipStoreHooks: true },
        );
      }
      if (!(error instanceof CommandError)) throw error;
      const invalid = new Set([
        "INVALID_BATCH",
        "INVALID_PATCH",
        "INVALID_RESULT",
      ]);
      throw new ApiError(
        invalid.has(error.code) ? "invalid_command_batch" : "revision_conflict",
        error.message,
        invalid.has(error.code) ? 400 : 409,
        { code: error.code },
      );
    }
  }

  async close(): Promise<void> {
    this.hocuspocus.flushPendingStores();
    this.hocuspocus.closeConnections();
    const documents = [...this.hocuspocus.documents.values()];
    await Promise.all(documents.map(waitForNoConnections));
    await Promise.all(
      documents.map(async (document) => {
        if (this.hocuspocus.documents.has(document.name))
          await this.hocuspocus.unloadDocument(document);
      }),
    );
  }

  private async revalidate(
    context: CollaborationContext,
    projectId: string,
    connection: Connection<CollaborationContext>,
  ): Promise<boolean> {
    if (!context.credential || context.projectId !== projectId)
      throw permissionDenied();
    let principal: Principal;
    let member: Awaited<ReturnType<ApplicationService["collaborationAccess"]>>;
    try {
      principal = await authenticateCredential(
        this.dependencies.service,
        context.credential,
        true,
      );
      member = await this.dependencies.service.collaborationAccess(
        principal,
        projectId,
        false,
      );
    } catch {
      connection.readOnly = true;
      connection.close({ code: 1008, reason: "authorization-revoked" });
      if (context.writerReserved) {
        this.releaseWriter(projectId, connection.socketId);
        context.writerReserved = false;
      }
      return false;
    }
    const canWrite = credentialCanWrite(
      context.credential,
      principal,
      member.role,
    );
    context.role = member.role;
    if (canWrite && !context.writerReserved) {
      this.reserveWriter(projectId, connection.socketId);
      context.writerReserved = true;
    } else if (!canWrite && context.writerReserved) {
      this.releaseWriter(projectId, connection.socketId);
      context.writerReserved = false;
    }
    return canWrite;
  }

  private async storeActiveDocument(
    document: HocuspocusDocument,
  ): Promise<void> {
    await this.hocuspocus.storeDocumentHooks(
      document,
      {
        clientsCount: document.getConnectionsCount(),
        document,
        documentName: document.name,
        instance: this.hocuspocus,
        lastContext: {},
        lastTransactionOrigin: { source: "local" },
      },
      true,
    );
  }

  private reserveWriter(projectId: string, socketId: string): void {
    const current = this.writers.get(projectId) ?? new Set<string>();
    if (!current.has(socketId) && current.size >= MAX_EDITORS_PER_PROJECT)
      throw permissionDenied("editor-limit-reached");
    current.add(socketId);
    this.writers.set(projectId, current);
  }

  private releaseWriter(projectId: string, socketId: string): void {
    const current = this.writers.get(projectId);
    current?.delete(socketId);
    if (current?.size === 0) this.writers.delete(projectId);
  }
}

function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) return false;
  return left.every((byte, index) => byte === right[index]);
}

function messageLockKey(projectId: string, socketId: string): string {
  return `${projectId}:${socketId}`;
}

function credentialFrom(
  headers: Headers,
  token: string,
): CollaborationCredential {
  const sessionToken = cookieValue(
    headers.get("cookie"),
    "blue_canvas_session",
  );
  if (token.startsWith("bcp_")) {
    if (sessionToken) throw permissionDenied("ambiguous-credentials");
    return { kind: "pat", bearerToken: token };
  }
  if (!sessionToken || !token) throw permissionDenied();
  return { kind: "session", sessionToken, csrfToken: token };
}

async function authenticateCredential(
  service: ApplicationService,
  credential: CollaborationCredential,
  mutating: boolean,
): Promise<Principal> {
  try {
    if (credential.kind === "pat") {
      return await service.authenticate({
        bearerToken: credential.bearerToken,
        mutating,
        requiredScope: mutating ? "projects:write" : "projects:read",
      });
    }
    return await service.authenticate({
      sessionToken: credential.sessionToken,
      csrfToken: credential.csrfToken,
      mutating,
    });
  } catch {
    throw permissionDenied();
  }
}

function credentialCanWrite(
  credential: CollaborationCredential,
  principal: Principal,
  role: ProjectRole,
): boolean {
  if (role !== "owner" && role !== "editor") return false;
  return (
    credential.kind === "session" ||
    (principal.kind === "pat" &&
      principal.token.scopes.includes("projects:write"))
  );
}

function cookieValue(header: string | null, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 1 || part.slice(0, separator).trim() !== name) continue;
    const raw = part.slice(separator + 1).trim();
    try {
      return decodeURIComponent(raw);
    } catch {
      return undefined;
    }
  }
  return undefined;
}

function webRequest(request: FastifyRequest): Request {
  const headers = new Headers();
  for (const [name, value] of Object.entries(request.headers)) {
    if (Array.isArray(value))
      value.forEach((entry) => headers.append(name, entry));
    else if (value !== undefined) headers.set(name, String(value));
  }
  const host = headers.get("host") ?? "localhost";
  return new Request(`http://${host}${request.raw.url ?? "/"}`, { headers });
}

function permissionDenied(
  reason = "permission-denied",
): Error & { reason: string } {
  return Object.assign(new Error(reason), { reason });
}

async function waitForNoConnections(document: {
  getConnectionsCount(): number;
}): Promise<void> {
  const deadline = Date.now() + 2_000;
  while (document.getConnectionsCount() > 0) {
    if (Date.now() > deadline)
      throw new Error(
        "Timed out waiting for collaboration connections to close",
      );
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}
