import { useEffect, useState } from "react";

import { Dialog } from "./Dialog.js";
import { useLocale } from "../state/locale.js";
import { useSession } from "../state/session.js";
import type {
  PersonalAccessTokenSummary,
  ProjectMember,
} from "../api/types.js";

interface ShareDialogProps {
  projectId: string;
  onClose: () => void;
}

export function ShareDialog({ projectId, onClose }: ShareDialogProps) {
  const { client } = useSession();
  const { messages } = useLocale();
  const [members, setMembers] = useState<ProjectMember[] | null>(null);
  const [tokens, setTokens] = useState<PersonalAccessTokenSummary[] | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [memberResult, tokenResult] = await Promise.all([
          client.request<{ members: ProjectMember[] }>({
            path: `/api/v1/projects/${encodeURIComponent(projectId)}/members`,
          }),
          client.request<{ tokens: PersonalAccessTokenSummary[] }>({
            path: "/api/v1/personal-access-tokens",
          }),
        ]);
        if (cancelled) return;
        setMembers(memberResult.data.members);
        setTokens(tokenResult.data.tokens);
      } catch (raw) {
        if (!cancelled) {
          setError(raw instanceof Error ? raw.message : "Unknown error");
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [client, projectId]);

  return (
    <Dialog
      title={messages.share.heading}
      onClose={onClose}
      footer={
        <button type="button" className="bc-btn" onClick={onClose}>
          {messages.share.close}
        </button>
      }
    >
      <section>
        <h3>{messages.share.members}</h3>
        {error ? <p className="bc-error">{error}</p> : null}
        {!members ? (
          <p>{messages.common.loading}</p>
        ) : members.length === 0 ? (
          <p>—</p>
        ) : (
          <ul>
            {members.map((member) => (
              <li key={member.userId}>
                {member.displayName} — {member.role}
              </li>
            ))}
          </ul>
        )}
      </section>
      <section>
        <h3>{messages.share.tokens}</h3>
        {!tokens ? (
          <p>{messages.common.loading}</p>
        ) : tokens.length === 0 ? (
          <p>—</p>
        ) : (
          <ul>
            {tokens.map((token) => (
              <li key={token.id}>
                {token.name} — {token.scopes.join(", ")}
              </li>
            ))}
          </ul>
        )}
      </section>
    </Dialog>
  );
}
