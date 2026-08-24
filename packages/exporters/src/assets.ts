import { parseFragment, serialize, type DefaultTreeAdapterMap } from "parse5";

import { assetOutputName, hasExternalReference } from "./safety.js";
import type { ExportAsset } from "./types.js";

type ChildNode = DefaultTreeAdapterMap["childNode"];
type Element = DefaultTreeAdapterMap["element"];

export interface ValidatedAsset {
  bytes: Uint8Array;
  outputName: string;
}

export interface AssetValidationError {
  code: "ASSET_INVALID" | "ASSET_MIME_UNSUPPORTED" | "ASSET_PATH_UNSAFE";
  message: string;
}

const supportedExtensions: Readonly<Record<string, readonly string[]>> = {
  "image/jpeg": ["jpg", "jpeg"],
  "image/png": ["png"],
  "image/svg+xml": ["svg"],
  "image/webp": ["webp"],
};

const windowsDeviceName = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])$/iu;

function ascii(bytes: Uint8Array, start: number, length: number): string {
  return String.fromCharCode(...bytes.slice(start, start + length));
}

function uint32(
  bytes: Uint8Array,
  offset: number,
  littleEndian = false,
): number {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return view.getUint32(offset, littleEndian);
}

function validPng(bytes: Uint8Array): boolean {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (
    bytes.length < 45 ||
    !signature.every((value, index) => bytes[index] === value)
  ) {
    return false;
  }
  let offset = 8;
  let chunkIndex = 0;
  while (offset + 12 <= bytes.length) {
    const length = uint32(bytes, offset);
    const end = offset + 12 + length;
    if (end > bytes.length) return false;
    const type = ascii(bytes, offset + 4, 4);
    if (chunkIndex === 0) {
      if (type !== "IHDR" || length !== 13) return false;
      if (uint32(bytes, offset + 8) === 0 || uint32(bytes, offset + 12) === 0) {
        return false;
      }
    }
    if (type === "IEND") return length === 0 && end === bytes.length;
    offset = end;
    chunkIndex += 1;
  }
  return false;
}

function validJpeg(bytes: Uint8Array): boolean {
  if (
    bytes.length < 24 ||
    bytes[0] !== 0xff ||
    bytes[1] !== 0xd8 ||
    bytes.at(-2) !== 0xff ||
    bytes.at(-1) !== 0xd9
  ) {
    return false;
  }
  const lowered = new TextDecoder().decode(bytes).toLowerCase();
  if (lowered.includes("<html") || lowered.includes("<script")) return false;
  let hasFrame = false;
  let hasScan = false;
  for (let index = 2; index < bytes.length - 1; index += 1) {
    if (bytes[index] !== 0xff) continue;
    const marker = bytes[index + 1];
    if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) hasFrame = true;
    if (marker === 0xda) hasScan = true;
  }
  return hasFrame && hasScan;
}

function validWebp(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 20 &&
    ascii(bytes, 0, 4) === "RIFF" &&
    uint32(bytes, 4, true) === bytes.length - 8 &&
    ascii(bytes, 8, 4) === "WEBP" &&
    ["VP8 ", "VP8L", "VP8X"].includes(ascii(bytes, 12, 4))
  );
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

function safeSvgNode(node: ChildNode, parentTag?: string): boolean {
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
      } else if (hasExternalReference(attribute.value)) {
        return false;
      }
    }
    return node.childNodes.every((child) => safeSvgNode(child, tag));
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
  if (!safeSvgNode(root)) return undefined;
  return new TextEncoder().encode(`${serialize(fragment)}\n`);
}

export function validateAsset(
  asset: ExportAsset,
): ValidatedAsset | AssetValidationError {
  const outputName = assetOutputName(asset.fileName);
  if (outputName === undefined) {
    return {
      code: "ASSET_PATH_UNSAFE",
      message: `Asset path is unsafe: ${asset.fileName}`,
    };
  }
  const normalizedBase = outputName.slice(0, outputName.lastIndexOf("."));
  if (windowsDeviceName.test(normalizedBase)) {
    return {
      code: "ASSET_PATH_UNSAFE",
      message: `Asset path uses a reserved device name: ${asset.fileName}`,
    };
  }
  const allowedExtensions =
    asset.mimeType === undefined
      ? undefined
      : supportedExtensions[asset.mimeType.toLowerCase()];
  if (allowedExtensions === undefined) {
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
      code: "ASSET_INVALID",
      message: `Asset bytes are empty or invalid: ${asset.fileName}`,
    };
  }

  let bytes = asset.bytes;
  const valid =
    asset.mimeType === "image/png"
      ? validPng(bytes)
      : asset.mimeType === "image/jpeg"
        ? validJpeg(bytes)
        : asset.mimeType === "image/webp"
          ? validWebp(bytes)
          : (bytes = sanitizeSvg(bytes) ?? new Uint8Array()).byteLength > 0;
  if (!valid) {
    return {
      code: "ASSET_INVALID",
      message: `Asset content is invalid for ${asset.mimeType}: ${asset.fileName}`,
    };
  }
  return { bytes, outputName };
}
