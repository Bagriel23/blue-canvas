import {
  parseDesignDocument,
  type DesignDocument,
} from "@blue-canvas/document";
import { describe, expect, it } from "vitest";

import { applyCommandBatch, createCommandState } from "./index.js";
import { documentFixture, id, pageOf, rootOf } from "./test-fixtures.js";

function documentWithNodes(): DesignDocument {
  const document = structuredClone(documentFixture());
  const root = rootOf(document);
  if (root.kind !== "stack") throw new Error("Fixture root must be a stack");
  root.children = [
    {
      id: id(20),
      kind: "stack",
      name: "Source",
      visible: true,
      style: {},
      layout: {
        direction: "column",
        gap: 0,
        align: "stretch",
        justify: "start",
        wrap: "nowrap",
      },
      children: [
        {
          id: id(21),
          kind: "text",
          name: "Movable",
          visible: true,
          style: {},
          text: "Move me",
        },
      ],
    },
    {
      id: id(22),
      kind: "stack",
      name: "Destination",
      visible: true,
      style: {},
      layout: {
        direction: "column",
        gap: 0,
        align: "stretch",
        justify: "start",
        wrap: "nowrap",
      },
      children: [],
    },
  ];
  return parseDesignDocument(document);
}

describe("document mutations", () => {
  it("updates nodes, tokens, variables, and page names in one revision", () => {
    const state = createCommandState(documentFixture());
    const result = applyCommandBatch(state, {
      id: id(30),
      actorId: id(31),
      baseRevision: 0,
      commands: [
        {
          type: "update-node",
          nodeId: id(4),
          patch: {
            name: "Updated root",
            visible: false,
            style: { opacity: 0.5 },
          },
        },
        {
          type: "set-token",
          name: "color.accent",
          value: { type: "color", value: "#ff0000" },
        },
        {
          type: "set-variable",
          name: "enabled",
          value: { type: "boolean", value: true },
        },
        { type: "rename-page", pageId: id(2), name: "Dashboard" },
      ],
    });

    expect(result.revision).toBe(1);
    expect(pageOf(result.document).name).toBe("Dashboard");
    expect(rootOf(result.document)).toMatchObject({
      name: "Updated root",
      visible: false,
      style: { opacity: 0.5 },
    });
    expect(result.document.tokens["color.accent"]).toEqual({
      type: "color",
      value: "#ff0000",
    });
    expect(result.document.variables.enabled).toEqual({
      type: "boolean",
      value: true,
    });
  });

  it("moves a node between child-bearing nodes", () => {
    const result = applyCommandBatch(createCommandState(documentWithNodes()), {
      id: id(32),
      actorId: id(31),
      baseRevision: 0,
      commands: [
        { type: "move-node", nodeId: id(21), parentId: id(22), index: 0 },
      ],
    });
    const root = rootOf(result.document);
    if (root.kind !== "stack") throw new Error("Expected stack root");
    const [source, destination] = root.children;

    expect(source).toMatchObject({ children: [] });
    expect(destination).toMatchObject({
      children: [expect.objectContaining({ id: id(21) })],
    });
  });

  it("removes a node and its subtree", () => {
    const result = applyCommandBatch(createCommandState(documentWithNodes()), {
      id: id(33),
      actorId: id(31),
      baseRevision: 0,
      commands: [{ type: "remove-node", nodeId: id(20) }],
    });

    expect(JSON.stringify(result.document)).not.toContain(id(20));
    expect(JSON.stringify(result.document)).not.toContain(id(21));
  });
});
