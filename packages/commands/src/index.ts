export { designCommandBatchSchema } from "./batch-schema.js";
export { applyCommandBatch, createCommandState } from "./engine.js";
export { CommandError } from "./errors.js";
export { redo, undo } from "./history.js";
export { MAX_BATCH_NODE_COUNT, MAX_BATCH_NODE_DEPTH } from "./preflight.js";
export type { CommandErrorCode } from "./errors.js";
export type {
  AddNodeCommand,
  CommandState,
  DesignCommand,
  DesignCommandBatch,
  MoveNodeCommand,
  RemoveNodeCommand,
  RenamePageCommand,
  SetTokenCommand,
  SetVariableCommand,
  UpdateNodeCommand,
  UpdateNodePatch,
} from "./types.js";
