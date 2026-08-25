import {
  getNodeChildren,
  type DesignDocument,
  type DesignNode,
} from "@blue-canvas/document";

export interface NodePathEntry {
  node: DesignNode;
  parent: DesignNode | null;
  index: number;
}

export function flattenNodes(root: DesignNode): NodePathEntry[] {
  const entries: NodePathEntry[] = [];
  const walk = (node: DesignNode, parent: DesignNode | null, index: number) => {
    entries.push({ node, parent, index });
    const children = getNodeChildren(node);
    children.forEach((child, childIndex) => walk(child, node, childIndex));
  };
  walk(root, null, 0);
  return entries;
}

export function findNodeById(
  root: DesignNode,
  nodeId: string,
): NodePathEntry | null {
  const found = flattenNodes(root).find((entry) => entry.node.id === nodeId);
  return found ?? null;
}

export function nextNodeId(
  root: DesignNode,
  currentId: string | null,
): string | null {
  const flat = flattenNodes(root);
  const first = flat[0];
  if (!first) return null;
  if (!currentId) return first.node.id;
  const index = flat.findIndex((entry) => entry.node.id === currentId);
  if (index === -1) return first.node.id;
  return (flat[(index + 1) % flat.length] ?? first).node.id;
}

export function previousNodeId(
  root: DesignNode,
  currentId: string | null,
): string | null {
  const flat = flattenNodes(root);
  const last = flat[flat.length - 1];
  if (!last) return null;
  if (!currentId) return last.node.id;
  const index = flat.findIndex((entry) => entry.node.id === currentId);
  if (index === -1) return last.node.id;
  const previousIndex = (index - 1 + flat.length) % flat.length;
  return (flat[previousIndex] ?? last).node.id;
}

export function currentArtboardRoot(
  document: DesignDocument,
  pageId: string,
  artboardId: string,
): DesignNode | null {
  const page = document.pages.find((entry) => entry.id === pageId);
  if (!page) return null;
  const artboard = page.artboards.find((entry) => entry.id === artboardId);
  return artboard?.root ?? null;
}
