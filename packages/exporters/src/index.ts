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

function emptyManifest(request: ExportRequest): ExportManifest {
  return {
    schemaVersion: 1,
    target: request.target,
    scope: request.scope,
    files: [],
  };
}

export async function generateExport(
  request: ExportRequest,
): Promise<ExportResult> {
  const prepared = createExportModel(request);
  if (prepared.model === undefined) {
    return {
      files: [],
      diagnostics: prepared.diagnostics,
      manifest: emptyManifest(request),
    };
  }
  const tokenCss = generateTokenCss(prepared.model.document);
  const baseCss = generateBaseCss(prepared.model);
  const files: GeneratedFile[] =
    request.target === "html"
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
      : generateFrameworkFiles(
          prepared.model,
          request.target,
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
  const manifest = createManifest(request.target, request.scope, files);
  files.push({
    path: "export-manifest.json",
    content: `${safeJson(manifest)}\n`,
  });
  return { files, diagnostics: prepared.diagnostics, manifest };
}
