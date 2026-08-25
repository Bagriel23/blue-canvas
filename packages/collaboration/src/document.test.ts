import { createDesignDocument } from "@blue-canvas/document";
import { describe, expect, it } from "vitest";
import * as Y from "yjs";

import {
  applyCollaborationState,
  createInitialCollaborationDocument,
  encodeCollaborationState,
  readSemanticDocument,
  replaceSemanticDocument,
  validateProspectiveUpdate,
} from "./document.js";

const PROJECT_ID = "00000000-0000-4000-8000-000000000001";

describe("collaboration document codec", () => {
  it("creates a valid deterministic empty semantic document", () => {
    const document = createInitialCollaborationDocument(PROJECT_ID, "Project");

    expect(readSemanticDocument(document)).toEqual({
      schemaVersion: 1,
      id: PROJECT_ID,
      name: "Project",
      tokens: {},
      variables: {},
      components: [],
      pages: [],
    });
  });

  it("round-trips a compact full Yjs state and state vector", () => {
    const source = createInitialCollaborationDocument(PROJECT_ID, "Project");
    source.getMap("presence-independent-content").set("title", "Shared");

    const encoded = encodeCollaborationState(source);
    const restored = new Y.Doc();
    applyCollaborationState(restored, encoded.state);

    expect(readSemanticDocument(restored).name).toBe("Project");
    expect(restored.getMap("presence-independent-content").get("title")).toBe(
      "Shared",
    );
    expect(encoded.stateVector).toEqual(Y.encodeStateVector(restored));
  });

  it("validates semantic replacements at the authoritative boundary", () => {
    const yDocument = createInitialCollaborationDocument(PROJECT_ID, "Project");
    const replacement = createDesignDocument("Replacement", {
      randomUUID: () => PROJECT_ID,
    });

    replaceSemanticDocument(yDocument, replacement);
    expect(readSemanticDocument(yDocument).name).toBe("Replacement");
    expect(() =>
      yDocument.getMap("blueCanvas").set("document", { arbitrary: true }),
    ).not.toThrow();
    expect(() => readSemanticDocument(yDocument)).toThrow();
    expect(() => encodeCollaborationState(yDocument)).toThrow();
  });

  it("rejects malformed and oversized persisted states", () => {
    const target = new Y.Doc();
    expect(() =>
      applyCollaborationState(target, new Uint8Array([255])),
    ).toThrow();
    expect(() =>
      applyCollaborationState(target, new Uint8Array(8 * 1024 * 1024 + 1)),
    ).toThrow(/limit/i);
  });

  it("validates prospective updates and a 1,000-entry collaboration target", () => {
    const server = createInitialCollaborationDocument(PROJECT_ID, "Project");
    const client = new Y.Doc();
    applyCollaborationState(client, Y.encodeStateAsUpdate(server));
    const before = Y.encodeStateVector(client);
    for (let index = 0; index < 1_000; index += 1) {
      client.getMap("content").set(`node-${index}`, { index, visible: true });
    }
    const update = Y.encodeStateAsUpdate(client, before);

    expect(() => validateProspectiveUpdate(server, update)).not.toThrow();
    Y.applyUpdate(server, update);
    expect(server.getMap("content").size).toBe(1_000);

    const invalidClient = new Y.Doc();
    applyCollaborationState(invalidClient, Y.encodeStateAsUpdate(server));
    const invalidBefore = Y.encodeStateVector(invalidClient);
    invalidClient.getMap("blueCanvas").set("document", { arbitrary: true });
    expect(() =>
      validateProspectiveUpdate(
        server,
        Y.encodeStateAsUpdate(invalidClient, invalidBefore),
      ),
    ).toThrow();
  });
});
