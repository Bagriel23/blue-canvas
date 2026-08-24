export const staticRuntime = `(() => {
  "use strict";
  const stateElement = document.querySelector("#bc-initial-state");
  const state = stateElement ? JSON.parse(stateElement.textContent || "{}") : {};

  const parseValue = (value) => {
    try { return JSON.parse(value); } catch { return null; }
  };

  const refresh = () => {
    document.querySelectorAll("[data-bc-conditional]").forEach((conditional) => {
      const variable = conditional.dataset.bcConditional;
      conditional.querySelectorAll(":scope > [data-bc-branch]").forEach((branch) => {
        const matches = state[variable] === parseValue(branch.dataset.bcEquals || "null");
        branch.hidden = branch.dataset.bcBranch === "true" ? !matches : matches;
      });
    });
    document.querySelectorAll("[data-bc-variable]").forEach((input) => {
      const variable = input.dataset.bcVariable;
      if (variable && document.activeElement !== input && state[variable] != null) {
        input.value = String(state[variable]);
      }
    });
  };

  const route = () => {
    const requested = decodeURIComponent(location.hash.slice(1));
    const pages = [...document.querySelectorAll("[data-bc-page]")];
    const active = pages.find((page) => page.dataset.bcRoute === requested) || pages[0];
    pages.forEach((page) => { page.hidden = page !== active; });
  };

  const filterCollection = (collection, query) => {
    const normalized = String(query || "").trim().toLocaleLowerCase();
    document.querySelectorAll('[data-bc-repeater="' + CSS.escape(collection) + '"] > .bc-node').forEach((item) => {
      item.hidden = normalized.length > 0 && !item.textContent.toLocaleLowerCase().includes(normalized);
    });
  };

  const runAction = (action, source) => {
    switch (action.type) {
      case "navigate": {
        if (action.pageId) {
          const page = document.querySelector('[data-bc-page-id="' + CSS.escape(action.pageId) + '"]');
          if (page) location.hash = page.dataset.bcRoute || "";
        } else if (action.url) {
          location.href = action.url;
        }
        break;
      }
      case "set-variable":
        state[action.variable] = action.value;
        refresh();
        break;
      case "open-overlay": {
        const overlay = document.querySelector('[data-bc-overlay="' + CSS.escape(action.overlayId) + '"]');
        if (overlay) {
          overlay.hidden = false;
          if (typeof overlay.showModal === "function" && !overlay.open) overlay.showModal();
        }
        break;
      }
      case "close-overlay": {
        const overlay = source.closest("[data-bc-overlay]");
        if (overlay && typeof overlay.close === "function") overlay.close();
        if (overlay) overlay.hidden = true;
        break;
      }
      case "filter-collection": {
        const input = source.querySelector?.('[data-bc-variable="' + CSS.escape(action.variable) + '"]') ||
          document.querySelector('[data-bc-variable="' + CSS.escape(action.variable) + '"]');
        const value = input ? input.value : state[action.variable];
        state[action.variable] = value;
        filterCollection(action.collection, value);
        refresh();
        break;
      }
    }
  };

  const dispatch = (event) => {
    const source = event.target.closest("[data-bc-interactions]");
    if (!source) return;
    const trigger = event.type === "input" ? "change" : event.type;
    const interactions = JSON.parse(source.dataset.bcInteractions || "[]");
    interactions.filter((interaction) => interaction.trigger === trigger).forEach((interaction) => {
      if (event.type === "submit" || interaction.action.type === "navigate") event.preventDefault();
      runAction(interaction.action, source);
    });
  };

  addEventListener("hashchange", route);
  document.addEventListener("click", dispatch);
  document.addEventListener("submit", dispatch);
  document.addEventListener("input", dispatch);
  route();
  refresh();
})();
`;
