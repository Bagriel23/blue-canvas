import { parseFragment, serialize, type DefaultTreeAdapterMap } from "parse5";
import sharp from "sharp";

import {
  assetOutputName,
  hasExternalReference,
  isWindowsReservedBasename,
} from "./safety.js";
import type { ExportAsset } from "./types.js";

type ChildNode = DefaultTreeAdapterMap["childNode"];
type Element = DefaultTreeAdapterMap["element"];

export interface ValidatedAsset {
  bytes: Uint8Array;
  outputName: string;
}

export interface AssetValidationError {
  code:
    | "ASSET_INVALID"
    | "ASSET_MIME_UNSUPPORTED"
    | "ASSET_PATH_UNSAFE"
    | "ASSET_LIMIT_EXCEEDED"
    | "BROKEN_ASSET";
  message: string;
}

const supportedExtensions: Readonly<Record<string, readonly string[]>> = {
  "image/jpeg": ["jpg", "jpeg"],
  "image/png": ["png"],
  "image/svg+xml": ["svg"],
  "image/webp": ["webp"],
};

export const maxEncodedAssetBytes = 25 * 1024 * 1024;
export const maxSvgAssetBytes = 1024 * 1024;
const maxRasterDimension = 8192;
const maxRasterPixels = 16_000_000;

type RasterFormat = "jpeg" | "png" | "webp";

async function validRaster(
  bytes: Uint8Array,
  expectedFormat: RasterFormat,
): Promise<"valid" | "broken" | "limit"> {
  try {
    const image = sharp(bytes, {
      failOn: "error",
      limitInputPixels: 100_000_000,
    });
    const metadata = await image.metadata();
    if (
      metadata.format !== expectedFormat ||
      metadata.width === undefined ||
      metadata.height === undefined ||
      metadata.width === 0 ||
      metadata.height === 0
    ) {
      return "broken";
    }
    if (
      metadata.width > maxRasterDimension ||
      metadata.height > maxRasterDimension ||
      metadata.width * metadata.height > maxRasterPixels
    ) {
      return "limit";
    }
    const decoded = await image.clone().raw().toBuffer();
    return decoded.byteLength > 0 ? "valid" : "broken";
  } catch {
    return "broken";
  }
}

const svgTags = new Set([
  "circle",
  "clippath",
  "defs",
  "desc",
  "ellipse",
  "g",
  "lineargradient",
  "line",
  "mask",
  "path",
  "polygon",
  "polyline",
  "radialgradient",
  "rect",
  "stop",
  "svg",
  "title",
]);

const svgAttributes = new Set([
  "class",
  "clip-path",
  "cx",
  "cy",
  "d",
  "fill",
  "fill-opacity",
  "fill-rule",
  "fx",
  "fy",
  "gradienttransform",
  "gradientunits",
  "height",
  "id",
  "mask",
  "offset",
  "opacity",
  "points",
  "preserveaspectratio",
  "r",
  "rx",
  "ry",
  "spreadmethod",
  "stop-color",
  "stop-opacity",
  "stroke",
  "stroke-dasharray",
  "stroke-linecap",
  "stroke-linejoin",
  "stroke-miterlimit",
  "stroke-opacity",
  "stroke-width",
  "transform",
  "viewbox",
  "width",
  "x",
  "x1",
  "x2",
  "xmlns",
  "y",
  "y1",
  "y2",
]);

function isElement(node: ChildNode): node is Element {
  return "tagName" in node;
}

function collectSvgIds(node: ChildNode, ids: Set<string>): boolean {
  if (!isElement(node)) return true;
  const id = node.attrs.find(({ name }) => name.toLowerCase() === "id")?.value;
  if (id !== undefined) {
    if (ids.has(id)) return false;
    ids.add(id);
  }
  return node.childNodes.every((child) => collectSvgIds(child, ids));
}

function safeSvgNode(
  node: ChildNode,
  ids: ReadonlySet<string>,
  parentTag?: string,
): boolean {
  if (isElement(node)) {
    const tag = node.tagName.toLowerCase();
    if (!svgTags.has(tag)) return false;
    for (const attribute of node.attrs) {
      const name = attribute.name.toLowerCase();
      if (
        !svgAttributes.has(name) ||
        (attribute.prefix !== undefined && attribute.prefix !== "")
      )
        return false;
      if (name === "xmlns") {
        if (attribute.value !== "http://www.w3.org/2000/svg") return false;
      } else if (attribute.value.includes("\\")) {
        return false;
      } else if (hasExternalReference(attribute.value)) {
        const localReference = /^url\(\s*#([a-z_][a-z0-9_.:-]*)\s*\)$/iu.exec(
          attribute.value,
        );
        if (localReference?.[1] === undefined || !ids.has(localReference[1])) {
          return false;
        }
      }
    }
    return node.childNodes.every((child) => safeSvgNode(child, ids, tag));
  }
  if (node.nodeName === "#text") {
    return (
      node.value.trim().length === 0 ||
      parentTag === "title" ||
      parentTag === "desc"
    );
  }
  return false;
}

function sanitizeSvg(bytes: Uint8Array): Uint8Array | undefined {
  let source: string;
  try {
    source = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return undefined;
  }
  if (source.includes("\u0000")) return undefined;
  const fragment = parseFragment(source);
  if (fragment.childNodes.length !== 1) return undefined;
  const root = fragment.childNodes[0];
  if (
    root === undefined ||
    !isElement(root) ||
    root.tagName.toLowerCase() !== "svg"
  ) {
    return undefined;
  }
  const ids = new Set<string>();
  if (!collectSvgIds(root, ids) || !safeSvgNode(root, ids)) return undefined;
  return new TextEncoder().encode(`${serialize(fragment)}\n`);
}

export async function validateAsset(
  asset: ExportAsset,
): Promise<ValidatedAsset | AssetValidationError> {
  const outputName = assetOutputName(asset.fileName);
  if (outputName === undefined) {
    return {
      code: "ASSET_PATH_UNSAFE",
      message: `Asset path is unsafe: ${asset.fileName}`,
    };
  }
  const normalizedBase = outputName.slice(0, outputName.lastIndexOf("."));
  if (isWindowsReservedBasename(normalizedBase)) {
    return {
      code: "ASSET_PATH_UNSAFE",
      message: `Asset path uses a reserved device name: ${asset.fileName}`,
    };
  }
  const mimeType = asset.mimeType?.toLowerCase();
  const allowedExtensions =
    mimeType === undefined ? undefined : supportedExtensions[mimeType];
  if (mimeType === undefined || allowedExtensions === undefined) {
    return {
      code: "ASSET_MIME_UNSUPPORTED",
      message: `Asset MIME type is unsupported: ${asset.mimeType ?? "missing"}`,
    };
  }
  const extension = outputName.slice(outputName.lastIndexOf(".") + 1);
  if (!allowedExtensions.includes(extension)) {
    return {
      code: "ASSET_INVALID",
      message: `Asset extension does not match ${asset.mimeType}: ${asset.fileName}`,
    };
  }
  if (!(asset.bytes instanceof Uint8Array) || asset.bytes.byteLength === 0) {
    return {
      code: "BROKEN_ASSET",
      message: `Asset bytes are empty or invalid: ${asset.fileName}`,
    };
  }
  if (
    asset.bytes.byteLength > maxEncodedAssetBytes ||
    (mimeType === "image/svg+xml" && asset.bytes.byteLength > maxSvgAssetBytes)
  ) {
    return {
      code: "ASSET_LIMIT_EXCEEDED",
      message: `Asset exceeds export size limits: ${asset.fileName}`,
    };
  }

  let bytes: Uint8Array = asset.bytes.slice();
  const validation =
    mimeType === "image/png"
      ? await validRaster(bytes, "png")
      : mimeType === "image/jpeg"
        ? await validRaster(bytes, "jpeg")
        : mimeType === "image/webp"
          ? await validRaster(bytes, "webp")
          : (bytes = sanitizeSvg(bytes) ?? new Uint8Array()).byteLength > 0
            ? "valid"
            : "broken";
  if (validation === "limit") {
    return {
      code: "ASSET_LIMIT_EXCEEDED",
      message: `Asset exceeds export dimension limits: ${asset.fileName}`,
    };
  }
  if (validation !== "valid") {
    return {
      code: "BROKEN_ASSET",
      message: `Asset content is invalid for ${asset.mimeType}: ${asset.fileName}`,
    };
  }
  return { bytes, outputName };
}
