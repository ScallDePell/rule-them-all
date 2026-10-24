/** The assistant window: choose a path, answer its questions on one page, see what it will create, use and add,
 * then apply it in one write (configurator API planAssistant / applyAssistant). Nothing is written before Apply. */
import {ConfiguratorWindow} from "./configurator-window.mjs";
import {MODULE_ID} from "../core/module-contract.mjs";
import {moduleLanguage} from "../core/module-language.mjs";
import {ASSISTANT_GROUPS, ASSISTANT_PATHS} from "./assistant-paths.mjs";
import {assistantFormModel, assistantPreviewModel, formShape, setAnswer, answerAt} from "./assistant-view.mjs";
import {fieldsHTML, previewHTML} from "../ui/assistant-markup.mjs";
import {ExpressionBuilderController, expressionSources} from "./expression-builder-controller.mjs";
import {expressionBuilderModel} from "./entry-expression-model.mjs";
import {renderExpressionBuilderHTML} from "../ui/expression-builder-markup.mjs";
import {collectExpression} from "./entry-expression-serialization.mjs";
import {createSelectColorResolver} from "../ui/select-option-presentation.mjs";

const WORDS = ["choose", "none", "add", "remove", "existing", "enable", "id", "errors", "created", "reused", "added", "filled", "warnings", "nothing"];

export class AssistantApp extends ConfiguratorWindow {
  static DEFAULT_OPTIONS = {id: "rta-assistant", window: {title: "RTA.Assistant.Title", resizable: true}, position: {width: 1080, height: 820}};
  static PARTS = {content: {template: `modules/${MODULE_ID}/templates/configurator/assistant.hbs`, scrollable: ["[data-assistant-paths]", "[data-assistant-main]"]}};
  static MINIMUM = {width: 560, height: 420};

  #api; #versionId; #onApplied; #onOpenEntry; #onTryLab;
  #pathId = null; #answers = {}; #applied = null; #error = ""; #shape = ""; #labels = {}; #plan = null; #texts = null; #timer = null;
  #expressions = new ExpressionBuilderController({sources: () => this.#sources(), editorOf: node => node.closest("[data-expr-editor]")?.dataset.exprEditor ?? "formula",
    bind: () => {}, changed: () => this.#refresh()});

  /** pathId and answers open it on a path already answered in part. */
  constructor({api, versionId, pathId = null, answers = {}, onApplied = () => {}, onOpenEntry = () => {}, onTryLab = () => {}}, options = {}) {
    super(options); this.#api = api; this.#versionId = versionId; this.#pathId = pathId; this.#answers = structuredClone(answers); this.#onApplied = onApplied; this.#onOpenEntry = onOpenEntry; this.#onTryLab = onTryLab;
  }
  get versionId() { return this.#versionId; }

  #t = key => game.i18n.localize(key);
  /** Ruleset words (a name in the GM's language, or a text key) as shown. */
  #entryName = key => { try { return this.#api.resolveLocalizedText(this.#versionId, moduleLanguage(), key, value => game.i18n.localize(value)); } catch { return game.i18n.localize(key); } };
  #ruleset() { return this.#api.getRulesetVersion(this.#versionId)?.workingDraft ?? this.#api.getRuleset(this.#versionId) ?? {}; }
  /** The words of every name a path gives its entries, in the GM's language. */
  #textMap() { return this.#texts ??= Object.fromEntries(this.#api.assistantTextKeys().map(key => [key, game.i18n.localize(key)])); }
  #sources() {
    const ruleset = this.#ruleset(), colors = createSelectColorResolver({definitionTypes: ruleset.definitionTypes ?? [], contentTypes: ruleset.contentTypes ?? [], familyColors: ruleset.familyColors ?? {}, ruleset});
    return expressionSources(ruleset, {optionColors: colors, findCapability: id => this.#api.getCapabilityType(id), language: moduleLanguage(), contextListId: "rta-assistant-context-paths"});
  }
  #words() { return Object.fromEntries(WORDS.map(word => [word, this.#t(`RTA.Assistant.Word.${word.charAt(0).toUpperCase()}${word.slice(1)}`)])); }

  /** The form and plan of the current answers. */
  #model() {
    const texts = this.#textMap(), describe = (pathId, answers) => this.#api.describeAssistantPath(this.#versionId, pathId, answers, {texts});
    const options = {describe, paths: ASSISTANT_PATHS, t: this.#t, entryName: this.#entryName};
    const first = assistantFormModel(this.#pathId, this.#answers, options);
    const plan = this.#api.planAssistant(this.#versionId, this.#pathId, first.answers, {texts});
    const errors = Object.fromEntries(assistantPreviewModel(plan, {t: this.#t, entryName: this.#entryName, labels: first.labels, ruleset: this.#ruleset()}).errors.map(error => [error.path, error.message]));
    const form = assistantFormModel(this.#pathId, this.#answers, {...options, errors});
    const preview = assistantPreviewModel(plan, {t: this.#t, entryName: this.#entryName, labels: form.labels, ruleset: this.#ruleset()});
    return {form, plan, preview};
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options), record = this.#api.getRulesetVersion(this.#versionId), readOnly = record?.status === "validated";
    const cards = ASSISTANT_PATHS.map(path => ({id: path.id, group: path.group, title: this.#t(`RTA.Assistant.Path.${path.id}.Title`), summary: this.#t(`RTA.Assistant.Path.${path.id}.Summary`), active: path.id === this.#pathId,
      search: [this.#t(`RTA.Assistant.Path.${path.id}.Title`), this.#t(`RTA.Assistant.Path.${path.id}.Summary`), ...(path.keywords ?? [])].join(" ").toLowerCase()}));
    const groups = ASSISTANT_GROUPS.map(group => ({id: group, title: this.#t(`RTA.Assistant.Group.${group}`), cards: cards.filter(card => card.group === group)}));
    const out = {...context, groups, readOnly, error: this.#error, rulesetName: this.#entryName(record?.workingDraft?.nameKey ?? record?.publishedSnapshot?.nameKey ?? "")};
    const words = this.#words();
    if (this.#applied) out.applied = {html: previewHTML(this.#applied, words, {open: true}), title: this.#t(`RTA.Assistant.Path.${this.#applied.pathId}.Title`)};
    if (!this.#pathId) return out;
    const {form, plan, preview} = this.#model();
    this.#answers = form.answers; this.#shape = formShape(form.fields); this.#labels = form.labels; this.#plan = plan;
    const sources = this.#sources();
    const expressionHTML = field => renderExpressionBuilderHTML(expressionBuilderModel(field.expression, field.kind, sources), sources);
    return {...out, path: {id: this.#pathId, title: this.#t(form.path.titleKey), summary: this.#t(form.path.summaryKey), limits: this.#t(form.path.limitsKey)},
      formHTML: fieldsHTML(form.fields, words, expressionHTML), previewHTML: previewHTML(preview, words), canApply: plan.valid && !readOnly};
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    const root = this.element?.querySelector("[data-assistant]");
    if (!root) return;
    root.addEventListener("click", event => { const button = event.target.closest?.("[data-action]"); if (button && root.contains(button)) this.#action(button, event); });
    root.addEventListener("input", event => {
      if (event.target.matches?.("[data-assistant-search]")) return this.#filter(event.target.value);
      // Typing refreshes the preview a moment later; the form is drawn again only when what it shows changes.
      if (event.target.matches?.("input[data-answer], [data-expr-root] input")) { clearTimeout(this.#timer); this.#timer = setTimeout(() => this.#refresh(), 300); }
    });
    root.addEventListener("change", event => {
      if (event.target.matches?.("[data-assistant-search]")) return;
      if (event.target.closest?.("[data-expr-root]")) this.#expressions.change(event.target);
      clearTimeout(this.#timer); this.#refresh();
    });
  }

  #filter(query) {
    const words = String(query ?? "").trim().toLowerCase().split(/\s+/).filter(Boolean);
    for (const card of this.element.querySelectorAll("[data-path-card]")) card.hidden = !words.every(word => card.dataset.search.includes(word));
    for (const group of this.element.querySelectorAll("[data-path-group]")) group.hidden = ![...group.querySelectorAll("[data-path-card]")].some(card => !card.hidden);
  }

  /** The answers the form holds now. */
  #collect() {
    const form = this.element?.querySelector("[data-assistant-form]");
    if (!form) return this.#answers;
    const answers = {};
    for (const list of form.querySelectorAll("[data-answer-list]")) setAnswer(answers, list.dataset.answerList, []);
    for (const row of form.querySelectorAll("[data-answer-row]")) if (answerAt(answers, row.dataset.answerRow) === undefined) setAnswer(answers, row.dataset.answerRow, {});
    for (const control of form.querySelectorAll("[data-answer]")) {
      const path = control.dataset.answer, kind = control.dataset.answerKind;
      if (kind === "formula" || kind === "condition") { setAnswer(answers, path, collectExpression(control, null)); continue; }
      if (kind === "boolean") { setAnswer(answers, path, control.checked); continue; }
      if (kind === "entries") { setAnswer(answers, path, [...control.selectedOptions].map(option => ({use: option.value}))); continue; }
      const value = String(control.value ?? "");
      if (value === "") continue;
      if (kind === "entry") { setAnswer(answers, path, value === "create" ? {create: answerAt(answers, `${path}.create`) ?? {}} : {use: value.slice(4)}); continue; }
      if (kind === "nameId") { const name = answerAt(answers, path); setAnswer(answers, path, {name: typeof name === "string" ? name : "", id: value}); continue; }
      setAnswer(answers, path, value);
    }
    // An optional Formula switched on starts as a builder; switched off, it is left out.
    for (const toggle of form.querySelectorAll("[data-answer-toggle]")) {
      const path = toggle.dataset.answerToggle, present = answerAt(answers, path) !== undefined;
      if (toggle.checked && !present) setAnswer(answers, path, {type: "literal", value: 0});
      if (!toggle.checked && present) setAnswer(answers, path, undefined);
    }
    return answers;
  }

  /** Read the answers; draw the form again if it shows other controls now, else only the preview and the errors. */
  #refresh() {
    if (!this.#pathId || !this.element?.querySelector("[data-assistant-form]")) return;
    this.#answers = this.#collect(); this.#applied = null; this.#error = "";
    let model;
    try { model = this.#model(); } catch (error) { this.#error = error.message; return this.render(false); }
    if (formShape(model.form.fields) !== this.#shape) return this.render(false);
    this.#plan = model.plan; this.#labels = model.form.labels;
    const preview = this.element.querySelector("[data-assistant-preview]");
    if (preview) preview.innerHTML = previewHTML(model.preview, this.#words());
    const errors = Object.fromEntries(model.preview.errors.map(error => [error.path, error.message]));
    for (const line of this.element.querySelectorAll("[data-answer-error]")) { const message = errors[line.dataset.answerError] ?? ""; line.textContent = message; line.hidden = !message; line.closest("[data-answer-field]")?.classList.toggle("is-invalid", Boolean(message)); }
    const apply = this.element.querySelector('[data-action="apply"]'), record = this.#api.getRulesetVersion(this.#versionId);
    if (apply) apply.disabled = !model.plan.valid || record?.status === "validated";
  }

  async #action(button, event) {
    const action = button.dataset.action;
    if (this.#expressions.action(button, action)) return;
    if (action === "choosePath") { this.#pathId = button.dataset.pathId; this.#answers = {}; this.#applied = null; this.#error = ""; return this.render(false); }
    if (action === "addRow" || action === "removeRow") {
      const answers = this.#collect();
      if (action === "addRow") { const rows = answerAt(answers, button.dataset.list) ?? []; setAnswer(answers, button.dataset.list, [...rows, {}]); }
      else { const path = button.dataset.row.split("."), index = Number(path.pop()), rows = answerAt(answers, path.join(".")) ?? []; setAnswer(answers, path.join("."), rows.filter((_, i) => i !== index)); }
      this.#answers = answers; return this.render(false);
    }
    if (action === "apply") return this.#apply();
    if (action === "openEntry") return this.#onOpenEntry(button.dataset.kind, button.dataset.entryId);
    if (action === "tryLab") return this.#onTryLab();
    if (action === "again") { this.#applied = null; this.#pathId = null; return this.render(false); }
  }

  async #apply() {
    const answers = this.#collect(), texts = this.#textMap(), pathId = this.#pathId;
    try {
      const result = await this.#api.applyAssistant(this.#versionId, pathId, answers, {texts, baseFingerprint: this.#plan?.fingerprint ?? null});
      const preview = assistantPreviewModel({...result, valid: true, errors: []}, {t: this.#t, entryName: this.#entryName, ruleset: this.#ruleset()});
      this.#applied = {...preview, pathId}; this.#pathId = null; this.#answers = {}; this.#error = "";
      ui.notifications?.info?.(game.i18n.format("RTA.Assistant.Applied", {count: result.created.length}));
      await this.#onApplied(result);
    } catch (error) {
      this.#answers = answers;
      this.#error = error.code === "ASSISTANT_STALE" ? this.#t("RTA.Assistant.Stale") : error.code === "ASSISTANT_INVALID" ? this.#t("RTA.Assistant.Invalid") : error.message;
    }
    return this.render(false);
  }
}
