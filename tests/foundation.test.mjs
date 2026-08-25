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

test("database integration generates clean-checkout prerequisites", async () => {
  const rootPackage = JSON.parse(await readFile("package.json", "utf8"));
  const integration = rootPackage.scripts["test:integration"];

  assert.match(integration, /build -w @blue-canvas\/contracts/u);
  assert.match(integration, /db:generate/u);
  assert.ok(
    integration.indexOf("db:generate") < integration.indexOf("db:migrate"),
  );
});

test("compose declares an app profile with api, web and mcp services", async () => {
  const compose = await readFile("compose.yaml", "utf8");
  for (const name of ["api", "web", "mcp"]) {
    assert.match(compose, new RegExp(`\\s${name}:`, "u"));
  }
  assert.match(compose, /profiles: \["app"\]/u);
  assert.match(compose, /BLUE_CANVAS_API_URL: http:\/\/api:3000/u);
  assert.match(compose, /VITE_API_UPSTREAM: http:\/\/api:3000/u);
  assert.match(compose, /assets-data:\/var\/lib\/blue-canvas\/assets/u);
});

test("operational scripts are shipped with executable permissions", async () => {
  const backupScript = await readFile("scripts/backup.sh", "utf8");
  const restoreScript = await readFile("scripts/restore.sh", "utf8");
  assert.match(backupScript, /^#!\/usr\/bin\/env bash/mu);
  assert.match(restoreScript, /^#!\/usr\/bin\/env bash/mu);
  assert.match(backupScript, /mysqldump/u);
  assert.match(restoreScript, /BLUE_CANVAS_FORCE_RESTORE/u);
});

test("windows script bundle covers start, stop, migrate, backup, restore and smoke", async () => {
  for (const name of [
    "start.ps1",
    "stop.ps1",
    "migrate.ps1",
    "backup.ps1",
    "restore.ps1",
    "smoke.ps1",
    "_common.ps1",
  ]) {
    const contents = await readFile(`scripts/windows/${name}`, "utf8");
    assert.match(contents, /Requires -Version 5\.1|Import-Module/u);
  }
});
