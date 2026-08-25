import { describe, expect, it } from "vitest";

import {
  LibraryError,
  LibraryService,
  publicKit,
  publicTemplate,
  type LibraryActor,
} from "./library-service.js";

const admin: LibraryActor = {
  id: "aaaaaaaa-aaaa-7aaa-8aaa-aaaaaaaaaaaa",
  isAdmin: true,
};
const member: LibraryActor = {
  id: "bbbbbbbb-bbbb-7bbb-8bbb-bbbbbbbbbbbb",
  isAdmin: false,
};

function service() {
  const clock = () => new Date("2026-08-24T15:00:00Z");
  return new LibraryService(clock);
}

function firstKitId(lib: LibraryService): string {
  const [entry] = lib.listKits(admin);
  if (!entry) throw new Error("library empty");
  return entry.manifest.id;
}

function firstTemplateId(lib: LibraryService): string {
  const [entry] = lib.listTemplates(admin);
  if (!entry) throw new Error("library empty");
  return entry.record.manifest.id;
}

describe("LibraryService", () => {
  it("hides other users drafts from members but keeps published visible", () => {
    const lib = service();
    const draft = lib.duplicateKit(admin, firstKitId(lib));
    expect(draft.status).toBe("draft");
    const memberView = lib.listKits(member);
    expect(
      memberView.some((entry) => entry.manifest.id === draft.manifest.id),
    ).toBe(false);
    const adminView = lib.listKits(admin);
    expect(
      adminView.some((entry) => entry.manifest.id === draft.manifest.id),
    ).toBe(true);
  });

  it("rejects non-admin publish attempts", () => {
    const lib = service();
    const draft = lib.duplicateKit(member, firstKitId(lib));
    expect(() => lib.publishKit(member, draft.manifest.id)).toThrow(
      LibraryError,
    );
  });

  it("publishes a kit draft after admin approval", () => {
    const lib = service();
    const draft = lib.duplicateKit(admin, firstKitId(lib));
    const published = lib.publishKit(admin, draft.manifest.id);
    expect(published.status).toBe("published");
    expect(published.publishedAt).toBe("2026-08-24T15:00:00.000Z");
  });

  it("reports template compatibility in the listing", () => {
    const lib = service();
    const template = lib.duplicateTemplate(member, firstTemplateId(lib));
    const view = lib
      .listTemplates(member)
      .find((entry) => entry.record.manifest.id === template.manifest.id);
    expect(view?.compatible).toBe(true);
  });

  it("returns compatibility diagnostics when the kit is missing", () => {
    const lib = service();
    const [firstTemplate] = lib.listTemplates(admin);
    if (!firstTemplate) throw new Error("no templates");
    const invalidManifest = {
      ...firstTemplate.record.manifest,
      id: "cccccccc-cccc-7ccc-8ccc-cccccccccccc",
      slug: "unknown-template",
      version: "1.0.0",
      kit: { kitSlug: "does-not-exist", kitVersion: "1.0.0" },
    };
    expect(() => lib.createTemplateDraft(admin, invalidManifest)).toThrow(
      /No kit named does-not-exist/,
    );
  });

  it("serializes kits and templates with the public schema", () => {
    const lib = service();
    const [firstKit] = lib.listKits(admin);
    if (!firstKit) throw new Error("no kits");
    const rendered = publicKit(firstKit);
    expect(rendered.slug).toBe(firstKit.manifest.slug);
    expect(rendered.components).toBe(firstKit.manifest.components.length);
    const [firstTemplate] = lib.listTemplates(admin);
    if (!firstTemplate) throw new Error("no templates");
    const templatePayload = publicTemplate(
      firstTemplate.record,
      firstTemplate.compatible,
    );
    expect(templatePayload.compatible).toBe(true);
    expect(templatePayload.kit.kitSlug).toBe(
      firstTemplate.record.manifest.kit.kitSlug,
    );
  });
});
