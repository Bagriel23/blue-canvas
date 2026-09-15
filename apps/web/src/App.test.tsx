import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AppLoading, Topbar } from "./App.js";
import { LocaleProvider, useLocale } from "./state/locale.js";
import { ThemeProvider } from "./state/theme.js";
import { SessionProvider } from "./state/session.js";

function LocaleCopyProbe() {
  const { messages } = useLocale();
  return <output data-testid="locale-copy">{messages.home.lede}</output>;
}

function renderTopbar(signedIn = false) {
  return render(
    <ThemeProvider>
      <LocaleProvider initialLocale="en-US">
        <SessionProvider
          initialSession={
            signedIn
              ? {
                  user: {
                    id: "u1",
                    email: "user@example.com",
                    displayName: "Test User",
                    locale: "en-US",
                    role: "member",
                    status: "active",
                  },
                  csrfToken: "csrf-1",
                  bootstrapRequired: false,
                }
              : null
          }
        >
          <Topbar signedIn={signedIn} />
          <LocaleCopyProbe />
        </SessionProvider>
      </LocaleProvider>
    </ThemeProvider>,
  );
}

describe("studio topbar", () => {
  it("exposes icon actions with accessible names and tooltips", () => {
    renderTopbar();

    const theme = screen.getByRole("button", { name: /theme/i });
    expect(theme.getAttribute("title")).toMatch(/theme/i);
    expect(theme.querySelector("svg")).toBeTruthy();
  });

  it("cycles the theme preference without losing the product navigation", () => {
    renderTopbar();

    const theme = screen.getByRole("button", { name: /theme/i });
    expect(screen.getByRole("link", { name: "Blue Canvas" })).toBeTruthy();
    fireEvent.click(theme);
    expect(theme.getAttribute("aria-pressed")).toBe("true");
  });

  it("keeps primary navigation reachable behind an accessible mobile menu", () => {
    renderTopbar(true);

    const menu = screen.getByRole("button", { name: "Open navigation" });
    expect(menu.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(menu);
    expect(menu.getAttribute("aria-expanded")).toBe("true");
    expect(
      screen
        .getByRole("navigation", { name: "Primary" })
        .getAttribute("data-mobile-open"),
    ).toBe("true");
  });

  it("updates localized shell copy when the locale changes", () => {
    renderTopbar();
    const copy = screen.getByTestId("locale-copy");
    expect(copy.textContent).toBe(
      "Build interfaces with a clear visual system.",
    );
    fireEvent.change(screen.getByRole("combobox", { name: "Language" }), {
      target: { value: "pt-BR" },
    });
    expect(copy.textContent).toBe(
      "Construa interfaces com um sistema visual claro.",
    );
  });

  it("closes the mobile navigation after selecting a destination", () => {
    renderTopbar(true);
    const menu = screen.getByRole("button", { name: "Open navigation" });
    fireEvent.click(menu);
    fireEvent.click(screen.getByRole("link", { name: "Library" }));
    expect(menu.getAttribute("aria-expanded")).toBe("false");
    expect(
      screen
        .getByRole("navigation", { name: "Primary" })
        .getAttribute("data-mobile-open"),
    ).toBe("false");
  });

  it("keeps initial loading content in the available main area", () => {
    render(<AppLoading />);
    const main = screen.getByRole("main");
    expect(main).toBeTruthy();
    expect(main.querySelector(".bc-screen")).toBeTruthy();
    expect(main.style.gridRow).toBe("1 / -1");
  });
});
