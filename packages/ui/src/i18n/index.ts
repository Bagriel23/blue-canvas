import {
  DEFAULT_LOCALE,
  messagesByLocale,
  uiLocales,
  type UiLocale,
  type UiMessages,
} from "./messages.js";

export const LOCALE_STORAGE_KEY = "blue-canvas.locale";

export type MessagePath = keyof UiMessages | `${keyof UiMessages}.${string}`;

export interface LocaleEnvironment {
  navigatorLanguages?: readonly string[] | undefined;
  storage?: Pick<Storage, "getItem" | "setItem" | "removeItem"> | undefined;
}

export function isUiLocale(value: string): value is UiLocale {
  return (uiLocales as readonly string[]).includes(value);
}

function matchLocale(candidate: string): UiLocale | undefined {
  if (isUiLocale(candidate)) return candidate;
  const primary = candidate.split("-")[0]?.toLowerCase();
  if (!primary) return undefined;
  for (const locale of uiLocales) {
    if (locale.split("-")[0]?.toLowerCase() === primary) return locale;
  }
  return undefined;
}

function readStoredLocale(env: LocaleEnvironment): UiLocale | undefined {
  try {
    const value = env.storage?.getItem(LOCALE_STORAGE_KEY);
    if (typeof value === "string" && isUiLocale(value)) return value;
  } catch {
    // storage unavailable or blocked; fall through to detection.
  }
  return undefined;
}

export function detectLocale(env: LocaleEnvironment = {}): UiLocale {
  const stored = readStoredLocale(env);
  if (stored) return stored;
  const candidates = env.navigatorLanguages ?? [];
  for (const candidate of candidates) {
    const matched = matchLocale(candidate);
    if (matched) return matched;
  }
  return DEFAULT_LOCALE;
}

export function writeLocalePreference(
  locale: UiLocale,
  env: LocaleEnvironment = {},
): void {
  if (!isUiLocale(locale)) return;
  try {
    env.storage?.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // ignore storage failures.
  }
}

export function getMessages(locale: UiLocale): UiMessages {
  return messagesByLocale[locale];
}

function resolvePath(source: unknown, path: string): string {
  const segments = path.split(".");
  let current: unknown = source;
  for (const segment of segments) {
    if (
      current !== null &&
      typeof current === "object" &&
      segment in (current as Record<string, unknown>)
    ) {
      current = (current as Record<string, unknown>)[segment];
    } else {
      return path;
    }
  }
  return typeof current === "string" ? current : path;
}

export function formatMessage(
  locale: UiLocale,
  path: string,
  replacements?: Readonly<Record<string, string | number>>,
): string {
  const template = resolvePath(messagesByLocale[locale], path);
  if (!replacements) return template;
  return Object.entries(replacements).reduce(
    (result, [key, value]) => result.replaceAll(`{${key}}`, String(value)),
    template,
  );
}

export {
  DEFAULT_LOCALE,
  messagesByLocale,
  uiLocales,
  type UiLocale,
  type UiMessages,
} from "./messages.js";
export { localeDisplayNames } from "./messages.js";
