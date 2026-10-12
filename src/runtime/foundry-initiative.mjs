/** Foundry combat tracker: a combatant whose Actor runs under a Ruleset with an initiative Test gets its
 * initiative from that Test; every other combatant keeps the game system's own initiative roll. */

/** {initiative, eachRound, testResult} for an Actor, or null when its Ruleset sets no initiative. */
export async function rulesetInitiative(runtime, actorUuid) {
  if (!actorUuid) return null;
  const state = await runtime.getContainerState(actorUuid);
  if (!state?.rulesetVersionId) return null;
  return runtime.rollInitiative(state.rulesetVersionId, actorUuid);
}

/** Wrap Combat#rollInitiative once. getRuntime: the gameplay runtime, read when a roll happens. */
export function installInitiative(CombatClass, getRuntime, {chat = globalThis.ChatMessage} = {}) {
  const original = CombatClass.prototype.rollInitiative;
  if (original.rtaInitiative) return;
  async function rollInitiative(ids, options = {}) {
    const runtime = getRuntime(), list = typeof ids === "string" ? [ids] : [...ids], updates = [], others = [];
    for (const id of list) {
      const combatant = this.combatants.get(id), rolled = runtime ? await rulesetInitiative(runtime, combatant?.actor?.uuid) : null;
      if (!rolled) { others.push(id); continue; }
      updates.push({_id: id, initiative: rolled.initiative});
      const roll = rolled.testResult.roll;
      await chat?.create?.({speaker: chat.getSpeaker?.({actor: combatant.actor, token: combatant.token}), flavor: globalThis.game?.i18n?.format?.("RTA.Initiative.Rolled", {name: combatant.name}) ?? combatant.name,
        content: `<p>${roll ? `${roll.formula} → ${roll.total} · ` : ""}<strong>${rolled.initiative}</strong></p>`});
    }
    if (others.length) await original.call(this, others, options);
    if (updates.length) await this.updateEmbeddedDocuments("Combatant", updates);
    return this;
  }
  rollInitiative.rtaInitiative = true;
  CombatClass.prototype.rollInitiative = rollInitiative;
}

/** New round (GM): combatants whose Ruleset rerolls initiative each round roll again, and the round restarts at its first turn. */
export async function rerollEachRound(combat, prior, current, getRuntime) {
  if (!(Number(current?.round) > Number(prior?.round ?? 0)) || Number(prior?.round ?? 0) < 1) return false;
  const runtime = getRuntime(), ids = [];
  const combatants = typeof combat.combatants?.values === "function" ? [...combat.combatants.values()] : [...(combat.combatants ?? [])];
  for (const combatant of combatants) {
    const state = combatant.actor?.uuid ? await runtime.getContainerState(combatant.actor.uuid) : null;
    if (state?.rulesetVersionId && runtime.initiativeEachRound(state.rulesetVersionId)) ids.push(combatant.id);
  }
  if (!ids.length) return false;
  await combat.rollInitiative(ids);
  await combat.update({turn: 0});
  return true;
}
