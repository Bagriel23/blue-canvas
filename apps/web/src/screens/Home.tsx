import { useCallback, useEffect, useState, type FormEvent } from "react";

import { ApiError } from "../api/client.js";
import { useLocale } from "../state/locale.js";
import { useSession } from "../state/session.js";
import type { ProjectSummary } from "../api/types.js";
import { serializeRoute } from "../router/router.js";

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
    <section className="bc-screen">
      <h1 className="bc-screen__heading">{messages.home.heading}</h1>
      <form className="bc-form" onSubmit={(event) => void handleCreate(event)}>
        <label>
          <span>{messages.home.projectName}</span>
          <input
            className="bc-input"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            minLength={1}
            maxLength={120}
          />
        </label>
        <button
          type="submit"
          className="bc-btn"
          data-variant="primary"
          disabled={creating || !name.trim()}
        >
          {messages.home.createButton}
        </button>
      </form>
      {error ? <p className="bc-error">{error}</p> : null}
      {projects === null ? (
        <p>{messages.common.loading}</p>
      ) : projects.length === 0 ? (
        <p>{messages.home.empty}</p>
      ) : (
        <ul className="bc-project-list" aria-label={messages.home.heading}>
          {projects.map((project) => (
            <li key={project.id} className="bc-project-card">
              <div className="bc-project-card__name">{project.name}</div>
              <div className="bc-project-card__meta">{project.role}</div>
              <a
                className="bc-btn"
                href={serializeRoute({
                  name: "workspace",
                  projectId: project.id,
                })}
              >
                {messages.home.open}
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
