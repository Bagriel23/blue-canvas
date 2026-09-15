import type { DesignNode } from "@blue-canvas/document";
import { getNodeChildren } from "@blue-canvas/document";
import {
  Box,
  CircleHelp,
  Component,
  ExternalLink,
  FormInput,
  Grid2X2,
  Image,
  Layers3,
  List,
  MousePointer2,
  SquareStack,
  Type,
} from "lucide-react";
import { useLocale } from "../state/locale.js";

interface LayersPanelProps {
  root: DesignNode | null;
  selectedId: string | null;
  onSelect: (nodeId: string) => void;
}

export function LayersPanel({ root, selectedId, onSelect }: LayersPanelProps) {
  const { messages } = useLocale();
  return (
    <section
      className="bc-workspace__section"
      aria-label={messages.workspace.layers}
    >
      <h2>{messages.workspace.layers}</h2>
      <div className="bc-layers" role="tree">
        {root ? (
          <LayerNode
            node={root}
            depth={0}
            selectedId={selectedId}
            onSelect={onSelect}
          />
        ) : null}
      </div>
    </section>
  );
}

function LayerNode({
  node,
  depth,
  selectedId,
  onSelect,
}: {
  node: DesignNode;
  depth: number;
  selectedId: string | null;
  onSelect: (nodeId: string) => void;
}) {
  const children = getNodeChildren(node);
  return (
    <>
      <button
        type="button"
        role="treeitem"
        aria-selected={selectedId === node.id}
        className="bc-layer-row"
        data-selected={selectedId === node.id ? "true" : "false"}
        style={{ paddingLeft: 6 + depth * 12 }}
        onClick={() => onSelect(node.id)}
      >
        <span className="bc-layer-row__icon" aria-hidden="true">
          {iconFor(node.kind)}
        </span>
        <span className="bc-layer-row__label">{node.name}</span>
      </button>
      {children.map((child) => (
        <LayerNode
          key={child.id}
          node={child}
          depth={depth + 1}
          selectedId={selectedId}
          onSelect={onSelect}
        />
      ))}
    </>
  );
}

function iconFor(kind: DesignNode["kind"]): React.ReactNode {
  switch (kind) {
    case "stack":
      return <Layers3 size={14} />;
    case "grid":
      return <Grid2X2 size={14} />;
    case "text":
      return <Type size={14} />;
    case "image":
      return <Image size={14} />;
    case "icon":
      return <CircleHelp size={14} />;
    case "link":
      return <ExternalLink size={14} />;
    case "button":
      return <MousePointer2 size={14} />;
    case "input":
      return <FormInput size={14} />;
    case "form":
      return <SquareStack size={14} />;
    case "repeater":
      return <List size={14} />;
    case "conditional":
      return <CircleHelp size={14} />;
    case "overlay":
      return <Box size={14} />;
    case "component-instance":
      return <Component size={14} />;
  }
}
