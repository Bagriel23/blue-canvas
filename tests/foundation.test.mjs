import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const workspaceNames = [
  "apps/web",
  "apps/server",
  "apps/mcp-server",
  "apps/mcp-stdio",
  "packages/contracts",
  "packages/document",
  "packages/commands",
  "packages/renderer",
  "packages/exporters",
  "packages/ui",
  "packages/testing",
];

test("the repository declares every planned npm workspace", async () => {
  const rootPackage = JSON.parse(await readFile("package.json", "utf8"));

  assert.deepEqual(rootPackage.workspaces, ["apps/*", "packages/*"]);

  for (const workspace of workspaceNames) {
    const workspacePackage = JSON.parse(
      await readFile(`${workspace}/package.json`, "utf8"),
    );

    assert.equal(workspacePackage.private, true);
  }
});
