/* HTML of a played sheet, from the projection (runtime/sheet-projection.mjs). Pure: no Foundry access.
   t(key) translates a Ruleset or module key (it returns the key itself when there is no translation).
   Data contract with the sheet controller (runtime/foundry-sheets.mjs):
   - [data-sheet-write=nodeId] (+ data-definition-id, data-operation) is a value the player changes;
   - [data-sheet-action=actionId] (+ data-definition-id) uses an Action;
   - [data-sheet-tab=id] shows the [data-sheet-panel=id] of its tabs. */
import {escapeHTML as escape} from "./html-utils.mjs";

const span = node => node.span ? ` style="--rta-sheet-span: ${Number(node.span)}"` : "";
const columns = node => `--rta-sheet-columns: ${Number(node.columns ?? 1)}`;

/** A read value as text: numbers rounded to two decimals, nothing as a dash. */
export function formatSheetValue(value) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "number") return Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100);
  if (Array.isArray(value)) return String(value.length);
  if (typeof value === "object") return "—";
  return String(value);
}

function valueControl(node, t, row) {
  const write = node.write, data = `data-sheet-write="${escape(node.id)}"${row ? ` data-definition-id="${escape(row)}"` : ""} data-operation="${escape(write?.operation ?? "")}"`;
  const bound = node.maximum !== undefined ? `<span class="rta-sheet-value__bound">/ ${escape(formatSheetValue(node.maximum))}</span>` : "";
  if (node.valueType === "boolean") {
    if (write) return `<input type="checkbox" ${data} ${node.value ? "checked" : ""}>`;
    return `<span class="rta-sheet-value__text"><i class="fa-solid ${node.value ? "fa-check" : "fa-minus"}" aria-label="${escape(t(node.value ? "RTA.Template.Yes" : "RTA.Template.No"))}"></i></span>`;
  }
  const numeric = ["number", "integer"].includes(node.valueType);
  if (!write) return `<span class="rta-sheet-value__text">${escape(formatSheetValue(node.value))}${node.maximum !== undefined ? ` / ${escape(formatSheetValue(node.maximum))}` : ""}</span>`;
  if (write.operation === "set") {
    const limits = numeric ? `${node.minimum !== undefined ? ` min="${escape(node.minimum)}"` : ""}${node.maximum !== undefined ? ` max="${escape(node.maximum)}"` : ""}${node.valueType === "integer" ? ` step="1"` : ` step="any"`}` : "";
    return `<input type="${numeric ? "number" : "text"}" ${data} value="${escape(node.value ?? "")}"${limits}>${bound}`;
  }
  // add / subtract: the value stays read; the field takes the amount, applied on change, then cleared.
  const sign = write.operation === "add" ? "+" : "−";
  return `<span class="rta-sheet-value__text">${escape(formatSheetValue(node.value))}</span>${bound}<input type="number" class="rta-sheet-value__amount" ${data} step="any" min="0" placeholder="${sign}" aria-label="${escape(t(write.operation === "add" ? "RTA.Sheet.Add" : "RTA.Sheet.Subtract"))}">`;
}

/* In the editor (edit: true) every node carries data-layout-node so a click selects it, and an empty container
   shows a drop zone; the controls themselves are inert there (sheet.css). */
const mark = (node, edit) => edit ? ` data-layout-node="${escape(node.id)}"` : "";
const dropZone = (id, t) => `<div class="rta-sheet-drop" data-layout-node="${escape(id)}" data-layout-drop>${escape(t("RTA.SheetEditor.Empty"))}</div>`;

function renderNode(node, t, {row = null, solo = false, edit = false} = {}) {
  if (!node) return "";
  const m = mark(node, edit);
  if (node.kind === "value") {
    const label = node.label ? t(node.label) : node.labelKey ? t(node.labelKey) : "";
    const title = node.error ? ` title="${escape(node.error)}"` : "";
    // A row with a single value already says what it is: its label stays for screen readers only.
    return `<div class="rta-sheet-value${node.error ? " rta-sheet-value--unavailable" : ""}"${span(node)}${title}${m}><div class="rta-sheet-value__inner"><span class="rta-sheet-value__label${solo ? " rta-sheet-visually-hidden" : ""}">${escape(label)}</span><span class="rta-sheet-value__control">${valueControl(node, t, row)}</span></div></div>`;
  }
  if (node.kind === "action") return `<button type="button" class="rta-sheet-action"${span(node)} data-sheet-action="${escape(node.actionId)}"${node.definitionId ? ` data-definition-id="${escape(node.definitionId)}"` : ""}${m}>${escape(t(node.label))}</button>`;
  if (node.kind === "text") return `<p class="rta-sheet-text"${span(node)}${m}>${escape(edit && !node.text ? t("RTA.SheetEditor.EmptyText") : t(node.text))}</p>`;
  if (node.kind === "spacer") return `<div class="rta-sheet-spacer"${span(node)}${m}></div>`;
  if (node.kind === "placeholder") return dropZone(node.parentId, t);
  const children = (list, options) => list.length || !edit ? list.map(child => renderNode(child, t, {...options, edit})).join("") : dropZone(node.id, t);
  if (node.kind === "tabs") {
    const tabs = node.children ?? [];
    return `<div class="rta-sheet-tabs"${span(node)}${m}><nav class="rta-sheet-tabs__nav" role="tablist">${tabs.map((tab, i) => `<button type="button" role="tab" data-sheet-tab="${escape(tab.id)}" aria-selected="${i === 0}"${mark(tab, edit)}>${escape(tab.label ? t(tab.label) : edit ? t("RTA.SheetEditor.UntitledTab") : "")}</button>`).join("")}</nav>${tabs.map((tab, i) => `<div class="rta-sheet-grid rta-sheet-tab" role="tabpanel" data-sheet-panel="${escape(tab.id)}" style="--rta-sheet-columns: 1"${i ? " hidden" : ""}${mark(tab, edit)}>${children(tab.children ?? [], {row})}</div>`).join("")}</div>`;
  }
  if (node.kind === "repeater") return renderList(node, t, edit);
  const body = `<div class="rta-sheet-grid" style="${columns(node)}"${node.kind === "grid" && !node.span ? m : ""}>${children(node.children ?? [], {row})}</div>`;
  if (node.kind === "section") return `<section class="rta-sheet-section"${span(node)}${m}>${node.label ? `<h3 class="rta-sheet-section__title">${escape(t(node.label))}</h3>` : ""}${body}</section>`;
  return node.span ? `<div class="rta-sheet-block"${span(node)}${m}>${body}</div>` : body;
}

const cellLabel = (node, t) => node.kind === "value" ? (node.label ? t(node.label) : node.labelKey ? t(node.labelKey) : "") : "";
/** A repeater: one row per Definition (its name, then one cell per child), flowing into node.columns columns.
   Rows share their parent's tracks (subgrid), so every cell lines up; with two values or more, a head row names them. */
function renderList(node, t, edit) {
  let rows = node.rows ?? [];
  if (!rows.length && !edit) return `<p class="rta-sheet-empty"${span(node)}>${escape(t("RTA.Sheet.NoneHeld"))}</p>`;
  // The editor always shows a row, and a drop zone in it while the row shows nothing.
  if (!rows.length) rows = [{definitionId: "", label: t("RTA.SheetEditor.ExampleRow"), children: []}];
  if (edit && !rows[0].children.length) rows = rows.map(r => ({...r, children: [{kind: "placeholder", parentId: node.id}]}));
  const cells = rows[0].children, perColumn = `minmax(0, 1fr)${" auto".repeat(cells.length)}`, columnCount = Math.max(1, Number(node.columns ?? 1));
  const head = cells.filter(c => c.kind === "value").length > 1
    ? `<div class="rta-sheet-row rta-sheet-row--head" aria-hidden="true"><span></span>${cells.map(c => `<span class="rta-sheet-row__head">${escape(cellLabel(c, t))}</span>`).join("")}</div>`.repeat(Math.min(columnCount, rows.length)) : "";
  const style = `--rta-sheet-cells: ${cells.length + 1}; --rta-sheet-list-template: ${Array(columnCount).fill(perColumn).join(" ")}; --rta-sheet-list-medium: ${Array(Math.min(columnCount, 2)).fill(perColumn).join(" ")}; --rta-sheet-list-narrow: ${perColumn}`;
  const body = rows.map(r => `<div class="rta-sheet-row" data-definition-id="${escape(r.definitionId)}"><span class="rta-sheet-row__label" title="${escape(t(r.label))}">${escape(t(r.label))}</span>${r.children.map(child => renderNode(child, t, {row: r.definitionId, solo: true, edit})).join("")}</div>`).join("");
  return `<div class="rta-sheet-list" style="${style}${node.span ? `; --rta-sheet-span: ${Number(node.span)}` : ""}"${mark(node, edit)}>${head}${body}</div>`;
}

/** The editor's canvas: the sheet as players get it, every node selectable. */
export function renderLayoutPreviewHTML(view, {t = key => key, selectedId = null} = {}) {
  const html = `<div class="rta-sheet rta-sheet--edit"><div class="rta-sheet__body">${renderNode(view?.root, t, {edit: true})}</div></div>`;
  return selectedId ? html.replaceAll(`data-layout-node="${escape(selectedId)}"`, `data-layout-node="${escape(selectedId)}" data-layout-selected`) : html;
}

/** The whole sheet: header (image, editable name), then the layout. notice: a message shown instead of the layout. */
export function renderSheetHTML(view, {t = key => key, name = "", img = "", editableName = false, notice = "", noticeAction = null} = {}) {
  const header = `<header class="rta-sheet__header">${img ? `<img class="rta-sheet__image" src="${escape(img)}" alt="">` : ""}${editableName ? `<input class="rta-sheet__name" type="text" data-sheet-name value="${escape(name)}" aria-label="${escape(t("RTA.Template.Name"))}">` : `<h2 class="rta-sheet__name">${escape(name)}</h2>`}</header>`;
  const body = notice
    ? `<div class="rta-sheet-notice"><p>${escape(notice)}</p>${noticeAction ? `<button type="button" data-sheet-command="${escape(noticeAction.command)}">${escape(noticeAction.label)}</button>` : ""}</div>`
    : renderNode(view?.root, t);
  return `<div class="rta-sheet" data-sheet-id="${escape(view?.sheetId ?? "")}">${header}<div class="rta-sheet__body">${body}</div></div>`;
}

/** The chat card of an Action used from a sheet. summary: {title, actor, lines: [{label, value}], outcome}. */
export function renderActionChatHTML({title, actor = "", lines = [], outcome = ""}) {
  return `<div class="rta-chat-card"><header class="rta-chat-card__title"><strong>${escape(title)}</strong>${actor ? `<span>${escape(actor)}</span>` : ""}</header>${lines.length ? `<dl class="rta-chat-card__lines">${lines.map(line => `<dt>${escape(line.label)}</dt><dd>${escape(line.value)}</dd>`).join("")}</dl>` : ""}${outcome ? `<p class="rta-chat-card__outcome">${escape(outcome)}</p>` : ""}</div>`;
}
