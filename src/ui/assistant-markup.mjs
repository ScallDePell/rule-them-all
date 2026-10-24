import {escapeHTML as escape} from "./html-utils.mjs";
/** Pure HTML of the assistant's form and preview, from the models of src/configurator/assistant-view.mjs.
 * Every control carries data-answer="<path>" and data-answer-kind: the window reads the answers back from them.
 * words: {choose, none, add, remove, existing, enable, id, errors, created, reused, added, filled, warnings, nothing, open}. */

const attr = (name, value) => value === undefined || value === null || value === "" ? "" : ` ${name}="${escape(value)}"`;
const option = o => `<option value="${escape(o.value)}"${o.selected ? " selected" : ""}>${escape(o.label)}</option>`;
const errorLine = field => `<p class="rta-assistant__error" data-answer-error="${escape(field.path)}"${field.error ? "" : " hidden"}>${escape(field.error)}</p>`;
const row = (field, control, extra = "") => `<div class="form-group rta-assistant__field${field.error ? " is-invalid" : ""}" data-answer-field="${escape(field.path)}"><label>${escape(field.label)}</label><div class="form-fields">${control}</div>${errorLine(field)}${extra}</div>`;

function fieldHTML(field, words, expressionHTML) {
  const data = `data-answer="${escape(field.path)}" data-answer-kind="${escape(field.kind)}"`;
  switch (field.kind) {
    case "name": {
      // A name whose id other rules read also asks for that id (left empty, it comes from the name).
      const id = field.id === undefined ? "" : `<input type="text" class="rta-assistant__id" data-answer="${escape(field.path)}" data-answer-kind="nameId" value="${escape(field.id)}" placeholder="${escape(words.id)}" title="${escape(words.id)}" autocomplete="off">`;
      return row(field, `<input type="text" ${data} value="${escape(field.value)}" autocomplete="off">${id}`);
    }
    case "text": case "dice":
      return row(field, `<input type="text" ${data} value="${escape(field.value)}" autocomplete="off">`);
    case "number": case "integer":
      return row(field, `<input type="number" ${data} value="${escape(field.value)}" step="${field.step}"${attr("min", field.min)}${attr("max", field.max)}>`);
    case "boolean":
      return row(field, `<input type="checkbox" ${data}${field.checked ? " checked" : ""}>`);
    case "choice": case "event":
      return row(field, `<select ${data}>${field.required && field.options.some(o => o.selected) ? "" : `<option value="">${escape(field.required ? words.choose : words.none)}</option>`}${field.options.map(option).join("")}</select>`);
    case "entries":
      return row(field, `<select multiple ${data}>${field.options.map(option).join("")}</select>`);
    case "entry": {
      const chosen = field.options.some(o => o.selected) || field.create?.selected;
      const select = `<select ${data}>${chosen && field.required ? "" : `<option value="">${escape(field.required ? words.choose : words.none)}</option>`}${field.options.length ? `<optgroup label="${escape(words.existing)}">${field.options.map(option).join("")}</optgroup>` : ""}${field.create ? option(field.create) : ""}</select>`;
      const sub = field.sub ? `<fieldset class="rta-assistant__sub">${fieldsHTML(field.sub, words, expressionHTML)}</fieldset>` : "";
      return row(field, select, sub);
    }
    case "formula": case "condition": {
      const toggle = field.required ? "" : `<label class="checkbox"><input type="checkbox" data-answer-toggle="${escape(field.path)}"${field.enabled ? " checked" : ""}> ${escape(words.enable)}</label>`;
      const builder = field.enabled ? `<div class="rta-rule-builder rta-assistant__builder" data-supported="true" data-expr-editor="${escape(field.kind)}" ${data}>${expressionHTML(field)}</div>` : "";
      return `<div class="rta-assistant__field rta-assistant__field--expression${field.error ? " is-invalid" : ""}" data-answer-field="${escape(field.path)}"><div class="rta-assistant__expression-head"><strong>${escape(field.label)}</strong>${toggle}</div>${builder}${errorLine(field)}</div>`;
    }
    case "list": {
      const rows = field.rows.map((item, i) => `<div class="rta-assistant__row" data-answer-row="${escape(item.path)}"><span class="rta-assistant__row-number">${i + 1}</span><div class="rta-assistant__row-fields">${fieldsHTML(item.fields, words, expressionHTML)}</div>${item.removable ? `<button type="button" class="rta-config-action" data-action="removeRow" data-row="${escape(item.path)}" title="${escape(words.remove)}" aria-label="${escape(words.remove)}"><i class="fa-solid fa-trash"></i></button>` : "<span></span>"}</div>`).join("");
      return `<fieldset class="rta-assistant__list${field.error ? " is-invalid" : ""}" data-answer-field="${escape(field.path)}" data-answer-list="${escape(field.path)}"><legend>${escape(field.label)}</legend>${rows}<button type="button" data-action="addRow" data-list="${escape(field.path)}"><i class="fa-solid fa-plus"></i> ${escape(words.add)}</button>${errorLine(field)}</fieldset>`;
    }
    default: return "";
  }
}
/** The controls of a list of fields. expressionHTML(field) gives the Formula or Condition builder of a field. */
export const fieldsHTML = (fields, words, expressionHTML) => fields.map(field => fieldHTML(field, words, expressionHTML)).join("");

const list = (title, items, line, icon) => items.length ? `<section class="rta-assistant__preview-group" data-preview-group="${icon}"><h4><i class="fa-solid ${icon}" aria-hidden="true"></i> ${escape(title)} (${items.length})</h4><ul>${items.map(item => `<li>${line(item)}</li>`).join("")}</ul></section>` : "";
const typed = item => `<strong>${escape(item.name)}</strong>${item.type ? ` <small>${escape(item.type)}</small>` : ""}`;
/** The preview of a plan; with open, each created entry is a link to its editor. */
export function previewHTML(preview, words, {open = false} = {}) {
  const created = item => open && item.kind ? `<button type="button" class="rta-assistant__link" data-action="openEntry" data-kind="${escape(item.kind)}" data-entry-id="${escape(item.id)}">${typed(item)} <i class="fa-solid fa-arrow-up-right-from-square" aria-hidden="true"></i></button>` : typed(item);
  const body = list(words.errors, preview.errors ?? [], item => `${item.label ? `<strong>${escape(item.label)}</strong> ` : ""}${escape(item.message)}`, "fa-triangle-exclamation")
    + list(words.created, preview.created, created, "fa-plus")
    + list(words.reused, preview.reused, typed, "fa-link")
    + list(words.added, preview.added, item => `<strong>${escape(item.name)}</strong> · ${escape(item.field)} +${escape(item.count)}`, "fa-list-ul")
    + list(words.filled, preview.filled, item => `${item.name ? `<strong>${escape(item.name)}</strong> · ` : ""}${escape(item.field)}`, "fa-pen")
    + list(words.warnings, preview.warnings, item => escape(item), "fa-circle-exclamation");
  return body || `<p class="hint">${escape(words.nothing)}</p>`;
}
