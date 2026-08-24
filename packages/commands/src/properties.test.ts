import { parseDesignDocument } from "@blue-canvas/document";
import fc from "fast-check";
import { expect, it } from "vitest";

import { applyCommandBatch, createCommandState, redo, undo } from "./index.js";
import { documentFixture, id } from "./test-fixtures.js";

const pageName = fc.string({ minLength: 1, maxLength: 40 });

it("does not mutate state or batches for arbitrary valid commands", () => {
  fc.assert(
    fc.property(pageName, fc.integer({ min: 0, max: 1000 }), (name, value) => {
      const state = createCommandState(documentFixture());
      const batch = {
        id: id(60),
        actorId: id(61),
        baseRevision: 0,
        commands: [
          { type: "rename-page" as const, pageId: id(2), name },
          {
            type: "set-token" as const,
            name: "size",
            value: { type: "dimension" as const, value },
          },
        ],
      };
      const stateBefore = structuredClone(state);
      const batchBefore = structuredClone(batch);

      applyCommandBatch(state, batch);

      expect(state).toEqual(stateBefore);
      expect(batch).toEqual(batchBefore);
    }),
  );
});

it("keeps arbitrary valid command sequences parseable", () => {
  fc.assert(
    fc.property(fc.array(pageName, { maxLength: 25 }), (names) => {
      let state = createCommandState(documentFixture());
      for (const [index, name] of names.entries()) {
        state = applyCommandBatch(state, {
          id: id(100 + index),
          actorId: id(61),
          baseRevision: state.revision,
          commands: [
            { type: "rename-page", pageId: id(2), name },
            {
              type: "set-variable",
              name: `value-${index}`,
              value: { type: "number", value: index },
            },
          ],
        });
      }

      expect(() => parseDesignDocument(state.document)).not.toThrow();
      expect(state.revision).toBe(names.length);
    }),
  );
});

it("round-trips arbitrary command history through undo and redo", () => {
  fc.assert(
    fc.property(
      fc.array(pageName, { minLength: 1, maxLength: 20 }),
      (names) => {
        const initial = createCommandState(documentFixture());
        let state = initial;
        for (const [index, name] of names.entries()) {
          state = applyCommandBatch(state, {
            id: id(200 + index),
            actorId: id(61),
            baseRevision: state.revision,
            commands: [{ type: "rename-page", pageId: id(2), name }],
          });
        }
        const finalDocument = state.document;

        state = names.reduce((current) => undo(current), state);
        expect(state.document).toEqual(initial.document);
        state = names.reduce((current) => redo(current), state);
        expect(state.document).toEqual(finalDocument);
      },
    ),
  );
});
