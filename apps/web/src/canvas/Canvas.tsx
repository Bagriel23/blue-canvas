import {
  useCallback,
  useState,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
import type { Artboard, DesignNode } from "@blue-canvas/document";
import { Maximize2, Minus, Plus } from "lucide-react";

import { layoutToCss, styleToCss } from "./style.js";
import {
  currentArtboardRoot,
  nextNodeId,
  previousNodeId,
} from "./selection.js";
import type { DesignDocument } from "@blue-canvas/document";
import { useLocale } from "../state/locale.js";

interface CanvasProps {
  document: DesignDocument;
  pageId: string;
  artboardId: string;
  selectedId: string | null;
  onSelect: (nodeId: string | null) => void;
  editable: boolean;
  previewState?: PreviewState | undefined;
  onInteraction?: PreviewInteractionHandler | undefined;
}

export interface PreviewState {
  variables: Readonly<Record<string, string | number | boolean | null>>;
  openOverlayIds: ReadonlySet<string>;
}

export type PreviewInteractionHandler = (
  nodeId: string,
  trigger: "click" | "submit" | "change",
  value?: string | undefined,
  formValues?: Readonly<Record<string, string>> | undefined,
) => void;

export function Canvas({
  document,
  pageId,
  artboardId,
  selectedId,
  onSelect,
  editable,
  previewState,
  onInteraction,
}: CanvasProps) {
  const { messages } = useLocale();
  const [zoom, setZoom] = useState(100);
  const page = document.pages.find((entry) => entry.id === pageId);
  const artboard = page?.artboards.find((entry) => entry.id === artboardId);
  const root = currentArtboardRoot(document, pageId, artboardId);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (!editable || !root) return;
      if (event.key === "Tab") {
        event.preventDefault();
        const nextId = event.shiftKey
          ? previousNodeId(root, selectedId)
          : nextNodeId(root, selectedId);
        onSelect(nextId);
      }
      if (event.key === "Escape") {
        event.preventDefault();
        onSelect(null);
      }
    },
    [editable, root, selectedId, onSelect],
  );

  const handleBackdropClick = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      if (event.target === event.currentTarget) onSelect(null);
    },
    [onSelect],
  );

  if (!page || !artboard || !root) {
    return (
      <div className="bc-canvas-wrapper" data-empty="true">
        <p>{messages.workspace.pageNotFound}</p>
      </div>
    );
  }

  return (
    <div
      className="bc-canvas-wrapper"
      role="region"
      aria-label={`Canvas — ${artboard.name}`}
      onClick={handleBackdropClick}
      onKeyDown={handleKeyDown}
      tabIndex={0}
    >
      <div
        className="bc-canvas-toolbar"
        aria-label={messages.workspace.canvasControls}
      >
        <span className="bc-canvas-toolbar__label">
          {messages.workspace.canvas}
        </span>
        <div className="bc-canvas-toolbar__actions">
          <button
            className="bc-icon-btn bc-icon-btn--small"
            type="button"
            aria-label={messages.workspace.zoomOut}
            title={messages.workspace.zoomOut}
            onClick={() => setZoom((value) => Math.max(25, value - 10))}
          >
            <Minus size={14} aria-hidden="true" />
          </button>
          <span className="bc-canvas-toolbar__zoom" aria-live="polite">
            {zoom}%
          </span>
          <button
            className="bc-icon-btn bc-icon-btn--small"
            type="button"
            aria-label={messages.workspace.zoomIn}
            title={messages.workspace.zoomIn}
            onClick={() => setZoom((value) => Math.min(200, value + 10))}
          >
            <Plus size={14} aria-hidden="true" />
          </button>
          <button
            className="bc-icon-btn bc-icon-btn--small"
            type="button"
            aria-label={messages.workspace.fitCanvas}
            title={messages.workspace.fitCanvas}
            onClick={() => setZoom(100)}
          >
            <Maximize2 size={14} aria-hidden="true" />
          </button>
        </div>
      </div>
      <ArtboardFrame artboard={artboard} zoom={zoom / 100}>
        <NodeView
          node={root}
          document={document}
          selectedId={selectedId}
          onSelect={onSelect}
          editable={editable}
          previewState={previewState}
          onInteraction={onInteraction}
        />
      </ArtboardFrame>
    </div>
  );
}

function ArtboardFrame({
  artboard,
  zoom,
  children,
}: {
  artboard: Artboard;
  zoom: number;
  children: React.ReactNode;
}) {
  return (
    <div
      className="bc-canvas-artboard"
      data-artboard-id={artboard.id}
      data-zoom={zoom}
      style={{
        width: artboard.width,
        minHeight: artboard.height,
        transform: `scale(${zoom})`,
        transformOrigin: "top center",
      }}
    >
      <div className="bc-canvas-artboard__label">{artboard.name}</div>
      {children}
    </div>
  );
}

interface NodeViewProps {
  node: DesignNode;
  document: DesignDocument;
  selectedId: string | null;
  onSelect: (nodeId: string | null) => void;
  editable: boolean;
  previewState?: PreviewState | undefined;
  onInteraction?: PreviewInteractionHandler | undefined;
  componentDepth?: number | undefined;
}

function NodeView({
  node,
  document,
  selectedId,
  onSelect,
  editable,
  previewState,
  onInteraction,
  componentDepth = 0,
}: NodeViewProps) {
  const previewing = !editable && onInteraction !== undefined;
  if (previewing) {
    if (
      node.kind === "overlay" &&
      !(previewState?.openOverlayIds.has(node.id) ?? false)
    ) {
      return null;
    }
    if (node.kind !== "overlay" && !node.visible) return null;
  }
  const selected = selectedId === node.id;
  const hasInteraction = (trigger: "click" | "submit" | "change") =>
    node.interactions?.some((interaction) => interaction.trigger === trigger) ??
    false;

  const handleClick = (event: MouseEvent) => {
    if (editable) {
      event.stopPropagation();
      onSelect(node.id);
      return;
    }
    if (previewing && hasInteraction("click")) {
      event.stopPropagation();
      onInteraction(node.id, "click");
    }
  };

  const commonProps = {
    className: "bc-canvas-node",
    "data-node-id": node.id,
    "data-node-kind": node.kind,
    "data-node-name": node.name,
    "data-selected": selected ? "true" : "false",
    tabIndex: editable ? 0 : undefined,
    onClick: handleClick,
    style: { ...styleToCss(node.style), ...layoutToCss(node) },
  } as const;

  const renderChildren = (children: DesignNode[]) =>
    children.map((child) => (
      <NodeView
        key={child.id}
        node={child}
        document={document}
        selectedId={selectedId}
        onSelect={onSelect}
        editable={editable}
        previewState={previewState}
        onInteraction={onInteraction}
        componentDepth={componentDepth}
      />
    ));

  switch (node.kind) {
    case "stack":
    case "grid":
      return <div {...commonProps}>{renderChildren(node.children)}</div>;
    case "text":
      return <span {...commonProps}>{node.text}</span>;
    case "image":
      return (
        <img
          {...commonProps}
          src={
            node.source.type === "url"
              ? node.source.url
              : `/api/v1/assets/${node.source.assetId}`
          }
          alt={node.alt}
        />
      );
    case "icon":
      return (
        <span
          {...commonProps}
          role="img"
          aria-label={node.label ?? node.icon}
          data-icon={node.icon}
        >
          {node.icon.slice(0, 2)}
        </span>
      );
    case "link":
      return (
        <a
          {...commonProps}
          href={node.href}
          onClick={(event) => {
            if (previewing && hasInteraction("click")) {
              event.preventDefault();
            }
            handleClick(event);
          }}
        >
          {renderChildren(node.children)}
        </a>
      );
    case "button":
      return (
        <button
          {...commonProps}
          type={node.buttonType}
          onClick={(event) => {
            handleClick(event);
          }}
        >
          {renderChildren(node.children)}
        </button>
      );
    case "input":
      return (
        <input
          {...commonProps}
          type={node.inputType}
          key={
            previewing && node.variable
              ? `${node.id}:${String(previewState?.variables[node.variable] ?? "")}`
              : node.id
          }
          name={node.variable}
          placeholder={node.placeholder}
          readOnly={!previewing}
          defaultValue={
            previewing && node.variable
              ? String(previewState?.variables[node.variable] ?? "")
              : undefined
          }
          onChange={(event) => {
            if (previewing && hasInteraction("change")) {
              onInteraction(node.id, "change", event.currentTarget.value);
            }
          }}
        />
      );
    case "form":
      return (
        <form
          {...commonProps}
          onSubmit={(event) => {
            event.preventDefault();
            if (previewing && hasInteraction("submit")) {
              event.stopPropagation();
              const values = Object.fromEntries(
                Array.from(event.currentTarget.elements)
                  .filter(
                    (element): element is HTMLInputElement =>
                      element.tagName === "INPUT" &&
                      (element as HTMLInputElement).name.length > 0,
                  )
                  .map((element) => [element.name, element.value]),
              );
              onInteraction(node.id, "submit", undefined, values);
            }
          }}
        >
          {renderChildren(node.children)}
        </form>
      );
    case "repeater":
      return (
        <div {...commonProps} data-repeats={node.collection}>
          {renderChildren(node.children)}
        </div>
      );
    case "conditional": {
      const matches =
        previewing && previewState
          ? previewState.variables[node.variable] === node.equals
          : true;
      return (
        <div {...commonProps} data-variable={node.variable}>
          {renderChildren(matches ? node.whenTrue : node.whenFalse)}
        </div>
      );
    }
    case "overlay":
      return (
        <div {...commonProps} role="dialog">
          {renderChildren(node.children)}
        </div>
      );
    case "component-instance":
      if (!previewing) {
        return (
          <div {...commonProps} data-component-instance={node.componentId} />
        );
      }
      if (componentDepth >= 8) return null;
      {
        const component = document.components.find(
          (entry) => entry.id === node.componentId,
        );
        if (!component) return null;
        return (
          <div {...commonProps} data-component-instance={node.componentId}>
            <NodeView
              node={component.root}
              document={document}
              selectedId={selectedId}
              onSelect={onSelect}
              editable={editable}
              previewState={previewState}
              onInteraction={onInteraction}
              componentDepth={componentDepth + 1}
            />
          </div>
        );
      }
  }
}
