import { useCallback, useEffect, useState, type FormEvent } from "react";

import { ApiError } from "../api/client.js";
import type { TeamMember, TeamSummary } from "../api/types.js";
import { Dialog } from "../dialogs/Dialog.js";
import { useLocale } from "../state/locale.js";
import { useSession } from "../state/session.js";
import { ArrowUpRight, Plus, UsersRound, X } from "lucide-react";

export function Teams() {
  const { client } = useSession();
  const { messages } = useLocale();
  const [teams, setTeams] = useState<TeamSummary[] | null>(null);
  const [selected, setSelected] = useState<TeamSummary | null>(null);
  const [members, setMembers] = useState<TeamMember[] | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const result = await client.request<{ teams: TeamSummary[] }>({
        path: "/api/v1/teams",
      });
      setTeams(result.data.teams);
    } catch (raw) {
      setTeams([]);
      setError(
        raw instanceof ApiError ? raw.message : messages.common.errorPrefix,
      );
    }
  }, [client, messages.common.errorPrefix]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function createTeam(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try {
      await client.request({
        method: "POST",
        path: "/api/v1/teams",
        body: { name: name.trim() },
      });
      setName("");
      await refresh();
    } catch (raw) {
      setError(
        raw instanceof ApiError ? raw.message : messages.common.errorPrefix,
      );
    } finally {
      setBusy(false);
    }
  }

  async function openTeam(team: TeamSummary) {
    setSelected(team);
    setMembers(null);
    setError(null);
    try {
      const result = await client.request<{ members: TeamMember[] }>({
        path: `/api/v1/teams/${encodeURIComponent(team.id)}`,
      });
      setMembers(result.data.members);
    } catch (raw) {
      setError(
        raw instanceof ApiError ? raw.message : messages.common.errorPrefix,
      );
    }
  }

  async function addMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || !email.trim()) return;
    setBusy(true);
    try {
      await client.request({
        method: "POST",
        path: `/api/v1/teams/${encodeURIComponent(selected.id)}/members`,
        body: { email: email.trim(), role: "member" },
      });
      setEmail("");
      await openTeam(selected);
    } catch (raw) {
      setError(
        raw instanceof ApiError ? raw.message : messages.common.errorPrefix,
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="bc-screen bc-teams">
      <div className="bc-screen__intro">
        <div>
          <p className="bc-eyebrow">{messages.teams.kicker}</p>
          <h1 className="bc-screen__heading">{messages.teams.heading}</h1>
          <p className="bc-screen__lede">{messages.teams.lede}</p>
        </div>
        <div className="bc-screen__signal">
          <UsersRound size={15} aria-hidden="true" />{" "}
          {messages.teams.collaborationStatus}
        </div>
      </div>
      <div className="bc-create-panel">
        <div className="bc-create-panel__copy">
          <span className="bc-create-panel__icon">
            <Plus size={18} aria-hidden="true" />
          </span>
          <div>
            <h2>{messages.teams.createHeading}</h2>
            <p>{messages.teams.createDescription}</p>
          </div>
        </div>
        <form
          className="bc-form bc-form--inline"
          onSubmit={(event) => void createTeam(event)}
        >
          <label className="bc-visually-hidden" htmlFor="bc-team-name">
            {messages.teams.name}
          </label>
          <input
            id="bc-team-name"
            className="bc-input"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={messages.teams.name}
            maxLength={120}
            required
          />
          <button
            type="submit"
            className="bc-btn"
            data-variant="primary"
            disabled={busy || !name.trim()}
          >
            <Plus size={15} aria-hidden="true" />
            {messages.teams.createButton}
          </button>
        </form>
      </div>
      {error ? (
        <p className="bc-error" role="alert">
          {error}
        </p>
      ) : null}
      {teams === null ? (
        <div className="bc-project-list" aria-busy="true">
          <div className="bc-project-skeleton" />
          <div className="bc-project-skeleton" />
        </div>
      ) : teams.length === 0 ? (
        <div className="bc-empty-state">
          <UsersRound size={22} aria-hidden="true" />
          <p>{messages.teams.empty}</p>
        </div>
      ) : (
        <ul className="bc-project-list" aria-label={messages.teams.heading}>
          {teams.map((team) => (
            <li className="bc-project-card" key={team.id}>
              <div className="bc-project-card__topline">
                <span className="bc-project-card__icon">
                  <UsersRound size={17} />
                </span>
                <span className="bc-project-card__meta">{team.role}</span>
              </div>
              <div className="bc-project-card__name">{team.name}</div>
              <button
                type="button"
                className="bc-btn"
                onClick={() => void openTeam(team)}
              >
                <ArrowUpRight size={15} aria-hidden="true" />
                {messages.teams.open}
              </button>
            </li>
          ))}
        </ul>
      )}
      {selected ? (
        <Dialog
          title={selected.name}
          onClose={() => setSelected(null)}
          footer={
            <button
              type="button"
              className="bc-btn"
              onClick={() => setSelected(null)}
            >
              <X size={15} aria-hidden="true" />
              {messages.share.close}
            </button>
          }
        >
          <section className="bc-team-dialog__section">
            <h3>{messages.teams.members}</h3>
            {members === null ? (
              <p>{messages.common.loading}</p>
            ) : (
              <ul className="bc-member-list">
                {members.map((member) => (
                  <li key={member.userId}>
                    <span>
                      <strong>{member.displayName}</strong>
                      <small>{member.email}</small>
                    </span>
                    <span className="bc-project-card__meta">{member.role}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
          {selected.role !== "member" ? (
            <form
              className="bc-form"
              onSubmit={(event) => void addMember(event)}
            >
              <label htmlFor="bc-team-member-email">
                {messages.teams.inviteLabel}
                <input
                  id="bc-team-member-email"
                  className="bc-input"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="designer@empresa.com"
                  required
                />
              </label>
              <button
                type="submit"
                className="bc-btn"
                data-variant="primary"
                disabled={busy || !email.trim()}
              >
                <Plus size={15} aria-hidden="true" />
                {messages.teams.addMember}
              </button>
            </form>
          ) : null}
        </Dialog>
      ) : null}
    </section>
  );
}
