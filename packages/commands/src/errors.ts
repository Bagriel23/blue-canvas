export type CommandErrorCode =
  | "INVALID_BATCH"
  | "IDEMPOTENCY_CONFLICT"
  | "REVISION_CONFLICT"
  | "TARGET_NOT_FOUND"
  | "INVALID_PARENT"
  | "INVALID_INDEX"
  | "INVALID_PATCH"
  | "ROOT_NODE_OPERATION"
  | "INVALID_RESULT"
  | "HISTORY_EMPTY";

export class CommandError extends Error {
  readonly code: CommandErrorCode;
  readonly details: unknown;

  constructor(code: CommandErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = "CommandError";
    this.code = code;
    this.details = details;
  }
}
