import { describe, expect, it } from "vitest";
import { InMemoryRepository } from "./memory-repository.js";

import {
  LibraryError,
  LibraryService,
  publicKit,
  publicTemplate,
  type LibraryActor,
} from "./library-service.js";
import { shippedKitManifests } from "@blue-canvas/library";

const admin: LibraryActor = {
  id: "aaaaaaaa-aaaa-7aaa-8aaa-aaaaaaaaaaaa",
  isAdmin: true,
};
const member: LibraryActor = {
  id: "bbbbbbbb-bbbb-7bbb-8bbb-bbbbbbbbbbbb",
  isAdmin: false,
};

class FailingLibraryRepository extends InMemoryRepository {
  failCreate = false;
  failUpdate = false;

  override async createLibraryKit(
    record: Parameters<InMemoryRepository["createLibraryKit"]>[0],
  ) {
    if (this.failCreate) throw new Error("injected library create failure");
    return super.createLibraryKit(record);
  }

  override async updateLibraryKit(
    record: Parameters<InMemoryRepository["updateLibraryKit"]>[0],
  ) {
    if (this.failUpdate) throw new Error("injected library update failure");
    return super.updateLibraryKit(record);
  }
}

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

  it("rejects an edited template when its kit reference is no longer compatible", async () => {
    const lib = service();
    const draft = await lib.duplicateTemplate(
      member,
      await firstTemplateId(lib),
    );
    await expect(
      lib.updateTemplateDraft(admin, draft.manifest.id, {
        ...draft.manifest,
        kit: { kitSlug: "missing-kit", kitVersion: "1.0.0" },
      }),
    ).rejects.toMatchObject({ code: "incompatible_kit" });
  });

  it("keeps memory library uniqueness aligned with database adapters", async () => {
    const repository = new InMemoryRepository();
    const [seedKit] = shippedKitManifests;
    if (!seedKit) throw new Error("missing kit seed");
    const record = {
      manifest: seedKit,
      status: "published" as const,
      authorId: "seed",
      publishedAt: "2026-08-24T15:00:00.000Z",
      createdAt: "2026-08-24T15:00:00.000Z",
      updatedAt: "2026-08-24T15:00:00.000Z",
    };
    await repository.createLibraryKit(record);
    await expect(repository.createLibraryKit(record)).rejects.toMatchObject({
      code: "library_kit_exists",
    });
  });

  it("does not mutate its cache when library persistence fails", async () => {
    const repository = new FailingLibraryRepository();
    const lib = new LibraryService(
      () => new Date("2026-08-24T15:00:00Z"),
      repository,
    );
    await lib.ready();
    const original = await lib.listKits(admin);
    const first = original.find((entry) => entry.status === "published");
    if (!first) throw new Error("missing seeded kit");

    repository.failUpdate = true;
    await expect(lib.deprecateKit(admin, first.manifest.id)).rejects.toThrow(
      "injected library update failure",
    );
    expect(
      (await lib.listKits(admin)).find(
        (entry) => entry.manifest.id === first.manifest.id,
      )?.status,
    ).toBe("published");

    repository.failUpdate = false;
    const draft = await lib.duplicateKit(admin, first.manifest.id);
    repository.failUpdate = true;
    await expect(lib.publishKit(admin, draft.manifest.id)).rejects.toThrow(
      "injected library update failure",
    );
    expect(
      (await lib.listKits(admin)).find(
        (entry) => entry.manifest.id === draft.manifest.id,
      )?.status,
    ).toBe("draft");
  });

  it("seeds missing entities independently and concurrent services converge", async () => {
    const repository = new InMemoryRepository();
    const [seedKit] = shippedKitManifests;
    if (!seedKit) throw new Error("missing kit seed");
    await repository.createLibraryKit({
      manifest: seedKit,
      status: "published",
      authorId: "seed",
      publishedAt: "2026-08-24T15:00:00.000Z",
      createdAt: "2026-08-24T15:00:00.000Z",
      updatedAt: "2026-08-24T15:00:00.000Z",
    });
    const clock = () => new Date("2026-08-24T15:00:00Z");
    const services = [
      new LibraryService(clock, repository),
      new LibraryService(clock, repository),
    ];
    await Promise.all(services.map((service) => service.ready()));
    expect(await repository.listLibraryKits()).toHaveLength(3);
    expect(await repository.listLibraryTemplates()).toHaveLength(6);
  });
});
