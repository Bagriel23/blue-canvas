import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { DesignDocument, DesignNode } from "@blue-canvas/document";

import { loadDemoDocument } from "../fixtures/demo.js";
import { findNodeById } from "../canvas/selection.js";
import { LocaleProvider } from "../state/locale.js";
import { PreviewMode } from "./PreviewMode.js";

const secondPageId = "4a4d0000-0000-7000-8000-000000000401";
const secondArtboardId = "4a4d0000-0000-7000-8000-000000000402";
const secondRootId = "4a4d0000-0000-7000-8000-000000000403";
const overlayId = "4a4d0000-0000-7000-8000-000000000404";
const conditionalId = "4a4d0000-0000-7000-8000-000000000405";
const overlayMessageId = "4a4d0000-0000-7000-8000-000000000406";
const conditionalMessageId = "4a4d0000-0000-7000-8000-000000000407";

function textNode(id: string, name: string, text: string): DesignNode {
  return { id, kind: "text", name, visible: true, style: {}, text };
}

function interactiveDocument(): DesignDocument {
  const document = structuredClone(loadDemoDocument());
  const page = document.pages[0];
  if (!page) throw new Error("demo document missing page");
  const artboard = page.artboards[0];
  if (!artboard) throw new Error("demo document missing artboard");
  const button = findNodeById(
    artboard.root,
    "4a4d0000-0000-7000-8000-000000000304",
  )?.node;
  if (!button || button.kind !== "button") {
    throw new Error("demo document missing primary button");
  }
  button.interactions = [
    {
      trigger: "click",
      action: { type: "set-variable", variable: "subscribed", value: true },
    },
    { trigger: "click", action: { type: "open-overlay", overlayId } },
  ];
  const root = artboard.root;
  if (root.kind !== "stack") throw new Error("demo root must be a stack");
  const link: DesignNode = {
    id: "4a4d0000-0000-7000-8000-000000000309",
    kind: "link",
    name: "Details link",
    visible: true,
    style: {},
    href: "#details",
    interactions: [
      {
        trigger: "click",
        action: { type: "navigate", pageId: secondPageId },
      },
    ],
    children: [
      textNode(
        "4a4d0000-0000-7000-8000-000000000310",
        "Details link text",
        "Details",
      ),
    ],
  };
  root.children.push(link);
  root.children.push(
    {
      id: overlayId,
      kind: "overlay",
      name: "Confirmation dialog",
      visible: false,
      style: {},
      interactions: [{ trigger: "click", action: { type: "close-overlay" } }],
      children: [textNode(overlayMessageId, "Dialog message", "Saved")],
    },
    {
      id: conditionalId,
      kind: "conditional",
      name: "Conditional message",
      visible: true,
      style: {},
      variable: "subscribed",
      equals: true,
      whenTrue: [textNode(conditionalMessageId, "Visible message", "Enabled")],
      whenFalse: [],
    },
  );
  const secondPage = {
    id: secondPageId,
    name: "Details",
    artboards: [
      {
        id: secondArtboardId,
        name: "Desktop",
        width: 1200,
        height: 720,
        breakpoint: { name: "desktop", minWidth: 1024 },
        root: textNode(secondRootId, "Details heading", "Details page"),
      },
    ],
  };
  document.pages.push(secondPage);

  return document;
}

function renderPreview(document: DesignDocument, onExit = vi.fn()) {
  const page = document.pages[0];
  if (!page) throw new Error("document missing page");
  const artboard = page.artboards[0];
  if (!artboard) throw new Error("document missing artboard");
  return render(
    <LocaleProvider initialLocale="en-US">
      <PreviewMode
        document={document}
        pageId={page.id}
        artboard={artboard}
        onExit={onExit}
      />
    </LocaleProvider>,
  );
}

describe("PreviewMode", () => {
  it("navigates between document pages and returns with the back action", () => {
    const document = interactiveDocument();
    renderPreview(document);

    fireEvent.click(screen.getByRole("link", { name: "Details" }));
    expect(screen.getByText("Details page")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Back" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(
      screen.getByText("Design internal tools together, offline."),
    ).toBeTruthy();
  });

  it("executes variable and overlay actions while keeping overlays closed initially", () => {
    const document = interactiveDocument();
    renderPreview(document);

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByText("Enabled")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Get started" }));

    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByText("Saved")).toBeTruthy();
    expect(screen.getByText("Enabled")).toBeTruthy();

    fireEvent.click(screen.getByRole("dialog"));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
