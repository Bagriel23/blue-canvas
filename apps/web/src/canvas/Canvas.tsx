import { useCallback, type KeyboardEvent, type MouseEvent } from "react";
import type { Artboard, DesignNode } from "@blue-canvas/document";

import { layoutToCss, styleToCss } from "./style.js";
import {
  currentArtboardRoot,
  nextNodeId,
  previousNodeId,
} from "./selection.js";
import type { DesignDocument } from "@blue-canvas/document";

interface CanvasProps {
  document: DesignDocument;
  pageId: string;
  artboardId: string;
  selectedId: string | null;
  onSelect: (nodeId: string | null) => void;
  editable: boolean;
}

export function Canvas({
  document,
  pageId,
  artboardId,
  selectedId,
  onSelect,
  editable,
}: CanvasProps) {
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
        <p>Page not found.</p>
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
      <ArtboardFrame artboard={artboard}>
        <NodeView
          node={root}
          selectedId={selectedId}
          onSelect={onSelect}
          editable={editable}
        />
      </ArtboardFrame>
    </div>
  );
}

function ArtboardFrame({
  artboard,
  children,
}: {
  artboard: Artboard;
  children: React.ReactNode;
}) {
  return (
    <div
      className="bc-canvas-artboard"
      data-artboard-id={artboard.id}
      style={{ width: artboard.width, minHeight: artboard.height }}
    >
      <div className="bc-canvas-artboard__label">{artboard.name}</div>
      {children}
    </div>
  );
}

interface NodeViewProps {
  node: DesignNode;
  selectedId: string | null;
  onSelect: (nodeId: string | null) => void;
  editable: boolean;
}

function NodeView({ node, selectedId, onSelect, editable }: NodeViewProps) {
  const selected = selectedId === node.id;

  const handleClick = (event: MouseEvent) => {
    if (!editable) return;
    event.stopPropagation();
    onSelect(node.id);
  };

  const commonProps = {
    className: "bc-canvas-node",
    "data-node-id": node.id,
    "data-node-kind": node.kind,
    "data-node-name": node.name,
    "data-selected": selected ? "true" : "false",
    tabIndex: editable ? 0 : -1,
    onClick: handleClick,
    style: { ...styleToCss(node.style), ...layoutToCss(node) },
  } as const;

  const renderChildren = (children: DesignNode[]) =>
    children.map((child) => (
      <NodeView
        key={child.id}
        node={child}
        selectedId={selectedId}
        onSelect={onSelect}
        editable={editable}
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
        <a {...commonProps} href={node.href}>
          {renderChildren(node.children)}
        </a>
      );
    case "button":
      return (
        <button
          {...commonProps}
          type={node.buttonType}
          onClick={(event) => {
            if (!editable) return;
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
          placeholder={node.placeholder}
          readOnly
        />
      );
    case "form":
      return (
        <form {...commonProps} onSubmit={(event) => event.preventDefault()}>
          {renderChildren(node.children)}
        </form>
      );
    case "repeater":
      return (
        <div {...commonProps} data-repeats={node.collection}>
          {renderChildren(node.children)}
        </div>
      );
    case "conditional":
      return (
        <div {...commonProps} data-variable={node.variable}>
          {renderChildren(node.whenTrue)}
        </div>
      );
    case "overlay":
      return (
        <div {...commonProps} role="dialog">
          {renderChildren(node.children)}
        </div>
      );
    case "component-instance":
      return (
        <div {...commonProps} data-component-instance={node.componentId} />
      );
  }
}
