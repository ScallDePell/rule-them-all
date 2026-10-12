/* Played sheets in Foundry (CP-14): an Actor sheet and an Item sheet that show the Ruleset's SheetDefinition
   (or the AUTO layout), for any game system. Offered in each Document's sheet choice, never forced as the default.
   Every value changed here goes to the runtime (writeSheetValue), never to the Document's data. */
import {MODULE_ID} from "../core/module-contract.mjs";
import {sheetFor} from "../configurator/sheet-auto-layout.mjs";
import {resolveRuntimeRuleset} from "./runtime-contracts.mjs";
import {formatSheetValue, renderActionChatHTML, renderSheetHTML} from "../ui/sheet-markup.mjs";
import {escapeHTML} from "../ui/html-utils.mjs";
import {openCreationWindow, startableSystems} from "./foundry-creation.mjs";
import {foundryJSON} from "./foundry-data.mjs";

const TEMPLATE_FLAG = "contentTemplate";
const rta = () => globalThis.game?.ruleThemAll;
const i18n = key => globalThis.game?.i18n?.localize?.(key) ?? key;
const notifyError = error => { console.error("Rule Them'All | Sheet", error); globalThis.ui?.notifications?.error?.(error?.message ?? String(error)); };

/** Ruleset text first (world overrides, Ruleset translations), then the module's. */
export function translator(versionId) {
  const api = rta()?.configurator;
  return key => { if (!key) return ""; try { return api.resolveLocalizedText(versionId, globalThis.game?.i18n?.lang ?? "en", key, i18n); } catch { return i18n(key); } };
}

/** What an Action used from a sheet did, for the chat card. */
export function actionSummary(result, {t, ruleset}) {
  const name = id => t(ruleset.actions?.find(a => a.id === id)?.nameKey ?? id);
  const lines = [], test = result.testResult;
  if (test?.roll) lines.push({label: test.roll.formula, value: `${test.roll.result} = ${formatSheetValue(test.total)}`});
  if (test && test.target !== null && test.target !== undefined) lines.push({label: i18n("RTA.Sheet.TestTarget"), value: formatSheetValue(test.target)});
  for (const run of result.each ?? []) {
    const definition = ruleset.definitions?.find(d => d.id === run.definitionId);
    lines.push({label: t(definition?.nameKey ?? run.definitionId), value: run.testResult?.outcome ? t(run.testResult.outcome.labelKey) : run.allowed === false ? i18n("RTA.Sheet.NotAllowed") : "✓"});
  }
  // A reroll (a reaction such as a shield) shows the replayed use under the reroll Action's name.
  return {title: result.rerollActionId ? `${name(result.rerollActionId)} · ${name(result.actionId)}` : name(result.actionId), lines, outcome: test?.outcome ? t(test.outcome.labelKey) : ""};
}

async function askInputs(inputs, t) {
  const Dialog = globalThis.foundry.applications.api.DialogV2;
  const field = input => {
    const label = escapeHTML(t(input.labelKey)), name = `input-${escapeHTML(input.id)}`, current = input.defaultValue ?? "";
    if (input.options?.length) return `<div class="form-group"><label>${label}</label><select name="${name}">${input.options.map(o => `<option value="${escapeHTML(o.value)}" ${String(o.value) === String(current) ? "selected" : ""}>${escapeHTML(t(o.labelKey ?? String(o.value)))}</option>`).join("")}</select></div>`;
    if (input.valueType === "boolean") return `<div class="form-group"><label>${label}</label><input type="checkbox" name="${name}" ${current ? "checked" : ""}></div>`;
    return `<div class="form-group"><label>${label}</label><input type="${["number", "integer"].includes(input.valueType) ? "number" : "text"}" name="${name}" value="${escapeHTML(current)}"></div>`;
  };
  return Dialog.prompt({window: {title: i18n("RTA.Sheet.ActionInputs")}, content: inputs.map(field).join(""), ok: {callback: (_event, button) => {
    const values = {};
    for (const input of inputs) {
      const element = button.form.elements[`input-${input.id}`];
      const raw = input.valueType === "boolean" ? element.checked : element.value;
      if (raw === "" && input.valueType !== "boolean") continue;
      values[input.id] = ["number", "integer"].includes(input.valueType) ? Number(raw) : raw;
    }
    return values;
  }}, rejectClose: false});
}

async function askChoice(offer, t, ruleset) {
  const Dialog = globalThis.foundry.applications.api.DialogV2;
  const options = offer.actionIds.map(id => `<label class="checkbox"><input type="checkbox" name="choice" value="${escapeHTML(id)}"> ${escapeHTML(t(ruleset.actions?.find(a => a.id === id)?.nameKey ?? id))}</label>`).join("");
  return Dialog.prompt({window: {title: globalThis.game.i18n.format("RTA.Sheet.ChooseActions", {count: offer.count})}, content: `<div class="rta-sheet-choice">${options}</div>`,
    ok: {callback: (_event, button) => [...button.form.querySelectorAll('input[name="choice"]:checked')].map(input => input.value)}, rejectClose: false});
}

/** The sheet classes, built on Foundry's ActorSheetV2 / ItemSheetV2. */
export function createRulesetSheets({ActorSheetV2, ItemSheetV2}) {
  const behaviour = Base => class extends Base {
    static DEFAULT_OPTIONS = {classes: ["rta-sheet-app"], position: {width: 640, height: 720}, window: {resizable: true}, form: {submitOnChange: false, closeOnSubmit: false}};
    #tab = null;
    #state = null;

    /** {versionId, ruleset, sheet, view, actor, content, notice?, noticeAction?} for this Document. */
    async rtaResolve() { throw new Error("rtaResolve is defined by each sheet."); }

    async _prepareContext(options) {
      const context = await super._prepareContext(options);
      await rta()?.configuratorReady;
      try { this.#state = await this.rtaResolve(); } catch (error) { this.#state = {notice: error?.message ?? String(error)}; }
      return context;
    }
    async _renderHTML() {
      const state = this.#state ?? {}, t = state.versionId ? translator(state.versionId) : i18n;
      return renderSheetHTML(state.view, {t, name: this.document.name, img: this.document.img, editable: this.isEditable, notice: state.notice ?? "", noticeActions: state.noticeActions ?? [], headerActions: state.headerActions ?? []});
    }
    _replaceHTML(result, content) { content.innerHTML = result; }

    _onRender(context, options) {
      super._onRender?.(context, options);
      const root = this.element;
      root.querySelector("[data-sheet-name]")?.addEventListener("change", event => this.document.update({name: event.currentTarget.value}).catch(notifyError));
      for (const input of root.querySelectorAll("[data-sheet-write]:not([data-sheet-dot])")) input.addEventListener("change", event => this.#write(event.currentTarget));
      // A dot of a value shown as dots sets the value it carries.
      for (const dot of root.querySelectorAll("[data-sheet-dot]")) dot.addEventListener("click", event => { const button = event.currentTarget; this.#write({dataset: button.dataset, type: "number", value: button.dataset.sheetDot}); });
      for (const button of root.querySelectorAll("[data-sheet-action]")) button.addEventListener("click", event => this.#use(event.currentTarget));
      for (const button of root.querySelectorAll("[data-sheet-command]")) button.addEventListener("click", event => this.#command(event.currentTarget.dataset.sheetCommand));
      for (const button of root.querySelectorAll("[data-sheet-tab]")) button.addEventListener("click", event => this.#showTab(event.currentTarget));
      for (const button of root.querySelectorAll("[data-sheet-item-open]")) button.addEventListener("click", event => this.#ownedItem(event.currentTarget.dataset.sheetItemOpen)?.sheet?.render(true));
      for (const button of root.querySelectorAll("[data-sheet-item-remove]")) button.addEventListener("click", event => this.#removeItem(event.currentTarget.dataset.sheetItemRemove));
      const tab = this.#tab && root.querySelector(`[data-sheet-tab="${CSS.escape(this.#tab)}"]`);
      if (tab) this.#showTab(tab);
    }
    /** Items dropped on the sheet (from a compendium, the Items directory, another Actor). The listeners sit on the
       window, which lasts across renders; Foundry's own drop handling, when the base sheet has one, ends here too. */
    _onFirstRender(context, options) {
      super._onFirstRender?.(context, options);
      const root = this.element;
      root.addEventListener("dragover", event => { if (this.isEditable && this.document.documentName === "Actor") { event.preventDefault(); root.querySelector(".rta-sheet")?.classList.add("rta-sheet--drop"); } });
      root.addEventListener("dragleave", event => { if (!root.contains(event.relatedTarget)) root.querySelector(".rta-sheet")?.classList.remove("rta-sheet--drop"); });
      root.addEventListener("drop", event => this.#drop(event));
    }
    _onDrop(event) { return this.#drop(event); }
    #dropped = new WeakSet();
    async #drop(event) {
      if (this.#dropped.has(event)) return;
      this.#dropped.add(event);
      this.element.querySelector(".rta-sheet")?.classList.remove("rta-sheet--drop");
      if (!this.isEditable || this.document.documentName !== "Actor") return;
      event.preventDefault();
      const TextEditor = globalThis.foundry?.applications?.ux?.TextEditor?.implementation ?? globalThis.TextEditor;
      const data = TextEditor?.getDragEventData?.(event);
      if (data?.type !== "Item" || !data.uuid) return;
      try {
        const item = await globalThis.fromUuid(data.uuid);
        if (!item || item.parent?.uuid === this.document.uuid) return;
        const flag = item.getFlag?.(MODULE_ID, TEMPLATE_FLAG), source = foundryJSON(item.toObject());
        // A Ruleset Content is acquired (its choices asked, its grants applied); any other Item is simply added.
        if (flag?.managed) await rta().content.createOwnedContentItem(flag.versionId, this.document.uuid, flag.templateId, {sourceData: source});
        else { delete source._id; await this.document.createEmbeddedDocuments("Item", [source]); }
      } catch (error) { notifyError(error); }
      this.render();
    }
    #ownedItem(id) { return this.document.documentName === "Actor" ? this.document.items?.get(id) : null; }
    async #removeItem(id) {
      const item = this.#ownedItem(id);
      if (!item) return;
      const confirmed = await globalThis.foundry.applications.api.DialogV2.confirm({window: {title: i18n("RTA.Sheet.RemoveContent")}, content: `<p>${escapeHTML(globalThis.game.i18n.format("RTA.Sheet.RemoveContentConfirm", {name: item.name}))}</p>`, rejectClose: false});
      if (!confirmed) return;
      // Removing the Item releases what it granted (deleteItem hook).
      try { await item.delete(); } catch (error) { notifyError(error); }
      this.render();
    }
    #showTab(button) {
      const tabs = button.closest(".rta-sheet-tabs");
      for (const other of tabs.querySelectorAll(":scope > nav [data-sheet-tab]")) other.setAttribute("aria-selected", String(other === button));
      for (const panel of tabs.querySelectorAll(":scope > [data-sheet-panel]")) panel.hidden = panel.dataset.sheetPanel !== button.dataset.sheetTab;
      this.#tab = button.dataset.sheetTab;
    }
    async #write(input) {
      const state = this.#state, operation = input.dataset.operation;
      const value = input.type === "checkbox" ? input.checked : input.type === "number" ? Number(input.value) : input.value;
      if (input.type === "number" && (input.value === "" || !Number.isFinite(value))) return;
      try {
        await rta().runtime.writeSheetValue(state.versionId, state.actor, {sheetId: state.sheet.id, nodeId: input.dataset.sheetWrite, value,
          ...(input.dataset.definitionId ? {definitionId: input.dataset.definitionId} : {}),
          ...(state.content?.key ? {contentKey: state.content.key, contentTypeId: state.contentTypeId} : {})});
        if (operation !== "set") input.value = "";
      } catch (error) { notifyError(error); }
      // An owned Item's values live on its Actor: Foundry does not re-render this sheet by itself.
      this.render();
    }
    async #use(button) {
      const state = this.#state, runtime = rta().runtime, t = translator(state.versionId), actionId = button.dataset.sheetAction;
      const targets = runtime.userTargets();
      const context = {roles: {self: state.actor, source: state.actor, owner: state.actor, ...(targets[0] ? {target: targets[0]} : {target: state.actor})}, defaultRole: "self",
        ...(targets.length > 1 ? {targets} : {}), userContext: {userId: globalThis.game.user?.id ?? null, isGM: Boolean(globalThis.game.user?.isGM)},
        ...(state.content?.key ? {content: {key: state.content.key, role: "self"}} : {})};
      const definitionId = button.dataset.definitionId;
      if (definitionId) context.variables = {each: {definitionId, definition: {objectKind: "definition", objectId: definitionId}}, definition: {objectKind: "definition", objectId: definitionId}};
      try {
        const inputs = await runtime.describeActionInputs(state.versionId, actionId, context);
        if (inputs.length) {
          const values = await askInputs(inputs, t);
          if (!values) return;
          context.variables = {...(context.variables ?? {}), input: values};
        }
        const result = await runtime.executeAction(state.versionId, actionId, context);
        if (!result.allowed) throw new Error(result.reason ?? i18n("RTA.Sheet.NotAllowed"));
        await globalThis.ChatMessage.create({speaker: globalThis.ChatMessage.getSpeaker({actor: this.document.documentName === "Actor" ? this.document : this.document.parent}),
          content: renderActionChatHTML(actionSummary(result, {t, ruleset: state.ruleset}))});
        for (const offer of result.choices ?? []) {
          const picked = await askChoice(offer, t, state.ruleset);
          if (picked?.length) await runtime.chooseActions(state.versionId, offer, picked);
        }
      } catch (error) { notifyError(error); }
      this.render();
    }
    async #command(command) {
      const state = this.#state;
      try {
        if (command === "initialize") await rta().runtime.initializeContainer(state.versionId, state.actor);
        if (command === "create") { openCreationWindow({actorUuid: this.document.uuid}); return; }
      } catch (error) { notifyError(error); }
      this.render();
    }
  };

  class RulesetActorSheet extends behaviour(ActorSheetV2) {
    async rtaResolve() {
      const api = rta()?.configurator, runtime = rta()?.runtime, actor = this.document.uuid;
      if (!api || !runtime) return {notice: i18n("RTA.Sheet.NotReady")};
      const stored = await runtime.getContainerState(actor);
      const versionId = stored.rulesetVersionId || api.getActiveVersionId();
      if (!versionId) return {notice: i18n("RTA.Sheet.NoRuleset")};
      // A character not made yet is offered the active Ruleset's creation, as long as it holds no Content.
      const doc = this.document, active = api.getActiveVersionId();
      const creatable = this.isEditable && active && (!stored.rulesetVersionId || stored.rulesetVersionId === active) && !doc.getFlag?.(MODULE_ID, "creationRun")
        && !Object.keys(doc.getFlag?.(MODULE_ID, "contentAcquisitions") ?? {}).length && startableSystems(resolveRuntimeRuleset(api, active), key => key).length > 0;
      const create = {command: "create", label: i18n("RTA.Creation.CreateThis"), icon: "fa-user-plus"};
      if (!stored.rulesetVersionId) return {versionId, notice: i18n(creatable ? "RTA.Sheet.NotCreated" : "RTA.Sheet.NotInitialized"), actor,
        noticeActions: this.isEditable ? [...(creatable ? [create] : []), {command: "initialize", label: i18n(creatable ? "RTA.Sheet.InitializeEmpty" : "RTA.Sheet.Initialize")}] : []};
      const ruleset = resolveRuntimeRuleset(api, versionId), sheet = sheetFor(ruleset, {target: "actor"});
      const items = [...(doc.items ?? [])].map(item => ({id: item.id, name: item.name, img: item.img, managed: Boolean(item.getFlag?.(MODULE_ID, TEMPLATE_FLAG)?.managed)}));
      return {versionId, ruleset, sheet, actor, headerActions: creatable ? [create] : [], view: await runtime.projectSheet(versionId, sheet, {actor, items})};
    }
  }

  class RulesetItemSheet extends behaviour(ItemSheetV2) {
    async rtaResolve() {
      const api = rta()?.configurator, runtime = rta()?.runtime, flag = this.document.getFlag?.(MODULE_ID, TEMPLATE_FLAG);
      if (!api || !runtime) return {notice: i18n("RTA.Sheet.NotReady")};
      if (!flag?.versionId) return {notice: i18n("RTA.Sheet.NotContent")};
      const ruleset = resolveRuntimeRuleset(api, flag.versionId), owner = this.document.parent?.documentName === "Actor" ? this.document.parent.uuid : null;
      const owned = owner ? (await runtime.listOwnedContents(flag.versionId, owner)).some(row => row.key === this.document.id) : false;
      const content = owned ? {key: this.document.id} : {templateId: flag.templateId};
      const sheet = sheetFor(ruleset, {target: "item", contentTypeId: flag.contentTypeId});
      return {versionId: flag.versionId, ruleset, sheet, actor: owned ? owner : null, content, contentTypeId: flag.contentTypeId,
        view: await runtime.projectSheet(flag.versionId, sheet, {actor: owned ? owner : null, content})};
    }
  }
  return {RulesetActorSheet, RulesetItemSheet};
}

/** Offer both sheets for every Actor and Item type; the user picks them in the sheet choice. */
export function registerRulesetSheets(foundry = globalThis.foundry, documents = {Actor: globalThis.Actor, Item: globalThis.Item}) {
  const sheets = createRulesetSheets(foundry.applications.sheets);
  const config = foundry.applications.apps.DocumentSheetConfig;
  config.registerSheet(documents.Actor, MODULE_ID, sheets.RulesetActorSheet, {label: "RTA.Sheet.ActorSheet", makeDefault: false});
  config.registerSheet(documents.Item, MODULE_ID, sheets.RulesetItemSheet, {label: "RTA.Sheet.ItemSheet", makeDefault: false});
  return sheets;
}
