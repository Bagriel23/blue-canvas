import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { LayersPanel } from "./LayersPanel.js";
import { LocaleProvider } from "../state/locale.js";
import { loadDemoDocument } from "../fixtures/demo.js";

const doc = loadDemoDocument();
const [page] = doc.pages;
if (!page) throw new Error("demo document missing pages");
const [artboard] = page.artboards;
if (!artboard) throw new Error("demo document missing artboards");
const root = artboard.root;

function renderWith(selectedId: string | null, onSelect = vi.fn()) {
  return {
    ...render(
      <LocaleProvider initialLocale="en-US">
        <LayersPanel root={root} selectedId={selectedId} onSelect={onSelect} />
      </LocaleProvider>,
    ),
    onSelect,
  };
}

describe("LayersPanel", () => {
  it("renders each node from the tree", () => {
    renderWith(null);
    expect(screen.getByRole("treeitem", { name: /Page/ })).toBeTruthy();
    expect(screen.getByRole("treeitem", { name: /Hero/ })).toBeTruthy();
    expect(screen.getByRole("treeitem", { name: /Label/ })).toBeTruthy();
  });

  it("marks the selected row", () => {
    renderWith("4a4d0000-0000-7000-8000-000000000306");
    const hero = screen.getByRole("treeitem", { name: /Hero/ });
    expect(hero.getAttribute("aria-selected")).toBe("true");
  });

  it("fires onSelect when a row is clicked", () => {
    const { onSelect } = renderWith(null);
    fireEvent.click(screen.getByRole("treeitem", { name: /Heading/ }));
    expect(onSelect).toHaveBeenCalledWith(
      "4a4d0000-0000-7000-8000-000000000307",
    );
  });
});
