import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { DesignDocument, DesignNode } from "@blue-canvas/document";

import { loadDemoDocument } from "../fixtures/demo.js";
import { findNodeById } from "../canvas/selection.js";
import { LocaleProvider } from "../state/locale.js";
import { isSafePreviewUrl, PreviewMode } from "./PreviewMode.js";

const secondPageId = "4a4d0000-0000-7000-8000-000000000401";
const secondArtboardId = "4a4d0000-0000-7000-8000-000000000402";
const secondRootId = "4a4d0000-0000-7000-8000-000000000403";
const overlayId = "4a4d0000-0000-7000-8000-000000000404";
const conditionalId = "4a4d0000-0000-7000-8000-000000000405";
const overlayMessageId = "4a4d0000-0000-7000-8000-000000000406";
const conditionalMessageId = "4a4d0000-0000-7000-8000-000000000407";
const componentId = "4a4d0000-0000-7000-8000-000000000408";
const componentRootId = "4a4d0000-0000-7000-8000-000000000409";
const componentButtonId = "4a4d0000-0000-7000-8000-000000000410";
const componentButtonTextId = "4a4d0000-0000-7000-8000-000000000411";
const componentInstanceId = "4a4d0000-0000-7000-8000-000000000412";
const formId = "4a4d0000-0000-7000-8000-000000000413";
const inputId = "4a4d0000-0000-7000-8000-000000000414";
const formConditionalId = "4a4d0000-0000-7000-8000-000000000415";
const formMessageId = "4a4d0000-0000-7000-8000-000000000416";
const submitButtonId = "4a4d0000-0000-7000-8000-000000000417";
const submitLabelId = "4a4d0000-0000-7000-8000-000000000418";

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
    {
      id: formId,
      kind: "form",
      name: "Search form",
      visible: true,
      style: {},
      interactions: [
        {
          trigger: "submit",
          action: {
            type: "filter-collection",
            collection: "items",
            variable: "query",
          },
        },
      ],
      children: [
        {
          id: inputId,
          kind: "input",
          name: "Search",
          visible: true,
          style: {},
          inputType: "text",
          variable: "query",
          placeholder: "Search",
        },
        {
          id: submitButtonId,
          kind: "button",
          name: "Apply filter",
          visible: true,
          style: {},
          buttonType: "submit",
          children: [
            textNode(submitLabelId, "Apply filter label", "Apply filter"),
          ],
        },
      ],
    },
    {
      id: formConditionalId,
      kind: "conditional",
      name: "Search result",
      visible: true,
      style: {},
      variable: "query",
      equals: "Blue",
      whenTrue: [textNode(formMessageId, "Search result", "Filter applied")],
      whenFalse: [],
    },
  );
  document.components.push({
    id: componentId,
    name: "Interactive component",
    root: {
      id: componentRootId,
      kind: "stack",
      name: "Component root",
      visible: true,
      style: {},
      layout: {
        direction: "column",
        gap: 8,
        align: "start",
        justify: "start",
        wrap: "nowrap",
      },
      children: [
        {
          id: componentButtonId,
          kind: "button",
          name: "Component action",
          visible: true,
          style: {},
          buttonType: "button",
          interactions: [
            { trigger: "click", action: { type: "open-overlay", overlayId } },
          ],
          children: [
            textNode(
              componentButtonTextId,
              "Component action label",
              "Open from component",
            ),
          ],
        },
      ],
    },
  });
  root.children.push({
    id: componentInstanceId,
    kind: "component-instance",
    name: "Interactive component instance",
    visible: true,
    style: {},
    componentId,
  });
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

function renderPreview(
  document: DesignDocument,
  onExit = vi.fn(),
  locale: "en-US" | "pt-BR" | "ko-KR" = "en-US",
) {
  const page = document.pages[0];
  if (!page) throw new Error("document missing page");
  const artboard = page.artboards[0];
  if (!artboard) throw new Error("document missing artboard");
  return render(
    <LocaleProvider initialLocale={locale}>
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

  it("resets navigation, variables, and overlays to the initial preview state", () => {
    const document = interactiveDocument();
    renderPreview(document);

    fireEvent.click(screen.getByRole("button", { name: "Get started" }));
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByText("Enabled")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Reset preview" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByText("Enabled")).toBeNull();
    expect(
      screen.getByText("Design internal tools together, offline."),
    ).toBeTruthy();
  });

  it("uses the current form value for filter actions instead of the empty action value", () => {
    const document = interactiveDocument();
    renderPreview(document);

    const input = screen.getByPlaceholderText("Search");
    expect(input.getAttribute("name")).toBe("query");
    fireEvent.change(input, { target: { value: "Blue" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply filter" }));

    expect(screen.getByText("Filter applied")).toBeTruthy();
  });

  it("converts a number input submitted from a form before setting its variable", () => {
    const document = interactiveDocument();
    const page = document.pages[0];
    if (!page) throw new Error("document missing page");
    const root = page.artboards[0]?.root;
    if (!root || root.kind !== "stack")
      throw new Error("document root missing");
    const form = root.children.find((node) => node.id === formId);
    if (!form || form.kind !== "form") throw new Error("form missing");
    form.interactions = [
      {
        trigger: "submit",
        action: { type: "set-variable", variable: "count", value: 0 },
      },
    ];
    document.variables.count = { type: "number", value: 0 };
    root.children.push({
      id: "4a4d0000-0000-7000-8000-000000000419",
      kind: "conditional",
      name: "Count result",
      visible: true,
      style: {},
      variable: "count",
      equals: 42,
      whenTrue: [
        textNode(
          "4a4d0000-0000-7000-8000-000000000420",
          "Count result",
          "Number accepted",
        ),
      ],
      whenFalse: [],
    });
    const input = form.children[0];
    if (!input || input.kind !== "input") throw new Error("input missing");
    input.inputType = "number";
    input.variable = "count";
    renderPreview(document);
    const renderedInput = screen.getByPlaceholderText("Search");
    fireEvent.change(renderedInput, { target: { value: "42" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply filter" }));

    expect(screen.getByText("Number accepted")).toBeTruthy();
  });

  it("executes interactions declared inside rendered component instances", () => {
    const document = interactiveDocument();
    renderPreview(document);

    fireEvent.click(
      screen.getByRole("button", { name: "Open from component" }),
    );
    expect(screen.getByText("Saved")).toBeTruthy();
  });

  it.each([
    ["pt-BR", "Voltar"],
    ["ko-KR", "뒤로"],
  ] as const)("localizes preview controls for %s", (locale, backLabel) => {
    const document = interactiveDocument();
    renderPreview(document, vi.fn(), locale);
    fireEvent.click(screen.getByRole("link", { name: "Details" }));
    expect(screen.getByRole("button", { name: backLabel })).toBeTruthy();
  });

  it("allows only safe external URL schemes in preview actions", () => {
    expect(isSafePreviewUrl("https://example.com/docs")).toBe(true);
    expect(isSafePreviewUrl("mailto:design@example.com")).toBe(true);
    expect(isSafePreviewUrl("javascript:alert(1)")).toBe(false);
    expect(isSafePreviewUrl("data:text/html,<script>alert(1)</script>")).toBe(
      false,
    );
  });
});
