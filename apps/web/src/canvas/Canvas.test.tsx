import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Canvas } from "./Canvas.js";
import { loadDemoDocument } from "../fixtures/demo.js";
import { LocaleProvider } from "../state/locale.js";

const doc = loadDemoDocument();
const [page] = doc.pages;
if (!page) throw new Error("demo document missing pages");
const [artboard] = page.artboards;
if (!artboard) throw new Error("demo document missing artboards");

function renderCanvas(
  props: React.ComponentProps<typeof Canvas>,
  locale: "en-US" | "pt-BR" | "ko-KR" = "en-US",
) {
  return render(
    <LocaleProvider initialLocale={locale}>
      <Canvas {...props} />
    </LocaleProvider>,
  );
}

describe("Canvas", () => {
  it("renders artboard as semantic DOM", () => {
    renderCanvas({
      document: doc,
      pageId: page.id,
      artboardId: artboard.id,
      selectedId: null,
      onSelect: () => undefined,
      editable: true,
    });
    expect(screen.getByRole("button", { name: "Get started" })).toBeTruthy();
    expect(
      screen.getByText("Design internal tools together, offline."),
    ).toBeTruthy();
  });

  it("selects the clicked node without recursing through parents", () => {
    const onSelect = vi.fn();
    renderCanvas({
      document: doc,
      pageId: page.id,
      artboardId: artboard.id,
      selectedId: null,
      onSelect,
      editable: true,
    });
    const heading = screen.getByText(
      "Design internal tools together, offline.",
    );
    fireEvent.click(heading);
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenLastCalledWith(
      "4a4d0000-0000-7000-8000-000000000307",
    );
  });

  it("marks the selected node with data-selected", () => {
    renderCanvas({
      document: doc,
      pageId: page.id,
      artboardId: artboard.id,
      selectedId: "4a4d0000-0000-7000-8000-000000000307",
      onSelect: () => undefined,
      editable: true,
    });
    const heading = screen.getByText(
      "Design internal tools together, offline.",
    );
    expect(heading.getAttribute("data-selected")).toBe("true");
  });

  it("Tab advances selection while Escape clears it", () => {
    const onSelect = vi.fn();
    renderCanvas({
      document: doc,
      pageId: page.id,
      artboardId: artboard.id,
      selectedId: null,
      onSelect,
      editable: true,
    });
    const region = screen.getByRole("region");
    fireEvent.keyDown(region, { key: "Tab" });
    expect(onSelect).toHaveBeenCalledWith(
      "4a4d0000-0000-7000-8000-000000000301",
    );
    fireEvent.keyDown(region, { key: "Escape" });
    expect(onSelect).toHaveBeenLastCalledWith(null);
  });

  it("read-only preview ignores clicks and keyboard navigation", () => {
    const onSelect = vi.fn();
    renderCanvas({
      document: doc,
      pageId: page.id,
      artboardId: artboard.id,
      selectedId: null,
      onSelect,
      editable: false,
    });
    fireEvent.click(screen.getByText("Blue Canvas"));
    fireEvent.keyDown(screen.getByRole("region"), { key: "Tab" });
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("scales the artboard when zoom controls change", () => {
    renderCanvas({
      document: doc,
      pageId: page.id,
      artboardId: artboard.id,
      selectedId: null,
      onSelect: () => undefined,
      editable: true,
    });
    const frame = document.querySelector(".bc-canvas-artboard");
    expect(frame?.getAttribute("data-zoom")).toBe("1");
    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    expect(frame?.getAttribute("data-zoom")).toBe("1.1");
    expect(frame?.getAttribute("style")).toContain("scale(1.1)");
  });

  it("localizes toolbar controls and missing artboard fallback", () => {
    renderCanvas(
      {
        document: doc,
        pageId: "missing-page",
        artboardId: "missing-artboard",
        selectedId: null,
        onSelect: () => undefined,
        editable: true,
      },
      "pt-BR",
    );
    expect(screen.getByText("Página não encontrada.")).toBeTruthy();

    renderCanvas(
      {
        document: doc,
        pageId: page.id,
        artboardId: artboard.id,
        selectedId: null,
        onSelect: () => undefined,
        editable: true,
      },
      "pt-BR",
    );
    expect(screen.getByRole("button", { name: "Aumentar zoom" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Diminuir zoom" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Ajustar canvas" })).toBeTruthy();
  });
});
