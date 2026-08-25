import {
  parseKitManifest,
  parseTemplateManifest,
  type KitManifest,
  type KitRecord,
  type KitStatus,
  type TemplateManifest,
  type TemplateRecord,
} from "./schemas.js";
import { bumpPatch, isCompatible, type CompatibilityCheck } from "./semver.js";

export interface DraftInput {
  authorId: string;
  now: () => Date;
}

function isoNow(now: () => Date): string {
  return now().toISOString();
}

export function createKitDraft(
  manifest: unknown,
  input: DraftInput,
): KitRecord {
  const parsed = parseKitManifest(manifest);
  const timestamp = isoNow(input.now);
  return {
    manifest: parsed,
    status: "draft",
    authorId: input.authorId,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function createTemplateDraft(
  manifest: unknown,
  input: DraftInput,
  library: readonly KitRecord[],
): TemplateRecord {
  const parsed = parseTemplateManifest(manifest);
  const compatibility = ensureKitCompatible(parsed, library);
  if (!compatibility.compatible) {
    throw new IncompatibleTemplateError(compatibility.reason ?? "Incompatible");
  }
  const timestamp = isoNow(input.now);
  return {
    manifest: parsed,
    status: "draft",
    authorId: input.authorId,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export interface PublishInput {
  reviewerId: string;
  now: () => Date;
  isAdmin: boolean;
}

export function publishKit(record: KitRecord, input: PublishInput): KitRecord {
  if (!input.isAdmin) throw new NotAdminError("Only admins can publish kits");
  if (record.status !== "draft") {
    throw new AlreadyPublishedError(
      `Kit ${record.manifest.slug}@${record.manifest.version} is ${record.status}`,
    );
  }
  const timestamp = isoNow(input.now);
  return {
    ...record,
    status: "published",
    publishedAt: timestamp,
    updatedAt: timestamp,
  };
}

export function publishTemplate(
  record: TemplateRecord,
  input: PublishInput,
  publishedKits: readonly KitRecord[],
): TemplateRecord {
  if (!input.isAdmin)
    throw new NotAdminError("Only admins can publish templates");
  if (record.status !== "draft") {
    throw new AlreadyPublishedError(
      `Template ${record.manifest.slug}@${record.manifest.version} is ${record.status}`,
    );
  }
  const compatibility = ensureKitCompatible(record.manifest, publishedKits);
  if (!compatibility.compatible) {
    throw new IncompatibleTemplateError(compatibility.reason ?? "Incompatible");
  }
  const timestamp = isoNow(input.now);
  return {
    ...record,
    status: "published",
    publishedAt: timestamp,
    updatedAt: timestamp,
  };
}

export function duplicateKit(
  record: KitRecord,
  input: DraftInput & { newId: string },
): KitRecord {
  const manifest: KitManifest = {
    ...record.manifest,
    id: input.newId,
    version: bumpPatch(record.manifest.version),
  };
  const timestamp = isoNow(input.now);
  return {
    manifest,
    status: "draft",
    authorId: input.authorId,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function duplicateTemplate(
  record: TemplateRecord,
  input: DraftInput & { newId: string },
): TemplateRecord {
  const manifest: TemplateManifest = {
    ...record.manifest,
    id: input.newId,
    version: bumpPatch(record.manifest.version),
  };
  const timestamp = isoNow(input.now);
  return {
    manifest,
    status: "draft",
    authorId: input.authorId,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function deprecate<
  Record extends { status: KitStatus; updatedAt: string },
>(record: Record, now: () => Date): Record {
  return {
    ...record,
    status: "deprecated",
    updatedAt: isoNow(now),
  };
}

export function ensureKitCompatible(
  template: TemplateManifest,
  library: readonly KitRecord[],
): CompatibilityCheck {
  const candidates = library.filter(
    (entry) => entry.manifest.slug === template.kit.kitSlug,
  );
  const published = candidates.filter((entry) => entry.status === "published");
  const pool = published.length > 0 ? published : candidates;
  if (pool.length === 0) {
    return {
      compatible: false,
      reason: `No kit named ${template.kit.kitSlug} is available`,
    };
  }
  for (const kit of pool) {
    const compatibility = isCompatible(
      template.kit.kitVersion,
      kit.manifest.version,
    );
    if (compatibility.compatible) return compatibility;
  }
  return {
    compatible: false,
    reason: `No compatible ${template.kit.kitSlug} kit for ${template.kit.kitVersion}`,
  };
}

export class NotAdminError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotAdminError";
  }
}

export class AlreadyPublishedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AlreadyPublishedError";
  }
}

export class IncompatibleTemplateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IncompatibleTemplateError";
  }
}
