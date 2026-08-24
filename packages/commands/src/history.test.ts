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

  it("deeply freezes isolated history snapshots", () => {
    const initial = createCommandState(documentFixture());
    const changed = applyCommandBatch(
      initial,
      renameBatch(id(44), 0, "Changed"),
    );
    const snapshot = changed.past[0];
    if (snapshot === undefined) throw new Error("Expected history snapshot");

    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.pages)).toBe(true);
    expect(Object.isFrozen(snapshot.pages[0])).toBe(true);
    expect(() => {
      snapshot.name = "Mutated";
    }).toThrow(TypeError);
    initial.document.name = "Caller mutation";
    expect(snapshot.name).toBe("Commands fixture");
  });

  it("reuses frozen history snapshots across undo and redo", () => {
    const first = applyCommandBatch(
      createCommandState(documentFixture()),
      renameBatch(id(45), 0, "First"),
    );
    const second = applyCommandBatch(first, renameBatch(id(46), 1, "Second"));
    const firstSnapshot = second.past[0];
    const undone = undo(second);

    expect(undone.past[0]).toBe(firstSnapshot);
    expect(Object.isFrozen(undone.future[0])).toBe(true);
    const redone = redo(undone);
    expect(redone.past[0]).toBe(firstSnapshot);
  });
});
