import { useCallback, useMemo, useState } from "react";

import { Canvas } from "../canvas/Canvas.js";
import { PagesPanel } from "../panels/PagesPanel.js";
import { LayersPanel } from "../panels/LayersPanel.js";
import { InspectorPanel } from "../panels/InspectorPanel.js";
import { ExportDialog } from "../dialogs/ExportDialog.js";
import { ShareDialog } from "../dialogs/ShareDialog.js";
import { PreviewMode } from "../preview/PreviewMode.js";
import { loadDemoDocument } from "../fixtures/demo.js";
import { currentArtboardRoot, findNodeById } from "../canvas/selection.js";
import { useLocale } from "../state/locale.js";

interface WorkspaceProps {
  projectId: string;
  editable?: boolean;
}

type DialogState = { kind: "none" } | { kind: "share" } | { kind: "export" };

export function Workspace({ projectId, editable = true }: WorkspaceProps) {
  const { messages } = useLocale();
  const [doc, setDoc] = useState(() => loadDemoDocument());
  const [activePageId, setActivePageId] = useState<string>(
    () => doc.pages[0]?.id ?? "",
  );
  const [activeArtboardId, setActiveArtboardId] = useState<string>(
    () => doc.pages[0]?.artboards[0]?.id ?? "",
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<DialogState>({ kind: "none" });
  const [previewing, setPreviewing] = useState(false);

  const root = currentArtboardRoot(doc, activePageId, activeArtboardId);
  const selectedNode = useMemo(() => {
    if (!root || !selectedId) return null;
    return findNodeById(root, selectedId)?.node ?? null;
  }, [root, selectedId]);

  const handleSelectArtboard = useCallback(
    (pageId: string, artboardId: string) => {
      setActivePageId(pageId);
      setActiveArtboardId(artboardId);
      setSelectedId(null);
    },
    [],
  );

  const handleRename = useCallback((nodeId: string, name: string) => {
    setDoc((current) => renameNode(current, nodeId, name));
  }, []);

  const handleEditText = useCallback((nodeId: string, text: string) => {
    setDoc((current) => editText(current, nodeId, text));
  }, []);

  return (
    <>
      <div className="bc-workspace" data-project-id={projectId}>
        <aside className="bc-workspace__panel" data-side="left">
          <PagesPanel
            document={doc}
            activePageId={activePageId}
            activeArtboardId={activeArtboardId}
            onSelectArtboard={handleSelectArtboard}
          />
          <LayersPanel
            root={root}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
        </aside>
        <main>
          {previewing ? (
            (() => {
              const artboard = doc.pages
                .find((page) => page.id === activePageId)
                ?.artboards.find((entry) => entry.id === activeArtboardId);
              if (!artboard) return null;
              return (
                <PreviewMode
                  document={doc}
                  pageId={activePageId}
                  artboard={artboard}
                  onExit={() => setPreviewing(false)}
                />
              );
            })()
          ) : (
            <Canvas
              document={doc}
              pageId={activePageId}
              artboardId={activeArtboardId}
              selectedId={selectedId}
              onSelect={setSelectedId}
              editable={editable}
            />
          )}
        </main>
        <aside className="bc-workspace__panel" data-side="right">
          <div style={{ display: "flex", gap: 6, padding: 12 }}>
            <button
              type="button"
              className="bc-btn"
              onClick={() => setPreviewing((value) => !value)}
              aria-pressed={previewing}
            >
              {messages.workspace.preview}
            </button>
            <button
              type="button"
              className="bc-btn"
              onClick={() => setDialog({ kind: "share" })}
            >
              {messages.workspace.share}
            </button>
            <button
              type="button"
              className="bc-btn"
              data-variant="primary"
              onClick={() => setDialog({ kind: "export" })}
            >
              {messages.workspace.export}
            </button>
          </div>
          <InspectorPanel
            node={selectedNode}
            onRename={handleRename}
            onEditText={handleEditText}
            editable={editable && !previewing}
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
          currentPageId={activePageId}
          currentSelection={selectedId}
          onClose={() => setDialog({ kind: "none" })}
        />
      ) : null}
    </>
  );
}

function transformNode(
  document: import("@blue-canvas/document").DesignDocument,
  nodeId: string,
  update: (
    node: import("@blue-canvas/document").DesignNode,
  ) => import("@blue-canvas/document").DesignNode,
): import("@blue-canvas/document").DesignDocument {
  return {
    ...document,
    pages: document.pages.map((page) => ({
      ...page,
      artboards: page.artboards.map((artboard) => ({
        ...artboard,
        root: mapTree(artboard.root, nodeId, update),
      })),
    })),
  };
}

function mapTree(
  node: import("@blue-canvas/document").DesignNode,
  nodeId: string,
  update: (
    node: import("@blue-canvas/document").DesignNode,
  ) => import("@blue-canvas/document").DesignNode,
): import("@blue-canvas/document").DesignNode {
  const next = node.id === nodeId ? update(node) : node;
  switch (next.kind) {
    case "stack":
    case "grid":
    case "link":
    case "button":
    case "form":
    case "repeater":
    case "overlay":
      return {
        ...next,
        children: next.children.map((child) => mapTree(child, nodeId, update)),
      };
    case "conditional":
      return {
        ...next,
        whenTrue: next.whenTrue.map((child) => mapTree(child, nodeId, update)),
        whenFalse: next.whenFalse.map((child) =>
          mapTree(child, nodeId, update),
        ),
      };
    default:
      return next;
  }
}

function renameNode(
  document: import("@blue-canvas/document").DesignDocument,
  nodeId: string,
  name: string,
): import("@blue-canvas/document").DesignDocument {
  const trimmed = name.trim() || "Untitled";
  return transformNode(document, nodeId, (node) => ({
    ...node,
    name: trimmed,
  }));
}

function editText(
  document: import("@blue-canvas/document").DesignDocument,
  nodeId: string,
  text: string,
): import("@blue-canvas/document").DesignDocument {
  return transformNode(document, nodeId, (node) => {
    if (node.kind === "text") return { ...node, text };
    return node;
  });
}
