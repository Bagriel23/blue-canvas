import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { ReactNode } from "react";
import {
  cycleThemePreference,
  paletteToCssVariables,
  readThemePreference,
  resolveInitialTheme,
  writeThemePreference,
  type ThemeMode,
  type ThemePreference,
} from "@blue-canvas/ui";

interface ThemeContextValue {
  mode: ThemeMode;
  preference: ThemePreference;
  setPreference: (next: ThemePreference) => void;
  cycle: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readEnvironment() {
  if (typeof window === "undefined") return {};
  return {
    matchMedia: window.matchMedia.bind(window) as (query: string) => {
      matches: boolean;
    },
    storage: window.localStorage,
  };
}

function applyThemeAttributes(mode: ThemeMode): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.setAttribute("data-theme", mode);
  root.style.colorScheme = mode;
  const vars = paletteToCssVariables(mode);
  for (const [name, value] of Object.entries(vars)) {
    root.style.setProperty(name, value);
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>(() =>
    readThemePreference(readEnvironment()),
  );
  const [mode, setMode] = useState<ThemeMode>(() =>
    resolveInitialTheme(readEnvironment()),
  );

  useEffect(() => {
    applyThemeAttributes(mode);
  }, [mode]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    if (preference !== "system") return undefined;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => setMode(media.matches ? "dark" : "light");
    handler();
    media.addEventListener?.("change", handler);
    return () => media.removeEventListener?.("change", handler);
  }, [preference]);

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    writeThemePreference(next, readEnvironment());
    if (next === "system") {
      setMode(resolveInitialTheme(readEnvironment()));
    } else {
      setMode(next);
    }
  }, []);

  const cycle = useCallback(() => {
    setPreference(cycleThemePreference(preference));
  }, [preference, setPreference]);

  const value = useMemo(
    () => ({ mode, preference, setPreference, cycle }),
    [mode, preference, setPreference, cycle],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used within ThemeProvider");
  return context;
}
