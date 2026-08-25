import type { DesignDocument } from "@blue-canvas/document";
import { useLocale } from "../state/locale.js";

interface PagesPanelProps {
  document: DesignDocument;
  activePageId: string;
  activeArtboardId: string;
  onSelectArtboard: (pageId: string, artboardId: string) => void;
}

export function PagesPanel({
  document,
  activePageId,
  activeArtboardId,
  onSelectArtboard,
}: PagesPanelProps) {
  const { messages } = useLocale();
  return (
    <section
      className="bc-workspace__section"
      aria-label={messages.workspace.pages}
    >
      <h2>{messages.workspace.pages}</h2>
      <div className="bc-layers">
        {document.pages.map((page) => (
          <div key={page.id}>
            <div className="bc-project-card__meta">{page.name}</div>
            {page.artboards.map((artboard) => (
              <button
                type="button"
                key={artboard.id}
                className="bc-layer-row"
                data-selected={
                  page.id === activePageId && artboard.id === activeArtboardId
                    ? "true"
                    : "false"
                }
                onClick={() => onSelectArtboard(page.id, artboard.id)}
              >
                <span>{artboard.name}</span>
                <span className="bc-project-card__meta">
                  {artboard.width}×{artboard.height}
                </span>
              </button>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}
