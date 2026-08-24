import { CommandError } from "./errors.js";

/** Maximum semantic nodes accepted in one command batch. */
export const MAX_BATCH_NODE_COUNT = 5_000;

/** Maximum semantic node nesting accepted in one command batch. */
export const MAX_BATCH_NODE_DEPTH = 128;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

export function preflightCommandBatch(input: unknown): void {
  if (!isRecord(input) || !Array.isArray(input.commands)) return;

  const pending: { node: unknown; depth: number }[] = [];
  for (const command of input.commands) {
    if (isRecord(command) && command.type === "add-node") {
      pending.push({ node: command.node, depth: 1 });
    }
  }

  let nodeCount = 0;
  while (pending.length > 0) {
    const current = pending.pop();
    if (current === undefined || !isRecord(current.node)) continue;
    nodeCount += 1;
    if (nodeCount > MAX_BATCH_NODE_COUNT) {
      throw new CommandError(
        "INVALID_BATCH",
        `Command batch exceeds the ${MAX_BATCH_NODE_COUNT} node limit`,
      );
    }
    if (current.depth > MAX_BATCH_NODE_DEPTH) {
      throw new CommandError(
        "INVALID_BATCH",
        `Command batch exceeds the ${MAX_BATCH_NODE_DEPTH} node depth limit`,
      );
    }

    for (const key of ["children", "whenTrue", "whenFalse"]) {
      const children = current.node[key];
      if (!Array.isArray(children)) continue;
      for (const child of children) {
        pending.push({ node: child, depth: current.depth + 1 });
      }
    }
  }
}
