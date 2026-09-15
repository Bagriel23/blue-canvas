import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ThemeProvider, useTheme } from "./theme.js";

function ThemeProbe() {
  const { mode, preference } = useTheme();
  return (
    <output data-mode={mode} role="status">
      {preference}
    </output>
  );
}

describe("ThemeProvider", () => {
  const storage = new Map<string, string>();

  function installStorage() {
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        clear: () => storage.clear(),
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
        removeItem: (key: string) => storage.delete(key),
      },
    });
  }

  it("starts with the system mode", () => {
    installStorage();
    storage.clear();
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: () => ({
        matches: false,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      }),
    });
    render(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>,
    );
    const probe = screen.getByRole("status");
    expect(probe.textContent).toBe("system");
    expect(probe.getAttribute("data-mode")).toBe("light");
  });

  it("reads a saved preference before the system mode", () => {
    installStorage();
    storage.set("blue-canvas.theme", "dark");
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: () => ({
        matches: false,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      }),
    });
    render(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>,
    );
    const probe = screen.getByRole("status");
    expect(probe.textContent).toBe("dark");
    expect(probe.getAttribute("data-mode")).toBe("dark");
  });
});
