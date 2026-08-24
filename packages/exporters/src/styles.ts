import {
  getNodeChildren,
  type DesignDocument,
  type DesignNode,
  type GridTrack,
  type NodeStyle,
  type TokenDefinition,
} from "@blue-canvas/document";

import { compareStable, slug } from "./safety.js";
import type { ExportModel } from "./model.js";

type Dimension = number | { token: string };

function tokenName(name: string): string {
  return `--bc-${slug(name, "token")}`;
}

function tokenValue(token: TokenDefinition): string {
  if (typeof token.value === "boolean") return token.value ? "1" : "0";
  if (typeof token.value === "number") {
    return token.type === "dimension"
      ? `${token.value}px`
      : String(token.value);
  }
  return token.type === "string" ? `"${token.value}"` : token.value;
}

function dimension(value: Dimension): string {
  return typeof value === "number"
    ? `${value}px`
    : `var(${tokenName(value.token)})`;
}

function primitive(value: string | number | { token: string }): string {
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return value;
  return `var(${tokenName(value.token)})`;
}

function edges(value: NodeStyle["padding"]): string {
  if (value === undefined) return "";
  if (typeof value === "number" || "token" in value) return dimension(value);
  const zero = "0px";
  return [value.top, value.right, value.bottom, value.left]
    .map((edge) => (edge === undefined ? zero : dimension(edge)))
    .join(" ");
}

function declarations(node: DesignNode): string[] {
  const output: string[] = [];
  const style = node.style;
  const add = (property: string, value: string | undefined): void => {
    if (value !== undefined && value !== "")
      output.push(`  ${property}: ${value};`);
  };
  add(
    "background",
    style.background === undefined ? undefined : primitive(style.background),
  );
  add("color", style.color === undefined ? undefined : primitive(style.color));
  add(
    "border-color",
    style.borderColor === undefined ? undefined : primitive(style.borderColor),
  );
  add(
    "border-width",
    style.borderWidth === undefined ? undefined : dimension(style.borderWidth),
  );
  if (style.borderWidth !== undefined) add("border-style", "solid");
  add(
    "border-radius",
    style.borderRadius === undefined
      ? undefined
      : dimension(style.borderRadius),
  );
  for (const [property, value] of [
    ["width", style.width],
    ["height", style.height],
    ["min-width", style.minWidth],
    ["max-width", style.maxWidth],
    ["min-height", style.minHeight],
    ["max-height", style.maxHeight],
    ["font-size", style.fontSize],
  ] as const) {
    add(property, value === undefined ? undefined : dimension(value));
  }
  add("padding", edges(style.padding));
  add("margin", edges(style.margin));
  add(
    "opacity",
    style.opacity === undefined ? undefined : String(style.opacity),
  );
  add(
    "font-family",
    style.fontFamily === undefined ? undefined : primitive(style.fontFamily),
  );
  add(
    "font-weight",
    style.fontWeight === undefined ? undefined : primitive(style.fontWeight),
  );
  add(
    "line-height",
    style.lineHeight === undefined ? undefined : primitive(style.lineHeight),
  );
  add("text-align", style.textAlign);

  if (node.kind === "stack") {
    add("display", "flex");
    add("flex-direction", node.layout.direction);
    add("gap", dimension(node.layout.gap));
    add("align-items", node.layout.align);
    add("justify-content", node.layout.justify);
    add("flex-wrap", node.layout.wrap);
  }
  if (node.kind === "grid") {
    const tracks = (values: GridTrack[]): string =>
      values
        .map((track) => {
          if (track.type === "auto") return "auto";
          if (track.type === "fraction") return `${track.value}fr`;
          return dimension(track.value);
        })
        .join(" ");
    add("display", "grid");
    add("grid-template-columns", tracks(node.layout.columns));
    add("grid-template-rows", tracks(node.layout.rows));
    add("gap", dimension(node.layout.gap));
    add("align-items", node.layout.align);
    add("justify-items", node.layout.justify);
  }
  return output;
}

function collectNodes(
  document: DesignDocument,
  model: ExportModel,
): DesignNode[] {
  const nodes: DesignNode[] = [];
  const visitedComponents = new Set<string>();
  const componentById = new Map(
    document.components.map((component) => [component.id, component]),
  );
  const visit = (node: DesignNode): void => {
    nodes.push(node);
    if (
      node.kind === "component-instance" &&
      !visitedComponents.has(node.componentId)
    ) {
      const component = componentById.get(node.componentId);
      if (component !== undefined) {
        visitedComponents.add(node.componentId);
        visit(component.root);
      }
    }
    for (const child of getNodeChildren(node)) visit(child);
  };
  for (const page of model.pages)
    for (const artboard of page.artboards) visit(artboard.root);
  return nodes;
}

export function generateTokenCss(document: DesignDocument): string {
  const definitions = Object.entries(document.tokens)
    .sort(([left], [right]) => compareStable(left, right))
    .map(([name, token]) => `  ${tokenName(name)}: ${tokenValue(token)};`)
    .join("\n");
  return `:root {\n${definitions}${definitions.length > 0 ? "\n" : ""}}\n`;
}

export function generateBaseCss(model: ExportModel): string {
  const rules = [
    "*, *::before, *::after { box-sizing: border-box; }",
    "html, body { margin: 0; min-height: 100%; }",
    "body { font-family: system-ui, sans-serif; }",
    "[hidden] { display: none !important; }",
    "img { display: block; max-width: 100%; }",
    "[data-bc-page] { min-height: 100vh; }",
    "[data-bc-artboard] { display: none; width: 100%; min-height: 100vh; }",
    "[data-bc-overlay] { border: 0; padding: 0; }",
  ];
  for (const node of collectNodes(model.document, model)) {
    const values = declarations(node);
    if (values.length > 0) {
      rules.push(`[data-bc-node-id="${node.id}"] {\n${values.join("\n")}\n}`);
    }
  }
  for (const page of model.pages) {
    for (const artboard of page.artboards) {
      const parts = [`(min-width: ${artboard.breakpoint.minWidth}px)`];
      if (artboard.breakpoint.maxWidth !== undefined) {
        parts.push(`(max-width: ${artboard.breakpoint.maxWidth}px)`);
      }
      rules.push(
        `@media ${parts.join(" and ")} {\n  [data-bc-artboard-id="${artboard.id}"] { display: block; }\n}`,
      );
    }
  }
  return `${rules.join("\n\n")}\n`;
}
