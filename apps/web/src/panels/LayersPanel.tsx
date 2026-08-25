import type { DesignNode } from "@blue-canvas/document";
import { getNodeChildren } from "@blue-canvas/document";
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
        <span aria-hidden="true">{iconFor(node.kind)}</span>
        <span>{node.name}</span>
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

function iconFor(kind: DesignNode["kind"]): string {
  switch (kind) {
    case "stack":
      return "▤";
    case "grid":
      return "▦";
    case "text":
      return "T";
    case "image":
      return "▣";
    case "icon":
      return "◆";
    case "link":
      return "↗";
    case "button":
      return "▷";
    case "input":
      return "▭";
    case "form":
      return "▤";
    case "repeater":
      return "≡";
    case "conditional":
      return "?";
    case "overlay":
      return "◫";
    case "component-instance":
      return "◈";
  }
}
