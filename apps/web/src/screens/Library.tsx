import { useCallback, useEffect, useState, type FormEvent } from "react";

import { ApiError } from "../api/client.js";
import { useLocale } from "../state/locale.js";
import { useSession } from "../state/session.js";
import { Boxes, FileCode2, PackageOpen } from "lucide-react";

interface LibraryProps {
  onOpen?: (projectId: string) => void;
}

interface LibraryKit {
  id: string;
  slug: string;
  version: string;
  displayName: string;
  description: string;
  status: string;
  publishedAt?: string;
  components: number;
  tokens: number;
}

interface LibraryTemplate {
  id: string;
  slug: string;
  version: string;
  displayName: string;
  description: string;
  status: string;
  category: string;
  kit: { kitSlug: string; kitVersion: string };
  compatible: boolean;
  incompatibleReason?: string;
}

interface ProjectTemplate {
  id: string;
  name: string;
  description: string;
  updatedAt: string;
}

export function Library({ onOpen }: LibraryProps) {
  const { client } = useSession();
  const { messages } = useLocale();
  const [kits, setKits] = useState<LibraryKit[] | null>(null);
  const [templates, setTemplates] = useState<LibraryTemplate[] | null>(null);
  const [projectTemplates, setProjectTemplates] = useState<
    ProjectTemplate[] | null
  >(null);
  const [activeTemplateId, setActiveTemplateId] = useState<string | null>(null);
  const [projectName, setProjectName] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [kitResult, templateResult, projectTemplateResult] =
        await Promise.all([
          client.request<{ kits: LibraryKit[] }>({
            path: "/api/v1/library/kits",
          }),
          client.request<{ templates: LibraryTemplate[] }>({
            path: "/api/v1/library/templates",
          }),
          client.request<{ templates: ProjectTemplate[] }>({
            path: "/api/v1/templates",
          }),
        ]);
      setKits(kitResult.data.kits);
      setTemplates(templateResult.data.templates);
      setProjectTemplates(projectTemplateResult.data.templates);
    } catch (raw) {
      setError(raw instanceof ApiError ? raw.message : "Network error");
      setKits([]);
      setTemplates([]);
      setProjectTemplates([]);
    }
  }, [client]);

  useEffect(() => {
    void load();
  }, [load]);

  async function createProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeTemplateId || !projectName.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const result = await client.request<{ project: { id: string } }>({
        method: "POST",
        path: `/api/v1/templates/${activeTemplateId}/projects`,
        body: { name: projectName.trim() },
      });
      setActiveTemplateId(null);
      setProjectName("");
      onOpen?.(result.data.project.id);
    } catch (raw) {
      setError(raw instanceof ApiError ? raw.message : "Network error");
    } finally {
      setCreating(false);
    }
  }

  return (
    <section className="bc-screen bc-library">
      <div className="bc-screen__intro">
        <div>
          <p className="bc-eyebrow">{messages.library.kicker}</p>
          <h1 className="bc-screen__heading">{messages.library.heading}</h1>
          <p className="bc-screen__lede">{messages.library.lede}</p>
        </div>
      </div>
      {error ? <p className="bc-error">{error}</p> : null}
      <div className="bc-library-section">
        <div className="bc-section-heading">
          <FileCode2 size={17} aria-hidden="true" />
          <h2>{messages.library.myTemplates}</h2>
        </div>
        {projectTemplates === null ? (
          <p>{messages.common.loading}</p>
        ) : projectTemplates.length === 0 ? (
          <div className="bc-empty-state">
            <PackageOpen size={22} aria-hidden="true" />
            <p>{messages.library.empty}</p>
          </div>
        ) : (
          <ul
            className="bc-project-list"
            aria-label={messages.library.myTemplates}
          >
            {projectTemplates.map((template) => (
              <li
                key={template.id}
                className="bc-project-card bc-template-card"
              >
                <div className="bc-project-card__name">{template.name}</div>
                <div className="bc-project-card__meta">
                  {template.description || messages.library.lede}
                </div>
                {activeTemplateId === template.id ? (
                  <form
                    className="bc-form bc-template-form"
                    onSubmit={(event) => void createProject(event)}
                  >
                    <label htmlFor={`bc-template-project-${template.id}`}>
                      {messages.library.projectName}
                    </label>
                    <input
                      id={`bc-template-project-${template.id}`}
                      className="bc-input"
                      value={projectName}
                      onChange={(event) => setProjectName(event.target.value)}
                      required
                      maxLength={120}
                      autoFocus
                    />
                    <div className="bc-template-form__actions">
                      <button
                        type="submit"
                        className="bc-btn"
                        data-variant="primary"
                        disabled={creating}
                      >
                        {messages.library.createProject}
                      </button>
                      <button
                        type="button"
                        className="bc-btn"
                        onClick={() => setActiveTemplateId(null)}
                      >
                        {messages.library.cancel}
                      </button>
                    </div>
                  </form>
                ) : (
                  <button
                    type="button"
                    className="bc-btn"
                    data-variant="primary"
                    onClick={() => setActiveTemplateId(template.id)}
                  >
                    {messages.library.useTemplate}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="bc-library-section">
        <div className="bc-section-heading">
          <Boxes size={17} aria-hidden="true" />
          <h2>{messages.library.kits}</h2>
        </div>
        {kits === null ? (
          <p>{messages.common.loading}</p>
        ) : kits.length === 0 ? (
          <p>{messages.library.empty}</p>
        ) : (
          <ul className="bc-project-list" aria-label={messages.library.kits}>
            {kits.map((kit) => (
              <li key={kit.id} className="bc-project-card">
                <div className="bc-project-card__name">{kit.displayName}</div>
                <div className="bc-project-card__meta">
                  {kit.slug}@{kit.version} · {kit.status}
                </div>
                <div className="bc-project-card__meta">{kit.description}</div>
                <div className="bc-project-card__meta">
                  {kit.components} components · {kit.tokens} tokens
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="bc-library-section">
        <div className="bc-section-heading">
          <FileCode2 size={17} aria-hidden="true" />
          <h2>{messages.library.templates}</h2>
        </div>
        {templates === null ? (
          <p>{messages.common.loading}</p>
        ) : templates.length === 0 ? (
          <div className="bc-empty-state">
            <PackageOpen size={22} aria-hidden="true" />
            <p>{messages.library.empty}</p>
          </div>
        ) : (
          <ul
            className="bc-project-list"
            aria-label={messages.library.templates}
          >
            {templates.map((template) => (
              <li key={template.id} className="bc-project-card">
                <div className="bc-project-card__name">
                  {template.displayName}
                </div>
                <div className="bc-project-card__meta">
                  {template.slug}@{template.version} · {template.category} ·{" "}
                  {template.status}
                </div>
                <div className="bc-project-card__meta">
                  {template.description}
                </div>
                <div className="bc-project-card__meta">
                  Requires {template.kit.kitSlug}@{template.kit.kitVersion}
                </div>
                {!template.compatible ? (
                  <div className="bc-error">
                    {template.incompatibleReason ?? "Incompatible kit"}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
