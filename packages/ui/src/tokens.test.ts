import { describe, expect, it } from "vitest";

import {
  brandColor,
  cssVariables,
  palettes,
  paletteToCssVariables,
  themeModes,
} from "./tokens.js";

describe("SEDA tokens", () => {
  it("keeps Samsung Blue #1428A0 as the seed brand color", () => {
    expect(brandColor).toBe("#1428a0");
    expect(palettes.light.brand).toBe("#1428a0");
  });

  it("provides both light and dark palettes for every semantic slot", () => {
    for (const mode of themeModes) {
      const palette = palettes[mode];
      for (const slot of Object.keys(
        cssVariables,
      ) as (keyof typeof palette)[]) {
        expect(palette[slot], `${mode}.${slot}`).toMatch(
          /^(#[0-9a-f]{3,8}|rgba?\(.+\))$/i,
        );
      }
    }
  });

  it("renders CSS variables from a palette", () => {
    const vars = paletteToCssVariables("dark");
    expect(vars["--bc-color-brand"]).toBe(palettes.dark.brand);
    expect(vars["--bc-color-surface"]).toBe(palettes.dark.surface);
  });

  it("differs between light and dark for surface and text roles", () => {
    expect(palettes.light.surface).not.toBe(palettes.dark.surface);
    expect(palettes.light.text).not.toBe(palettes.dark.text);
  });
});
