import { describe, expect, it } from "vitest";

import { applyCommandBatch, createCommandState } from "./index.js";
import { documentFixture, id, rootOf } from "./test-fixtures.js";

describe("applyCommandBatch", () => {
  it("atomically adds a node and increments the revision once", () => {
    const state = createCommandState(documentFixture());
    const before = structuredClone(state);
    const result = applyCommandBatch(state, {
      id: id(10),
      actorId: id(11),
      baseRevision: 0,
      commands: [
        {
          type: "add-node",
          parentId: id(4),
          node: {
            id: id(5),
            kind: "text",
            name: "Heading",
            visible: true,
            style: {},
            text: "Hello",
          },
        },
      ],
    });

    expect(state).toEqual(before);
    expect(result.revision).toBe(1);
    expect(result.appliedBatchIds).toEqual([id(10)]);
    expect(result.past).toEqual([before.document]);
    expect(result.future).toEqual([]);
    expect(rootOf(result.document)).toMatchObject({
      children: [expect.objectContaining({ id: id(5), text: "Hello" })],
    });
  });
});
