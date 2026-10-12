/** Foundry combat tracker: a combatant whose Actor runs under a Ruleset with an initiative Test gets its
 * initiative from that Test; every other combatant keeps the game system's own initiative roll. */

/** {initiative, eachRound, bySide, testResult, rowId?, labelKey?} for an Actor, or null when its Ruleset sets no initiative.
 * drawn: the Table rows already drawn this round, which a draw skips. */
export async function rulesetInitiative(runtime, actorUuid, {drawn = []} = {}) {
  if (!actorUuid) return null;
  const state = await runtime.getContainerState(actorUuid);
  if (!state?.rulesetVersionId) return null;
  return runtime.rollInitiative(state.rulesetVersionId, actorUuid, {drawn});
}

/** Rows drawn from an initiative Table, per combat and round: a card drawn by one side is not drawn again this round. */
const drawnRows = new WeakMap();
function drawnThisRound(combat) {
  const round = Number(combat?.round ?? 0), entry = drawnRows.get(combat);
  if (entry?.round === round) return entry.rows;
  const rows = [];
  drawnRows.set(combat, {round, rows});
  return rows;
}
const sideOf = combatant => combatant?.token?.disposition ?? combatant?.token?.document?.disposition ?? combatant?.actor?.prototypeToken?.disposition ?? 0;

/** Wrap Combat#rollInitiative once. getRuntime: the gameplay runtime, read when a roll happens. */
export function installInitiative(CombatClass, getRuntime, {chat = globalThis.ChatMessage} = {}) {
  const original = CombatClass.prototype.rollInitiative;
  if (original.rtaInitiative) return;
  async function rollInitiative(ids, options = {}) {
    const runtime = getRuntime(), list = typeof ids === "string" ? [ids] : [...ids], updates = [], others = [];
    const drawn = drawnThisRound(this), sides = new Map();
    for (const id of list) {
      const combatant = this.combatants.get(id), side = sideOf(combatant);
      // One roll per side: the first combatant of a side rolls and its side shares the result.
      const shared = sides.get(side);
      if (shared) { updates.push({_id: id, initiative: shared.initiative}); continue; }
      const rolled = runtime ? await rulesetInitiative(runtime, combatant?.actor?.uuid, {drawn}) : null;
      if (!rolled) { others.push(id); continue; }
      if (rolled.rowId) drawn.push(rolled.rowId);
      if (rolled.bySide) sides.set(side, rolled);
      updates.push({_id: id, initiative: rolled.initiative});
      const roll = rolled.testResult?.roll, i18n = globalThis.game?.i18n;
      const detail = rolled.labelKey ? `${i18n?.localize?.(rolled.labelKey) ?? rolled.labelKey} · ` : roll ? `${roll.formula} → ${roll.total} · ` : "";
      await chat?.create?.({speaker: chat.getSpeaker?.({actor: combatant.actor, token: combatant.token}), flavor: i18n?.format?.(rolled.bySide ? "RTA.Initiative.RolledSide" : "RTA.Initiative.Rolled", {name: combatant.name}) ?? combatant.name,
        content: `<p>${detail}<strong>${rolled.initiative}</strong></p>`});
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
