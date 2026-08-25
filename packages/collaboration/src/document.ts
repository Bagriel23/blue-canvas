import {
  createDesignDocument,
  parseDesignDocument,
  type DesignDocument,
} from "@blue-canvas/document";
import * as Y from "yjs";

export const MAX_COLLABORATION_STATE_BYTES = 8 * 1024 * 1024;
export const MAX_COLLABORATION_UPDATE_BYTES = 1024 * 1024;

const ROOT_MAP = "blueCanvas";
const DOCUMENT_KEY = "document";

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
  return parseDesignDocument(document.getMap(ROOT_MAP).get(DOCUMENT_KEY));
}

export function replaceSemanticDocument(
  document: Y.Doc,
  value: unknown,
): DesignDocument {
  const parsed = parseDesignDocument(value);
  document.getMap(ROOT_MAP).set(DOCUMENT_KEY, parsed);
  return parsed;
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
