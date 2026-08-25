import type { Artboard, DesignDocument } from "@blue-canvas/document";

import { Canvas } from "../canvas/Canvas.js";
import { useLocale } from "../state/locale.js";

interface PreviewModeProps {
  document: DesignDocument;
  pageId: string;
  artboard: Artboard;
  onExit: () => void;
}

export function PreviewMode({
  document,
  pageId,
  artboard,
  onExit,
}: PreviewModeProps) {
  const { messages } = useLocale();
  return (
    <div
      className="bc-preview"
      role="region"
      aria-label={messages.workspace.preview}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          marginBottom: 16,
        }}
      >
        <button type="button" className="bc-btn" onClick={onExit}>
          {messages.workspace.exitPreview}
        </button>
      </div>
      <Canvas
        document={document}
        pageId={pageId}
        artboardId={artboard.id}
        selectedId={null}
        onSelect={() => undefined}
        editable={false}
      />
    </div>
  );
}
