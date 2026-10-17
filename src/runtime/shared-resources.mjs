/* Shared resources (Ruleset.sharedDefinitions) as the shared resources panel shows them: the Definitions the world
   holds once for the whole game (a GM reserve, clocks) and those the combat in progress holds (an escalation die).
   Each value or pool slot is one row; a Definition the user may not read is left out, and only the GM changes them. */
import {findSlot} from "../configurator/capability-slots.mjs";
import {normalizeRuntimeContainerRef} from "./runtime-contracts.mjs";
import {WORLD_CONTAINER} from "./runtime-engine.mjs";
import {isDerived, writableReference} from "./sheet-projection.mjs";

const enabled = entry => entry?.enabled !== false;

/** The numbers a Definition shows: its value, then each pool slot. */
function outputsOf(definition) {
  const capabilities = definition.capabilities ?? [], out = [];
  if (capabilities.includes("value")) out.push({reference: {objectKind: "definition", objectId: definition.id, capabilityId: "value", outputId: "value.final"}, slotName: null});
  if (capabilities.includes("pool")) for (const slot of definition.slots?.pool ?? []) out.push({reference: {objectKind: "definition", objectId: definition.id, capabilityId: "pool", outputId: "pool.current", slotId: slot.id}, slotName: slot.name ?? null});
  return out;
}

/** Whether the Ruleset names shared resources at all (the panel is only offered then). */
export function hasSharedResources(ruleset) {
  const shared = ruleset?.sharedDefinitions ?? {};
  return [...(shared.world ?? []), ...(shared.combat ?? [])].length > 0;
}

/** [{holder: "world" | "combat", ref, rows: [{key, definitionId, nameKey, slotId, slotName, value, minimum, maximum, writable}]}].
 * combat: the combat in progress ({kind: "combat", id}); without one, the combat group has ref null and no rows. */
export async function describeShared(engine, versionId, {combat = null} = {}) {
  const ruleset = engine.ruleset(versionId), shared = ruleset.sharedDefinitions ?? {}, groups = [];
  for (const [holder, ref] of [["world", WORLD_CONTAINER], ["combat", combat]]) {
    const definitions = (shared[holder] ?? []).map(id => (ruleset.definitions ?? []).find(definition => definition.id === id)).filter(definition => definition && enabled(definition));
    if (!definitions.length) continue;
    if (!ref) { groups.push({holder, ref: null, rows: []}); continue; }
    const container = normalizeRuntimeContainerRef(ref), state = await engine.adapter.load(container, {rulesetVersionId: versionId});
    const scope = {roles: {self: container}, defaultRole: "self"}, canUpdate = await engine.adapter.canWrite(container);
    const rows = [];
    for (const definition of definitions) {
      if (!(await engine.authorize(versionId, "read", {objectKind: "definition", objectId: definition.id}, container)).allowed) continue;
      const held = Boolean(state.definitionStates?.[definition.id]);
      const mayWrite = held && canUpdate && (await engine.authorize(versionId, "write", {objectKind: "definition", objectId: definition.id}, container)).allowed;
      for (const {reference, slotName} of outputsOf(definition)) {
        const row = {key: [definition.id, reference.slotId ?? ""].join("/"), definitionId: definition.id, nameKey: definition.nameKey ?? definition.id, slotId: reference.slotId ?? null, slotName, value: null, minimum: null, maximum: null, writable: false};
        if (held) {
          row.value = await engine.resolveReference(versionId, reference, scope);
          if (reference.capabilityId === "pool") for (const bound of ["minimum", "maximum"]) row[bound] = await engine.resolveReference(versionId, {...reference, outputId: `pool.${bound}`}, scope) ?? null;
          else ({minimum: row.minimum, maximum: row.maximum} = await engine.valueBounds(versionId, container, definition.id));
          row.writable = mayWrite && !isDerived(ruleset, reference) && !isDerived(ruleset, writableReference(reference));
        }
        rows.push(row);
      }
    }
    groups.push({holder, ref: container, rows});
  }
  return groups;
}

/** Set one shared value (a value's final number, moved through its base) or pool slot to a new number. */
export async function setSharedValue(engine, versionId, ref, definitionId, slotId, value) {
  const next = Number(value);
  if (!Number.isFinite(next)) throw new Error("A number is expected.");
  const ruleset = engine.ruleset(versionId), definition = (ruleset.definitions ?? []).find(entry => entry.id === definitionId);
  if (!definition) throw new Error(`Definition unavailable: ${definitionId}.`);
  const container = normalizeRuntimeContainerRef(ref), scope = {roles: {self: container}, defaultRole: "self"};
  if (slotId) {
    if (!findSlot(definition, "pool", slotId)) throw new Error(`Slot not found: ${definitionId}/pool/${slotId}.`);
    return engine.setDefinitionState(versionId, container, definitionId, {pools: {[slotId]: next}});
  }
  const reference = {objectKind: "definition", objectId: definitionId, capabilityId: "value", outputId: "value.final"};
  const [shown, base] = [await engine.resolveReference(versionId, reference, scope), await engine.resolveReference(versionId, writableReference(reference), scope)];
  return engine.setDefinitionState(versionId, container, definitionId, {base: Number(base) + next - Number(shown)});
}
