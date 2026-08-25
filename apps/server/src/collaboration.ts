import {
  applyCollaborationState,
  createInitialCollaborationDocument,
  encodeCollaborationState,
  MAX_COLLABORATION_UPDATE_BYTES,
  validateProspectiveUpdate,
} from "@blue-canvas/collaboration";
import type { ProjectRole } from "@blue-canvas/contracts";
import {
  Hocuspocus,
  type Connection,
  type Document as HocuspocusDocument,
} from "@hocuspocus/server";
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
      onLoadDocument: async ({ document, documentName }) => {
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
        const encoded = encodeCollaborationState(initial);
        try {
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
        }
        return document;
      },
      beforeSync: async ({
        context,
        connection,
        document,
        documentName,
        payload,
        type,
      }) => {
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
      },
      onStoreDocument: async ({ document, documentName }) => {
        const encoded = encodeCollaborationState(document);
        await dependencies.repository.upsertProjectDocument({
          projectId: documentName,
          ...encoded,
          now: dependencies.now(),
        });
      },
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

  async prepareRestore(projectId: string): Promise<() => void> {
    if (this.restoring.has(projectId))
      throw new ApiError(
        "restore_in_progress",
        "A restore is already in progress",
        409,
      );
    this.restoring.add(projectId);
    try {
      const document = this.hocuspocus.documents.get(projectId);
      if (document) {
        await this.storeActiveDocument(document);
        this.hocuspocus.closeConnections(projectId);
        await waitForNoConnections(document);
        await this.hocuspocus.unloadDocument(document);
      }
      return () => {
        this.restoring.delete(projectId);
      };
    } catch (error) {
      this.restoring.delete(projectId);
      throw error;
    }
  }

  async flushProject(projectId: string): Promise<void> {
    const document = this.hocuspocus.documents.get(projectId);
    if (document) await this.storeActiveDocument(document);
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
