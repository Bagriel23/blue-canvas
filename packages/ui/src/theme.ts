import { themeModes, type ThemeMode } from "./tokens.js";

export const THEME_STORAGE_KEY = "blue-canvas.theme";

export type ThemePreference = ThemeMode | "system";

export interface ThemeEnvironment {
  matchMedia?: ((query: string) => { matches: boolean }) | undefined;
  storage?: Pick<Storage, "getItem" | "setItem" | "removeItem"> | undefined;
}

function detectSystemMode(env: ThemeEnvironment): ThemeMode {
  const match = env.matchMedia?.("(prefers-color-scheme: dark)");
  return match?.matches ? "dark" : "light";
}

function readOverride(env: ThemeEnvironment): ThemeMode | undefined {
  try {
    const value = env.storage?.getItem(THEME_STORAGE_KEY);
    if (value === "light" || value === "dark") return value;
  } catch {
    // storage might be unavailable (private mode, denied); fall back to system.
  }
  return undefined;
}

export function resolveInitialTheme(env: ThemeEnvironment = {}): ThemeMode {
  return readOverride(env) ?? detectSystemMode(env);
}

export function readThemePreference(
  env: ThemeEnvironment = {},
): ThemePreference {
  return readOverride(env) ?? "system";
}

export function writeThemePreference(
  preference: ThemePreference,
  env: ThemeEnvironment = {},
): void {
  try {
    if (preference === "system") {
      env.storage?.removeItem(THEME_STORAGE_KEY);
      return;
    }
    if (!themeModes.includes(preference)) return;
    env.storage?.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // ignore storage failures; the current in-memory state is authoritative.
  }
}

export function cycleThemePreference(
  current: ThemePreference,
): ThemePreference {
  switch (current) {
    case "system":
      return "light";
    case "light":
      return "dark";
    case "dark":
      return "system";
  }
}
