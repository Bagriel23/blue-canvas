import { describe, expect, it } from "vitest";

import {
  DEFAULT_LOCALE,
  detectLocale,
  formatMessage,
  getMessages,
  isUiLocale,
  LOCALE_STORAGE_KEY,
  uiLocales,
  writeLocalePreference,
  type LocaleEnvironment,
} from "./index.js";

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

describe("i18n locale controller", () => {
  it("exposes exactly the three product locales", () => {
    expect([...uiLocales]).toEqual(["en-US", "pt-BR", "ko-KR"]);
    expect(isUiLocale("pt-BR")).toBe(true);
    expect(isUiLocale("fr-FR")).toBe(false);
  });

  it("prefers stored locale over navigator languages", () => {
    const storage = makeStorage({ [LOCALE_STORAGE_KEY]: "ko-KR" });
    const env: LocaleEnvironment = {
      navigatorLanguages: ["en-US"],
      storage,
    };
    expect(detectLocale(env)).toBe("ko-KR");
  });

  it("matches navigator language even by primary subtag", () => {
    expect(detectLocale({ navigatorLanguages: ["pt-PT", "pt", "en"] })).toBe(
      "pt-BR",
    );
    expect(detectLocale({ navigatorLanguages: ["ko"] })).toBe("ko-KR");
  });

  it("falls back to English when nothing matches", () => {
    expect(detectLocale({ navigatorLanguages: ["fr-FR"] })).toBe(
      DEFAULT_LOCALE,
    );
    expect(detectLocale({})).toBe(DEFAULT_LOCALE);
  });

  it("persists a locale preference", () => {
    const storage = makeStorage();
    writeLocalePreference("pt-BR", { storage });
    expect(storage.snapshot().get(LOCALE_STORAGE_KEY)).toBe("pt-BR");
  });

  it("returns dictionaries with identical shape across locales", () => {
    const shape = JSON.stringify(
      Object.fromEntries(
        Object.entries(getMessages("en-US")).map(([section, entries]) => [
          section,
          Object.keys(entries).sort(),
        ]),
      ),
    );
    for (const locale of uiLocales) {
      const localeShape = JSON.stringify(
        Object.fromEntries(
          Object.entries(getMessages(locale)).map(([section, entries]) => [
            section,
            Object.keys(entries).sort(),
          ]),
        ),
      );
      expect(localeShape, `${locale} shape`).toBe(shape);
    }
  });

  it("formats messages with replacements", () => {
    expect(formatMessage("en-US", "home.heading")).toBe("Projects");
    expect(formatMessage("pt-BR", "home.heading")).toBe("Projetos");
    expect(formatMessage("ko-KR", "app.title")).toBe("Blue Canvas");
  });

  it("returns the raw key when path is unknown", () => {
    expect(formatMessage("en-US", "missing.key")).toBe("missing.key");
  });
});
