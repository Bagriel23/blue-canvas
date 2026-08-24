import type { DesignDocument } from "@blue-canvas/document";

export type ExportTarget = "html" | "react" | "preact";

export type ExportScope =
  | { type: "project" }
  | { type: "page"; pageId: string }
  | { type: "selection"; nodeIds: string[] };

export interface ExportAsset {
  fileName: string;
  bytes: Uint8Array;
  mimeType?: string | undefined;
}

export interface ExportRequest {
  document: DesignDocument;
  target: ExportTarget;
  scope: ExportScope;
  assets: Readonly<Record<string, ExportAsset>>;
}

export type GeneratedFile =
  { path: string; content: string } | { path: string; bytes: Uint8Array };

export interface ExportDiagnostic {
  severity: "error" | "warning";
  code: string;
  nodeId?: string | undefined;
  message: string;
}

export interface ExportManifestFile {
  path: string;
  mediaType: string;
  bytes: number;
  sha256: string;
}

export interface ExportManifest {
  schemaVersion: 1;
  target: ExportTarget;
  scope: ExportScope;
  files: ExportManifestFile[];
}

export interface ExportResult {
  files: GeneratedFile[];
  diagnostics: ExportDiagnostic[];
  manifest: ExportManifest;
}
