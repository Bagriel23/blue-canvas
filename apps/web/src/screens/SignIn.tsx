import { useState, type FormEvent } from "react";

import { useLocale } from "../state/locale.js";
import { useSession } from "../state/session.js";

interface SignInProps {
  invitationToken?: string;
}

export function SignIn({ invitationToken }: SignInProps) {
  const { messages, locale } = useLocale();
  const { signIn, acceptInvitation, error, loading } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [token, setToken] = useState(invitationToken ?? "");

  const mode: "sign-in" | "invitation" =
    invitationToken || token ? "invitation" : "sign-in";

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (mode === "sign-in") {
      await signIn(email, password).catch(() => undefined);
    } else {
      await acceptInvitation({ token, displayName, password, locale }).catch(
        () => undefined,
      );
    }
  }

  return (
    <section className="bc-screen">
      <h1 className="bc-screen__heading">
        {mode === "sign-in"
          ? messages.auth.signInHeading
          : messages.auth.invitationHeading}
      </h1>
      <form className="bc-form" onSubmit={(event) => void handleSubmit(event)}>
        {mode === "invitation" ? (
          <>
            <label>
              <span>{messages.auth.invitationToken}</span>
              <input
                className="bc-input"
                value={token}
                onChange={(event) => setToken(event.target.value)}
                autoComplete="off"
              />
            </label>
            <label>
              <span>{messages.auth.displayName}</span>
              <input
                className="bc-input"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                autoComplete="name"
              />
            </label>
          </>
        ) : (
          <label>
            <span>{messages.auth.email}</span>
            <input
              className="bc-input"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="username"
            />
          </label>
        )}
        <label>
          <span>{messages.auth.password}</span>
          <input
            className="bc-input"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete={
              mode === "sign-in" ? "current-password" : "new-password"
            }
          />
        </label>
        {error ? <p className="bc-error">{error}</p> : null}
        <button
          type="submit"
          className="bc-btn"
          data-variant="primary"
          disabled={loading}
        >
          {messages.auth.submit}
        </button>
      </form>
    </section>
  );
}
