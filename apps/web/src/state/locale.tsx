import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import type { ReactNode } from "react";
import {
  detectLocale,
  formatMessage,
  getMessages,
  writeLocalePreference,
  type UiLocale,
  type UiMessages,
} from "@blue-canvas/ui";

interface LocaleContextValue {
  locale: UiLocale;
  messages: UiMessages;
  setLocale: (locale: UiLocale) => void;
  t: (path: string, replacements?: Record<string, string | number>) => string;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

function readEnvironment() {
  if (typeof window === "undefined") return {};
  return {
    navigatorLanguages: window.navigator.languages,
    storage: window.localStorage,
  };
}

export function LocaleProvider({
  children,
  initialLocale,
}: {
  children: ReactNode;
  initialLocale?: UiLocale;
}) {
  const [locale, setLocaleState] = useState<UiLocale>(
    () => initialLocale ?? detectLocale(readEnvironment()),
  );

  const setLocale = useCallback((next: UiLocale) => {
    setLocaleState(next);
    writeLocalePreference(next, readEnvironment());
    if (typeof document !== "undefined") {
      document.documentElement.lang = next;
    }
  }, []);

  const messages = getMessages(locale);

  const value = useMemo<LocaleContextValue>(
    () => ({
      locale,
      messages,
      setLocale,
      t: (path, replacements) => formatMessage(locale, path, replacements),
    }),
    [locale, messages, setLocale],
  );

  return (
    <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
  );
}

export function useLocale(): LocaleContextValue {
  const context = useContext(LocaleContext);
  if (!context) throw new Error("useLocale must be used within LocaleProvider");
  return context;
}
