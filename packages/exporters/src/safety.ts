import { createHash } from "node:crypto";

const maxPathComponentBytes = 120;

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function safeJson(value: unknown): string {
  return JSON.stringify(value).replaceAll("<", "\\u003c");
}

export function slug(value: string, fallback = "item"): string {
  const normalized = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "");
  return normalized || fallback;
}

export function compareStable(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function truncateUtf8(value: string, maxBytes: number): string {
  let output = "";
  let bytes = 0;
  for (const character of value) {
    const characterBytes = Buffer.byteLength(character, "utf8");
    if (bytes + characterBytes > maxBytes) break;
    output += character;
    bytes += characterBytes;
  }
  return output;
}

export function boundedPathComponent(stem: string, extension: string): string {
  const component = `${stem}${extension}`;
  if (Buffer.byteLength(component, "utf8") <= maxPathComponentBytes) {
    return component;
  }
  const hash = createHash("sha256")
    .update(component)
    .digest("hex")
    .slice(0, 12);
  const suffix = `_${hash}${extension}`;
  const prefix = truncateUtf8(
    stem,
    maxPathComponentBytes - Buffer.byteLength(suffix, "utf8"),
  );
  return `${prefix}${suffix}`;
}

export function uniqueSlugs(values: string[], fallback = "item"): string[] {
  const used = new Set<string>();
  return values.map((value, index) => {
    const base = slug(value, `${fallback}-${index + 1}`);
    let candidate = base;
    let sequence = 2;
    while (used.has(candidate)) candidate = `${base}-${sequence++}`;
    used.add(candidate);
    return candidate;
  });
}

function hasControlCharacter(value: string): boolean {
  return [...value].some((character) => {
    const codePoint = character.codePointAt(0);
    return codePoint !== undefined && (codePoint < 32 || codePoint === 127);
  });
}

export function assetOutputName(fileName: string): string | undefined {
  if (
    fileName.length === 0 ||
    fileName === "." ||
    fileName === ".." ||
    fileName.includes("/") ||
    fileName.includes("\\") ||
    hasControlCharacter(fileName)
  ) {
    return undefined;
  }
  const dot = fileName.lastIndexOf(".");
  const base = dot > 0 ? fileName.slice(0, dot) : fileName;
  const extension = dot > 0 ? fileName.slice(dot + 1) : "bin";
  return boundedPathComponent(
    slug(base, "asset"),
    `.${slug(extension, "bin")}`,
  );
}

export function hasExternalReference(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return (
    /(?:^|[^a-z-])(?:url|image-set|-webkit-image-set)\s*\(/u.test(normalized) ||
    /@import\b|(?:https?:|data:|javascript:)|\/\//u.test(normalized)
  );
}

export function isSafeCssColor(value: string): boolean {
  const normalized = value.trim();
  if (
    hasExternalReference(normalized) ||
    /[{};\\]|\/\*|\*\//u.test(normalized)
  ) {
    return false;
  }
  return (
    /^#[a-f0-9]{3,8}$/iu.test(normalized) ||
    /^(?:transparent|currentcolor|[a-z]+)$/iu.test(normalized) ||
    /^(?:rgb|rgba|hsl|hsla)\([0-9+,.% /-]+\)$/iu.test(normalized)
  );
}

export function isSafeFontFamily(value: string): boolean {
  if (hasExternalReference(value) || /[{};\\()]|\/\*|\*\//u.test(value))
    return false;
  return value.split(",").every((family) => {
    const normalized = family.trim();
    return (
      /^[a-z][a-z0-9 -]*$/iu.test(normalized) ||
      /^"[a-z0-9 -]+"$/iu.test(normalized) ||
      /^'[a-z0-9 -]+'$/iu.test(normalized)
    );
  });
}

export function isSafeCssString(value: string): boolean {
  return (
    !hasControlCharacter(value) &&
    !hasExternalReference(value) &&
    /^[a-z0-9 _.,#%+-]*$/iu.test(value)
  );
}

export function isUnsafeCssValue(value: string): boolean {
  return (
    hasControlCharacter(value) ||
    hasExternalReference(value) ||
    /[{};\\]|\/\*|\*\/|<\/?style|@import|expression\s*\(|url\s*\(/iu.test(value)
  );
}

export function isUnsafeNavigation(value: string): boolean {
  const target = value.trim();
  if (hasControlCharacter(target)) return true;
  const scheme = /^([a-z][a-z0-9+.-]*):/iu.exec(target)?.[1]?.toLowerCase();
  return (
    scheme !== undefined && !["http", "https", "mailto", "tel"].includes(scheme)
  );
}
