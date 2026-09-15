import { useCallback, useEffect, useState, type FormEvent } from "react";

import { ApiError } from "../api/client.js";
import { useLocale } from "../state/locale.js";
import { useSession } from "../state/session.js";
import type { ProjectSummary } from "../api/types.js";
import { serializeRoute } from "../router/router.js";
import { ArrowUpRight, FolderKanban, Plus } from "lucide-react";

interface HomeProps {
  onOpen: (projectId: string) => void;
}

export function Home({ onOpen }: HomeProps) {
  const { client } = useSession();
  const { messages } = useLocale();
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const result = await client.request<{ projects: ProjectSummary[] }>({
        path: "/api/v1/projects",
      });
      setProjects(result.data.projects);
    } catch (raw) {
      setError(raw instanceof ApiError ? raw.message : "Network error");
      setProjects([]);
    }
  }, [client]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const result = await client.request<{ project: ProjectSummary }>({
        method: "POST",
        path: "/api/v1/projects",
        body: { name: name.trim() },
      });
      setName("");
      await refresh();
      onOpen(result.data.project.id);
    } catch (raw) {
      setError(raw instanceof ApiError ? raw.message : "Network error");
    } finally {
      setCreating(false);
    }
  }

  return (
    <section className="bc-screen bc-home">
      <div className="bc-screen__intro">
        <div>
          <p className="bc-eyebrow">{messages.home.kicker}</p>
          <h1 className="bc-screen__heading">{messages.home.heading}</h1>
          <p className="bc-screen__lede">{messages.home.lede}</p>
        </div>
        <div
          className="bc-screen__signal"
          aria-label={messages.home.studioStatus}
        >
          <span className="bc-status-dot" aria-hidden="true" />
          <span>{messages.home.studioStatus}</span>
        </div>
      </div>
      <div className="bc-create-panel">
        <div className="bc-create-panel__copy">
          <span className="bc-create-panel__icon" aria-hidden="true">
            <Plus size={18} />
          </span>
          <div>
            <h2>{messages.home.createHeading}</h2>
            <p>{messages.home.createDescription}</p>
          </div>
        </div>
        <form
          className="bc-form bc-form--inline"
          onSubmit={(event) => void handleCreate(event)}
        >
          <label className="bc-visually-hidden" htmlFor="bc-project-name">
            {messages.home.projectName}
          </label>
          <input
            id="bc-project-name"
            className="bc-input"
            placeholder={messages.home.projectName}
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            minLength={1}
            maxLength={120}
          />
          <button
            type="submit"
            className="bc-btn"
            data-variant="primary"
            disabled={creating || !name.trim()}
          >
            <Plus size={15} aria-hidden="true" />
            {messages.home.createButton}
          </button>
        </form>
      </div>
      {error ? <p className="bc-error">{error}</p> : null}
      {projects === null ? (
        <div
          className="bc-project-list"
          aria-busy="true"
          aria-label={messages.common.loading}
        >
          {[1, 2, 3].map((item) => (
            <div className="bc-project-skeleton" key={item} />
          ))}
        </div>
      ) : projects.length === 0 ? (
        <div className="bc-empty-state">
          <FolderKanban size={22} aria-hidden="true" />
          <p>{messages.home.empty}</p>
        </div>
      ) : (
        <ul className="bc-project-list" aria-label={messages.home.heading}>
          {projects.map((project) => (
            <li key={project.id} className="bc-project-card">
              <div className="bc-project-card__topline">
                <span className="bc-project-card__icon" aria-hidden="true">
                  <FolderKanban size={17} />
                </span>
                <span className="bc-project-card__meta">{project.role}</span>
              </div>
              <div className="bc-project-card__name">{project.name}</div>
              <a
                className="bc-btn"
                href={serializeRoute({
                  name: "workspace",
                  projectId: project.id,
                })}
              >
                <ArrowUpRight size={15} aria-hidden="true" />
                {messages.home.open}
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
