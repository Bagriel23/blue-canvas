import { useState } from "react";

import { Dialog } from "./Dialog.js";
import { ApiError } from "../api/client.js";
import { useLocale } from "../state/locale.js";
import { useSession } from "../state/session.js";

interface ExportDialogProps {
  projectId: string;
  currentPageId: string;
  currentSelection: string | null;
  onClose: () => void;
}

type Scope = "project" | "page" | "selection";
type Target = "static" | "react" | "preact";

export function ExportDialog({
  projectId,
  currentPageId,
  currentSelection,
  onClose,
}: ExportDialogProps) {
  const { client } = useSession();
  const { messages } = useLocale();
  const [scope, setScope] = useState<Scope>("project");
  const [target, setTarget] = useState<Target>("static");
  const [state, setState] = useState<
    | { kind: "idle" }
    | { kind: "loading" }
    | { kind: "ready"; jobId: string }
    | { kind: "error"; message: string }
  >({ kind: "idle" });

  async function start() {
    setState({ kind: "loading" });
    try {
      const result = await client.request<{ jobId: string }>({
        method: "POST",
        path: `/api/v1/projects/${encodeURIComponent(projectId)}/exports`,
        body: {
          scope,
          target,
          pageId: scope === "page" ? currentPageId : undefined,
          nodeId: scope === "selection" ? currentSelection : undefined,
        },
      });
      setState({ kind: "ready", jobId: result.data.jobId });
    } catch (raw) {
      const message =
        raw instanceof ApiError ? raw.message : messages.common.errorPrefix;
      setState({ kind: "error", message });
    }
  }

  return (
    <Dialog
      title={messages.exportDialog.heading}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="bc-btn" onClick={onClose}>
            {messages.exportDialog.close}
          </button>
          <button
            type="button"
            className="bc-btn"
            data-variant="primary"
            onClick={() => void start()}
            disabled={
              state.kind === "loading" ||
              (scope === "selection" && !currentSelection)
            }
          >
            {messages.exportDialog.start}
          </button>
        </>
      }
    >
      <label>
        <span>Scope</span>
        <select
          className="bc-select"
          value={scope}
          onChange={(event) => setScope(event.target.value as Scope)}
        >
          <option value="project">{messages.exportDialog.scopeProject}</option>
          <option value="page">{messages.exportDialog.scopePage}</option>
          <option value="selection" disabled={!currentSelection}>
            {messages.exportDialog.scopeSelection}
          </option>
        </select>
      </label>
      <label>
        <span>Target</span>
        <select
          className="bc-select"
          value={target}
          onChange={(event) => setTarget(event.target.value as Target)}
        >
          <option value="static">{messages.exportDialog.targetStatic}</option>
          <option value="react">{messages.exportDialog.targetReact}</option>
          <option value="preact">{messages.exportDialog.targetPreact}</option>
        </select>
      </label>
      {state.kind === "error" ? (
        <p className="bc-error">{state.message}</p>
      ) : null}
      {state.kind === "ready" ? <p>Export job: {state.jobId}</p> : null}
    </Dialog>
  );
}
