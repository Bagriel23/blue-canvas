import { useCallback, useEffect, useState } from "react";

import { ApiError } from "../api/client.js";
import { useLocale } from "../state/locale.js";
import { useSession } from "../state/session.js";

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

export function Library() {
  const { client } = useSession();
  const { messages } = useLocale();
  const [kits, setKits] = useState<LibraryKit[] | null>(null);
  const [templates, setTemplates] = useState<LibraryTemplate[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [kitResult, templateResult] = await Promise.all([
        client.request<{ kits: LibraryKit[] }>({
          path: "/api/v1/library/kits",
        }),
        client.request<{ templates: LibraryTemplate[] }>({
          path: "/api/v1/library/templates",
        }),
      ]);
      setKits(kitResult.data.kits);
      setTemplates(templateResult.data.templates);
    } catch (raw) {
      setError(raw instanceof ApiError ? raw.message : "Network error");
      setKits([]);
      setTemplates([]);
    }
  }, [client]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className="bc-screen">
      <h1 className="bc-screen__heading">{messages.library.heading}</h1>
      {error ? <p className="bc-error">{error}</p> : null}
      <div className="bc-card">
        <h2>{messages.library.kits}</h2>
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
      <div className="bc-card" style={{ marginTop: 16 }}>
        <h2>{messages.library.templates}</h2>
        {templates === null ? (
          <p>{messages.common.loading}</p>
        ) : templates.length === 0 ? (
          <p>{messages.library.empty}</p>
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
