import { parseDesignDocument } from "@blue-canvas/document";
import fc from "fast-check";
import { expect, it } from "vitest";

import {
  applyCommandBatch,
  CommandError,
  createCommandState,
  redo,
  undo,
} from "./index.js";
import { documentFixture, id, rootOf } from "./test-fixtures.js";

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

const textValue = fc.string({ maxLength: 30 });
const listOperation = fc.oneof(
  fc.record({ kind: fc.constant("add"), position: fc.nat(), text: textValue }),
  fc.record({
    kind: fc.constant("update"),
    position: fc.nat(),
    text: textValue,
  }),
  fc.record({
    kind: fc.constant("move"),
    position: fc.nat(),
    destination: fc.nat(),
  }),
  fc.record({ kind: fc.constant("remove"), position: fc.nat() }),
);

it("matches a list model across add, update, move, and remove commands", () => {
  fc.assert(
    fc.property(fc.array(listOperation, { maxLength: 40 }), (operations) => {
      let state = createCommandState(documentFixture());
      const model: { id: string; text: string }[] = [];

      for (const [operationIndex, operation] of operations.entries()) {
        const commands = [];
        if (operation.kind === "add") {
          const nodeId = id(1_000 + operationIndex);
          const index = operation.position % (model.length + 1);
          commands.push({
            type: "add-node" as const,
            parentId: id(4),
            index,
            node: {
              id: nodeId,
              kind: "text" as const,
              name: "Item",
              visible: true,
              style: {},
              text: operation.text,
            },
          });
          model.splice(index, 0, { id: nodeId, text: operation.text });
        } else if (model.length > 0) {
          const index = operation.position % model.length;
          const item = model[index];
          if (item === undefined) throw new Error("Model index must exist");
          if (operation.kind === "update") {
            commands.push({
              type: "update-node" as const,
              nodeId: item.id,
              patch: { text: operation.text },
            });
            item.text = operation.text;
          } else if (operation.kind === "move") {
            const [moved] = model.splice(index, 1);
            if (moved === undefined) throw new Error("Moved item must exist");
            const destination = operation.destination % (model.length + 1);
            commands.push({
              type: "move-node" as const,
              nodeId: item.id,
              parentId: id(4),
              index: destination,
            });
            model.splice(destination, 0, moved);
          } else {
            commands.push({ type: "remove-node" as const, nodeId: item.id });
            model.splice(index, 1);
          }
        }
        if (commands.length === 0) continue;

        const batch = {
          id: id(2_000 + operationIndex),
          actorId: id(61),
          baseRevision: state.revision,
          commands,
        };
        const priorState = state;
        const stateBefore = structuredClone(priorState);
        const batchBefore = structuredClone(batch);
        state = applyCommandBatch(state, batch);

        expect(priorState).toEqual(stateBefore);
        expect(batch).toEqual(batchBefore);
        expect(() => parseDesignDocument(state.document)).not.toThrow();
        const root = rootOf(state.document);
        if (root.kind !== "stack")
          throw new Error("Fixture root must be a stack");
        expect(
          root.children.map((node) => ({
            id: node.id,
            text: node.kind === "text" ? node.text : "",
          })),
        ).toEqual(model);
      }
    }),
  );
});

it("supports arbitrary conditional child slots", () => {
  fc.assert(
    fc.property(fc.array(fc.boolean(), { maxLength: 30 }), (slots) => {
      let state = applyCommandBatch(createCommandState(documentFixture()), {
        id: id(3_000),
        actorId: id(61),
        baseRevision: 0,
        commands: [
          {
            type: "set-variable",
            name: "enabled",
            value: { type: "boolean", value: true },
          },
          {
            type: "add-node",
            parentId: id(4),
            node: {
              id: id(3_001),
              kind: "conditional",
              name: "Conditional",
              visible: true,
              style: {},
              variable: "enabled",
              equals: true,
              whenTrue: [],
              whenFalse: [],
            },
          },
        ],
      });

      for (const [index, whenTrue] of slots.entries()) {
        state = applyCommandBatch(state, {
          id: id(3_010 + index),
          actorId: id(61),
          baseRevision: state.revision,
          commands: [
            {
              type: "add-node",
              parentId: id(3_001),
              slot: whenTrue ? "whenTrue" : "whenFalse",
              node: {
                id: id(3_100 + index),
                kind: "text",
                name: "Branch item",
                visible: true,
                style: {},
                text: String(index),
              },
            },
          ],
        });
      }

      const root = rootOf(state.document);
      if (root.kind !== "stack")
        throw new Error("Fixture root must be a stack");
      const conditional = root.children[0];
      if (conditional?.kind !== "conditional") {
        throw new Error("Conditional node must exist");
      }
      expect(conditional.whenTrue).toHaveLength(slots.filter(Boolean).length);
      expect(conditional.whenFalse).toHaveLength(
        slots.filter((slot) => !slot).length,
      );
    }),
  );
});

it("rolls back arbitrary batches containing invalid indices", () => {
  fc.assert(
    fc.property(
      pageName,
      fc.integer({ min: 1, max: 10_000 }),
      (name, index) => {
        const state = createCommandState(documentFixture());
        const before = structuredClone(state);
        expect(() =>
          applyCommandBatch(state, {
            id: id(4_000),
            actorId: id(61),
            baseRevision: 0,
            commands: [
              { type: "rename-page", pageId: id(2), name },
              {
                type: "add-node",
                parentId: id(4),
                index,
                node: {
                  id: id(4_001),
                  kind: "text",
                  name: "Item",
                  visible: true,
                  style: {},
                  text: "value",
                },
              },
            ],
          }),
        ).toThrowError(expect.objectContaining({ code: "INVALID_INDEX" }));
        expect(state).toEqual(before);
      },
    ),
  );
});

it("accepts only exact retries for arbitrary batch content", () => {
  fc.assert(
    fc.property(pageName, pageName, (firstName, secondName) => {
      fc.pre(firstName !== secondName);
      const initial = createCommandState(documentFixture());
      const batch = {
        id: id(5_000),
        actorId: id(61),
        baseRevision: 0,
        commands: [
          { type: "rename-page" as const, pageId: id(2), name: firstName },
        ],
      };
      const applied = applyCommandBatch(initial, batch);

      expect(applyCommandBatch(applied, structuredClone(batch))).toBe(applied);
      expect(() =>
        applyCommandBatch(applied, {
          ...batch,
          commands: [{ type: "rename-page", pageId: id(2), name: secondName }],
        }),
      ).toThrowError(
        expect.objectContaining<Partial<CommandError>>({
          code: "IDEMPOTENCY_CONFLICT",
        }),
      );
    }),
  );
});
