import { readFileSync } from "node:fs";

import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { designDocumentJsonSchema, deterministicSerialize } from "./index.js";

describe("deterministic serialization", () => {
  it("orders object keys recursively and preserves array order", () => {
    expect(deterministicSerialize({ z: [3, 2, 1], a: { b: 2, a: 1 } })).toBe(
      '{"a":{"a":1,"b":2},"z":[3,2,1]}',
    );
  });

  it("is deterministic for every JSON value", () => {
    fc.assert(
      fc.property(fc.jsonValue(), (value) => {
        const first = deterministicSerialize(value);
        const second = deterministicSerialize(JSON.parse(first));

        expect(second).toBe(first);
      }),
    );
  });
});

it("publishes the version 1 document as JSON Schema", () => {
  expect(designDocumentJsonSchema).toMatchObject({
    $schema: "https://json-schema.org/draft/2020-12/schema",
    type: "object",
    properties: {
      schemaVersion: { const: 1, type: "number" },
    },
    required: expect.arrayContaining([
      "schemaVersion",
      "id",
      "name",
      "tokens",
      "variables",
      "components",
      "pages",
    ]),
    additionalProperties: false,
  });
});

it("references reused schemas instead of duplicating them", () => {
  expect(deterministicSerialize(designDocumentJsonSchema).length).toBeLessThan(
    50_000,
  );
});

it("publishes the reserved map-key restriction", () => {
  const serialized = deterministicSerialize(designDocumentJsonSchema);

  expect(serialized).toContain("__proto__");
  expect(serialized).toContain("constructor");
  expect(serialized).toContain("prototype");
});

it("keeps the checked JSON Schema artifact deterministic", () => {
  const schemaPath = new URL(
    "../schema/design-document.schema.json",
    import.meta.url,
  );

  expect(readFileSync(schemaPath, "utf8")).toBe(
    `${deterministicSerialize(designDocumentJsonSchema, 2)}\n`,
  );
});
