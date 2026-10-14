/* Test editor <-> TestDefinition.inputBindings (CP-29). Context building is
   pure; collection reads the rendered input cards. */
import {refToken, parseRefToken} from "./reference-token.mjs";
import {valueTypeChoices} from "./entry-field-models.mjs";

/** Value types a Test input can take from the editor (scalars). */
export const TEST_INPUT_VALUE_TYPES = Object.freeze(["number", "integer", "boolean", "string"]);
const SOURCE_KINDS = ["literal", "formula", "reference"];

const sourceKind = source => source && Object.hasOwn(source, "formulaRef") ? "formula" : source && Object.hasOwn(source, "reference") ? "reference" : "literal";
const show = value => value === undefined || value === null ? "" : String(value);

/** One row per input; `blank` feeds the hidden template used by "Add". */
export function buildTestInputContext({inputs = [], formulas = [], references = [], neutral = ""} = {}) {
  const row = (input = {}) => {
    const kind = sourceKind(input.source), token = kind === "reference" ? refToken(input.source.reference ?? {}) : "";
    return {
      id: input.id ?? "",
      valueTypes: valueTypeChoices(TEST_INPUT_VALUE_TYPES, input.valueType ?? "number", {colors: neutral}),
      sourceKinds: SOURCE_KINDS.map(id => ({id, colors: neutral, labelKey: `RTA.TestInput.Sources.${id}`, selected: id === kind})),
      isLiteral: kind === "literal", isFormula: kind === "formula", isReference: kind === "reference",
      literal: kind === "literal" ? show(input.source?.literal) : "",
      formulas: formulas.map(formula => ({...formula, selected: kind === "formula" && formula.id === input.source.formulaRef})),
      references: references.map(reference => ({...reference, selected: kind === "reference" && reference.token === token})),
      required: input.required !== false,
      defaultValue: show(input.defaultValue)
    };
  };
  return {rows: inputs.map(row), blank: row()};
}

/** Typed value from a text field; "" stays undefined. */
export function parseTypedText(valueType, raw, label) {
  const text = String(raw ?? "").trim();
  if (text === "") return undefined;
  if (valueType === "string") return text;
  if (valueType === "boolean") {
    if (text === "true" || text === "false") return text === "true";
    throw new Error(`${label} must be true or false.`);
  }
  const value = Number(text);
  if (!Number.isFinite(value) || (valueType === "integer" && !Number.isSafeInteger(value))) throw new Error(`${label} must be ${valueType === "integer" ? "an integer" : "a number"}.`);
  return value;
}

/** Read the input cards in order. */
export function collectTestInputs(queryAll) {
  return [...queryAll("[data-test-input]")].map((card, index) => {
    const read = name => card.querySelector(`[data-input-prop="${name}"]`);
    const id = String(read("id")?.value ?? "").trim(), valueType = read("valueType")?.value ?? "number", kind = read("sourceKind")?.value ?? "literal";
    const label = `Input ${id || index + 1}`;
    let source;
    if (kind === "formula") source = {formulaRef: String(read("formulaRef")?.value ?? "")};
    else if (kind === "reference") source = {reference: parseRefToken(read("reference")?.value ?? "")};
    else source = {literal: parseTypedText(valueType, read("literal")?.value, `${label} value`) ?? (valueType === "string" ? "" : valueType === "boolean" ? false : 0)};
    const input = {id, valueType, source, required: read("required")?.checked !== false};
    const defaultValue = parseTypedText(valueType, read("defaultValue")?.value, `${label} default`);
    if (defaultValue !== undefined) input.defaultValue = defaultValue;
    return input;
  });
}

/** Show only the control matching the chosen source kind. */
export function syncTestInputSource(select) {
  const card = select.closest("[data-test-input]");
  if (!card) return;
  for (const box of card.querySelectorAll("[data-input-source-box]")) box.toggleAttribute("hidden", box.dataset.inputSourceBox !== select.value);
}
