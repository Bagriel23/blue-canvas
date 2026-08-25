import { describe, expect, it } from "vitest";

import {
  createKitDraft,
  createTemplateDraft,
  deprecate,
  duplicateKit,
  duplicateTemplate,
  ensureKitCompatible,
  parseKitManifest,
  parseTemplateManifest,
  publishKit,
  publishTemplate,
  shippedKitManifests,
  shippedTemplateManifests,
  AlreadyPublishedError,
  IncompatibleTemplateError,
  NotAdminError,
  type KitRecord,
  type TemplateRecord,
} from "./index.js";

const clock = () => new Date("2026-08-24T12:00:00Z");
const draftInput = {
  authorId: "aaaaaaaa-aaaa-7aaa-8aaa-aaaaaaaaaaaa",
  now: clock,
};
const adminInput = {
  reviewerId: "bbbbbbbb-bbbb-7bbb-8bbb-bbbbbbbbbbbb",
  now: clock,
  isAdmin: true,
};
const memberInput = { ...adminInput, isAdmin: false };

const [firstKitManifest] = shippedKitManifests;
if (!firstKitManifest) throw new Error("shipped kits missing");
const [firstTemplateManifest] = shippedTemplateManifests;
if (!firstTemplateManifest) throw new Error("shipped templates missing");

describe("shipped seeds", () => {
  it("ships three published-ready kits including SEDA Enterprise", () => {
    expect(shippedKitManifests).toHaveLength(3);
    const slugs = shippedKitManifests.map((entry) => entry.slug);
    expect(slugs).toEqual(["seda-enterprise", "wireframe", "neutral-product"]);
  });

  it("ships template categories required by the plan", () => {
    const categories = new Set(
      shippedTemplateManifests.map((entry) => entry.category),
    );
    expect(categories).toEqual(
      new Set(["dashboard", "crud", "form", "auth", "settings", "mobile"]),
    );
  });

  it("every shipped kit and template parses under strict schemas", () => {
    for (const kit of shippedKitManifests) parseKitManifest(kit);
    for (const template of shippedTemplateManifests)
      parseTemplateManifest(template);
  });
});

describe("kit lifecycle", () => {
  it("creates a draft and lets an admin publish it", () => {
    const draft = createKitDraft(firstKitManifest, draftInput);
    expect(draft.status).toBe("draft");
    const published = publishKit(draft, adminInput);
    expect(published.status).toBe("published");
    expect(published.publishedAt).toBe("2026-08-24T12:00:00.000Z");
  });

  it("blocks non-admins from publishing", () => {
    const draft = createKitDraft(firstKitManifest, draftInput);
    expect(() => publishKit(draft, memberInput)).toThrow(NotAdminError);
  });

  it("cannot re-publish a published kit", () => {
    const draft = createKitDraft(firstKitManifest, draftInput);
    const published = publishKit(draft, adminInput);
    expect(() => publishKit(published, adminInput)).toThrow(
      AlreadyPublishedError,
    );
  });

  it("duplicates a kit into a fresh draft with a patch bump", () => {
    const draft = createKitDraft(firstKitManifest, draftInput);
    const clone = duplicateKit(draft, {
      ...draftInput,
      newId: "cccccccc-cccc-7ccc-8ccc-cccccccccccc",
    });
    expect(clone.status).toBe("draft");
    expect(clone.manifest.id).toBe("cccccccc-cccc-7ccc-8ccc-cccccccccccc");
    expect(clone.manifest.version).toBe("1.0.1");
  });

  it("marks a published kit as deprecated without deleting it", () => {
    const published = publishKit(
      createKitDraft(firstKitManifest, draftInput),
      adminInput,
    );
    const deprecated = deprecate(published, clock);
    expect(deprecated.status).toBe("deprecated");
    expect(deprecated.publishedAt).toBe(published.publishedAt);
  });
});

describe("template compatibility", () => {
  it("accepts a template when its kit reference resolves in the library", () => {
    const kitDraft = createKitDraft(firstKitManifest, draftInput);
    const publishedKit = publishKit(kitDraft, adminInput);
    const template = createTemplateDraft(firstTemplateManifest, draftInput, [
      publishedKit,
    ]);
    expect(template.status).toBe("draft");
  });

  it("rejects a template whose kit is missing", () => {
    expect(() =>
      createTemplateDraft(firstTemplateManifest, draftInput, []),
    ).toThrow(IncompatibleTemplateError);
  });

  it("rejects a template whose kit major does not match", () => {
    const modifiedManifest = {
      ...firstTemplateManifest,
      kit: { ...firstTemplateManifest.kit, kitVersion: "2.0.0" },
    };
    const publishedKit = publishKit(
      createKitDraft(firstKitManifest, draftInput),
      adminInput,
    );
    const check = ensureKitCompatible(modifiedManifest, [publishedKit]);
    expect(check.compatible).toBe(false);
    expect(check.reason).toMatch(/No compatible/);
  });

  it("re-checks compatibility at publish time", () => {
    const kitDraft = createKitDraft(firstKitManifest, draftInput);
    const templateDraft: TemplateRecord = createTemplateDraft(
      firstTemplateManifest,
      draftInput,
      [publishKit(kitDraft, adminInput)],
    );
    expect(() =>
      publishTemplate(templateDraft, adminInput, [] as readonly KitRecord[]),
    ).toThrow(IncompatibleTemplateError);
  });

  it("duplicates templates with a patch bump", () => {
    const publishedKit = publishKit(
      createKitDraft(firstKitManifest, draftInput),
      adminInput,
    );
    const draft = createTemplateDraft(firstTemplateManifest, draftInput, [
      publishedKit,
    ]);
    const clone = duplicateTemplate(draft, {
      ...draftInput,
      newId: "dddddddd-dddd-7ddd-8ddd-dddddddddddd",
    });
    expect(clone.manifest.version).toBe("1.0.1");
    expect(clone.status).toBe("draft");
  });
});
