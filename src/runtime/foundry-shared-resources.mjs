/* The shared resources panel in play: the active Ruleset's world resources (a GM reserve, clocks) and the combat in
   progress's (an escalation die). Everyone sees what they may read; the GM changes them. Opened from the combat tracker,
   and drawn again whenever the world's or the combat's resources change. */
import {MODULE_ID} from "../core/module-contract.mjs";
import {resolveRuntimeRuleset} from "./runtime-contracts.mjs";
import {hasSharedResources} from "./shared-resources.mjs";
import {renderSharedResourcesHTML} from "../ui/shared-resources-markup.mjs";
import {translator} from "./foundry-sheets.mjs";

const rta = () => globalThis.game?.ruleThemAll;
const i18n = key => globalThis.game?.i18n?.localize?.(key) ?? key;
const notifyError = error => { console.error("Rule Them'All | Shared resources", error); globalThis.ui?.notifications?.error?.(error?.message ?? String(error)); };
const combatRef = () => { const id = rta()?.runtime?.adapter?.activeCombat?.()?.id; return id ? {kind: "combat", id} : null; };

export function createSharedResourcesWindow({ApplicationV2}) {
  return class SharedResourcesWindow extends ApplicationV2 {
    static DEFAULT_OPTIONS = {id: "rta-shared-resources", classes: ["rta-shared-app"], position: {width: 360, height: "auto"}, window: {title: "RTA.Shared.Legend", resizable: true}};
    #view = {groups: [], t: i18n};

    async _prepareContext(options) {
      const context = await super._prepareContext(options);
      await rta()?.configuratorReady;
      const runtime = rta().runtime, versionId = rta().configurator.getActiveVersionId(), combat = combatRef();
      this.versionId = versionId;
      try {
        if (!versionId) { this.#view = {groups: [], t: i18n}; return context; }
        // A resource added to the Ruleset since the world loaded exists as soon as the GM opens the panel.
        if (globalThis.game.user?.isGM) await runtime.initializeShared(versionId, {combat});
        this.#view = {groups: await runtime.describeShared(versionId, {combat}), t: translator(versionId)};
      } catch (error) { notifyError(error); this.#view = {groups: [], t: i18n}; }
      return context;
    }
    async _renderHTML() { return renderSharedResourcesHTML(this.#view.groups, {t: this.#view.t}); }
    _replaceHTML(result, content) { content.innerHTML = result; }

    _onRender(context, options) {
      super._onRender?.(context, options);
      const root = this.element;
      for (const input of root.querySelectorAll("[data-shared-value]")) input.addEventListener("change", event => this.#set(event.currentTarget, Number(event.currentTarget.value)));
      for (const button of root.querySelectorAll("[data-shared-step]")) button.addEventListener("click", event => {
        const input = event.currentTarget.parentElement.querySelector("[data-shared-value]");
        this.#set(input, Number(input.value) + Number(event.currentTarget.dataset.sharedStep));
      });
    }
    async #set(input, value) {
      const group = this.#view.groups.find(entry => entry.holder === input.dataset.holder);
      try { if (group?.ref) await rta().runtime.setSharedValue(this.versionId, group.ref, input.dataset.definition, input.dataset.slot || null, value); }
      catch (error) { notifyError(error); }
      this.render();
    }
  };
}

let SharedResourcesWindow = null;
export function openSharedResources({ApplicationV2 = globalThis.foundry?.applications?.api?.ApplicationV2} = {}) {
  SharedResourcesWindow ??= createSharedResourcesWindow({ApplicationV2});
  const open = globalThis.foundry?.applications?.instances?.get?.("rta-shared-resources");
  return (open ?? new SharedResourcesWindow()).render({force: true});
}
const refreshOpen = () => globalThis.foundry?.applications?.instances?.get?.("rta-shared-resources")?.render();

/** A "Shared resources" button in the combat tracker when the active Ruleset names some; the open panel follows changes. */
export function installSharedResources({hooks = globalThis.Hooks} = {}) {
  hooks.on("renderCombatTracker", (_app, html) => {
    const root = html instanceof HTMLElement ? html : html?.[0];
    const api = rta()?.configurator, versionId = api?.getActiveVersionId?.();
    if (!root || !versionId || root.querySelector("[data-rta-shared-open]")) return;
    try { if (!hasSharedResources(resolveRuntimeRuleset(api, versionId))) return; } catch { return; }
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.rtaSharedOpen = "";
    button.innerHTML = `<i class="fa-solid fa-scale-balanced"></i> ${i18n("RTA.Shared.Open")}`;
    button.addEventListener("click", () => openSharedResources());
    (root.querySelector(".combat-tracker-header") ?? root.querySelector("header") ?? root).append(button);
  });
  hooks.on("updateSetting", setting => { if (setting?.key === `${MODULE_ID}.worldRuntime`) refreshOpen(); });
  for (const hook of ["updateCombat", "deleteCombat"]) hooks.on(hook, refreshOpen);
}
