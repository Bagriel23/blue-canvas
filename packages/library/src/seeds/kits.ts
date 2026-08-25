import type { KitManifest } from "../schemas.js";

const sedaEnterprise: KitManifest = {
  id: "0a5e0000-0000-7000-8000-0000000000a1",
  slug: "seda-enterprise",
  version: "1.0.0",
  displayName: "SEDA Enterprise",
  description:
    "Samsung Enterprise Design foundation with Samsung Blue #1428A0, neutral surfaces and enterprise typography.",
  tokens: {
    "color.brand": { type: "color", value: "#1428a0" },
    "color.brand-strong": { type: "color", value: "#0f1f80" },
    "color.surface": { type: "color", value: "#ffffff" },
    "color.surface-subtle": { type: "color", value: "#f6f7f8" },
    "color.text": { type: "color", value: "#0d111b" },
    "color.text-muted": { type: "color", value: "#61697a" },
    "color.border": { type: "color", value: "#d5d9de" },
    "space.100": { type: "dimension", value: 4 },
    "space.200": { type: "dimension", value: 8 },
    "space.300": { type: "dimension", value: 12 },
    "space.400": { type: "dimension", value: 16 },
    "space.500": { type: "dimension", value: 24 },
    "radius.md": { type: "dimension", value: 6 },
    "radius.lg": { type: "dimension", value: 12 },
    "font.family": {
      type: "font-family",
      value: "SamsungOne, Inter, sans-serif",
    },
    "font.body": { type: "font-weight", value: 400 },
    "font.strong": { type: "font-weight", value: 600 },
  },
  typography: {
    body: {
      fontFamily: "SamsungOne",
      fallback: ["Inter", "Segoe UI", "sans-serif"],
      weights: [400, 500, 600, 700],
    },
    mono: {
      fontFamily: "JetBrains Mono",
      fallback: ["Menlo", "monospace"],
      weights: [400, 600],
    },
  },
  assets: [],
  components: [
    {
      id: "0a5e0000-0000-7000-8000-0000000000b1",
      name: "Primary button",
      role: "button",
      description: "Filled action using color.brand",
    },
    {
      id: "0a5e0000-0000-7000-8000-0000000000b2",
      name: "Text input",
      role: "input",
    },
    {
      id: "0a5e0000-0000-7000-8000-0000000000b3",
      name: "Elevated card",
      role: "card",
    },
    {
      id: "0a5e0000-0000-7000-8000-0000000000b4",
      name: "Top navigation",
      role: "navigation",
    },
  ],
};

const wireframe: KitManifest = {
  id: "0a5e0000-0000-7000-8000-0000000000a2",
  slug: "wireframe",
  version: "1.0.0",
  displayName: "Wireframe",
  description:
    "Low-fidelity kit for early exploration with a neutral grey palette and geometric primitives.",
  tokens: {
    "color.fill": { type: "color", value: "#eceef1" },
    "color.stroke": { type: "color", value: "#61697a" },
    "color.text": { type: "color", value: "#2f3543" },
    "color.text-muted": { type: "color", value: "#8891a0" },
    "space.100": { type: "dimension", value: 4 },
    "space.200": { type: "dimension", value: 8 },
    "space.400": { type: "dimension", value: 16 },
    "radius.md": { type: "dimension", value: 4 },
    "font.family": { type: "font-family", value: "Inter, sans-serif" },
  },
  typography: {
    body: {
      fontFamily: "Inter",
      fallback: ["Segoe UI", "sans-serif"],
      weights: [400, 500, 700],
    },
  },
  assets: [],
  components: [
    {
      id: "0a5e0000-0000-7000-8000-0000000000b5",
      name: "Placeholder block",
      role: "layout",
    },
    {
      id: "0a5e0000-0000-7000-8000-0000000000b6",
      name: "Text placeholder",
      role: "typography",
    },
    {
      id: "0a5e0000-0000-7000-8000-0000000000b7",
      name: "Sketch button",
      role: "button",
    },
  ],
};

const neutralProduct: KitManifest = {
  id: "0a5e0000-0000-7000-8000-0000000000a3",
  slug: "neutral-product",
  version: "1.0.0",
  displayName: "Neutral Product",
  description:
    "Vendor-neutral product surface with balanced contrast, generous spacing and accessible defaults.",
  tokens: {
    "color.brand": { type: "color", value: "#2f3543" },
    "color.brand-strong": { type: "color", value: "#0d111b" },
    "color.surface": { type: "color", value: "#ffffff" },
    "color.surface-subtle": { type: "color", value: "#f0f2f5" },
    "color.text": { type: "color", value: "#1c2130" },
    "color.text-muted": { type: "color", value: "#61697a" },
    "color.border": { type: "color", value: "#c6ccd4" },
    "space.100": { type: "dimension", value: 4 },
    "space.200": { type: "dimension", value: 8 },
    "space.400": { type: "dimension", value: 16 },
    "space.600": { type: "dimension", value: 32 },
    "radius.sm": { type: "dimension", value: 4 },
    "radius.md": { type: "dimension", value: 8 },
    "font.family": {
      type: "font-family",
      value: "Inter, system-ui, sans-serif",
    },
  },
  typography: {
    body: {
      fontFamily: "Inter",
      fallback: ["system-ui", "sans-serif"],
      weights: [400, 500, 600, 700],
    },
  },
  assets: [],
  components: [
    {
      id: "0a5e0000-0000-7000-8000-0000000000b8",
      name: "Ghost button",
      role: "button",
    },
    {
      id: "0a5e0000-0000-7000-8000-0000000000b9",
      name: "Field",
      role: "input",
    },
    {
      id: "0a5e0000-0000-7000-8000-0000000000ba",
      name: "Panel",
      role: "card",
    },
    {
      id: "0a5e0000-0000-7000-8000-0000000000bb",
      name: "Sidebar",
      role: "navigation",
    },
  ],
};

export const shippedKitManifests: readonly KitManifest[] = [
  sedaEnterprise,
  wireframe,
  neutralProduct,
];
