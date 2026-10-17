/* Token bars from the Ruleset: a pool slot with a maximum, or a value Definition with a maximum bound, can be a token's
   bar. Its attribute is rta.<definitionId>.<slotId> (a pool) or rta.<definitionId> (a value). */
export const TOKEN_BAR_PREFIX = "rta.";

const enabled = entry => entry?.enabled !== false;

/** The bars a Ruleset offers: [{attribute, definitionId, slotId?, nameKey, slotName?}]. */
export function tokenBarAttributes(ruleset) {
  const bars = [];
  for (const definition of (ruleset?.definitions ?? []).filter(enabled)) {
    const capabilities = definition.capabilities ?? [];
    if (capabilities.includes("pool")) for (const slot of definition.slots?.pool ?? []) {
      if (slot.maximum) bars.push({attribute: `${TOKEN_BAR_PREFIX}${definition.id}.${slot.id}`, definitionId: definition.id, slotId: slot.id, nameKey: definition.nameKey, slotName: slot.name ?? ""});
    }
    if (capabilities.includes("value")) {
      const type = ruleset.definitionTypes?.find(t => t.id === definition.definitionTypeId);
      if (definition.valueBounds?.maximum ?? type?.valueBounds?.maximum) bars.push({attribute: `${TOKEN_BAR_PREFIX}${definition.id}`, definitionId: definition.id, nameKey: definition.nameKey});
    }
  }
  return bars;
}

const number = value => { const n = Number(value); return Number.isFinite(n) ? n : null; };

/** The value and maximum a bar shows for a container, or null (no such bar, nothing stored yet, no maximum). */
export async function tokenBarValue(engine, versionId, containerRef, attribute) {
  const bar = tokenBarAttributes(engine.ruleset(versionId)).find(entry => entry.attribute === attribute);
  if (!bar) return null;
  const context = {roles: {self: containerRef}, defaultRole: "self"};
  const read = (capabilityId, outputId) => engine.resolveReference(versionId, {objectKind: "definition", objectId: bar.definitionId, capabilityId, outputId, ...(bar.slotId ? {slotId: bar.slotId} : {})}, context);
  try {
    const [value, max] = bar.slotId
      ? [number(await read("pool", "pool.current")), number(await read("pool", "pool.maximum"))]
      : [number(await read("value", "value.final")), number((await engine.valueBounds(versionId, containerRef, bar.definitionId)).maximum)];
    return value === null || max === null ? null : {value, max};
  } catch { return null; }
}
