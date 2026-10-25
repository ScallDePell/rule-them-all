/* What other modules add to Rule Them'All's own windows (game.ruleThemAll.integrations, docs/architecture.md §6).
   A contribution is a descriptor with an id; registering the same id again replaces it, and register returns the
   function that removes it. Rule Them'All draws the places where contributions go; a contribution's own callbacks may
   throw without breaking the window (report). Pure: no Foundry access. */

/** What this version of the integrations offers; another module checks the ones it needs. */
export const INTEGRATION_CAPABILITIES = Object.freeze(["assistantPanels", "configuratorSections", "cardHost", "sheetFields", "fieldSources", "fieldTargets", "sheetFieldActions", "rulesetChanges"]);
/** What a hosted card family may offer besides list; each one missing hides its button or menu line. */
export const CARD_CALLBACKS = Object.freeze(["create", "open", "duplicate", "setEnabled", "remove", "reorder"]);

const FA_CLASSES = /^(fa-[a-z0-9-]+)( fa-[a-z0-9-]+)*$/;
const ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

function common(kind, descriptor, {render = false} = {}) {
  if (!descriptor || typeof descriptor !== "object") throw new Error(`${kind} is an object.`);
  const {id, ownerModule = null, title, icon = "fa-solid fa-puzzle-piece", isVisible = null} = descriptor;
  if (typeof id !== "string" || !ID.test(id)) throw new Error(`${kind} needs an id of letters, digits, '.', '-' and '_'.`);
  if (typeof title !== "string" || !title.trim()) throw new Error(`${kind} ${id}: title (a text or a text key) is required.`);
  if (typeof icon !== "string" || !FA_CLASSES.test(icon.trim())) throw new Error(`${kind} ${id}: icon must be Font Awesome classes.`);
  if (isVisible !== null && typeof isVisible !== "function") throw new Error(`${kind} ${id}: isVisible must be a function.`);
  if (ownerModule !== null && typeof ownerModule !== "string") throw new Error(`${kind} ${id}: ownerModule must be a module id.`);
  if (render && typeof descriptor.render !== "function") throw new Error(`${kind} ${id}: render(element, assistant) is required.`);
  return {id, ownerModule, title, icon: icon.trim(), isVisible};
}
const panelDescriptor = descriptor => Object.freeze({...common("An assistant panel", descriptor, {render: true}), render: descriptor.render});
function sectionDescriptor(descriptor) {
  const base = common("A configurator section", descriptor);
  const {parentGroup, after = null, cards} = descriptor;
  if (typeof parentGroup !== "string" || !parentGroup) throw new Error(`Configurator section ${base.id}: parentGroup (a section of the menu) is required.`);
  if (after !== null && typeof after !== "string") throw new Error(`Configurator section ${base.id}: after must be a view id.`);
  if (!cards || typeof cards.list !== "function") throw new Error(`Configurator section ${base.id}: cards.list(context) is required.`);
  for (const name of [...CARD_CALLBACKS, "canMutate"]) if (cards[name] !== undefined && typeof cards[name] !== "function") throw new Error(`Configurator section ${base.id}: cards.${name} must be a function.`);
  return Object.freeze({...base, parentGroup, after, cards: Object.freeze({...cards})});
}
function fieldActionDescriptor(descriptor) {
  const {id, ownerModule = null, icon, label, matches, isVisible = null, execute} = descriptor ?? {};
  if (typeof id !== "string" || !ID.test(id)) throw new Error("A sheet field action needs an id of letters, digits, '.', '-' and '_'.");
  if (typeof label !== "string" || !label.trim()) throw new Error(`Sheet field action ${id}: label (a text or a text key) is required.`);
  if (typeof icon !== "string" || !FA_CLASSES.test(icon.trim())) throw new Error(`Sheet field action ${id}: icon must be Font Awesome classes.`);
  for (const [name, value] of [["matches", matches], ["execute", execute]]) if (typeof value !== "function") throw new Error(`Sheet field action ${id}: ${name} is required.`);
  if (isVisible !== null && typeof isVisible !== "function") throw new Error(`Sheet field action ${id}: isVisible must be a function.`);
  return Object.freeze({id, ownerModule, icon: icon.trim(), label, matches, isVisible, execute});
}

/** report(id, error) is told about a contribution that failed; by default the console. */
export function createIntegrationRegistry({report = (id, error) => globalThis.console?.error?.(`Rule Them'All | Integration ${id} failed`, error)} = {}) {
  const kinds = {panels: new Map(), sections: new Map(), fieldActions: new Map()};
  const listeners = {panels: new Set(), sections: new Set(), fieldActions: new Set(), rulesetChanges: new Set()};
  const tell = (set, ...args) => { for (const listener of set) { try { listener(...args); } catch (error) { report("listener", error); } } };
  // The sheet field services (field-services.mjs), bound once the module's APIs are ready; calls made before wait.
  let bindServices;
  const services = new Promise(resolve => { bindServices = resolve; });
  const serve = name => async (...args) => (await services)[name](...args);
  const register = (kind, prepare) => descriptor => {
    const entry = prepare(descriptor);
    kinds[kind].set(entry.id, entry); tell(listeners[kind]);
    return () => { if (kinds[kind].get(entry.id) === entry) { kinds[kind].delete(entry.id); tell(listeners[kind]); } };
  };
  const unregister = kind => id => { if (kinds[kind].delete(id)) tell(listeners[kind]); };
  // isVisible failures count as hidden.
  const visible = (kind, context) => [...kinds[kind].values()].filter(entry => {
    if (!entry.isVisible) return true;
    try { return entry.isVisible(context) !== false; } catch (error) { report(entry.id, error); return false; }
  });
  const registry = {
    capabilities: INTEGRATION_CAPABILITIES,
    /** A panel in the Ruleset assistant window. render(element, assistant) fills the element once; Rule Them'All keeps
     * that element while the window is open. It may return a function, called when the window closes. */
    registerAssistantPanel: register("panels", panelDescriptor),
    unregisterAssistantPanel: unregister("panels"),
    listAssistantPanels: () => [...kinds.panels.values()].map(({id, ownerModule, title, icon}) => ({id, ownerModule, title, icon})),
    /** A view of the configurator's menu, in a section (parentGroup) after a view (after), showing another module's cards. */
    registerConfiguratorSection: register("sections", sectionDescriptor),
    unregisterConfiguratorSection: unregister("sections"),
    listConfiguratorSections: () => [...kinds.sections.values()].map(({id, ownerModule, title, icon, parentGroup, after}) => ({id, ownerModule, title, icon, parentGroup, after})),
    /** Draw the configurator again, when the cards a section lists changed. */
    refreshConfigurator: () => tell(listeners.sections),
    /** A button on the fields of the played sheets that matches(field, context) accepts. */
    registerSheetFieldAction: register("fieldActions", fieldActionDescriptor),
    unregisterSheetFieldAction: unregister("fieldActions"),
    listSheetFieldActions: () => [...kinds.fieldActions.values()].map(({id, ownerModule, icon, label}) => ({id, ownerModule, icon, label})),
    /** The sheets of a Ruleset (AUTO included) and the fields of one, to fill or to read (sheet-fields.mjs). */
    listSheetDefinitions: serve("listSheetDefinitions"),
    listBindableFields: serve("listBindableFields"),
    describeField: serve("describeField"),
    /** What a Document's sheet may give to read, and its value for the current user (field-services.mjs). */
    listSourceCandidates: serve("listSourceCandidates"),
    resolveSource: serve("resolveSource"),
    /** Whether the current user may write a field of a Document, and the write itself, checked again when it is served. */
    validateTarget: serve("validateTarget"),
    updateTarget: serve("updateTarget"),
    /** callback(change) after a Ruleset version's sheets, Content Types or Content Templates change; returns the unsubscribe. */
    onRulesetChange(callback) {
      if (typeof callback !== "function") throw new TypeError("onRulesetChange takes a function.");
      listeners.rulesetChanges.add(callback); return () => listeners.rulesetChanges.delete(callback);
    }
  };
  // Internal to Rule Them'All's windows and sheets, kept off the public object.
  const internal = {
    assistantPanels: context => visible("panels", context),
    configuratorSections: context => visible("sections", context),
    configuratorSection: id => kinds.sections.get(id) ?? null,
    fieldActions: () => [...kinds.fieldActions.values()],
    report,
    /** listener() after a change of the panels (or another kind); returns the unsubscribe. */
    onChange(listener, kind = "panels") { listeners[kind].add(listener); return () => listeners[kind].delete(listener); },
    emitRulesetChange: change => tell(listeners.rulesetChanges, change),
    bindServices: value => bindServices(value)
  };
  return {registry: Object.freeze(registry), internal};
}
