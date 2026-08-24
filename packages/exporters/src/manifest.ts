import { createHash } from "node:crypto";

import type {
  ExportManifest,
  ExportScope,
  ExportTarget,
  GeneratedFile,
} from "./types.js";

function bytesOf(file: GeneratedFile): Uint8Array {
  return "content" in file
    ? new TextEncoder().encode(file.content)
    : file.bytes;
}

function mediaType(path: string): string {
  const extension = path.split(".").at(-1)?.toLowerCase();
  return (
    {
      css: "text/css",
      html: "text/html",
      js: "text/javascript",
      json: "application/json",
      jpeg: "image/jpeg",
      jpg: "image/jpeg",
      jsx: "text/javascript",
      png: "image/png",
      svg: "image/svg+xml",
      ts: "text/typescript",
      tsx: "text/typescript",
      webp: "image/webp",
    }[extension ?? ""] ?? "application/octet-stream"
  );
}

export function createManifest(
  target: ExportTarget,
  scope: ExportScope,
  files: GeneratedFile[],
): ExportManifest {
  return {
    schemaVersion: 1,
    target,
    scope,
    files: files.map((file) => {
      const bytes = bytesOf(file);
      return {
        path: file.path,
        mediaType: mediaType(file.path),
        bytes: bytes.byteLength,
        sha256: createHash("sha256").update(bytes).digest("hex"),
      };
    }),
  };
}
