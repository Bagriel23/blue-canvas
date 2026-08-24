import { randomUUID } from "node:crypto";

import { designDocumentSchema, type DesignDocument } from "./schema.js";

export function createNodeId(): string {
  return randomUUID();
}

export function createDesignDocument(name: string): DesignDocument {
  return parseDesignDocument({
    schemaVersion: 1,
    id: randomUUID(),
    name,
    tokens: {},
    variables: {},
    components: [],
    pages: [],
  });
}

export function parseDesignDocument(input: unknown): DesignDocument {
  return designDocumentSchema.parse(input);
}
