import type { CSSProperties } from "react";
import type { DesignNode } from "@blue-canvas/document";

type StyleInput = DesignNode["style"];

function toCssLength(
  value: number | { token: string } | undefined,
  fallback?: string,
): string | undefined {
  if (value === undefined) return fallback;
  if (typeof value === "number") return `${value}px`;
  return `var(--bc-token-${value.token})`;
}

function toCssColor(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "token" in (value as object)) {
    return `var(--bc-token-${(value as { token: string }).token})`;
  }
  return undefined;
}

interface EdgeCss {
  top?: string;
  right?: string;
  bottom?: string;
  left?: string;
}

function resolveEdge(value: unknown): EdgeCss | string | undefined {
  if (value === undefined) return undefined;
  if (
    typeof value === "number" ||
    (typeof value === "object" &&
      value !== null &&
      "token" in (value as object))
  ) {
    return toCssLength(value as number | { token: string });
  }
  const edge = value as {
    top?: number | { token: string };
    right?: number | { token: string };
    bottom?: number | { token: string };
    left?: number | { token: string };
  };
  const result: EdgeCss = {};
  const top = toCssLength(edge.top);
  if (top !== undefined) result.top = top;
  const right = toCssLength(edge.right);
  if (right !== undefined) result.right = right;
  const bottom = toCssLength(edge.bottom);
  if (bottom !== undefined) result.bottom = bottom;
  const left = toCssLength(edge.left);
  if (left !== undefined) result.left = left;
  return result;
}

export function styleToCss(style: StyleInput | undefined): CSSProperties {
  const css: CSSProperties = {};
  if (!style) return css;
  const background = toCssColor(style.background);
  if (background) css.background = background;
  const color = toCssColor(style.color);
  if (color) css.color = color;
  const borderColor = toCssColor(style.borderColor);
  if (borderColor) css.borderColor = borderColor;
  const borderWidth = toCssLength(style.borderWidth);
  if (borderWidth) {
    css.borderWidth = borderWidth;
    css.borderStyle = "solid";
  }
  const borderRadius = toCssLength(style.borderRadius);
  if (borderRadius) css.borderRadius = borderRadius;
  const width = toCssLength(style.width);
  if (width) css.width = width;
  const height = toCssLength(style.height);
  if (height) css.height = height;
  const minWidth = toCssLength(style.minWidth);
  if (minWidth) css.minWidth = minWidth;
  const maxWidth = toCssLength(style.maxWidth);
  if (maxWidth) css.maxWidth = maxWidth;
  const minHeight = toCssLength(style.minHeight);
  if (minHeight) css.minHeight = minHeight;
  const maxHeight = toCssLength(style.maxHeight);
  if (maxHeight) css.maxHeight = maxHeight;
  const padding = resolveEdge(style.padding);
  if (padding !== undefined) {
    if (typeof padding === "string") css.padding = padding;
    else {
      if (padding.top) css.paddingTop = padding.top;
      if (padding.right) css.paddingRight = padding.right;
      if (padding.bottom) css.paddingBottom = padding.bottom;
      if (padding.left) css.paddingLeft = padding.left;
    }
  }
  const margin = resolveEdge(style.margin);
  if (margin !== undefined) {
    if (typeof margin === "string") css.margin = margin;
    else {
      if (margin.top) css.marginTop = margin.top;
      if (margin.right) css.marginRight = margin.right;
      if (margin.bottom) css.marginBottom = margin.bottom;
      if (margin.left) css.marginLeft = margin.left;
    }
  }
  if (typeof style.opacity === "number") css.opacity = style.opacity;
  if (style.fontFamily) {
    css.fontFamily =
      typeof style.fontFamily === "string"
        ? style.fontFamily
        : `var(--bc-token-${style.fontFamily.token})`;
  }
  const fontSize = toCssLength(style.fontSize);
  if (fontSize) css.fontSize = fontSize;
  if (style.fontWeight !== undefined) {
    css.fontWeight =
      typeof style.fontWeight === "number"
        ? style.fontWeight
        : (`var(--bc-token-${style.fontWeight.token})` as unknown as number);
  }
  if (style.lineHeight !== undefined) {
    css.lineHeight =
      typeof style.lineHeight === "number"
        ? style.lineHeight
        : (`var(--bc-token-${style.lineHeight.token})` as unknown as number);
  }
  if (style.textAlign) css.textAlign = style.textAlign;
  return css;
}

export function layoutToCss(node: DesignNode): CSSProperties {
  if (node.kind === "stack") {
    return {
      display: "flex",
      flexDirection: node.layout.direction,
      gap: toCssLength(node.layout.gap) ?? "0",
      alignItems:
        node.layout.align === "start"
          ? "flex-start"
          : node.layout.align === "end"
            ? "flex-end"
            : node.layout.align,
      justifyContent: mapJustify(node.layout.justify),
      flexWrap: node.layout.wrap,
    };
  }
  if (node.kind === "grid") {
    return {
      display: "grid",
      gridTemplateColumns: node.layout.columns.map(trackToCss).join(" "),
      gridTemplateRows: node.layout.rows.map(trackToCss).join(" "),
      gap: toCssLength(node.layout.gap) ?? "0",
      alignItems: mapAlign(node.layout.align),
      justifyItems: mapAlign(node.layout.justify),
    };
  }
  return {};
}

function trackToCss(track: { type: string; value?: unknown }): string {
  if (track.type === "auto") return "auto";
  if (track.type === "fraction") return `${track.value}fr`;
  if (track.type === "fixed") {
    return typeof track.value === "number"
      ? `${track.value}px`
      : `var(--bc-token-${(track.value as { token: string }).token})`;
  }
  return "auto";
}

function mapJustify(value: string): CSSProperties["justifyContent"] {
  switch (value) {
    case "start":
      return "flex-start";
    case "end":
      return "flex-end";
    case "space-between":
      return "space-between";
    case "space-around":
      return "space-around";
    default:
      return value as CSSProperties["justifyContent"];
  }
}

function mapAlign(value: string): CSSProperties["alignItems"] {
  switch (value) {
    case "start":
      return "flex-start";
    case "end":
      return "flex-end";
    default:
      return value as CSSProperties["alignItems"];
  }
}
