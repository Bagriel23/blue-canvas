import type { DesignNode } from "@blue-canvas/document";
import { useLocale } from "../state/locale.js";

interface InspectorPanelProps {
  node: DesignNode | null;
  onRename: (nodeId: string, name: string) => void;
  onEditText: (nodeId: string, text: string) => void;
  editable: boolean;
}

export function InspectorPanel({
  node,
  onRename,
  onEditText,
  editable,
}: InspectorPanelProps) {
  const { messages } = useLocale();
  if (!node) {
    return (
      <section
        className="bc-workspace__section"
        aria-label={messages.workspace.inspector}
      >
        <h2>{messages.workspace.inspector}</h2>
        <p className="bc-project-card__meta">
          {messages.workspace.noSelection}
        </p>
      </section>
    );
  }

  return (
    <div className="bc-inspector">
      <section className="bc-inspector__group" aria-label="Identity">
        <h2>{node.kind}</h2>
        <label>
          <span>Name</span>
          <input
            className="bc-input"
            value={node.name}
            readOnly={!editable}
            onChange={(event) => onRename(node.id, event.target.value)}
          />
        </label>
      </section>
      {node.kind === "text" ? (
        <section
          className="bc-inspector__group"
          aria-label={messages.workspace.text}
        >
          <h2>{messages.workspace.text}</h2>
          <label>
            <span>Content</span>
            <textarea
              className="bc-input"
              rows={3}
              value={node.text}
              readOnly={!editable}
              onChange={(event) => onEditText(node.id, event.target.value)}
            />
          </label>
        </section>
      ) : null}
      {node.kind === "stack" || node.kind === "grid" ? (
        <section
          className="bc-inspector__group"
          aria-label={messages.workspace.layout}
        >
          <h2>{messages.workspace.layout}</h2>
          <dl className="bc-inspector__field">
            {node.kind === "stack" ? (
              <>
                <dt>Direction</dt>
                <dd>{node.layout.direction}</dd>
                <dt>Align</dt>
                <dd>{node.layout.align}</dd>
                <dt>Justify</dt>
                <dd>{node.layout.justify}</dd>
                <dt>Gap</dt>
                <dd>
                  {typeof node.layout.gap === "number"
                    ? `${node.layout.gap}px`
                    : `{${node.layout.gap.token}}`}
                </dd>
              </>
            ) : (
              <>
                <dt>Columns</dt>
                <dd>{node.layout.columns.length}</dd>
                <dt>Rows</dt>
                <dd>{node.layout.rows.length}</dd>
              </>
            )}
          </dl>
        </section>
      ) : null}
      <section
        className="bc-inspector__group"
        aria-label={messages.workspace.style}
      >
        <h2>{messages.workspace.style}</h2>
        <dl className="bc-inspector__field">
          {node.style.background ? (
            <>
              <dt>Background</dt>
              <dd>
                {typeof node.style.background === "string"
                  ? node.style.background
                  : `{${node.style.background.token}}`}
              </dd>
            </>
          ) : null}
          {node.style.color ? (
            <>
              <dt>Color</dt>
              <dd>
                {typeof node.style.color === "string"
                  ? node.style.color
                  : `{${node.style.color.token}}`}
              </dd>
            </>
          ) : null}
          {node.style.fontSize !== undefined ? (
            <>
              <dt>Font size</dt>
              <dd>
                {typeof node.style.fontSize === "number"
                  ? `${node.style.fontSize}px`
                  : `{${node.style.fontSize.token}}`}
              </dd>
            </>
          ) : null}
        </dl>
      </section>
    </div>
  );
}
