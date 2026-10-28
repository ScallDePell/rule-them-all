/* The Active Effects a container's active states ask of the game system (Definition.systemChanges): one per state
   Definition, its changes repeated once per stack. Pure: Foundry is reached by foundry-system-changes.mjs. */

/** [{definitionId, name, stacks, changes: [{key, type, value}], signature}] for a RuntimeState under its Ruleset. */
export function systemChangeEffects(ruleset, state) {
  const out = [];
  for (const definition of ruleset?.definitions ?? []) {
    const changes = definition.systemChanges ?? [];
    if (!changes.length || definition.enabled === false || !(definition.capabilities ?? []).includes("state")) continue;
    const instances = (state?.stateInstances ?? []).filter(instance => instance.definitionId === definition.id && instance.active !== false);
    // A state set active on the sheet without an instance counts once.
    const stacks = instances.reduce((sum, instance) => sum + Math.max(1, Number(instance.stacks ?? 1) || 1), 0)
      || (state?.definitionStates?.[definition.id]?.capabilityStates?.state?.active ? 1 : 0);
    if (!stacks) continue;
    const rows = Array.from({length: stacks}, () => changes.map(({key, type, value}) => ({key, type, value: String(value)}))).flat();
    out.push({definitionId: definition.id, name: definition.nameKey || definition.id, stacks, changes: rows, signature: JSON.stringify([definition.nameKey ?? "", rows])});
  }
  return out;
}
