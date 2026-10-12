/* Character creation in play (CP-15): a window that walks a player through the active Ruleset's Creation System,
   saved in a CreationSession after each step, so it can be left and resumed. Opened from the Actors directory. */
import {resolveRuntimeRuleset} from "./runtime-contracts.mjs";
import {creationView, readCreationAnswer, renderCreationHTML, renderCreationStartHTML} from "../ui/creation-markup.mjs";
import {translator} from "./foundry-sheets.mjs";
import {availableDocumentTypes} from "../core/system-document-types.mjs";

const rta = () => globalThis.game?.ruleThemAll;
const i18n = key => globalThis.game?.i18n?.localize?.(key) ?? key;
const notifyError = error => { console.error("Rule Them'All | Creation", error); globalThis.ui?.notifications?.error?.(error?.message ?? String(error)); };

/** The Creation Systems a player can start under the active Ruleset. */
export function startableSystems(ruleset, t) {
  return (ruleset?.creationSystems ?? []).filter(system => system.enabled !== false && (system.steps ?? []).length).map(system => ({id: system.id, label: t(system.nameKey ?? system.id)}));
}

/** Where a page command leads: the step to go to before or after the current one. */
export function neighbourStep(view, offset) { return view.steps[view.index + offset]?.id ?? null; }

export function createCreationWindow({ApplicationV2}) {
  return class CreationWindow extends ApplicationV2 {
    static DEFAULT_OPTIONS = {classes: ["rta-creation-app"], position: {width: 760, height: 640}, window: {title: "RTA.Creation.WindowTitle", resizable: true}};
    #sessionId = null;
    #dirty = false;
    #page = null;
    #name = null;
    #actorType = null;
    /** options.actorUuid: the character is built onto this Actor (opened from its sheet) rather than a new one. */
    constructor(options = {}) {
      super({...options, id: options.actorUuid ? `rta-creation-${String(options.actorUuid).replace(/[^A-Za-z0-9_-]/g, "-")}` : "rta-creation"});
      this.actorUuid = options.actorUuid ?? null;
    }
    get #actor() { return this.actorUuid ? globalThis.fromUuidSync?.(this.actorUuid) ?? null : null; }

    async _prepareContext(options) {
      const context = await super._prepareContext(options);
      await rta()?.configuratorReady;
      const creation = rta().creation, api = rta().configurator;
      try {
        if (this.#sessionId) {
          const current = await creation.context(this.#sessionId);
          if (current.session.status === "draft") {
            const ruleset = resolveRuntimeRuleset(api, current.session.rulesetVersionId), t = translator(current.session.rulesetVersionId);
            this.#page = {kind: "wizard", versionId: current.session.rulesetVersionId, view: creationView(current, ruleset, t), t};
            return context;
          }
          this.#sessionId = null;
        }
        const versionId = api.getActiveVersionId(), t = versionId ? translator(versionId) : i18n, ruleset = versionId ? resolveRuntimeRuleset(api, versionId) : null;
        const sessions = (await creation.list()).filter(session => session.status === "draft" && (session.targetActorUuid ?? null) === this.actorUuid);
        const systems = startableSystems(ruleset, t);
        // From an Actor's sheet: its creation in progress goes on, or its only Creation System starts at once.
        if (this.actorUuid && (sessions.length || systems.length === 1)) {
          this.#sessionId = sessions.at(-1)?.id ?? (await creation.start(versionId, systems[0].id, {actorUuid: this.actorUuid})).id;
          return this._prepareContext(options);
        }
        const drafts = sessions.map(session => {
          let label = session.creationSystemId;
          try { const own = translator(session.rulesetVersionId); label = own(resolveRuntimeRuleset(api, session.rulesetVersionId).creationSystems?.find(system => system.id === session.creationSystemId)?.nameKey ?? label); } catch { /* its Ruleset version is gone: the id stays */ }
          return {id: session.id, label: `${label} · ${new Date(session.updatedAt).toLocaleString()}`};
        });
        this.#page = {kind: "start", versionId, t, drafts, systems};
      } catch (error) { notifyError(error); this.#page = {kind: "start", t: i18n, drafts: [], systems: []}; }
      return context;
    }
    async _renderHTML() {
      const page = this.#page;
      if (page?.kind !== "wizard") return renderCreationStartHTML(page ?? {}, {t: page?.t ?? i18n});
      // A new Actor needs one of the game system's subtypes; one built onto an existing Actor keeps its own.
      const labels = globalThis.CONFIG?.Actor?.typeLabels ?? {};
      const actorTypes = this.actorUuid ? [] : availableDocumentTypes("Actor").map(type => ({value: type, label: labels[type] ? i18n(labels[type]) : type}));
      return renderCreationHTML(page.view, {t: page.t, name: this.#name ?? this.#actor?.name ?? "", actorTypes, actorType: this.#actorType ?? actorTypes[0]?.value ?? ""});
    }
    _replaceHTML(result, content) { content.innerHTML = result; }

    _onRender(context, options) {
      super._onRender?.(context, options);
      const root = this.element;
      this.#dirty = false;
      for (const control of root.querySelectorAll("[data-creation-goto]")) control.addEventListener("click", event => this.#run(() => this.#goTo(event.currentTarget.dataset.creationGoto)));
      for (const control of root.querySelectorAll("[data-creation-command]")) control.addEventListener("click", event => this.#run(() => this.#command(event.currentTarget)));
      // The name and subtype typed on the last step stay when the page is drawn again (an error, a step visited).
      root.querySelector("[data-creation-name]")?.addEventListener("input", event => { this.#name = event.currentTarget.value; });
      root.querySelector("[data-creation-actor-type]")?.addEventListener("change", event => { this.#actorType = event.currentTarget.value; });
      root.querySelector(".rta-creation__panel")?.addEventListener("change", event => {
        this.#dirty = true;
        // One choice at most: ticking another replaces it, and it can still be unticked.
        const single = event.target.closest?.("[data-creation-single]");
        if (single && event.target.checked) for (const other of single.querySelectorAll("input[type=checkbox]")) if (other !== event.target) other.checked = false;
        const spent = root.querySelector("[data-creation-spent]");
        if (spent) spent.textContent = globalThis.game.i18n.format("RTA.Creation.Spent", {count: [...root.querySelectorAll("[data-creation-points]")].reduce((sum, input) => sum + Math.max(0, Math.trunc(Number(input.value)) || 0), 0)});
      });
    }
    async #run(work) { try { await work(); } catch (error) { notifyError(error); } this.render(); }
    /** The step in progress, saved when the player changed it. */
    async #save() {
      const step = this.#page?.view?.step;
      if (!this.#dirty || !step) return;
      const answer = readCreationAnswer(this.element, step);
      if (answer) await rta().creation.answer(this.#sessionId, step.id, answer);
      this.#dirty = false;
    }
    async #goTo(stepId) { await this.#save(); if (stepId) await rta().creation.goTo(this.#sessionId, stepId); }
    async #command(control) {
      const creation = rta().creation, page = this.#page, command = control.dataset.creationCommand, step = page?.view?.step;
      if (command === "start") { this.#sessionId = (await creation.start(page.versionId, control.dataset.system, this.actorUuid ? {actorUuid: this.actorUuid} : {})).id; return; }
      if (command === "resume") { this.#sessionId = control.dataset.session; return; }
      if (command === "abandon") {
        const confirmed = await globalThis.foundry.applications.api.DialogV2.confirm({window: {title: i18n("RTA.Creation.Abandon")}, content: `<p>${i18n("RTA.Creation.AbandonConfirm")}</p>`, rejectClose: false});
        if (confirmed) { await creation.abandon(control.dataset.session ?? this.#sessionId); if (!control.dataset.session) this.#sessionId = null; }
        return;
      }
      if (command === "previous") return this.#goTo(neighbourStep(page.view, -1));
      if (command === "next") {
        // Answering moves to the next step; a step with nothing to answer (a roll, a skipped step) just moves on.
        const answer = readCreationAnswer(this.element, step);
        if (answer && !step.skipped) { await creation.answer(this.#sessionId, step.id, answer); this.#dirty = false; return; }
        return this.#goTo(neighbourStep(page.view, 1));
      }
      if (command === "draw") { await this.#save(); await creation.draw(this.#sessionId, step.id); return; }
      if (command === "term") { await this.#save(); await creation.nextTerm(this.#sessionId, step.id); return; }
      if (command === "finish") {
        const name = this.element.querySelector("[data-creation-name]")?.value?.trim() || this.#actor?.name || i18n("RTA.Creation.DefaultName");
        const actorType = this.element.querySelector("[data-creation-actor-type]")?.value || null;
        this.#name = name;
        const {actor} = await creation.finalize(this.#sessionId, {name, actorType});
        this.#name = null; this.#actorType = null;
        this.#sessionId = null;
        actor?.sheet?.render?.(true);
        await this.close();
      }
    }
  };
}

let CreationWindowClass = null;
/** The creation window: a new character, or (actorUuid) the character of an Actor that exists already. One per Actor. */
export function openCreationWindow({actorUuid = null, ApplicationV2 = globalThis.foundry?.applications?.api?.ApplicationV2} = {}) {
  CreationWindowClass ??= createCreationWindow({ApplicationV2});
  const id = actorUuid ? `rta-creation-${String(actorUuid).replace(/[^A-Za-z0-9_-]/g, "-")}` : "rta-creation";
  const open = globalThis.foundry?.applications?.instances?.get?.(id);
  if (open) return open.render({force: true});
  return new CreationWindowClass({actorUuid}).render({force: true});
}

/** A "Create a character" button in the Actors directory, when the active Ruleset has a Creation System. */
export function installCreationButton({hooks = globalThis.Hooks, ApplicationV2 = globalThis.foundry?.applications?.api?.ApplicationV2} = {}) {
  hooks.on("renderActorDirectory", (_app, html) => {
    const root = html instanceof HTMLElement ? html : html?.[0];
    const api = rta()?.configurator, versionId = api?.getActiveVersionId?.();
    if (!root || !versionId || root.querySelector("[data-rta-creation-open]")) return;
    let systems = [];
    try { systems = startableSystems(resolveRuntimeRuleset(api, versionId), key => key); } catch { return; }
    if (!systems.length) return;
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.rtaCreationOpen = "";
    button.innerHTML = `<i class="fa-solid fa-user-plus"></i> ${i18n("RTA.Creation.Open")}`;
    button.addEventListener("click", () => openCreationWindow({ApplicationV2}));
    (root.querySelector(".header-actions") ?? root.querySelector(".directory-header") ?? root).append(button);
  });
}
