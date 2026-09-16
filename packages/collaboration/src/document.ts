import {
  createDesignDocument,
  getNodeChildren,
  parseDesignDocument,
  type DesignDocument,
} from "@blue-canvas/document";
import * as Y from "yjs";

export const MAX_COLLABORATION_STATE_BYTES = 8 * 1024 * 1024;
export const MAX_COLLABORATION_UPDATE_BYTES = 1024 * 1024;

const ROOT_MAP = "blueCanvas";
const DOCUMENT_KEY = "document";
const ENTITIES_KEY = "entities";

export function createInitialCollaborationDocument(
  projectId: string,
  projectName: string,
): Y.Doc {
  const document = new Y.Doc();
  replaceSemanticDocument(
    document,
    createDesignDocument(projectName, { randomUUID: () => projectId }),
  );
  return document;
}

export function readSemanticDocument(document: Y.Doc): DesignDocument {
  const root = document.getMap(ROOT_MAP);
  const parsed = parseDesignDocument(root.get(DOCUMENT_KEY));
  const entities = root.get(ENTITIES_KEY);
  if (!(entities instanceof Y.Map)) return parsed;
  const copy = JSON.parse(JSON.stringify(parsed)) as DesignDocument;
  const apply = (node: unknown): void => {
    if (!node || typeof node !== "object") return;
    const id = "id" in node && typeof node.id === "string" ? node.id : null;
    if (id) {
      const value = entities.get(id);
      if (value && typeof value === "object")
        Object.assign(node, JSON.parse(JSON.stringify(value)));
    }
    for (const child of getNodeChildren(node as never)) apply(child);
  };
  for (const page of copy.pages)
    for (const artboard of page.artboards) apply(artboard.root);
  for (const component of copy.components) apply(component.root);
  return parseDesignDocument(copy);
}

export function replaceSemanticDocument(
  document: Y.Doc,
  value: unknown,
): DesignDocument {
  const parsed = parseDesignDocument(value);
  const root = document.getMap(ROOT_MAP);
  root.set(DOCUMENT_KEY, parsed);
  const entities =
    root.get(ENTITIES_KEY) instanceof Y.Map
      ? (root.get(ENTITIES_KEY) as Y.Map<unknown>)
      : new Y.Map<unknown>();
  if (!(root.get(ENTITIES_KEY) instanceof Y.Map))
    root.set(ENTITIES_KEY, entities);
  const collect = (node: unknown): void => {
    if (!node || typeof node !== "object") return;
    if ("id" in node && typeof node.id === "string")
      entities.set(node.id, JSON.parse(JSON.stringify(node)));
    for (const child of getNodeChildren(node as never)) collect(child);
  };
  for (const page of parsed.pages)
    for (const artboard of page.artboards) collect(artboard.root);
  for (const component of parsed.components) collect(component.root);
  return parsed;
}

export function replaceSemanticNode(
  document: Y.Doc,
  nodeId: string,
  value: unknown,
): void {
  const entities = document.getMap(ROOT_MAP).get(ENTITIES_KEY);
  if (!(entities instanceof Y.Map))
    throw new Error("Collaboration entities are unavailable");
  const valid = JSON.parse(JSON.stringify(value));
  entities.set(nodeId, valid);
}

export function encodeCollaborationState(document: Y.Doc): {
  state: Uint8Array;
  stateVector: Uint8Array;
} {
  readSemanticDocument(document);
  const state = Y.encodeStateAsUpdate(document);
  if (state.byteLength > MAX_COLLABORATION_STATE_BYTES) {
    throw new RangeError("Collaboration document exceeds the state size limit");
  }
  return { state, stateVector: Y.encodeStateVector(document) };
}

export function applyCollaborationState(
  document: Y.Doc,
  state: Uint8Array,
): void {
  if (state.byteLength > MAX_COLLABORATION_STATE_BYTES) {
    throw new RangeError("Collaboration document exceeds the state size limit");
  }
  Y.applyUpdate(document, state);
}

export function validateProspectiveUpdate(
  document: Y.Doc,
  update: Uint8Array,
): void {
  if (update.byteLength > MAX_COLLABORATION_UPDATE_BYTES) {
    throw new RangeError("Collaboration update exceeds the update size limit");
  }
  const candidate = new Y.Doc();
  try {
    Y.applyUpdate(candidate, Y.encodeStateAsUpdate(document));
    Y.applyUpdate(candidate, update);
    encodeCollaborationState(candidate);
  } finally {
    candidate.destroy();
  }
}
