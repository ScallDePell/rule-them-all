/* HTML of a played sheet, from the projection (runtime/sheet-projection.mjs). Pure: no Foundry access.
   t(key) translates a Ruleset or module key (it returns the key itself when there is no translation).
   Data contract with the sheet controller (runtime/foundry-sheets.mjs):
   - [data-sheet-write=nodeId] (+ data-definition-id, data-operation) is a value the player changes;
     a dot of a value shown as dots carries data-sheet-dot=n (its value once clicked) instead of being a field;
     an adjust value has − and + buttons [data-sheet-adjust=-1|1] on each side of it, by 1;
   - [data-sheet-action=actionId] (+ data-definition-id) uses an Action;
   - [data-sheet-tab=id] shows the [data-sheet-panel=id] of its tabs;
   - [data-sheet-item-open=key] opens an owned Item's sheet, [data-sheet-item-remove=key] removes it;
   - [data-sheet-command] runs a sheet command (initialize, create). */
import {escapeHTML as escape} from "./html-utils.mjs";
import {sheetStyle, styledAttributes} from "./sheet-style.mjs";
import {SHEET_IMAGE_HEIGHTS} from "../configurator/layout-style-contract.mjs";

const spanOf = node => node.span ? [`--rta-sheet-span: ${Number(node.span)}`] : [];
const columns = node => `--rta-sheet-columns: ${Number(node.columns ?? 1)}`;
/** class and style of a node's element: its base class, its span, its style (sheet-style.mjs). */
const attrs = (node, base, declarations = []) => styledAttributes(node, base, [...spanOf(node), ...declarations]);

/** A read value as text: numbers rounded to two decimals, nothing as a dash. */
export function formatSheetValue(value) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "number") return Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100);
  if (Array.isArray(value)) return String(value.length);
  if (typeof value === "object") return "—";
  return String(value);
}

/** A value as dots: one per point up to its maximum (or node.dots); with a "set" write, a dot sets the value
   (the last filled one takes a point back). */
function dotsControl(node, t, data) {
  const value = Math.max(0, Math.trunc(Number(node.value) || 0)), count = Math.max(1, Math.min(20, Math.trunc(Number(node.maximum ?? node.dots ?? 5)) || 5));
  const settable = node.write?.operation === "set";
  const dot = n => settable
    ? `<button type="button" class="rta-sheet-dot${n <= value ? " rta-sheet-dot--on" : ""}" ${data} data-sheet-dot="${n === value ? n - 1 : n}" aria-label="${escape(String(n))}"></button>`
    : `<span class="rta-sheet-dot${n <= value ? " rta-sheet-dot--on" : ""}"></span>`;
  return `<span class="rta-sheet-dots" role="img" aria-label="${escape(`${value} / ${count}`)}">${Array.from({length: count}, (_, i) => dot(i + 1)).join("")}</span>`;
}

/** A value as a gauge: a bar filled up to its maximum, the numbers on it. */
function gaugeHTML(node) {
  const max = Number(node.maximum), min = Number(node.minimum ?? 0), value = Number(node.value);
  const share = Number.isFinite(max) && max > min && Number.isFinite(value) ? Math.max(0, Math.min(100, Math.round((value - min) / (max - min) * 100))) : 0;
  return `<span class="rta-sheet-gauge" role="meter" aria-valuemin="${escape(String(min))}" aria-valuemax="${escape(String(Number.isFinite(max) ? max : ""))}" aria-valuenow="${escape(String(Number.isFinite(value) ? value : ""))}"><span class="rta-sheet-gauge__fill" style="--rta-gauge-share: ${share}%"></span><span class="rta-sheet-gauge__text">${escape(formatSheetValue(node.value))}${Number.isFinite(max) ? ` / ${escape(formatSheetValue(max))}` : ""}</span></span>`;
}

/** A value raised and lowered by 1: − before what shows it, + after.
    In the editor they are plain marks, so the whole block still drags (some browsers never drag a button). */
function adjustHTML(shown, t, data, edit) {
  const button = (step, label) => edit ? `<span class="rta-sheet-value__step" data-sheet-adjust="${step}" aria-hidden="true">${step < 0 ? "−" : "+"}</span>`
    : `<button type="button" class="rta-sheet-value__step" ${data} data-sheet-adjust="${step}" aria-label="${escape(t(label))}">${step < 0 ? "−" : "+"}</button>`;
  return `${button(-1, "RTA.Sheet.Lower")}${shown}${button(1, "RTA.Sheet.Raise")}`;
}

function valueControl(node, t, row, edit = false) {
  const write = node.write, data = `data-sheet-write="${escape(node.id)}"${row ? ` data-definition-id="${escape(row)}"` : ""} data-operation="${escape(write?.operation ?? "")}"`;
  const numericValue = ["number", "integer"].includes(node.valueType);
  if (node.display === "dots" && numericValue) return dotsControl(node, t, data);
  // A gauge shows the bar; a player who may change the value still gets its field beside it.
  // A gauge already shows the number: raised and lowered, the − and + go on each side of it.
  if (node.display === "gauge" && numericValue) return write?.operation === "adjust" ? adjustHTML(gaugeHTML(node), t, data, edit)
    : `${gaugeHTML(node)}${write ? valueControl({...node, display: undefined, maximum: undefined}, t, row, edit) : ""}`;
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
  // adjust: − and + on each side of the value, by 1.
  if (write.operation === "adjust") return adjustHTML(`<span class="rta-sheet-value__text">${escape(formatSheetValue(node.value))}${bound}</span>`, t, data, edit);
  // add / subtract: the value stays read; the field takes the amount, applied on change, then cleared.
  const sign = write.operation === "add" ? "+" : "−";
  return `<span class="rta-sheet-value__text">${escape(formatSheetValue(node.value))}</span>${bound}<input type="number" class="rta-sheet-value__amount" ${data} step="any" min="0" placeholder="${sign}" aria-label="${escape(t(write.operation === "add" ? "RTA.Sheet.Add" : "RTA.Sheet.Subtract"))}">`;
}

/* In the editor (edit: true) every node carries data-layout-node so a click selects it, and an empty container
   shows a drop zone; the controls themselves are inert there (sheet.css).
   A block for the GM only is outlined there (data-layout-gm-only). */
const mark = (node, edit) => edit ? ` data-layout-node="${escape(node.id)}"${node.gmOnly ? " data-layout-gm-only" : ""}` : "";
const dropZone = (id, t) => `<div class="rta-sheet-drop" data-layout-node="${escape(id)}" data-layout-drop>${escape(t("RTA.SheetEditor.Empty"))}</div>`;

/** The Contents an Actor holds, grouped under their Content Type when there are several types. */
function renderContents(node, t, {edit, editable, m}) {
  const rows = node.rows ?? [], types = [...new Set(rows.map(r => r.type))];
  const item = r => `<li class="rta-sheet-content${r.available ? "" : " rta-sheet-content--unavailable"}">${r.img ? `<img class="rta-sheet-content__image" src="${escape(r.img)}" alt="">` : `<span class="rta-sheet-content__image"><i class="fa-solid fa-suitcase"></i></span>`}`
    + (r.item && !edit ? `<button type="button" class="rta-sheet-content__name" data-sheet-item-open="${escape(r.key)}">${escape(t(r.label))}</button>` : `<span class="rta-sheet-content__name">${escape(t(r.label))}</span>`)
    + (r.item && editable && !edit ? `<button type="button" class="rta-sheet-content__remove" data-sheet-item-remove="${escape(r.key)}" title="${escape(t("RTA.Sheet.RemoveContent"))}" aria-label="${escape(t("RTA.Sheet.RemoveContent"))}"><i class="fa-solid fa-trash"></i></button>` : "") + "</li>";
  const groups = types.length > 1 ? types.map(type => `<p class="rta-sheet-contents__type">${escape(type ? t(type) : t("RTA.Sheet.OtherItems"))}</p><ul class="rta-sheet-contents__list">${rows.filter(r => r.type === type).map(item).join("")}</ul>`).join("")
    : rows.length ? `<ul class="rta-sheet-contents__list">${rows.map(item).join("")}</ul>` : "";
  return `<div ${attrs(node, "rta-sheet-contents")}${m}>${groups || `<p class="rta-sheet-empty">${escape(t("RTA.Sheet.DropContents"))}</p>`}</div>`;
}

function renderNode(node, t, {row = null, solo = false, edit = false, editable = false} = {}) {
  if (!node) return "";
  const m = mark(node, edit);
  if (node.kind === "value") {
    const label = node.label ? t(node.label) : node.labelKey ? t(node.labelKey) : "";
    const title = node.error ? ` title="${escape(node.error)}"` : "";
    // A row with a single value already says what it is: its label stays for screen readers only.
    return `<div ${attrs(node, `rta-sheet-value${node.error ? " rta-sheet-value--unavailable" : ""}`)}${title}${m}><div class="rta-sheet-value__inner"><span class="rta-sheet-value__label${solo ? " rta-sheet-visually-hidden" : ""}">${escape(label)}</span><span class="rta-sheet-value__control">${valueControl(node, t, row, edit)}</span></div></div>`;
  }
  // In the editor a button is a plain block: some browsers never drag a button.
  if (node.kind === "action") return edit ? `<div ${attrs(node, "rta-sheet-action")}${m}>${escape(t(node.label))}</div>`
    : `<button type="button" ${attrs(node, "rta-sheet-action")} data-sheet-action="${escape(node.actionId)}"${node.definitionId ? ` data-definition-id="${escape(node.definitionId)}"` : ""}${m}>${escape(t(node.label))}</button>`;
  if (node.kind === "text") return `<p ${attrs(node, "rta-sheet-text")}${m}>${escape(edit && !node.text ? t("RTA.SheetEditor.EmptyText") : t(node.text))}</p>`;
  if (node.kind === "spacer") return `<div ${attrs(node, "rta-sheet-spacer")}${m}></div>`;
  if (node.kind === "image") {
    // A picture: a banner, a logo. In the editor, an image block without its picture yet says so.
    const look = [`--rta-sheet-image-height: ${SHEET_IMAGE_HEIGHTS[node.height] ?? SHEET_IMAGE_HEIGHTS.medium}`, `--rta-sheet-image-fit: ${node.fit === "contain" ? "contain" : "cover"}`, ...(node.style?.opacity !== undefined ? [`opacity: ${Number(node.style.opacity) / 100}`] : [])];
    const shape = ["rounded", "square", "portrait", "landscape", "circle"].includes(node.shape) ? ` rta-sheet-image--${node.shape}` : "";
    return node.src ? `<div ${attrs(node, `rta-sheet-image${shape}`, look)}${m}><img src="${escape(node.src)}" alt=""></div>` : edit ? `<div ${attrs(node, `rta-sheet-image rta-sheet-image--empty${shape}`, look)}${m}><i class="fa-solid fa-image"></i> ${escape(t("RTA.SheetEditor.NoImage"))}</div>` : "";
  }
  if (node.kind === "contents") return renderContents(node, t, {edit, editable, m});
  if (node.kind === "placeholder") return dropZone(node.parentId, t);
  // An empty container shows its own drop zone (an empty tab's, not its tabs').
  const children = (list, options, holder = node) => list.length || !edit ? list.map(child => renderNode(child, t, {...options, edit, editable})).join("") : dropZone(holder.id, t);
  if (node.kind === "tabs") {
    const tabs = node.children ?? [];
    return `<div ${attrs(node, "rta-sheet-tabs")}${m}><nav class="rta-sheet-tabs__nav" role="tablist">${tabs.map((tab, i) => `<${edit ? "div" : `button type="button"`} class="rta-sheet-tabs__tab" role="tab" data-sheet-tab="${escape(tab.id)}" aria-selected="${i === 0}"${mark(tab, edit)}>${escape(tab.label ? t(tab.label) : edit ? t("RTA.SheetEditor.UntitledTab") : "")}</${edit ? "div" : "button"}>`).join("")}</nav>${tabs.map((tab, i) => `<div ${styledAttributes(tab, "rta-sheet-grid rta-sheet-tab", ["--rta-sheet-columns: 1", ...(sheetStyle(tab).gap ? [`gap: ${sheetStyle(tab).gap}`] : [])])} role="tabpanel" data-sheet-panel="${escape(tab.id)}"${i ? " hidden" : ""}${mark(tab, edit)}>${children(tab.children ?? [], {row}, tab)}</div>`).join("")}</div>`;
  }
  if (node.kind === "repeater") return renderList(node, t, edit);
  // The grid the children flow in takes the spacing; the block itself takes the rest of the style.
  const gap = sheetStyle(node).gap, bare = node.kind === "grid" && !node.span;
  const grid = [columns(node), ...(gap ? [`gap: ${gap}`] : [])];
  const body = `<div ${bare ? attrs(node, "rta-sheet-grid", grid) : `class="rta-sheet-grid" style="${escape(grid.join("; "))}"`}${bare ? m : ""}>${children(node.children ?? [], {row})}</div>`;
  if (node.kind === "section") return `<section ${attrs(node, "rta-sheet-section")}${m}>${node.label ? `<h3 class="rta-sheet-section__title">${escape(t(node.label))}</h3>` : ""}${body}</section>`;
  return node.span ? `<div ${attrs(node, "rta-sheet-block")}${m}>${body}</div>` : body;
}

const cellLabel = (node, t) => node.kind === "value" ? (node.label ? t(node.label) : node.labelKey ? t(node.labelKey) : "") : "";
/** A repeater: one row per Definition (its name, then one cell per child), flowing into node.columns columns.
   Rows share their parent's tracks (subgrid), so every cell lines up; with two values or more, a head row names them. */
function renderList(node, t, edit) {
  let rows = node.rows ?? [];
  if (!rows.length && !edit) return `<p ${attrs(node, "rta-sheet-empty")}>${escape(t("RTA.Sheet.NoneHeld"))}</p>`;
  // The editor always shows a row, and a drop zone in it while the row shows nothing.
  if (!rows.length) rows = [{definitionId: "", label: t("RTA.SheetEditor.ExampleRow"), children: []}];
  if (edit && !rows[0].children.length) rows = rows.map(r => ({...r, children: [{kind: "placeholder", parentId: node.id}]}));
  const cells = rows[0].children, perColumn = `minmax(0, 1fr)${" auto".repeat(cells.length)}`, columnCount = Math.max(1, Number(node.columns ?? 1));
  const head = cells.filter(c => c.kind === "value").length > 1
    ? `<div class="rta-sheet-row rta-sheet-row--head" aria-hidden="true"><span></span>${cells.map(c => `<span class="rta-sheet-row__head">${escape(cellLabel(c, t))}</span>`).join("")}</div>`.repeat(Math.min(columnCount, rows.length)) : "";
  const style = `--rta-sheet-cells: ${cells.length + 1}; --rta-sheet-list-template: ${Array(columnCount).fill(perColumn).join(" ")}; --rta-sheet-list-medium: ${Array(Math.min(columnCount, 2)).fill(perColumn).join(" ")}; --rta-sheet-list-narrow: ${perColumn}`;
  const body = rows.map(r => `<div class="rta-sheet-row" data-definition-id="${escape(r.definitionId)}"><span class="rta-sheet-row__label" title="${escape(t(r.label))}">${escape(t(r.label))}</span>${r.children.map(child => renderNode(child, t, {row: r.definitionId, solo: true, edit})).join("")}</div>`).join("");
  return `<div ${attrs(node, "rta-sheet-list", [style, ...(sheetStyle(node).gap ? [`row-gap: ${sheetStyle(node).gap}`] : [])])}${mark(node, edit)}>${head}${body}</div>`;
}

/** The editor's canvas: the sheet as players get it, every node selectable. */
export function renderLayoutPreviewHTML(view, {t = key => key, selectedId = null} = {}) {
  const html = `<div class="rta-sheet rta-sheet--edit"><div class="rta-sheet__body">${renderNode(view?.root, t, {edit: true})}</div></div>`;
  return selectedId ? html.replaceAll(`data-layout-node="${escape(selectedId)}"`, `data-layout-node="${escape(selectedId)}" data-layout-selected`) : html;
}

/** The whole sheet: header (image, editable name), then the layout. notice: a message shown instead of the layout. */
export function renderSheetHTML(view, {t = key => key, name = "", img = "", editable = false, notice = "", noticeActions = [], headerActions = []} = {}) {
  const header = `<header class="rta-sheet__header">${img ? `<img class="rta-sheet__image" src="${escape(img)}" alt="">` : ""}${editable ? `<input class="rta-sheet__name" type="text" data-sheet-name value="${escape(name)}" aria-label="${escape(t("RTA.Template.Name"))}">` : `<h2 class="rta-sheet__name">${escape(name)}</h2>`}${headerActions.map(action => `<button type="button" class="rta-sheet__command" data-sheet-command="${escape(action.command)}"><i class="fa-solid ${escape(action.icon ?? "fa-wand-magic-sparkles")}"></i> ${escape(action.label)}</button>`).join("")}</header>`;
  const body = notice
    ? `<div class="rta-sheet-notice"><p>${escape(notice)}</p>${noticeActions.length ? `<div class="rta-sheet-notice__actions">${noticeActions.map((action, i) => `<button type="button"${i ? "" : ' class="rta-sheet-notice__primary"'} data-sheet-command="${escape(action.command)}">${escape(action.label)}</button>`).join("")}</div>` : ""}</div>`
    : renderNode(view?.root, t, {editable});
  return `<div class="rta-sheet" data-sheet-id="${escape(view?.sheetId ?? "")}">${header}<div class="rta-sheet__body">${body}</div></div>`;
}

/** The chat card of an Action used from a sheet. summary: {title, actor, lines: [{label, value}], outcome}. */
export function renderActionChatHTML({title, actor = "", lines = [], outcome = ""}) {
  return `<div class="rta-chat-card"><header class="rta-chat-card__title"><strong>${escape(title)}</strong>${actor ? `<span>${escape(actor)}</span>` : ""}</header>${lines.length ? `<dl class="rta-chat-card__lines">${lines.map(line => `<dt>${escape(line.label)}</dt><dd>${escape(line.value)}</dd>`).join("")}</dl>` : ""}${outcome ? `<p class="rta-chat-card__outcome">${escape(outcome)}</p>` : ""}</div>`;
}
