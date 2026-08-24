import {
  parseDesignDocument,
  type DesignDocument,
} from "@blue-canvas/document";

import { designCommandBatchSchema } from "./batch-schema.js";
import { CommandError } from "./errors.js";
import {
  findNode,
  findNodeLocation,
  mutableNodeChildren,
  nodeContains,
} from "./tree.js";
import type {
  AddNodeCommand,
  CommandState,
  DesignCommand,
  DesignCommandBatch,
  MoveNodeCommand,
  RemoveNodeCommand,
  UpdateNodeCommand,
} from "./types.js";

export function createCommandState(document: DesignDocument): CommandState {
  return {
    document: parseDesignDocument(structuredClone(document)),
    revision: 0,
    appliedBatchIds: [],
    past: [],
    future: [],
  };
}

function applyAddNode(document: DesignDocument, command: AddNodeCommand): void {
  const parent = findNode(document, command.parentId);
  if (parent === undefined) {
    throw new CommandError(
      "TARGET_NOT_FOUND",
      `Parent node not found: ${command.parentId}`,
    );
  }
  const children = mutableNodeChildren(parent, command.slot);
  if (children === undefined) {
    throw new CommandError(
      "INVALID_PARENT",
      `Node cannot contain children in slot ${command.slot ?? "children"}`,
    );
  }
  const index = command.index ?? children.length;
  if (index > children.length) {
    throw new CommandError("INVALID_INDEX", `Invalid child index: ${index}`);
  }
  children.splice(index, 0, command.node);
}

function applyUpdateNode(
  document: DesignDocument,
  command: UpdateNodeCommand,
): void {
  const node = findNode(document, command.nodeId);
  if (node === undefined) {
    throw new CommandError(
      "TARGET_NOT_FOUND",
      `Node not found: ${command.nodeId}`,
    );
  }
  Object.assign(node, command.patch);
}

function detachNode(document: DesignDocument, command: RemoveNodeCommand) {
  const location = findNodeLocation(document, command.nodeId);
  if (location === undefined) {
    throw new CommandError(
      "TARGET_NOT_FOUND",
      `Node not found: ${command.nodeId}`,
    );
  }
  if (location.parentChildren === undefined || location.index === undefined) {
    throw new CommandError(
      "ROOT_NODE_OPERATION",
      "Root nodes cannot be removed",
    );
  }
  location.parentChildren.splice(location.index, 1);
  return location.node;
}

function applyMoveNode(
  document: DesignDocument,
  command: MoveNodeCommand,
): void {
  const source = findNodeLocation(document, command.nodeId);
  if (source === undefined) {
    throw new CommandError(
      "TARGET_NOT_FOUND",
      `Node not found: ${command.nodeId}`,
    );
  }
  if (source.parentChildren === undefined) {
    throw new CommandError("ROOT_NODE_OPERATION", "Root nodes cannot be moved");
  }
  if (nodeContains(source.node, command.parentId)) {
    throw new CommandError(
      "INVALID_PARENT",
      "A node cannot move into its subtree",
    );
  }

  const parent = findNode(document, command.parentId);
  if (parent === undefined) {
    throw new CommandError(
      "TARGET_NOT_FOUND",
      `Parent node not found: ${command.parentId}`,
    );
  }
  const children = mutableNodeChildren(parent, command.slot);
  if (children === undefined) {
    throw new CommandError(
      "INVALID_PARENT",
      "Move target cannot contain children",
    );
  }
  const node = detachNode(document, {
    type: "remove-node",
    nodeId: command.nodeId,
  });
  const index = command.index ?? children.length;
  if (index > children.length) {
    throw new CommandError("INVALID_INDEX", `Invalid child index: ${index}`);
  }
  children.splice(index, 0, node);
}

function applyCommand(document: DesignDocument, command: DesignCommand): void {
  switch (command.type) {
    case "add-node":
      applyAddNode(document, command);
      break;
    case "update-node":
      applyUpdateNode(document, command);
      break;
    case "remove-node":
      detachNode(document, command);
      break;
    case "move-node":
      applyMoveNode(document, command);
      break;
    case "set-token":
      document.tokens[command.name] = command.value;
      break;
    case "set-variable":
      document.variables[command.name] = command.value;
      break;
    case "rename-page": {
      const page = document.pages.find(({ id }) => id === command.pageId);
      if (page === undefined) {
        throw new CommandError(
          "TARGET_NOT_FOUND",
          `Page not found: ${command.pageId}`,
        );
      }
      page.name = command.name;
      break;
    }
  }
}

export function applyCommandBatch(
  state: CommandState,
  input: DesignCommandBatch,
): CommandState {
  if (state.appliedBatchIds.includes(input.id)) return state;

  const parsed = designCommandBatchSchema.safeParse(input);
  if (!parsed.success) {
    throw new CommandError(
      "INVALID_BATCH",
      "Command batch is invalid",
      parsed.error,
    );
  }
  const batch = parsed.data;
  if (batch.baseRevision !== state.revision) {
    throw new CommandError(
      "REVISION_CONFLICT",
      `Expected revision ${state.revision}, received ${batch.baseRevision}`,
    );
  }

  const document = structuredClone(state.document);
  for (const command of batch.commands) applyCommand(document, command);

  let validated: DesignDocument;
  try {
    validated = parseDesignDocument(document);
  } catch (error) {
    throw new CommandError(
      "INVALID_RESULT",
      "Command batch produced an invalid document",
      error,
    );
  }

  if (batch.commands.length === 0) {
    return {
      ...state,
      appliedBatchIds: [...state.appliedBatchIds, batch.id],
    };
  }

  return {
    document: validated,
    revision: state.revision + 1,
    appliedBatchIds: [...state.appliedBatchIds, batch.id],
    past: [...state.past, structuredClone(state.document)],
    future: [],
  };
}
