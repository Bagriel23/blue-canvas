import { describe, expect, it } from "vitest";

import {
  createDesignDocument,
  createNodeId,
  parseDesignDocument,
} from "./index.js";

describe("design document", () => {
  it("creates a valid empty version 1 document", () => {
    const document = createDesignDocument("Landing page");

    expect(document).toEqual({
      schemaVersion: 1,
      id: expect.any(String),
      name: "Landing page",
      tokens: {},
      variables: {},
      components: [],
      pages: [],
    });
    expect(() => parseDesignDocument(document)).not.toThrow();
  });

  it("creates stable UUID node identifiers", () => {
    const first = createNodeId();
    const second = createNodeId();

    expect(first).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u,
    );
    expect(second).not.toBe(first);
  });

  it("rejects arbitrary JavaScript fields", () => {
    const document = createDesignDocument("Unsafe");
    Object.assign(document, { javascript: "alert('unsafe')" });

    expect(() => parseDesignDocument(document)).toThrow();
  });

  it.each(["__proto__", "constructor", "prototype"])(
    "rejects reserved token and variable key %s",
    (key) => {
      for (const field of ["tokens", "variables"] as const) {
        const document = createDesignDocument("Unsafe key");
        const value = { type: "string" as const, value: "unsafe" };
        document[field] = Object.fromEntries([[key, value]]);

        expect(() => parseDesignDocument(document)).toThrow(/reserved/iu);
      }
    },
  );
});
