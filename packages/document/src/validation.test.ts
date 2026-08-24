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
    variables: {},
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
                  ],
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
});
