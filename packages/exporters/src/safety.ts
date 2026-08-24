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
  return `${slug(base, "asset")}.${slug(extension, "bin")}`;
}

export function isUnsafeCssValue(value: string): boolean {
  return (
    hasControlCharacter(value) ||
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
