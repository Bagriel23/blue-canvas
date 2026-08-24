import { z } from "zod";

export const tokenReferenceSchema = z.strictObject({
  token: z.string().min(1),
});

export const dimensionValueSchema = z.union([
  z.number().finite().nonnegative(),
  tokenReferenceSchema,
]);

const colorValueSchema = z.union([z.string().min(1), tokenReferenceSchema]);
const edgeValueSchema = z.union([
  dimensionValueSchema,
  z.strictObject({
    top: dimensionValueSchema.optional(),
    right: dimensionValueSchema.optional(),
    bottom: dimensionValueSchema.optional(),
    left: dimensionValueSchema.optional(),
  }),
]);

export const nodeStyleSchema = z.strictObject({
  background: colorValueSchema.optional(),
  color: colorValueSchema.optional(),
  borderColor: colorValueSchema.optional(),
  borderWidth: dimensionValueSchema.optional(),
  borderRadius: dimensionValueSchema.optional(),
  width: dimensionValueSchema.optional(),
  height: dimensionValueSchema.optional(),
  minWidth: dimensionValueSchema.optional(),
  maxWidth: dimensionValueSchema.optional(),
  minHeight: dimensionValueSchema.optional(),
  maxHeight: dimensionValueSchema.optional(),
  padding: edgeValueSchema.optional(),
  margin: edgeValueSchema.optional(),
  opacity: z.number().min(0).max(1).optional(),
  fontFamily: z.union([z.string().min(1), tokenReferenceSchema]).optional(),
  fontSize: dimensionValueSchema.optional(),
  fontWeight: z
    .union([z.number().int().min(1).max(1000), tokenReferenceSchema])
    .optional(),
  lineHeight: z.union([z.number().positive(), tokenReferenceSchema]).optional(),
  textAlign: z.enum(["left", "center", "right", "justify"]).optional(),
});

export const navigationTargetSchema = z
  .string()
  .min(1)
  .refine((value) => {
    const target = value.trim();
    const hasControlCharacter = [...target].some((character) => {
      const codePoint = character.codePointAt(0);
      return codePoint !== undefined && (codePoint < 32 || codePoint === 127);
    });
    if (hasControlCharacter) return false;
    const scheme = /^([a-z][a-z0-9+.-]*):/iu.exec(target)?.[1]?.toLowerCase();
    return (
      scheme === undefined ||
      ["http", "https", "mailto", "tel"].includes(scheme)
    );
  }, "Navigation target must not use an executable URL scheme");

const navigateActionSchema = z
  .strictObject({
    type: z.literal("navigate"),
    pageId: z.uuid().optional(),
    url: navigationTargetSchema.optional(),
  })
  .refine(
    ({ pageId, url }) => (pageId === undefined) !== (url === undefined),
    "Navigate actions require exactly one destination",
  );

const setVariableActionSchema = z.strictObject({
  type: z.literal("set-variable"),
  variable: z.string().min(1),
  value: z.union([z.string(), z.number().finite(), z.boolean(), z.null()]),
});

const openOverlayActionSchema = z.strictObject({
  type: z.literal("open-overlay"),
  overlayId: z.uuid(),
});

const closeOverlayActionSchema = z.strictObject({
  type: z.literal("close-overlay"),
});

const filterCollectionActionSchema = z.strictObject({
  type: z.literal("filter-collection"),
  collection: z.string().min(1),
  variable: z.string().min(1),
});

export const interactionSchema = z.strictObject({
  trigger: z.enum(["click", "submit", "change"]),
  action: z.discriminatedUnion("type", [
    navigateActionSchema,
    setVariableActionSchema,
    openOverlayActionSchema,
    closeOverlayActionSchema,
    filterCollectionActionSchema,
  ]),
});

export const tokenDefinitionSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("color"), value: z.string().min(1) }),
  z.strictObject({ type: z.literal("dimension"), value: z.number().finite() }),
  z.strictObject({ type: z.literal("number"), value: z.number().finite() }),
  z.strictObject({ type: z.literal("string"), value: z.string() }),
  z.strictObject({ type: z.literal("boolean"), value: z.boolean() }),
  z.strictObject({ type: z.literal("font-family"), value: z.string().min(1) }),
  z.strictObject({
    type: z.literal("font-weight"),
    value: z.union([z.string().min(1), z.number().int().min(1).max(1000)]),
  }),
]);

export const variableDefinitionSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("string"), value: z.string() }),
  z.strictObject({ type: z.literal("number"), value: z.number().finite() }),
  z.strictObject({ type: z.literal("boolean"), value: z.boolean() }),
  z.strictObject({ type: z.literal("null"), value: z.null() }),
]);

export type NodeStyle = z.infer<typeof nodeStyleSchema>;
export type Interaction = z.infer<typeof interactionSchema>;
export type TokenDefinition = z.infer<typeof tokenDefinitionSchema>;
export type VariableDefinition = z.infer<typeof variableDefinitionSchema>;
