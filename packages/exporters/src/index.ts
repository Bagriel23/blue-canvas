import { generateBaseCss, generateTokenCss } from "./styles.js";
import { generateFrameworkFiles } from "./framework.js";
import { generateFrameworkRuntime } from "./framework-runtime.js";
import { generateStaticHtml } from "./static-html.js";
import { createManifest } from "./manifest.js";
import { createExportModel } from "./model.js";
import { staticRuntime } from "./runtime.js";
import { compareStable, safeJson } from "./safety.js";
import type {
  ExportManifest,
  ExportRequest,
  ExportResult,
  ExportScope,
  ExportTarget,
  GeneratedFile,
} from "./types.js";

export type {
  ExportAsset,
  ExportDiagnostic,
  ExportManifest,
  ExportManifestFile,
  ExportRequest,
  ExportResult,
  ExportScope,
  ExportTarget,
  GeneratedFile,
} from "./types.js";

function emptyManifest(
  target: ExportTarget | null,
  scope: ExportScope | null,
): ExportManifest {
  return {
    schemaVersion: 1,
    target,
    scope,
    files: [],
  };
}

function failure(
  code: string,
  message: string,
  target: ExportTarget | null = null,
  scope: ExportScope | null = null,
): ExportResult {
  return {
    files: [],
    diagnostics: [{ severity: "error", code, message }],
    manifest: emptyManifest(target, scope),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function normalizeRequest(input: ExportRequest): ExportRequest | ExportResult {
  if (!isRecord(input)) {
    return failure("REQUEST_INVALID", "Export request must be an object");
  }
  const target = input.target;
  if (target !== "html" && target !== "react" && target !== "preact") {
    return failure(
      "TARGET_INVALID",
      "Export target must be html, react, or preact",
    );
  }
  const rawScope: unknown = input.scope;
  if (!isRecord(rawScope) || typeof rawScope.type !== "string") {
    return failure("SCOPE_INVALID", "Export scope is malformed", target);
  }
  let scope: ExportScope;
  if (rawScope.type === "project") {
    scope = { type: "project" };
  } else if (rawScope.type === "page" && typeof rawScope.pageId === "string") {
    scope = { type: "page", pageId: rawScope.pageId };
  } else if (
    rawScope.type === "selection" &&
    Array.isArray(rawScope.nodeIds) &&
    rawScope.nodeIds.every((nodeId) => typeof nodeId === "string")
  ) {
    scope = {
      type: "selection",
      nodeIds: [...new Set(rawScope.nodeIds)].sort(compareStable),
    };
  } else {
    return failure("SCOPE_INVALID", "Export scope is malformed", target);
  }
  if (!isRecord(input.assets)) {
    return failure(
      "REQUEST_INVALID",
      "Export assets must be a record",
      target,
      scope,
    );
  }
  for (const asset of Object.values(input.assets)) {
    if (
      !isRecord(asset) ||
      typeof asset.fileName !== "string" ||
      !(asset.bytes instanceof Uint8Array) ||
      (asset.mimeType !== undefined && typeof asset.mimeType !== "string")
    ) {
      return failure(
        "REQUEST_INVALID",
        "Export asset entry is malformed",
        target,
        scope,
      );
    }
  }
  return {
    document: input.document,
    target,
    scope,
    assets: input.assets,
  };
}

export async function generateExport(
  request: ExportRequest,
): Promise<ExportResult> {
  const normalized = normalizeRequest(request);
  if ("files" in normalized) return normalized;
  const prepared = await createExportModel(normalized);
  if (prepared.model === undefined) {
    return {
      files: [],
      diagnostics: prepared.diagnostics,
      manifest: emptyManifest(normalized.target, normalized.scope),
    };
  }
  const tokenCss = generateTokenCss(prepared.model.document);
  const baseCss = generateBaseCss(prepared.model);
  const files: GeneratedFile[] =
    normalized.target === "html"
      ? [
          { path: "index.html", content: generateStaticHtml(prepared.model) },
          { path: "styles/tokens.css", content: tokenCss },
          { path: "styles/base.css", content: baseCss },
          { path: "scripts/runtime.js", content: staticRuntime },
          ...[...prepared.model.assets.values()]
            .sort((left, right) =>
              compareStable(left.outputPath, right.outputPath),
            )
            .map(({ outputPath, bytes }) => ({ path: outputPath, bytes })),
        ]
      : await generateFrameworkFiles(
          prepared.model,
          normalized.target,
          generateFrameworkRuntime(
            Object.fromEntries(
              Object.entries(prepared.model.document.variables).map(
                ([name, definition]) => [name, definition.value],
              ),
            ),
          ),
          tokenCss,
          baseCss,
        );
  const manifest = createManifest(normalized.target, normalized.scope, files);
  files.push({
    path: "export-manifest.json",
    content: `${safeJson(manifest)}\n`,
  });
  return { files, diagnostics: prepared.diagnostics, manifest };
}
