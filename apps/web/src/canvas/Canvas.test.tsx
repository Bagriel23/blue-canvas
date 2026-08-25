import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Canvas } from "./Canvas.js";
import { loadDemoDocument } from "../fixtures/demo.js";

const doc = loadDemoDocument();
const [page] = doc.pages;
if (!page) throw new Error("demo document missing pages");
const [artboard] = page.artboards;
if (!artboard) throw new Error("demo document missing artboards");

describe("Canvas", () => {
  it("renders artboard as semantic DOM", () => {
    render(
      <Canvas
        document={doc}
        pageId={page.id}
        artboardId={artboard.id}
        selectedId={null}
        onSelect={() => undefined}
        editable
      />,
    );
    expect(screen.getByRole("button", { name: "Get started" })).toBeTruthy();
    expect(
      screen.getByText("Design internal tools together, offline."),
    ).toBeTruthy();
  });

  it("selects the clicked node without recursing through parents", () => {
    const onSelect = vi.fn();
    render(
      <Canvas
        document={doc}
        pageId={page.id}
        artboardId={artboard.id}
        selectedId={null}
        onSelect={onSelect}
        editable
      />,
    );
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
    render(
      <Canvas
        document={doc}
        pageId={page.id}
        artboardId={artboard.id}
        selectedId="4a4d0000-0000-7000-8000-000000000307"
        onSelect={() => undefined}
        editable
      />,
    );
    const heading = screen.getByText(
      "Design internal tools together, offline.",
    );
    expect(heading.getAttribute("data-selected")).toBe("true");
  });

  it("Tab advances selection while Escape clears it", () => {
    const onSelect = vi.fn();
    render(
      <Canvas
        document={doc}
        pageId={page.id}
        artboardId={artboard.id}
        selectedId={null}
        onSelect={onSelect}
        editable
      />,
    );
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
    render(
      <Canvas
        document={doc}
        pageId={page.id}
        artboardId={artboard.id}
        selectedId={null}
        onSelect={onSelect}
        editable={false}
      />,
    );
    fireEvent.click(screen.getByText("Blue Canvas"));
    fireEvent.keyDown(screen.getByRole("region"), { key: "Tab" });
    expect(onSelect).not.toHaveBeenCalled();
  });
});
