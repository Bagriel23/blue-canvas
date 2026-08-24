import type { RefinementCtx } from "zod";

import { getNodeChildren, type DesignNode } from "./nodes.js";
import type { DesignDocument } from "./schema.js";
import type { TokenDefinition } from "./values.js";

interface Reference {
  target: string;
  path: PropertyKey[];
  expectedTypes?: TokenDefinition["type"][] | undefined;
}

function typedTokenReferences(
  node: DesignNode,
  path: PropertyKey[],
): Reference[] {
  const references: Reference[] = [];
  const add = (
    value: unknown,
    valuePath: PropertyKey[],
    expectedTypes: TokenDefinition["type"][],
  ): void => {
    references.push(
      ...tokenReferences(value, valuePath).map((reference) => ({
        ...reference,
        expectedTypes,
      })),
    );
  };

  const style = node.style as Record<string, unknown>;
  for (const key of ["background", "color", "borderColor"]) {
    add(style[key], [...path, "style", key], ["color"]);
  }
  for (const key of [
    "borderWidth",
    "borderRadius",
    "width",
    "height",
    "minWidth",
    "maxWidth",
    "minHeight",
    "maxHeight",
    "padding",
    "margin",
    "fontSize",
  ]) {
    add(style[key], [...path, "style", key], ["dimension"]);
  }
  add(style.fontFamily, [...path, "style", "fontFamily"], ["font-family"]);
  add(style.fontWeight, [...path, "style", "fontWeight"], ["font-weight"]);
  add(
    style.lineHeight,
    [...path, "style", "lineHeight"],
    ["dimension", "number"],
  );

  if (node.kind === "stack") {
    add(node.layout.gap, [...path, "layout", "gap"], ["dimension"]);
  }
  if (node.kind === "grid") {
    add(node.layout.gap, [...path, "layout", "gap"], ["dimension"]);
    for (const [axis, tracks] of [
      ["columns", node.layout.columns],
      ["rows", node.layout.rows],
    ] as const) {
      for (const [index, track] of tracks.entries()) {
        if (track.type === "fixed") {
          add(
            track.value,
            [...path, "layout", axis, index, "value"],
            ["dimension"],
          );
        }
      }
    }
  }
  return references;
}

function tokenReferences(
  value: unknown,
  path: PropertyKey[] = [],
): Reference[] {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) =>
      tokenReferences(item, [...path, index]),
    );
  }
  if (value === null || typeof value !== "object") return [];

  const record = value as Record<string, unknown>;
  const current =
    typeof record.token === "string"
      ? [{ target: record.token, path: [...path, "token"] }]
      : [];

  return [
    ...current,
    ...Object.entries(record).flatMap(([key, item]) =>
      tokenReferences(item, [...path, key]),
    ),
  ];
}

export function validateDocumentReferences(
  document: DesignDocument,
  context: RefinementCtx,
): void {
  const ids = new Set<string>();
  const componentIds = new Set(document.components.map(({ id }) => id));
  const pageIds = new Set(document.pages.map(({ id }) => id));
  const overlayIds = new Set<string>();
  const componentReferences: Reference[] = [];
  const overlayReferences: Reference[] = [];
  const pageReferences: Reference[] = [];
  const referencesToTokens: Reference[] = [];

  const addId = (id: string, path: PropertyKey[]): void => {
    if (ids.has(id)) {
      context.addIssue({
        code: "custom",
        message: `Duplicate id: ${id}`,
        path,
      });
    }
    ids.add(id);
  };

  const visitNode = (node: DesignNode, path: PropertyKey[]): void => {
    addId(node.id, [...path, "id"]);
    if (node.kind === "overlay") overlayIds.add(node.id);
    if (node.kind === "component-instance") {
      componentReferences.push({
        target: node.componentId,
        path: [...path, "componentId"],
      });
    }

    for (const [index, interaction] of (node.interactions ?? []).entries()) {
      const actionPath = [...path, "interactions", index, "action"];
      if (interaction.action.type === "open-overlay") {
        overlayReferences.push({
          target: interaction.action.overlayId,
          path: [...actionPath, "overlayId"],
        });
      }
      if (
        interaction.action.type === "navigate" &&
        interaction.action.pageId !== undefined
      ) {
        pageReferences.push({
          target: interaction.action.pageId,
          path: [...actionPath, "pageId"],
        });
      }
    }

    referencesToTokens.push(...typedTokenReferences(node, path));
    for (const [index, child] of getNodeChildren(node).entries()) {
      visitNode(child, [...path, "children", index]);
    }
  };

  for (const [componentIndex, component] of document.components.entries()) {
    const path = ["components", componentIndex];
    addId(component.id, [...path, "id"]);
    visitNode(component.root, [...path, "root"]);
  }
  for (const [pageIndex, page] of document.pages.entries()) {
    const pagePath = ["pages", pageIndex];
    addId(page.id, [...pagePath, "id"]);
    for (const [artboardIndex, artboard] of page.artboards.entries()) {
      const path = [...pagePath, "artboards", artboardIndex];
      addId(artboard.id, [...path, "id"]);
      visitNode(artboard.root, [...path, "root"]);
    }
  }

  const checkReferences = (
    references: Reference[],
    targets: ReadonlySet<string>,
    kind: string,
  ): void => {
    for (const reference of references) {
      if (!targets.has(reference.target)) {
        context.addIssue({
          code: "custom",
          message: `Dangling ${kind} reference: ${reference.target}`,
          path: reference.path,
        });
      }
    }
  };

  checkReferences(componentReferences, componentIds, "component");
  checkReferences(overlayReferences, overlayIds, "overlay");
  checkReferences(pageReferences, pageIds, "page");
  checkReferences(
    referencesToTokens,
    new Set(Object.keys(document.tokens)),
    "token",
  );
  for (const reference of referencesToTokens) {
    const token = document.tokens[reference.target];
    if (
      token !== undefined &&
      reference.expectedTypes !== undefined &&
      !reference.expectedTypes.includes(token.type)
    ) {
      context.addIssue({
        code: "custom",
        message: `Token type mismatch for ${reference.target}: expected ${reference.expectedTypes.join(" or ")}, received ${token.type}`,
        path: reference.path,
      });
    }
  }
}
