/* Editor context and collection for the card lists of rule entries
   (Roll variants, ...). Context building is pure; collection reads the cards. */
import {collectCards, choicesFor, cardInteger} from "./card-form.mjs";
import {parseTypedText} from "./test-input-form.mjs";
import {refToken, parseRefToken} from "./reference-token.mjs";

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

/** Test: one card per extra roll (a Condition, the Roll thrown, added or taken away). */
export function extraRollContext(data, {conditions = [], rolls = [], withColors, neutral = ""}) {
  const conditionChoices = named("condition", conditions, withColors), rollChoices = named("roll", rolls, withColors);
  const row = (extra = {}) => ({conditions: choicesFor(conditionChoices, extra.conditionRef ?? ""), rolls: choicesFor(rollChoices, extra.rollRef ?? ""),
    operations: ["add", "subtract"].map(id => ({id, labelKey: id === "add" ? "RTA.Test.ExtraAdd" : "RTA.Test.ExtraSubtract", colors: neutral, selected: id === (extra.operation ?? "add")}))});
  return {extraRolls: {rows: (data.extraRolls ?? []).map(row), blank: row()}};
}
export function collectExtraRolls(queryAll) {
  return collectCards(queryAll, "extraRoll").map(card => ({conditionRef: card.conditionRef ?? "", rollRef: card.rollRef ?? "", operation: card.operation || "add"}));
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
      sources: ["auto", "held", "all", "unheld"].map(id => ({id, colors: neutral, labelKey: `RTA.ActionInput.Sources.${id}`, selected: id === (input.from ?? "auto")})),
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
    if (valueType === "reference") { input.definitionTypeId = card.definitionTypeId || null; input.from = card.from || "auto"; }
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

/** Progression: advancement cards (what is raised, paid with what, at which cost) and milestone cards
 * (a Condition, the Definitions granted, an Action). currencies: {token, label, colors} of writable outputs. */
export function progressionContext(data, {definitionTypes = [], definitions = [], currencies = [], formulas = [], conditions = [], actions = [], withColors, none = "—"}) {
  const types = named("definitionType", definitionTypes, withColors), defs = named("definition", definitions, withColors);
  const formulaChoices = named("formula", formulas, withColors), conditionChoices = named("condition", conditions, withColors), actionChoices = named("action", actions, withColors);
  const many = (list, ids = []) => list.map(choice => ({...choice, selected: ids.includes(choice.id)}));
  const advancement = (entry = {}) => ({
    id: entry.id ?? "", labelKey: entry.labelKey ?? "", step: entry.step ?? 1, none,
    definitionTypes: choicesFor(types, entry.definitionTypeId ?? ""), definitions: many(defs, entry.definitionIds),
    currencies: currencies.map(choice => ({...choice, selected: choice.token === (entry.currencyRef ? refToken(entry.currencyRef) : "")})),
    costFormulas: choicesFor(formulaChoices, entry.costFormulaRef ?? ""), maximumFormulas: choicesFor(formulaChoices, entry.maximumFormulaRef ?? ""),
    conditions: choicesFor(conditionChoices, entry.conditionRef ?? "")
  });
  const milestone = (entry = {}) => ({
    id: entry.id ?? "", labelKey: entry.labelKey ?? "", none,
    conditions: choicesFor(conditionChoices, entry.conditionRef ?? ""), definitions: many(defs, entry.definitionIds), actions: choicesFor(actionChoices, entry.actionRef ?? "")
  });
  return {advancementCards: {rows: (data.advancements ?? []).map(advancement), blank: advancement()}, milestoneCards: {rows: (data.milestones ?? []).map(milestone), blank: milestone()}};
}
export function collectProgression(queryAll) {
  const ids = list => { const used = new Set(list.map(card => card.id).filter(Boolean)); let n = 1; return prefix => { while (used.has(`${prefix}-${n}`)) n++; used.add(`${prefix}-${n}`); return `${prefix}-${n}`; }; };
  const advancementCards = collectCards(queryAll, "advancement"), milestoneCards = collectCards(queryAll, "milestone");
  const advancementId = ids(advancementCards), milestoneId = ids(milestoneCards);
  return {
    advancements: advancementCards.map((card, index) => {
      const step = Number(card.step || 1);
      if (!Number.isFinite(step) || step === 0) throw new Error(`Advancement ${card.labelKey || index + 1}: the step must be a number other than 0.`);
      return {id: card.id || advancementId("advancement"), labelKey: card.labelKey ?? "", definitionTypeId: card.definitionTypeId || null, definitionIds: card.definitionIds ?? [],
        currencyRef: card.currencyRef ? parseRefToken(card.currencyRef) : null, costFormulaRef: card.costFormulaRef || null, step,
        maximumFormulaRef: card.maximumFormulaRef || null, conditionRef: card.conditionRef || null};
    }),
    milestones: milestoneCards.map(card => ({id: card.id || milestoneId("milestone"), labelKey: card.labelKey ?? "", conditionRef: card.conditionRef || null, definitionIds: card.definitionIds ?? [], actionRef: card.actionRef || null}))
  };
}

/** Scale: one card per row, a range (an empty bound is open) and the words shown for it. */
export function scaleRowContext(data) {
  const row = (entry = {}) => ({id: entry.id ?? "", labelKey: entry.labelKey ?? "", min: entry.min ?? "", max: entry.max ?? ""});
  return {scaleRows: {rows: (data.rows ?? []).map(row), blank: row()}};
}
export function collectScaleRows(queryAll) {
  const cards = collectCards(queryAll, "scaleRow"), used = new Set(cards.map(card => card.id).filter(Boolean));
  let next = 1;
  const freshId = () => { while (used.has(`row-${next}`)) next++; used.add(`row-${next}`); return `row-${next}`; };
  const bound = (value, label) => {
    const text = String(value ?? "").trim().replace(",", ".");
    if (text === "") return null;
    const number = Number(text);
    if (!Number.isFinite(number)) throw new Error(`${label} must be a number.`);
    return number;
  };
  return cards.map((card, index) => {
    const label = `Row ${card.labelKey || index + 1}`;
    return {id: card.id || freshId(), labelKey: String(card.labelKey ?? "").trim(), min: bound(card.min, `${label} minimum`), max: bound(card.max, `${label} maximum`)};
  });
}

/** Action: one card per button of its chat card (an Action, and who presses it). */
export const CHAT_ACTION_WHO = Object.freeze(["self", "target", "gm"]);
export function chatActionContext(data, {actions = [], withColors, neutral = ""}) {
  const choices = named("action", actions.filter(action => action.id !== data.id), withColors);
  const row = (button = {}) => ({actions: choicesFor(choices, button.actionRef ?? ""),
    who: CHAT_ACTION_WHO.map(id => ({id, labelKey: `RTA.ChatAction.Who.${id}`, colors: neutral, selected: id === (button.who ?? "self")}))});
  return {chatActions: {rows: (data.chatActions ?? []).map(row), blank: row()}};
}
export function collectChatActions(queryAll) {
  return collectCards(queryAll, "chatAction").map(card => ({actionRef: card.actionRef ?? "", who: card.who || "self"}));
}
