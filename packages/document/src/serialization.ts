import { toJSONSchema } from "zod";

import { designDocumentSchema } from "./schema.js";

function orderKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(orderKeys);
  if (value === null || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, orderKeys((value as Record<string, unknown>)[key])]),
  );
}

export function deterministicSerialize(value: unknown, space?: number): string {
  const serialized = JSON.stringify(orderKeys(value), null, space);
  if (serialized === undefined) {
    throw new TypeError("Value is not JSON serializable");
  }
  return serialized;
}

export const designDocumentJsonSchema: Record<string, unknown> = toJSONSchema(
  designDocumentSchema,
  { reused: "ref" },
);
