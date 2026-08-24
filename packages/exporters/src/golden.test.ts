import { expect, test } from "vitest";

import { generateExport, type GeneratedFile } from "./index.js";
import { exporterDocumentFixture, fixtureAssets } from "./test-fixture.js";

function goldenBundle(files: GeneratedFile[]): string {
  return files
    .map((file) => {
      const body =
        "content" in file
          ? file.content
          : Buffer.from(file.bytes).toString("hex");
      return `=== ${file.path} ===\n${body}`;
    })
    .join("\n\n");
}

test.each(["html", "react", "preact"] as const)(
  "%s export matches its complete golden fixture",
  async (target) => {
    const result = await generateExport({
      document: exporterDocumentFixture(),
      target,
      scope: { type: "project" },
      assets: fixtureAssets,
    });

    expect(result.diagnostics).toEqual([]);
    await expect(goldenBundle(result.files)).toMatchFileSnapshot(
      `../test/golden/${target}.golden.txt`,
    );
  },
);
