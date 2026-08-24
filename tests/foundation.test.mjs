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

test("browser workspaces typecheck TypeScript React files", async () => {
  for (const workspace of ["apps/web", "packages/ui"]) {
    const tsconfig = JSON.parse(
      await readFile(`${workspace}/tsconfig.json`, "utf8"),
    );

    assert.equal(tsconfig.compilerOptions.jsx, "react-jsx");
    assert.deepEqual(tsconfig.include, ["src/**/*.ts", "src/**/*.tsx"]);
  }
});

test("the supported databases are immutable and development is bound to loopback", async () => {
  const compose = await readFile("compose.yaml", "utf8");
  const workflow = await readFile(".github/workflows/ci.yml", "utf8");
  const developmentEnvironment = await readFile(".env.example", "utf8");

  assert.match(compose, /image: mariadb:10\.6\.28@sha256:[a-f0-9]{64}/u);
  assert.match(compose, /127\.0\.0\.1:\$\{MARIADB_PORT:-3306\}:3306/u);
  assert.match(compose, /- mariadb106-data:\/var\/lib\/mysql/u);
  assert.doesNotMatch(compose, /- mariadb-data:\/var\/lib\/mysql/u);
  assert.match(workflow, /image: mariadb:10\.6\.28@sha256:[a-f0-9]{64}/u);
  assert.match(workflow, /image: mysql:8\.0\.46@sha256:[a-f0-9]{64}/u);
  assert.match(workflow, /run: npm run test:integration/u);
  assert.match(developmentEnvironment, /^APP_HOST=127\.0\.0\.1$/mu);
});

test("the repository and CI use the pinned npm release", async () => {
  const rootPackage = JSON.parse(await readFile("package.json", "utf8"));
  const workflow = await readFile(".github/workflows/ci.yml", "utf8");

  assert.equal(rootPackage.packageManager, "npm@11.19.0");
  assert.equal(rootPackage.engines.npm, ">=11.19.0 <12");
  assert.match(workflow, /npm install --global npm@11\.19\.0/u);
});

test("CI actions are pinned to immutable revisions", async () => {
  const workflow = await readFile(".github/workflows/ci.yml", "utf8");

  assert.doesNotMatch(workflow, /uses: [^\n]+@v\d/u);
  assert.match(workflow, /uses: actions\/checkout@[a-f0-9]{40}/u);
  assert.match(workflow, /uses: actions\/setup-node@[a-f0-9]{40}/u);
});

test("generated React and Preact fixture builds have a root command", async () => {
  const rootPackage = JSON.parse(await readFile("package.json", "utf8"));

  assert.equal(
    rootPackage.scripts["test:export-fixtures"],
    "vitest run --project packages/exporters src/framework-build.test.ts",
  );
});

test("the clean check builds workspace entry points before running tests", async () => {
  const rootPackage = JSON.parse(await readFile("package.json", "utf8"));

  assert.match(
    rootPackage.scripts.check,
    /npm run typecheck && npm run build && npm run test$/u,
  );
});
