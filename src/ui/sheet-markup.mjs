/* HTML of a played sheet, from the projection (runtime/sheet-projection.mjs). Pure: no Foundry access.
   t(key) translates a Ruleset or module key (it returns the key itself when there is no translation).
   Data contract with the sheet controller (runtime/foundry-sheets.mjs):
   - [data-sheet-write=nodeId] (+ data-definition-id, data-operation) is a value the player changes;
     a dot of a value shown as dots carries data-sheet-dot=n (its value once clicked) instead of being a field;
     an adjust value has − and + buttons [data-sheet-adjust=-1|1] on each side of it, by 1;
   - [data-sheet-action=actionId] (+ data-definition-id) uses an Action (a button, or a value's label, a text, an image
     or a list row's name that uses one when clicked);
   - [data-sheet-note-rich=nodeId] is a rich notes block the controller fills (Foundry's enriched text or editor);
     a plain one is a textarea [data-sheet-write=nodeId] (data-operation "set");
   - [data-sheet-collapse=nodeId] folds and unfolds its section ([data-sheet-collapsible=nodeId]);
   - [data-tooltip] is a block's tooltip (Foundry shows it on hover);
   - [data-sheet-tab=id] shows the [data-sheet-panel=id] of its tabs;
   - [data-sheet-item-open=key] opens an owned Item's sheet, [data-sheet-item-remove=key] removes it;
   - [data-sheet-advance=advancementId] (+ data-progression, data-definition-id) buys an advancement,
     [data-sheet-milestones=progressionSystemId] applies the milestones reached;
   - [data-sheet-command] runs a sheet command (initialize, create);
   - [data-sheet-name] is the Document's name, a field only while the sheet is unlocked;
   - [data-sheet-edit-image=img|token] (the camera button on a portrait, only while unlocked) opens Foundry's file picker
     for the Document's image or its prototype token's, [data-sheet-update-placed] also for the tokens already placed.
   doc: {name, img, token, editable, unlocked}: the Document a played sheet shows (token: its prototype token's image),
   whether the user may change it and whether its lock is open. */
import {escapeHTML as escape} from "./html-utils.mjs";
import {sheetStyle, styledAttributes} from "./sheet-style.mjs";
import {SHEET_IMAGE_HEIGHTS} from "../configurator/layout-style-contract.mjs";
import {sheetThemeAttributes} from "../configurator/sheet-themes.mjs";
import {LAYOUT_NOTE_HEIGHTS, LAYOUT_OVERLAYS, LAYOUT_WIDTHS, TEXT_PLACEHOLDER} from "../configurator/layout-contract.mjs";

/** Columns and rows a block spans in its parent's grid, and its fixed width. */
const spanOf = node => [...(node.span ? [`--rta-sheet-span: ${Number(node.span)}`] : []), ...(node.rowSpan ? [`--rta-sheet-row-span: ${Number(node.rowSpan)}`] : []),
  ...(LAYOUT_WIDTHS[node.width] ? [`--rta-sheet-width: ${LAYOUT_WIDTHS[node.width]}`] : [])];
const columns = node => `--rta-sheet-columns: ${Number(node.columns ?? 1)}`;
/** class and style of a node's element: its base class, its span, its style (sheet-style.mjs). */
const attrs = (node, base, declarations = []) => styledAttributes(node, `${base}${LAYOUT_WIDTHS[node.width] ? " rta-sheet-sized" : ""}`, [...spanOf(node), ...declarations]);
/** A block's tooltip: free text or its Definition's description, translated. */
const tooltip = (node, t) => node.tooltip?.text ? ` data-tooltip="${escape(t(node.tooltip.text))}"` : "";
/** What a click on a block uses: an Action, on the row's Definition in a list. */
const clickData = (click, row = click?.definitionId) => `data-sheet-action="${escape(click.actionId)}"${row ? ` data-definition-id="${escape(row)}"` : ""}`;
/** A text with "{name}" placeholders: each replaced by that value, formatted; the rest escaped. */
export function textWithValues(text, values) {
  if (!values) return escape(text);
  let html = "", last = 0;
  for (const match of text.matchAll(TEXT_PLACEHOLDER)) {
    if (!Object.hasOwn(values, match[1])) continue;
    html += `${escape(text.slice(last, match.index))}<span class="rta-sheet-text__value">${escape(formatSheetValue(values[match[1]]))}</span>`;
    last = match.index + match[0].length;
  }
  return html + escape(text.slice(last));
}
/** How a label shows: "text", "icon" or "both" (an icon is shown with its text unless told otherwise). */
const labelShow = node => node.icon ? node.labelShow ?? "both" : "text";
/** A label as text, an icon, or both. An icon alone keeps its text for screen readers; labelTip gives it as the tooltip. */
const labelHTML = (node, text) => {
  const show = labelShow(node);
  if (show === "text") return escape(text);
  const icon = `<i class="${escape(node.icon)} rta-sheet-icon" aria-hidden="true"></i>`;
  return show === "icon" ? `${icon}<span class="rta-sheet-visually-hidden">${escape(text)}</span>` : `${icon}<span>${escape(text)}</span>`;
};
const labelTip = (node, text) => labelShow(node) === "icon" && text ? ` title="${escape(text)}"` : "";

/** A read value as text: numbers rounded to two decimals, nothing as a dash. */
export function formatSheetValue(value) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "number") return Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100);
  if (Array.isArray(value)) return String(value.length);
  if (typeof value === "object") return "—";
  return String(value);
}

/** A value as dots (or square boxes: a stress track): one per point up to its maximum (or node.dots); with a "set"
   write, a dot sets the value (the last filled one takes a point back). */
function dotsControl(node, t, data) {
  const value = Math.max(0, Math.trunc(Number(node.value) || 0)), count = pointCount(node);
  const settable = node.write?.operation === "set";
  const dot = n => settable
    ? `<button type="button" class="rta-sheet-dot${n <= value ? " rta-sheet-dot--on" : ""}" ${data} data-sheet-dot="${n === value ? n - 1 : n}" aria-label="${escape(String(n))}"></button>`
    : `<span class="rta-sheet-dot${n <= value ? " rta-sheet-dot--on" : ""}"></span>`;
  return `<span class="rta-sheet-dots${node.display === "boxes" ? " rta-sheet-dots--boxes" : ""}" role="img" aria-label="${escape(`${value} / ${count}`)}">${Array.from({length: count}, (_, i) => dot(i + 1)).join("")}</span>`;
}
const pointCount = node => Math.max(1, Math.min(20, Math.trunc(Number(node.maximum ?? node.dots ?? 5)) || 5));

/** A value as a clock: a circle cut into one segment per point up to its maximum (or node.dots), filled clockwise
   from the top; with a "set" write, a segment sets the value like a dot. */
function clockControl(node, t, data) {
  const value = Math.max(0, Math.trunc(Number(node.value) || 0)), count = pointCount(node), settable = node.write?.operation === "set";
  const at = degrees => { const radians = (degrees - 90) * Math.PI / 180; return `${Math.round((18 + 16 * Math.cos(radians)) * 100) / 100} ${Math.round((18 + 16 * Math.sin(radians)) * 100) / 100}`; };
  const segment = n => {
    const shape = count === 1 ? `<circle cx="18" cy="18" r="16"` : `<path d="M18 18 L${at((n - 1) * 360 / count)} A16 16 0 0 1 ${at(n * 360 / count)} Z"`;
    const set = settable ? ` ${data} data-sheet-dot="${n === value ? n - 1 : n}" role="button" aria-label="${escape(String(n))}"` : "";
    return `${shape} class="rta-sheet-clock__segment${n <= value ? " rta-sheet-clock__segment--on" : ""}"${set}/>`;
  };
  return `<svg class="rta-sheet-clock${settable ? " rta-sheet-clock--settable" : ""}" viewBox="0 0 36 36" role="img" aria-label="${escape(`${value} / ${count}`)}">${Array.from({length: count}, (_, i) => segment(i + 1)).join("")}</svg>`;
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
  // A description: the words of the scale (or the editor's sample), translated.
  if (node.display === "description") return `<span class="rta-sheet-value__text rta-sheet-value__words">${node.value ? escape(t(node.value)) : "—"}</span>`;
  const numericValue = ["number", "integer"].includes(node.valueType);
  if (["dots", "boxes"].includes(node.display) && numericValue) return dotsControl(node, t, data);
  if (node.display === "clock" && numericValue) return clockControl(node, t, data);
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
   A block not for everyone is outlined there (data-layout-seen-by: who gets it); one shown under a Condition is dimmed (data-layout-conditional). */
const mark = (node, edit) => edit ? ` data-layout-node="${escape(node.id)}"${node.seenBy ? ` data-layout-seen-by="${escape(node.seenBy.join(" "))}"` : ""}${node.visibleIf ? " data-layout-conditional" : ""}` : "";
const dropZone = (id, t) => `<div class="rta-sheet-drop" data-layout-node="${escape(id)}" data-layout-drop>${escape(t("RTA.SheetEditor.Empty"))}</div>`;

/** The Contents an Actor holds, grouped under their Content Type when there are several types. */
function renderContents(node, t, {edit, editable, m}) {
  const rows = node.rows ?? [], types = [...new Set(rows.map(r => r.type))];
  const item = r => `<li class="rta-sheet-content${r.available ? "" : " rta-sheet-content--unavailable"}">${r.img ? `<img class="rta-sheet-content__image" src="${escape(r.img)}" alt="">` : `<span class="rta-sheet-content__image"><i class="fa-solid fa-suitcase"></i></span>`}`
    + (r.item && !edit ? `<button type="button" class="rta-sheet-content__name" data-sheet-item-open="${escape(r.key)}">${escape(t(r.label))}</button>` : `<span class="rta-sheet-content__name">${escape(t(r.label))}</span>`)
    + (r.item && editable && !edit ? `<button type="button" class="rta-sheet-content__remove" data-sheet-item-remove="${escape(r.key)}" title="${escape(t("RTA.Sheet.RemoveContent"))}" aria-label="${escape(t("RTA.Sheet.RemoveContent"))}"><i class="fa-solid fa-trash"></i></button>` : "") + "</li>";
  if (node.cards) return renderCards(node, rows, t, {edit, editable, m});
  const groups = types.length > 1 ? types.map(type => `<p class="rta-sheet-contents__type">${escape(type ? t(type) : t("RTA.Sheet.OtherItems"))}</p><ul class="rta-sheet-contents__list">${rows.filter(r => r.type === type).map(item).join("")}</ul>`).join("")
    : rows.length ? `<ul class="rta-sheet-contents__list">${rows.map(item).join("")}</ul>` : "";
  return `<div ${attrs(node, "rta-sheet-contents")}${m}>${groups || `<p class="rta-sheet-empty">${escape(t("RTA.Sheet.DropContents"))}</p>`}</div>`;
}

/** The held Contents as cards: each one's picture and name, then the fields chosen (cards: "fields"); or its card
   template, whose name and portrait blocks show that Content (cards: "template"), with its open and remove buttons below.
   The blocks of a card are not the sheet's: in the editor a click on them selects the whole held-Contents block. */
function renderCards(node, rows, t, {edit, editable, m}) {
  const open = r => r.item && !edit ? `<button type="button" class="rta-sheet-content__name" data-sheet-item-open="${escape(r.key)}">${escape(t(r.label))}</button>` : `<span class="rta-sheet-content__name">${escape(t(r.label))}</span>`;
  const remove = r => r.item && editable && !edit ? `<button type="button" class="rta-sheet-content__remove" data-sheet-item-remove="${escape(r.key)}" title="${escape(t("RTA.Sheet.RemoveContent"))}" aria-label="${escape(t("RTA.Sheet.RemoveContent"))}"><i class="fa-solid fa-trash"></i></button>` : "";
  const image = r => r.img ? `<img class="rta-sheet-content__image" src="${escape(r.img)}" alt="">` : `<span class="rta-sheet-content__image"><i class="fa-solid fa-suitcase"></i></span>`;
  const blocks = (list, r) => list.map(child => renderNode(child, t, {edit, card: true, doc: {name: t(r.label), img: r.img}})).join("");
  const card = r => {
    const state = r.available ? "" : " rta-sheet-card--unavailable";
    if (node.cards === "template") {
      const opener = r.item && !edit ? `<button type="button" class="rta-sheet-card__open" data-sheet-item-open="${escape(r.key)}" title="${escape(t("RTA.Sheet.OpenContent"))}" aria-label="${escape(`${t("RTA.Sheet.OpenContent")} · ${t(r.label)}`)}"><i class="fa-solid fa-up-right-from-square"></i></button>` : "";
      return `<li class="rta-sheet-card rta-sheet-card--template${state}"><div class="rta-sheet-card__body">${blocks(r.children ?? [], r)}</div>${opener || remove(r) ? `<div class="rta-sheet-card__tools">${opener}${remove(r)}</div>` : ""}</li>`;
    }
    const fields = r.fields ?? [];
    return `<li class="rta-sheet-card${state}"><div class="rta-sheet-card__head">${image(r)}${open(r)}${remove(r)}</div>${fields.length ? `<div class="rta-sheet-card__fields">${blocks(fields, r)}</div>` : ""}</li>`;
  };
  return `<div ${attrs(node, "rta-sheet-contents rta-sheet-contents--cards")}${m}>${rows.length ? `<ul class="rta-sheet-cards">${rows.map(card).join("")}</ul>` : `<p class="rta-sheet-empty">${escape(t("RTA.Sheet.DropContents"))}</p>`}</div>`;
}

/** A Progression System's purchases: per advancement, each Definition it raises (from → to), the cost in its currency and
   a button (or why it cannot be bought now); then the milestones, with a button that applies those reached.
   In the editor the buttons are plain marks, so the block still drags. */
const MILESTONE_ICONS = {applied: "fa-circle-check", reached: "fa-circle-exclamation", ahead: "fa-circle"};
function renderProgression(node, t, {edit, m}) {
  const button = (label, data) => edit ? `<span class="rta-sheet-progression__button">${escape(label)}</span>` : `<button type="button" class="rta-sheet-progression__button" ${data}>${escape(label)}</button>`;
  const row = (advancement, r) => `<li class="rta-sheet-progression__row"><span class="rta-sheet-progression__name" title="${escape(t(r.label))}">${escape(t(r.label))}</span>`
    + `<span class="rta-sheet-progression__step">${escape(formatSheetValue(r.current))} → ${escape(formatSheetValue(r.next))}</span>`
    + `<span class="rta-sheet-progression__cost">${escape(formatSheetValue(r.cost))} ${escape(t(advancement.currency))}</span>`
    + (!r.buy ? "<span></span>" : r.reason ? `<span class="rta-sheet-progression__reason">${escape(t(`RTA.Sheet.Progression.Refused.${r.reason}`))}</span>`
      : button(t("RTA.Sheet.Progression.Buy"), `data-sheet-advance="${escape(advancement.id)}" data-progression="${escape(node.systemId)}" data-definition-id="${escape(r.definitionId)}" aria-label="${escape(`${t("RTA.Sheet.Progression.Buy")} · ${t(r.label)}`)}"`)) + "</li>";
  const groups = (node.advancements ?? []).map(a => `<div class="rta-sheet-progression__group"><p class="rta-sheet-progression__title"><span>${escape(t(a.label))}</span>${a.funds === null || a.funds === undefined ? "" : `<span class="rta-sheet-progression__funds">${escape(t(a.currency))} ${escape(formatSheetValue(a.funds))}</span>`}</p><ul class="rta-sheet-progression__list">${a.rows.map(r => row(a, r)).join("")}</ul></div>`);
  const milestones = node.milestones ?? [];
  if (milestones.length) groups.push(`<div class="rta-sheet-progression__group"><p class="rta-sheet-progression__title"><span>${escape(t("RTA.Sheet.Progression.Milestones"))}</span></p><ul class="rta-sheet-progression__milestones">${milestones.map(ms => `<li class="rta-sheet-progression__milestone rta-sheet-progression__milestone--${escape(ms.state)}"><i class="fa-solid ${MILESTONE_ICONS[ms.state] ?? "fa-circle"}" aria-hidden="true"></i><span>${escape(t(ms.label))}</span><span class="rta-sheet-progression__state">${escape(t(`RTA.Sheet.Progression.State.${ms.state}`))}</span></li>`).join("")}</ul>`
    + (node.apply ? button(t("RTA.Sheet.Progression.Apply"), `data-sheet-milestones="${escape(node.systemId)}"`) : "") + "</div>");
  const title = node.error ? ` title="${escape(node.error)}"` : "";
  return `<div ${attrs(node, "rta-sheet-progression")}${title}${m}>${groups.join("") || `<p class="rta-sheet-empty">${escape(t("RTA.Sheet.Progression.Nothing"))}</p>`}</div>`;
}

/** How an image block, a portrait or a token image is framed: its height, fit, shape and opacity. */
const pictureLook = node => [`--rta-sheet-image-height: ${SHEET_IMAGE_HEIGHTS[node.height] ?? SHEET_IMAGE_HEIGHTS.medium}`, `--rta-sheet-image-fit: ${node.fit === "contain" ? "contain" : "cover"}`, ...(node.style?.opacity !== undefined ? [`opacity: ${Number(node.style.opacity) / 100}`] : [])];
const pictureShape = node => ["rounded", "square", "portrait", "landscape", "circle"].includes(node.shape) ? ` rta-sheet-image--${node.shape}` : "";
/** Foundry's camera button at the bottom right of a portrait: it changes the image, only while the sheet is unlocked. */
const cameraButton = (which, t, placed = false) => {
  const label = escape(t(which === "token" ? "RTA.Sheet.EditToken" : "RTA.Sheet.EditImage"));
  return `<button type="button" class="rta-sheet-picture__edit" data-sheet-edit-image="${which}"${placed ? " data-sheet-update-placed" : ""} title="${label}" aria-label="${label}"><i class="fa-solid fa-camera" aria-hidden="true"></i></button>`;
};
/** The Document's name: a field while the sheet is unlocked, a title otherwise; a sample in the editor. */
function renderName(node, t, {edit, doc, m}) {
  const inner = edit ? `<span class="rta-sheet-name__text">${escape(t("RTA.SheetEditor.SampleName"))}</span>`
    : doc.editable && doc.unlocked ? `<input class="rta-sheet-name__input" type="text" data-sheet-name value="${escape(doc.name ?? "")}" aria-label="${escape(t("RTA.Template.Name"))}">`
      : `<h2 class="rta-sheet-name__text">${escape(doc.name ?? "")}</h2>`;
  return `<div ${attrs(node, "rta-sheet-name")}${m}>${inner}</div>`;
}
/** The figure Foundry gives an Actor without an image: the editor's portraits and token images show it. */
const SAMPLE_PICTURE = "icons/svg/mystery-man.svg";
/** The Document's portrait, or (Actor) its prototype token's image, framed like an image block; the camera changes it. */
function renderPicture(node, t, {edit, doc, m}) {
  const token = node.kind === "token", src = edit ? "" : token ? doc.token : doc.img, label = t(token ? "RTA.SheetEditor.Kind.token" : "RTA.SheetEditor.Kind.portrait");
  // In the editor: Foundry's sample figure, the block's kind on hover, so it does not read as a missing image.
  const body = src ? `<img src="${escape(src)}" alt="${escape(label)}">` : edit ? `<img src="${SAMPLE_PICTURE}" alt="${escape(label)}" title="${escape(label)}">` : `<i class="fa-solid ${token ? "fa-chess-pawn" : "fa-user"}" aria-hidden="true"></i>`;
  const camera = !edit && doc.editable && doc.unlocked ? cameraButton(token ? "token" : "img", t, token && node.updatePlaced) : "";
  return `<div ${attrs(node, `rta-sheet-image rta-sheet-picture${pictureShape(node)}${src ? "" : edit ? " rta-sheet-image--sample" : " rta-sheet-image--empty"}`, pictureLook(node))}${m}>${body}${camera}</div>`;
}

/** A notes block: its text kept on the Actor, in a field when it may be changed. A rich one is filled by the sheet
   controller (Foundry's enriched text, or its editor); here, its text without tags. */
function renderNotes(node, t, {edit, m}) {
  const label = node.label ? `<span class="rta-sheet-notes__label">${escape(t(node.label))}</span>` : "";
  const look = [`--rta-sheet-notes-height: ${LAYOUT_NOTE_HEIGHTS[node.height] ?? LAYOUT_NOTE_HEIGHTS.medium}`];
  const text = String(node.value ?? "");
  let body;
  if (edit) body = `<div class="rta-sheet-notes__text rta-sheet-notes__text--sample">${escape(t(node.format === "rich" ? "RTA.SheetEditor.NotesRichSample" : "RTA.SheetEditor.NotesSample"))}</div>`;
  else if (node.format === "rich") body = `<div class="rta-sheet-notes__text rta-sheet-notes__rich" data-sheet-note-rich="${escape(node.id)}"${node.write ? " data-sheet-note-editable" : ""}>${escape(text.replace(/<\/?(?:p|div|br|li|h[1-6]|blockquote|tr)\b[^>]*>/gi, " ").replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim())}</div>`;
  else if (node.write) body = `<textarea class="rta-sheet-notes__field" data-sheet-write="${escape(node.id)}" data-operation="set"${node.label ? ` aria-label="${escape(t(node.label))}"` : ""}>${escape(text)}</textarea>`;
  else body = `<div class="rta-sheet-notes__text">${escape(text) || "—"}</div>`;
  return `<div ${attrs(node, "rta-sheet-notes", look)}${m}>${label}${body}</div>`;
}

/** A separator: a line, a line with an ornament in its middle, or a picture. */
function renderSeparator(node, t, {edit, m}) {
  if (node.look === "image") return node.src ? `<div ${attrs(node, "rta-sheet-separator rta-sheet-separator--image")}${m}><img src="${escape(node.src)}" alt=""></div>`
    : `<div ${attrs(node, "rta-sheet-separator rta-sheet-image--empty")}${m}><i class="fa-solid fa-image"></i> ${escape(t("RTA.SheetEditor.NoImage"))}</div>`;
  return `<div ${attrs(node, `rta-sheet-separator${node.look === "ornament" ? " rta-sheet-separator--ornament" : ""}`)} role="separator"${m}>${node.look === "ornament" ? `<i class="fa-solid fa-diamond" aria-hidden="true"></i>` : ""}</div>`;
}

function renderNode(node, t, {row = null, solo = false, edit = false, editable = false, doc = {}, card = false} = {}) {
  if (!node) return "";
  const m = (card ? "" : mark(node, edit)) + (node.kind === "value" && node.error ? "" : tooltip(node, t));
  if (node.kind === "name") return renderName(node, t, {edit: edit && !card, doc, m});
  if (node.kind === "portrait" || node.kind === "token") return renderPicture(node, t, {edit: edit && !card, doc, m});
  // A click that uses an Action: on the played sheet, the label (or the picture, the text) is a button.
  const click = !edit && node.click ? node.click : null;
  if (node.kind === "value") {
    const label = node.label ? t(node.label) : node.labelKey ? t(node.labelKey) : "";
    const title = node.error ? ` title="${escape(node.error)}"` : "";
    const rolls = node.click ? " rta-sheet-roll" : "";
    // A row with a single value already says what it is: its label stays for screen readers only.
    const labelPart = click && !solo ? `<button type="button" class="rta-sheet-value__label${rolls}" ${clickData(click, row ?? click.definitionId)}${node.error ? "" : labelTip(node, label)}>${labelHTML(node, label)}</button>`
      : `<span class="rta-sheet-value__label${solo ? " rta-sheet-visually-hidden" : rolls}"${solo || node.error ? "" : labelTip(node, label)}>${solo ? escape(label) : labelHTML(node, label)}</span>`;
    // Alone in a list row, a value read and never written is what one clicks.
    const control = click && solo && !node.write ? `<button type="button" class="rta-sheet-value__text rta-sheet-roll" ${clickData(click, row ?? click.definitionId)}>${valueControl(node, t, row, edit)}</button>` : valueControl(node, t, row, edit);
    return `<div ${attrs(node, `rta-sheet-value${node.error ? " rta-sheet-value--unavailable" : ""}`)}${title}${m}><div class="rta-sheet-value__inner">${labelPart}<span class="rta-sheet-value__control">${control}</span></div></div>`;
  }
  if (node.kind === "notes") return renderNotes(node, t, {edit, m});
  if (node.kind === "separator") return renderSeparator(node, t, {edit, m});
  // In the editor a button is a plain block: some browsers never drag a button.
  if (node.kind === "action") return edit ? `<div ${attrs(node, "rta-sheet-action")}${labelTip(node, t(node.label))}${m}>${labelHTML(node, t(node.label))}</div>`
    : `<button type="button" ${attrs(node, "rta-sheet-action")} data-sheet-action="${escape(node.actionId)}"${node.definitionId ? ` data-definition-id="${escape(node.definitionId)}"` : ""}${labelTip(node, t(node.label))}${m}>${labelHTML(node, t(node.label))}</button>`;
  if (node.kind === "text") {
    const words = edit && !node.text ? escape(t("RTA.SheetEditor.EmptyText")) : textWithValues(t(node.text), node.values);
    return click ? `<p ${attrs(node, "rta-sheet-text")}${m}><button type="button" class="rta-sheet-roll" ${clickData(click, row ?? click.definitionId)}>${words}</button></p>`
      : `<p ${attrs(node, `rta-sheet-text${node.click ? " rta-sheet-roll" : ""}`)}${m}>${words}</p>`;
  }
  if (node.kind === "spacer") return `<div ${attrs(node, "rta-sheet-spacer")}${m}></div>`;
  if (node.kind === "image") {
    // A picture: a banner, a logo. In the editor, an image block without its picture yet says so.
    const look = pictureLook(node), shape = pictureShape(node);
    if (node.src && click) return `<button type="button" ${attrs(node, `rta-sheet-image rta-sheet-image--button${shape}`, look)} ${clickData(click, row ?? click.definitionId)}${m}><img src="${escape(node.src)}" alt=""></button>`;
    return node.src ? `<div ${attrs(node, `rta-sheet-image${shape}`, look)}${m}><img src="${escape(node.src)}" alt=""></div>` : edit ? `<div ${attrs(node, `rta-sheet-image rta-sheet-image--empty${shape}`, look)}${m}><i class="fa-solid fa-image"></i> ${escape(t("RTA.SheetEditor.NoImage"))}</div>` : "";
  }
  if (node.kind === "contents") return renderContents(node, t, {edit, editable, m});
  if (node.kind === "progression") return renderProgression(node, t, {edit, m});
  if (node.kind === "placeholder") return dropZone(node.parentId, t);
  // An empty container shows its own drop zone (an empty tab's, not its tabs').
  const children = (list, options, holder = node) => list.length || !edit || card ? list.map(child => renderNode(child, t, {...options, edit, editable, doc, card})).join("") : dropZone(holder.id, t);
  if (node.kind === "tabs") {
    const tabs = node.children ?? [];
    return `<div ${attrs(node, "rta-sheet-tabs")}${m}><nav class="rta-sheet-tabs__nav" role="tablist">${tabs.map((tab, i) => `<${edit ? "div" : `button type="button"`} class="rta-sheet-tabs__tab" role="tab" data-sheet-tab="${escape(tab.id)}" aria-selected="${i === 0}"${labelTip(tab, tab.label ? t(tab.label) : "")}${mark(tab, edit)}>${labelHTML(tab, tab.label ? t(tab.label) : edit ? t("RTA.SheetEditor.UntitledTab") : "")}</${edit ? "div" : "button"}>`).join("")}</nav>${tabs.map((tab, i) => `<div ${styledAttributes(tab, "rta-sheet-grid rta-sheet-tab", ["--rta-sheet-columns: 1", ...(sheetStyle(tab).gap ? [`gap: ${sheetStyle(tab).gap}`] : [])])} role="tabpanel" data-sheet-panel="${escape(tab.id)}"${i ? " hidden" : ""}${mark(tab, edit)}>${children(tab.children ?? [], {row}, tab)}</div>`).join("")}</div>`;
  }
  if (node.kind === "repeater") return renderList(node, t, edit);
  // The grid the children flow in takes the spacing; the block itself takes the rest of the style.
  // Overlaid, its blocks share one cell, one over the other, at the top, centre or bottom.
  const gap = sheetStyle(node).gap, bare = node.kind === "grid" && !node.span && !node.rowSpan && !node.width;
  const grid = [columns(node), ...(gap ? [`gap: ${gap}`] : [])], overlay = LAYOUT_OVERLAYS.includes(node.overlay) ? ` rta-sheet-grid--overlay rta-sheet-grid--overlay-${node.overlay}` : "";
  const body = `<div ${bare ? attrs(node, `rta-sheet-grid${overlay}`, grid) : `class="rta-sheet-grid${overlay}" style="${escape(grid.join("; "))}"`}${bare ? m : ""}${node.collapsible ? ` data-sheet-collapsible="${escape(node.id)}"` : ""}>${children(node.children ?? [], {row})}</div>`;
  if (node.kind === "section") {
    // Foldable: its title is a button (a plain title with the same arrow in the editor, where it stays open).
    const title = labelHTML(node, node.label ? t(node.label) : node.collapsible ? t("RTA.Sheet.Section") : "");
    const fold = node.collapsible ? (edit ? `<span class="rta-sheet-section__toggle"><i class="fa-solid fa-chevron-down" aria-hidden="true"></i>${title}</span>`
      : `<button type="button" class="rta-sheet-section__toggle" data-sheet-collapse="${escape(node.id)}" aria-expanded="true"><i class="fa-solid fa-chevron-down" aria-hidden="true"></i>${title}</button>`) : title;
    return `<section ${attrs(node, "rta-sheet-section")}${m}>${node.label || node.collapsible || labelShow(node) !== "text" ? `<h3 class="rta-sheet-section__title"${labelTip(node, t(node.label ?? ""))}>${fold}</h3>` : ""}${body}</section>`;
  }
  return bare ? body : `<div ${attrs(node, "rta-sheet-block")}${m}>${body}</div>`;
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
    ? `<div class="rta-sheet-row rta-sheet-row--head" aria-hidden="true"><span></span>${cells.map(c => `<span class="rta-sheet-row__head"${labelTip(c, cellLabel(c, t))}>${labelHTML(c, cellLabel(c, t))}</span>`).join("")}</div>`.repeat(Math.min(columnCount, rows.length)) : "";
  const style = `--rta-sheet-cells: ${cells.length + 1}; --rta-sheet-list-template: ${Array(columnCount).fill(perColumn).join(" ")}; --rta-sheet-list-medium: ${Array(Math.min(columnCount, 2)).fill(perColumn).join(" ")}; --rta-sheet-list-narrow: ${perColumn}`;
  // Each row's name uses the list's click Action on that row's Definition.
  const name = r => node.click && !edit ? `<button type="button" class="rta-sheet-row__label rta-sheet-roll" ${clickData(node.click, r.definitionId)} title="${escape(t(r.label))}">${escape(t(r.label))}</button>`
    : `<span class="rta-sheet-row__label${node.click ? " rta-sheet-roll" : ""}" title="${escape(t(r.label))}">${escape(t(r.label))}</span>`;
  const body = rows.map(r => `<div class="rta-sheet-row" data-definition-id="${escape(r.definitionId)}">${name(r)}${r.children.map(child => renderNode(child, t, {row: r.definitionId, solo: true, edit})).join("")}</div>`).join("");
  return `<div ${attrs(node, "rta-sheet-list", [style, ...(sheetStyle(node).gap ? [`row-gap: ${sheetStyle(node).gap}`] : [])])}${mark(node, edit)}>${head}${body}</div>`;
}

/** The standard header: the portrait (with Foundry's camera button while unlocked) and the name, then the sheet commands.
    In the editor (edit) a sample stands for the Document. */
function standardHeader(t, {doc = {}, edit = false, commands = ""} = {}) {
  const image = edit ? `<span class="rta-sheet__image rta-sheet__image--sample"><i class="fa-solid fa-user" aria-hidden="true"></i></span>`
    : doc.img ? `<img class="rta-sheet__image" src="${escape(doc.img)}" alt="">` : "";
  const camera = !edit && doc.editable && doc.unlocked ? cameraButton("img", t) : "";
  const name = edit ? `<h2 class="rta-sheet__name">${escape(t("RTA.SheetEditor.SampleName"))}</h2>`
    : doc.editable && doc.unlocked ? `<input class="rta-sheet__name" type="text" data-sheet-name value="${escape(doc.name ?? "")}" aria-label="${escape(t("RTA.Template.Name"))}">`
      : `<h2 class="rta-sheet__name">${escape(doc.name ?? "")}</h2>`;
  return `<header class="rta-sheet__header">${image || camera ? `<div class="rta-sheet__portrait">${image}${camera}</div>` : ""}${name}${commands}</header>`;
}

/** class and style of the sheet's element: its theme's class and overrides (configurator/sheet-themes.mjs). */
function themed(view, base) {
  const {classes, css} = sheetThemeAttributes(view?.theme);
  return `class="${[base, ...classes].join(" ")}"${css.length ? ` style="${escape(css.join("; "))}"` : ""}`;
}

/** The editor's canvas: the sheet as players get it, every node selectable; the standard header (when the sheet has it) as a sample. */
export function renderLayoutPreviewHTML(view, {t = key => key, selectedId = null} = {}) {
  const header = view?.header === "none" ? "" : standardHeader(t, {edit: true});
  const html = `<div ${themed(view, "rta-sheet rta-sheet--edit")}>${header}<div class="rta-sheet__body">${renderNode(view?.root, t, {edit: true})}</div></div>`;
  return selectedId ? html.replaceAll(`data-layout-node="${escape(selectedId)}"`, `data-layout-node="${escape(selectedId)}" data-layout-selected`) : html;
}

/** The whole sheet: header (image and name, unless the sheet places them itself), then the layout. notice: a message shown instead of the layout.
    editable: the user may change the Document; unlocked: its lock is open (name and images can be changed). token: its prototype token's image. */
export function renderSheetHTML(view, {t = key => key, name = "", img = "", token = "", editable = false, unlocked = false, notice = "", noticeActions = [], headerActions = []} = {}) {
  const doc = {name, img, token, editable, unlocked};
  const commands = headerActions.map(action => `<button type="button" class="rta-sheet__command" data-sheet-command="${escape(action.command)}"><i class="fa-solid ${escape(action.icon ?? "fa-wand-magic-sparkles")}"></i> ${escape(action.label)}</button>`).join("");
  // Without the standard header, the commands keep a row of their own.
  const header = notice || view?.header !== "none" ? standardHeader(t, {doc, commands}) : commands ? `<header class="rta-sheet__header rta-sheet__header--commands">${commands}</header>` : "";
  const body = notice
    ? `<div class="rta-sheet-notice"><p>${escape(notice)}</p>${noticeActions.length ? `<div class="rta-sheet-notice__actions">${noticeActions.map((action, i) => `<button type="button"${i ? "" : ' class="rta-sheet-notice__primary"'} data-sheet-command="${escape(action.command)}">${escape(action.label)}</button>`).join("")}</div>` : ""}</div>`
    : renderNode(view?.root, t, {editable, doc});
  return `<div ${themed(view, "rta-sheet")} data-sheet-id="${escape(view?.sheetId ?? "")}">${header}<div class="rta-sheet__body">${body}</div></div>`;
}

/** The chat card of an Action used from a sheet. summary: {title, actor, lines: [{label, value}], outcome}. */
export function renderActionChatHTML({title, actor = "", lines = [], outcome = "", buttons = []}) {
  return `<div class="rta-chat-card"><header class="rta-chat-card__title"><strong>${escape(title)}</strong>${actor ? `<span>${escape(actor)}</span>` : ""}</header>${lines.length ? `<dl class="rta-chat-card__lines">${lines.map(line => `<dt>${escape(line.label)}</dt><dd>${escape(line.value)}</dd>`).join("")}</dl>` : ""}${outcome ? `<p class="rta-chat-card__outcome">${escape(outcome)}</p>` : ""}${buttons.length ? `<footer class="rta-chat-card__buttons">${buttons.map(button => `<button type="button" data-rta-chat-action="${escape(button.index)}" data-who="${escape(button.who)}">${escape(button.label)}</button>`).join("")}</footer>` : ""}</div>`;
}
