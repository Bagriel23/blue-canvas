import { randomUUID } from "node:crypto";

import {
  createKitDraft,
  createTemplateDraft,
  deprecate,
  duplicateKit,
  duplicateTemplate,
  ensureKitCompatible,
  publishKit,
  publishTemplate,
  shippedKitManifests,
  shippedTemplateManifests,
  AlreadyPublishedError,
  IncompatibleTemplateError,
  NotAdminError,
  type KitRecord,
  type TemplateRecord,
} from "@blue-canvas/library";

export interface LibraryActor {
  id: string;
  isAdmin: boolean;
}

export class LibraryError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "LibraryError";
  }
}

interface LibraryStore {
  kits: Map<string, KitRecord>;
  templates: Map<string, TemplateRecord>;
}

function createSeededStore(now: () => Date): LibraryStore {
  const kits = new Map<string, KitRecord>();
  for (const manifest of shippedKitManifests) {
    const timestamp = now().toISOString();
    kits.set(manifest.id, {
      manifest,
      status: "published",
      authorId: "seed",
      publishedAt: timestamp,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
  }
  const templates = new Map<string, TemplateRecord>();
  for (const manifest of shippedTemplateManifests) {
    const timestamp = now().toISOString();
    templates.set(manifest.id, {
      manifest,
      status: "published",
      authorId: "seed",
      publishedAt: timestamp,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
  }
  return { kits, templates };
}

export class LibraryService {
  private readonly store: LibraryStore;

  constructor(private readonly now: () => Date = () => new Date()) {
    this.store = createSeededStore(now);
  }

  listKits(actor: LibraryActor): KitRecord[] {
    return [...this.store.kits.values()].filter((entry) =>
      this.canSee(entry, actor),
    );
  }

  listTemplates(
    actor: LibraryActor,
  ): { record: TemplateRecord; compatible: boolean; reason?: string }[] {
    const kits = [...this.store.kits.values()];
    return [...this.store.templates.values()]
      .filter((entry) => this.canSee(entry, actor))
      .map((record) => {
        const check = ensureKitCompatible(record.manifest, kits);
        return check.compatible
          ? { record, compatible: true }
          : { record, compatible: false, reason: check.reason ?? "" };
      });
  }

  createKitDraft(actor: LibraryActor, manifest: unknown): KitRecord {
    try {
      const draft = createKitDraft(manifest, {
        authorId: actor.id,
        now: this.now,
      });
      this.store.kits.set(draft.manifest.id, draft);
      return draft;
    } catch (raw) {
      throw this.translate(raw);
    }
  }

  createTemplateDraft(actor: LibraryActor, manifest: unknown): TemplateRecord {
    try {
      const draft = createTemplateDraft(
        manifest,
        { authorId: actor.id, now: this.now },
        [...this.store.kits.values()],
      );
      this.store.templates.set(draft.manifest.id, draft);
      return draft;
    } catch (raw) {
      throw this.translate(raw);
    }
  }

  publishKit(actor: LibraryActor, id: string): KitRecord {
    const record = this.requireKit(id);
    try {
      const published = publishKit(record, {
        reviewerId: actor.id,
        now: this.now,
        isAdmin: actor.isAdmin,
      });
      this.store.kits.set(id, published);
      return published;
    } catch (raw) {
      throw this.translate(raw);
    }
  }

  publishTemplate(actor: LibraryActor, id: string): TemplateRecord {
    const record = this.requireTemplate(id);
    try {
      const published = publishTemplate(
        record,
        { reviewerId: actor.id, now: this.now, isAdmin: actor.isAdmin },
        [...this.store.kits.values()],
      );
      this.store.templates.set(id, published);
      return published;
    } catch (raw) {
      throw this.translate(raw);
    }
  }

  duplicateKit(actor: LibraryActor, id: string): KitRecord {
    const record = this.requireKit(id);
    const clone = duplicateKit(record, {
      authorId: actor.id,
      now: this.now,
      newId: randomUUID(),
    });
    this.store.kits.set(clone.manifest.id, clone);
    return clone;
  }

  duplicateTemplate(actor: LibraryActor, id: string): TemplateRecord {
    const record = this.requireTemplate(id);
    const clone = duplicateTemplate(record, {
      authorId: actor.id,
      now: this.now,
      newId: randomUUID(),
    });
    this.store.templates.set(clone.manifest.id, clone);
    return clone;
  }

  deprecateKit(actor: LibraryActor, id: string): KitRecord {
    if (!actor.isAdmin) throw new LibraryError("not_admin", "Admin only", 403);
    const record = this.requireKit(id);
    if (record.status !== "published") {
      throw new LibraryError(
        "not_published",
        "Only published kits can be deprecated",
        409,
      );
    }
    const next = deprecate(record, this.now);
    this.store.kits.set(id, next);
    return next;
  }

  private requireKit(id: string): KitRecord {
    const record = this.store.kits.get(id);
    if (!record) throw new LibraryError("kit_not_found", "Kit not found", 404);
    return record;
  }

  private requireTemplate(id: string): TemplateRecord {
    const record = this.store.templates.get(id);
    if (!record) {
      throw new LibraryError("template_not_found", "Template not found", 404);
    }
    return record;
  }

  private canSee<Record extends { status: string; authorId: string }>(
    record: Record,
    actor: LibraryActor,
  ): boolean {
    if (record.status !== "draft") return true;
    if (actor.isAdmin) return true;
    return record.authorId === actor.id;
  }

  private translate(raw: unknown): LibraryError {
    if (raw instanceof NotAdminError)
      return new LibraryError("not_admin", raw.message, 403);
    if (raw instanceof AlreadyPublishedError)
      return new LibraryError("conflict", raw.message, 409);
    if (raw instanceof IncompatibleTemplateError)
      return new LibraryError("incompatible_kit", raw.message, 422);
    if (raw instanceof LibraryError) return raw;
    if (raw instanceof Error) {
      return new LibraryError("invalid_manifest", raw.message, 400);
    }
    return new LibraryError("invalid_manifest", "Invalid input", 400);
  }
}

export interface PublicKit {
  id: string;
  slug: string;
  version: string;
  displayName: string;
  description: string;
  status: string;
  authorId: string;
  createdAt: string;
  updatedAt: string;
  publishedAt?: string;
  components: number;
  tokens: number;
}

export function publicKit(record: KitRecord): PublicKit {
  const value: PublicKit = {
    id: record.manifest.id,
    slug: record.manifest.slug,
    version: record.manifest.version,
    displayName: record.manifest.displayName,
    description: record.manifest.description,
    status: record.status,
    authorId: record.authorId,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    components: record.manifest.components.length,
    tokens: Object.keys(record.manifest.tokens).length,
  };
  if (record.publishedAt !== undefined) value.publishedAt = record.publishedAt;
  return value;
}

export interface PublicTemplate {
  id: string;
  slug: string;
  version: string;
  displayName: string;
  description: string;
  category: string;
  kit: { kitSlug: string; kitVersion: string };
  status: string;
  authorId: string;
  createdAt: string;
  updatedAt: string;
  publishedAt?: string;
  compatible: boolean;
  incompatibleReason?: string;
}

export function publicTemplate(
  record: TemplateRecord,
  compatible: boolean,
  reason?: string,
): PublicTemplate {
  const value: PublicTemplate = {
    id: record.manifest.id,
    slug: record.manifest.slug,
    version: record.manifest.version,
    displayName: record.manifest.displayName,
    description: record.manifest.description,
    category: record.manifest.category,
    kit: record.manifest.kit,
    status: record.status,
    authorId: record.authorId,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    compatible,
  };
  if (record.publishedAt !== undefined) value.publishedAt = record.publishedAt;
  if (!compatible && reason) value.incompatibleReason = reason;
  return value;
}
