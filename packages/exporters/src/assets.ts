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
const maxSvgDepth = 128;
const maxSvgNodes = 100_000;

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

type SvgValidation =
  { status: "valid"; bytes: Uint8Array } | { status: "broken" | "limit" };

function inspectSvgTree(
  root: Element,
): { status: "valid"; ids: Set<string> } | { status: "broken" | "limit" } {
  const ids = new Set<string>();
  const stack: { node: ChildNode; depth: number }[] = [
    { node: root, depth: 1 },
  ];
  let nodeCount = 0;
  while (stack.length > 0) {
    const current = stack.pop();
    if (current === undefined) break;
    nodeCount += 1;
    if (current.depth > maxSvgDepth || nodeCount > maxSvgNodes) {
      return { status: "limit" };
    }
    if (!isElement(current.node)) continue;
    const id = current.node.attrs.find(
      ({ name }) => name.toLowerCase() === "id",
    )?.value;
    if (id !== undefined) {
      if (ids.has(id)) return { status: "broken" };
      ids.add(id);
    }
    for (let index = current.node.childNodes.length - 1; index >= 0; index--) {
      const child = current.node.childNodes[index];
      if (child !== undefined) {
        stack.push({ node: child, depth: current.depth + 1 });
      }
    }
  }
  return { status: "valid", ids };
}

function validateSvgTree(root: Element, ids: ReadonlySet<string>): boolean {
  const stack: { node: ChildNode; parentTag?: string }[] = [{ node: root }];
  while (stack.length > 0) {
    const current = stack.pop();
    if (current === undefined) break;
    if (isElement(current.node)) {
      const tag = current.node.tagName.toLowerCase();
      if (!svgTags.has(tag)) return false;
      for (const attribute of current.node.attrs) {
        const name = attribute.name.toLowerCase();
        if (
          !svgAttributes.has(name) ||
          (attribute.prefix !== undefined && attribute.prefix !== "")
        ) {
          return false;
        }
        if (name === "xmlns") {
          if (attribute.value !== "http://www.w3.org/2000/svg") return false;
        } else if (attribute.value.includes("\\")) {
          return false;
        } else if (hasExternalReference(attribute.value)) {
          const localReference = /^url\(\s*#([a-z_][a-z0-9_.:-]*)\s*\)$/iu.exec(
            attribute.value,
          );
          if (
            localReference?.[1] === undefined ||
            !ids.has(localReference[1])
          ) {
            return false;
          }
        }
      }
      for (
        let index = current.node.childNodes.length - 1;
        index >= 0;
        index--
      ) {
        const child = current.node.childNodes[index];
        if (child !== undefined) stack.push({ node: child, parentTag: tag });
      }
    } else if (
      current.node.nodeName !== "#text" ||
      (current.node.value.trim().length > 0 &&
        current.parentTag !== "title" &&
        current.parentTag !== "desc")
    ) {
      return false;
    }
  }
  return true;
}

function sanitizeSvg(bytes: Uint8Array): SvgValidation {
  try {
    const source = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    if (source.includes("\u0000")) return { status: "broken" };
    const fragment = parseFragment(source);
    if (fragment.childNodes.length !== 1) return { status: "broken" };
    const root = fragment.childNodes[0];
    if (
      root === undefined ||
      !isElement(root) ||
      root.tagName.toLowerCase() !== "svg"
    ) {
      return { status: "broken" };
    }
    const inspected = inspectSvgTree(root);
    if (inspected.status !== "valid") return inspected;
    if (!validateSvgTree(root, inspected.ids)) return { status: "broken" };
    const sanitized = new TextEncoder().encode(`${serialize(fragment)}\n`);
    return sanitized.byteLength <= maxSvgAssetBytes
      ? { status: "valid", bytes: sanitized }
      : { status: "limit" };
  } catch {
    return { status: "broken" };
  }
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

  let bytes: Uint8Array = Uint8Array.from(asset.bytes);
  let validation: "valid" | "broken" | "limit";
  if (mimeType === "image/svg+xml") {
    const svg = sanitizeSvg(bytes);
    validation = svg.status;
    if (svg.status === "valid") bytes = svg.bytes;
  } else {
    validation = await validRaster(
      bytes,
      mimeType === "image/png"
        ? "png"
        : mimeType === "image/jpeg"
          ? "jpeg"
          : "webp",
    );
  }
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
