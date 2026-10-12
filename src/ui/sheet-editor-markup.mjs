/* Sheet editor markup: the toolbar and the properties of the selected block. Pure; the controller
   (configurator/sheet-layout-controller.mjs) gives every choice already labelled and colored:
   {value, label, colors}. Data contract: [data-layout-prop] fields, [data-layout-command] buttons,
   [data-layout-add] the "add a block" select. */
import {escapeHTML as escape} from "./html-utils.mjs";
import {localizedKeyMarkup as t} from "./ui-localization.mjs";
import {renderSelectOptions} from "./select-option-markup.mjs";

const row = (label, control, extra = "") => `<div class="form-group rta-form-row"${extra}><label>${label}</label>${control}</div>`;
const select = (prop, choices, selected) => `<select data-layout-prop="${prop}">${renderSelectOptions(choices, {valueKey: "value", labelKey: "label", colorize: true, selectedValue: selected ?? ""})}</select>`;
const text = (prop, value, placeholder = "") => `<input type="text" data-layout-prop="${prop}" value="${escape(value ?? "")}"${placeholder ? ` placeholder="${escape(placeholder)}"` : ""}>`;
const KIND_LABELS = {tabs: ["RTA.SheetEditor.Kind.tabs", "Tabs"], tab: ["RTA.SheetEditor.Kind.tab", "Tab"], section: ["RTA.SheetEditor.Kind.section", "Section"], grid: ["RTA.SheetEditor.Kind.grid", "Grid"],
  repeater: ["RTA.SheetEditor.Kind.repeater", "List of Definitions"], value: ["RTA.SheetEditor.Kind.value", "Value"], action: ["RTA.SheetEditor.Kind.action", "Action button"], text: ["RTA.SheetEditor.Kind.text", "Text"], contents: ["RTA.SheetEditor.Kind.contents", "Held Contents"], spacer: ["RTA.SheetEditor.Kind.spacer", "Empty cell"]};
export const kindLabel = kind => t(...(KIND_LABELS[kind] ?? [kind, kind]));

/** Toolbar: add a block into the selection (kinds it accepts), move it, remove it, start again from AUTO. */
export function renderLayoutToolbarHTML({addable = [], canMoveUp = false, canMoveDown = false, canRemove = false, undo = false, neutral = ""}) {
  const add = `<select data-layout-add aria-label="${t("RTA.SheetEditor.BlockToAdd", "block to add")}"><option value="" data-rta-colors="${escape(neutral)}">${t("RTA.SheetEditor.Add", "Add a block")}</option>${addable.map(kind => `<option value="${escape(kind)}" data-rta-colors="${escape(neutral)}">${kindLabel(kind)}</option>`).join("")}</select>`;
  const button = (command, icon, label, enabled) => `<button type="button" class="rta-config-action" data-layout-command="${command}" title="${label}" aria-label="${label}"${enabled ? "" : " disabled"}><i class="fa-solid ${icon}"></i></button>`;
  return `<div class="rta-sheet-editor__toolbar">${add}${button("up", "fa-arrow-up", t("RTA.Template.MoveUp", "Move up"), canMoveUp)}${button("down", "fa-arrow-down", t("RTA.Template.MoveDown", "Move down"), canMoveDown)}${button("remove", "fa-trash", t("RTA.SheetEditor.Remove", "Remove the block"), canRemove)}${button("undo", "fa-rotate-left", t("RTA.SheetEditor.Undo", "Undo"), undo)}<button type="button" data-layout-command="auto"><i class="fa-solid fa-wand-magic-sparkles"></i> ${t("RTA.SheetEditor.Auto", "Automatic layout")}</button></div>`;
}

/** The selected block's settings. ctx: choices lists and what the block's place allows. */
export function renderLayoutPropertiesHTML(node, ctx) {
  if (!node) return `<p class="rta-sheet-editor__hint">${t("RTA.SheetEditor.SelectHint", "Click a block of the sheet to change it.")}</p>`;
  const rows = [];
  if (["tab", "section"].includes(node.kind)) rows.push(row(t("RTA.SheetEditor.Title", "Title"), text("labelKey", node.labelKey)));
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
    if (ctx.writable) rows.push(row(t("RTA.SheetEditor.Player", "On the sheet"), select("write", ctx.writeChoices, node.write?.operation ?? "")));
  }
  if (node.kind === "action") {
    rows.push(row(t("RTA.SheetEditor.Action", "Action"), select("actionRef", ctx.actions, node.actionRef)));
    rows.push(row(t("RTA.SheetEditor.Label", "Label"), text("labelKey", node.labelKey, ctx.defaultLabel(node))));
  }
  if (node.kind === "text") rows.push(row(t("RTA.SheetEditor.Text", "Text"), text("textKey", node.textKey)));
  if (node.kind === "contents") {
    const chosen = new Set(node.contentTypeIds ?? []);
    rows.push(row(t("RTA.SheetEditor.ContentTypes", "Content Types (none: all)"), `<select multiple data-layout-prop="contentTypeIds">${ctx.contentTypes.map(choice => `<option value="${escape(choice.value)}" data-rta-colors="${escape(choice.colors)}"${chosen.has(choice.value) ? " selected" : ""}>${escape(choice.label)}</option>`).join("")}</select>`));
  }
  if (ctx.parentColumns > 1) rows.push(row(t("RTA.SheetEditor.Width", "Width"), select("span", ctx.spanChoices(ctx.parentColumns), node.span ?? 1)));
  if (!rows.length) rows.push(`<p class="rta-sheet-editor__hint">${t("RTA.SheetEditor.NothingToSet", "This block has no settings.")}</p>`);
  return `<div class="rta-sheet-editor__properties-head"><strong>${kindLabel(node.kind)}</strong></div>${rows.join("")}`;
}
