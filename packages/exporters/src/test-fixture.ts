import {
  parseDesignDocument,
  type DesignDocument,
  type DesignNode,
} from "@blue-canvas/document";

import type { ExportAsset } from "./types.js";

export const fixtureId = (suffix: number): string =>
  `30000000-0000-4000-8000-${suffix.toString().padStart(12, "0")}`;

const style = {};

function text(id: number, value: string): DesignNode {
  return {
    id: fixtureId(id),
    kind: "text",
    name: value,
    visible: true,
    style,
    text: value,
  };
}

export function exporterDocumentFixture(): DesignDocument {
  const aboutPageId = fixtureId(81);
  const overlayId = fixtureId(29);
  const componentId = fixtureId(90);

  return parseDesignDocument({
    schemaVersion: 1,
    id: fixtureId(1),
    name: "Storefront <demo>",
    tokens: {
      accent: { type: "color", value: "#1428a0" },
      gutter: { type: "dimension", value: 16 },
      headingFont: { type: "font-family", value: "Arial, sans-serif" },
    },
    variables: {
      query: { type: "string", value: "" },
      subscribed: { type: "boolean", value: false },
    },
    components: [
      {
        id: componentId,
        name: "Product badge",
        root: {
          id: fixtureId(91),
          kind: "stack",
          name: "Badge layout",
          visible: true,
          style: {
            background: { token: "accent" },
            padding: { token: "gutter" },
          },
          layout: {
            direction: "row",
            gap: 4,
            align: "center",
            justify: "start",
            wrap: "nowrap",
          },
          children: [text(92, "Featured")],
        },
      },
    ],
    pages: [
      {
        id: fixtureId(2),
        name: "Home / Shop",
        artboards: [
          {
            id: fixtureId(3),
            name: "Desktop",
            width: 1280,
            height: 720,
            breakpoint: { name: "desktop", minWidth: 768 },
            root: {
              id: fixtureId(4),
              kind: "stack",
              name: "Home layout",
              visible: true,
              style: { color: { token: "accent" } },
              layout: {
                direction: "column",
                gap: { token: "gutter" },
                align: "stretch",
                justify: "start",
                wrap: "nowrap",
              },
              children: [
                text(5, "Blue Canvas & Store"),
                {
                  id: fixtureId(6),
                  kind: "grid",
                  name: "Product grid",
                  visible: true,
                  style,
                  layout: {
                    columns: [
                      { type: "fraction", value: 1 },
                      { type: "fixed", value: 240 },
                    ],
                    rows: [{ type: "auto" }],
                    gap: 12,
                    align: "stretch",
                    justify: "start",
                  },
                  children: [
                    {
                      id: fixtureId(7),
                      kind: "image",
                      name: "Canvas preview",
                      visible: true,
                      style: { borderRadius: 8 },
                      source: { type: "asset", assetId: fixtureId(100) },
                      alt: "Blue canvas product preview",
                    },
                    {
                      id: fixtureId(8),
                      kind: "icon",
                      name: "Spark icon",
                      visible: true,
                      style,
                      icon: "sparkles",
                      label: "Featured",
                    },
                    {
                      id: fixtureId(9),
                      kind: "link",
                      name: "About link",
                      visible: true,
                      style,
                      href: "#about",
                      interactions: [
                        {
                          trigger: "click",
                          action: { type: "navigate", pageId: aboutPageId },
                        },
                      ],
                      children: [text(10, "About")],
                    },
                    {
                      id: fixtureId(11),
                      kind: "button",
                      name: "Subscribe",
                      visible: true,
                      style,
                      buttonType: "button",
                      interactions: [
                        {
                          trigger: "click",
                          action: {
                            type: "set-variable",
                            variable: "subscribed",
                            value: true,
                          },
                        },
                        {
                          trigger: "click",
                          action: { type: "open-overlay", overlayId },
                        },
                      ],
                      children: [text(12, "Subscribe")],
                    },
                    {
                      id: fixtureId(13),
                      kind: "form",
                      name: "Search form",
                      visible: true,
                      style,
                      interactions: [
                        {
                          trigger: "submit",
                          action: {
                            type: "filter-collection",
                            collection: "products",
                            variable: "query",
                          },
                        },
                      ],
                      children: [
                        {
                          id: fixtureId(14),
                          kind: "input",
                          name: "Search products",
                          visible: true,
                          style,
                          inputType: "search",
                          variable: "query",
                          placeholder: "Search",
                          interactions: [
                            {
                              trigger: "change",
                              action: {
                                type: "set-variable",
                                variable: "query",
                                value: "",
                              },
                            },
                          ],
                        },
                      ],
                    },
                    {
                      id: fixtureId(15),
                      kind: "repeater",
                      name: "Products",
                      visible: true,
                      style,
                      collection: "products",
                      children: [text(16, "Canvas Pro")],
                    },
                    {
                      id: fixtureId(17),
                      kind: "conditional",
                      name: "Subscribed message",
                      visible: true,
                      style,
                      variable: "subscribed",
                      equals: true,
                      whenTrue: [text(18, "Subscribed")],
                      whenFalse: [text(19, "Join the list")],
                    },
                    {
                      id: overlayId,
                      kind: "overlay",
                      name: "Success dialog",
                      visible: false,
                      style,
                      interactions: [
                        {
                          trigger: "click",
                          action: { type: "close-overlay" },
                        },
                      ],
                      children: [text(30, "Thank you")],
                    },
                    {
                      id: fixtureId(31),
                      kind: "component-instance",
                      name: "Badge instance",
                      visible: true,
                      style,
                      componentId,
                    },
                  ],
                },
              ],
            },
          },
          {
            id: fixtureId(40),
            name: "Mobile",
            width: 390,
            height: 844,
            breakpoint: { name: "mobile", minWidth: 0, maxWidth: 767 },
            root: {
              id: fixtureId(41),
              kind: "stack",
              name: "Mobile home",
              visible: true,
              style,
              layout: {
                direction: "column",
                gap: 8,
                align: "stretch",
                justify: "start",
                wrap: "nowrap",
              },
              children: [text(42, "Mobile store")],
            },
          },
        ],
      },
      {
        id: aboutPageId,
        name: "About",
        artboards: [
          {
            id: fixtureId(82),
            name: "Desktop",
            width: 1280,
            height: 720,
            breakpoint: { name: "desktop", minWidth: 0 },
            root: {
              id: fixtureId(83),
              kind: "stack",
              name: "About layout",
              visible: true,
              style,
              layout: {
                direction: "column",
                gap: 8,
                align: "stretch",
                justify: "start",
                wrap: "nowrap",
              },
              children: [text(84, "About Blue Canvas")],
            },
          },
        ],
      },
    ],
  });
}

export const fixtureAssets: Record<string, ExportAsset> = {
  [fixtureId(100)]: {
    fileName: "canvas preview.png",
    mimeType: "image/png",
    bytes: new Uint8Array([
      137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1,
      0, 0, 0, 1, 8, 4, 0, 0, 0, 181, 28, 12, 2, 0, 0, 0, 11, 73, 68, 65, 84,
      120, 218, 99, 100, 248, 15, 0, 1, 5, 1, 1, 39, 24, 227, 102, 0, 0, 0, 0,
      73, 69, 78, 68, 174, 66, 96, 130,
    ]),
  },
};
