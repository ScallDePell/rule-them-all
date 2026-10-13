/* The WYSIWYG sheet editor (CP-14), inside the SheetDefinition entry editor. The canvas is the played sheet's own
   markup (ui/sheet-markup.mjs) with sample values; a click selects a block, its settings show below, blocks are added
   into the selection from the palette (or dragged from it onto the sheet), moved with the arrows or dragged onto another
   block (before a leaf when dropped on its top half). The tools sit beside the sheet. The tree is kept in a hidden field the
   entry collector reads ([data-sheet-layout-value]); every change fires an input event so the editor knows it is dirty. */
import {iconClasses, prepareLayout} from "./layout-contract.mjs";
import {autoLayout} from "./sheet-auto-layout.mjs";
import {EACH_OUTPUTS, itemContentTypes, canMoveInto, canPlace, paletteGroups, paletteNode, childKinds, columnsOf, contentFields, defaultValueLabel, insertNode, isContainer, locate, maxColumns, moveInto, moveNode, newNode, outputLabelKey, previewView, removeNode, repeaterOf, updateNode, writableSource} from "./sheet-layout-model.mjs";
import {refToken, parseRefToken} from "./reference-token.mjs";
import {findSlot} from "./capability-slots.mjs";
import {renderLayoutPreviewHTML} from "../ui/sheet-markup.mjs";
import {kindText, renderLayoutPaletteHTML, renderLayoutPropertiesHTML, renderLayoutToolbarHTML} from "../ui/sheet-editor-markup.mjs";
import {selectColorsAttribute} from "../ui/select-option-presentation.mjs";
import {RTA_NEUTRAL_COLOR} from "../ui/theme-tokens.mjs";
import {LAYOUT_CONTAINERS} from "./layout-contract.mjs";
import {SHEET_ALIGNS, SHEET_FILL_PROPS, SHEET_GAPS, SHEET_IMAGE_FITS, SHEET_IMAGE_HEIGHTS, SHEET_LABELS, SHEET_NO_COLOR, SHEET_SIZES, SHEET_SPACES, SHEET_TONES} from "./layout-style-contract.mjs";

/** The fonts Foundry offers (its own and those the world adds in its font settings). */
function availableFonts() {
  const config = globalThis.foundry?.applications?.settings?.menus?.FontConfig;
  try { const fonts = config?.getAvailableFonts?.(); if (fonts?.length) return [...fonts]; } catch { /* the font settings are not ready */ }
  const defined = Object.keys(globalThis.CONFIG?.fontDefinitions ?? {});
  return defined.length ? defined : ["Signika", "Modesto Condensed", "Amiri", "Bruno Ace"];
}
const toHex = rgb => { const m = String(rgb).match(/\d+(\.\d+)?/g); return m && m.length >= 3 ? `#${m.slice(0, 3).map(n => Math.round(Number(n)).toString(16).padStart(2, "0")).join("")}` : null; };

const i18n = key => { const text = globalThis.game?.i18n?.localize?.(key); return text && text !== key ? text : key; };
const format = (key, data, fallback) => { const text = globalThis.game?.i18n?.format?.(key, data); return text && text !== key ? text : fallback; };
const HISTORY = 50;
/** The element an event happened on: Firefox aims drag events at the text inside an element (a text node). */
const elementOf = event => event.target?.nodeType === 1 ? event.target : event.target?.parentElement ?? null;
/** Pixels at the top and bottom of a block where a drop goes next to it rather than into it. */
const EDGE = 12;

export class SheetLayoutController {
  #host; #ruleset; #colors; #form; #root; #selected; #history = []; #dragged = null; #readOnly; #paletteOpen = true; #styleOpen = false; #toneHex = null;

  /** host: [data-sheet-layout-editor]; ruleset: the working draft; colors(kind, entry): option colors; form: the entry form (target, content types). */
  constructor(host, {ruleset, colors = () => [RTA_NEUTRAL_COLOR], form, readOnly = false}) {
    this.#host = host; this.#ruleset = ruleset; this.#colors = colors; this.#form = form; this.#readOnly = readOnly;
    this.#root = JSON.parse(this.#field.value || "null") ?? {id: "root", kind: "grid", columns: 1, children: []};
    this.#selected = this.#root.id;
    this.#form?.addEventListener("change", event => { if (event.target.matches?.('[name="sheetTarget"], [name="sheetContentTypes"]')) { this.#renderPalette(); this.render(); } });
    // A validated Ruleset shows its sheet, read-only.
    if (readOnly) { this.#selected = null; this.render(); return; }
    host.addEventListener("change", event => this.#onChange(event));
    // The opacity slider says its value while it moves; the change is kept when it is let go.
    host.addEventListener("input", event => { if (event.target.matches?.('[data-layout-style="opacity"]')) { event.stopPropagation(); const label = event.target.closest(".rta-form-row")?.querySelector("[data-layout-opacity-value]"); if (label) label.textContent = `${event.target.value} %`; } });
    host.addEventListener("toggle", event => { if (event.target.matches?.("[data-layout-style-group]")) this.#styleOpen = event.target.open; }, true);
    host.addEventListener("click", event => this.#onClick(event));
    // A palette element is not a button: Enter or Space adds it like a click.
    host.addEventListener("keydown", event => { const item = elementOf(event)?.closest("[data-layout-palette]"); if (item && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); this.#add(JSON.parse(item.dataset.layoutPalette), this.#selected); } });
    host.addEventListener("input", event => { if (event.target.matches?.("[data-layout-palette-filter]")) this.#filterPalette(event.target.value); });
    host.addEventListener("toggle", event => { if (event.target.matches?.("[data-layout-palette-panel]")) this.#paletteOpen = event.target.open; }, true);
    // A block of the sheet, or an element of the palette, dragged onto the sheet.
    host.addEventListener("dragstart", event => {
      const item = elementOf(event)?.closest("[data-layout-palette]"), node = elementOf(event)?.closest("[data-layout-canvas] [data-layout-node]");
      if (!item && !node) return;
      this.#dragged = item ? {spec: JSON.parse(item.dataset.layoutPalette)} : {id: node.dataset.layoutNode};
      if (event.dataTransfer) { event.dataTransfer.effectAllowed = item ? "copy" : "move"; event.dataTransfer.setData("text/plain", item?.dataset.layoutPalette ?? node.dataset.layoutNode); }
    });
    host.addEventListener("dragover", event => {
      const target = elementOf(event)?.closest("[data-layout-canvas] [data-layout-node]"), place = target && this.#placement(event, target);
      if (place) { event.preventDefault(); this.#markDrop(target, place); }
      else this.#markDrop(null);
    });
    host.addEventListener("dragleave", event => { if (!this.#host.contains(event.relatedTarget)) this.#markDrop(null); });
    host.addEventListener("dragend", () => { this.#markDrop(null); this.#dragged = null; });
    host.addEventListener("drop", event => {
      const target = elementOf(event)?.closest("[data-layout-canvas] [data-layout-node]"), place = target && this.#placement(event, target), dragged = this.#dragged;
      event.preventDefault(); this.#markDrop(null); this.#dragged = null;
      if (!place) return;
      const targetId = target.dataset.layoutNode, at = {before: place === "before", beside: place !== "into"};
      if (dragged.id) return this.#commit(moveInto(this.#root, dragged.id, targetId, at));
      this.#add(dragged.spec, targetId, at);
    });
    this.#renderPalette();
    this.render();
  }

  #viewer = "all";
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
    this.#host.querySelector("[data-layout-toolbar]").innerHTML = renderLayoutToolbarHTML({
      canMoveUp: Boolean(found.parent) && found.index > 0, canMoveDown: Boolean(found.parent) && found.index < found.parent.children.length - 1,
      canRemove: Boolean(found.parent), undo: this.#history.length > 0, viewer: this.#viewer});
    const view = previewView(this.#root, this.#ruleset, {target: this.#target, contentTypeIds: this.#contentTypeIds, viewer: this.#viewer === "all" ? null : this.#viewer});
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
  #markDrop(target, place = null) {
    for (const element of this.#host.querySelectorAll("[data-layout-drop-target]")) element.removeAttribute("data-layout-drop-target");
    target?.setAttribute("data-layout-drop-target", place);
  }
  /** Where what is dragged lands on this block: "into" a container that takes it (but next to it on its top or bottom
     edge), else "before" or "after" it by the half it is dropped on; null when it cannot go there. */
  #placement(event, target) {
    const dragged = this.#dragged, targetId = target.dataset.layoutNode;
    if (!dragged) return null;
    const node = dragged.id ? null : paletteNode(dragged.spec, this.#root, this.#ruleset, {parentId: targetId, target: this.#target});
    const fits = beside => dragged.id ? canMoveInto(this.#root, dragged.id, targetId, {beside}) : canPlace(this.#root, node, targetId, {beside});
    // The empty frame of a container ("add a block here") always takes what is dropped on it.
    if (target.hasAttribute("data-layout-drop")) return fits(false) ? "into" : null;
    const box = target.getBoundingClientRect?.(), y = event.clientY;
    const half = box?.height ? (y < box.top + box.height / 2 ? "before" : "after") : "after";
    const found = locate(this.#root, targetId), kind = node?.kind ?? locate(this.#root, dragged.id)?.node.kind;
    if (isContainer(found?.node) && childKinds(found.node).includes(kind)) {
      const edge = box?.height && y >= box.top && y <= box.bottom && (y < box.top + EDGE || y > box.bottom - EDGE);
      if (edge && found.parent && fits(true)) return half;
      return fits(false) ? "into" : null;
    }
    return fits(true) ? half : null;
  }
  /** A palette element added at targetId (into it, or next to it). */
  #add(spec, targetId, {before = false, beside = false} = {}) {
    const node = paletteNode(spec, this.#root, this.#ruleset, {parentId: targetId, target: this.#target});
    if (!node || !canPlace(this.#root, node, targetId, {beside})) { globalThis.ui?.notifications?.warn?.(i18n("RTA.SheetEditor.Palette.CannotGo")); return; }
    this.#commit(insertNode(this.#root, targetId, node, {before, beside}), node.id);
  }
  #renderPalette() {
    const host = this.#host.querySelector("[data-layout-palette-host]");
    if (!host) return;
    const filter = host.querySelector("[data-layout-palette-filter]")?.value ?? "";
    const groups = paletteGroups(this.#ruleset, {target: this.#target, contentTypeIds: this.#contentTypeIds}).map(group => ({
      text: group.labelKey ? i18n(group.labelKey) : group.label,
      items: group.items.map(item => ({...item, text: item.labelKey ? i18n(item.labelKey) : item.label ?? kindText(item.kind)}))}));
    host.innerHTML = renderLayoutPaletteHTML(groups, {open: this.#paletteOpen, filter});
    this.#filterPalette(filter);
  }
  #filterPalette(text) {
    const wanted = text.trim().toLowerCase();
    for (const group of this.#host.querySelectorAll("[data-layout-palette-group]")) {
      let shown = 0;
      for (const item of group.querySelectorAll("[data-layout-palette]")) { item.hidden = Boolean(wanted) && !item.dataset.layoutPaletteLabel.includes(wanted); if (!item.hidden) shown++; }
      group.hidden = !shown;
    }
  }

  #onClick(event) {
    const command = elementOf(event)?.closest("[data-layout-command]");
    if (command) { event.preventDefault(); return this.#command(command.dataset.layoutCommand); }
    const item = elementOf(event)?.closest("[data-layout-palette]");
    if (item) { event.preventDefault(); return this.#add(JSON.parse(item.dataset.layoutPalette), this.#selected); }
    const pick = elementOf(event)?.closest("[data-layout-pick]");
    if (pick) { event.preventDefault(); return this.#pick(pick); }
    const node = elementOf(event)?.closest("[data-layout-canvas] [data-layout-node]");
    if (node) { event.preventDefault(); this.select(node.dataset.layoutNode); }
  }
  #command(command) {
    const id = this.#selected;
    if (command === "up" || command === "down") return this.#commit(moveNode(this.#root, id, command === "up" ? -1 : 1));
    if (command === "remove") { const parent = locate(this.#root, id)?.parent; return this.#commit(removeNode(this.#root, id), parent?.id); }
    if (command === "undo") { const previous = this.#history.pop(); if (!previous) return; this.#root = previous; this.#field.value = JSON.stringify(previous); this.#field.dispatchEvent(new Event("input", {bubbles: true})); if (!locate(previous, this.#selected)) this.#selected = previous.id; return this.render(); }
    if (command === "addTab") {
      // Into the tabs selected, or next to the tab selected.
      const found = locate(this.#root, id), holder = found.node.kind === "tabs" ? found.node : found.parent;
      const tab = newNode("tab", this.#root, this.#ruleset);
      return this.#commit(insertNode(this.#root, holder.id, tab), tab.id);
    }
    if (command === "unstyle") return this.#commit(updateNode(this.#root, id, {style: undefined}));
    if (command === "auto") return this.#commit(autoLayout(this.#ruleset, {target: this.#target, contentTypeIds: this.#contentTypeIds}), "root");
  }

  #onChange(event) {
    const target = event.target;
    if (!target.closest?.("[data-layout-toolbar], [data-layout-properties], [data-layout-palette-host]")) return;
    if (target.matches("[data-layout-palette-filter]")) return event.stopPropagation();
    event.stopPropagation();
    // Preview only: the tree does not change.
    if (target.matches("[data-layout-viewer]")) { this.#viewer = target.value; return this.render(); }
    if (target.dataset.layoutSeen) {
      // Every box ticked: everyone (stored as nothing). The last box cannot be cleared: a block is for someone.
      const node = locate(this.#root, this.#selected).node, seenBy = ["player", "observer", "gm"].filter(who => this.#host.querySelector(`[data-layout-seen="${who}"]`)?.checked);
      if (!seenBy.length) return this.render();
      return this.#commit(updateNode(this.#root, node.id, {seenBy: seenBy.length === 3 ? undefined : seenBy}));
    }
    if (target.dataset.layoutWriteBy) {
      const node = locate(this.#root, this.#selected).node;
      return this.#commit(updateNode(this.#root, node.id, {write: {operation: node.write.operation, ...(target.checked ? {by: "gm"} : {})}}));
    }
    if (target.dataset.layoutWrite) {
      // Typing a value covers raising and lowering; raising and lowering together is "adjust".
      const on = key => this.#host.querySelector(`[data-layout-write="${key}"]`)?.checked === true;
      const operation = on("set") ? "set" : on("add") && on("subtract") ? "adjust" : on("add") ? "add" : on("subtract") ? "subtract" : null;
      const by = locate(this.#root, this.#selected).node.write?.by;
      return this.#commit(updateNode(this.#root, locate(this.#root, this.#selected).node.id, {write: operation ? {operation, ...(by ? {by} : {})} : undefined}));
    }
    if (target.dataset.layoutStyleHex) return this.#setStyle(target.dataset.layoutStyleHex, target.value);
    if (target.dataset.layoutStyle) {
      const prop = target.dataset.layoutStyle;
      if (target.type === "checkbox") return this.#setStyle(prop, target.checked || undefined);
      if (prop === "opacity") return this.#setStyle(prop, Number(target.value) === 100 ? undefined : Number(target.value));
      // A color of one's own starts from the tone shown before, else from grey.
      if (target.value === "custom") return this.#setStyle(prop, this.#toneToHex(locate(this.#root, this.#selected).node.style?.[prop]) ?? RTA_NEUTRAL_COLOR);
      return this.#setStyle(prop, ["", "default"].includes(target.value) || target.value === "side" && prop === "label" ? undefined : target.value);
    }
    const prop = target.dataset.layoutProp; if (!prop) return;
    const node = locate(this.#root, this.#selected).node, value = target.value;
    const number = Number(value);
    if (prop === "columns" || prop === "span") return this.#commit(updateNode(this.#root, node.id, {[prop]: number > 1 || prop === "columns" ? number : undefined}));
    if (prop === "labelKey" || prop === "textKey") return this.#commit(updateNode(this.#root, node.id, {[prop]: value}));
    // An icon: "fa-heart" is read as "fa-solid fa-heart"; anything that names no icon is refused.
    if (prop === "icon") {
      const icon = iconClasses(value);
      if (value.trim() && !icon) { globalThis.ui?.notifications?.warn?.(i18n("RTA.SheetEditor.IconInvalid")); return this.render(); }
      return this.#commit(updateNode(this.#root, node.id, {icon: icon ?? undefined, ...(icon ? {} : {labelShow: undefined})}));
    }
    if (prop === "labelShow") return this.#commit(updateNode(this.#root, node.id, {labelShow: value === "both" ? undefined : value}));
    if (prop === "definitionTypeId") return this.#commit(this.#retargetRepeater(node, value));
    if (prop === "conditionRef") return this.#commit(updateNode(this.#root, node.id, {query: {...node.query, conditionRef: value || undefined}}));
    // Words in place of the number: nobody writes them.
    if (prop === "display") return this.#commit(updateNode(this.#root, node.id, {display: value === "field" ? undefined : value, dots: value === "dots" ? node.dots : undefined, ...(value === "description" ? {write: undefined} : {})}));
    if (prop === "dots") return this.#commit(updateNode(this.#root, node.id, {dots: number === 5 ? undefined : number}));
    if (prop === "shape") return this.#commit(updateNode(this.#root, node.id, {shape: value === "free" ? undefined : value}));
    if (prop === "labelPlace") { const style = {...(node.style ?? {}), label: value === "side" ? undefined : value}; if (!style.label) delete style.label; return this.#commit(updateNode(this.#root, node.id, {style: Object.keys(style).length ? style : undefined})); }
    if (prop === "src") return this.#commit(updateNode(this.#root, node.id, {src: value.trim()}));
    if (prop === "fit" || prop === "height") return this.#commit(updateNode(this.#root, node.id, {[prop]: value === "cover" && prop === "fit" || value === "medium" && prop === "height" ? undefined : value}));
    if (prop === "contentTypeIds") return this.#commit(updateNode(this.#root, node.id, {contentTypeIds: [...target.selectedOptions].map(option => option.value).filter(Boolean)}));
    if (prop === "actionRef") return this.#commit(updateNode(this.#root, node.id, {actionRef: value}));

    if (prop === "sourceKind") {
      const first = this.#sourceChoices(value, node)[0];
      if (!first) return this.render();
      return this.#commit(this.#withSource(node, this.#parseSource(value, first.value)));
    }
    if (prop === "sourceRef") return this.#commit(this.#withSource(node, this.#parseSource(node.source.kind, value)));
  }
  /** One style setting of the selected block; undefined takes it back to the default. */
  #setStyle(prop, value) {
    const node = locate(this.#root, this.#selected).node, style = {...(node.style ?? {})};
    if (value === undefined) delete style[prop]; else style[prop] = value;
    // A background removed has no opacity left to set.
    if (prop === "background" && (value === undefined || value === SHEET_NO_COLOR) && node.kind !== "section") delete style.opacity;
    // The gauge and dot colors sit with the value's settings, not in the Style group.
    if (!SHEET_FILL_PROPS.includes(prop)) this.#styleOpen = true;
    this.#commit(updateNode(this.#root, node.id, {style: Object.keys(style).length ? style : undefined}));
  }
  /** Foundry's file browser, for an image block or a background picture. */
  #pick(button) {
    const FilePicker = globalThis.foundry?.applications?.apps?.FilePicker?.implementation ?? globalThis.FilePicker;
    if (!FilePicker) return;
    const node = locate(this.#root, this.#selected).node, prop = button.dataset.layoutPick, style = button.hasAttribute("data-layout-pick-style");
    const current = style ? node.style?.[prop] : node[prop];
    new FilePicker({type: "image", current: current ?? "", callback: path => style ? this.#setStyle(prop, path || undefined) : this.#commit(updateNode(this.#root, node.id, {[prop]: path}))}).browse(current ?? "");
  }
  /** A tone as the color it shows now (this theme), for the option swatches and a custom color's start. */
  #toneToHex(tone) {
    if (/^#/.test(tone ?? "")) return tone;
    if (!SHEET_TONES[tone] || typeof document === "undefined") return null;
    if (!this.#toneHex) {
      this.#toneHex = {};
      const probe = document.createElement("span");
      this.#host.querySelector("[data-layout-canvas] .rta-sheet")?.append(probe) ?? this.#host.append(probe);
      for (const [name, token] of Object.entries(SHEET_TONES)) { probe.style.color = `var(${token})`; this.#toneHex[name] = toHex(getComputedStyle(probe).color); }
      probe.remove();
    }
    return this.#toneHex[tone] ?? null;
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

  /** Whether a source shows a number (dots and gauges need one). */
  /** A value or a pool can be shown in words, through its Definition's description scale. */
  #describable(node) {
    const source = node.kind === "value" ? node.source : null;
    const capability = source?.kind === "output" ? source.reference?.capabilityId : source?.kind === "each" ? source.capabilityId : null;
    return ["value", "pool"].includes(capability);
  }
  #numeric(source) {
    const r = this.#ruleset;
    if (source?.kind === "output" || source?.kind === "each") { const capabilityId = source.kind === "output" ? source.reference.capabilityId : source.capabilityId, outputId = source.kind === "output" ? source.reference.outputId : source.outputId; return !["state.active"].includes(outputId) && capabilityId !== "collection"; }
    if (source?.kind === "formula") return ["number", "integer"].includes(r.formulas?.find(f => f.id === source.formulaRef)?.resultType ?? "number");
    if (source?.kind === "parameter") return ["number", "integer"].includes(r.parameters?.find(p => p.id === source.parameterRef)?.valueType ?? "number");
    if (source?.kind === "field") return ["number", "integer"].includes(contentFields(r, this.#contentTypeIds).find(f => f.id === source.fieldId)?.valueType);
    return false;
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
    if (kind === "content") return (r.contentTypes ?? []).filter(type => type.enabled !== false).map(type => ({value: type.id, label: type.nameKey ?? type.id, colors: color("contentType", type)}));
    if (kind === "field") return contentFields(r, this.#contentTypeIds).map(f => ({value: f.id, label: f.name || f.id, colors: color("contentType", r.contentTypes?.find(t => t.id === f.contentTypeId))}));
    return [];
  }
  #parseSource(kind, token) {
    if (kind === "output") { const reference = parseRefToken(token); return {kind, reference}; }
    if (kind === "formula") return {kind, formulaRef: token};
    if (kind === "parameter") return {kind, parameterRef: token};
    if (kind === "content") return {kind, contentTypeId: token};
    if (kind === "each") { const [capabilityId, outputId] = token.split("|"); return {kind, capabilityId, outputId}; }
    return {kind: "field", fieldId: token};
  }
  #sourceToken(source) {
    if (source?.kind === "output") return refToken(source.reference);
    if (source?.kind === "each") return `${source.capabilityId}|${source.outputId}`;
    return source?.formulaRef ?? source?.parameterRef ?? source?.fieldId ?? source?.contentTypeId ?? "";
  }

  #styleContext(neutral) {
    const choice = (value, key) => ({value, label: i18n(key), colors: neutral});
    // "default" rather than an empty value: an RTA Select shows an empty value as its placeholder.
    const byDefault = choice("default", "RTA.SheetEditor.Style.Default");
    return {
      open: this.#styleOpen, containers: LAYOUT_CONTAINERS,
      tones: prop => [byDefault, ...(["background", "border"].includes(prop) ? [choice(SHEET_NO_COLOR, "RTA.SheetEditor.Style.None")] : []),
        ...Object.keys(SHEET_TONES).map(tone => ({value: tone, label: i18n(`RTA.SheetEditor.Tone.${tone}`), colors: selectColorsAttribute([this.#toneToHex(tone) ?? RTA_NEUTRAL_COLOR])})),
        choice("custom", "RTA.SheetEditor.Style.CustomChoice")],
      fonts: current => [byDefault, ...[...new Set([...availableFonts(), ...(current ? [current] : [])])].map(font => ({value: font, label: font, colors: neutral}))],
      sizes: [byDefault, ...Object.keys(SHEET_SIZES).map(size => choice(size, `RTA.SheetEditor.Size.${size}`))],
      aligns: [byDefault, ...SHEET_ALIGNS.map(align => choice(align, `RTA.SheetEditor.Align.${align}`))],
      paddings: [byDefault, ...Object.keys(SHEET_SPACES).map(space => choice(space, `RTA.SheetEditor.Space.${space}`))],
      gaps: [byDefault, ...SHEET_GAPS.map(space => choice(space, `RTA.SheetEditor.Space.${space}`))]
    };
  }
  /** Everything the properties markup needs for the selected block. */
  #context(found) {
    const node = found.node, neutral = selectColorsAttribute([RTA_NEUTRAL_COLOR]), r = this.#ruleset;
    const inRepeater = Boolean(repeaterOf(this.#root, node.id));
    const kinds = [["output", "RTA.SheetEditor.Source.output"], ["content", "RTA.SheetEditor.Source.content"], ["formula", "RTA.SheetEditor.Source.formula"], ["parameter", "RTA.SheetEditor.Source.parameter"], ["each", "RTA.SheetEditor.Source.each"], ["field", "RTA.SheetEditor.Source.field"]]
      .filter(([kind]) => (kind !== "each" || inRepeater) && (kind !== "field" || this.#target === "item") && (kind !== "content" || this.#target === "actor") && (kind === node.source?.kind || this.#sourceChoices(kind, node).length));
    const label = defaultValueLabel(node.source, r, {contentTypeIds: this.#contentTypeIds});
    return {
      parentColumns: found.parent ? columnsOf(found.parent) : 1, isRoot: !found.parent,
      columnChoices: kind => Array.from({length: maxColumns(kind)}, (_, i) => ({value: String(i + 1), label: format("RTA.SheetEditor.ColumnCount", {count: i + 1}, String(i + 1)), colors: neutral})),
      spanChoices: count => Array.from({length: count}, (_, i) => ({value: String(i + 1), label: format("RTA.SheetEditor.SpanCount", {count: i + 1}, String(i + 1)), colors: neutral})),
      definitionTypes: (r.definitionTypes ?? []).filter(t => (r.definitions ?? []).some(d => d.definitionTypeId === t.id)).map(t => ({value: t.id, label: t.nameKey, colors: selectColorsAttribute(this.#colors("definitionType", t))})),
      conditions: [{value: "", label: i18n("RTA.SheetEditor.AllOfThem"), colors: neutral}, ...(r.conditions ?? []).map(c => ({value: c.id, label: c.nameKey, colors: selectColorsAttribute(this.#colors("condition", c))}))],
      contentTypes: itemContentTypes(r).map(type => ({value: type.id, label: type.nameKey, colors: selectColorsAttribute(this.#colors("contentType", type))})),
      actions: (r.actions ?? []).map(a => ({value: a.id, label: a.nameKey, colors: selectColorsAttribute(this.#colors("action", a))})),
      sourceKinds: kinds.map(([value, key]) => ({value, label: i18n(key), colors: neutral})),
      sourceChoices: kind => this.#sourceChoices(kind, node),
      sourceToken: source => this.#sourceToken(source),
      defaultLabel: n => n.kind === "action" ? r.actions?.find(a => a.id === n.actionRef)?.nameKey ?? "" : label.label || i18n(label.labelKey ?? ""),
      writable: node.kind === "value" && writableSource(node.source),
      displays: ["field", "gauge", "dots", ...(this.#describable(node) ? ["description"] : [])].map(value => ({value, label: i18n(`RTA.SheetEditor.Display.${value}`), colors: neutral})),
      dotCounts: Array.from({length: 10}, (_, i) => ({value: String(i + 1), label: String(i + 1), colors: neutral})),
      numeric: node.kind === "value" && this.#numeric(node.source),
      labelPlaces: SHEET_LABELS.map(label => ({value: label, label: i18n(`RTA.SheetEditor.LabelPlace.${label}`), colors: neutral})),
      shapes: ["free", "rounded", "square", "portrait", "landscape", "circle"].map(value => ({value, label: i18n(`RTA.SheetEditor.Shape.${value}`), colors: neutral})),
      fits: SHEET_IMAGE_FITS.map(value => ({value, label: i18n(`RTA.SheetEditor.Fit.${value}`), colors: neutral})),
      heights: Object.keys(SHEET_IMAGE_HEIGHTS).map(value => ({value, label: i18n(`RTA.SheetEditor.Height.${value}`), colors: neutral})),
      style: this.#styleContext(neutral)
    };
  }
}
