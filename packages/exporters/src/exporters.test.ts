import { parse, serialize } from "parse5";
import { describe, expect, test } from "vitest";

import {
  generateExport,
  type ExportRequest,
  type GeneratedFile,
} from "./index.js";
import {
  exporterDocumentFixture,
  fixtureAssets,
  fixtureId,
} from "./test-fixture.js";

function contentOf(files: GeneratedFile[], path: string): string {
  const file = files.find((candidate) => candidate.path === path);
  if (file === undefined || !("content" in file)) {
    throw new Error(`Missing text file: ${path}`);
  }
  return file.content;
}

const staticRequest = (): ExportRequest => ({
  document: exporterDocumentFixture(),
  target: "html",
  scope: { type: "project" },
  assets: fixtureAssets,
});

describe("generateExport", () => {
  test("generates ordered deterministic semantic static files", async () => {
    const first = await generateExport(staticRequest());
    const second = await generateExport(staticRequest());

    expect(first).toEqual(second);
    expect(first.files.map(({ path }) => path)).toEqual([
      "index.html",
      "styles/tokens.css",
      "styles/base.css",
      "scripts/runtime.js",
      "assets/canvas-preview.png",
      "export-manifest.json",
    ]);
    expect(first.diagnostics).toEqual([]);

    const html = contentOf(first.files, "index.html");
    const parsed = parse(html);
    expect(serialize(parsed)).toContain("<main");
    expect(html).toContain("<img");
    expect(html).toContain('alt="Blue canvas product preview"');
    expect(html).toContain("<label");
    expect(html).toContain("Search products");
    expect(html).toContain(
      'data-bc-node-id="30000000-0000-4000-8000-000000000014"',
    );
    expect(html).toContain('data-bc-name="Search products"');
    expect(html).toContain('role="img"');
    expect(html).toContain("data-bc-component-id");
    expect(html).toContain("hidden");
    expect(html).not.toContain("javascript:");

    const tokens = contentOf(first.files, "styles/tokens.css");
    const base = contentOf(first.files, "styles/base.css");
    expect(tokens).toContain("--bc-accent: #1428a0;");
    expect(base).toContain("display: flex");
    expect(base).toContain("display: grid");
    expect(base).toContain("grid-template-columns: 1fr 240px");
    expect(base).toContain("@media (min-width: 768px)");
    expect(base).toContain("var(--bc-gutter)");

    const runtime = contentOf(first.files, "scripts/runtime.js");
    for (const action of [
      "navigate",
      "set-variable",
      "open-overlay",
      "close-overlay",
      "filter-collection",
    ]) {
      expect(runtime).toContain(action);
    }
    expect(runtime).toContain("hashchange");
    expect(runtime).toContain('interaction.action.type === "navigate"');
    expect(runtime).not.toMatch(/\beval\s*\(/u);

    const manifest = JSON.parse(
      contentOf(first.files, "export-manifest.json"),
    ) as { target: string; files: { path: string; sha256: string }[] };
    expect(manifest.target).toBe("html");
    expect(manifest.files.map(({ path }) => path)).toEqual(
      first.files.slice(0, -1).map(({ path }) => path),
    );
    expect(
      manifest.files.every(({ sha256 }) => /^[a-f0-9]{64}$/u.test(sha256)),
    ).toBe(true);
    expect(first.manifest).toEqual(manifest);
  });

  test("limits page and selection scopes without losing the selected subtree", async () => {
    const document = exporterDocumentFixture();
    const page = await generateExport({
      ...staticRequest(),
      scope: { type: "page", pageId: fixtureId(81) },
    });
    const selection = await generateExport({
      ...staticRequest(),
      scope: { type: "selection", nodeIds: [fixtureId(13)] },
    });

    expect(contentOf(page.files, "index.html")).toContain("About Blue Canvas");
    expect(contentOf(page.files, "index.html")).not.toContain(
      "Blue Canvas &amp; Store",
    );
    expect(contentOf(selection.files, "index.html")).toContain(
      "Search products",
    );
    expect(contentOf(selection.files, "index.html")).not.toContain(
      "Canvas Pro",
    );
    expect(document.pages).toHaveLength(2);
  });

  test("reports invalid documents and scopes without generating files", async () => {
    const invalidDocument = {
      ...exporterDocumentFixture(),
      schemaVersion: 2,
    } as unknown as ExportRequest["document"];

    const invalid = await generateExport({
      ...staticRequest(),
      document: invalidDocument,
    });
    const missingPage = await generateExport({
      ...staticRequest(),
      scope: { type: "page", pageId: fixtureId(999) },
    });
    const missingSelection = await generateExport({
      ...staticRequest(),
      scope: { type: "selection", nodeIds: [fixtureId(999)] },
    });

    expect(invalid.files).toEqual([]);
    expect(invalid.diagnostics[0]?.code).toBe("DOCUMENT_INVALID");
    expect(missingPage.files).toEqual([]);
    expect(missingPage.diagnostics[0]?.code).toBe("SCOPE_INVALID");
    expect(missingSelection.files).toEqual([]);
    expect(missingSelection.diagnostics[0]?.code).toBe("SCOPE_INVALID");
  });

  test("blocks scopes whose interactions target pruned content", async () => {
    const page = await generateExport({
      ...staticRequest(),
      scope: { type: "page", pageId: fixtureId(2) },
    });
    const selection = await generateExport({
      ...staticRequest(),
      scope: { type: "selection", nodeIds: [fixtureId(11)] },
    });

    expect(page.files).toEqual([]);
    expect(
      page.diagnostics.some(({ code }) => code === "SCOPE_REFERENCE_MISSING"),
    ).toBe(true);
    expect(selection.files).toEqual([]);
    expect(
      selection.diagnostics.some(
        ({ code }) => code === "SCOPE_REFERENCE_MISSING",
      ),
    ).toBe(true);
  });

  test("blocks missing, remote, unsafe-path, CSS, and navigation inputs", async () => {
    const missingAsset = await generateExport({
      ...staticRequest(),
      assets: {},
    });
    const fixtureAsset = fixtureAssets[fixtureId(100)];
    if (fixtureAsset === undefined) throw new Error("Fixture asset changed");
    const unsafeAsset = await generateExport({
      ...staticRequest(),
      assets: {
        [fixtureId(100)]: {
          ...fixtureAsset,
          fileName: "../secret.png",
        },
      },
    });

    const remoteDocument = exporterDocumentFixture();
    const remoteImage = remoteDocument.pages[0]?.artboards[0]?.root;
    if (remoteImage?.kind !== "stack") throw new Error("Fixture root changed");
    const grid = remoteImage.children[1];
    if (grid?.kind !== "grid" || grid.children[0]?.kind !== "image") {
      throw new Error("Fixture image changed");
    }
    grid.children[0].source = { type: "url", url: "https://example.com/a.png" };
    const remote = await generateExport({
      ...staticRequest(),
      document: remoteDocument,
      assets: {},
    });

    const cssDocument = exporterDocumentFixture();
    cssDocument.tokens.accent = {
      type: "color",
      value: "red; } @import url(https://example.com)",
    };
    const unsafeCss = await generateExport({
      ...staticRequest(),
      document: cssDocument,
    });

    const navigationDocument = exporterDocumentFixture();
    const navigationRoot = navigationDocument.pages[0]?.artboards[0]?.root;
    if (navigationRoot?.kind !== "stack")
      throw new Error("Fixture root changed");
    const navigationGrid = navigationRoot.children[1];
    if (
      navigationGrid?.kind !== "grid" ||
      navigationGrid.children[2]?.kind !== "link"
    ) {
      throw new Error("Fixture link changed");
    }
    navigationGrid.children[2].href = "javascript:alert(1)";
    const unsafeNavigation = await generateExport({
      ...staticRequest(),
      document: navigationDocument,
    });

    expect(missingAsset.files).toEqual([]);
    expect(
      missingAsset.diagnostics.some(({ code }) => code === "ASSET_MISSING"),
    ).toBe(true);
    expect(unsafeAsset.files).toEqual([]);
    expect(
      unsafeAsset.diagnostics.some(({ code }) => code === "ASSET_PATH_UNSAFE"),
    ).toBe(true);
    expect(remote.files).toEqual([]);
    expect(
      remote.diagnostics.some(
        ({ code }) => code === "ASSET_REMOTE_UNSUPPORTED",
      ),
    ).toBe(true);
    expect(unsafeCss.files).toEqual([]);
    expect(
      unsafeCss.diagnostics.some(({ code }) => code === "CSS_UNSAFE"),
    ).toBe(true);
    expect(unsafeNavigation.files).toEqual([]);
    expect(
      unsafeNavigation.diagnostics.some(
        ({ code }) => code === "NAVIGATION_UNSAFE",
      ),
    ).toBe(true);
  });

  test("emits an image alt warning while retaining valid output", async () => {
    const document = exporterDocumentFixture();
    const root = document.pages[0]?.artboards[0]?.root;
    if (root?.kind !== "stack") throw new Error("Fixture root changed");
    const grid = root.children[1];
    if (grid?.kind !== "grid" || grid.children[0]?.kind !== "image") {
      throw new Error("Fixture image changed");
    }
    grid.children[0].alt = "";

    const result = await generateExport({ ...staticRequest(), document });

    expect(result.files.length).toBeGreaterThan(0);
    expect(result.diagnostics).toContainEqual({
      severity: "warning",
      code: "IMAGE_ALT_MISSING",
      nodeId: fixtureId(7),
      message: 'Image "Canvas preview" needs alternative text',
    });
  });

  test("sorts token output by code point instead of host locale", async () => {
    const document = exporterDocumentFixture();
    document.tokens = {
      accent: { type: "color", value: "#1428a0" },
      gutter: { type: "dimension", value: 16 },
      éclair: { type: "color", value: "#333333" },
      zeta: { type: "color", value: "#222222" },
      alpha: { type: "color", value: "#111111" },
    };
    const result = await generateExport({ ...staticRequest(), document });
    const tokens = contentOf(result.files, "styles/tokens.css");

    expect(tokens.indexOf("--bc-alpha")).toBeLessThan(
      tokens.indexOf("--bc-zeta"),
    );
    expect(tokens.indexOf("--bc-zeta")).toBeLessThan(
      tokens.indexOf("--bc-eclair"),
    );
  });

  test("blocks token names that normalize to the same CSS property", async () => {
    const document = exporterDocumentFixture();
    document.tokens["accent color"] = { type: "color", value: "#111111" };
    document.tokens["accent-color"] = { type: "color", value: "#222222" };

    const result = await generateExport({ ...staticRequest(), document });

    expect(result.files).toEqual([]);
    expect(
      result.diagnostics.some(
        ({ code }) => code === "CSS_IDENTIFIER_COLLISION",
      ),
    ).toBe(true);
  });

  test("suffixes colliding normalized page routes", async () => {
    const document = exporterDocumentFixture();
    const secondPage = document.pages[1];
    if (secondPage === undefined) throw new Error("Fixture page changed");
    secondPage.name = "Home Shop";

    const result = await generateExport({ ...staticRequest(), document });
    const html = contentOf(result.files, "index.html");

    expect(html).toContain('data-bc-route="home-shop"');
    expect(html).toContain('data-bc-route="home-shop-2"');
  });
});
