import { useMemo, useState } from "react";

import { Download, FileArchive, LoaderCircle } from "lucide-react";

import { ApiError } from "../api/client.js";
import type {
  ExportFileResponse,
  ExportResponse,
  ExportScope,
  ExportTarget,
} from "../api/types.js";
import { useLocale } from "../state/locale.js";
import { useSession } from "../state/session.js";
import { createDeterministicZip } from "../export/zip.js";
import { Dialog } from "./Dialog.js";

interface ExportDialogProps {
  projectId: string;
  currentPageId: string;
  currentSelection: string | null;
  onClose: () => void;
}

type Scope = "project" | "page" | "selection";
type Target = ExportTarget;
type ExportState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ready"; result: ExportResponse }
  | { kind: "error"; message: string };

function interpolate(template: string, count: number): string {
  return template.replace("{count}", String(count));
}

function decodeFile(file: ExportFileResponse): Uint8Array {
  if (file.base64 !== undefined) {
    const binary = globalThis.atob(file.base64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1)
      bytes[index] = binary.charCodeAt(index);
    return bytes;
  }
  return new TextEncoder().encode(file.content ?? "");
}

async function downloadResult(result: ExportResponse): Promise<void> {
  const archive = await createDeterministicZip(
    result.files.map((file) => ({ path: file.path, bytes: decodeFile(file) })),
  );
  const blob = new Blob([archive.buffer as ArrayBuffer], {
    type: "application/zip",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = result.archiveName;
  anchor.rel = "noopener";
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function ExportDialog({
  projectId,
  currentPageId,
  currentSelection,
  onClose,
}: ExportDialogProps) {
  const { client } = useSession();
  const { messages } = useLocale();
  const [scope, setScope] = useState<Scope>("project");
  const [target, setTarget] = useState<Target>("html");
  const [state, setState] = useState<ExportState>({ kind: "idle" });
  const warningCount =
    state.kind === "ready"
      ? state.result.diagnostics.filter(
          ({ severity }) => severity === "warning",
        ).length
      : 0;
  const scopeValue = useMemo<ExportScope | null>(() => {
    if (scope === "project") return { type: "project" };
    if (scope === "page") return { type: "page", pageId: currentPageId };
    return currentSelection
      ? { type: "selection", nodeIds: [currentSelection] }
      : null;
  }, [currentPageId, currentSelection, scope]);

  async function start(): Promise<void> {
    if (!scopeValue) return;
    setState({ kind: "loading" });
    try {
      const response = await client.request<ExportResponse>({
        method: "POST",
        path: `/api/v1/projects/${encodeURIComponent(projectId)}/exports`,
        body: { target, scope: scopeValue },
      });
      const fatal = response.data.diagnostics.find(
        ({ severity }) => severity === "error",
      );
      if (fatal) throw new Error(fatal.message);
      setState({ kind: "ready", result: response.data });
    } catch (raw) {
      const message =
        raw instanceof ApiError
          ? raw.message
          : raw instanceof Error
            ? raw.message
            : messages.common.errorPrefix;
      setState({ kind: "error", message });
    }
  }

  const isSelectionUnavailable = scope === "selection" && !currentSelection;
  const isPageUnavailable = scope === "page" && !currentPageId;
  const canStart =
    state.kind !== "loading" && !isSelectionUnavailable && !isPageUnavailable;
  const action =
    state.kind === "ready" ? (
      <button
        type="button"
        className="bc-btn"
        data-variant="primary"
        onClick={() => void downloadResult(state.result)}
      >
        <Download size={15} aria-hidden="true" />
        {messages.exportDialog.download}
      </button>
    ) : (
      <button
        type="button"
        className="bc-btn"
        data-variant="primary"
        onClick={() => void start()}
        disabled={!canStart}
      >
        {state.kind === "loading" ? (
          <LoaderCircle
            className="bc-export-spinner"
            size={15}
            aria-hidden="true"
          />
        ) : (
          <FileArchive size={15} aria-hidden="true" />
        )}
        {state.kind === "loading"
          ? messages.exportDialog.generating
          : messages.exportDialog.start}
      </button>
    );

  return (
    <Dialog
      title={messages.exportDialog.heading}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="bc-btn" onClick={onClose}>
            {messages.exportDialog.close}
          </button>
          {action}
        </>
      }
    >
      <div className="bc-export-dialog">
        <p className="bc-export-dialog__description">
          {messages.exportDialog.targetDescription}
        </p>
        <label htmlFor="bc-export-scope">
          {messages.exportDialog.scopeLabel}
          <select
            id="bc-export-scope"
            className="bc-select"
            value={scope}
            onChange={(event) => {
              setScope(event.target.value as Scope);
              setState({ kind: "idle" });
            }}
          >
            <option value="project">
              {messages.exportDialog.scopeProject}
            </option>
            <option value="page" disabled={!currentPageId}>
              {messages.exportDialog.scopePage}
            </option>
            <option value="selection" disabled={!currentSelection}>
              {messages.exportDialog.scopeSelection}
            </option>
          </select>
        </label>
        <label htmlFor="bc-export-target">
          {messages.exportDialog.targetLabel}
          <select
            id="bc-export-target"
            className="bc-select"
            value={target}
            onChange={(event) => {
              setTarget(event.target.value as Target);
              setState({ kind: "idle" });
            }}
          >
            <option value="html">{messages.exportDialog.targetStatic}</option>
            <option value="react">{messages.exportDialog.targetReact}</option>
            <option value="preact">{messages.exportDialog.targetPreact}</option>
          </select>
        </label>
        {isSelectionUnavailable ? (
          <p className="bc-error" role="alert">
            {messages.exportDialog.noSelection}
          </p>
        ) : null}
        {state.kind === "loading" ? (
          <div
            className="bc-export-progress"
            aria-live="polite"
            aria-busy="true"
          >
            <progress max={100} />
            <span>{messages.exportDialog.generating}</span>
          </div>
        ) : null}
        {state.kind === "error" ? (
          <p className="bc-error" role="alert">
            {messages.common.errorPrefix}: {state.message}
          </p>
        ) : null}
        {state.kind === "ready" ? (
          <section
            className="bc-export-summary"
            aria-labelledby="bc-export-summary-title"
          >
            <div className="bc-export-summary__header">
              <div>
                <p className="bc-eyebrow">{messages.exportDialog.preview}</p>
                <h3 id="bc-export-summary-title">
                  {messages.exportDialog.generated}
                </h3>
              </div>
              <span className="bc-export-summary__badge">ZIP</span>
            </div>
            <p>{messages.exportDialog.generatedDescription}</p>
            <div className="bc-export-summary__stats">
              <strong>
                {interpolate(
                  messages.exportDialog.fileCount,
                  state.result.files.length,
                )}
              </strong>
              {warningCount > 0 ? (
                <span>
                  {interpolate(messages.exportDialog.warnings, warningCount)}
                </span>
              ) : null}
            </div>
            {state.result.diagnostics.length > 0 ? (
              <ul className="bc-export-summary__diagnostics">
                {state.result.diagnostics.map((diagnostic) => (
                  <li key={`${diagnostic.code}:${diagnostic.nodeId ?? ""}`}>
                    {diagnostic.message}
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
        ) : null}
      </div>
    </Dialog>
  );
}
