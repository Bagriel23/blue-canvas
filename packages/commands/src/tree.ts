import {
  getNodeChildren,
  type DesignDocument,
  type DesignNode,
} from "@blue-canvas/document";

export function findNode(
  document: DesignDocument,
  nodeId: string,
): DesignNode | undefined {
  const visit = (node: DesignNode): DesignNode | undefined => {
    if (node.id === nodeId) return node;
    for (const child of getNodeChildren(node)) {
      const found = visit(child);
      if (found !== undefined) return found;
    }
    return undefined;
  };

  for (const component of document.components) {
    const found = visit(component.root);
    if (found !== undefined) return found;
  }
  for (const page of document.pages) {
    for (const artboard of page.artboards) {
      const found = visit(artboard.root);
      if (found !== undefined) return found;
    }
  }
  return undefined;
}

export function nodeContains(node: DesignNode, nodeId: string): boolean {
  if (node.id === nodeId) return true;
  return getNodeChildren(node).some((child) => nodeContains(child, nodeId));
}

export function mutableNodeChildren(
  node: DesignNode,
  slot: "children" | "whenTrue" | "whenFalse" = "children",
): DesignNode[] | undefined {
  if (node.kind === "conditional") {
    if (slot === "whenTrue") return node.whenTrue;
    if (slot === "whenFalse") return node.whenFalse;
    return undefined;
  }
  if (slot !== "children") return undefined;

  switch (node.kind) {
    case "stack":
    case "grid":
    case "link":
    case "button":
    case "form":
    case "repeater":
    case "overlay":
      return node.children;
    default:
      return undefined;
  }
}

export interface NodeLocation {
  node: DesignNode;
  parentChildren?: DesignNode[] | undefined;
  index?: number | undefined;
}

export function findNodeLocation(
  document: DesignDocument,
  nodeId: string,
): NodeLocation | undefined {
  const visit = (
    node: DesignNode,
    parentChildren?: DesignNode[],
    index?: number,
  ): NodeLocation | undefined => {
    if (node.id === nodeId) return { node, parentChildren, index };

    const childLists =
      node.kind === "conditional"
        ? [node.whenTrue, node.whenFalse]
        : [mutableNodeChildren(node)].filter(
            (children): children is DesignNode[] => children !== undefined,
          );
    for (const children of childLists) {
      for (const [childIndex, child] of children.entries()) {
        const found = visit(child, children, childIndex);
        if (found !== undefined) return found;
      }
    }
    return undefined;
  };

  for (const component of document.components) {
    const found = visit(component.root);
    if (found !== undefined) return found;
  }
  for (const page of document.pages) {
    for (const artboard of page.artboards) {
      const found = visit(artboard.root);
      if (found !== undefined) return found;
    }
  }
  return undefined;
}
