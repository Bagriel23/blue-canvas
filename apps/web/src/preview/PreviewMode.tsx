import { useCallback, useState } from "react";
import {
  getNodeChildren,
  type Artboard,
  type DesignDocument,
  type DesignNode,
  type Interaction,
} from "@blue-canvas/document";
import { ArrowLeft, RotateCcw, X } from "lucide-react";

import {
  Canvas,
  type PreviewInteractionHandler,
  type PreviewState,
} from "../canvas/Canvas.js";
import { currentArtboardRoot, findNodeById } from "../canvas/selection.js";
import { useLocale } from "../state/locale.js";

interface PreviewModeProps {
  document: DesignDocument;
  pageId: string;
  artboard: Artboard;
  onExit: () => void;
}

export function PreviewMode({
  document,
  pageId,
  artboard: initialArtboard,
  onExit,
}: PreviewModeProps) {
  const { messages } = useLocale();
  const [activePageId, setActivePageId] = useState(pageId);
  const [history, setHistory] = useState<string[]>([]);
  const [variables, setVariables] = useState(() => initialVariables(document));
  const [openOverlayIds, setOpenOverlayIds] = useState<Set<string>>(
    () => new Set(),
  );
  const activePage =
    document.pages.find((entry) => entry.id === activePageId) ??
    document.pages.find((entry) => entry.id === pageId);
  const activeArtboard = activePage?.artboards[0] ?? initialArtboard;
  const previewState: PreviewState = { variables, openOverlayIds };

  const handleInteraction: PreviewInteractionHandler = useCallback(
    (nodeId, trigger, inputValue) => {
      const currentArtboard = activePage?.artboards[0];
      if (!currentArtboard) return;
      const root = currentArtboardRoot(
        document,
        activePage?.id ?? activePageId,
        currentArtboard.id,
      );
      const node = root ? findNodeById(root, nodeId)?.node : null;
      if (!root || !node) return;
      for (const interaction of node.interactions ?? []) {
        if (interaction.trigger !== trigger) continue;
        runPreviewAction(interaction, root, node, inputValue, {
          navigate: (nextPageId) => {
            if (!document.pages.some((page) => page.id === nextPageId)) {
              return;
            }
            setHistory((current) => [...current, activePage?.id ?? pageId]);
            setActivePageId(nextPageId);
            setOpenOverlayIds(new Set());
          },
          setVariable: (name, value) => {
            setVariables((current) => ({ ...current, [name]: value }));
          },
          openOverlay: (overlayId) => {
            setOpenOverlayIds((current) => {
              const next = new Set(current);
              next.add(overlayId);
              return next;
            });
          },
          closeOverlay: () => {
            const overlayId = findOverlayAncestor(root, node.id);
            if (!overlayId) return;
            setOpenOverlayIds((current) => {
              const next = new Set(current);
              next.delete(overlayId);
              return next;
            });
          },
        });
      }
    },
    [activePage, activePageId, document, pageId],
  );

  const goBack = () => {
    setHistory((current) => {
      const previous = current.at(-1);
      if (previous) setActivePageId(previous);
      return previous ? current.slice(0, -1) : current;
    });
    setOpenOverlayIds(new Set());
  };

  const reset = () => {
    setActivePageId(pageId);
    setHistory([]);
    setVariables(initialVariables(document));
    setOpenOverlayIds(new Set());
  };

  if (!activePage || !activeArtboard) {
    return (
      <div
        className="bc-preview"
        role="region"
        aria-label={messages.workspace.preview}
      >
        <button type="button" className="bc-btn" onClick={onExit}>
          <X size={15} aria-hidden="true" />
          {messages.workspace.exitPreview}
        </button>
        <p>{messages.workspace.pageNotFound}</p>
      </div>
    );
  }

  return (
    <div
      className="bc-preview"
      role="region"
      aria-label={messages.workspace.preview}
    >
      <div className="bc-preview__toolbar">
        <div className="bc-preview__location" aria-live="polite">
          <span className="bc-eyebrow">{activePage.name}</span>
          <span>{activeArtboard.name}</span>
        </div>
        <div className="bc-preview__actions">
          <button
            type="button"
            className="bc-icon-btn"
            onClick={goBack}
            disabled={history.length === 0}
            aria-label={messages.workspace.previewBack}
            title={messages.workspace.previewBack}
          >
            <ArrowLeft size={16} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="bc-icon-btn"
            onClick={reset}
            aria-label={messages.workspace.previewReset}
            title={messages.workspace.previewReset}
          >
            <RotateCcw size={16} aria-hidden="true" />
          </button>
          <button type="button" className="bc-btn" onClick={onExit}>
            <X size={15} aria-hidden="true" />
            {messages.workspace.exitPreview}
          </button>
        </div>
      </div>
      <Canvas
        document={document}
        pageId={activePage.id}
        artboardId={activeArtboard.id}
        selectedId={null}
        onSelect={() => undefined}
        editable={false}
        previewState={previewState}
        onInteraction={handleInteraction}
      />
    </div>
  );
}

type PreviewPrimitive = string | number | boolean | null;

function initialVariables(
  document: DesignDocument,
): Record<string, PreviewPrimitive> {
  return Object.fromEntries(
    Object.entries(document.variables).map(([name, definition]) => [
      name,
      definition.value,
    ]),
  );
}

interface PreviewActions {
  navigate: (pageId: string) => void;
  setVariable: (name: string, value: PreviewPrimitive) => void;
  openOverlay: (overlayId: string) => void;
  closeOverlay: () => void;
}

function runPreviewAction(
  interaction: Interaction,
  root: DesignNode,
  source: DesignNode,
  inputValue: string | undefined,
  actions: PreviewActions,
): void {
  const { action } = interaction;
  switch (action.type) {
    case "navigate":
      if (action.pageId) actions.navigate(action.pageId);
      else if (action.url && isSafePreviewUrl(action.url)) {
        if (typeof window !== "undefined") window.location.assign(action.url);
      }
      break;
    case "set-variable":
      actions.setVariable(
        action.variable,
        interaction.trigger === "change" && source.kind === "input"
          ? (inputValue ?? "")
          : action.value,
      );
      break;
    case "open-overlay":
      if (findNodeById(root, action.overlayId)?.node.kind === "overlay") {
        actions.openOverlay(action.overlayId);
      }
      break;
    case "close-overlay":
      actions.closeOverlay();
      break;
    case "filter-collection":
      actions.setVariable(action.variable, inputValue ?? "");
      break;
  }
}

function findOverlayAncestor(root: DesignNode, nodeId: string): string | null {
  const walk = (node: DesignNode, overlayId: string | null): string | null => {
    const nextOverlay = node.kind === "overlay" ? node.id : overlayId;
    if (node.id === nodeId) return nextOverlay;
    for (const child of getNodeChildren(node)) {
      const found = walk(child, nextOverlay);
      if (found) return found;
    }
    return null;
  };
  return walk(root, null);
}

function isSafePreviewUrl(value: string): boolean {
  try {
    const parsed = new URL(value, window.location.href);
    return ["http:", "https:", "mailto:", "tel:"].includes(parsed.protocol);
  } catch {
    return false;
  }
}
