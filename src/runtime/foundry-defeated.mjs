/** Foundry combat tracker: a Ruleset's "defeated" Condition (initiative.defeatedConditionRef) marks a combatant defeated
 * while it holds, and no longer defeated when it stops holding. Only a change of the Condition moves the mark, so the
 * GM's own toggle in the tracker stays until the Condition changes again. */

/** The marks to change: rows [{id, holds (true|false|null: no Condition), defeated}], last: Map of the Condition as last
 * seen per combatant (updated here). A combatant first seen with the Condition holding is marked. */
export function defeatedChanges(rows, last) {
  const changes = [];
  for (const {id, holds, defeated} of rows) {
    if (holds === null || holds === undefined) { last.delete(id); continue; }
    const before = last.get(id);
    last.set(id, holds);
    if ((before === undefined ? holds : before !== holds) && Boolean(defeated) !== holds) changes.push({id, defeated: holds});
  }
  return changes;
}

/** Active GM: re-read the combat's combatants a moment after an Actor or the combat changes. getRuntime: the gameplay runtime. */
export function installDefeated(getRuntime, {hooks = globalThis.Hooks, delay = 200} = {}) {
  const last = new Map();
  let timer = null, running = false, again = false;
  const check = async () => {
    const game = globalThis.game, combat = game.combat, runtime = getRuntime();
    if (!game.users.activeGM?.isSelf || !combat?.started || !runtime) return;
    if (running) { again = true; return; }
    running = true;
    try {
      const rows = [];
      for (const combatant of combat.combatants) {
        const uuid = combatant.actor?.uuid, state = uuid ? await runtime.getContainerState(uuid) : null;
        const conditionId = state?.rulesetVersionId ? runtime.defeatedConditionRef(state.rulesetVersionId) : null;
        const holds = conditionId ? Boolean(await runtime.evaluateCondition(state.rulesetVersionId, conditionId, {roles: {self: uuid}, defaultRole: "self"})) : null;
        rows.push({id: combatant.id, holds, defeated: combatant.isDefeated});
      }
      for (const {id, defeated} of defeatedChanges(rows, last)) {
        const combatant = combat.combatants.get(id);
        await combatant.update({defeated});
        // As the tracker's own toggle does: the defeated status on the token too.
        const status = globalThis.CONFIG?.specialStatusEffects?.DEFEATED;
        if (status) await combatant.actor?.toggleStatusEffect?.(status, {overlay: true, active: defeated});
      }
    } catch (error) { console.error("Rule Them'All | Defeated check failed", error); }
    finally {
      running = false;
      if (again) { again = false; later(); }
    }
  };
  const later = () => { clearTimeout(timer); timer = setTimeout(check, delay); };
  for (const hook of ["updateActor", "combatStart", "createCombatant", "updateCombat"]) hooks.on(hook, later);
  hooks.on("deleteCombat", () => last.clear());
  return check;
}
