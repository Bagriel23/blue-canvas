import {
  parseDesignDocument,
  type DesignDocument,
} from "@blue-canvas/document";

const documentSeed = {
  schemaVersion: 1 as const,
  id: "4a4d0000-0000-7000-8000-000000000001",
  name: "Demo landing",
  tokens: {},
  variables: {},
  components: [],
  pages: [
    {
      id: "4a4d0000-0000-7000-8000-000000000101",
      name: "Landing",
      artboards: [
        {
          id: "4a4d0000-0000-7000-8000-000000000201",
          name: "Desktop",
          width: 1200,
          height: 720,
          breakpoint: { name: "desktop", minWidth: 1024 },
          root: {
            kind: "stack",
            id: "4a4d0000-0000-7000-8000-000000000301",
            name: "Page",
            visible: true,
            style: {
              padding: { top: 48, right: 64, bottom: 48, left: 64 },
              background: "#ffffff",
            },
            layout: {
              direction: "column",
              gap: 32,
              align: "stretch",
              justify: "start",
              wrap: "nowrap",
            },
            children: [
              {
                kind: "stack",
                id: "4a4d0000-0000-7000-8000-000000000302",
                name: "Header",
                visible: true,
                style: {},
                layout: {
                  direction: "row",
                  gap: 16,
                  align: "center",
                  justify: "space-between",
                  wrap: "nowrap",
                },
                children: [
                  {
                    kind: "text",
                    id: "4a4d0000-0000-7000-8000-000000000303",
                    name: "Brand",
                    visible: true,
                    style: {
                      fontWeight: 600,
                      fontSize: 20,
                      lineHeight: 1.2,
                    },
                    text: "Blue Canvas",
                  },
                  {
                    kind: "button",
                    id: "4a4d0000-0000-7000-8000-000000000304",
                    name: "Primary",
                    visible: true,
                    style: {
                      padding: { top: 8, right: 16, bottom: 8, left: 16 },
                      background: "#1428a0",
                      color: "#ffffff",
                      borderRadius: 6,
                      fontSize: 14,
                      fontWeight: 500,
                    },
                    buttonType: "button",
                    children: [
                      {
                        kind: "text",
                        id: "4a4d0000-0000-7000-8000-000000000305",
                        name: "Label",
                        visible: true,
                        style: {},
                        text: "Get started",
                      },
                    ],
                  },
                ],
              },
              {
                kind: "stack",
                id: "4a4d0000-0000-7000-8000-000000000306",
                name: "Hero",
                visible: true,
                style: {},
                layout: {
                  direction: "column",
                  gap: 16,
                  align: "start",
                  justify: "start",
                  wrap: "nowrap",
                },
                children: [
                  {
                    kind: "text",
                    id: "4a4d0000-0000-7000-8000-000000000307",
                    name: "Heading",
                    visible: true,
                    style: {
                      fontWeight: 700,
                      fontSize: 40,
                      lineHeight: 1.15,
                    },
                    text: "Design internal tools together, offline.",
                  },
                  {
                    kind: "text",
                    id: "4a4d0000-0000-7000-8000-000000000308",
                    name: "Subheading",
                    visible: true,
                    style: {
                      fontSize: 16,
                      lineHeight: 1.5,
                    },
                    text: "Ship semantic HTML, React, and Preact — with zero telemetry.",
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

export function loadDemoDocument(): DesignDocument {
  return parseDesignDocument(documentSeed);
}
