import { beforeEach, describe, expect, it } from "vitest";

import {
  cycleThemePreference,
  readThemePreference,
  resolveInitialTheme,
  THEME_STORAGE_KEY,
  writeThemePreference,
  type ThemeEnvironment,
} from "./theme.js";

function makeStorage(initial: Record<string, string> = {}) {
  const store = new Map<string, string>(Object.entries(initial));
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    snapshot: () => new Map(store),
  };
}

function makeEnv(options: {
  dark?: boolean;
  initial?: Record<string, string>;
}): ThemeEnvironment & { storage: ReturnType<typeof makeStorage> } {
  const storage = makeStorage(options.initial);
  return {
    matchMedia: () => ({ matches: Boolean(options.dark) }),
    storage,
  };
}

describe("theme controller", () => {
  let env: ReturnType<typeof makeEnv>;

  beforeEach(() => {
    env = makeEnv({ dark: false });
  });

  it("defaults to system preference when nothing is stored", () => {
    expect(resolveInitialTheme(env)).toBe("light");
    expect(readThemePreference(env)).toBe("system");
    const darkEnv = makeEnv({ dark: true });
    expect(resolveInitialTheme(darkEnv)).toBe("dark");
  });

  it("prefers the persisted override over system preference", () => {
    env.storage.setItem(THEME_STORAGE_KEY, "dark");
    expect(resolveInitialTheme(env)).toBe("dark");
    expect(readThemePreference(env)).toBe("dark");
  });

  it("persists explicit modes and clears on system", () => {
    writeThemePreference("dark", env);
    expect(env.storage.snapshot().get(THEME_STORAGE_KEY)).toBe("dark");
    writeThemePreference("system", env);
    expect(env.storage.snapshot().has(THEME_STORAGE_KEY)).toBe(false);
  });

  it("cycles system -> light -> dark -> system", () => {
    expect(cycleThemePreference("system")).toBe("light");
    expect(cycleThemePreference("light")).toBe("dark");
    expect(cycleThemePreference("dark")).toBe("system");
  });

  it("tolerates storage failures without throwing", () => {
    const throwingEnv: ThemeEnvironment = {
      matchMedia: () => ({ matches: false }),
      storage: {
        getItem: () => {
          throw new Error("blocked");
        },
        setItem: () => {
          throw new Error("blocked");
        },
        removeItem: () => {
          throw new Error("blocked");
        },
      },
    };
    expect(() => resolveInitialTheme(throwingEnv)).not.toThrow();
    expect(() => writeThemePreference("dark", throwingEnv)).not.toThrow();
    expect(resolveInitialTheme(throwingEnv)).toBe("light");
  });
});
