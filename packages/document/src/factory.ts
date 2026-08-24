import { designDocumentSchema, type DesignDocument } from "./schema.js";

export interface UuidGeneratorOptions {
  randomUUID?: (() => string) | undefined;
}

export function createNodeId(options: UuidGeneratorOptions = {}): string {
  return options.randomUUID?.() ?? globalThis.crypto.randomUUID();
}

export function createDesignDocument(
  name: string,
  options: UuidGeneratorOptions = {},
): DesignDocument {
  return parseDesignDocument({
    schemaVersion: 1,
    id: createNodeId(options),
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
