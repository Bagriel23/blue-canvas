import { describe, expect, it } from "vitest";

import { parseDesignDocument } from "./index.js";

const id = (suffix: number): string =>
  `10000000-0000-4000-8000-${suffix.toString().padStart(12, "0")}`;

function validDocument() {
  return {
    schemaVersion: 1 as const,
    id: id(1),
    name: "Validation fixture",
    tokens: { space: { type: "dimension" as const, value: 8 } },
    variables: {
      query: { type: "string" as const, value: "" },
      show: { type: "boolean" as const, value: true },
      count: { type: "number" as const, value: 1 },
    },
    components: [
      {
        id: id(2),
        name: "Label",
        root: {
          id: id(3),
          kind: "text" as const,
          name: "Label text",
          visible: true,
          style: {},
          text: "Label",
        },
      },
    ],
    pages: [
      {
        id: id(4),
        name: "Page",
        artboards: [
          {
            id: id(5),
            name: "Desktop",
            width: 1280,
            height: 720,
            breakpoint: { name: "desktop", minWidth: 1024 },
            root: {
              id: id(6),
              kind: "stack" as const,
              name: "Root",
              visible: true,
              style: {},
              layout: {
                direction: "column" as const,
                gap: { token: "space" },
                align: "stretch" as const,
                justify: "start" as const,
                wrap: "nowrap" as const,
              },
              children: [
                {
                  id: id(7),
                  kind: "overlay" as const,
                  name: "Dialog",
                  visible: true,
                  style: {},
                  children: [],
                },
                {
                  id: id(8),
                  kind: "component-instance" as const,
                  name: "Label instance",
                  visible: true,
                  style: {},
                  componentId: id(2),
                },
                {
                  id: id(9),
                  kind: "button" as const,
                  name: "Open dialog",
                  visible: true,
                  style: {},
                  buttonType: "button" as const,
                  children: [],
                  interactions: [
                    {
                      trigger: "click" as const,
                      action: {
                        type: "open-overlay" as const,
                        overlayId: id(7),
                      },
                    },
                    {
                      trigger: "click" as const,
                      action: {
                        type: "set-variable" as const,
                        variable: "show",
                        value: false,
                      },
                    },
                    {
                      trigger: "click" as const,
                      action: {
                        type: "filter-collection" as const,
                        collection: "items",
                        variable: "query",
                      },
                    },
                  ],
                },
                {
                  id: id(10),
                  kind: "input" as const,
                  name: "Count",
                  visible: true,
                  style: {},
                  inputType: "number" as const,
                  variable: "count",
                },
                {
                  id: id(11),
                  kind: "conditional" as const,
                  name: "Visible",
                  visible: true,
                  style: {},
                  variable: "show",
                  equals: true,
                  whenTrue: [],
                  whenFalse: [],
                },
              ],
            },
          },
        ],
      },
    ],
  };
}

function at<T>(items: readonly T[], index: number): T {
  const item = items.at(index);
  if (item === undefined)
    throw new Error(`Missing fixture item at index ${index}`);
  return item;
}

describe("document-wide validation", () => {
  it.each([
    [
      "page",
      (document: ReturnType<typeof validDocument>) => {
        document.pages.push(structuredClone(at(document.pages, 0)));
      },
    ],
    [
      "artboard",
      (document: ReturnType<typeof validDocument>) => {
        const page = at(document.pages, 0);
        at(page.artboards, 0).id = page.id;
      },
    ],
    [
      "component",
      (document: ReturnType<typeof validDocument>) => {
        at(document.components, 0).id = at(document.pages, 0).id;
      },
    ],
    [
      "node",
      (document: ReturnType<typeof validDocument>) => {
        const page = at(document.pages, 0);
        at(document.components, 0).root.id = at(page.artboards, 0).root.id;
      },
    ],
  ])("rejects a duplicate %s id", (_label, mutate) => {
    const document = validDocument();
    mutate(document);

    expect(() => parseDesignDocument(document)).toThrow(/duplicate id/iu);
  });

  it.each([
    [
      "component",
      (document: ReturnType<typeof validDocument>) => {
        const page = at(document.pages, 0);
        const instance = at(at(page.artboards, 0).root.children, 1);
        if (instance.kind !== "component-instance") {
          throw new Error("Expected component instance fixture");
        }
        instance.componentId = id(90);
      },
    ],
    [
      "overlay",
      (document: ReturnType<typeof validDocument>) => {
        const page = at(document.pages, 0);
        const button = at(at(page.artboards, 0).root.children, 2);
        const interaction = at(button.interactions ?? [], 0);
        if (interaction.action.type !== "open-overlay") {
          throw new Error("Expected open-overlay fixture");
        }
        interaction.action.overlayId = id(91);
      },
    ],
    [
      "token",
      (document: ReturnType<typeof validDocument>) => {
        const page = at(document.pages, 0);
        at(page.artboards, 0).root.layout.gap = { token: "missing" };
      },
    ],
  ])("rejects a dangling %s reference", (_label, mutate) => {
    const document = validDocument();
    mutate(document);

    expect(() => parseDesignDocument(document)).toThrow(/dangling/iu);
  });

  it("rejects a token reference with an incompatible semantic type", () => {
    const document = validDocument();
    const page = at(document.pages, 0);
    Object.assign(at(page.artboards, 0).root.style, {
      background: { token: "space" },
    });

    expect(() => parseDesignDocument(document)).toThrow(/token type/iu);
  });

  it.each([
    { type: "navigate", url: "javascript:alert('unsafe')" },
    { type: "navigate" },
    { type: "navigate", pageId: id(4), url: "/other" },
  ])("rejects unsafe or ambiguous navigation action %#", (action) => {
    const document = validDocument();
    const page = at(document.pages, 0);
    const button = at(at(page.artboards, 0).root.children, 2);
    Object.assign(at(button.interactions ?? [], 0), { action });

    expect(() => parseDesignDocument(document)).toThrow();
  });

  it.each([
    [
      "input",
      (document: ReturnType<typeof validDocument>) => {
        const root = at(at(document.pages, 0).artboards, 0).root;
        const input = at(root.children, 3);
        if (input.kind !== "input") throw new Error("Expected input fixture");
        input.variable = "missing";
      },
    ],
    [
      "conditional",
      (document: ReturnType<typeof validDocument>) => {
        const root = at(at(document.pages, 0).artboards, 0).root;
        const conditional = at(root.children, 4);
        if (conditional.kind !== "conditional") {
          throw new Error("Expected conditional fixture");
        }
        conditional.variable = "missing";
      },
    ],
    [
      "set-variable",
      (document: ReturnType<typeof validDocument>) => {
        const root = at(at(document.pages, 0).artboards, 0).root;
        const button = at(root.children, 2);
        const action = at(button.interactions ?? [], 1).action;
        if (action.type !== "set-variable") throw new Error("Expected action");
        action.variable = "missing";
      },
    ],
    [
      "filter-collection",
      (document: ReturnType<typeof validDocument>) => {
        const root = at(at(document.pages, 0).artboards, 0).root;
        const button = at(root.children, 2);
        const action = at(button.interactions ?? [], 2).action;
        if (action.type !== "filter-collection")
          throw new Error("Expected action");
        action.variable = "missing";
      },
    ],
  ])("rejects a dangling %s variable reference", (_label, mutate) => {
    const document = validDocument();
    mutate(document);

    expect(() => parseDesignDocument(document)).toThrow(/dangling variable/iu);
  });

  it("rejects input bindings with an incompatible variable type", () => {
    const document = validDocument();
    const root = at(at(document.pages, 0).artboards, 0).root;
    const input = at(root.children, 3);
    if (input.kind !== "input") throw new Error("Expected input fixture");
    input.variable = "query";

    expect(() => parseDesignDocument(document)).toThrow(/variable type/iu);
  });

  it("rejects conditional comparisons with an incompatible value type", () => {
    const document = validDocument();
    const root = at(at(document.pages, 0).artboards, 0).root;
    const conditional = at(root.children, 4);
    if (conditional.kind !== "conditional") {
      throw new Error("Expected conditional fixture");
    }
    Object.assign(conditional, { equals: "true" });

    expect(() => parseDesignDocument(document)).toThrow(/variable type/iu);
  });

  it("rejects set-variable values with an incompatible variable type", () => {
    const document = validDocument();
    const root = at(at(document.pages, 0).artboards, 0).root;
    const button = at(root.children, 2);
    const action = at(button.interactions ?? [], 1).action;
    if (action.type !== "set-variable") throw new Error("Expected action");
    Object.assign(action, { value: "false" });

    expect(() => parseDesignDocument(document)).toThrow(/variable type/iu);
  });

  it("rejects a self-referencing component cycle", () => {
    const document = parseDesignDocument(validDocument());
    const component = at(document.components, 0);
    component.root = {
      id: id(12),
      kind: "component-instance",
      name: "Recursive label",
      visible: true,
      style: {},
      componentId: component.id,
    };

    expect(() => parseDesignDocument(document)).toThrow(
      /component cycle.*Label.*Label/iu,
    );
  });

  it("rejects a mutual component cycle with the dependency path", () => {
    const document = parseDesignDocument(validDocument());
    const label = at(document.components, 0);
    const cardId = id(13);
    label.root = {
      id: id(14),
      kind: "component-instance",
      name: "Card instance",
      visible: true,
      style: {},
      componentId: cardId,
    };
    document.components.push({
      id: cardId,
      name: "Card",
      root: {
        id: id(15),
        kind: "component-instance",
        name: "Label instance",
        visible: true,
        style: {},
        componentId: label.id,
      },
    });

    expect(() => parseDesignDocument(document)).toThrow(
      /component cycle.*Label.*Card.*Label/iu,
    );
  });
});
