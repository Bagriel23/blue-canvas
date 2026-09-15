import { useEffect, useState, type FormEvent } from "react";

import { Dialog } from "./Dialog.js";
import { useLocale } from "../state/locale.js";
import { useSession } from "../state/session.js";
import type {
  PersonalAccessTokenSummary,
  ProjectMember,
} from "../api/types.js";
import { Copy, Plus, Trash2 } from "lucide-react";

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
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"editor" | "commenter" | "viewer">("editor");
  const [invitationLink, setInvitationLink] = useState<string | null>(null);

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

  async function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!email.trim()) return;
    setError(null);
    try {
      const result = await client.request<{ manualLink: string }>({
        method: "POST",
        path: `/api/v1/projects/${encodeURIComponent(projectId)}/invitations`,
        body: { email: email.trim(), role },
      });
      setInvitationLink(result.data.manualLink);
      setEmail("");
    } catch (raw) {
      setError(raw instanceof Error ? raw.message : "Unknown error");
    }
  }

  async function remove(userId: string) {
    try {
      await client.request({
        method: "DELETE",
        path: `/api/v1/projects/${encodeURIComponent(projectId)}/members/${encodeURIComponent(userId)}`,
      });
      setMembers(
        (current) =>
          current?.filter((member) => member.userId !== userId) ?? current,
      );
    } catch (raw) {
      setError(raw instanceof Error ? raw.message : "Unknown error");
    }
  }

  async function copyLink() {
    if (!invitationLink || !navigator.clipboard) return;
    await navigator.clipboard.writeText(
      `${window.location.origin}${invitationLink}`,
    );
  }

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
          <ul className="bc-member-list">
            {members.map((member) => (
              <li key={member.userId}>
                <span>
                  <strong>{member.displayName}</strong>
                  <small>{member.email}</small>
                </span>
                <span className="bc-member-list__actions">
                  <span className="bc-project-card__meta">{member.role}</span>
                  {member.role !== "owner" ? (
                    <button
                      type="button"
                      className="bc-icon-btn bc-icon-btn--small"
                      onClick={() => void remove(member.userId)}
                      aria-label={messages.share.remove}
                      title={messages.share.remove}
                    >
                      <Trash2 size={14} aria-hidden="true" />
                    </button>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
      <form
        className="bc-form bc-share-form"
        onSubmit={(event) => void invite(event)}
      >
        <label htmlFor="bc-share-email">
          {messages.share.inviteEmail}
          <input
            id="bc-share-email"
            className="bc-input"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="designer@empresa.com"
            required
          />
        </label>
        <label htmlFor="bc-share-role">
          {messages.share.inviteRole}
          <select
            id="bc-share-role"
            className="bc-select"
            value={role}
            onChange={(event) => setRole(event.target.value as typeof role)}
          >
            <option value="editor">Editor</option>
            <option value="commenter">Commenter</option>
            <option value="viewer">Viewer</option>
          </select>
        </label>
        <button
          type="submit"
          className="bc-btn"
          data-variant="primary"
          disabled={!email.trim()}
        >
          <Plus size={15} aria-hidden="true" />
          {messages.share.invite}
        </button>
      </form>
      {invitationLink ? (
        <div className="bc-share-link">
          <p>{messages.share.invitationCreated}</p>
          <code>{invitationLink}</code>
          <button
            type="button"
            className="bc-icon-btn bc-icon-btn--small"
            onClick={() => void copyLink()}
            aria-label="Copy invitation link"
            title="Copy invitation link"
          >
            <Copy size={14} aria-hidden="true" />
          </button>
        </div>
      ) : null}
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
