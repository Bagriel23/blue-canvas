import { parseDesignDocument } from "@blue-canvas/document";

import type { TemplateManifest } from "../schemas.js";

interface TemplateSeed {
  templateId: string;
  slug: string;
  displayName: string;
  description: string;
  category: TemplateManifest["category"];
  kit: TemplateManifest["kit"];
  ids: [string, string, string, string, string];
  headline: string;
}

function buildDocument(seed: TemplateSeed) {
  const [documentId, pageId, artboardId, rootId, headingId] = seed.ids;
  return parseDesignDocument({
    schemaVersion: 1,
    id: documentId,
    name: seed.displayName,
    tokens: {},
    variables: {},
    components: [],
    pages: [
      {
        id: pageId,
        name: seed.displayName,
        artboards: [
          {
            id: artboardId,
            name: "Desktop",
            width: 1440,
            height: 900,
            breakpoint: { name: "desktop", minWidth: 1024 },
            root: {
              kind: "stack",
              id: rootId,
              name: seed.displayName,
              visible: true,
              style: {
                padding: { top: 48, right: 64, bottom: 48, left: 64 },
                background: "#ffffff",
              },
              layout: {
                direction: "column",
                gap: 24,
                align: "stretch",
                justify: "start",
                wrap: "nowrap",
              },
              children: [
                {
                  kind: "text",
                  id: headingId,
                  name: "Heading",
                  visible: true,
                  style: { fontWeight: 700, fontSize: 36, lineHeight: 1.2 },
                  text: seed.headline,
                },
              ],
            },
          },
        ],
      },
    ],
  });
}

const seedList: TemplateSeed[] = [
  {
    templateId: "0e5e0000-0000-7000-8000-000000000c01",
    slug: "operations-dashboard",
    displayName: "Operations dashboard",
    description:
      "Ready-made dashboard layout with header, metric row and content grid.",
    category: "dashboard",
    kit: { kitSlug: "seda-enterprise", kitVersion: "1.0.0" },
    ids: [
      "0e5e0000-0000-7000-8000-100000000c01",
      "0e5e0000-0000-7000-8000-200000000c01",
      "0e5e0000-0000-7000-8000-300000000c01",
      "0e5e0000-0000-7000-8000-400000000c01",
      "0e5e0000-0000-7000-8000-500000000c01",
    ],
    headline: "Operations",
  },
  {
    templateId: "0e5e0000-0000-7000-8000-000000000c02",
    slug: "records-crud",
    displayName: "Records CRUD",
    description:
      "Standard list-detail-editor CRUD flow with breadcrumbs and inline actions.",
    category: "crud",
    kit: { kitSlug: "seda-enterprise", kitVersion: "1.0.0" },
    ids: [
      "0e5e0000-0000-7000-8000-100000000c02",
      "0e5e0000-0000-7000-8000-200000000c02",
      "0e5e0000-0000-7000-8000-300000000c02",
      "0e5e0000-0000-7000-8000-400000000c02",
      "0e5e0000-0000-7000-8000-500000000c02",
    ],
    headline: "Records",
  },
  {
    templateId: "0e5e0000-0000-7000-8000-000000000c03",
    slug: "onboarding-form",
    displayName: "Onboarding form",
    description:
      "Two-column form with progress rail, validation zones and inline help.",
    category: "form",
    kit: { kitSlug: "neutral-product", kitVersion: "1.0.0" },
    ids: [
      "0e5e0000-0000-7000-8000-100000000c03",
      "0e5e0000-0000-7000-8000-200000000c03",
      "0e5e0000-0000-7000-8000-300000000c03",
      "0e5e0000-0000-7000-8000-400000000c03",
      "0e5e0000-0000-7000-8000-500000000c03",
    ],
    headline: "Onboarding",
  },
  {
    templateId: "0e5e0000-0000-7000-8000-000000000c04",
    slug: "sign-in",
    displayName: "Sign in",
    description:
      "Centered sign-in card with brand mark, primary and secondary actions.",
    category: "auth",
    kit: { kitSlug: "seda-enterprise", kitVersion: "1.0.0" },
    ids: [
      "0e5e0000-0000-7000-8000-100000000c04",
      "0e5e0000-0000-7000-8000-200000000c04",
      "0e5e0000-0000-7000-8000-300000000c04",
      "0e5e0000-0000-7000-8000-400000000c04",
      "0e5e0000-0000-7000-8000-500000000c04",
    ],
    headline: "Welcome back",
  },
  {
    templateId: "0e5e0000-0000-7000-8000-000000000c05",
    slug: "account-settings",
    displayName: "Account settings",
    description:
      "Settings shell with left navigation, section headings and grouped fields.",
    category: "settings",
    kit: { kitSlug: "neutral-product", kitVersion: "1.0.0" },
    ids: [
      "0e5e0000-0000-7000-8000-100000000c05",
      "0e5e0000-0000-7000-8000-200000000c05",
      "0e5e0000-0000-7000-8000-300000000c05",
      "0e5e0000-0000-7000-8000-400000000c05",
      "0e5e0000-0000-7000-8000-500000000c05",
    ],
    headline: "Account",
  },
  {
    templateId: "0e5e0000-0000-7000-8000-000000000c06",
    slug: "mobile-inbox",
    displayName: "Mobile inbox",
    description:
      "Responsive mobile inbox with tab bar, list rows and swipe affordances.",
    category: "mobile",
    kit: { kitSlug: "wireframe", kitVersion: "1.0.0" },
    ids: [
      "0e5e0000-0000-7000-8000-100000000c06",
      "0e5e0000-0000-7000-8000-200000000c06",
      "0e5e0000-0000-7000-8000-300000000c06",
      "0e5e0000-0000-7000-8000-400000000c06",
      "0e5e0000-0000-7000-8000-500000000c06",
    ],
    headline: "Inbox",
  },
];

export const shippedTemplateManifests: readonly TemplateManifest[] =
  seedList.map((seed) => ({
    id: seed.templateId,
    slug: seed.slug,
    version: "1.0.0",
    displayName: seed.displayName,
    description: seed.description,
    category: seed.category,
    kit: seed.kit,
    document: buildDocument(seed),
  }));
