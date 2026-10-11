/* Capability slots (CP-07, CP-26, CP-27). A Definition with the `pool` or
   `collection` capability declares zero, one or several local slots under
   Definition.slots[capabilityId]. A Reference to one of their outputs names
   the slot: {capabilityId:"pool", slotId:"hp", outputId:"pool.current"}.
   Initial runtime values are keyed "<capabilityId>.<slotId>.<field>". */
import {copyJSON, isRecord} from "./configurator-schema.mjs";
import {valueTypeRegistry} from "./value-type-registry.mjs";
import {need} from "./diagnostics.mjs";

export const SLOT_CAPABILITIES = Object.freeze(["pool", "collection"]);
export const POOL_BOUND_POLICIES = Object.freeze(["clamp", "reject", "allow"]);
export const POOL_VALUE_TYPES = Object.freeze(["number", "integer"]);
export const COLLECTION_ENTRY_MODES = Object.freeze(["owned", "reference", "value"]);
export const COLLECTION_ORDERINGS = Object.freeze(["insertion", "manual"]);
const SLOT_ID = /^[A-Za-z][A-Za-z0-9_-]*$/;
const nonempty = value => typeof value === "string" && value.trim().length > 0;
const optionalInteger = value => value === undefined || value === null || (Number.isSafeInteger(value) && value >= 0);

function onlyFields(entry, allowed, label) {
  for (const key of Object.keys(entry)) if (!allowed.includes(key)) throw new Error(`${label} contains unsupported field: ${key}.`);
}

/** ValueSource: exactly one of {literal} or {formulaRef}; no implicit precedence. */
export function prepareValueSource(source, label, options = {}, {required = true} = {}) {
  if (source === undefined || source === null) {
    need(!required, `${label} requires a literal or a Formula.`, options);
    return null;
  }
  if (!isRecord(source)) throw new Error(`${label} must be {literal} or {formulaRef}.`);
  onlyFields(source, ["literal", "formulaRef"], label);
  const hasLiteral = Object.hasOwn(source, "literal"), hasFormula = Object.hasOwn(source, "formulaRef");
  if (hasLiteral && hasFormula) throw new Error(`${label} cannot combine a literal and a Formula.`);
  if (hasLiteral && (typeof source.literal !== "number" || !Number.isFinite(source.literal))) throw new Error(`${label}.literal must be a finite number.`);
  if (hasFormula && typeof source.formulaRef !== "string") throw new Error(`${label}.formulaRef must be a Formula id.`);
  need(hasLiteral || nonempty(source.formulaRef), `${label} requires a literal or a Formula.`, options);
  return copyJSON(source);
}

function slotIdentity(slot, label) {
  if (!isRecord(slot)) throw new Error(`${label} must be an object.`);
  if (!nonempty(slot.id) || !SLOT_ID.test(slot.id)) throw new Error(`${label}.id must start with a letter and use letters, digits, - or _.`);
}

/** PoolDefinition (CP-26). */
export function preparePoolSlot(data, options = {}, label = "PoolDefinition") {
  slotIdentity(data, label);
  const slot = {valueType: "number", underflowPolicy: "clamp", overflowPolicy: "clamp", order: 0, ...copyJSON(data)};
  onlyFields(slot, ["id", "valueType", "minimum", "maximum", "initial", "underflowPolicy", "overflowPolicy", "presentationRole", "order"], label);
  if (!POOL_VALUE_TYPES.includes(slot.valueType)) throw new Error(`${label}.valueType must be number or integer.`);
  for (const key of ["underflowPolicy", "overflowPolicy"]) if (!POOL_BOUND_POLICIES.includes(slot[key])) throw new Error(`${label}.${key} must be clamp, reject or allow.`);
  if (slot.presentationRole !== undefined && typeof slot.presentationRole !== "string") throw new Error(`${label}.presentationRole must be a string.`);
  if (!Number.isSafeInteger(slot.order)) throw new Error(`${label}.order must be a safe integer.`);
  slot.minimum = prepareValueSource(slot.minimum, `${label}.minimum`, options);
  slot.maximum = prepareValueSource(slot.maximum, `${label}.maximum`, options);
  if (slot.initial === undefined || slot.initial === null) delete slot.initial;
  else slot.initial = prepareValueSource(slot.initial, `${label}.initial`, options);
  if (slot.minimum === null) delete slot.minimum;
  if (slot.maximum === null) delete slot.maximum;
  const literal = key => typeof slot[key]?.literal === "number" ? slot[key].literal : null;
  if (literal("minimum") !== null && literal("maximum") !== null && literal("minimum") > literal("maximum")) throw new Error(`${label}.minimum is greater than its maximum.`);
  if (slot.valueType === "integer") for (const key of ["minimum", "maximum", "initial"]) if (literal(key) !== null && !Number.isInteger(literal(key))) throw new Error(`${label}.${key} must be an integer.`);
  return slot;
}

/** CollectionDefinition (CP-27). allowedKinds lists ContentType ids for owned and
 * reference entries, and value type ids for value entries. */
export function prepareCollectionSlot(data, options = {}, label = "CollectionDefinition") {
  slotIdentity(data, label);
  const slot = {entryMode: "owned", allowedKinds: [], unique: false, ordering: "insertion", ...copyJSON(data)};
  onlyFields(slot, ["id", "entryMode", "allowedKinds", "minimumEntries", "maximumEntries", "capacityFormulaRef", "unique", "ordering", "presentationRole"], label);
  if (!COLLECTION_ENTRY_MODES.includes(slot.entryMode)) throw new Error(`${label}.entryMode must be owned, reference or value.`);
  if (!Array.isArray(slot.allowedKinds) || slot.allowedKinds.some(kind => !nonempty(kind))) throw new Error(`${label}.allowedKinds must be a list of ids.`);
  if (new Set(slot.allowedKinds).size !== slot.allowedKinds.length) throw new Error(`${label}.allowedKinds contains duplicates.`);
  need(slot.allowedKinds.length > 0, `${label} requires at least one allowed kind.`, options);
  if (slot.entryMode === "value") for (const kind of slot.allowedKinds) if (!valueTypeRegistry.has(kind)) throw new Error(`${label}.allowedKinds: unknown value type ${kind}.`);
  for (const key of ["minimumEntries", "maximumEntries"]) if (!optionalInteger(slot[key])) throw new Error(`${label}.${key} must be a non-negative integer.`);
  if (Number.isSafeInteger(slot.minimumEntries) && Number.isSafeInteger(slot.maximumEntries) && slot.minimumEntries > slot.maximumEntries) throw new Error(`${label}.minimumEntries is greater than maximumEntries.`);
  if (slot.capacityFormulaRef !== undefined && slot.capacityFormulaRef !== null && typeof slot.capacityFormulaRef !== "string") throw new Error(`${label}.capacityFormulaRef must be a Formula id.`);
  if (!slot.capacityFormulaRef) delete slot.capacityFormulaRef;
  for (const key of ["minimumEntries", "maximumEntries"]) if (slot[key] === null) delete slot[key];
  if (typeof slot.unique !== "boolean") throw new Error(`${label}.unique must be boolean.`);
  if (!COLLECTION_ORDERINGS.includes(slot.ordering)) throw new Error(`${label}.ordering must be insertion or manual.`);
  if (slot.presentationRole !== undefined && typeof slot.presentationRole !== "string") throw new Error(`${label}.presentationRole must be a string.`);
  return slot;
}

const PREPARE_SLOT = {pool: preparePoolSlot, collection: prepareCollectionSlot};

/** Definition.slots: only for the Definition's own slot capabilities; ids unique per capability. */
export function prepareDefinitionSlots(slots, capabilities = [], options = {}) {
  if (slots === undefined || slots === null) return {};
  if (!isRecord(slots)) throw new Error("Definition.slots must be an object keyed by capability.");
  const result = {};
  for (const [capabilityId, list] of Object.entries(slots)) {
    if (!SLOT_CAPABILITIES.includes(capabilityId)) throw new Error(`Capability has no slots: ${capabilityId}.`);
    if (!capabilities.includes(capabilityId)) throw new Error(`Definition.slots.${capabilityId} requires the ${capabilityId} capability.`);
    if (!Array.isArray(list)) throw new Error(`Definition.slots.${capabilityId} must be an array.`);
    const ids = new Set();
    result[capabilityId] = list.map((slot, index) => {
      const prepared = PREPARE_SLOT[capabilityId](slot, options, `Definition.slots.${capabilityId}[${index}]`);
      if (ids.has(prepared.id)) throw new Error(`Duplicate ${capabilityId} slot id: ${prepared.id}.`);
      ids.add(prepared.id);
      return prepared;
    });
  }
  return result;
}

export function findSlot(definition, capabilityId, slotId) {
  return (definition?.slots?.[capabilityId] ?? []).find(slot => slot.id === slotId) ?? null;
}

/** Initial runtime value key for a slot field, e.g. "pool.hp.current". */
export const slotInitialKey = (capabilityId, slotId, field) => `${capabilityId}.${slotId}.${field}`;
