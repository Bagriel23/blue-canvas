import { LocaleProvider, useLocale } from "./state/locale.js";
import { SessionProvider, useSession } from "./state/session.js";
import { ThemeProvider, useTheme } from "./state/theme.js";
import { parseRoute, serializeRoute } from "./router/router.js";
import { useRouter } from "./router/useRouter.js";
import { SignIn } from "./screens/SignIn.js";
import { Home } from "./screens/Home.js";
import { Library } from "./screens/Library.js";
import { Workspace } from "./screens/Workspace.js";
import { localeDisplayNames, uiLocales, type UiLocale } from "@blue-canvas/ui";

export function App() {
  return (
    <ThemeProvider>
      <LocaleProvider>
        <SessionProvider>
          <Shell />
        </SessionProvider>
      </LocaleProvider>
    </ThemeProvider>
  );
}

function Shell() {
  const { session, loading } = useSession();
  const { route, navigate } = useRouter();

  if (loading) {
    return (
      <div className="bc-app">
        <div className="bc-screen">Loading…</div>
      </div>
    );
  }

  if (route.name === "invitation" || (!session && route.name === "sign-in")) {
    return (
      <div className="bc-app">
        <Topbar signedIn={false} />
        <SignIn
          {...(route.name === "invitation" && route.token
            ? { invitationToken: route.token }
            : {})}
        />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="bc-app">
        <Topbar signedIn={false} />
        <SignIn />
      </div>
    );
  }

  return (
    <div className="bc-app">
      <Topbar signedIn />
      <main>
        {(() => {
          switch (route.name) {
            case "home":
              return (
                <Home
                  onOpen={(projectId) =>
                    navigate({ name: "workspace", projectId })
                  }
                />
              );
            case "library":
              return <Library />;
            case "workspace":
            case "share":
            case "export":
              return <Workspace projectId={route.projectId} />;
            default:
              return (
                <section className="bc-screen">
                  <a href={serializeRoute({ name: "home" })}>Home</a>
                </section>
              );
          }
        })()}
      </main>
    </div>
  );
}

function Topbar({ signedIn }: { signedIn: boolean }) {
  const { messages, locale, setLocale } = useLocale();
  const { preference, cycle } = useTheme();
  const { signOut } = useSession();
  const themeLabel =
    preference === "system"
      ? messages.app.themeSystem
      : preference === "light"
        ? messages.app.themeLight
        : messages.app.themeDark;
  return (
    <header className="bc-topbar">
      <div className="bc-topbar__brand">
        <span className="bc-topbar__logo" aria-hidden="true" />
        <a href={serializeRoute({ name: "home" })}>{messages.app.title}</a>
        {signedIn ? (
          <nav aria-label="Primary" style={{ marginLeft: 16 }}>
            <a
              href={serializeRoute({ name: "home" })}
              style={{ marginRight: 12 }}
            >
              {messages.home.heading}
            </a>
            <a href={serializeRoute({ name: "library" })}>
              {messages.library.heading}
            </a>
          </nav>
        ) : null}
      </div>
      <div className="bc-topbar__actions">
        <label className="bc-visually-hidden" htmlFor="bc-locale">
          {messages.app.localeLabel}
        </label>
        <select
          id="bc-locale"
          className="bc-select"
          value={locale}
          onChange={(event) => setLocale(event.target.value as UiLocale)}
          style={{ width: "auto" }}
        >
          {uiLocales.map((code) => (
            <option key={code} value={code}>
              {localeDisplayNames[code]}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="bc-btn"
          onClick={cycle}
          aria-pressed={preference !== "system"}
          title={themeLabel}
        >
          {themeLabel}
        </button>
        {signedIn ? (
          <button
            type="button"
            className="bc-btn"
            data-variant="ghost"
            onClick={() => void signOut()}
          >
            {messages.app.signOut}
          </button>
        ) : null}
      </div>
    </header>
  );
}

export { parseRoute };
