import type {
  DesignDocument,
  DesignNode,
  GridLayout,
  Interaction,
  NodeStyle,
  StackLayout,
  TokenDefinition,
  VariableDefinition,
} from "@blue-canvas/document";

export interface AddNodeCommand {
  type: "add-node";
  parentId: string;
  node: DesignNode;
  index?: number | undefined;
  slot?: "children" | "whenTrue" | "whenFalse" | undefined;
}

export interface UpdateNodePatch {
  name?: string | undefined;
  visible?: boolean | undefined;
  style?: NodeStyle | undefined;
  interactions?: Interaction[] | undefined;
  layout?: StackLayout | GridLayout | undefined;
  text?: string | undefined;
  source?: Extract<DesignNode, { kind: "image" }>["source"] | undefined;
  alt?: string | undefined;
  icon?: string | undefined;
  label?: string | undefined;
  href?: string | undefined;
  buttonType?: "button" | "submit" | "reset" | undefined;
  inputType?: "text" | "email" | "password" | "number" | "search" | undefined;
  variable?: string | undefined;
  placeholder?: string | undefined;
  collection?: string | undefined;
  equals?: string | number | boolean | null | undefined;
  componentId?: string | undefined;
}

export interface UpdateNodeCommand {
  type: "update-node";
  nodeId: string;
  patch: UpdateNodePatch;
}

export interface RemoveNodeCommand {
  type: "remove-node";
  nodeId: string;
}

export interface MoveNodeCommand {
  type: "move-node";
  nodeId: string;
  parentId: string;
  index?: number | undefined;
  slot?: "children" | "whenTrue" | "whenFalse" | undefined;
}

export interface SetTokenCommand {
  type: "set-token";
  name: string;
  value: TokenDefinition;
}

export interface SetVariableCommand {
  type: "set-variable";
  name: string;
  value: VariableDefinition;
}

export interface RenamePageCommand {
  type: "rename-page";
  pageId: string;
  name: string;
}

export type DesignCommand =
  | AddNodeCommand
  | UpdateNodeCommand
  | RemoveNodeCommand
  | MoveNodeCommand
  | SetTokenCommand
  | SetVariableCommand
  | RenamePageCommand;

export interface DesignCommandBatch {
  id: string;
  actorId: string;
  baseRevision: number;
  commands: DesignCommand[];
}

export interface CommandState {
  document: DesignDocument;
  revision: number;
  appliedBatchIds: string[];
  past: DesignDocument[];
  future: DesignDocument[];
}
