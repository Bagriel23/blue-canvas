import type { DesignDocument, DesignNode } from "@blue-canvas/document";
import { Window, type Element, type HTMLElement } from "happy-dom";
import { ModuleKind, ScriptTarget, transpileModule } from "typescript";
import { describe, expect, test } from "vitest";

import {
  generateExport,
  type ExportTarget,
  type GeneratedFile,
} from "./index.js";
import {
  exporterDocumentFixture,
  fixtureAssets,
  fixtureId,
} from "./test-fixture.js";

function text(id: number, value: string): DesignNode {
  return {
    id: fixtureId(id),
    kind: "text",
    name: value,
    visible: true,
    style: {},
    text: value,
  };
}

function runtimeDocument(): DesignDocument {
  const document = exporterDocumentFixture();
  document.variables.zero = { type: "number", value: 0 };
  const component = document.components[0];
  if (component?.root.kind !== "stack") {
    throw new Error("Fixture component changed");
  }
  component.root.children.push(
    {
      id: fixtureId(93),
      kind: "button",
      name: "Open instance overlay",
      visible: true,
      style: {},
      buttonType: "button",
      interactions: [
        {
          trigger: "click",
          action: { type: "open-overlay", overlayId: fixtureId(94) },
        },
      ],
      children: [text(95, "Open")],
    },
    {
      id: fixtureId(94),
      kind: "overlay",
      name: "Instance overlay",
      visible: false,
      style: {},
      interactions: [{ trigger: "click", action: { type: "close-overlay" } }],
      children: [text(96, "Instance dialog")],
    },
  );

  const root = document.pages[0]?.artboards[0]?.root;
  if (root?.kind !== "stack") throw new Error("Fixture root changed");
  const grid = root.children[1];
  if (grid?.kind !== "grid") throw new Error("Fixture grid changed");
  grid.children.push({
    id: fixtureId(32),
    kind: "component-instance",
    name: "Second badge instance",
    visible: true,
    style: {},
    componentId: component.id,
  });
  root.children.push({
    id: fixtureId(33),
    kind: "button",
    name: "Filter with zero",
    visible: true,
    style: {},
    buttonType: "button",
    interactions: [
      {
        trigger: "click",
        action: {
          type: "filter-collection",
          collection: "products",
          variable: "zero",
        },
      },
    ],
    children: [text(34, "Filter zero")],
  });
  return document;
}

function contentOf(files: GeneratedFile[], path: string): string {
  const file = files.find((candidate) => candidate.path === path);
  if (file === undefined || !("content" in file)) {
    throw new Error(`Missing text file: ${path}`);
  }
  return file.content;
}

async function loadRuntime(target: ExportTarget): Promise<Window> {
  const document = runtimeDocument();
  const result = await generateExport({
    document,
    target,
    scope: { type: "project" },
    assets: fixtureAssets,
  });
  const staticResult =
    target === "html"
      ? result
      : await generateExport({
          document,
          target: "html",
          scope: { type: "project" },
          assets: fixtureAssets,
        });
  expect(result.diagnostics).toEqual([]);
  const window = new Window({ url: "http://localhost/#%E0%A4%A" });
  window.document.write(contentOf(staticResult.files, "index.html"));

  if (target === "html") {
    window.eval(contentOf(result.files, "scripts/runtime.js"));
  } else {
    const page = contentOf(result.files, "src/pages/HomeShopPage.tsx");
    expect(page.match(/data-bc-instance-id/gu)).toHaveLength(2);
    const runtime = contentOf(result.files, "src/runtime/state.ts").replace(
      "export function installRuntime",
      "function installRuntime",
    );
    const executable = transpileModule(`${runtime}\ninstallRuntime();\n`, {
      compilerOptions: { module: ModuleKind.None, target: ScriptTarget.ES2022 },
    }).outputText;
    window.eval(executable);
  }
  await window.happyDOM.waitUntilComplete();
  await new Promise((resolvePromise) => setTimeout(resolvePromise, 100));
  return window;
}

function click(window: Window, element: Element): void {
  element.dispatchEvent(
    new window.MouseEvent("click", { bubbles: true, cancelable: true }),
  );
}

describe.each(["html", "react", "preact"] as const)(
  "%s runtime conformance",
  (target) => {
    test("executes routing, state, filtering, and instance-local overlays", async () => {
      const window = await loadRuntime(target);
      const { document } = window;
      const firstPage = document.querySelector<HTMLElement>(
        `[data-bc-page-id="${fixtureId(2)}"]`,
      );
      const trueBranch = document.querySelector<HTMLElement>(
        '[data-bc-conditional="subscribed"] > [data-bc-branch="true"]',
      );
      const falseBranch = document.querySelector<HTMLElement>(
        '[data-bc-conditional="subscribed"] > [data-bc-branch="false"]',
      );
      const instances = [
        ...document.querySelectorAll<HTMLElement>("[data-bc-instance-id]"),
      ];

      expect(firstPage?.hidden).toBe(false);
      expect(trueBranch?.hidden).toBe(true);
      expect(falseBranch?.hidden).toBe(false);
      expect(instances).toHaveLength(2);
      const firstOpen = instances[0]?.querySelector<HTMLElement>(
        `[data-bc-node-id="${fixtureId(93)}"]`,
      );
      const firstOverlay = instances[0]?.querySelector<HTMLElement>(
        `[data-bc-overlay="${fixtureId(94)}"]`,
      );
      const secondOverlay = instances[1]?.querySelector<HTMLElement>(
        `[data-bc-overlay="${fixtureId(94)}"]`,
      );
      if (firstOpen === null || firstOpen === undefined) {
        throw new Error("Instance overlay trigger missing");
      }
      click(window, firstOpen);
      expect(firstOverlay?.hidden).toBe(false);
      expect(secondOverlay?.hidden).toBe(true);

      const subscribe = document.querySelector<HTMLElement>(
        `[data-bc-node-id="${fixtureId(11)}"]`,
      );
      if (subscribe === null) throw new Error("Subscribe trigger missing");
      click(window, subscribe);
      expect(trueBranch?.hidden).toBe(false);
      expect(falseBranch?.hidden).toBe(true);

      const filter = document.querySelector<HTMLElement>(
        `[data-bc-node-id="${fixtureId(33)}"]`,
      );
      const repeatedItem = document.querySelector<HTMLElement>(
        `[data-bc-node-id="${fixtureId(16)}"]`,
      );
      if (filter === null) throw new Error("Filter trigger missing");
      click(window, filter);
      expect(repeatedItem?.hidden).toBe(true);

      const link = document.querySelector<HTMLElement>(
        `[data-bc-node-id="${fixtureId(9)}"]`,
      );
      if (link === null) throw new Error("Navigation trigger missing");
      click(window, link);
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 0));
      expect(window.location.hash).toBe("#about");
      expect(
        document.querySelector<HTMLElement>(
          `[data-bc-page-id="${fixtureId(81)}"]`,
        )?.hidden,
      ).toBe(false);
      await window.happyDOM.close();
    }, 30_000);
  },
);
