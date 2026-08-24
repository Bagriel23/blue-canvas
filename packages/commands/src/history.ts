import { CommandError } from "./errors.js";
import type { CommandState } from "./types.js";

export function undo(state: CommandState): CommandState {
  const document = state.past.at(-1);
  if (document === undefined) {
    throw new CommandError(
      "HISTORY_EMPTY",
      "No command batch is available to undo",
    );
  }

  return {
    document: structuredClone(document),
    revision: state.revision + 1,
    appliedBatchIds: [...state.appliedBatchIds],
    past: state.past.slice(0, -1).map((snapshot) => structuredClone(snapshot)),
    future: [
      ...state.future.map((snapshot) => structuredClone(snapshot)),
      structuredClone(state.document),
    ],
  };
}

export function redo(state: CommandState): CommandState {
  const document = state.future.at(-1);
  if (document === undefined) {
    throw new CommandError(
      "HISTORY_EMPTY",
      "No command batch is available to redo",
    );
  }

  return {
    document: structuredClone(document),
    revision: state.revision + 1,
    appliedBatchIds: [...state.appliedBatchIds],
    past: [
      ...state.past.map((snapshot) => structuredClone(snapshot)),
      structuredClone(state.document),
    ],
    future: state.future
      .slice(0, -1)
      .map((snapshot) => structuredClone(snapshot)),
  };
}
