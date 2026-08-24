import { describe, expect, test } from "vitest";

import {
  generateExport,
  type ExportAsset,
  type ExportRequest,
} from "./index.js";
import {
  exporterDocumentFixture,
  fixtureAssets,
  fixtureId,
} from "./test-fixture.js";

function request(asset?: ExportAsset): ExportRequest {
  return {
    document: exporterDocumentFixture(),
    target: "html",
    scope: { type: "project" },
    assets: asset === undefined ? fixtureAssets : { [fixtureId(100)]: asset },
  };
}

describe("export hardening", () => {
  test.each([
    'image-set("https://example.com/a.png" 1x)',
    '-webkit-image-set("data:image/png;base64,AAAA" 1x)',
    'url("//example.com/a.png")',
    '@import "https://example.com/a.css"',
    "https://example.com/a.png",
    "data:image/svg+xml,<svg/>",
    "javascript:alert(1)",
  ])("blocks external-capable CSS value %s", async (value) => {
    const hardenedRequest = request();
    hardenedRequest.document.tokens.accent = { type: "color", value };

    const result = await generateExport(hardenedRequest);

    expect(result.files).toEqual([]);
    expect(result.diagnostics.some(({ code }) => code === "CSS_UNSAFE")).toBe(
      true,
    );
  });

  test.each([
    {
      fileName: "empty.png",
      mimeType: "image/png",
      bytes: new Uint8Array(),
    },
    {
      fileName: "wrong.png",
      mimeType: "image/png",
      bytes: new Uint8Array([1, 2, 3, 4]),
    },
    {
      fileName: "mismatch.jpg",
      mimeType: "image/png",
      bytes: new Uint8Array([137, 80, 78, 71]),
    },
    {
      fileName: "polyglot.svg",
      mimeType: "image/svg+xml",
      bytes: new TextEncoder().encode(
        '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
      ),
    },
    {
      fileName: "html.svg",
      mimeType: "image/svg+xml",
      bytes: new TextEncoder().encode("<html><body>not svg</body></html>"),
    },
  ] satisfies ExportAsset[])(
    "blocks malformed or mismatched asset $fileName",
    async (asset) => {
      const result = await generateExport(request(asset));

      expect(result.files).toEqual([]);
      expect(
        result.diagnostics.some(({ code }) => code.startsWith("ASSET_")),
      ).toBe(true);
    },
  );

  test.each([
    {
      fileName: "pixel.jpg",
      mimeType: "image/jpeg",
      expectedMediaType: "image/jpeg",
      base64:
        "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AVN//2Q==",
    },
    {
      fileName: "pixel.webp",
      mimeType: "image/webp",
      expectedMediaType: "image/webp",
      base64: "UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAgA0JaQAA3AA/vuUAAA=",
    },
    {
      fileName: "mark.svg",
      mimeType: "image/svg+xml",
      expectedMediaType: "image/svg+xml",
      base64: Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><path fill="#fff" d="M0 0h1v1z"/></svg>',
      ).toString("base64"),
    },
  ])("accepts validated local $mimeType assets", async (asset) => {
    const result = await generateExport(
      request({
        fileName: asset.fileName,
        mimeType: asset.mimeType,
        bytes: new Uint8Array(Buffer.from(asset.base64, "base64")),
      }),
    );

    expect(result.diagnostics).toEqual([]);
    expect(
      result.files.some(({ path }) => path === `assets/${asset.fileName}`),
    ).toBe(true);
    expect(
      result.manifest.files.find(
        ({ path }) => path === `assets/${asset.fileName}`,
      )?.mediaType,
    ).toBe(asset.expectedMediaType);
  });

  test.each([
    "CON.png",
    "prn.jpg",
    "aux.svg",
    "NUL.webp",
    "COM1.png",
    "lpt9.jpeg",
  ])("blocks Windows reserved asset path %s", async (fileName) => {
    const fixtureAsset = fixtureAssets[fixtureId(100)];
    if (fixtureAsset === undefined) throw new Error("Fixture asset changed");

    const result = await generateExport(request({ ...fixtureAsset, fileName }));

    expect(result.files).toEqual([]);
    expect(
      result.diagnostics.some(({ code }) => code === "ASSET_PATH_UNSAFE"),
    ).toBe(true);
  });

  test("canonicalizes variable records and selection node IDs", async () => {
    const firstDocument = exporterDocumentFixture();
    const secondDocument = exporterDocumentFixture();
    const subscribed = secondDocument.variables.subscribed;
    const query = secondDocument.variables.query;
    if (subscribed === undefined || query === undefined) {
      throw new Error("Fixture variables changed");
    }
    secondDocument.variables = {
      subscribed,
      query,
    };
    const variablesFirst = await generateExport({
      ...request(),
      document: firstDocument,
    });
    const variablesSecond = await generateExport({
      ...request(),
      document: secondDocument,
    });
    const selectionFirst = await generateExport({
      ...request(),
      scope: {
        type: "selection",
        nodeIds: [fixtureId(13), fixtureId(13)],
      },
    });
    const selectionSecond = await generateExport({
      ...request(),
      scope: { type: "selection", nodeIds: [fixtureId(13)] },
    });

    expect(variablesFirst).toEqual(variablesSecond);
    expect(selectionFirst).toEqual(selectionSecond);
    expect(selectionFirst.manifest.scope).toEqual({
      type: "selection",
      nodeIds: [fixtureId(13)],
    });
  });

  test("returns diagnostics for malformed request targets and scopes", async () => {
    const invalidRequest = await generateExport(
      null as unknown as ExportRequest,
    );
    const invalidTarget = await generateExport({
      ...request(),
      target: "vue" as ExportRequest["target"],
    });
    const invalidScope = await generateExport({
      ...request(),
      scope: {
        type: "selection",
        nodeIds: "bad",
      } as unknown as ExportRequest["scope"],
    });

    expect(invalidRequest.files).toEqual([]);
    expect(invalidRequest.diagnostics[0]?.code).toBe("REQUEST_INVALID");
    expect(invalidTarget.files).toEqual([]);
    expect(invalidTarget.diagnostics[0]?.code).toBe("TARGET_INVALID");
    expect(invalidTarget.manifest.target).toBeNull();
    expect(invalidScope.files).toEqual([]);
    expect(invalidScope.diagnostics[0]?.code).toBe("SCOPE_INVALID");
  });
});
