/* Played sheets in Foundry (CP-14): an Actor sheet and an Item sheet that show the Ruleset's SheetDefinition
   (or the AUTO layout), for any game system. Offered in each Document's sheet choice, never forced as the default.
   Each enabled SheetDefinition of the active Ruleset is also offered there under its own name.
   Every value changed here goes to the runtime (writeSheetValue), never to the Document's data. */
import {MODULE_ID} from "../core/module-contract.mjs";
import {sheetFor} from "../configurator/sheet-auto-layout.mjs";
import {resolveRuntimeRuleset} from "./runtime-contracts.mjs";
import {formatSheetValue, renderActionChatHTML, renderSheetHTML} from "../ui/sheet-markup.mjs";
import {escapeHTML} from "../ui/html-utils.mjs";
import {renderActionChoiceContent, renderActionInputsContent} from "../ui/dialog-markup.mjs";
import {openCreationWindow, startableSystems} from "./foundry-creation.mjs";
import {foundryJSON} from "./foundry-data.mjs";
import {confirmRTA} from "../configurator/foundry-dialogs.mjs";
import {moduleLanguage} from "../core/module-language.mjs";

const TEMPLATE_FLAG = "contentTemplate";
const rta = () => globalThis.game?.ruleThemAll;
const i18n = key => globalThis.game?.i18n?.localize?.(key) ?? key;
const versionName = record => record ? `${record.workingDraft?.nameKey ?? record.publishedSnapshot?.nameKey ?? ""} ${record.version ?? ""}`.trim() : "";
const notifyError = error => { console.error("Rule Them'All | Sheet", error); globalThis.ui?.notifications?.error?.(error?.message ?? String(error)); };

/** Tags and attributes rich notes keep; the rest is dropped (scripts, frames, forms, event handlers, javascript: links). */
const RICH_TAGS = new Set(["p", "br", "strong", "b", "em", "i", "u", "s", "del", "span", "div", "section", "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "li", "blockquote",
  "code", "pre", "a", "img", "table", "thead", "tbody", "tr", "th", "td", "hr", "sup", "sub", "figure", "figcaption"]);
const RICH_DROPPED = new Set(["script", "style", "iframe", "object", "embed", "link", "meta", "form", "input", "button", "textarea", "select", "template", "svg", "math"]);
const RICH_ATTRIBUTES = new Set(["href", "src", "alt", "title", "class", "id", "colspan", "rowspan", "target", "rel"]);
/** Rich text a player wrote, as it may be shown to anyone (the GM included): only plain formatting, links and pictures. */
export function sanitizeRichText(html, doc = globalThis.document) {
  const template = doc.createElement("template");
  template.innerHTML = String(html ?? "");
  const clean = parent => {
    for (const child of [...parent.childNodes]) {
      if (child.nodeType === 3) continue;
      if (child.nodeType !== 1) { child.remove(); continue; }
      const tag = child.tagName.toLowerCase();
      if (RICH_DROPPED.has(tag)) { child.remove(); continue; }
      clean(child);
      if (!RICH_TAGS.has(tag)) { child.replaceWith(...child.childNodes); continue; }
      for (const attribute of [...child.attributes]) {
        const name = attribute.name.toLowerCase(), value = attribute.value.trim().toLowerCase();
        if (!RICH_ATTRIBUTES.has(name) || ["href", "src"].includes(name) && /^(javascript|vbscript|data):/.test(value.replace(/\s/g, ""))) child.removeAttribute(attribute.name);
      }
    }
  };
  clean(template.content);
  return template.innerHTML;
}
/** A node of a projected sheet by id (list rows included). */
function viewNode(node, id) {
  if (!node) return null;
  if (node.id === id) return node;
  for (const child of [...(node.children ?? []), ...(node.rows ?? []).flatMap(row => row.children)]) { const found = viewNode(child, id); if (found) return found; }
  return null;
}
/** The sections a user folded, per sheet, kept in this browser. */
const COLLAPSED_KEY = `${MODULE_ID}.collapsedSections`;
const collapsedKey = () => `${COLLAPSED_KEY}.${globalThis.game?.user?.id ?? ""}`;
function collapsedSections() { try { return JSON.parse(globalThis.localStorage?.getItem(collapsedKey()) ?? "{}") ?? {}; } catch { return {}; } }
function rememberCollapsed(sheetId, id, collapsed) {
  try {
    const all = collapsedSections(), ids = new Set(all[sheetId] ?? []);
    if (collapsed) ids.add(id); else ids.delete(id);
    if (ids.size) all[sheetId] = [...ids]; else delete all[sheetId];
    globalThis.localStorage?.setItem(collapsedKey(), JSON.stringify(all));
  } catch { /* storage unavailable: the section opens again next time */ }
}

/** Ruleset text first (world overrides, Ruleset translations), then the module's. */
export function translator(versionId) {
  const api = rta()?.configurator;
  return key => { if (!key) return ""; try { return api.resolveLocalizedText(versionId, moduleLanguage(), key, i18n); } catch { return i18n(key); } };
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

async function askInputs(inputs, t, title = i18n("RTA.Sheet.ActionInputs")) {
  const Dialog = globalThis.foundry.applications.api.DialogV2;
  return Dialog.prompt({window: {title}, content: renderActionInputsContent(inputs, t), ok: {callback: (_event, button) => {
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
  const options = offer.actionIds.map(id => ({value: id, label: t(ruleset.actions?.find(a => a.id === id)?.nameKey ?? id)}));
  return Dialog.prompt({window: {title: globalThis.game.i18n.format("RTA.Sheet.ChooseActions", {count: offer.count})}, content: renderActionChoiceContent(options),
    ok: {callback: (_event, button) => [...button.form.querySelectorAll('input[name="choice"]:checked')].map(input => input.value)}, rejectClose: false});
}

/** The image an Actor's tokens take when placed (its prototype token's); for a token's own Actor (an unlinked token), that token's. */
export function tokenImage(document) {
  if (document?.documentName !== "Actor") return "";
  return (document.isToken ? document.token?.texture?.src : document.prototypeToken?.texture?.src) ?? "";
}

/** A new token image for an Actor: its prototype token's (a token's own Actor: that token's). placed: also the tokens of this
   Actor already in the scenes, those linked to it and those that still showed its previous image. Foundry Document
   updates, like the name and the portrait: not runtime state. */
export async function setTokenImage(actor, path, {placed = false, scenes = globalThis.game?.scenes} = {}) {
  if (actor.isToken) return actor.token?.update({"texture.src": path});
  const previous = actor.prototypeToken?.texture?.src ?? null;
  await actor.update({"prototypeToken.texture.src": path});
  if (!placed) return;
  for (const scene of scenes ?? []) {
    const changes = [...(scene.tokens ?? [])].filter(token => token.actorId === actor.id && (token.actorLink || token.texture?.src === previous) && token.texture?.src !== path)
      .map(token => ({_id: token.id, "texture.src": path}));
    if (changes.length) await scene.updateEmbeddedDocuments("Token", changes);
  }
}

/** The sheet a window shows: the SheetDefinition it was chosen for (Foundry's sheet choice) when this Ruleset still
   has it for this target, otherwise the first that fits (or AUTO). */
export function chosenSheet(ruleset, sheetId, {target, contentTypeId = null}) {
  const sheet = sheetId ? (ruleset.sheetDefinitions ?? []).find(entry => entry.id === sheetId && entry.enabled !== false && entry.target === target
    && (target !== "item" || !(entry.contentTypeIds ?? []).length || (entry.contentTypeIds ?? []).includes(contentTypeId))) : null;
  return sheet ?? sheetFor(ruleset, {target, contentTypeId});
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
      return renderSheetHTML(state.view, {t, name: this.document.name, img: this.document.img, token: tokenImage(this.document), editable: this.isEditable, unlocked: this.rtaUnlocked,
        notice: state.notice ?? "", noticeActions: state.noticeActions ?? [], headerActions: state.headerActions ?? []});
    }

    /* The lock, as on Foundry's own sheets: locked (the default), the sheet is played and the name and images stay as they
       are; unlocked, the name is a field and a camera button on each portrait opens Foundry's file picker. Values of the
       layout work either way: they are play controls, governed by Permissions. Only for a user who may change the Document. */
    #unlocked = false;
    get rtaUnlocked() { return Boolean(this.isEditable && this.#unlocked); }
    /** The lock button sits in the window header, before Foundry's own controls. */
    async _renderFrame(options) {
      const frame = await super._renderFrame?.(options);
      const header = frame?.querySelector?.(".window-header");
      if (header && this.isEditable) {
        const button = globalThis.document.createElement("button");
        button.type = "button";
        button.dataset.rtaSheetLock = "";
        button.addEventListener("click", event => { event.preventDefault(); event.stopPropagation(); this.rtaToggleLock(); });
        header.insertBefore(button, header.querySelector('[data-action="toggleControls"], [data-action="close"]'));
        this.#lockButton(button);
      }
      return frame;
    }
    #lockButton(button = this.element?.querySelector?.(".window-header [data-rta-sheet-lock]")) {
      if (!button) return;
      const label = i18n(this.#unlocked ? "RTA.Sheet.Lock" : "RTA.Sheet.Unlock");
      button.className = `header-control icon fa-solid ${this.#unlocked ? "fa-lock-open" : "fa-lock"}`;
      button.hidden = !this.isEditable;
      button.setAttribute("aria-pressed", String(this.#unlocked));
      button.setAttribute("aria-label", label);
      button.dataset.tooltip = label;
    }
    rtaToggleLock() {
      if (!this.isEditable) return;
      this.#unlocked = !this.#unlocked;
      this.#lockButton();
      this.render();
    }
    /** Foundry's file picker for the Document's image ("img") or its prototype token's ("token"), as its own sheets do. */
    async #editImage(button) {
      if (!this.rtaUnlocked) return;
      const FilePicker = globalThis.foundry?.applications?.apps?.FilePicker?.implementation ?? globalThis.FilePicker;
      if (!FilePicker) return;
      const which = button.dataset.sheetEditImage, current = which === "token" ? tokenImage(this.document) : this.document.img;
      const placed = button.hasAttribute("data-sheet-update-placed");
      const picker = new FilePicker({type: "image", current, callback: path => this.#setImage(which, path, {placed}).catch(notifyError),
        ...(Number.isFinite(this.position?.top) ? {position: {top: this.position.top + 40, left: this.position.left + 10}} : {})});
      return picker.browse?.(current);
    }
    async #setImage(which, path, {placed = false} = {}) {
      if (!path || !this.rtaUnlocked) return;
      if (which === "token") await setTokenImage(this.document, path, {placed});
      else await this.document.update({img: path});
      this.render();
    }
    _replaceHTML(result, content) { content.innerHTML = result; }

    _onRender(context, options) {
      super._onRender?.(context, options);
      const root = this.element;
      // The name and the images change only while the sheet is unlocked (the markup gives them only then).
      for (const input of root.querySelectorAll("[data-sheet-name]")) input.addEventListener("change", event => { if (this.rtaUnlocked) this.document.update({name: event.currentTarget.value}).catch(notifyError); });
      for (const button of root.querySelectorAll("[data-sheet-edit-image]")) button.addEventListener("click", event => { event.preventDefault(); this.#editImage(button).catch(notifyError); });
      this.#lockButton();
      for (const input of root.querySelectorAll("[data-sheet-write]:not([data-sheet-dot], [data-sheet-adjust])")) input.addEventListener("change", event => this.#write(event.currentTarget));
      // − and + of a value that can go both ways: one less, one more.
      for (const step of root.querySelectorAll("[data-sheet-adjust]")) step.addEventListener("click", event => {
        const button = event.currentTarget;
        this.#write({dataset: button.dataset, type: "number", value: button.dataset.sheetAdjust});
      });
      // A dot of a value shown as dots sets the value it carries.
      for (const dot of root.querySelectorAll("[data-sheet-dot]")) dot.addEventListener("click", event => { const button = event.currentTarget; this.#write({dataset: button.dataset, type: "number", value: button.dataset.sheetDot}); });
      for (const button of root.querySelectorAll("[data-sheet-action]")) button.addEventListener("click", event => this.#use(event.currentTarget));
      for (const button of root.querySelectorAll("[data-sheet-advance]")) button.addEventListener("click", event => this.#advance(event.currentTarget));
      for (const button of root.querySelectorAll("[data-sheet-milestones]")) button.addEventListener("click", event => this.#milestones(event.currentTarget.dataset.sheetMilestones));
      for (const button of root.querySelectorAll("[data-sheet-command]")) button.addEventListener("click", event => this.#command(event.currentTarget.dataset.sheetCommand));
      for (const button of root.querySelectorAll("[data-sheet-tab]")) button.addEventListener("click", event => this.#showTab(event.currentTarget));
      // Foldable sections: those this user folded stay folded.
      const folded = new Set(collapsedSections()[this.#state?.sheet?.id] ?? []);
      for (const button of root.querySelectorAll("[data-sheet-collapse]")) {
        if (folded.has(button.dataset.sheetCollapse)) this.#fold(button, true);
        button.addEventListener("click", event => { const toggle = event.currentTarget, fold = toggle.getAttribute("aria-expanded") === "true"; this.#fold(toggle, fold); rememberCollapsed(this.#state?.sheet?.id, toggle.dataset.sheetCollapse, fold); });
      }
      this.#richNotes(root).catch(notifyError);
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
    #fold(button, folded) {
      button.setAttribute("aria-expanded", String(!folded));
      const body = button.closest(".rta-sheet-section")?.querySelector(`:scope > [data-sheet-collapsible="${CSS.escape(button.dataset.sheetCollapse)}"]`);
      if (body) body.hidden = folded;
    }
    /** Rich notes: their text enriched by Foundry (links, @UUID, inline rolls), in Foundry's editor when this user may change
       it. What a player wrote is cleaned first: it may be shown to the GM. Without the editor, the text is edited as it is stored. */
    async #richNotes(root) {
      const boxes = [...root.querySelectorAll("[data-sheet-note-rich]")];
      if (!boxes.length) return;
      const TextEditor = globalThis.foundry?.applications?.ux?.TextEditor?.implementation ?? globalThis.TextEditor;
      const ProseMirror = globalThis.foundry?.applications?.elements?.HTMLProseMirrorElement;
      const actor = this.document.documentName === "Actor" ? this.document : this.document.parent;
      for (const box of boxes) {
        const id = box.dataset.sheetNoteRich, raw = sanitizeRichText(viewNode(this.#state?.view?.root, id)?.value ?? "");
        const enriched = TextEditor?.enrichHTML ? await TextEditor.enrichHTML(raw, {secrets: Boolean(actor?.isOwner), relativeTo: actor, rollData: actor?.getRollData?.() ?? {}}) : raw;
        const write = value => this.#write({dataset: {sheetWrite: id, operation: "set"}, type: "text", value: sanitizeRichText(value)});
        if (!box.hasAttribute("data-sheet-note-editable")) { box.innerHTML = enriched; continue; }
        if (ProseMirror?.create) {
          const editor = ProseMirror.create({name: `rta-note-${id}`, value: raw, enriched, toggled: true, documentUUID: actor?.uuid});
          editor.classList.add("rta-sheet-notes__editor");
          editor.addEventListener("change", event => { event.stopPropagation(); write(editor.value ?? ""); });
          box.replaceChildren(editor);
        } else {
          const field = Object.assign(document.createElement("textarea"), {className: "rta-sheet-notes__field", value: raw});
          field.addEventListener("change", () => write(field.value));
          box.replaceWith(field);
        }
      }
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
        await globalThis.ChatMessage.create({speaker: this.#speaker(), content: renderActionChatHTML(actionSummary(result, {t, ruleset: state.ruleset}))});
        for (const offer of result.choices ?? []) {
          const picked = await askChoice(offer, t, state.ruleset);
          if (picked?.length) await runtime.chooseActions(state.versionId, offer, picked);
        }
      } catch (error) { notifyError(error); }
      this.render();
    }
    #speaker() { return globalThis.ChatMessage.getSpeaker({actor: this.document.documentName === "Actor" ? this.document : this.document.parent}); }
    /** Buy one advancement through the runtime (the GM client writes it for a player who cannot); the chat says what it cost. */
    async #advance(button) {
      const state = this.#state, t = translator(state.versionId), {sheetAdvance: advancementId, progression: systemId, definitionId} = button.dataset;
      try {
        const result = await rta().runtime.advance(state.versionId, systemId, state.actor, advancementId, definitionId);
        if (!result.allowed) throw new Error(i18n(`RTA.Sheet.Progression.Refused.${result.reason}`));
        const advancement = state.ruleset.progressionSystems?.find(s => s.id === systemId)?.advancements?.find(a => a.id === advancementId);
        const name = id => t(state.ruleset.definitions?.find(d => d.id === id)?.nameKey ?? id);
        await globalThis.ChatMessage.create({speaker: this.#speaker(), content: renderActionChatHTML({title: t(advancement?.labelKey || advancementId),
          lines: [{label: name(definitionId), value: `${formatSheetValue(result.before)} → ${formatSheetValue(result.after)}`}, {label: i18n("RTA.Sheet.Progression.Spent"), value: `${formatSheetValue(result.cost)} ${name(advancement?.currencyRef?.objectId)}`}]})});
      } catch (error) { notifyError(error); }
      this.render();
    }
    /** Apply the milestones reached: the choices of their Actions (a feat) are asked first. */
    async #milestones(systemId) {
      const state = this.#state, runtime = rta().runtime, t = translator(state.versionId), choices = {};
      try {
        const described = await runtime.describeProgression(state.versionId, systemId, state.actor);
        for (const milestone of described.milestones.filter(m => m.reached && !m.applied && m.inputs.length)) {
          const values = await askInputs(milestone.inputs, t, t(milestone.labelKey));
          if (!values) return;
          choices[milestone.id] = values;
        }
        const result = await runtime.applyMilestones(state.versionId, systemId, state.actor, {choices});
        const label = id => t(described.milestones.find(m => m.id === id)?.labelKey ?? id);
        if (result.applied.length) await globalThis.ChatMessage.create({speaker: this.#speaker(), content: renderActionChatHTML({title: i18n("RTA.Sheet.Progression.Applied"),
          lines: result.applied.map(id => ({label: label(id), value: "✓"}))})});
        if (result.stopped) globalThis.ui?.notifications?.warn?.(globalThis.game.i18n.format("RTA.Sheet.Progression.Stopped", {name: label(result.stopped.milestoneId)}));
      } catch (error) { notifyError(error); }
      this.render();
    }
    async #command(command) {
      const state = this.#state;
      try {
        if (command === "initialize") await rta().runtime.initializeContainer(state.versionId, state.actor);
        if (command === "create") { openCreationWindow({actorUuid: this.document.uuid}); return; }
        if (command === "rebind") {
          const active = rta().configurator.getRulesetVersion(rta().configurator.getActiveVersionId());
          if (!await confirmRTA("RTA.Sheet.RebindConfirm", {name: this.document.name, ruleset: versionName(active)})) return;
          const result = await rta().content.rebindActor(active.versionId, this.document.uuid);
          globalThis.ui?.notifications?.info?.(globalThis.game.i18n.format("RTA.Sheet.Rebound", {ruleset: versionName(active), dropped: result.dropped.length, granted: result.granted?.length ?? 0}));
        }
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
      const doc = this.document, active = api.getActiveVersionId();
      // An Actor made with another version of the Ruleset (deleted, or replaced by the active one) can move onto the active one.
      const rebind = this.isEditable && active && stored.rulesetVersionId && stored.rulesetVersionId !== active
        ? {command: "rebind", label: globalThis.game.i18n.format("RTA.Sheet.Rebind", {ruleset: versionName(api.getRulesetVersion(active))}), icon: "fa-right-left"} : null;
      if (stored.rulesetVersionId && !api.getRulesetVersion(stored.rulesetVersionId))
        return {notice: i18n("RTA.Sheet.VersionGone"), actor, noticeActions: rebind ? [rebind] : []};
      // A character not made yet is offered the active Ruleset's creation, as long as it holds no Content.
      const creatable = this.isEditable && active && (!stored.rulesetVersionId || stored.rulesetVersionId === active) && !doc.getFlag?.(MODULE_ID, "creationRun")
        && !Object.keys(doc.getFlag?.(MODULE_ID, "contentAcquisitions") ?? {}).length && startableSystems(resolveRuntimeRuleset(api, active), key => key).length > 0;
      const create = {command: "create", label: i18n("RTA.Creation.CreateThis"), icon: "fa-user-plus"};
      if (!stored.rulesetVersionId) return {versionId, notice: i18n(creatable ? "RTA.Sheet.NotCreated" : "RTA.Sheet.NotInitialized"), actor,
        noticeActions: this.isEditable ? [...(creatable ? [create] : []), {command: "initialize", label: i18n(creatable ? "RTA.Sheet.InitializeEmpty" : "RTA.Sheet.Initialize")}] : []};
      const ruleset = resolveRuntimeRuleset(api, versionId), sheet = chosenSheet(ruleset, this.constructor.rtaSheetId, {target: "actor"});
      const items = [...(doc.items ?? [])].map(item => ({id: item.id, name: item.name, img: item.img, managed: Boolean(item.getFlag?.(MODULE_ID, TEMPLATE_FLAG)?.managed)}));
      return {versionId, ruleset, sheet, actor, headerActions: [...(creatable ? [create] : []), ...(rebind ? [rebind] : [])], view: await runtime.projectSheet(versionId, sheet, {actor, items})};
    }
  }

  class RulesetItemSheet extends behaviour(ItemSheetV2) {
    async rtaResolve() {
      const api = rta()?.configurator, runtime = rta()?.runtime, flag = this.document.getFlag?.(MODULE_ID, TEMPLATE_FLAG);
      if (!api || !runtime) return {notice: i18n("RTA.Sheet.NotReady")};
      if (!flag?.versionId) return {notice: i18n("RTA.Sheet.NotContent")};
      if (!api.getRulesetVersion(flag.versionId)) return {notice: i18n("RTA.Sheet.ItemVersionGone")};
      const ruleset = resolveRuntimeRuleset(api, flag.versionId), owner = this.document.parent?.documentName === "Actor" ? this.document.parent.uuid : null;
      const owned = owner ? (await runtime.listOwnedContents(flag.versionId, owner)).some(row => row.key === this.document.id) : false;
      const content = owned ? {key: this.document.id} : {templateId: flag.templateId};
      const sheet = chosenSheet(ruleset, this.constructor.rtaSheetId, {target: "item", contentTypeId: flag.contentTypeId});
      return {versionId: flag.versionId, ruleset, sheet, actor: owned ? owner : null, content, contentTypeId: flag.contentTypeId,
        view: await runtime.projectSheet(flag.versionId, sheet, {actor: owned ? owner : null, content})};
    }
  }
  return {RulesetActorSheet, RulesetItemSheet};
}

/** Documents that chose a Rule Them'All sheet the Ruleset no longer offers (the generic one, a deleted sheet) move to the
   one that fits, instead of falling back to the game system's sheet. Active GM only; returns how many moved. */
export async function repairSheetChoices(sheets, ruleset, {actors = [], items = []} = {}) {
  const prefix = `${MODULE_ID}.`, updates = [];
  const check = (document, target) => {
    const current = document.getFlag?.("core", "sheetClass");
    if (typeof current !== "string" || !current.startsWith(prefix)) return;
    const next = sheets.choiceFor(ruleset, current, {target, contentTypeId: target === "item" ? document.getFlag?.(MODULE_ID, TEMPLATE_FLAG)?.contentTypeId ?? null : null});
    if (next !== current) updates.push(document.setFlag("core", "sheetClass", next));
  };
  for (const actor of actors) { check(actor, "actor"); for (const item of actor.items ?? []) check(item, "item"); }
  for (const item of items) check(item, "item");
  await Promise.all(updates);
  return updates.length;
}

/** Foundry keeps a Document's chosen sheet as "<scope>.<class name>": the class name follows the SheetDefinition id. */
export const namedSheetClassName = sheetId => `RTASheet_${String(sheetId).replace(/[^A-Za-z0-9_-]/g, "_")}`;

/** Offer both sheets for every Actor and Item type; the user picks them in the sheet choice. */
export function registerRulesetSheets(foundry = globalThis.foundry, documents = {Actor: globalThis.Actor, Item: globalThis.Item}) {
  const sheets = createRulesetSheets(foundry.applications.sheets);
  const config = foundry.applications.apps.DocumentSheetConfig;
  config.registerSheet(documents.Actor, MODULE_ID, sheets.RulesetActorSheet, {label: "RTA.Sheet.ActorSheet", makeDefault: false});
  config.registerSheet(documents.Item, MODULE_ID, sheets.RulesetItemSheet, {label: "RTA.Sheet.ItemSheet", makeDefault: false});
  const named = new Map(), generic = {actor: true, item: true};
  const genericSheet = {actor: {document: documents.Actor, SheetClass: sheets.RulesetActorSheet, label: "RTA.Sheet.ActorSheet"}, item: {document: documents.Item, SheetClass: sheets.RulesetItemSheet, label: "RTA.Sheet.ItemSheet"}};
  /** Offers the active Ruleset's SheetDefinitions by name, and withdraws those it no longer has. Called again on every change.
     The generic "Rule Them'All sheet" is only offered where the Ruleset leaves a gap: no Actor sheet, or a Content Type no Item sheet fits. */
  sheets.registerNamed = (ruleset, t = key => key) => {
    const wanted = new Map(), enabled = (ruleset?.sheetDefinitions ?? []).filter(entry => entry.enabled !== false && ["actor", "item"].includes(entry.target));
    for (const entry of enabled) {
      const Base = entry.target === "actor" ? sheets.RulesetActorSheet : sheets.RulesetItemSheet, name = namedSheetClassName(entry.id);
      // The window opens at the size the sheet asks for (Foundry merges these options over the base sheet's).
      const SheetClass = class extends Base { static rtaSheetId = entry.id; static DEFAULT_OPTIONS = entry.window ? {position: {...entry.window}} : {}; };
      Object.defineProperty(SheetClass, "name", {value: name});
      wanted.set(`${entry.target}:${name}`, {document: entry.target === "actor" ? documents.Actor : documents.Item, SheetClass, label: t(entry.nameKey) || entry.id});
    }
    for (const [key, old] of named) if (!wanted.has(key)) config.unregisterSheet?.(old.document, MODULE_ID, old.SheetClass);
    for (const sheet of wanted.values()) config.registerSheet(sheet.document, MODULE_ID, sheet.SheetClass, {label: sheet.label, makeDefault: false});
    named.clear();
    for (const [key, sheet] of wanted) named.set(key, sheet);
    const covers = (entry, contentTypeId) => !(entry.contentTypeIds ?? []).length || entry.contentTypeIds.includes(contentTypeId);
    const need = {actor: !enabled.some(entry => entry.target === "actor"),
      item: !ruleset || (ruleset.contentTypes ?? []).some(type => !enabled.some(entry => entry.target === "item" && covers(entry, type.id)))};
    for (const target of ["actor", "item"]) {
      if (need[target] === generic[target]) continue;
      const {document, SheetClass, label} = genericSheet[target];
      if (need[target]) config.registerSheet(document, MODULE_ID, SheetClass, {label, makeDefault: false});
      else config.unregisterSheet?.(document, MODULE_ID, SheetClass);
      generic[target] = need[target];
    }
    return [...wanted.values()].map(sheet => sheet.SheetClass.name);
  };
  /** The Rule Them'All sheet a Document should use: the one it chose while still offered, otherwise the one that fits. */
  sheets.choiceFor = (ruleset, current, {target, contentTypeId = null}) => {
    const offered = id => id === `${MODULE_ID}.${genericSheet[target].SheetClass.name}` ? generic[target] : [...named.values()].some(sheet => `${MODULE_ID}.${sheet.SheetClass.name}` === id);
    if (offered(current)) return current;
    const fit = chosenSheet(ruleset, null, {target, contentTypeId});
    return fit.id === "auto" ? `${MODULE_ID}.${genericSheet[target].SheetClass.name}` : `${MODULE_ID}.${namedSheetClassName(fit.id)}`;
  };
  return sheets;
}
