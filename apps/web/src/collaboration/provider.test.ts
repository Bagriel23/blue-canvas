import { describe, expect, it } from "vitest";
import * as Y from "yjs";

import {
  readSemanticDocument,
  replaceSemanticDocument,
} from "@blue-canvas/collaboration";
import { loadDemoDocument } from "../fixtures/demo.js";
import { applySemanticDocument, collaborationUrl } from "./provider.js";

describe("web collaboration adapter", () => {
  it("keeps the semantic document in the shared Yjs root", () => {
    const ydoc = new Y.Doc();
    const initial = loadDemoDocument();
    replaceSemanticDocument(ydoc, initial);
    applySemanticDocument(ydoc, { ...initial, name: "Updated together" });
    expect(readSemanticDocument(ydoc).name).toBe("Updated together");
    ydoc.destroy();
  });

  it("builds a websocket endpoint from the current origin", () => {
    expect(collaborationUrl()).toMatch(/\/api\/v1\/collaboration$/);
  });
});
