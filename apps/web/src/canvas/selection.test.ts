import { describe, expect, it } from "vitest";

import { loadDemoDocument } from "../fixtures/demo.js";
import {
  currentArtboardRoot,
  findNodeById,
  flattenNodes,
  nextNodeId,
  previousNodeId,
} from "./selection.js";

const doc = loadDemoDocument();
const [page] = doc.pages;
if (!page) throw new Error("demo document missing pages");
const [artboard] = page.artboards;
if (!artboard) throw new Error("demo document missing artboards");
const root = artboard.root;

describe("selection helpers", () => {
  it("flattens the tree depth-first", () => {
    const flat = flattenNodes(root);
    const names = flat.map((entry) => entry.node.name);
    expect(names[0]).toBe("Page");
    expect(names).toContain("Header");
    expect(names).toContain("Label");
  });

  it("finds a node by id", () => {
    const target = "4a4d0000-0000-7000-8000-000000000307";
    const entry = findNodeById(root, target);
    expect(entry?.node.name).toBe("Heading");
    expect(entry?.parent?.name).toBe("Hero");
  });

  it("cycles selection forward and backward", () => {
    const flat = flattenNodes(root);
    const first = flat[0];
    const last = flat.at(-1);
    if (!first || !last) throw new Error("flat nodes missing");
    expect(nextNodeId(root, null)).toBe(first.node.id);
    expect(previousNodeId(root, first.node.id)).toBe(last.node.id);
    expect(nextNodeId(root, last.node.id)).toBe(first.node.id);
  });

  it("locates artboard roots by ids", () => {
    expect(currentArtboardRoot(doc, page.id, artboard.id)).toBe(root);
    expect(currentArtboardRoot(doc, "missing", artboard.id)).toBeNull();
  });
});
