import { describe, expect, it } from "vitest";

import {
  applyCommandBatch,
  CommandError,
  createCommandState,
  redo,
  undo,
} from "./index.js";
import { documentFixture, id } from "./test-fixtures.js";

const renameBatch = (batchId: string, revision: number, name: string) => ({
  id: batchId,
  actorId: id(41),
  baseRevision: revision,
  commands: [{ type: "rename-page" as const, pageId: id(2), name }],
});

describe("command history", () => {
  it("round-trips an undo and redo while incrementing revisions", () => {
    const initial = createCommandState(documentFixture());
    const changed = applyCommandBatch(
      initial,
      renameBatch(id(40), 0, "Changed"),
    );
    const undone = undo(changed);
    const redone = redo(undone);

    expect(undone.document).toEqual(initial.document);
    expect(undone.revision).toBe(2);
    expect(undone.past).toEqual([]);
    expect(undone.future).toEqual([changed.document]);
    expect(redone.document).toEqual(changed.document);
    expect(redone.revision).toBe(3);
    expect(redone.past).toEqual([initial.document]);
    expect(redone.future).toEqual([]);
  });

  it("clears redo history after a new change", () => {
    const changed = applyCommandBatch(
      createCommandState(documentFixture()),
      renameBatch(id(42), 0, "First"),
    );
    const undone = undo(changed);
    const replacement = applyCommandBatch(
      undone,
      renameBatch(id(43), undone.revision, "Replacement"),
    );

    expect(replacement.future).toEqual([]);
    expect(() => redo(replacement)).toThrowError(
      expect.objectContaining({ code: "HISTORY_EMPTY" }),
    );
  });

  it("uses typed errors when no undo is available", () => {
    try {
      undo(createCommandState(documentFixture()));
      throw new Error("Expected undo to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(CommandError);
      expect(error).toMatchObject({ code: "HISTORY_EMPTY" });
    }
  });
});
