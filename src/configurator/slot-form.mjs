/* Definition editor <-> Definition.slots (pool and collection slots, CP-26/27).
   Context building is pure; collection reads the rendered slot cards. */
import {COLLECTION_ENTRY_MODES, POOL_BOUND_POLICIES, POOL_MAXIMUM_POLICIES} from "./capability-slots.mjs";
import {valueTypeChoices, valueTypeLabel} from "./entry-field-models.mjs";

const SOURCE_KINDS = ["none", "literal", "formula"];

function sourceModel(source, formulas, {optional = false, neutral = ""} = {}) {
  const kind = source && Object.hasOwn(source, "formulaRef") ? "formula" : source && Object.hasOwn(source, "literal") ? "literal" : optional ? "none" : "literal";
  return {
    kinds: SOURCE_KINDS.filter(id => optional || id !== "none").map(id => ({id, selected: id === kind, labelKey: `RTA.Slots.Source.${id}`, colors: neutral})),
    isLiteral: kind === "literal", isFormula: kind === "formula",
    literal: source?.literal ?? "",
    formulas: formulas.map(formula => ({...formula.choice, selected: formula.id === source?.formulaRef}))
  };
}

const options = (ids, selected, prefix, neutral) => ids.map(id => ({id, selected: id === selected, labelKey: prefix ? `${prefix}.${id}` : id, colors: neutral}));

/** Template rows for one Definition; `blank` rows feed the hidden templates used by "Add". */
/** colorsOf(kind, entry) gives an option's color hook; fixed engine options use `neutral`. */
export function buildSlotFormContext({definition = {}, permittedCapabilities = [], formulas = [], contentTypes = [], valueTypes = [], colorsOf = () => "", neutral = ""} = {}) {
  formulas = formulas.map(formula => ({id: formula.id, choice: {id: formula.id, label: formula.nameKey || formula.id, colors: colorsOf("formula", formula)}}));
  const poolRow = slot => ({
    id: slot.id ?? "", name: slot.name ?? "",
    maximumPolicies: options(POOL_MAXIMUM_POLICIES, slot.maximumPolicy ?? "keepMissing", "RTA.Slots.MaximumPolicy", neutral),
    minimum: sourceModel(slot.minimum, formulas, {neutral}), maximum: sourceModel(slot.maximum, formulas, {neutral}), initial: sourceModel(slot.initial, formulas, {optional: true, neutral}),
    valueTypes: valueTypeChoices(["number", "integer"], slot.valueType ?? "number", {colors: neutral}),
    underflow: options(POOL_BOUND_POLICIES, slot.underflowPolicy ?? "clamp", "RTA.Slots.Policy", neutral), overflow: options(POOL_BOUND_POLICIES, slot.overflowPolicy ?? "clamp", "RTA.Slots.Policy", neutral)
  });
  const collectionRow = slot => ({
    id: slot.id ?? "",
    entryModes: options(COLLECTION_ENTRY_MODES, slot.entryMode ?? "owned", "RTA.Slots.Mode", neutral), isValueMode: slot.entryMode === "value",
    contentKinds: contentTypes.map(type => ({id: type.id, label: type.nameKey || type.id, colors: colorsOf("contentType", type), selected: (slot.allowedKinds ?? []).includes(type.id)})),
    valueKinds: valueTypes.map(type => ({id: type.id, label: valueTypeLabel(type.id), colors: neutral, selected: (slot.allowedKinds ?? []).includes(type.id)})),
    minimumEntries: slot.minimumEntries ?? "", maximumEntries: slot.maximumEntries ?? "",
    capacity: formulas.map(formula => ({...formula.choice, selected: formula.id === slot.capacityFormulaRef})),
    unique: slot.unique === true
  });
  return {
    showPools: permittedCapabilities.includes("pool"),
    showCollections: permittedCapabilities.includes("collection"),
    poolRows: (definition.slots?.pool ?? []).map(poolRow), blankPool: poolRow({}),
    collectionRows: (definition.slots?.collection ?? []).map(collectionRow), blankCollection: collectionRow({})
  };
}

function readSource(card, bound) {
  const box = card.querySelector(`[data-slot-source="${bound}"]`);
  if (!box) return undefined;
  const kind = box.querySelector("[data-source-kind]")?.value ?? "literal";
  if (kind === "none") return undefined;
  if (kind === "formula") return {formulaRef: String(box.querySelector("[data-source-formula]")?.value ?? "")};
  const raw = String(box.querySelector("[data-source-literal]")?.value ?? "").trim();
  if (!raw) return null; // left empty: an incomplete draft, reported by validation
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new Error(`${bound} must be a number.`);
  return {literal: value};
}

const optionalCount = (card, prop) => {
  const raw = String(card.querySelector(`[data-slot-prop="${prop}"]`)?.value ?? "").trim();
  if (!raw) return undefined;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${prop} must be a non-negative integer.`);
  return value;
};

/** Read the slot cards. Unexposed slot properties (order, presentationRole) are preserved. */
export function collectDefinitionSlots(queryAll, current = {}) {
  const previous = capability => new Map((current.slots?.[capability] ?? []).map(slot => [slot.id, slot]));
  const slots = {};
  const pools = previous("pool"), collections = previous("collection");
  for (const card of queryAll("[data-slot-card=pool]")) {
    const id = String(card.querySelector('[data-slot-prop="id"]')?.value ?? "").trim();
    const slot = {...(pools.get(card.dataset.slotOriginal) ?? {}), id,
      valueType: card.querySelector('[data-slot-prop="valueType"]')?.value ?? "number",
      underflowPolicy: card.querySelector('[data-slot-prop="underflowPolicy"]')?.value ?? "clamp",
      overflowPolicy: card.querySelector('[data-slot-prop="overflowPolicy"]')?.value ?? "clamp",
      maximumPolicy: card.querySelector('[data-slot-prop="maximumPolicy"]')?.value ?? "keepMissing"};
    const name = String(card.querySelector('[data-slot-prop="name"]')?.value ?? "").trim();
    if (name) slot.name = name; else delete slot.name;
    for (const bound of ["minimum", "maximum", "initial"]) {
      const source = readSource(card, bound);
      if (source === undefined || source === null) delete slot[bound]; else slot[bound] = source;
    }
    (slots.pool ??= []).push(slot);
  }
  for (const card of queryAll("[data-slot-card=collection]")) {
    const id = String(card.querySelector('[data-slot-prop="id"]')?.value ?? "").trim();
    const entryMode = card.querySelector('[data-slot-prop="entryMode"]')?.value ?? "owned";
    const kindName = entryMode === "value" ? "slotValueKind" : "slotContentKind";
    const slot = {...(collections.get(card.dataset.slotOriginal) ?? {}), id, entryMode,
      allowedKinds: [...card.querySelectorAll(`[data-slot-kind="${kindName}"]:checked`)].map(input => input.value),
      unique: card.querySelector('[data-slot-prop="unique"]')?.checked === true};
    for (const prop of ["minimumEntries", "maximumEntries"]) { const value = optionalCount(card, prop); if (value === undefined) delete slot[prop]; else slot[prop] = value; }
    const capacity = String(card.querySelector('[data-slot-prop="capacityFormulaRef"]')?.value ?? "");
    if (capacity) slot.capacityFormulaRef = capacity; else delete slot.capacityFormulaRef;
    (slots.collection ??= []).push(slot);
  }
  return slots;
}

/** The minimum and maximum of a value's base: on a type, for all its Definitions; on a Definition, a bound left
    empty is its type's. */
export function valueBoundsContext(entry = {}, {formulas = [], colorsOf = () => "", neutral = "", ofType = false} = {}) {
  formulas = formulas.map(formula => ({id: formula.id, choice: {id: formula.id, label: formula.nameKey || formula.id, colors: colorsOf("formula", formula)}}));
  const model = source => {
    const bound = sourceModel(source, formulas, {optional: true, neutral});
    if (!ofType) bound.kinds = bound.kinds.map(kind => kind.id === "none" ? {...kind, labelKey: "RTA.ValueBounds.OfType"} : kind);
    return bound;
  };
  return {minimum: model(entry.valueBounds?.minimum), maximum: model(entry.valueBounds?.maximum)};
}

/** Read the value bounds of a Definition or type editor; null when none is set. */
export function collectValueBounds(root) {
  const bounds = {};
  for (const [bound, box] of [["minimum", "valueMinimum"], ["maximum", "valueMaximum"]]) {
    const source = readSource(root, box);
    if (source) bounds[bound] = source;
  }
  return Object.keys(bounds).length ? bounds : null;
}

/** Show only the input matching the chosen ValueSource kind. */
export function syncValueSource(select) {
  const box = select.closest("[data-slot-source]");
  if (!box) return;
  // The boxes, not the controls: RTASelect replaces a native select with its own widget.
  box.querySelector('[data-source-box="literal"]')?.toggleAttribute("hidden", select.value !== "literal");
  box.querySelector('[data-source-box="formula"]')?.toggleAttribute("hidden", select.value !== "formula");
}

/** Show the allowed-kind list that matches the collection's entry mode. */
export function syncEntryMode(select) {
  const card = select.closest("[data-slot-card=collection]");
  if (!card) return;
  card.querySelector("[data-slot-kinds=content]")?.toggleAttribute("hidden", select.value === "value");
  card.querySelector("[data-slot-kinds=value]")?.toggleAttribute("hidden", select.value !== "value");
}
