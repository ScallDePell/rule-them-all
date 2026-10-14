/* Sheet editor markup: the toolbar and the properties of the selected block. Pure; the controller
   (configurator/sheet-layout-controller.mjs) gives every choice already labelled and colored:
   {value, label, colors}. Data contract: [data-layout-prop] fields, [data-layout-command] buttons,
   [data-layout-palette] an element to add (its spec as JSON), [data-layout-palette-filter] the palette search. */
import {escapeHTML as escape} from "./html-utils.mjs";
import {localizedKeyMarkup as t} from "./ui-localization.mjs";
import {renderSelectOptions} from "./select-option-markup.mjs";

const row = (label, control, extra = "") => `<div class="form-group rta-form-row"${extra}><label>${label}</label>${control}</div>`;
const select = (prop, choices, selected) => `<select data-layout-prop="${prop}">${renderSelectOptions(choices, {valueKey: "value", labelKey: "label", colorize: true, selectedValue: selected ?? ""})}</select>`;
const text = (prop, value, placeholder = "") => `<input type="text" data-layout-prop="${prop}" value="${escape(value ?? "")}"${placeholder ? ` placeholder="${escape(placeholder)}"` : ""}>`;
const imageField = (prop, value, style = false) => `<div class="rta-sheet-editor__file"><input type="text" ${style ? "data-layout-style" : "data-layout-prop"}="${prop}" value="${escape(value ?? "")}" placeholder="${t("RTA.SheetEditor.ImagePath", "path/to/picture.webp")}"><button type="button" class="rta-config-action" data-layout-pick="${prop}"${style ? " data-layout-pick-style" : ""} title="${t("RTA.SheetEditor.Browse", "Browse")}" aria-label="${t("RTA.SheetEditor.Browse", "Browse")}"><i class="fa-solid fa-folder-open"></i></button></div>`;
/** Icons offered while typing one (any Font Awesome icon may be typed). */
const ICON_SUGGESTIONS = ["heart", "heart-pulse", "shield-halved", "khanda", "hand-fist", "crosshairs", "dice-d20", "dice-d6", "brain", "eye", "bolt", "fire", "skull", "star",
  "coins", "gem", "flask", "wand-sparkles", "hat-wizard", "scroll", "book", "feather", "person-running", "shoe-prints", "moon", "sun", "dragon", "user", "comments", "music"];
const iconRows = node => {
  const icon = `<div class="rta-sheet-editor__file"><input type="text" data-layout-prop="icon" list="rta-sheet-icons" value="${escape(node.icon ?? "")}" placeholder="fa-solid fa-heart"><datalist id="rta-sheet-icons">${ICON_SUGGESTIONS.map(name => `<option value="fa-solid fa-${name}"></option>`).join("")}</datalist><span class="rta-sheet-editor__icon-preview" aria-hidden="true">${node.icon ? `<i class="${escape(node.icon)}"></i>` : ""}</span></div>`;
  const shows = [["both", "RTA.SheetEditor.LabelShow.both", "Icon and text"], ["icon", "RTA.SheetEditor.LabelShow.icon", "Icon only"], ["text", "RTA.SheetEditor.LabelShow.text", "Text only"]];
  return [row(t("RTA.SheetEditor.Icon", "Icon"), icon),
    ...(node.icon ? [row(t("RTA.SheetEditor.LabelShow.label", "Label shows"), `<select data-layout-prop="labelShow">${shows.map(([value, key, fallback]) => `<option value="${value}"${value === (node.labelShow ?? "both") ? " selected" : ""}>${t(key, fallback)}</option>`).join("")}</select>`)] : [])];
};
const KIND_LABELS = {tabs: ["RTA.SheetEditor.Kind.tabs", "Tabs"], tab: ["RTA.SheetEditor.Kind.tab", "Tab"], section: ["RTA.SheetEditor.Kind.section", "Section"], grid: ["RTA.SheetEditor.Kind.grid", "Grid"],
  repeater: ["RTA.SheetEditor.Kind.repeater", "List of Definitions"], value: ["RTA.SheetEditor.Kind.value", "Value"], action: ["RTA.SheetEditor.Kind.action", "Action button"], text: ["RTA.SheetEditor.Kind.text", "Text"], image: ["RTA.SheetEditor.Kind.image", "Image"], contents: ["RTA.SheetEditor.Kind.contents", "Held Contents"], progression: ["RTA.SheetEditor.Kind.progression", "Progression"], spacer: ["RTA.SheetEditor.Kind.spacer", "Empty cell"],
  name: ["RTA.SheetEditor.Kind.name", "Name"], portrait: ["RTA.SheetEditor.Kind.portrait", "Portrait"], token: ["RTA.SheetEditor.Kind.token", "Token image"]};
/** Blocks framed as a picture: an image, the Document's portrait, its token's image. */
const PICTURES = ["image", "portrait", "token"];
/** A block kind's name, as plain text. */
export const kindText = kind => { const [key, fallback] = KIND_LABELS[kind] ?? [kind, kind], text = globalThis.game?.i18n?.localize?.(key); return text && text !== key ? text : fallback; };
export const kindLabel = kind => escape(kindText(kind));

const VIEWERS = [["all", "RTA.SheetEditor.ViewAs.all", "Everyone's blocks"], ["player", "RTA.SheetEditor.ViewAs.player", "The player"], ["observer", "RTA.SheetEditor.ViewAs.observer", "An observer"], ["gm", "RTA.SheetEditor.ViewAs.gm", "The GM"]];
/** The commands of the first toolbar row, in order: [command, icon, label key, fallback]. */
const TOOLS = [["up", "fa-arrow-up", "RTA.SheetEditor.MoveUp", "Move up (Up arrow)"], ["down", "fa-arrow-down", "RTA.SheetEditor.MoveDown", "Move down (Down arrow)"],
  ["copy", "fa-copy", "RTA.SheetEditor.Copy", "Copy the block (Ctrl+C)"], ["paste", "fa-paste", "RTA.SheetEditor.Paste", "Paste (Ctrl+V)"], ["duplicate", "fa-clone", "RTA.SheetEditor.Duplicate", "Duplicate (Ctrl+D)"],
  ["brush", "fa-paintbrush", "RTA.SheetEditor.Brush", "Style brush"], ["remove", "fa-trash", "RTA.SheetEditor.Remove", "Remove the block (Delete)"],
  ["undo", "fa-rotate-left", "RTA.SheetEditor.Undo", "Undo (Ctrl+Z)"], ["redo", "fa-rotate-right", "RTA.SheetEditor.Redo", "Redo (Ctrl+Y)"]];
/** Toolbar: one row of icon buttons (move, copy, paste, duplicate, style brush, remove, undo, redo), then "View as" on
   its own row. enabled: {command: boolean}; brush: the style brush is loaded (its button shows pressed). */
export function renderLayoutToolbarHTML({enabled = {}, brush = false, viewer = "all"} = {}) {
  const button = ([command, icon, key, fallback]) => `<button type="button" class="rta-config-action" data-layout-command="${command}" title="${t(key, fallback)}" aria-label="${t(key, fallback)}"${command === "brush" ? ` aria-pressed="${brush}"` : ""}${enabled[command] ? "" : " disabled"}><i class="fa-solid ${icon}"></i></button>`;
  const viewAs = `<label class="rta-sheet-editor__view-as">${t("RTA.SheetEditor.ViewAs.label", "View as")}<select data-layout-viewer>${VIEWERS.map(([value, key, fallback]) => `<option value="${value}"${value === viewer ? " selected" : ""}>${t(key, fallback)}</option>`).join("")}</select></label>`;
  return `<div class="rta-sheet-editor__toolbar"><div class="rta-sheet-editor__tools">${TOOLS.map(button).join("")}</div>${viewAs}</div>`;
}

const WIDTHS = [["narrow", "fa-mobile-screen", "RTA.SheetEditor.PreviewWidth.narrow", "Narrow window"], ["window", "fa-window-maximize", "RTA.SheetEditor.PreviewWidth.window", "The sheet's window"], ["wide", "fa-display", "RTA.SheetEditor.PreviewWidth.wide", "Wide window"]];
/** Above the sheet: the width it is previewed at (the tree is not changed). */
export function renderPreviewWidthHTML(width = "window") {
  return `<div class="rta-sheet-editor__widths" role="group" aria-label="${t("RTA.SheetEditor.PreviewWidth.label", "Preview width")}"><span>${t("RTA.SheetEditor.PreviewWidth.label", "Preview width")}</span>${WIDTHS.map(([value, icon, key, fallback]) => `<button type="button" class="rta-config-action" data-layout-width="${value}" title="${t(key, fallback)}" aria-label="${t(key, fallback)}" aria-pressed="${value === width}"><i class="fa-solid ${icon}"></i></button>`).join("")}</div>`;
}

/** Layers: the blocks as a tree, to select one, rename it (double click, when it has a label), drag it elsewhere and fold
   what a container holds. root: the layout; ctx: {selectedId, collapsed: Set of ids, label(node) → text, renaming: id}. */
export function renderLayoutLayersHTML(root, {selectedId = null, collapsed = new Set(), label = node => node.id, renaming = null, open = true} = {}) {
  const LABELLED = ["tab", "section", "value", "action"];
  const row = (node, depth) => {
    const children = node.children ?? [], folded = collapsed.has(node.id) && children.length > 0;
    const toggle = children.length ? `<button type="button" class="rta-sheet-layers__toggle" data-layer-toggle="${escape(node.id)}" aria-label="${folded ? t("RTA.SheetEditor.Layers.Unfold", "Unfold") : t("RTA.SheetEditor.Layers.Fold", "Fold")}" aria-expanded="${!folded}"><i class="fa-solid ${folded ? "fa-caret-right" : "fa-caret-down"}"></i></button>` : `<span class="rta-sheet-layers__toggle" aria-hidden="true"></span>`;
    const name = renaming === node.id && LABELLED.includes(node.kind)
      ? `<input type="text" class="rta-sheet-layers__rename" data-layer-rename="${escape(node.id)}" value="${escape(node.labelKey ?? "")}" placeholder="${escape(label(node))}">`
      : `<span class="rta-sheet-layers__name"${LABELLED.includes(node.kind) ? ` data-layer-renamable title="${t("RTA.SheetEditor.Layers.Rename", "Double-click to rename")}"` : ""}>${escape(label(node))}</span>`;
    // Not a <button>: Firefox never drags a button.
    const self = `<div class="rta-sheet-layers__row" role="treeitem" tabindex="-1" style="--rta-layer-depth: ${depth}" data-layer-node="${escape(node.id)}"${node.id === selectedId ? ` aria-selected="true"` : ""}${children.length ? ` aria-expanded="${!folded}"` : ""}${depth ? ` draggable="true"` : ""}>${toggle}<i class="fa-solid ${KIND_ICONS[node.kind] ?? "fa-square"}" aria-hidden="true"></i>${name}</div>`;
    return self + (folded ? "" : children.map(child => row(child, depth + 1)).join(""));
  };
  return `<details class="rta-sheet-editor__layers" data-layout-layers-panel${open ? " open" : ""}><summary>${t("RTA.SheetEditor.Layers.Title", "Layers")}</summary><div class="rta-sheet-layers" role="tree" data-layout-layers>${row(root, 0)}</div></details>`;
}

const KIND_ICONS = {section: "fa-square", grid: "fa-table-cells", tabs: "fa-folder", tab: "fa-folder-open", repeater: "fa-list", value: "fa-hashtag", gauge: "fa-battery-half", dots: "fa-circle-dot", content: "fa-id-card", action: "fa-dice-d20", text: "fa-font", image: "fa-image", contents: "fa-box-open", progression: "fa-arrow-trend-up", spacer: "fa-border-none", name: "fa-signature", portrait: "fa-image-portrait", token: "fa-chess-pawn"};

/** What can be added: blocks, then the Ruleset's own elements. A click adds an item into the selection; it can also
   be dragged onto the sheet. groups: paletteGroups (configurator/sheet-layout-model.mjs), labels given by the controller. */
export function renderLayoutPaletteHTML(groups, {open = true, filter = ""} = {}) {
  // Not a <button>: Firefox never drags a button.
  const item = entry => `<div class="rta-sheet-editor__palette-item" role="button" tabindex="0" draggable="true" data-layout-palette="${escape(JSON.stringify(entry.spec))}" data-layout-palette-label="${escape(entry.text.toLowerCase())}"><i class="fa-solid ${KIND_ICONS[entry.kind] ?? "fa-square"}"></i><span>${escape(entry.text)}</span></div>`;
  const body = groups.map(group => `<section class="rta-sheet-editor__palette-group" data-layout-palette-group><p class="rta-sheet-editor__palette-title">${escape(group.text)}</p><div class="rta-sheet-editor__palette-items">${group.items.map(item).join("")}</div></section>`).join("");
  return `<details class="rta-sheet-editor__palette" data-layout-palette-panel${open ? " open" : ""}><summary>${t("RTA.SheetEditor.Add", "Add a block")}</summary><p class="rta-sheet-editor__hint">${t("RTA.SheetEditor.Palette.Hint", "Click to add into the selected block, or drag onto the sheet.")}</p><div class="rta-sheet-editor__palette-search"><input type="search" data-layout-palette-filter value="${escape(filter)}" placeholder="${t("RTA.SheetEditor.Palette.Search", "Search")}"></div>${body}</details>`;
}

/** The selected block's settings. ctx: choices lists and what the block's place allows. */
export function renderLayoutPropertiesHTML(node, ctx) {
  if (!node) return `<p class="rta-sheet-editor__hint">${t("RTA.SheetEditor.SelectHint", "Click a block of the sheet to change it.")}</p>`;
  const rows = [];
  if (["tab", "section"].includes(node.kind)) rows.push(row(t("RTA.SheetEditor.Title", "Title"), text("labelKey", node.labelKey)));
  if (["tab", "section"].includes(node.kind)) rows.push(...iconRows(node));
  if (["tabs", "tab"].includes(node.kind)) rows.push(`<button type="button" class="rta-sheet-editor__wide" data-layout-command="addTab"><i class="fa-solid fa-plus"></i> ${t("RTA.SheetEditor.AddTab", "Add a tab")}</button>`);
  if (["section", "grid", "repeater"].includes(node.kind)) rows.push(row(t("RTA.SheetEditor.Columns", "Columns"), select("columns", ctx.columnChoices(node.kind), node.columns ?? 1)));
  if (node.kind === "repeater") {
    rows.push(row(t("RTA.SheetEditor.ListType", "Definitions of type"), select("definitionTypeId", ctx.definitionTypes, node.query?.definitionTypeId)));
    rows.push(row(t("RTA.SheetEditor.ListFilter", "Only those where"), select("conditionRef", ctx.conditions, node.query?.conditionRef ?? "")));
  }
  if (node.kind === "value") {
    const source = node.source ?? {};
    rows.push(row(t("RTA.SheetEditor.Shows", "Shows"), select("sourceKind", ctx.sourceKinds, source.kind)));
    const refs = ctx.sourceChoices(source.kind);
    rows.push(row(t("RTA.SheetEditor.Which", "Which one"), select("sourceRef", refs, ctx.sourceToken(source))));
    rows.push(row(t("RTA.SheetEditor.Label", "Label"), text("labelKey", node.labelKey, ctx.defaultLabel(node))));
    rows.push(...iconRows(node));
    rows.push(row(t("RTA.SheetEditor.LabelPlacement", "Label placed"), select("labelPlace", ctx.labelPlaces, node.style?.label ?? "side")));
    if (ctx.numeric) rows.push(row(t("RTA.SheetEditor.DisplayAs", "Shown as"), select("display", ctx.displays, node.display ?? "field")));
    if (node.display === "dots") rows.push(row(t("RTA.SheetEditor.DotCount", "Dots (without a maximum)"), select("dots", ctx.dotCounts, String(node.dots ?? 5))));
    if (["gauge", "dots"].includes(node.display) && ctx.numeric && ctx.style) {
      rows.push(...colorRows("fill", node.display === "gauge" ? t("RTA.SheetEditor.Fill", "Gauge color") : t("RTA.SheetEditor.DotColor", "Dot color"), node.style ?? {}, ctx.style.tones));
      if (node.display === "gauge") rows.push(...colorRows("fillTo", t("RTA.SheetEditor.FillTo", "Gradient to"), node.style ?? {}, ctx.style.tones));
    }
    if (ctx.writable && node.display !== "description") {
      // What a player may do with it: type a value, raise it, lower it (raise and lower together: −/+ buttons).
      const operation = node.write?.operation, on = {set: operation === "set", add: ["add", "adjust"].includes(operation), subtract: ["subtract", "adjust"].includes(operation)};
      const check = (key, label) => `<label class="rta-sheet-editor__check"><input type="checkbox" data-layout-write="${key}"${on[key] ? " checked" : ""}${key !== "set" && on.set ? " disabled" : ""}> ${label}</label>`;
      rows.push(row(t("RTA.SheetEditor.Player", "On the sheet"), `<div class="rta-sheet-editor__checks">${check("set", t("RTA.SheetEditor.Write.set", "Can be changed"))}${check("add", t("RTA.SheetEditor.Write.add", "Can be raised"))}${check("subtract", t("RTA.SheetEditor.Write.subtract", "Can be lowered"))}</div>`));
      // The players see it; only the GM gets the field or the − and +.
      if (operation) rows.push(row(t("RTA.SheetEditor.ChangedBy", "Changed by"), `<div class="rta-sheet-editor__checks"><label class="rta-sheet-editor__check"><input type="checkbox" data-layout-write-by="gm"${node.write?.by === "gm" ? " checked" : ""}> ${t("RTA.SheetEditor.GmOnly", "The GM only")}</label></div>`));
    }
  }
  if (node.kind === "action") {
    rows.push(row(t("RTA.SheetEditor.Action", "Action"), select("actionRef", ctx.actions, node.actionRef)));
    rows.push(row(t("RTA.SheetEditor.Label", "Label"), text("labelKey", node.labelKey, ctx.defaultLabel(node))));
    rows.push(...iconRows(node));
  }
  if (node.kind === "text") rows.push(row(t("RTA.SheetEditor.Text", "Text"), text("textKey", node.textKey)));
  if (PICTURES.includes(node.kind)) {
    if (node.kind === "image") rows.push(row(t("RTA.SheetEditor.Image", "Image"), imageField("src", node.src)));
    if (node.kind !== "image") rows.push(`<p class="rta-sheet-editor__hint">${node.kind === "token" ? t("RTA.SheetEditor.TokenHint", "The image of the Actor's token; changed on the sheet once unlocked.") : t("RTA.SheetEditor.PortraitHint", "The Actor's or Item's image; changed on the sheet once unlocked.")}</p>`);
    rows.push(row(t("RTA.SheetEditor.ImageShape", "Shape"), select("shape", ctx.shapes, node.shape ?? "free")));
    rows.push(row(t("RTA.SheetEditor.ImageFit", "Fit"), select("fit", ctx.fits, node.fit ?? "cover")));
    rows.push(row(t("RTA.SheetEditor.ImageHeight", "Height"), select("height", ctx.heights, node.height ?? "medium")));
    if (node.kind === "token") rows.push(row(t("RTA.SheetEditor.PlacedTokens", "Placed tokens"), `<div class="rta-sheet-editor__checks"><label class="rta-sheet-editor__check"><input type="checkbox" data-layout-prop="updatePlaced"${node.updatePlaced ? " checked" : ""}> ${t("RTA.SheetEditor.UpdatePlaced", "Also change the tokens already placed")}</label></div>`));
  }
  if (node.kind === "name") rows.push(`<p class="rta-sheet-editor__hint">${t("RTA.SheetEditor.NameHint", "The Actor's or Item's name; changed on the sheet once unlocked.")}</p>`);
  if (node.kind === "contents") {
    const chosen = new Set(node.contentTypeIds ?? []);
    rows.push(row(t("RTA.SheetEditor.ContentTypes", "Content Types (none: all)"), `<select multiple data-layout-prop="contentTypeIds">${ctx.contentTypes.map(choice => `<option value="${escape(choice.value)}" data-rta-colors="${escape(choice.colors)}"${chosen.has(choice.value) ? " selected" : ""}>${escape(choice.label)}</option>`).join("")}</select>`));
  }
  if (node.kind === "progression") rows.push(row(t("RTA.SheetEditor.ProgressionSystem", "Progression System"), select("progressionSystemRef", ctx.progressionSystems, node.progressionSystemRef)));
  if (ctx.parentColumns > 1) rows.push(row(t("RTA.SheetEditor.Width", "Width"), select("span", ctx.spanChoices(ctx.parentColumns), node.span ?? 1)));
  // Who gets the block (and what it holds): the Actor's owners, anyone else who opens the sheet, the GM.
  if (!ctx.isRoot) {
    const seen = who => `<label class="rta-sheet-editor__check"><input type="checkbox" data-layout-seen="${who}"${!node.seenBy || node.seenBy.includes(who) ? " checked" : ""}> ${t(`RTA.SheetEditor.Audience.${who}`, who)}</label>`;
    rows.push(row(t("RTA.SheetEditor.Seen", "Seen by"), `<div class="rta-sheet-editor__checks">${["player", "observer", "gm"].map(seen).join("")}</div>`));
  }
  if (!rows.length) rows.push(`<p class="rta-sheet-editor__hint">${t("RTA.SheetEditor.NothingToSet", "This block has no settings.")}</p>`);
  return `<div class="rta-sheet-editor__properties-head"><strong>${kindLabel(node.kind)}</strong></div>${rows.join("")}${ctx.style ? renderStyleHTML(node, ctx.style) : ""}`;
}

/** A color setting: a theme tone or a color of one's own ("custom": its picker shows below). */
export function colorRows(prop, label, style, tones) {
  const value = style[prop] ?? "", custom = /^#/.test(value);
  const rows = [row(label, `<select data-layout-style="${prop}">${renderSelectOptions(tones(prop), {valueKey: "value", labelKey: "label", colorize: true, selectedValue: custom ? "custom" : value || "default"})}</select>`)];
  if (custom) rows.push(row(t("RTA.SheetEditor.Style.Custom", "Own color"), `<input type="color" data-layout-style-hex="${prop}" value="${escape(value)}">`));
  return rows;
}

/** The Style group: how the selected block looks. ctx: {open, containers, tones(prop), fonts, sizes, aligns, paddings, gaps}.
   A color is a theme tone or a color of one's own ("custom": its picker shows below). */
export function renderStyleHTML(node, ctx) {
  const style = node.style ?? {}, rows = [], container = ctx.containers.includes(node.kind), picture = PICTURES.includes(node.kind);
  const styleSelect = (prop, choices, selected) => `<select data-layout-style="${prop}">${renderSelectOptions(choices, {valueKey: "value", labelKey: "label", colorize: true, selectedValue: selected ?? ""})}</select>`;
  const color = (prop, label) => rows.push(...colorRows(prop, label, style, ctx.tones));
  if (!picture) {
    color("color", t("RTA.SheetEditor.Style.Color", "Text color"));
    color("background", t("RTA.SheetEditor.Style.Background", "Background"));
  }
  if (picture || style.background && style.background !== "none" || node.kind === "section") {
    const value = style.opacity ?? 100;
    rows.push(row(`${picture ? t("RTA.SheetEditor.Style.ImageOpacity", "Opacity") : t("RTA.SheetEditor.Style.Opacity", "Background opacity")} <span data-layout-opacity-value>${escape(String(value))} %</span>`,
      `<input type="range" min="0" max="100" step="5" data-layout-style="opacity" value="${escape(String(value))}">`));
  }
  if (container) rows.push(row(t("RTA.SheetEditor.Style.Image", "Background picture"), imageField("image", style.image, true)));
  color("border", t("RTA.SheetEditor.Style.Border", "Border"));
  if (!picture && node.kind !== "spacer") {
    rows.push(row(t("RTA.SheetEditor.Style.Font", "Font"), styleSelect("font", ctx.fonts(style.font), style.font ?? "default")));
    rows.push(row(t("RTA.SheetEditor.Style.Size", "Size"), styleSelect("size", ctx.sizes, style.size ?? "default")));
    const check = (prop, label) => `<label class="rta-sheet-editor__check"><input type="checkbox" data-layout-style="${prop}"${style[prop] ? " checked" : ""}> ${label}</label>`;
    rows.push(row(t("RTA.SheetEditor.Style.Emphasis", "Emphasis"), `<div class="rta-sheet-editor__checks">${check("bold", t("RTA.SheetEditor.Style.Bold", "Bold"))}${check("italic", t("RTA.SheetEditor.Style.Italic", "Italic"))}</div>`));
    rows.push(row(t("RTA.SheetEditor.Style.Align", "Alignment"), styleSelect("align", ctx.aligns, style.align ?? "default")));
  }
  rows.push(row(t("RTA.SheetEditor.Style.Padding", "Inner margin"), styleSelect("padding", ctx.paddings, style.padding ?? "default")));
  if (container) rows.push(row(t("RTA.SheetEditor.Style.Gap", "Spacing"), styleSelect("gap", ctx.gaps, style.gap ?? "default")));
  const reset = Object.keys(style).length ? `<button type="button" data-layout-command="unstyle"><i class="fa-solid fa-eraser"></i> ${t("RTA.SheetEditor.Style.Reset", "Default style")}</button>` : "";
  return `<details class="rta-sheet-editor__style" data-layout-style-group${ctx.open ? " open" : ""}><summary>${t("RTA.SheetEditor.Style.Title", "Style")}</summary><div class="rta-sheet-editor__style-body">${rows.join("")}${reset}</div></details>`;
}
