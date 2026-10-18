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

/** New round (GM): combatants whose Ruleset rerolls initiative each round roll again, and the round restarts at its first
 * turn. At the start of the combat, only those with no initiative yet roll, and the combat starts with the best one: a
 * combatant made current before the initiatives were rolled does not keep the turn. */
export async function rerollEachRound(combat, prior, current, getRuntime) {
  if (!(Number(current?.round) > Number(prior?.round ?? 0))) return false;
  const starting = Number(prior?.round ?? 0) < 1, runtime = getRuntime(), each = [];
  const combatants = typeof combat.combatants?.values === "function" ? [...combat.combatants.values()] : [...(combat.combatants ?? [])];
  for (const combatant of combatants) {
    const state = combatant.actor?.uuid ? await runtime.getContainerState(combatant.actor.uuid) : null;
    if (state?.rulesetVersionId && runtime.initiativeEachRound(state.rulesetVersionId)) each.push(combatant);
  }
  if (!each.length) return false;
  const ids = (starting ? each.filter(c => c.initiative === null || c.initiative === undefined || c.initiative === "") : each).map(c => c.id);
  if (ids.length) await combat.rollInitiative(ids);
  if (Number(combat.turn) !== 0) await combat.update({turn: 0});
  return true;
}

/* Initiative passes (Shadowrun): after everyone acted, a combatant whose initiative minus `step` per pass stays above
   `threshold` acts again in another pass of the same round; the others wait for the next round. With `countFormulaRef`,
   a combatant acts in as many passes as that Formula gives for its Actor (one attack per pass, up to its attacks per round).
   Combatants outside a Ruleset with passes act in the first pass only. The pass is kept in the combat's flags.
   A combat another module flags `singlePass` (a pursuit, a social scene) has one pass per round, whatever the Ruleset. */
const PASS_FLAG = "initiativePass";
export const SINGLE_PASS_FLAG = "singlePass";

/** A combatant's initiative in a given pass (1 for the first). */
export function passScore(initiative, pass, {step}) { return Number(initiative) - Number(step) * (pass - 1); }

async function passRules(combat, runtime, moduleId) {
  const rules = new Map();
  if (!runtime?.initiativePasses || combat.getFlag?.(moduleId, SINGLE_PASS_FLAG)) return rules;
  for (const combatant of combat.turns ?? []) {
    const state = combatant.actor?.uuid ? await runtime.getContainerState(combatant.actor.uuid) : null;
    const passes = state?.rulesetVersionId ? runtime.initiativePasses(state.rulesetVersionId) : null;
    if (passes?.countFormulaRef) {
      const count = Number(await runtime.evaluateFormula(state.rulesetVersionId, passes.countFormulaRef, {roles: {self: combatant.actor.uuid}, defaultRole: "self"}).catch(() => 1));
      rules.set(combatant.id, {count: Number.isFinite(count) ? count : 1});
    } else if (passes) rules.set(combatant.id, passes);
  }
  return rules;
}
const actsIn = (combatant, pass, rules) => {
  const rule = rules.get(combatant.id);
  if (!rule) return pass === 1;
  if (rule.count !== undefined) return pass <= rule.count;
  return Number.isFinite(Number(combatant.initiative)) && combatant.initiative !== null && passScore(combatant.initiative, pass, rule) > rule.threshold;
};

/** Wrap Combat#nextTurn and Combat#nextRound once, for Rulesets that give initiative passes. */
export function installInitiativePasses(CombatClass, getRuntime, {moduleId = "rule-them-all", chat = globalThis.ChatMessage} = {}) {
  const proto = CombatClass.prototype, originalTurn = proto.nextTurn, originalRound = proto.nextRound;
  if (originalRound.rtaPasses) return;
  const passOf = combat => Number(combat.getFlag?.(moduleId, PASS_FLAG) ?? 1) || 1;
  async function nextTurn(...args) {
    const pass = passOf(this);
    if (pass === 1) return originalTurn.apply(this, args);
    const rules = await passRules(this, getRuntime(), moduleId), turns = this.turns ?? [];
    for (let index = Number(this.turn ?? -1) + 1; index < turns.length; index++) if (actsIn(turns[index], pass, rules)) { await this.update({turn: index}); return this; }
    return this.nextRound();
  }
  async function nextRound(...args) {
    const rules = await passRules(this, getRuntime(), moduleId);
    if (rules.size) {
      const next = passOf(this) + 1, first = (this.turns ?? []).findIndex(combatant => actsIn(combatant, next, rules));
      if (first >= 0) {
        await this.update({turn: first, [`flags.${moduleId}.${PASS_FLAG}`]: next});
        await chat?.create?.({content: `<p>${globalThis.game?.i18n?.format?.("RTA.Initiative.Pass", {pass: next}) ?? `Pass ${next}`}</p>`});
        return this;
      }
      if (passOf(this) !== 1) await this.update({[`flags.${moduleId}.${PASS_FLAG}`]: 1});
    }
    return originalRound.apply(this, args);
  }
  nextRound.rtaPasses = true;
  proto.nextTurn = nextTurn;
  proto.nextRound = nextRound;
}

/* Turn order changed by an Action (Action.turnOrder): delay, act now as an interruption, or a new initiative. */
const score = combatant => Number.isFinite(Number(combatant?.initiative)) && combatant?.initiative !== null ? Number(combatant.initiative) : null;
const byInitiative = (a, b) => (score(b) ?? -Infinity) - (score(a) ?? -Infinity);

/** turns: the combatants in turn order ({id, initiative}); current: the index of the turn in progress (null before
 * the combat starts). Returns the mover's new initiative and whose turn it is afterwards ({initiative, turnId}).
 * "now": just ahead of the current combatant, and it acts at once. "last": after everyone. "set" / "add": value.
 * When the mover was acting and moves later, the turn passes to the next combatant; otherwise it stays put. */
export function planTurnChange(turns, current, moverId, {move, value = null}) {
  const mover = turns.find(turn => turn.id === moverId);
  if (!mover) return null;
  const acting = Number.isInteger(current) && current >= 0 ? turns[current] : null, own = score(mover), others = turns.filter(turn => turn.id !== moverId).map(score).filter(x => x !== null);
  let initiative = own;
  if (move === "now") initiative = acting && acting.id !== moverId ? (score(acting) ?? 0) + 0.01 : own;
  else if (move === "last") initiative = others.length ? Math.min(...others) - 0.01 : own;
  else if (move === "set") initiative = Number(value);
  else if (move === "add") initiative = (own ?? 0) + Number(value);
  initiative = initiative === null ? null : Math.round(initiative * 100) / 100;
  if (!acting) return {initiative, turnId: null};
  const order = turns.map(turn => turn.id === moverId ? {...turn, initiative} : turn).sort(byInitiative);
  if (move === "now") return {initiative, turnId: moverId};
  if (acting.id !== moverId) return {initiative, turnId: acting.id};
  const index = order.findIndex(turn => turn.id === moverId);
  return {initiative, turnId: index > current ? order[current].id : moverId};
}

/** The combatant of an Actor (or of a token's Actor) in a combat. */
export function combatantOf(combat, uuid) {
  const combatants = typeof combat?.combatants?.values === "function" ? [...combat.combatants.values()] : [...(combat?.combatants ?? [])];
  return combatants.find(combatant => combatant.actor?.uuid === uuid || combatant.token?.uuid === uuid || combatant.token?.actor?.uuid === uuid) ?? null;
}

/** Apply a turn order change to a Foundry Combat (GM client): the combatant's initiative, then the turn in progress. */
export async function applyTurnChange(combat, uuid, change) {
  const combatant = combatantOf(combat, uuid);
  if (!combatant) return false;
  const turns = (combat.turns ?? []).map(turn => ({id: turn.id, initiative: turn.initiative}));
  const plan = planTurnChange(turns, combat.turn ?? null, combatant.id, change);
  if (!plan) return false;
  if (plan.initiative !== score(combatant)) await combatant.update({initiative: plan.initiative});
  const after = typeof combat.setupTurns === "function" ? combat.setupTurns() : combat.turns ?? [];
  const turn = plan.turnId ? after.findIndex(entry => entry.id === plan.turnId) : -1;
  if (turn >= 0 && turn !== combat.turn) await combat.update({turn});
  return true;
}
