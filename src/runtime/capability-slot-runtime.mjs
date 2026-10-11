/* Runtime side of capability slots (CP-26 PoolState, CP-27 CollectionState).
   Only sources of truth are stored: a pool's `current`, a collection's
   entries. Pool bounds are recomputed from their ValueSource on every read. */
import {copyJSON, isRecord} from "../configurator/configurator-schema.mjs";
import {findSlot, slotInitialKey, SLOT_CAPABILITIES} from "../configurator/capability-slots.mjs";
import {validateTypedValue} from "../configurator/value-type-registry.mjs";

export {SLOT_CAPABILITIES};

/** The slot a Reference points to; throws when the Reference does not name one. */
export function requireSlot(definition, reference) {
  if (!reference.slotId) throw new Error(`Runtime Reference to ${definition.id}/${reference.capabilityId} requires slotId.`);
  const slot = findSlot(definition, reference.capabilityId, reference.slotId);
  if (!slot) throw new Error(`Slot not found: ${definition.id}/${reference.capabilityId}/${reference.slotId}.`);
  return slot;
}

export function poolSlotState(definitionState, slotId) {
  const state = definitionState.capabilityStates?.pool?.[slotId];
  if (!state) throw new Error(`Pool slot is not instantiated: ${definitionState.definitionId}/${slotId}.`);
  return state;
}

export function collectionSlotState(definitionState, slotId) {
  const state = definitionState.capabilityStates?.collection?.[slotId];
  if (!state) throw new Error(`Collection slot is not instantiated: ${definitionState.definitionId}/${slotId}.`);
  return state;
}

/** Apply a pool's underflow/overflow policies to a candidate value. */
export function boundPoolValue(slot, value, {minimum, maximum}, label = slot.id) {
  let next = Number(value);
  if (!Number.isFinite(next)) throw new Error(`Pool ${label} value must be numeric.`);
  if (slot.valueType === "integer") next = Math.trunc(next);
  if (minimum !== null && next < minimum) {
    if (slot.underflowPolicy === "reject") throw Object.assign(new Error(`Pool ${label} cannot go below ${minimum}.`), {code: "POOL_UNDERFLOW"});
    if (slot.underflowPolicy === "clamp") next = minimum;
  }
  if (maximum !== null && next > maximum) {
    if (slot.overflowPolicy === "reject") throw Object.assign(new Error(`Pool ${label} cannot go above ${maximum}.`), {code: "POOL_OVERFLOW"});
    if (slot.overflowPolicy === "clamp") next = maximum;
  }
  return next;
}

/** Initial pool/collection states; `resolved` holds the evaluated starting pool values. */
export function initialSlotStates(definition, initial, resolved) {
  const states = {};
  for (const slot of definition.slots?.pool ?? []) (states.pool ??= {})[slot.id] = {current: resolved.pool[slot.id]};
  for (const slot of definition.slots?.collection ?? []) {
    const entries = initial[slotInitialKey("collection", slot.id, "entries")] ?? [];
    if (!Array.isArray(entries)) throw new Error(`Initial entries for ${definition.id}/${slot.id} must be an array.`);
    const state = {entries: []};
    for (const entry of entries) state.entries.push(prepareCollectionEntry(slot, entry, state.entries));
    (states.collection ??= {})[slot.id] = state;
  }
  return states;
}

const sameTarget = (a, b) => JSON.stringify(a.entityRef ?? a.templateRef ?? a.value) === JSON.stringify(b.entityRef ?? b.templateRef ?? b.value);
const newEntryId = () => globalThis.crypto?.randomUUID?.() ?? `entry-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

/** Validate one CollectionEntry against its slot's entry mode and allowed kinds.
 * owned:     {kind, entityRef} or, for stackable content, {kind, templateRef, quantity}
 * reference: {kind, entityRef}
 * value:     {kind, value}                                                     */
export function prepareCollectionEntry(slot, data, entries = []) {
  if (!isRecord(data)) throw new Error(`Collection ${slot.id} entry must be an object.`);
  const entry = {id: newEntryId(), ...copyJSON(data)};
  if (typeof entry.id !== "string" || !entry.id.trim()) throw new Error(`Collection ${slot.id} entry id must be a non-empty string.`);
  if (entries.some(other => other.id === entry.id)) throw new Error(`Collection ${slot.id} already has entry ${entry.id}.`);
  if (!slot.allowedKinds.includes(entry.kind)) throw new Error(`Collection ${slot.id} does not accept kind ${entry.kind}.`);
  const allowed = {owned: ["id", "kind", "entityRef", "templateRef", "quantity"], reference: ["id", "kind", "entityRef"], value: ["id", "kind", "value"]}[slot.entryMode];
  for (const key of Object.keys(entry)) if (!allowed.includes(key)) throw new Error(`Collection ${slot.id} (${slot.entryMode}) entry has unsupported field: ${key}.`);
  if (slot.entryMode === "value") {
    const check = validateTypedValue(entry.kind, "one", false, entry.value);
    if (!check.valid) throw new Error(`Collection ${slot.id} value is invalid: ${check.message}`);
  } else if (entry.templateRef !== undefined) {
    if (slot.entryMode !== "owned") throw new Error(`Only owned collections can hold stacked content.`);
    if (typeof entry.templateRef !== "string" || !entry.templateRef.trim()) throw new Error(`Collection ${slot.id} templateRef must be a ContentTemplate id.`);
    if (!Number.isSafeInteger(entry.quantity) || entry.quantity < 1) throw new Error(`Collection ${slot.id} quantity must be a positive integer.`);
    if (entry.entityRef !== undefined) throw new Error(`Collection ${slot.id} entry uses either entityRef or templateRef + quantity.`);
  } else if (!isRecord(entry.entityRef) && !(typeof entry.entityRef === "string" && entry.entityRef.trim())) {
    throw new Error(`Collection ${slot.id} entry requires an entityRef.`);
  }
  if (slot.unique && entries.some(other => sameTarget(other, entry))) throw new Error(`Collection ${slot.id} is unique and already holds this entry.`);
  return entry;
}

/** Capacity is the smaller of maximumEntries and the evaluated capacity Formula. */
export function assertCollectionRoom(slot, entries, capacity) {
  const limits = [slot.maximumEntries, capacity].filter(value => Number.isFinite(value));
  const limit = limits.length ? Math.min(...limits) : Infinity;
  if (entries.length >= limit) throw Object.assign(new Error(`Collection ${slot.id} is full (${limit}).`), {code: "COLLECTION_FULL"});
}

export function assertCollectionMinimum(slot, remaining) {
  if (Number.isSafeInteger(slot.minimumEntries) && remaining < slot.minimumEntries) {
    throw Object.assign(new Error(`Collection ${slot.id} needs at least ${slot.minimumEntries} entries.`), {code: "COLLECTION_MINIMUM"});
  }
}
