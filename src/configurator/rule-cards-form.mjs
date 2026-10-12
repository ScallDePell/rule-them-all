/* Editor context and collection for the card lists of rule entries
   (Roll variants, ...). Context building is pure; collection reads the cards. */
import {collectCards, choicesFor, cardInteger} from "./card-form.mjs";
import {parseTypedText} from "./test-input-form.mjs";

const named = (kind, entries, withColors) => entries.map(entry => ({id: entry.id, label: entry.nameKey, ...withColors(kind, entry)}));

/** Roll: one card per variant (a Condition and the dice thrown while it is true). */
export function rollVariantContext(data, {conditions = [], withColors}) {
  const choices = named("condition", conditions, withColors);
  const row = (variant = {}) => ({conditions: choicesFor(choices, variant.conditionRef ?? ""), formula: variant.formula ?? ""});
  return {rollVariants: {rows: (data.variants ?? []).map(row), blank: row()}};
}
export function collectRollVariants(queryAll) {
  return collectCards(queryAll, "rollVariant").map(card => ({conditionRef: card.conditionRef ?? "", formula: card.formula ?? ""}));
}

/** Action: one card per input chosen when the Action is used. Options are written one per line, "value = label". */
export const ACTION_INPUT_EDITOR_TYPES = Object.freeze(["number", "integer", "boolean", "string", "reference"]);
const show = value => value === undefined || value === null ? "" : typeof value === "object" ? String(value.objectId ?? "") : String(value);
export function actionInputContext(data, {definitionTypes = [], withColors, neutral = ""}) {
  const types = named("definitionType", definitionTypes, withColors);
  const row = (input = {}) => {
    const valueType = input.valueType ?? "number";
    return {
      id: input.id ?? "", labelKey: input.labelKey ?? "", required: input.required !== false, defaultValue: show(input.defaultValue),
      valueTypes: ACTION_INPUT_EDITOR_TYPES.map(id => ({id, colors: neutral, labelKey: `RTA.ActionInput.Types.${id}`, selected: id === valueType})),
      definitionTypes: choicesFor(types, input.definitionTypeId ?? ""),
      optionsText: (input.options ?? []).map(option => option.labelKey ? `${show(option.value)} = ${option.labelKey}` : show(option.value)).join("\n"),
      isReference: valueType === "reference", hasOptions: ["number", "integer", "string"].includes(valueType)
    };
  };
  return {actionInputs: {rows: (data.inputs ?? []).map(row), blank: row()}};
}
export function collectActionInputs(queryAll) {
  return collectCards(queryAll, "actionInput").map((card, index) => {
    const valueType = card.valueType || "number", label = `Input ${card.id || index + 1}`;
    const input = {id: card.id ?? "", labelKey: card.labelKey ?? "", valueType, required: card.required !== false};
    if (valueType === "reference") input.definitionTypeId = card.definitionTypeId || null;
    else if (valueType !== "boolean") input.options = String(card.options ?? "").split(/\r?\n/).map(line => line.trim()).filter(Boolean).map(line => {
      const at = line.indexOf("="), value = at < 0 ? line : line.slice(0, at).trim(), labelKey = at < 0 ? "" : line.slice(at + 1).trim();
      return {value: parseTypedText(valueType, value, `${label} option`), labelKey};
    });
    const fallback = valueType === "reference" ? (card.defaultValue || undefined) : parseTypedText(valueType, card.defaultValue, `${label} default`);
    if (fallback !== undefined) input.defaultValue = fallback;
    return input;
  });
}

/** Table: one card per row, a range of totals (an empty bound is open) and the Actions it runs. */
export function tableRowContext(data, {actions = [], withColors}) {
  const choices = named("action", actions, withColors);
  const row = (entry = {}) => ({
    id: entry.id ?? "", labelKey: entry.labelKey ?? "", min: entry.min ?? "", max: entry.max ?? "",
    actions: choices.map(choice => ({...choice, selected: (entry.actionRefs ?? []).includes(choice.id)}))
  });
  return {tableRows: {rows: (data.rows ?? []).map(row), blank: row()}};
}
export function collectTableRows(queryAll) {
  const cards = collectCards(queryAll, "tableRow"), used = new Set(cards.map(card => card.id).filter(Boolean));
  let next = 1;
  const freshId = () => { while (used.has(`row-${next}`)) next++; used.add(`row-${next}`); return `row-${next}`; };
  return cards.map((card, index) => {
    const label = `Row ${card.labelKey || index + 1}`;
    return {id: card.id || freshId(), labelKey: card.labelKey ?? "", min: cardInteger(card.min, `${label} minimum`), max: cardInteger(card.max, `${label} maximum`), actionRefs: card.actionRefs ?? []};
  });
}
