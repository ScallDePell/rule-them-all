/* The WYSIWYG sheet editor (CP-14), inside the SheetDefinition entry editor. The canvas is the played sheet's own
   markup (ui/sheet-markup.mjs) with sample values; a click selects a block, its settings show below, blocks are added
   into the selection, moved with the arrows or dragged onto another block. The tree is kept in a hidden field the
   entry collector reads ([data-sheet-layout-value]); every change fires an input event so the editor knows it is dirty. */
import {prepareLayout} from "./layout-contract.mjs";
import {autoLayout} from "./sheet-auto-layout.mjs";
import {EACH_OUTPUTS, canMoveInto, childKinds, columnsOf, contentFields, defaultValueLabel, insertNode, isContainer, locate, maxColumns, moveInto, moveNode, newNode, outputLabelKey, previewView, removeNode, repeaterOf, updateNode, writableSource} from "./sheet-layout-model.mjs";
import {refToken, parseRefToken} from "./reference-token.mjs";
import {findSlot} from "./capability-slots.mjs";
import {renderLayoutPreviewHTML} from "../ui/sheet-markup.mjs";
import {renderLayoutPropertiesHTML, renderLayoutToolbarHTML} from "../ui/sheet-editor-markup.mjs";
import {selectColorsAttribute} from "../ui/select-option-presentation.mjs";
import {RTA_NEUTRAL_COLOR} from "../ui/theme-tokens.mjs";

const i18n = key => { const text = globalThis.game?.i18n?.localize?.(key); return text && text !== key ? text : key; };
const format = (key, data, fallback) => { const text = globalThis.game?.i18n?.format?.(key, data); return text && text !== key ? text : fallback; };
const HISTORY = 50;

export class SheetLayoutController {
  #host; #ruleset; #colors; #form; #root; #selected; #history = []; #dragged = null; #readOnly;

  /** host: [data-sheet-layout-editor]; ruleset: the working draft; colors(kind, entry): option colors; form: the entry form (target, content types). */
  constructor(host, {ruleset, colors = () => [RTA_NEUTRAL_COLOR], form, readOnly = false}) {
    this.#host = host; this.#ruleset = ruleset; this.#colors = colors; this.#form = form; this.#readOnly = readOnly;
    this.#root = JSON.parse(this.#field.value || "null") ?? {id: "root", kind: "grid", columns: 1, children: []};
    this.#selected = this.#root.id;
    this.#form?.addEventListener("change", event => { if (event.target.matches?.('[name="sheetTarget"], [name="sheetContentTypes"]')) this.render(); });
    // A validated Ruleset shows its sheet, read-only.
    if (readOnly) { this.#selected = null; this.render(); return; }
    host.addEventListener("change", event => this.#onChange(event));
    host.addEventListener("click", event => this.#onClick(event));
    host.addEventListener("dragstart", event => { const node = event.target.closest?.("[data-layout-node]"); if (!node) return; this.#dragged = node.dataset.layoutNode; event.dataTransfer?.setData("text/plain", this.#dragged); });
    host.addEventListener("dragover", event => { const target = event.target.closest?.("[data-layout-node]"); if (this.#dragged && target && canMoveInto(this.#root, this.#dragged, target.dataset.layoutNode)) { event.preventDefault(); this.#markDrop(target); } });
    host.addEventListener("dragleave", event => { if (!this.#host.contains(event.relatedTarget)) this.#markDrop(null); });
    host.addEventListener("drop", event => { const target = event.target.closest?.("[data-layout-node]"); event.preventDefault(); this.#markDrop(null); if (this.#dragged && target) this.#commit(moveInto(this.#root, this.#dragged, target.dataset.layoutNode)); this.#dragged = null; });
    this.render();
  }

  get #field() { return this.#host.querySelector("[data-sheet-layout-value]"); }
  get root() { return structuredClone(this.#root); }
  get #target() { return this.#form?.querySelector('[name="sheetTarget"]')?.value ?? "actor"; }
  get #contentTypeIds() { return this.#target === "item" ? [...(this.#form?.querySelectorAll('[name="sheetContentTypes"]:checked') ?? [])].map(input => input.value) : []; }

  select(id) { if (locate(this.#root, id)) { this.#selected = id; this.render(); } }

  /** A new tree: checked by the layout contract, kept for undo, written to the hidden field. */
  #commit(next, selected = this.#selected) {
    if (next === this.#root) return;
    try { prepareLayout(next); } catch (error) { globalThis.ui?.notifications?.warn?.(error.message); return; }
    this.#history.push(this.#root); if (this.#history.length > HISTORY) this.#history.shift();
    this.#root = next; this.#selected = locate(next, selected) ? selected : next.id;
    this.#field.value = JSON.stringify(next);
    this.#field.dispatchEvent(new Event("input", {bubbles: true}));
    this.render();
  }

  render() {
    if (this.#readOnly) {
      this.#host.querySelector("[data-layout-canvas]").innerHTML = renderLayoutPreviewHTML(previewView(this.#root, this.#ruleset, {target: this.#target, contentTypeIds: this.#contentTypeIds}), {t: i18n});
      return;
    }
    const found = locate(this.#root, this.#selected) ?? locate(this.#root, this.#root.id), node = found.node;
    const holder = isContainer(node) ? node : found.parent;
    const neutral = selectColorsAttribute([RTA_NEUTRAL_COLOR]);
    this.#host.querySelector("[data-layout-toolbar]").innerHTML = renderLayoutToolbarHTML({
      addable: childKinds(holder).filter(kind => newNode(kind, this.#root, this.#ruleset, {parentId: holder.id, target: this.#target})),
      canMoveUp: Boolean(found.parent) && found.index > 0, canMoveDown: Boolean(found.parent) && found.index < found.parent.children.length - 1,
      canRemove: Boolean(found.parent), neutral, undo: this.#history.length > 0});
    const view = previewView(this.#root, this.#ruleset, {target: this.#target, contentTypeIds: this.#contentTypeIds});
    const canvas = this.#host.querySelector("[data-layout-canvas]");
    canvas.innerHTML = renderLayoutPreviewHTML(view, {t: i18n, selectedId: node.id});
    for (const element of canvas.querySelectorAll("[data-layout-node]")) if (element.dataset.layoutNode !== this.#root.id && !element.hasAttribute("data-layout-drop")) element.draggable = true;
    // Show the tab that holds the selection.
    const tab = found.path.findLast(entry => entry.kind === "tab");
    if (tab) for (const button of canvas.querySelectorAll("[data-sheet-tab]")) if (button.closest(".rta-sheet-tabs") && [...button.closest(".rta-sheet-tabs").querySelectorAll(":scope > nav [data-sheet-tab]")].some(b => b.dataset.sheetTab === tab.id)) this.#showTab(button.closest(".rta-sheet-tabs"), tab.id);
    this.#host.querySelector("[data-layout-properties]").innerHTML = renderLayoutPropertiesHTML(node, this.#context(found));
  }

  #showTab(tabs, id) {
    for (const button of tabs.querySelectorAll(":scope > nav [data-sheet-tab]")) button.setAttribute("aria-selected", String(button.dataset.sheetTab === id));
    for (const panel of tabs.querySelectorAll(":scope > [data-sheet-panel]")) panel.hidden = panel.dataset.sheetPanel !== id;
  }
  #markDrop(target) {
    for (const element of this.#host.querySelectorAll("[data-layout-drop-target]")) element.removeAttribute("data-layout-drop-target");
    target?.setAttribute("data-layout-drop-target", "");
  }

  #onClick(event) {
    const command = event.target.closest?.("[data-layout-command]");
    if (command) { event.preventDefault(); return this.#command(command.dataset.layoutCommand); }
    const node = event.target.closest?.("[data-layout-canvas] [data-layout-node]");
    if (node) { event.preventDefault(); this.select(node.dataset.layoutNode); }
  }
  #command(command) {
    const id = this.#selected;
    if (command === "up" || command === "down") return this.#commit(moveNode(this.#root, id, command === "up" ? -1 : 1));
    if (command === "remove") { const parent = locate(this.#root, id)?.parent; return this.#commit(removeNode(this.#root, id), parent?.id); }
    if (command === "undo") { const previous = this.#history.pop(); if (!previous) return; this.#root = previous; this.#field.value = JSON.stringify(previous); this.#field.dispatchEvent(new Event("input", {bubbles: true})); if (!locate(previous, this.#selected)) this.#selected = previous.id; return this.render(); }
    if (command === "auto") return this.#commit(autoLayout(this.#ruleset, {target: this.#target, contentTypeIds: this.#contentTypeIds}), "root");
  }

  #onChange(event) {
    const target = event.target;
    if (!target.closest?.("[data-layout-toolbar], [data-layout-properties]")) return;
    event.stopPropagation();
    if (target.matches("[data-layout-add]")) {
      const found = locate(this.#root, this.#selected), holder = isContainer(found.node) ? found.node : found.parent;
      const node = newNode(target.value, this.#root, this.#ruleset, {parentId: holder.id, target: this.#target});
      if (node) this.#commit(insertNode(this.#root, holder.id, node), node.id);
      return;
    }
    const prop = target.dataset.layoutProp; if (!prop) return;
    const node = locate(this.#root, this.#selected).node, value = target.value;
    const number = Number(value);
    if (prop === "columns" || prop === "span") return this.#commit(updateNode(this.#root, node.id, {[prop]: number > 1 || prop === "columns" ? number : undefined}));
    if (prop === "labelKey" || prop === "textKey") return this.#commit(updateNode(this.#root, node.id, {[prop]: value}));
    if (prop === "definitionTypeId") return this.#commit(this.#retargetRepeater(node, value));
    if (prop === "conditionRef") return this.#commit(updateNode(this.#root, node.id, {query: {...node.query, conditionRef: value || undefined}}));
    if (prop === "actionRef") return this.#commit(updateNode(this.#root, node.id, {actionRef: value}));
    if (prop === "write") return this.#commit(updateNode(this.#root, node.id, {write: value ? {operation: value} : undefined}));
    if (prop === "sourceKind") {
      const first = this.#sourceChoices(value, node)[0];
      if (!first) return this.render();
      return this.#commit(this.#withSource(node, this.#parseSource(value, first.value)));
    }
    if (prop === "sourceRef") return this.#commit(this.#withSource(node, this.#parseSource(node.source.kind, value)));
  }
  /** A new source; a write the new source does not allow is dropped. */
  #withSource(node, source) { return updateNode(this.#root, node.id, {source, write: node.write && writableSource(source) ? node.write : undefined}); }
  /** A repeater of another type: its row values keep only the outputs that type has. */
  #retargetRepeater(node, typeId) {
    let next = updateNode(this.#root, node.id, {query: {definitionTypeId: typeId}});
    const outputs = this.#eachOutputs(typeId);
    for (const child of locate(next, node.id).node.children) if (child.source?.kind === "each" && !outputs.some(o => o.capabilityId === child.source.capabilityId && o.outputId === child.source.outputId))
      next = outputs[0] ? updateNode(next, child.id, {source: {kind: "each", capabilityId: outputs[0].capabilityId, outputId: outputs[0].outputId}}) : removeNode(next, child.id);
    return next;
  }

  #eachOutputs(typeId) {
    const capabilities = new Set((this.#ruleset.definitions ?? []).filter(d => d.definitionTypeId === typeId).flatMap(d => d.capabilities ?? []));
    return EACH_OUTPUTS.filter(o => capabilities.has(o.capabilityId));
  }
  #sourceChoices(kind, node) {
    const r = this.#ruleset, color = (k, e) => selectColorsAttribute(this.#colors(k, e));
    if (kind === "output") return (r.definitions ?? []).flatMap(definition => EACH_OUTPUTS.filter(o => (definition.capabilities ?? []).includes(o.capabilityId)).flatMap(o => {
      const slots = ["pool", "collection"].includes(o.capabilityId) ? (definition.slots?.[o.capabilityId] ?? []).map(slot => slot.id) : [null];
      return slots.map(slotId => ({value: refToken({objectKind: "definition", objectId: definition.id, capabilityId: o.capabilityId, ...(slotId ? {slotId} : {}), outputId: o.outputId}),
        label: `${definition.nameKey} · ${slotId ? `${findSlot(definition, o.capabilityId, slotId)?.name || slotId} · ` : ""}${i18n(outputLabelKey(o.capabilityId, o.outputId))}`, colors: color("definition", definition)}));
    }));
    if (kind === "formula") return (r.formulas ?? []).map(f => ({value: f.id, label: f.nameKey, colors: color("formula", f)}));
    if (kind === "parameter") return (r.parameters ?? []).map(p => ({value: p.id, label: p.nameKey, colors: color("parameter", p)}));
    if (kind === "each") return this.#eachOutputs(repeaterOf(this.#root, node.id)?.query?.definitionTypeId).map(o => ({value: `${o.capabilityId}|${o.outputId}`, label: i18n(outputLabelKey(o.capabilityId, o.outputId)), colors: selectColorsAttribute([RTA_NEUTRAL_COLOR])}));
    if (kind === "field") return contentFields(r, this.#contentTypeIds).map(f => ({value: f.id, label: f.name || f.id, colors: color("contentType", r.contentTypes?.find(t => t.id === f.contentTypeId))}));
    return [];
  }
  #parseSource(kind, token) {
    if (kind === "output") { const reference = parseRefToken(token); return {kind, reference}; }
    if (kind === "formula") return {kind, formulaRef: token};
    if (kind === "parameter") return {kind, parameterRef: token};
    if (kind === "each") { const [capabilityId, outputId] = token.split("|"); return {kind, capabilityId, outputId}; }
    return {kind: "field", fieldId: token};
  }
  #sourceToken(source) {
    if (source?.kind === "output") return refToken(source.reference);
    if (source?.kind === "each") return `${source.capabilityId}|${source.outputId}`;
    return source?.formulaRef ?? source?.parameterRef ?? source?.fieldId ?? "";
  }

  /** Everything the properties markup needs for the selected block. */
  #context(found) {
    const node = found.node, neutral = selectColorsAttribute([RTA_NEUTRAL_COLOR]), r = this.#ruleset;
    const inRepeater = Boolean(repeaterOf(this.#root, node.id));
    const kinds = [["output", "RTA.SheetEditor.Source.output"], ["formula", "RTA.SheetEditor.Source.formula"], ["parameter", "RTA.SheetEditor.Source.parameter"], ["each", "RTA.SheetEditor.Source.each"], ["field", "RTA.SheetEditor.Source.field"]]
      .filter(([kind]) => (kind !== "each" || inRepeater) && (kind !== "field" || this.#target === "item") && (kind === node.source?.kind || this.#sourceChoices(kind, node).length));
    const label = defaultValueLabel(node.source, r, {contentTypeIds: this.#contentTypeIds});
    return {
      parentColumns: found.parent ? columnsOf(found.parent) : 1,
      columnChoices: kind => Array.from({length: maxColumns(kind)}, (_, i) => ({value: String(i + 1), label: format("RTA.SheetEditor.ColumnCount", {count: i + 1}, String(i + 1)), colors: neutral})),
      spanChoices: count => Array.from({length: count}, (_, i) => ({value: String(i + 1), label: format("RTA.SheetEditor.SpanCount", {count: i + 1}, String(i + 1)), colors: neutral})),
      definitionTypes: (r.definitionTypes ?? []).filter(t => (r.definitions ?? []).some(d => d.definitionTypeId === t.id)).map(t => ({value: t.id, label: t.nameKey, colors: selectColorsAttribute(this.#colors("definitionType", t))})),
      conditions: [{value: "", label: i18n("RTA.SheetEditor.AllOfThem"), colors: neutral}, ...(r.conditions ?? []).map(c => ({value: c.id, label: c.nameKey, colors: selectColorsAttribute(this.#colors("condition", c))}))],
      actions: (r.actions ?? []).map(a => ({value: a.id, label: a.nameKey, colors: selectColorsAttribute(this.#colors("action", a))})),
      sourceKinds: kinds.map(([value, key]) => ({value, label: i18n(key), colors: neutral})),
      sourceChoices: kind => this.#sourceChoices(kind, node),
      sourceToken: source => this.#sourceToken(source),
      defaultLabel: n => n.kind === "action" ? r.actions?.find(a => a.id === n.actionRef)?.nameKey ?? "" : label.label || i18n(label.labelKey ?? ""),
      writable: node.kind === "value" && writableSource(node.source),
      writeChoices: [["", "RTA.SheetEditor.Write.none"], ["set", "RTA.SheetEditor.Write.set"], ["add", "RTA.SheetEditor.Write.add"], ["subtract", "RTA.SheetEditor.Write.subtract"]].map(([value, key]) => ({value, label: i18n(key), colors: neutral}))
    };
  }
}
