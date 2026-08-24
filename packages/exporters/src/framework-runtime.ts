import { safeJson } from "./safety.js";

const frameworkRuntime = `type Action =
  | { type: "navigate"; pageId?: string; url?: string }
  | { type: "set-variable"; variable: string; value: unknown }
  | { type: "open-overlay"; overlayId: string }
  | { type: "close-overlay" }
  | { type: "filter-collection"; collection: string; variable: string };

interface Interaction { trigger: "click" | "submit" | "change"; action: Action }

const state: Record<string, unknown> = __BLUE_CANVAS_INITIAL_STATE__;

function refresh(): void {
  document.querySelectorAll<HTMLElement>("[data-bc-conditional]").forEach((conditional) => {
    const variable = conditional.dataset.bcConditional ?? "";
    conditional.querySelectorAll<HTMLElement>(":scope > [data-bc-branch]").forEach((branch) => {
      const matches = JSON.stringify(state[variable]) === branch.dataset.bcEquals;
      branch.hidden = branch.dataset.bcBranch === "true" ? !matches : matches;
    });
  });
  document.querySelectorAll<HTMLInputElement>("[data-bc-variable]").forEach((input) => {
    const variable = input.dataset.bcVariable;
    if (variable !== undefined && document.activeElement !== input && state[variable] != null) {
      input.value = String(state[variable]);
    }
  });
}

function route(): void {
  const requested = decodeURIComponent(location.hash.slice(1));
  const pages = [...document.querySelectorAll<HTMLElement>("[data-bc-page]")];
  const active = pages.find((page) => page.dataset.bcRoute === requested) ?? pages[0];
  pages.forEach((page) => { page.hidden = page !== active; });
}

function filterCollection(collection: string, query: unknown): void {
  const normalized = String(query ?? "").trim().toLocaleLowerCase();
  document.querySelectorAll<HTMLElement>(
    '[data-bc-repeater="' + CSS.escape(collection) + '"] > .bc-node',
  ).forEach((item) => {
    item.hidden = normalized.length > 0 && !item.textContent.toLocaleLowerCase().includes(normalized);
  });
}

function runAction(action: Action, source: HTMLElement): void {
  switch (action.type) {
    case "navigate": {
      if (action.pageId !== undefined) {
        const page = document.querySelector<HTMLElement>(
          '[data-bc-page-id="' + CSS.escape(action.pageId) + '"]',
        );
        if (page !== null) location.hash = page.dataset.bcRoute ?? "";
      } else if (action.url !== undefined) location.href = action.url;
      break;
    }
    case "set-variable":
      state[action.variable] = action.value;
      refresh();
      break;
    case "open-overlay": {
      const overlay = document.querySelector<HTMLDialogElement>(
        '[data-bc-overlay="' + CSS.escape(action.overlayId) + '"]',
      );
      if (overlay !== null) {
        overlay.hidden = false;
        if (!overlay.open) overlay.showModal();
      }
      break;
    }
    case "close-overlay": {
      const overlay = source.closest<HTMLDialogElement>("[data-bc-overlay]");
      if (overlay !== null) { if (overlay.open) overlay.close(); overlay.hidden = true; }
      break;
    }
    case "filter-collection": {
      const input = source.querySelector<HTMLInputElement>(
        '[data-bc-variable="' + CSS.escape(action.variable) + '"]',
      ) ?? document.querySelector<HTMLInputElement>(
        '[data-bc-variable="' + CSS.escape(action.variable) + '"]',
      );
      const value = input?.value ?? state[action.variable];
      state[action.variable] = value;
      filterCollection(action.collection, value);
      refresh();
      break;
    }
  }
}

function dispatch(event: Event): void {
  if (!(event.target instanceof Element)) return;
  const source = event.target.closest<HTMLElement>("[data-bc-interactions]");
  if (source === null) return;
  const trigger = event.type === "input" ? "change" : event.type;
  const interactions = JSON.parse(source.dataset.bcInteractions ?? "[]") as Interaction[];
  for (const interaction of interactions) {
    if (interaction.trigger !== trigger) continue;
    if (event.type === "submit" || interaction.action.type === "navigate") event.preventDefault();
    runAction(interaction.action, source);
  }
}

export function installRuntime(): () => void {
  addEventListener("hashchange", route);
  document.addEventListener("click", dispatch);
  document.addEventListener("submit", dispatch);
  document.addEventListener("input", dispatch);
  route();
  refresh();
  return () => {
    removeEventListener("hashchange", route);
    document.removeEventListener("click", dispatch);
    document.removeEventListener("submit", dispatch);
    document.removeEventListener("input", dispatch);
  };
}
`;

export function generateFrameworkRuntime(
  initialState: Record<string, unknown>,
): string {
  return frameworkRuntime.replace(
    "__BLUE_CANVAS_INITIAL_STATE__",
    safeJson(initialState),
  );
}
