import { execFile } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { promisify } from "node:util";

import { afterAll, describe, expect, test } from "vitest";

import { generateExport, type GeneratedFile } from "./index.js";
import {
  exporterDocumentFixture,
  fixtureAssets,
  fixtureId,
} from "./test-fixture.js";

const execute = promisify(execFile);
const repositoryRoot = resolve(import.meta.dirname, "../../..");
const fixtureRoot = resolve(
  tmpdir(),
  `blue-canvas-export-fixtures-${process.pid}`,
);

async function run(
  command: string,
  arguments_: string[],
  cwd?: string,
): Promise<void> {
  try {
    await execute(command, arguments_, cwd === undefined ? undefined : { cwd });
  } catch (error) {
    const output = error as { stdout?: string; stderr?: string };
    throw new Error(`${output.stdout ?? ""}${output.stderr ?? ""}`, {
      cause: error,
    });
  }
}

async function writeGeneratedFixture(
  name: string,
  files: GeneratedFile[],
): Promise<string> {
  const directory = resolve(fixtureRoot, name);
  await rm(directory, { recursive: true, force: true });
  for (const file of files) {
    const destination = resolve(directory, file.path);
    if (!destination.startsWith(`${directory}/`))
      throw new Error("Unsafe generated path");
    await mkdir(resolve(destination, ".."), { recursive: true });
    await writeFile(destination, "content" in file ? file.content : file.bytes);
  }
  return directory;
}

async function installAndBuild(directory: string): Promise<void> {
  expect(directory.startsWith(repositoryRoot)).toBe(false);
  await run("npm", ["ci", "--offline", "--ignore-scripts"], directory);
  await run("npm", ["run", "build", "--offline"], directory);
}

afterAll(async () => {
  await rm(fixtureRoot, { recursive: true, force: true });
});

describe.each(["react", "preact"] as const)("%s export", (target) => {
  test("prunes pages and includes only components reachable from the scope", async () => {
    const about = await generateExport({
      document: exporterDocumentFixture(),
      target,
      scope: { type: "page", pageId: fixtureId(81) },
      assets: fixtureAssets,
    });
    const instance = await generateExport({
      document: exporterDocumentFixture(),
      target,
      scope: { type: "selection", nodeIds: [fixtureId(31)] },
      assets: {},
    });

    expect(
      about.files.some(({ path }) => path === "src/pages/AboutPage.tsx"),
    ).toBe(true);
    expect(
      about.files.some(({ path }) => path === "src/pages/HomeShopPage.tsx"),
    ).toBe(false);
    expect(about.files.some(({ path }) => path.includes("ProductBadge"))).toBe(
      false,
    );
    expect(
      instance.files.some(
        ({ path }) => path === "src/components/ProductBadge.tsx",
      ),
    ).toBe(true);
    expect(
      instance.files.some(({ path }) => path === "src/pages/HomeShopPage.tsx"),
    ).toBe(true);
    expect(
      instance.files.some(({ path }) => path === "src/pages/AboutPage.tsx"),
    ).toBe(false);
  });

  test("generates a deterministic structured Vite TypeScript project that builds", async () => {
    const request = {
      document: exporterDocumentFixture(),
      target,
      scope: { type: "project" } as const,
      assets: fixtureAssets,
    };

    const first = await generateExport(request);
    const second = await generateExport(request);

    expect(first).toEqual(second);
    expect(first.diagnostics).toEqual([]);
    expect(first.files.map(({ path }) => path)).toEqual([
      "package.json",
      "package-lock.json",
      "index.html",
      "tsconfig.json",
      "vite.config.ts",
      "src/main.tsx",
      "src/App.tsx",
      "src/components/ProductBadge.tsx",
      "src/pages/HomeShopPage.tsx",
      "src/pages/AboutPage.tsx",
      "src/runtime/state.ts",
      "src/styles/tokens.css",
      "src/styles/base.css",
      "public/assets/canvas-preview.png",
      "export-manifest.json",
    ]);

    const packageFile = first.files.find(({ path }) => path === "package.json");
    if (packageFile === undefined || !("content" in packageFile))
      throw new Error("package.json missing");
    const packageJson = JSON.parse(packageFile.content) as {
      scripts: Record<string, string>;
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
    };
    expect(packageJson.scripts).toEqual({
      build: "tsc --noEmit && vite build",
    });
    expect(
      Object.values(packageJson.dependencies).every((version) =>
        /^\d+\.\d+\.\d+$/u.test(version),
      ),
    ).toBe(true);
    expect(
      Object.values(packageJson.devDependencies).every((version) =>
        /^\d+\.\d+\.\d+$/u.test(version),
      ),
    ).toBe(true);
    expect(packageJson.dependencies[target]).toBeDefined();
    const lockFile = first.files.find(
      ({ path }) => path === "package-lock.json",
    );
    if (lockFile === undefined || !("content" in lockFile))
      throw new Error("package-lock.json missing");
    expect(JSON.parse(lockFile.content)).toMatchObject({
      name: "blue-canvas-export",
      lockfileVersion: 3,
    });

    const app = first.files.find(({ path }) => path === "src/App.tsx");
    const page = first.files.find(
      ({ path }) => path === "src/pages/HomeShopPage.tsx",
    );
    const component = first.files.find(
      ({ path }) => path === "src/components/ProductBadge.tsx",
    );
    if (
      app === undefined ||
      !("content" in app) ||
      page === undefined ||
      !("content" in page) ||
      component === undefined ||
      !("content" in component)
    ) {
      throw new Error("Structured source files missing");
    }
    expect(app.content).toContain("HomeShopPage");
    expect(page.content).toContain("ProductBadge");
    expect(component.content).toContain("Featured");
    expect(page.content).toContain('aria-label="Search products"');
    const runtime = first.files.find(
      ({ path }) => path === "src/runtime/state.ts",
    );
    if (runtime === undefined || !("content" in runtime))
      throw new Error("Runtime missing");
    expect(runtime.content).toContain('"subscribed":false');
    expect(runtime.content).toContain("document.activeElement !== input");
    expect(runtime.content).toContain('interaction.action.type === "navigate"');

    const directory = await writeGeneratedFixture(target, first.files);
    await installAndBuild(directory);
  }, 30_000);

  test("keeps page and component identifiers distinct and buildable", async () => {
    const document = exporterDocumentFixture();
    const component = document.components[0];
    if (component === undefined) throw new Error("Fixture component changed");
    component.name = "Home shop page";
    const result = await generateExport({
      document,
      target,
      scope: { type: "project" },
      assets: fixtureAssets,
    });

    expect(
      result.files.some(
        ({ path }) => path === "src/components/HomeShopPage.tsx",
      ),
    ).toBe(true);
    const directory = await writeGeneratedFixture(
      `${target}-names`,
      result.files,
    );
    await installAndBuild(directory);
  }, 30_000);
});
