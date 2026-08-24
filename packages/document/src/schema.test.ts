import { expect, it } from "vitest";

import { designNodeSchema, parseDesignDocument } from "./index.js";

const id = (suffix: number): string =>
  `00000000-0000-4000-8000-${suffix.toString().padStart(12, "0")}`;

const common = (suffix: number, name: string) => ({
  id: id(suffix),
  name,
  visible: true,
  style: {},
});

it("parses every semantic node in a responsive document", () => {
  const document = {
    schemaVersion: 1,
    id: id(1),
    name: "Product",
    tokens: {
      "color.primary": { type: "color", value: "#1428a0" },
      "space.medium": { type: "dimension", value: 16 },
    },
    variables: {
      query: { type: "string", value: "" },
      showDetails: { type: "boolean", value: true },
    },
    components: [
      {
        id: id(2),
        name: "Product title",
        root: {
          kind: "text",
          ...common(3, "Title"),
          text: "A product",
        },
      },
    ],
    pages: [
      {
        id: id(4),
        name: "Catalog",
        artboards: [
          {
            id: id(5),
            name: "Desktop",
            width: 1440,
            height: 900,
            breakpoint: { name: "desktop", minWidth: 1024 },
            root: {
              kind: "stack",
              ...common(6, "Page"),
              style: { background: { token: "color.primary" } },
              layout: {
                direction: "column",
                gap: { token: "space.medium" },
                align: "stretch",
                justify: "start",
                wrap: "nowrap",
              },
              children: [
                {
                  kind: "grid",
                  ...common(7, "Products"),
                  layout: {
                    columns: [
                      { type: "fraction", value: 1 },
                      { type: "fraction", value: 2 },
                    ],
                    rows: [{ type: "auto" }],
                    gap: { token: "space.medium" },
                    align: "stretch",
                    justify: "stretch",
                  },
                  children: [
                    {
                      kind: "text",
                      ...common(8, "Description"),
                      text: "Details",
                    },
                  ],
                },
                {
                  kind: "image",
                  ...common(9, "Photo"),
                  source: {
                    type: "url",
                    url: "https://example.test/photo.png",
                  },
                  alt: "Product photo",
                },
                {
                  kind: "icon",
                  ...common(10, "Search icon"),
                  icon: "search",
                  label: "Search",
                },
                {
                  kind: "link",
                  ...common(11, "Details link"),
                  href: "/details",
                  children: [
                    {
                      kind: "text",
                      ...common(12, "Link text"),
                      text: "Details",
                    },
                  ],
                  interactions: [
                    {
                      trigger: "click",
                      action: { type: "navigate", pageId: id(4) },
                    },
                  ],
                },
                {
                  kind: "button",
                  ...common(13, "Toggle details"),
                  buttonType: "button",
                  children: [
                    {
                      kind: "text",
                      ...common(14, "Button text"),
                      text: "Toggle",
                    },
                  ],
                  interactions: [
                    {
                      trigger: "click",
                      action: {
                        type: "set-variable",
                        variable: "showDetails",
                        value: false,
                      },
                    },
                  ],
                },
                {
                  kind: "input",
                  ...common(15, "Search"),
                  inputType: "search",
                  variable: "query",
                  placeholder: "Search products",
                  interactions: [
                    {
                      trigger: "change",
                      action: {
                        type: "filter-collection",
                        collection: "products",
                        variable: "query",
                      },
                    },
                  ],
                },
                {
                  kind: "form",
                  ...common(16, "Search form"),
                  children: [],
                  interactions: [
                    {
                      trigger: "submit",
                      action: { type: "close-overlay" },
                    },
                  ],
                },
                {
                  kind: "repeater",
                  ...common(17, "Product list"),
                  collection: "products",
                  children: [],
                },
                {
                  kind: "conditional",
                  ...common(18, "Details visibility"),
                  variable: "showDetails",
                  equals: true,
                  whenTrue: [],
                  whenFalse: [],
                },
                {
                  kind: "overlay",
                  ...common(19, "Product dialog"),
                  children: [],
                },
                {
                  kind: "button",
                  ...common(20, "Open product dialog"),
                  buttonType: "button",
                  children: [],
                  interactions: [
                    {
                      trigger: "click",
                      action: { type: "open-overlay", overlayId: id(19) },
                    },
                  ],
                },
                {
                  kind: "component-instance",
                  ...common(21, "Product title instance"),
                  componentId: id(2),
                },
              ],
            },
          },
        ],
      },
    ],
  };

  expect(parseDesignDocument(document)).toEqual(document);
});

it("rejects a non-UUID image asset id", () => {
  expect(() =>
    designNodeSchema.parse({
      kind: "image",
      ...common(30, "Asset image"),
      source: { type: "asset", assetId: "logo-file" },
      alt: "Logo",
    }),
  ).toThrow();
});
