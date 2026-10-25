/* What other modules add to Rule Them'All's own windows (game.ruleThemAll.integrations, docs/architecture.md §6).
   A contribution is a descriptor with an id; registering the same id again replaces it, and register returns the
   function that removes it. Rule Them'All draws the places where contributions go; a contribution's own callbacks may
   throw without breaking the window (report). Pure: no Foundry access. */

/** What this version of the integrations offers; another module checks the ones it needs. */
export const INTEGRATION_CAPABILITIES = Object.freeze(["assistantPanels"]);

const FA_CLASSES = /^(fa-[a-z0-9-]+)( fa-[a-z0-9-]+)*$/;

function panelDescriptor(descriptor) {
  if (!descriptor || typeof descriptor !== "object") throw new Error("An assistant panel is an object.");
  const {id, ownerModule = null, title, icon = "fa-solid fa-puzzle-piece", isVisible = null, render} = descriptor;
  if (typeof id !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(id)) throw new Error("An assistant panel needs an id of letters, digits, '.', '-' and '_'.");
  if (typeof title !== "string" || !title.trim()) throw new Error(`Assistant panel ${id}: title (a text or a text key) is required.`);
  if (typeof icon !== "string" || !FA_CLASSES.test(icon.trim())) throw new Error(`Assistant panel ${id}: icon must be Font Awesome classes.`);
  if (typeof render !== "function") throw new Error(`Assistant panel ${id}: render(element, assistant) is required.`);
  if (isVisible !== null && typeof isVisible !== "function") throw new Error(`Assistant panel ${id}: isVisible must be a function.`);
  return Object.freeze({id, ownerModule, title, icon: icon.trim(), isVisible, render});
}

/** report(id, error) is told about a contribution that failed; by default the console. */
export function createIntegrationRegistry({report = (id, error) => globalThis.console?.error?.(`Rule Them'All | Integration ${id} failed`, error)} = {}) {
  const panels = new Map(), listeners = new Set();
  const changed = () => { for (const listener of listeners) { try { listener(); } catch (error) { report("listener", error); } } };
  const registry = {
    capabilities: INTEGRATION_CAPABILITIES,
    /** A panel in the Ruleset assistant window. render(element, assistant) fills the element once; Rule Them'All keeps
     * that element while the window is open. It may return a function, called when the window closes. */
    registerAssistantPanel(descriptor) {
      const panel = panelDescriptor(descriptor);
      panels.set(panel.id, panel); changed();
      return () => { if (panels.get(panel.id) === panel) registry.unregisterAssistantPanel(panel.id); };
    },
    unregisterAssistantPanel(id) { if (panels.delete(id)) changed(); },
    listAssistantPanels: () => [...panels.values()].map(({id, ownerModule, title, icon}) => ({id, ownerModule, title, icon}))
  };
  // Internal to Rule Them'All's windows, kept off the public object.
  const internal = {
    /** The panels shown for this context, isVisible failures counted as hidden. */
    assistantPanels(context) {
      return [...panels.values()].filter(panel => {
        if (!panel.isVisible) return true;
        try { return panel.isVisible(context) !== false; } catch (error) { report(panel.id, error); return false; }
      });
    },
    report,
    /** listener() after any registration change; returns the unsubscribe. */
    onChange(listener) { listeners.add(listener); return () => listeners.delete(listener); }
  };
  return {registry: Object.freeze(registry), internal};
}
