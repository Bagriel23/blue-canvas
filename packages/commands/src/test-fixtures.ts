import {
  parseDesignDocument,
  type DesignDocument,
  type DesignNode,
  type DesignPage,
} from "@blue-canvas/document";

export const id = (suffix: number): string =>
  `20000000-0000-4000-8000-${suffix.toString().padStart(12, "0")}`;

export function documentFixture(): DesignDocument {
  return parseDesignDocument({
    schemaVersion: 1,
    id: id(1),
    name: "Commands fixture",
    tokens: {},
    variables: {},
    components: [],
    pages: [
      {
        id: id(2),
        name: "Home",
        artboards: [
          {
            id: id(3),
            name: "Desktop",
            width: 1280,
            height: 720,
            breakpoint: { name: "desktop", minWidth: 1024 },
            root: {
              id: id(4),
              kind: "stack",
              name: "Root",
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
          },
        ],
      },
    ],
  });
}

export function pageOf(document: DesignDocument): DesignPage {
  const page = document.pages.at(0);
  if (page === undefined) throw new Error("Fixture must contain a page");
  return page;
}

export function rootOf(document: DesignDocument): DesignNode {
  const artboard = pageOf(document).artboards.at(0);
  if (artboard === undefined)
    throw new Error("Fixture must contain an artboard");
  return artboard.root;
}
