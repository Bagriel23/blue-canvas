import { readFile } from "node:fs/promises";

import {
  getNodeChildren,
  type DesignComponent,
  type DesignNode,
  type DesignPage,
} from "@blue-canvas/document";

import type { ExportModel } from "./model.js";
import {
  boundedPathComponent,
  compareStable,
  escapeHtml,
  isWindowsReservedBasename,
  safeJson,
  slug,
  uniqueSlugs,
} from "./safety.js";
import type { ExportTarget, GeneratedFile } from "./types.js";

const versions = {
  react: "19.2.8",
  reactDom: "19.2.8",
  reactTypes: "19.2.18",
  reactDomTypes: "19.2.5",
  preact: "10.29.8",
  typescript: "6.0.3",
  vite: "8.2.2",
} as const;

interface Names {
  components: Map<string, string>;
  pages: Map<string, string>;
}

function identifier(name: string, fallback: string): string {
  const words = slug(name, fallback).split("-");
  const value = words
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
    .join("");
  return /^\d/u.test(value) ? `Item${value}` : value;
}

function uniqueNames(
  items: { id: string; name: string }[],
  suffix: string,
  used: Set<string>,
): Map<string, string> {
  const names = new Map<string, string>();
  const safeSourceName = (value: string): string => {
    const stem = isWindowsReservedBasename(value) ? `Bc${value}` : value;
    return boundedPathComponent(stem, ".tsx").slice(0, -4);
  };
  for (const item of items) {
    const base = `${identifier(item.name, "Item")}${suffix}`;
    let candidate = safeSourceName(base);
    let sequence = 2;
    while (used.has(candidate)) {
      candidate = safeSourceName(`${base}${sequence++}`);
    }
    used.add(candidate);
    names.set(item.id, candidate);
  }
  return names;
}

function reachableComponents(model: ExportModel): DesignComponent[] {
  const byId = new Map(
    model.document.components.map((component) => [component.id, component]),
  );
  const reachable = new Set<string>();
  const visit = (node: DesignNode): void => {
    if (
      node.kind === "component-instance" &&
      !reachable.has(node.componentId)
    ) {
      const component = byId.get(node.componentId);
      if (component !== undefined) {
        reachable.add(component.id);
        visit(component.root);
      }
    }
    for (const child of getNodeChildren(node)) visit(child);
  };
  for (const page of model.pages)
    for (const artboard of page.artboards) visit(artboard.root);
  return model.document.components.filter(({ id }) => reachable.has(id));
}

function buildNames(model: ExportModel, components: DesignComponent[]): Names {
  const used = new Set<string>();
  return {
    components: uniqueNames(components, "", used),
    pages: uniqueNames(model.pages, "Page", used),
  };
}

function jsxText(value: string): string {
  return escapeHtml(value).replaceAll("{", "&#123;").replaceAll("}", "&#125;");
}

function jsxAttributes(node: DesignNode): string {
  const values = [
    `className="bc-node bc-${node.kind}"`,
    `data-bc-node-id="${node.id}"`,
    `data-bc-kind="${node.kind}"`,
    `data-bc-name="${escapeHtml(node.name)}"`,
  ];
  if (!node.visible) values.push("hidden");
  if (node.interactions !== undefined && node.interactions.length > 0) {
    values.push(
      `data-bc-interactions={JSON.stringify(${safeJson(node.interactions)})}`,
    );
  }
  return values.join(" ");
}

function renderChildren(
  nodes: DesignNode[],
  model: ExportModel,
  names: Names,
): string {
  return nodes.map((node) => renderNode(node, model, names)).join("\n");
}

function renderNode(
  node: DesignNode,
  model: ExportModel,
  names: Names,
): string {
  const attrs = jsxAttributes(node);
  switch (node.kind) {
    case "stack":
    case "grid":
      return `<div ${attrs}>${renderChildren(node.children, model, names)}</div>`;
    case "text":
      return `<p ${attrs}>${jsxText(node.text)}</p>`;
    case "image": {
      const sourceKey =
        node.source.type === "asset" ? node.source.assetId : node.source.url;
      const outputPath = model.assets.get(sourceKey)?.outputPath ?? "";
      return `<img ${attrs} src="/${escapeHtml(outputPath)}" alt="${escapeHtml(node.alt)}" />`;
    }
    case "icon": {
      const label = node.label ?? node.name;
      return `<span ${attrs} role="img" aria-label="${escapeHtml(label)}" data-bc-icon="${escapeHtml(node.icon)}">${jsxText(node.icon)}</span>`;
    }
    case "link":
      return `<a ${attrs} href="${escapeHtml(node.href)}">${renderChildren(node.children, model, names)}</a>`;
    case "button":
      return `<button ${attrs} type="${node.buttonType}">${renderChildren(node.children, model, names)}</button>`;
    case "input": {
      const variable =
        node.variable === undefined
          ? ""
          : ` data-bc-variable="${escapeHtml(node.variable)}"`;
      const placeholder =
        node.placeholder === undefined
          ? ""
          : ` placeholder="${escapeHtml(node.placeholder)}"`;
      return `<label className="bc-input-label"><span>${jsxText(node.name)}</span><input ${attrs} type="${node.inputType}" aria-label="${escapeHtml(node.name)}"${variable}${placeholder} /></label>`;
    }
    case "form":
      return `<form ${attrs}>${renderChildren(node.children, model, names)}</form>`;
    case "repeater":
      return `<div ${attrs} data-bc-repeater="${escapeHtml(node.collection)}">${renderChildren(node.children, model, names)}</div>`;
    case "conditional": {
      const expected = escapeHtml(safeJson(node.equals));
      return `<div ${attrs} data-bc-conditional="${escapeHtml(node.variable)}">
<div data-bc-branch="true" data-bc-equals="${expected}">${renderChildren(node.whenTrue, model, names)}</div>
<div data-bc-branch="false" data-bc-equals="${expected}">${renderChildren(node.whenFalse, model, names)}</div>
</div>`;
    }
    case "overlay":
      return `<dialog ${attrs} data-bc-overlay="${node.id}">${renderChildren(node.children, model, names)}</dialog>`;
    case "component-instance": {
      const componentName = names.components.get(node.componentId);
      return componentName === undefined
        ? `<div ${attrs} data-bc-component-id="${node.componentId}" data-bc-instance-id="${node.id}" />`
        : `<div ${attrs} data-bc-component-id="${node.componentId}" data-bc-instance-id="${node.id}"><${componentName} /></div>`;
    }
  }
}

function referencedComponents(node: DesignNode, references: Set<string>): void {
  if (node.kind === "component-instance") references.add(node.componentId);
  for (const child of getNodeChildren(node))
    referencedComponents(child, references);
}

function importsForNodes(
  nodes: DesignNode[],
  model: ExportModel,
  names: Names,
  exclude?: string,
): string {
  const references = new Set<string>();
  for (const node of nodes) referencedComponents(node, references);
  return [...references]
    .filter((id) => id !== exclude)
    .sort((left, right) =>
      compareStable(
        names.components.get(left) ?? "",
        names.components.get(right) ?? "",
      ),
    )
    .map((id) => {
      const name = names.components.get(id);
      const component = model.document.components.find(
        ({ id: candidate }) => candidate === id,
      );
      return name === undefined || component === undefined
        ? ""
        : `import { ${name} } from "../components/${name}.js";`;
    })
    .filter(Boolean)
    .join("\n");
}

function componentFile(
  component: DesignComponent,
  model: ExportModel,
  names: Names,
): GeneratedFile {
  const name =
    names.components.get(component.id) ??
    identifier(component.name, "Component");
  const imports = importsForNodes([component.root], model, names, component.id);
  return {
    path: `src/components/${name}.tsx`,
    content: `${imports}${imports.length > 0 ? "\n\n" : ""}export function ${name}() {
  return (
    ${renderNode(component.root, model, names)}
  );
}
`,
  };
}

function pageFile(
  page: DesignPage,
  model: ExportModel,
  names: Names,
  index: number,
  route: string,
): GeneratedFile {
  const name = names.pages.get(page.id) ?? identifier(page.name, "Page");
  const imports = importsForNodes(
    page.artboards.map(({ root }) => root),
    model,
    names,
  );
  const artboards = page.artboards
    .map(
      (artboard) =>
        `<div data-bc-artboard data-bc-artboard-id="${artboard.id}" data-bc-breakpoint="${escapeHtml(artboard.breakpoint.name)}">${renderNode(artboard.root, model, names)}</div>`,
    )
    .join("\n");
  return {
    path: `src/pages/${name}.tsx`,
    content: `${imports}${imports.length > 0 ? "\n\n" : ""}export function ${name}() {
  return (
    <section data-bc-page data-bc-page-id="${page.id}" data-bc-route="${route}"${index === 0 ? "" : " hidden"}>
      ${artboards}
    </section>
  );
}
`,
  };
}

function packageJson(target: Exclude<ExportTarget, "html">): string {
  const dependencies =
    target === "react"
      ? { react: versions.react, "react-dom": versions.reactDom }
      : { preact: versions.preact };
  const devDependencies =
    target === "react"
      ? {
          "@types/react": versions.reactTypes,
          "@types/react-dom": versions.reactDomTypes,
          typescript: versions.typescript,
          vite: versions.vite,
        }
      : { typescript: versions.typescript, vite: versions.vite };
  return `${JSON.stringify(
    {
      name: "blue-canvas-export",
      private: true,
      version: "1.0.0",
      type: "module",
      scripts: { build: "tsc --noEmit && vite build" },
      dependencies,
      devDependencies,
    },
    null,
    2,
  )}\n`;
}

function tsconfig(target: Exclude<ExportTarget, "html">): string {
  return `${JSON.stringify(
    {
      compilerOptions: {
        target: "ES2022",
        useDefineForClassFields: true,
        lib: ["ES2022", "DOM", "DOM.Iterable"],
        allowJs: false,
        skipLibCheck: true,
        esModuleInterop: true,
        allowSyntheticDefaultImports: true,
        strict: true,
        forceConsistentCasingInFileNames: true,
        module: "ESNext",
        moduleResolution: "Bundler",
        resolveJsonModule: true,
        isolatedModules: true,
        noUncheckedSideEffectImports: false,
        noEmit: true,
        jsx: "react-jsx",
        ...(target === "preact" ? { jsxImportSource: "preact" } : {}),
      },
      include: ["src", "vite.config.ts"],
    },
    null,
    2,
  )}\n`;
}

function appFile(
  model: ExportModel,
  target: Exclude<ExportTarget, "html">,
  names: Names,
): string {
  const hookImport = target === "react" ? "react" : "preact/hooks";
  const imports = model.pages
    .map((page) => {
      const name = names.pages.get(page.id);
      return `import { ${name} } from "./pages/${name}.js";`;
    })
    .join("\n");
  const pages = model.pages
    .map((page) => `<${names.pages.get(page.id)} />`)
    .join("\n      ");
  return `import { useEffect } from "${hookImport}";
${imports}
import { installRuntime } from "./runtime/state.js";

export function App() {
  useEffect(() => installRuntime(), []);
  return (
    <main>
      ${pages}
    </main>
  );
}
`;
}

function mainFile(target: Exclude<ExportTarget, "html">): string {
  return target === "react"
    ? `import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import "./styles/tokens.css";
import "./styles/base.css";

createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);
`
    : `import { render } from "preact";
import { App } from "./App.js";
import "./styles/tokens.css";
import "./styles/base.css";

render(<App />, document.getElementById("root")!);
`;
}

export async function generateFrameworkFiles(
  model: ExportModel,
  target: Exclude<ExportTarget, "html">,
  runtime: string,
  tokenCss: string,
  baseCss: string,
): Promise<GeneratedFile[]> {
  const components = reachableComponents(model);
  const names = buildNames(model, components);
  const routes = uniqueSlugs(
    model.pages.map(({ name }) => name),
    "page",
  );
  const lockFile = await readFile(
    new URL(`../templates/${target}/package-lock.json`, import.meta.url),
    "utf8",
  );
  return [
    { path: "package.json", content: packageJson(target) },
    { path: "package-lock.json", content: lockFile },
    {
      path: "index.html",
      content: `<!doctype html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n  <title>${escapeHtml(model.document.name)}</title>\n</head>\n<body>\n  <div id="root"></div>\n  <script type="module" src="/src/main.tsx"></script>\n</body>\n</html>\n`,
    },
    { path: "tsconfig.json", content: tsconfig(target) },
    {
      path: "vite.config.ts",
      content: `import { defineConfig } from "vite";\n\nexport default defineConfig({ build: { target: "es2022" } });\n`,
    },
    { path: "src/main.tsx", content: mainFile(target) },
    { path: "src/App.tsx", content: appFile(model, target, names) },
    ...components.map((component) => componentFile(component, model, names)),
    ...model.pages.map((page, index) =>
      pageFile(page, model, names, index, routes[index] ?? `page-${index + 1}`),
    ),
    { path: "src/runtime/state.ts", content: runtime },
    { path: "src/styles/tokens.css", content: tokenCss },
    { path: "src/styles/base.css", content: baseCss },
    ...[...model.assets.values()]
      .sort((left, right) => compareStable(left.outputPath, right.outputPath))
      .map(({ outputPath, bytes }) => ({
        path: `public/${outputPath}`,
        bytes,
      })),
  ];
}
