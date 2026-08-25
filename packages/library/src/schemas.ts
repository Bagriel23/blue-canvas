import { z } from "zod";

import {
  parseDesignDocument,
  type DesignDocument,
  type TokenDefinition,
} from "@blue-canvas/document";

import { isValidSemver } from "./semver.js";

const semverSchema = z
  .string()
  .refine(isValidSemver, "Version must be a valid semver 'major.minor.patch'");

const slugSchema = z
  .string()
  .min(2)
  .max(64)
  .regex(
    /^[a-z][a-z0-9-]*$/u,
    "Slug must be kebab-case starting with a letter",
  );

const RESERVED_KEYS = new Set(["__proto__", "constructor", "prototype"]);

function isSafeKey(key: string): boolean {
  return key.length > 0 && !RESERVED_KEYS.has(key);
}

const tokenValueSchema = z.discriminatedUnion("type", [
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

const kitAssetSchema = z.strictObject({
  id: z.uuid(),
  role: z.enum(["logo", "illustration", "icon"]).optional(),
  displayName: z.string().min(1).max(120),
  mediaType: z.string().min(1).max(80),
  sha256: z
    .string()
    .regex(/^[a-f0-9]{64}$/u, "SHA256 must be 64 lowercase hex characters"),
  sizeBytes: z
    .number()
    .int()
    .positive()
    .max(1024 * 1024 * 20),
});

const typographyEntrySchema = z.strictObject({
  fontFamily: z.string().min(1).max(120),
  fallback: z.array(z.string().min(1)).max(6),
  weights: z.array(z.number().int().min(100).max(900)).min(1).max(10),
});

const kitComponentSchema = z.strictObject({
  id: z.uuid(),
  name: z.string().min(1).max(80),
  description: z.string().max(280).optional(),
  role: z.enum([
    "button",
    "input",
    "card",
    "layout",
    "navigation",
    "modal",
    "typography",
    "misc",
  ]),
});

export type KitAsset = z.infer<typeof kitAssetSchema>;
export type KitComponent = z.infer<typeof kitComponentSchema>;
export type TypographyEntry = z.infer<typeof typographyEntrySchema>;

export interface KitReference {
  kitSlug: string;
  kitVersion: string;
}

export interface KitManifest {
  id: string;
  slug: string;
  version: string;
  displayName: string;
  description: string;
  tokens: Record<string, TokenDefinition>;
  typography: Record<string, TypographyEntry>;
  assets: KitAsset[];
  components: KitComponent[];
}

export interface TemplateManifest {
  id: string;
  slug: string;
  version: string;
  displayName: string;
  description: string;
  category:
    "dashboard" | "crud" | "form" | "auth" | "settings" | "mobile" | "misc";
  kit: KitReference;
  document: DesignDocument;
}

const kitReferenceSchema = z.strictObject({
  kitSlug: slugSchema,
  kitVersion: semverSchema,
});

function checkRecord(
  input: unknown,
  entrySchema: z.ZodType,
  path: string,
  ctx: z.RefinementCtx,
): void {
  if (input === null || typeof input !== "object") {
    ctx.addIssue({
      code: "custom",
      message: `${path} must be an object`,
      path: [path],
    });
    return;
  }
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (!isSafeKey(key)) {
      ctx.addIssue({
        code: "custom",
        message: `${path}.${key}: reserved or empty key`,
        path: [path, key],
      });
      continue;
    }
    const parsed = entrySchema.safeParse(value);
    if (!parsed.success) {
      ctx.addIssue({
        code: "custom",
        message: `${path}.${key}: ${parsed.error.issues[0]?.message ?? "invalid value"}`,
        path: [path, key],
      });
    }
  }
}

export const kitManifestSchema = z
  .strictObject({
    id: z.uuid(),
    slug: slugSchema,
    version: semverSchema,
    displayName: z.string().min(1).max(120),
    description: z.string().min(1).max(500),
    tokens: z.record(z.string(), z.unknown()),
    typography: z.record(z.string(), z.unknown()),
    assets: z.array(kitAssetSchema).max(64),
    components: z.array(kitComponentSchema).min(1).max(80),
  })
  .superRefine((value, ctx) => {
    checkRecord(value.tokens, tokenValueSchema, "tokens", ctx);
    checkRecord(value.typography, typographyEntrySchema, "typography", ctx);
  });

export const templateManifestSchema = z
  .strictObject({
    id: z.uuid(),
    slug: slugSchema,
    version: semverSchema,
    displayName: z.string().min(1).max(120),
    description: z.string().min(1).max(500),
    category: z.enum([
      "dashboard",
      "crud",
      "form",
      "auth",
      "settings",
      "mobile",
      "misc",
    ]),
    kit: kitReferenceSchema,
    document: z.unknown(),
  })
  .superRefine((value, ctx) => {
    try {
      parseDesignDocument(value.document);
    } catch (error) {
      ctx.addIssue({
        code: "custom",
        message: `document: ${error instanceof Error ? error.message : "invalid"}`,
        path: ["document"],
      });
    }
  });

export type KitStatus = "draft" | "published" | "deprecated";
export const kitStatusValues = ["draft", "published", "deprecated"] as const;

export interface KitRecord {
  manifest: KitManifest;
  status: KitStatus;
  authorId: string;
  publishedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export type TemplateStatus = KitStatus;
export const templateStatusValues = kitStatusValues;

export interface TemplateRecord {
  manifest: TemplateManifest;
  status: TemplateStatus;
  authorId: string;
  publishedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export function parseKitManifest(input: unknown): KitManifest {
  return kitManifestSchema.parse(input) as KitManifest;
}

export function parseTemplateManifest(input: unknown): TemplateManifest {
  const parsed = kitReferenceSchema; // ensure kitReferenceSchema retained for tree-shaking
  void parsed;
  const result = templateManifestSchema.parse(input) as {
    id: string;
    slug: string;
    version: string;
    displayName: string;
    description: string;
    category: TemplateManifest["category"];
    kit: KitReference;
    document: unknown;
  };
  return {
    ...result,
    document: parseDesignDocument(result.document),
  };
}
