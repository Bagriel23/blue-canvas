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

async function firstKitId(lib: LibraryService): Promise<string> {
  const [entry] = await lib.listKits(admin);
  if (!entry) throw new Error("library empty");
  return entry.manifest.id;
}

async function firstTemplateId(lib: LibraryService): Promise<string> {
  const [entry] = await lib.listTemplates(admin);
  if (!entry) throw new Error("library empty");
  return entry.record.manifest.id;
}

describe("LibraryService", () => {
  it("hides other users drafts from members but keeps published visible", async () => {
    const lib = service();
    const draft = await lib.duplicateKit(admin, await firstKitId(lib));
    expect(draft.status).toBe("draft");
    const memberView = await lib.listKits(member);
    expect(
      memberView.some((entry) => entry.manifest.id === draft.manifest.id),
    ).toBe(false);
    const adminView = await lib.listKits(admin);
    expect(
      adminView.some((entry) => entry.manifest.id === draft.manifest.id),
    ).toBe(true);
  });

  it("rejects non-admin publish attempts", async () => {
    const lib = service();
    const draft = await lib.duplicateKit(member, await firstKitId(lib));
    await expect(lib.publishKit(member, draft.manifest.id)).rejects.toThrow(
      LibraryError,
    );
  });

  it("publishes a kit draft after admin approval", async () => {
    const lib = service();
    const draft = await lib.duplicateKit(admin, await firstKitId(lib));
    const published = await lib.publishKit(admin, draft.manifest.id);
    expect(published.status).toBe("published");
    expect(published.publishedAt).toBe("2026-08-24T15:00:00.000Z");
  });

  it("reports template compatibility in the listing", async () => {
    const lib = service();
    const template = await lib.duplicateTemplate(
      member,
      await firstTemplateId(lib),
    );
    const view = (await lib.listTemplates(member)).find(
      (entry) => entry.record.manifest.id === template.manifest.id,
    );
    expect(view?.compatible).toBe(true);
  });

  it("returns compatibility diagnostics when the kit is missing", async () => {
    const lib = service();
    const [firstTemplate] = await lib.listTemplates(admin);
    if (!firstTemplate) throw new Error("no templates");
    const invalidManifest = {
      ...firstTemplate.record.manifest,
      id: "cccccccc-cccc-7ccc-8ccc-cccccccccccc",
      slug: "unknown-template",
      version: "1.0.0",
      kit: { kitSlug: "does-not-exist", kitVersion: "1.0.0" },
    };
    await expect(
      lib.createTemplateDraft(admin, invalidManifest),
    ).rejects.toThrow(/No kit named does-not-exist/);
  });

  it("serializes kits and templates with the public schema", async () => {
    const lib = service();
    const [firstKit] = await lib.listKits(admin);
    if (!firstKit) throw new Error("no kits");
    const rendered = publicKit(firstKit);
    expect(rendered.slug).toBe(firstKit.manifest.slug);
    expect(rendered.components).toBe(firstKit.manifest.components.length);
    const [firstTemplate] = await lib.listTemplates(admin);
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

  it("updates and deletes only draft templates", async () => {
    const lib = service();
    const draft = await lib.duplicateTemplate(
      member,
      await firstTemplateId(lib),
    );
    const updated = await lib.updateTemplateDraft(admin, draft.manifest.id, {
      ...draft.manifest,
      displayName: "Updated template",
    });
    expect(updated.manifest.displayName).toBe("Updated template");
    await lib.deleteTemplate(admin, draft.manifest.id);
    expect(
      (await lib.listTemplates(admin)).some(
        (entry) => entry.record.manifest.id === draft.manifest.id,
      ),
    ).toBe(false);
  });
});
