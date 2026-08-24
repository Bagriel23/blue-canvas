import { describe, expect, it } from "vitest";

import {
  applyCommandBatch,
  CommandError,
  createCommandState,
} from "./index.js";
import { documentFixture, id } from "./test-fixtures.js";

describe("command batch safety", () => {
  it.each([null, undefined, 42])(
    "rejects unknown batch input %# with INVALID_BATCH",
    (input) => {
      const state = createCommandState(documentFixture());

      expect(() => applyCommandBatch(state, input)).toThrowError(
        expect.objectContaining<Partial<CommandError>>({
          code: "INVALID_BATCH",
        }),
      );
    },
  );

  it("validates a malformed duplicate-id batch before idempotency", () => {
    const applied = applyCommandBatch(createCommandState(documentFixture()), {
      id: id(49),
      actorId: id(51),
      baseRevision: 0,
      commands: [],
    });

    expect(() => applyCommandBatch(applied, { id: id(49) })).toThrowError(
      expect.objectContaining<Partial<CommandError>>({ code: "INVALID_BATCH" }),
    );
  });

  it.each([
    ["set-token", "__proto__"],
    ["set-token", "constructor"],
    ["set-token", "prototype"],
    ["set-variable", "__proto__"],
    ["set-variable", "constructor"],
    ["set-variable", "prototype"],
  ] as const)("rejects reserved key %s:%s", (type, name) => {
    const state = createCommandState(documentFixture());
    const command = {
      type,
      name,
      value: { type: "string" as const, value: "unsafe" },
    };

    expect(() =>
      applyCommandBatch(state, {
        id: id(48),
        actorId: id(51),
        baseRevision: 0,
        commands: [command],
      }),
    ).toThrowError(
      expect.objectContaining<Partial<CommandError>>({ code: "INVALID_BATCH" }),
    );
    expect(Object.getPrototypeOf(state.document.tokens)).toBe(Object.prototype);
    expect(Object.getPrototypeOf(state.document.variables)).toBe(
      Object.prototype,
    );
  });

  it("rejects revision conflicts with a typed domain error", () => {
    const state = createCommandState(documentFixture());

    expect(() =>
      applyCommandBatch(state, {
        id: id(50),
        actorId: id(51),
        baseRevision: 1,
        commands: [],
      }),
    ).toThrowError(
      expect.objectContaining<Partial<CommandError>>({
        code: "REVISION_CONFLICT",
      }),
    );
  });

  it("treats an already applied batch id as an idempotent no-op", () => {
    const first = applyCommandBatch(createCommandState(documentFixture()), {
      id: id(52),
      actorId: id(51),
      baseRevision: 0,
      commands: [{ type: "rename-page", pageId: id(2), name: "Applied" }],
    });

    expect(
      applyCommandBatch(first, {
        id: id(52),
        actorId: id(51),
        baseRevision: 0,
        commands: [{ type: "rename-page", pageId: id(2), name: "Ignored" }],
      }),
    ).toBe(first);
  });

  it("records an empty batch without incrementing revision or history", () => {
    const state = createCommandState(documentFixture());
    const result = applyCommandBatch(state, {
      id: id(53),
      actorId: id(51),
      baseRevision: 0,
      commands: [],
    });

    expect(result).toMatchObject({ revision: 0, past: [], future: [] });
    expect(result.appliedBatchIds).toEqual([id(53)]);
  });

  it("rolls back every command when a later command fails", () => {
    const state = createCommandState(documentFixture());
    const before = structuredClone(state);

    expect(() =>
      applyCommandBatch(state, {
        id: id(54),
        actorId: id(51),
        baseRevision: 0,
        commands: [
          { type: "rename-page", pageId: id(2), name: "Must roll back" },
          { type: "remove-node", nodeId: id(99) },
        ],
      }),
    ).toThrowError(
      expect.objectContaining<Partial<CommandError>>({
        code: "TARGET_NOT_FOUND",
      }),
    );
    expect(state).toEqual(before);
  });

  it("rejects invalid resulting documents atomically", () => {
    const state = createCommandState(documentFixture());

    expect(() =>
      applyCommandBatch(state, {
        id: id(55),
        actorId: id(51),
        baseRevision: 0,
        commands: [
          {
            type: "update-node",
            nodeId: id(4),
            patch: { style: { color: { token: "missing" } } },
          },
        ],
      }),
    ).toThrowError(
      expect.objectContaining<Partial<CommandError>>({
        code: "INVALID_RESULT",
      }),
    );
    expect(state.document).toEqual(documentFixture());
  });
});
