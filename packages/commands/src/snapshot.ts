import type { DesignDocument } from "@blue-canvas/document";

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object") return value;

  const pending: object[] = [value];
  const visited = new WeakSet<object>();
  while (pending.length > 0) {
    const current = pending.pop();
    if (current === undefined || visited.has(current)) continue;
    visited.add(current);
    for (const child of Object.values(current)) {
      if (child !== null && typeof child === "object") pending.push(child);
    }
    Object.freeze(current);
  }
  return value;
}

export function createHistorySnapshot(
  document: DesignDocument,
): DesignDocument {
  return deepFreeze(structuredClone(document));
}
