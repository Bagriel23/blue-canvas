import type {
  DesignComponent,
  DesignNode,
  Interaction,
} from "@blue-canvas/document";

import type { ExportModel } from "./model.js";
import { escapeHtml, safeJson, uniqueSlugs } from "./safety.js";

interface RenderContext {
  model: ExportModel;
  components: ReadonlyMap<string, DesignComponent>;
  activeComponents: Set<string>;
}

function attributes(node: DesignNode): string {
  const values = [
    `class="bc-node bc-${escapeHtml(node.kind)}"`,
    `data-bc-node-id="${node.id}"`,
    `data-bc-kind="${node.kind}"`,
    `data-bc-name="${escapeHtml(node.name)}"`,
  ];
  if (!node.visible) values.push("hidden");
  if (node.interactions !== undefined && node.interactions.length > 0) {
    values.push(
      `data-bc-interactions="${escapeHtml(safeJson(node.interactions))}"`,
    );
  }
  return values.join(" ");
}

function children(nodes: DesignNode[], context: RenderContext): string {
  return nodes.map((node) => renderNode(node, context)).join("\n");
}

function imageSource(
  node: Extract<DesignNode, { kind: "image" }>,
  model: ExportModel,
): string {
  const key =
    node.source.type === "asset" ? node.source.assetId : node.source.url;
  return model.assets.get(key)?.outputPath ?? "";
}

function renderConditional(
  node: Extract<DesignNode, { kind: "conditional" }>,
  context: RenderContext,
): string {
  const expected = escapeHtml(safeJson(node.equals));
  return `<div ${attributes(node)} data-bc-conditional="${escapeHtml(node.variable)}">
<div data-bc-branch="true" data-bc-equals="${expected}">${children(node.whenTrue, context)}</div>
<div data-bc-branch="false" data-bc-equals="${expected}">${children(node.whenFalse, context)}</div>
</div>`;
}

function renderNode(node: DesignNode, context: RenderContext): string {
  const attrs = attributes(node);
  switch (node.kind) {
    case "stack":
    case "grid":
      return `<div ${attrs}>${children(node.children, context)}</div>`;
    case "text":
      return `<p ${attrs}>${escapeHtml(node.text)}</p>`;
    case "image":
      return `<img ${attrs} src="${escapeHtml(imageSource(node, context.model))}" alt="${escapeHtml(node.alt)}">`;
    case "icon": {
      const label = node.label ?? node.name;
      return `<span ${attrs} role="img" aria-label="${escapeHtml(label)}" data-bc-icon="${escapeHtml(node.icon)}">${escapeHtml(node.icon)}</span>`;
    }
    case "link":
      return `<a ${attrs} href="${escapeHtml(node.href)}">${children(node.children, context)}</a>`;
    case "button":
      return `<button ${attrs} type="${node.buttonType}">${children(node.children, context)}</button>`;
    case "input": {
      const variable =
        node.variable === undefined
          ? ""
          : ` data-bc-variable="${escapeHtml(node.variable)}"`;
      const placeholder =
        node.placeholder === undefined
          ? ""
          : ` placeholder="${escapeHtml(node.placeholder)}"`;
      return `<label class="bc-input-label"><span>${escapeHtml(node.name)}</span><input ${attrs} type="${node.inputType}" aria-label="${escapeHtml(node.name)}"${variable}${placeholder}></label>`;
    }
    case "form":
      return `<form ${attrs}>${children(node.children, context)}</form>`;
    case "repeater":
      return `<div ${attrs} data-bc-repeater="${escapeHtml(node.collection)}">${children(node.children, context)}</div>`;
    case "conditional":
      return renderConditional(node, context);
    case "overlay":
      return `<dialog ${attrs} data-bc-overlay="${node.id}">${children(node.children, context)}</dialog>`;
    case "component-instance": {
      const component = context.components.get(node.componentId);
      if (
        component === undefined ||
        context.activeComponents.has(component.id)
      ) {
        return `<div ${attrs} data-bc-component-id="${node.componentId}"></div>`;
      }
      context.activeComponents.add(component.id);
      const rendered = renderNode(component.root, context);
      context.activeComponents.delete(component.id);
      return `<div ${attrs} data-bc-component-id="${component.id}" data-bc-component-name="${escapeHtml(component.name)}">${rendered}</div>`;
    }
  }
}

export function generateStaticHtml(model: ExportModel): string {
  const context: RenderContext = {
    model,
    components: new Map(
      model.document.components.map((component) => [component.id, component]),
    ),
    activeComponents: new Set(),
  };
  const routes = uniqueSlugs(
    model.pages.map(({ name }) => name),
    "page",
  );
  const pages = model.pages
    .map((page, pageIndex) => {
      const route = routes[pageIndex] ?? `page-${pageIndex + 1}`;
      const artboards = page.artboards
        .map(
          (artboard) =>
            `<div data-bc-artboard data-bc-artboard-id="${artboard.id}" data-bc-breakpoint="${escapeHtml(artboard.breakpoint.name)}">${renderNode(artboard.root, context)}</div>`,
        )
        .join("\n");
      return `<section data-bc-page data-bc-page-id="${page.id}" data-bc-route="${route}"${pageIndex === 0 ? "" : " hidden"}>${artboards}</section>`;
    })
    .join("\n");
  const variables = Object.fromEntries(
    Object.entries(model.document.variables).map(([name, definition]) => [
      name,
      definition.value,
    ]),
  );
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(model.document.name)}</title>
  <link rel="stylesheet" href="styles/tokens.css">
  <link rel="stylesheet" href="styles/base.css">
  <script type="application/json" id="bc-initial-state">${safeJson(variables)}</script>
  <script src="scripts/runtime.js" defer></script>
</head>
<body>
<main>${pages}</main>
</body>
</html>
`;
}

export function interactionsForReact(
  interactions: Interaction[] | undefined,
): string | undefined {
  return interactions === undefined || interactions.length === 0
    ? undefined
    : safeJson(interactions);
}
