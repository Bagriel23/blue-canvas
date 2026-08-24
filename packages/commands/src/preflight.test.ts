import { describe, expect, it } from "vitest";

import {
  applyCommandBatch,
  CommandError,
  createCommandState,
  MAX_BATCH_NODE_COUNT,
  MAX_BATCH_NODE_DEPTH,
} from "./index.js";
import { documentFixture, id } from "./test-fixtures.js";

const commonNode = (suffix: number, name: string) => ({
  id: id(suffix),
  name,
  visible: true,
  style: {},
});

describe("command batch preflight", () => {
  it("supports documents with at least 1,000 nodes", () => {
    expect(MAX_BATCH_NODE_COUNT).toBeGreaterThanOrEqual(1_000);
  });

  it("rejects excessive nesting with a typed error before recursive parsing", () => {
    let node: unknown = {
      kind: "text",
      ...commonNode(900, "Leaf"),
      text: "Leaf",
    };
    for (let depth = 0; depth <= MAX_BATCH_NODE_DEPTH; depth += 1) {
      node = {
        kind: "stack",
        ...commonNode(901 + depth, `Depth ${depth}`),
        layout: {
          direction: "column",
          gap: 0,
          align: "stretch",
          justify: "start",
          wrap: "nowrap",
        },
        children: [node],
      };
    }

    expect(() =>
      applyCommandBatch(createCommandState(documentFixture()), {
        id: id(800),
        actorId: id(801),
        baseRevision: 0,
        commands: [{ type: "add-node", parentId: id(4), node }],
      }),
    ).toThrowError(
      expect.objectContaining<Partial<CommandError>>({ code: "INVALID_BATCH" }),
    );
  });

  it("rejects excessive node counts atomically", () => {
    const children = Array.from(
      { length: MAX_BATCH_NODE_COUNT },
      (_, index) => ({
        kind: "text",
        ...commonNode(2_000 + index, `Node ${index}`),
        text: "Item",
      }),
    );
    const node = {
      kind: "stack",
      ...commonNode(1_999, "Oversized"),
      layout: {
        direction: "column",
        gap: 0,
        align: "stretch",
        justify: "start",
        wrap: "nowrap",
      },
      children,
    };
    const state = createCommandState(documentFixture());
    const before = structuredClone(state);

    expect(() =>
      applyCommandBatch(state, {
        id: id(802),
        actorId: id(801),
        baseRevision: 0,
        commands: [{ type: "add-node", parentId: id(4), node }],
      }),
    ).toThrowError(
      expect.objectContaining<Partial<CommandError>>({ code: "INVALID_BATCH" }),
    );
    expect(state).toEqual(before);
  });
});
