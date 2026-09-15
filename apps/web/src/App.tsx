import { useState } from "react";

import { LocaleProvider, useLocale } from "./state/locale.js";
import { SessionProvider, useSession } from "./state/session.js";
import { ThemeProvider, useTheme } from "./state/theme.js";
import { parseRoute, serializeRoute } from "./router/router.js";
import { useRouter } from "./router/useRouter.js";
import { SignIn } from "./screens/SignIn.js";
import { Home } from "./screens/Home.js";
import { Library } from "./screens/Library.js";
import { Teams } from "./screens/Teams.js";
import { Workspace } from "./screens/Workspace.js";
import { localeDisplayNames, uiLocales, type UiLocale } from "@blue-canvas/ui";
import {
  FolderKanban,
  Library as LibraryIcon,
  LogOut,
  Menu,
  Monitor,
  Moon,
  PanelsTopLeft,
  Sun,
  X,
  UsersRound,
} from "lucide-react";

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
        <AppLoading />
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
              return (
                <Library
                  onOpen={(projectId) =>
                    navigate({ name: "workspace", projectId })
                  }
                />
              );
            case "teams":
              return <Teams />;
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

export function Topbar({ signedIn }: { signedIn: boolean }) {
  const { messages, locale, setLocale } = useLocale();
  const { preference, cycle } = useTheme();
  const { signOut } = useSession();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const themeLabel =
    preference === "system"
      ? messages.app.themeSystem
      : preference === "light"
        ? messages.app.themeLight
        : messages.app.themeDark;
  return (
    <header className="bc-topbar">
      <div className="bc-topbar__brand">
        <a
          className="bc-topbar__brand-link"
          href={serializeRoute({ name: "home" })}
        >
          <span className="bc-topbar__logo" aria-hidden="true">
            <PanelsTopLeft size={15} strokeWidth={2.5} />
          </span>
          <span>{messages.app.title}</span>
        </a>
        {signedIn ? (
          <nav
            className="bc-topbar__nav"
            aria-label="Primary"
            id="bc-primary-navigation"
            data-mobile-open={mobileNavOpen ? "true" : "false"}
          >
            <a
              className="bc-topbar__nav-link"
              href={serializeRoute({ name: "home" })}
              onClick={() => setMobileNavOpen(false)}
            >
              <FolderKanban size={15} aria-hidden="true" />
              {messages.home.heading}
            </a>
            <a
              className="bc-topbar__nav-link"
              href={serializeRoute({ name: "library" })}
              onClick={() => setMobileNavOpen(false)}
            >
              <LibraryIcon size={15} aria-hidden="true" />
              {messages.library.heading}
            </a>
            <a
              className="bc-topbar__nav-link"
              href={serializeRoute({ name: "teams" })}
              onClick={() => setMobileNavOpen(false)}
            >
              <UsersRound size={15} aria-hidden="true" />
              {messages.teams.heading}
            </a>
          </nav>
        ) : null}
      </div>
      <div className="bc-topbar__actions">
        {signedIn ? (
          <button
            type="button"
            className="bc-icon-btn bc-mobile-nav-toggle"
            aria-label={
              mobileNavOpen
                ? messages.app.closeNavigation
                : messages.app.openNavigation
            }
            aria-expanded={mobileNavOpen}
            aria-controls="bc-primary-navigation"
            title={
              mobileNavOpen
                ? messages.app.closeNavigation
                : messages.app.openNavigation
            }
            onClick={() => setMobileNavOpen((open) => !open)}
          >
            {mobileNavOpen ? (
              <X size={17} aria-hidden="true" />
            ) : (
              <Menu size={17} aria-hidden="true" />
            )}
          </button>
        ) : null}
        <div className="bc-topbar__locale">
          <label className="bc-visually-hidden" htmlFor="bc-locale">
            {messages.app.localeLabel}
          </label>
          <select
            id="bc-locale"
            className="bc-select"
            value={locale}
            onChange={(event) => setLocale(event.target.value as UiLocale)}
          >
            {uiLocales.map((code) => (
              <option key={code} value={code}>
                {localeDisplayNames[code]}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          className="bc-icon-btn"
          onClick={cycle}
          aria-pressed={preference !== "system"}
          aria-label={themeLabel}
          title={themeLabel}
        >
          {preference === "system" ? (
            <Monitor size={17} aria-hidden="true" />
          ) : preference === "dark" ? (
            <Moon size={17} aria-hidden="true" />
          ) : (
            <Sun size={17} aria-hidden="true" />
          )}
        </button>
        {signedIn ? (
          <button
            type="button"
            className="bc-btn bc-btn--compact"
            data-variant="ghost"
            onClick={() => void signOut()}
            title={messages.app.signOut}
          >
            <LogOut size={15} aria-hidden="true" />
            {messages.app.signOut}
          </button>
        ) : null}
      </div>
    </header>
  );
}

export function AppLoading() {
  return (
    <main className="bc-loading-area" style={{ gridRow: "1 / -1" }}>
      <div className="bc-screen" aria-busy="true">
        <p className="bc-eyebrow">Blue Canvas</p>
        <p>Loading…</p>
      </div>
    </main>
  );
}

export { parseRoute };
