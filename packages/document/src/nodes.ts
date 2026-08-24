import { z } from "zod";

import {
  dimensionValueSchema,
  interactionSchema,
  navigationTargetSchema,
  nodeStyleSchema,
  type Interaction,
  type NodeStyle,
} from "./values.js";

interface BaseNode {
  id: string;
  name: string;
  visible: boolean;
  style: NodeStyle;
  interactions?: Interaction[] | undefined;
}

export interface StackLayout {
  direction: "row" | "column";
  gap: z.infer<typeof dimensionValueSchema>;
  align: "start" | "center" | "end" | "stretch" | "baseline";
  justify: "start" | "center" | "end" | "space-between" | "space-around";
  wrap: "nowrap" | "wrap";
}

export type GridTrack =
  | { type: "auto" }
  | { type: "fraction"; value: number }
  | { type: "fixed"; value: z.infer<typeof dimensionValueSchema> };

export interface GridLayout {
  columns: GridTrack[];
  rows: GridTrack[];
  gap: z.infer<typeof dimensionValueSchema>;
  align: "start" | "center" | "end" | "stretch";
  justify: "start" | "center" | "end" | "stretch";
}

export type DesignNode =
  | (BaseNode & { kind: "stack"; layout: StackLayout; children: DesignNode[] })
  | (BaseNode & { kind: "grid"; layout: GridLayout; children: DesignNode[] })
  | (BaseNode & { kind: "text"; text: string })
  | (BaseNode & {
      kind: "image";
      source: { type: "asset"; assetId: string } | { type: "url"; url: string };
      alt: string;
    })
  | (BaseNode & { kind: "icon"; icon: string; label?: string | undefined })
  | (BaseNode & { kind: "link"; href: string; children: DesignNode[] })
  | (BaseNode & {
      kind: "button";
      buttonType: "button" | "submit" | "reset";
      children: DesignNode[];
    })
  | (BaseNode & {
      kind: "input";
      inputType: "text" | "email" | "password" | "number" | "search";
      variable?: string | undefined;
      placeholder?: string | undefined;
    })
  | (BaseNode & { kind: "form"; children: DesignNode[] })
  | (BaseNode & {
      kind: "repeater";
      collection: string;
      children: DesignNode[];
    })
  | (BaseNode & {
      kind: "conditional";
      variable: string;
      equals: string | number | boolean | null;
      whenTrue: DesignNode[];
      whenFalse: DesignNode[];
    })
  | (BaseNode & { kind: "overlay"; children: DesignNode[] })
  | (BaseNode & { kind: "component-instance"; componentId: string });

const baseShape = {
  id: z.uuid(),
  name: z.string().min(1),
  visible: z.boolean(),
  style: nodeStyleSchema,
  interactions: z.array(interactionSchema).optional(),
};

const childNodes = (): z.ZodArray<z.ZodType<DesignNode>> =>
  z.array(designNodeSchema);

const gridTrackSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("auto") }),
  z.strictObject({ type: z.literal("fraction"), value: z.number().positive() }),
  z.strictObject({ type: z.literal("fixed"), value: dimensionValueSchema }),
]);

export const stackLayoutSchema = z.strictObject({
  direction: z.enum(["row", "column"]),
  gap: dimensionValueSchema,
  align: z.enum(["start", "center", "end", "stretch", "baseline"]),
  justify: z.enum(["start", "center", "end", "space-between", "space-around"]),
  wrap: z.enum(["nowrap", "wrap"]),
});

export const gridLayoutSchema = z.strictObject({
  columns: z.array(gridTrackSchema).min(1),
  rows: z.array(gridTrackSchema).min(1),
  gap: dimensionValueSchema,
  align: z.enum(["start", "center", "end", "stretch"]),
  justify: z.enum(["start", "center", "end", "stretch"]),
});

export const imageSourceSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("asset"), assetId: z.uuid() }),
  z.strictObject({ type: z.literal("url"), url: z.url() }),
]);

export const designNodeSchema: z.ZodType<DesignNode> = z.lazy(() =>
  z.discriminatedUnion("kind", [
    z.strictObject({
      kind: z.literal("stack"),
      ...baseShape,
      layout: stackLayoutSchema,
      children: childNodes(),
    }),
    z.strictObject({
      kind: z.literal("grid"),
      ...baseShape,
      layout: gridLayoutSchema,
      children: childNodes(),
    }),
    z.strictObject({ kind: z.literal("text"), ...baseShape, text: z.string() }),
    z.strictObject({
      kind: z.literal("image"),
      ...baseShape,
      source: imageSourceSchema,
      alt: z.string(),
    }),
    z.strictObject({
      kind: z.literal("icon"),
      ...baseShape,
      icon: z.string().min(1),
      label: z.string().optional(),
    }),
    z.strictObject({
      kind: z.literal("link"),
      ...baseShape,
      href: navigationTargetSchema,
      children: childNodes(),
    }),
    z.strictObject({
      kind: z.literal("button"),
      ...baseShape,
      buttonType: z.enum(["button", "submit", "reset"]),
      children: childNodes(),
    }),
    z.strictObject({
      kind: z.literal("input"),
      ...baseShape,
      inputType: z.enum(["text", "email", "password", "number", "search"]),
      variable: z.string().min(1).optional(),
      placeholder: z.string().optional(),
    }),
    z.strictObject({
      kind: z.literal("form"),
      ...baseShape,
      children: childNodes(),
    }),
    z.strictObject({
      kind: z.literal("repeater"),
      ...baseShape,
      collection: z.string().min(1),
      children: childNodes(),
    }),
    z.strictObject({
      kind: z.literal("conditional"),
      ...baseShape,
      variable: z.string().min(1),
      equals: z.union([z.string(), z.number().finite(), z.boolean(), z.null()]),
      whenTrue: childNodes(),
      whenFalse: childNodes(),
    }),
    z.strictObject({
      kind: z.literal("overlay"),
      ...baseShape,
      children: childNodes(),
    }),
    z.strictObject({
      kind: z.literal("component-instance"),
      ...baseShape,
      componentId: z.uuid(),
    }),
  ]),
);

export function getNodeChildren(node: DesignNode): DesignNode[] {
  switch (node.kind) {
    case "stack":
    case "grid":
    case "link":
    case "button":
    case "form":
    case "repeater":
    case "overlay":
      return node.children;
    case "conditional":
      return [...node.whenTrue, ...node.whenFalse];
    default:
      return [];
  }
}
