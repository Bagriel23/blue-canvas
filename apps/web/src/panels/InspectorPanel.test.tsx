import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { InspectorPanel } from "./InspectorPanel.js";
import { LocaleProvider } from "../state/locale.js";
import { loadDemoDocument } from "../fixtures/demo.js";
import { findNodeById } from "../canvas/selection.js";

const doc = loadDemoDocument();
const [page] = doc.pages;
if (!page) throw new Error("demo document missing pages");
const [artboard] = page.artboards;
if (!artboard) throw new Error("demo document missing artboards");
const heading = findNodeById(
  artboard.root,
  "4a4d0000-0000-7000-8000-000000000307",
);
if (!heading) throw new Error("heading node missing");
const headingNode = heading.node;

describe("InspectorPanel", () => {
  it("shows the empty state when nothing is selected", () => {
    render(
      <LocaleProvider initialLocale="pt-BR">
        <InspectorPanel
          node={null}
          onRename={() => undefined}
          onEditText={() => undefined}
          editable
        />
      </LocaleProvider>,
    );
    expect(
      screen.getByText(/Selecione um nó para ver suas propriedades/),
    ).toBeTruthy();
  });

  it("emits onRename when the name field changes", () => {
    const onRename = vi.fn();
    render(
      <LocaleProvider initialLocale="en-US">
        <InspectorPanel
          node={headingNode}
          onRename={onRename}
          onEditText={() => undefined}
          editable
        />
      </LocaleProvider>,
    );
    const input = screen.getByDisplayValue("Heading") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Hero title" } });
    expect(onRename).toHaveBeenCalledWith(headingNode.id, "Hero title");
  });

  it("locks controls when editable is false", () => {
    render(
      <LocaleProvider initialLocale="en-US">
        <InspectorPanel
          node={headingNode}
          onRename={() => undefined}
          onEditText={() => undefined}
          editable={false}
        />
      </LocaleProvider>,
    );
    const input = screen.getByDisplayValue("Heading") as HTMLInputElement;
    expect(input.readOnly).toBe(true);
  });
});
