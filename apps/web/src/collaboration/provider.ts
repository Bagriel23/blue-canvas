import { HocuspocusProvider } from "@hocuspocus/provider";
import {
  readSemanticDocument,
  replaceSemanticDocument,
  replaceSemanticNode,
} from "@blue-canvas/collaboration";
import { getNodeChildren, type DesignDocument } from "@blue-canvas/document";
import * as Y from "yjs";

export type CollaborationStatus =
  "connecting" | "synced" | "reconnecting" | "readonly" | "error";

export interface CollaborationClient {
  provider: HocuspocusProvider;
  document: Y.Doc;
  destroy: () => void;
}

export function collaborationUrl(): string {
  if (typeof window === "undefined")
    return "ws://127.0.0.1:8081/api/v1/collaboration";
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/api/v1/collaboration`;
}

export function createCollaborationClient(options: {
  projectId: string;
  token: string | null;
  onDocument: (document: DesignDocument) => void;
  onStatus: (status: CollaborationStatus) => void;
  onPresence: (states: unknown[]) => void;
}): CollaborationClient | null {
  if (typeof WebSocket === "undefined" || !options.token) return null;
  const document = new Y.Doc();
  const provider = new HocuspocusProvider({
    url: collaborationUrl(),
    name: options.projectId,
    document,
    token: options.token,
    sessionAwareness: true,
    onStatus: ({ status }) =>
      options.onStatus(status === "connected" ? "connecting" : "reconnecting"),
    onAuthenticated: ({ scope }) =>
      options.onStatus(scope === "readonly" ? "readonly" : "connecting"),
    onSynced: ({ state }) => {
      if (!state) return;
      options.onStatus(
        provider.authorizedScope === "readonly" ? "readonly" : "synced",
      );
      options.onDocument(readSemanticDocument(document));
    },
    onAuthenticationFailed: () => options.onStatus("error"),
    onClose: () => options.onStatus("reconnecting"),
    onAwarenessChange: ({ states }) => options.onPresence(states),
  });
  const onUpdate = () => {
    try {
      options.onDocument(readSemanticDocument(document));
    } catch {
      options.onStatus("error");
    }
  };
  document.on("update", onUpdate);
  provider.awareness?.setLocalStateField("user", {
    name: "You",
    color: "#6d83d8",
  });
  return {
    provider,
    document,
    destroy: () => {
      document.off("update", onUpdate);
      provider.destroy();
      document.destroy();
    },
  };
}

export function applySemanticDocument(
  document: Y.Doc,
  next: DesignDocument,
): void {
  document.transact(() => replaceSemanticDocument(document, next), "local");
}

export function applySemanticNode(
  document: Y.Doc,
  next: DesignDocument,
  nodeId: string,
): void {
  const find = (node: unknown): unknown => {
    if (!node || typeof node !== "object") return undefined;
    if ("id" in node && node.id === nodeId) return node;
    for (const child of getNodeChildren(node as never)) {
      const found = find(child);
      if (found) return found;
    }
    return undefined;
  };
  for (const page of next.pages)
    for (const artboard of page.artboards) {
      const found = find(artboard.root);
      if (found) return replaceSemanticNode(document, nodeId, found);
    }
  for (const component of next.components) {
    const found = find(component.root);
    if (found) return replaceSemanticNode(document, nodeId, found);
  }
}
