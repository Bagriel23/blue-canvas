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
import { currentArtboardRoot } from "../canvas/selection.js";
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
  const activeArtboard =
    activePage?.artboards.find(
      (entry) => activePage.id === pageId && entry.id === initialArtboard.id,
    ) ??
    activePage?.artboards[0] ??
    initialArtboard;
  const previewState: PreviewState = { variables, openOverlayIds };

  const handleInteraction: PreviewInteractionHandler = useCallback(
    (nodeId, trigger, inputValue, formValues) => {
      const currentArtboard = activeArtboard;
      if (!currentArtboard) return;
      const root = currentArtboardRoot(
        document,
        activePage?.id ?? activePageId,
        currentArtboard.id,
      );
      const location = root ? findRenderedNode(document, root, nodeId) : null;
      if (!root || !location) return;
      const node = location.node;
      for (const interaction of node.interactions ?? []) {
        if (interaction.trigger !== trigger) continue;
        runPreviewAction(
          interaction,
          document,
          root,
          node,
          location.overlayId,
          inputValue,
          formValues,
          {
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
            closeOverlay: (overlayId) => {
              if (!overlayId) return;
              setOpenOverlayIds((current) => {
                const next = new Set(current);
                next.delete(overlayId);
                return next;
              });
            },
          },
        );
      }
    },
    [activeArtboard, activePage, activePageId, document, pageId],
  );

  const goBack = () => {
    const previous = history.at(-1);
    if (!previous) return;
    setActivePageId(previous);
    setHistory(history.slice(0, -1));
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
  closeOverlay: (overlayId: string | null) => void;
}

function runPreviewAction(
  interaction: Interaction,
  document: DesignDocument,
  root: DesignNode,
  source: DesignNode,
  overlayId: string | null,
  inputValue: string | undefined,
  formValues: Readonly<Record<string, string>> | undefined,
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
      {
        const input = findInputByVariable(source, action.variable);
        const rawValue = formValues?.[action.variable] ?? inputValue;
        actions.setVariable(
          action.variable,
          rawValue === undefined
            ? action.value
            : coerceInputValue(input, rawValue),
        );
      }
      break;
    case "open-overlay":
      if (
        findRenderedNode(document, root, action.overlayId)?.node.kind ===
        "overlay"
      ) {
        actions.openOverlay(action.overlayId);
      }
      break;
    case "close-overlay":
      actions.closeOverlay(overlayId);
      break;
    case "filter-collection":
      {
        const input = findInputByVariable(source, action.variable);
        const rawValue = formValues?.[action.variable] ?? inputValue;
        if (rawValue !== undefined) {
          actions.setVariable(
            action.variable,
            coerceInputValue(input, rawValue),
          );
        }
      }
      break;
  }
}

interface PreviewNodeLocation {
  node: DesignNode;
  overlayId: string | null;
}

function findRenderedNode(
  document: DesignDocument,
  root: DesignNode,
  nodeId: string,
): PreviewNodeLocation | null {
  const walk = (
    node: DesignNode,
    overlayId: string | null,
    visitedComponents: ReadonlySet<string>,
  ): PreviewNodeLocation | null => {
    const nextOverlay = node.kind === "overlay" ? node.id : overlayId;
    if (node.id === nodeId) return { node, overlayId: nextOverlay };
    for (const child of getNodeChildren(node)) {
      const found = walk(child, nextOverlay, visitedComponents);
      if (found) return found;
    }
    if (node.kind === "component-instance") {
      if (visitedComponents.has(node.componentId)) return null;
      const component = document.components.find(
        (entry) => entry.id === node.componentId,
      );
      if (!component) return null;
      const nextVisited = new Set(visitedComponents);
      nextVisited.add(node.componentId);
      return walk(component.root, nextOverlay, nextVisited);
    }
    return null;
  };
  return walk(root, null, new Set());
}

function findInputByVariable(
  source: DesignNode,
  variable: string,
): Extract<DesignNode, { kind: "input" }> | null {
  if (source.kind === "input" && source.variable === variable) return source;
  for (const child of getNodeChildren(source)) {
    const input = findInputByVariable(child, variable);
    if (input) return input;
  }
  return null;
}

function coerceInputValue(
  input: Extract<DesignNode, { kind: "input" }> | null,
  value: string,
): PreviewPrimitive {
  if (input?.inputType !== "number") return value;
  if (value.trim() === "") return null;
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

export function isSafePreviewUrl(value: string): boolean {
  try {
    const parsed = new URL(value, window.location.href);
    return ["http:", "https:", "mailto:", "tel:"].includes(parsed.protocol);
  } catch {
    return false;
  }
}
