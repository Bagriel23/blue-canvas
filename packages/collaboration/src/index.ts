export {
  applyCollaborationState,
  createInitialCollaborationDocument,
  encodeCollaborationState,
  MAX_COLLABORATION_STATE_BYTES,
  MAX_COLLABORATION_UPDATE_BYTES,
  readSemanticDocument,
  replaceSemanticDocument,
  validateProspectiveUpdate,
} from "./document.js";
export {
  createPendingChangesGuard,
  type BeforeUnloadEventLike,
  type BeforeUnloadTarget,
  type PendingChangesGuard,
} from "./offline.js";
