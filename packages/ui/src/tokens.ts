export type ThemeMode = "light" | "dark";

export const themeModes = ["light", "dark"] as const;

const samsungBlue = {
  50: "#eef1fb",
  100: "#d4dbf3",
  200: "#a4b0e3",
  300: "#7286d3",
  400: "#3f5cc4",
  500: "#1428a0",
  600: "#0f1f80",
  700: "#0b1760",
  800: "#080f40",
  900: "#040820",
} as const;

const neutral = {
  0: "#ffffff",
  50: "#f6f7f8",
  100: "#eceef1",
  200: "#d5d9de",
  300: "#b3bac2",
  400: "#8891a0",
  500: "#61697a",
  600: "#464d5c",
  700: "#2f3543",
  800: "#1c2130",
  900: "#0d111b",
  1000: "#000000",
} as const;

const semantic = {
  successLight: "#0f7a3d",
  successDark: "#33c26b",
  warningLight: "#8a4b00",
  warningDark: "#f0a044",
  dangerLight: "#a4142a",
  dangerDark: "#f26681",
  infoLight: samsungBlue[500],
  infoDark: samsungBlue[300],
} as const;

export interface ColorPalette {
  brand: string;
  brandStrong: string;
  brandSoft: string;
  brandOnStrong: string;
  surface: string;
  surfaceSubtle: string;
  surfaceElevated: string;
  surfaceInverse: string;
  border: string;
  borderStrong: string;
  divider: string;
  text: string;
  textMuted: string;
  textInverse: string;
  focusRing: string;
  overlay: string;
  canvas: string;
  canvasGrid: string;
  danger: string;
  warning: string;
  success: string;
  info: string;
}

export const palettes: Record<ThemeMode, ColorPalette> = {
  light: {
    brand: samsungBlue[500],
    brandStrong: samsungBlue[600],
    brandSoft: samsungBlue[50],
    brandOnStrong: neutral[0],
    surface: neutral[0],
    surfaceSubtle: neutral[50],
    surfaceElevated: neutral[0],
    surfaceInverse: neutral[900],
    border: neutral[200],
    borderStrong: neutral[300],
    divider: neutral[100],
    text: neutral[900],
    textMuted: neutral[500],
    textInverse: neutral[0],
    focusRing: samsungBlue[400],
    overlay: "rgba(13, 17, 27, 0.42)",
    canvas: neutral[100],
    canvasGrid: neutral[200],
    danger: semantic.dangerLight,
    warning: semantic.warningLight,
    success: semantic.successLight,
    info: semantic.infoLight,
  },
  dark: {
    brand: samsungBlue[300],
    brandStrong: samsungBlue[200],
    brandSoft: "rgba(60, 90, 200, 0.16)",
    brandOnStrong: neutral[900],
    surface: neutral[900],
    surfaceSubtle: neutral[800],
    surfaceElevated: neutral[700],
    surfaceInverse: neutral[0],
    border: neutral[700],
    borderStrong: neutral[600],
    divider: neutral[800],
    text: neutral[50],
    textMuted: neutral[300],
    textInverse: neutral[900],
    focusRing: samsungBlue[300],
    overlay: "rgba(0, 0, 0, 0.6)",
    canvas: neutral[800],
    canvasGrid: neutral[700],
    danger: semantic.dangerDark,
    warning: semantic.warningDark,
    success: semantic.successDark,
    info: semantic.infoDark,
  },
};

export const typography = {
  fontFamily:
    '"Inter", "SamsungOne", "Noto Sans", "Noto Sans KR", "Segoe UI", system-ui, sans-serif',
  monoFamily: '"JetBrains Mono", "Fira Code", "Menlo", monospace',
  scale: {
    xs: "0.75rem",
    sm: "0.8125rem",
    base: "0.875rem",
    md: "1rem",
    lg: "1.125rem",
    xl: "1.375rem",
    "2xl": "1.75rem",
    "3xl": "2.25rem",
  },
  weight: { regular: 400, medium: 500, semibold: 600, bold: 700 },
  lineHeight: { tight: 1.2, normal: 1.45, relaxed: 1.6 },
} as const;

export const spacing = {
  "0": "0",
  "1": "4px",
  "2": "8px",
  "3": "12px",
  "4": "16px",
  "5": "20px",
  "6": "24px",
  "8": "32px",
  "10": "40px",
  "12": "48px",
  "16": "64px",
} as const;

export const radius = {
  xs: "2px",
  sm: "4px",
  md: "6px",
  lg: "10px",
  xl: "16px",
  round: "999px",
} as const;

export const elevation = {
  none: "none",
  sm: "0 1px 2px rgba(0, 0, 0, 0.08)",
  md: "0 4px 12px rgba(0, 0, 0, 0.12)",
  lg: "0 12px 32px rgba(0, 0, 0, 0.18)",
} as const;

export const cssVariables: Record<keyof ColorPalette, string> = {
  brand: "--bc-color-brand",
  brandStrong: "--bc-color-brand-strong",
  brandSoft: "--bc-color-brand-soft",
  brandOnStrong: "--bc-color-brand-on-strong",
  surface: "--bc-color-surface",
  surfaceSubtle: "--bc-color-surface-subtle",
  surfaceElevated: "--bc-color-surface-elevated",
  surfaceInverse: "--bc-color-surface-inverse",
  border: "--bc-color-border",
  borderStrong: "--bc-color-border-strong",
  divider: "--bc-color-divider",
  text: "--bc-color-text",
  textMuted: "--bc-color-text-muted",
  textInverse: "--bc-color-text-inverse",
  focusRing: "--bc-color-focus-ring",
  overlay: "--bc-color-overlay",
  canvas: "--bc-color-canvas",
  canvasGrid: "--bc-color-canvas-grid",
  danger: "--bc-color-danger",
  warning: "--bc-color-warning",
  success: "--bc-color-success",
  info: "--bc-color-info",
};

export function paletteToCssVariables(mode: ThemeMode): Record<string, string> {
  const palette = palettes[mode];
  const entries: Record<string, string> = {};
  for (const key of Object.keys(cssVariables) as (keyof ColorPalette)[]) {
    entries[cssVariables[key]] = palette[key];
  }
  return entries;
}

export const brandColor = samsungBlue[500];
