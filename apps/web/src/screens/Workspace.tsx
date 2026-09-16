import { useCallback, useEffect, useRef, useState } from "react";

import {
  applyCommandBatch,
  createCommandState,
  type DesignCommand,
} from "@blue-canvas/commands";
import type { DesignDocument } from "@blue-canvas/document";
import { Download, Eye, RefreshCw, Share2, X } from "lucide-react";

import { ApiError } from "../api/client.js";
import type { ProjectDocumentResponse, ProjectSummary } from "../api/types.js";
import { Canvas } from "../canvas/Canvas.js";
import { currentArtboardRoot, findNodeById } from "../canvas/selection.js";
import { ExportDialog } from "../dialogs/ExportDialog.js";
import { ShareDialog } from "../dialogs/ShareDialog.js";
import { LayersPanel } from "../panels/LayersPanel.js";
import { InspectorPanel } from "../panels/InspectorPanel.js";
import { PagesPanel } from "../panels/PagesPanel.js";
import { PreviewMode } from "../preview/PreviewMode.js";
import {
  applySemanticDocument,
  createCollaborationClient,
  type CollaborationClient,
  type CollaborationStatus,
} from "../collaboration/provider.js";
import { useLocale } from "../state/locale.js";
import { useSession } from "../state/session.js";

interface WorkspaceProps {
  projectId: string;
  editable?: boolean;
}

type DialogState = { kind: "none" } | { kind: "share" } | { kind: "export" };
type SyncState = "saved" | "saving" | "conflict" | "error";
type WorkspaceResource =
  | { status: "loading" }
  | { status: "error"; message: string }
  | {
      status: "ready";
      project: ProjectSummary;
      document: DesignDocument;
      revision: number;
      sync: SyncState;
      syncMessage?: string;
    };

interface EditorRef {
  generation: number;
  document: DesignDocument | null;
  revision: number;
  pending: PendingCommand[];
  processing: boolean;
}

interface PendingCommand {
  command: DesignCommand;
  idempotencyKey: string;
}

interface CommandResponse {
  revision: number;
  document: DesignDocument;
  idempotent: boolean;
}

export function Workspace({ projectId, editable = true }: WorkspaceProps) {
  const { client } = useSession();
  const { messages } = useLocale();
  const workspaceMessagesRef = useRef(messages.workspace);
  workspaceMessagesRef.current = messages.workspace;
  const [resource, setResource] = useState<WorkspaceResource>({
    status: "loading",
  });
  const [activePageId, setActivePageId] = useState("");
  const [activeArtboardId, setActiveArtboardId] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<DialogState>({ kind: "none" });
  const [previewing, setPreviewing] = useState(false);
  const editorRef = useRef<EditorRef>({
    generation: 0,
    document: null,
    revision: 0,
    pending: [],
    processing: false,
  });
  const requestGeneration = useRef(0);
  const collaborationRef = useRef<CollaborationClient | null>(null);
  const [collaborationStatus, setCollaborationStatus] =
    useState<CollaborationStatus>("connecting");
  const [presence, setPresence] = useState<unknown[]>([]);

  const loadDocument =
    useCallback(async (): Promise<ProjectDocumentResponse> => {
      const result = await client.request<ProjectDocumentResponse>({
        path: `/api/v1/projects/${encodeURIComponent(projectId)}/document`,
      });
      return result.data;
    }, [client, projectId]);

  const refresh = useCallback(async () => {
    const generation = ++requestGeneration.current;
    editorRef.current.generation = generation;
    setResource({ status: "loading" });
    try {
      const loaded = await loadDocument();
      if (generation !== requestGeneration.current) return;
      editorRef.current = {
        generation,
        document: loaded.document,
        revision: loaded.revision,
        pending: [],
        processing: false,
      };
      setResource({
        status: "ready",
        project: loaded.project,
        document: loaded.document,
        revision: loaded.revision,
        sync: "saved",
      });
      setSelectedId(null);
    } catch (raw) {
      if (generation !== requestGeneration.current) return;
      setResource({
        status: "error",
        message:
          raw instanceof ApiError
            ? raw.message
            : workspaceMessagesRef.current.loadError,
      });
    }
  }, [loadDocument]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const selectedNode =
    resource.status === "ready"
      ? (() => {
          const activePage =
            resource.document.pages.find((page) => page.id === activePageId) ??
            resource.document.pages[0];
          const activeArtboard =
            activePage?.artboards.find(
              (artboard) => artboard.id === activeArtboardId,
            ) ?? activePage?.artboards[0];
          const root = currentArtboardRoot(
            resource.document,
            activePage?.id ?? "",
            activeArtboard?.id ?? "",
          );
          return root && selectedId
            ? (findNodeById(root, selectedId)?.node ?? null)
            : null;
        })()
      : null;

  const updateDocument = useCallback(
    (document: DesignDocument, sync: SyncState, syncMessage?: string) => {
      setResource((current) =>
        current.status !== "ready"
          ? current
          : {
              ...current,
              document,
              revision: editorRef.current.revision,
              sync,
              ...(syncMessage === undefined ? {} : { syncMessage }),
            },
      );
    },
    [],
  );

  useEffect(() => {
    if (resource.status !== "ready" || collaborationRef.current) return;
    const connection = createCollaborationClient({
      projectId,
      token: client.getCsrfToken(),
      onDocument: (document) => {
        editorRef.current.document = document;
        updateDocument(document, "saved");
      },
      onStatus: setCollaborationStatus,
      onPresence: setPresence,
    });
    collaborationRef.current = connection;
    return () => {
      connection?.destroy();
      collaborationRef.current = null;
    };
  }, [client, projectId, resource.status, updateDocument]);

  const applyLocalCommand = useCallback(
    (document: DesignDocument, command: DesignCommand): DesignDocument => {
      const result = applyCommandBatch(createCommandState(document), {
        id: randomId(),
        actorId: randomId(),
        baseRevision: 0,
        commands: [command],
      });
      return result.document;
    },
    [],
  );

  const syncQueue = useCallback(async () => {
    const editor = editorRef.current;
    const generation = editor.generation;
    if (editor.processing) return;
    editor.processing = true;
    try {
      while (editor.pending.length > 0 && editor.document) {
        if (editorRef.current.generation !== generation) break;
        const pending = editor.pending[0];
        if (!pending) break;
        const command = pending.command;
        try {
          const result = await client.request<CommandResponse>({
            method: "POST",
            path: `/api/v1/projects/${encodeURIComponent(projectId)}/commands`,
            body: {
              baseRevision: editor.revision,
              idempotencyKey: pending.idempotencyKey,
              commands: [command],
            },
          });
          if (editorRef.current.generation !== generation) break;
          editor.pending.shift();
          if (result.data.idempotent) {
            editor.revision = Math.max(editor.revision, result.data.revision);
            updateDocument(
              editor.document,
              editor.pending.length ? "saving" : "saved",
            );
            continue;
          }
          editor.revision = result.data.revision;
          let nextDocument = result.data.document;
          for (const queued of editor.pending) {
            nextDocument = applyLocalCommand(nextDocument, queued.command);
          }
          editor.document = nextDocument;
          updateDocument(
            nextDocument,
            editor.pending.length ? "saving" : "saved",
          );
        } catch (raw) {
          if (editorRef.current.generation !== generation) break;
          if (!(raw instanceof ApiError) || raw.code !== "revision_conflict") {
            const irreconcilable =
              raw instanceof ApiError && raw.status >= 400 && raw.status < 500;
            updateDocument(
              editor.document,
              irreconcilable ? "conflict" : "error",
              raw instanceof ApiError
                ? raw.message
                : workspaceMessagesRef.current.loadError,
            );
            break;
          }

          try {
            const latest = await loadDocument();
            if (editorRef.current.generation !== generation) break;
            editor.revision = latest.revision;
            let rebased = latest.document;
            for (const queued of editor.pending) {
              rebased = applyLocalCommand(rebased, queued.command);
            }
            editor.document = rebased;
            updateDocument(
              rebased,
              "conflict",
              workspaceMessagesRef.current.conflict,
            );
          } catch (recoveryError) {
            if (editorRef.current.generation !== generation) break;
            updateDocument(
              editor.document,
              "error",
              recoveryError instanceof ApiError
                ? recoveryError.message
                : workspaceMessagesRef.current.loadError,
            );
            break;
          }
        }
      }
    } finally {
      editor.processing = false;
    }
  }, [applyLocalCommand, client, loadDocument, projectId, updateDocument]);

  if (resource.status === "loading") {
    return (
      <section className="bc-workspace-status" aria-busy="true">
        <p>{messages.workspace.loading}</p>
      </section>
    );
  }

  if (resource.status === "error") {
    return (
      <section className="bc-workspace-status" role="alert">
        <p>{resource.message}</p>
        <button type="button" className="bc-btn" onClick={() => void refresh()}>
          <RefreshCw size={15} aria-hidden="true" />
          {messages.workspace.retry}
        </button>
      </section>
    );
  }

  const { document: doc, project } = resource;
  const canEdit =
    editable &&
    !project.archived &&
    (project.role === "owner" || project.role === "editor");
  const canManageSharing = project.role === "owner";
  const activePage =
    doc.pages.find((page) => page.id === activePageId) ?? doc.pages[0];
  const pageId = activePage?.id ?? "";
  const activeArtboard =
    activePage?.artboards.find(
      (artboard) => artboard.id === activeArtboardId,
    ) ?? activePage?.artboards[0];
  const artboardId = activeArtboard?.id ?? "";
  const root = currentArtboardRoot(doc, pageId, artboardId);

  const queueCommand = (command: DesignCommand) => {
    const editor = editorRef.current;
    if (!canEdit || !editor.document) return;
    try {
      editor.document = applyLocalCommand(editor.document, command);
    } catch {
      updateDocument(editor.document, "conflict", messages.workspace.conflict);
      return;
    }
    if (collaborationRef.current?.provider.isSynced) {
      applySemanticDocument(collaborationRef.current.document, editor.document);
      updateDocument(editor.document, "saving");
    } else {
      editor.pending.push({ command, idempotencyKey: randomId() });
      updateDocument(editor.document, "saving");
      void syncQueue();
    }
  };

  const handleSelectArtboard = (nextPageId: string, nextArtboardId: string) => {
    setActivePageId(nextPageId);
    setActiveArtboardId(nextArtboardId);
    setSelectedId(null);
  };

  const handleRename = (nodeId: string, name: string) => {
    queueCommand({
      type: "update-node",
      nodeId,
      patch: { name: name.trim() || "Untitled" },
    });
  };

  const handleEditText = (nodeId: string, text: string) => {
    queueCommand({ type: "update-node", nodeId, patch: { text } });
  };

  return (
    <>
      <div className="bc-workspace" data-project-id={projectId}>
        <aside className="bc-workspace__panel" data-side="left">
          <PagesPanel
            document={doc}
            activePageId={pageId}
            activeArtboardId={artboardId}
            onSelectArtboard={handleSelectArtboard}
          />
          <LayersPanel
            root={root}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
        </aside>
        <main className="bc-workspace__stage">
          <header className="bc-workspace__project-header">
            <div>
              <p className="bc-eyebrow">{messages.workspace.canvas}</p>
              <h1>{project.name}</h1>
            </div>
            <div className="bc-workspace__sync-wrap">
              <div
                className="bc-workspace__presence"
                aria-label="Realtime collaboration"
              >
                <span
                  className="bc-workspace__presence-dot"
                  data-status={collaborationStatus}
                />
                <span>
                  {collaborationStatus === "synced"
                    ? "Live"
                    : collaborationStatus}
                </span>
                {presence.length > 1 ? (
                  <span>{presence.length} collaborators</span>
                ) : null}
              </div>
              <p
                className="bc-workspace__sync"
                data-sync={resource.sync}
                aria-live="polite"
              >
                {resource.sync === "saving"
                  ? messages.workspace.saving
                  : resource.sync === "saved"
                    ? messages.workspace.saved
                    : resource.sync === "conflict"
                      ? (resource.syncMessage ?? messages.workspace.conflict)
                      : (resource.syncMessage ?? messages.workspace.loadError)}
              </p>
              {resource.sync === "error" || resource.sync === "conflict" ? (
                <>
                  <button
                    type="button"
                    className="bc-icon-btn bc-icon-btn--small"
                    aria-label={messages.workspace.retry}
                    title={messages.workspace.retry}
                    onClick={() => {
                      if (editorRef.current.pending.length === 0) {
                        void refresh();
                        return;
                      }
                      updateDocument(resource.document, "saving");
                      void syncQueue();
                    }}
                  >
                    <RefreshCw size={14} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className="bc-icon-btn bc-icon-btn--small"
                    aria-label={messages.workspace.discard}
                    title={messages.workspace.discard}
                    onClick={() => void refresh()}
                  >
                    <X size={14} aria-hidden="true" />
                  </button>
                </>
              ) : null}
            </div>
          </header>
          {previewing ? (
            activeArtboard ? (
              <PreviewMode
                document={doc}
                pageId={pageId}
                artboard={activeArtboard}
                onExit={() => setPreviewing(false)}
              />
            ) : null
          ) : (
            <Canvas
              document={doc}
              pageId={pageId}
              artboardId={artboardId}
              selectedId={selectedId}
              onSelect={setSelectedId}
              editable={editable}
            />
          )}
        </main>
        <aside className="bc-workspace__panel" data-side="right">
          <div
            className="bc-workspace__toolbar"
            aria-label={messages.workspace.canvasControls}
          >
            <button
              type="button"
              className="bc-btn"
              onClick={() => setPreviewing((value) => !value)}
              aria-pressed={previewing}
              title={
                previewing
                  ? messages.workspace.exitPreview
                  : messages.workspace.preview
              }
            >
              <Eye size={15} aria-hidden="true" />
              {previewing
                ? messages.workspace.exitPreview
                : messages.workspace.preview}
            </button>
            {canManageSharing ? (
              <button
                type="button"
                className="bc-btn"
                onClick={() => setDialog({ kind: "share" })}
                title={messages.workspace.share}
              >
                <Share2 size={15} aria-hidden="true" />
                {messages.workspace.share}
              </button>
            ) : null}
            <button
              type="button"
              className="bc-btn"
              data-variant="primary"
              onClick={() => setDialog({ kind: "export" })}
              title={messages.workspace.export}
            >
              <Download size={15} aria-hidden="true" />
              {messages.workspace.export}
            </button>
          </div>
          <InspectorPanel
            node={selectedNode}
            onRename={handleRename}
            onEditText={handleEditText}
            editable={canEdit && !previewing}
          />
        </aside>
      </div>
      {dialog.kind === "share" ? (
        <ShareDialog
          projectId={projectId}
          onClose={() => setDialog({ kind: "none" })}
        />
      ) : null}
      {dialog.kind === "export" ? (
        <ExportDialog
          projectId={projectId}
          currentPageId={pageId}
          currentSelection={selectedId}
          onClose={() => setDialog({ kind: "none" })}
        />
      ) : null}
    </>
  );
}

function randomId(): string {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `00000000-0000-4000-8000-${Math.floor(Math.random() * 1e16)
    .toString(16)
    .padStart(12, "0")}`;
}
