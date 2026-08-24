import {
  designDocumentSchema,
  getNodeChildren,
  type Artboard,
  type DesignDocument,
  type DesignNode,
  type DesignPage,
} from "@blue-canvas/document";

import {
  assetOutputName,
  compareStable,
  isUnsafeCssValue,
  isUnsafeNavigation,
  slug,
} from "./safety.js";
import type {
  ExportAsset,
  ExportDiagnostic,
  ExportRequest,
  ExportScope,
} from "./types.js";

export interface ResolvedAsset extends ExportAsset {
  sourceKey: string;
  outputPath: string;
}

export interface ExportModel {
  document: DesignDocument;
  pages: DesignPage[];
  assets: Map<string, ResolvedAsset>;
}

function visitNodes(node: DesignNode, visit: (node: DesignNode) => void): void {
  visit(node);
  for (const child of getNodeChildren(node)) visitNodes(child, visit);
}

function allPageNodes(document: DesignDocument): DesignNode[] {
  const nodes: DesignNode[] = [];
  for (const page of document.pages) {
    for (const artboard of page.artboards)
      visitNodes(artboard.root, (node) => nodes.push(node));
  }
  return nodes;
}

function rawUnsafeNavigation(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = rawUnsafeNavigation(item);
      if (found !== undefined) return found;
    }
    return undefined;
  }
  if (value === null || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  if (typeof record.href === "string" && isUnsafeNavigation(record.href))
    return record.href;
  if (
    record.type === "navigate" &&
    typeof record.url === "string" &&
    isUnsafeNavigation(record.url)
  ) {
    return record.url;
  }
  for (const item of Object.values(record)) {
    const found = rawUnsafeNavigation(item);
    if (found !== undefined) return found;
  }
  return undefined;
}

function selectNode(
  node: DesignNode,
  selected: ReadonlySet<string>,
): DesignNode | undefined {
  if (selected.has(node.id)) return node;
  switch (node.kind) {
    case "stack":
    case "grid":
    case "link":
    case "button":
    case "form":
    case "repeater":
    case "overlay": {
      const children = node.children
        .map((child) => selectNode(child, selected))
        .filter((child): child is DesignNode => child !== undefined);
      return children.length === 0 ? undefined : { ...node, children };
    }
    case "conditional": {
      const whenTrue = node.whenTrue
        .map((child) => selectNode(child, selected))
        .filter((child): child is DesignNode => child !== undefined);
      const whenFalse = node.whenFalse
        .map((child) => selectNode(child, selected))
        .filter((child): child is DesignNode => child !== undefined);
      return whenTrue.length + whenFalse.length === 0
        ? undefined
        : { ...node, whenTrue, whenFalse };
    }
    default:
      return undefined;
  }
}

function scopedPages(
  document: DesignDocument,
  scope: ExportScope,
  diagnostics: ExportDiagnostic[],
): DesignPage[] {
  if (scope.type === "project") return document.pages;
  if (scope.type === "page") {
    const page = document.pages.find(({ id }) => id === scope.pageId);
    if (page !== undefined) return [page];
    diagnostics.push({
      severity: "error",
      code: "SCOPE_INVALID",
      message: `Page scope does not exist: ${scope.pageId}`,
    });
    return [];
  }
  const selected = new Set(scope.nodeIds);
  const known = new Set(allPageNodes(document).map(({ id }) => id));
  const missing = [...selected].filter((id) => !known.has(id));
  if (scope.nodeIds.length === 0 || missing.length > 0) {
    diagnostics.push({
      severity: "error",
      code: "SCOPE_INVALID",
      message:
        scope.nodeIds.length === 0
          ? "Selection scope requires at least one node"
          : `Selection nodes do not exist: ${missing.join(", ")}`,
    });
    return [];
  }
  return document.pages
    .map((page): DesignPage => ({
      ...page,
      artboards: page.artboards
        .map((artboard): Artboard | undefined => {
          const root = selectNode(artboard.root, selected);
          return root === undefined ? undefined : { ...artboard, root };
        })
        .filter((artboard): artboard is Artboard => artboard !== undefined),
    }))
    .filter(({ artboards }) => artboards.length > 0);
}

function validateCss(
  document: DesignDocument,
  diagnostics: ExportDiagnostic[],
): void {
  const normalizedNames = new Map<string, string>();
  for (const [name, token] of Object.entries(document.tokens).sort(
    ([left], [right]) => compareStable(left, right),
  )) {
    const normalized = slug(name, "token");
    const existing = normalizedNames.get(normalized);
    if (existing !== undefined) {
      diagnostics.push({
        severity: "error",
        code: "CSS_IDENTIFIER_COLLISION",
        message: `Tokens "${existing}" and "${name}" normalize to the same CSS identifier`,
      });
    } else {
      normalizedNames.set(normalized, name);
    }
    if (typeof token.value === "string" && isUnsafeCssValue(token.value)) {
      diagnostics.push({
        severity: "error",
        code: "CSS_UNSAFE",
        message: `Token "${name}" contains unsafe CSS`,
      });
    }
  }
  const inspect = (node: DesignNode): void => {
    for (const value of Object.values(node.style)) {
      if (typeof value === "string" && isUnsafeCssValue(value)) {
        diagnostics.push({
          severity: "error",
          code: "CSS_UNSAFE",
          nodeId: node.id,
          message: `Node "${node.name}" contains unsafe CSS`,
        });
      }
    }
  };
  for (const node of allPageNodes(document)) inspect(node);
  for (const component of document.components)
    visitNodes(component.root, inspect);
}

function validateScopeReferences(
  document: DesignDocument,
  pages: DesignPage[],
  scope: ExportScope,
  diagnostics: ExportDiagnostic[],
): void {
  if (scope.type === "project") return;
  const nodes: DesignNode[] = [];
  const components = new Map(
    document.components.map((component) => [component.id, component]),
  );
  const visitedComponents = new Set<string>();
  const visit = (node: DesignNode): void => {
    nodes.push(node);
    if (
      node.kind === "component-instance" &&
      !visitedComponents.has(node.componentId)
    ) {
      const component = components.get(node.componentId);
      if (component !== undefined) {
        visitedComponents.add(component.id);
        visit(component.root);
      }
    }
    for (const child of getNodeChildren(node)) visit(child);
  };
  for (const page of pages) {
    for (const artboard of page.artboards) visit(artboard.root);
  }

  const pageIds = new Set(pages.map(({ id }) => id));
  const overlayIds = new Set(
    nodes.filter(({ kind }) => kind === "overlay").map(({ id }) => id),
  );
  for (const node of nodes) {
    for (const interaction of node.interactions ?? []) {
      const action = interaction.action;
      const missing =
        action.type === "navigate" && action.pageId !== undefined
          ? !pageIds.has(action.pageId)
          : action.type === "open-overlay"
            ? !overlayIds.has(action.overlayId)
            : false;
      if (missing) {
        diagnostics.push({
          severity: "error",
          code: "SCOPE_REFERENCE_MISSING",
          nodeId: node.id,
          message: `Interaction on "${node.name}" targets content outside the export scope`,
        });
      }
    }
  }
}

function validateNodes(
  document: DesignDocument,
  pages: DesignPage[],
  providedAssets: Readonly<Record<string, ExportAsset>>,
  diagnostics: ExportDiagnostic[],
): Map<string, ResolvedAsset> {
  const resolved = new Map<string, ResolvedAsset>();
  const paths = new Set<string>();
  const componentById = new Map(
    document.components.map((component) => [component.id, component]),
  );
  const activeComponents = new Set<string>();

  const addAsset = (sourceKey: string, node: DesignNode): void => {
    if (resolved.has(sourceKey)) return;
    const asset = providedAssets[sourceKey];
    if (asset === undefined) {
      diagnostics.push({
        severity: "error",
        code: sourceKey.startsWith("http")
          ? "ASSET_REMOTE_UNSUPPORTED"
          : "ASSET_MISSING",
        nodeId: node.id,
        message: sourceKey.startsWith("http")
          ? `Remote image must be converted to a provided local asset: ${sourceKey}`
          : `Local asset is missing: ${sourceKey}`,
      });
      return;
    }
    const outputName = assetOutputName(asset.fileName);
    if (outputName === undefined) {
      diagnostics.push({
        severity: "error",
        code: "ASSET_PATH_UNSAFE",
        nodeId: node.id,
        message: `Asset path is unsafe: ${asset.fileName}`,
      });
      return;
    }
    const outputPath = `assets/${outputName}`;
    if (paths.has(outputPath)) {
      diagnostics.push({
        severity: "error",
        code: "ASSET_PATH_COLLISION",
        nodeId: node.id,
        message: `Multiple assets normalize to ${outputPath}`,
      });
      return;
    }
    paths.add(outputPath);
    resolved.set(sourceKey, { ...asset, sourceKey, outputPath });
  };

  const inspect = (node: DesignNode): void => {
    if (node.kind === "image") {
      if (node.alt.trim().length === 0) {
        diagnostics.push({
          severity: "warning",
          code: "IMAGE_ALT_MISSING",
          nodeId: node.id,
          message: `Image "${node.name}" needs alternative text`,
        });
      }
      addAsset(
        node.source.type === "asset" ? node.source.assetId : node.source.url,
        node,
      );
    }
    if (node.kind === "component-instance") {
      const component = componentById.get(node.componentId);
      if (component === undefined || activeComponents.has(component.id)) return;
      activeComponents.add(component.id);
      visitNodes(component.root, inspect);
      activeComponents.delete(component.id);
    }
  };
  for (const page of pages) {
    for (const artboard of page.artboards) visitNodes(artboard.root, inspect);
  }
  return resolved;
}

export function createExportModel(request: ExportRequest): {
  model?: ExportModel;
  diagnostics: ExportDiagnostic[];
} {
  const diagnostics: ExportDiagnostic[] = [];
  const unsafeNavigation = rawUnsafeNavigation(request.document);
  if (unsafeNavigation !== undefined) {
    diagnostics.push({
      severity: "error",
      code: "NAVIGATION_UNSAFE",
      message: `Navigation target is unsafe: ${unsafeNavigation}`,
    });
  }
  const parsed = designDocumentSchema.safeParse(request.document);
  if (!parsed.success) {
    diagnostics.push({
      severity: "error",
      code: "DOCUMENT_INVALID",
      message: `Document validation failed: ${parsed.error.issues[0]?.message ?? "unknown error"}`,
    });
    return { diagnostics };
  }
  validateCss(parsed.data, diagnostics);
  const pages = scopedPages(parsed.data, request.scope, diagnostics);
  validateScopeReferences(parsed.data, pages, request.scope, diagnostics);
  const assets = validateNodes(parsed.data, pages, request.assets, diagnostics);
  if (diagnostics.some(({ severity }) => severity === "error"))
    return { diagnostics };
  return { model: { document: parsed.data, pages, assets }, diagnostics };
}
