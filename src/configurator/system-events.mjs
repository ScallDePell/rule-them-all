/** Events the module emits itself, from Foundry's combat tracker and world clock.
 * A Trigger listens to one by id exactly like a Ruleset Event Type; the Actor concerned is the self role.
 * The combat container hears the combat events and the world container the passing time, once each. */
const field = (id, name, valueType) => ({id, name, valueType, cardinality: "one", nullable: false, required: true, constraints: []});
const combat = [field("combatId", "Combat", "string"), field("round", "Round", "integer")];
const type = (id, nameKey, fields) => Object.freeze({id, nameKey, system: true, payloadFields: Object.freeze(Object.fromEntries(fields.map(f => [f.id, f])))});

export const SYSTEM_EVENT_PREFIX = "rta.";
export const SYSTEM_EVENT_TYPES = Object.freeze([
  type("rta.combat.start", "RTA.SystemEvent.CombatStart", combat),
  type("rta.combat.round", "RTA.SystemEvent.CombatRound", combat),
  // pass: the initiative pass of the round (1 without passes).
  type("rta.combat.turn", "RTA.SystemEvent.CombatTurn", [...combat, field("turn", "Turn", "integer"), field("pass", "Pass", "integer")]),
  type("rta.combat.end", "RTA.SystemEvent.CombatEnd", combat),
  // seconds: time just elapsed; days: midnights crossed (a daily recovery).
  type("rta.time.elapsed", "RTA.SystemEvent.TimeElapsed", [field("seconds", "Seconds", "number"), field("days", "Days", "integer"), field("worldTime", "World time", "number")])
]);
export const systemEventType = id => SYSTEM_EVENT_TYPES.find(type => type.id === id) ?? null;
export const isSystemEventType = id => Boolean(systemEventType(id));

/** Combat change (Foundry combatTurnChange: prior and current {round, turn, combatantId}) to the events it means. */
export function combatChangeEvents(combat, prior, current) {
  // The combat itself hears its start and its rounds once (its Triggers held by "combat"), after its Actors.
  const combatId = String(combat?.id ?? ""), round = Number(current?.round ?? 0), actors = [...(combat?.combatants ?? []).map(c => c.actor?.uuid).filter(Boolean), ...(combatId ? [{kind: "combat", id: combatId}] : [])];
  if (round < 1) return [];
  const events = [], payload = {combatId, round};
  const previousRound = Number(prior?.round ?? 0);
  if (previousRound < 1) events.push({eventTypeId: "rta.combat.start", payload, refs: actors});
  if (round !== previousRound) events.push({eventTypeId: "rta.combat.round", payload, refs: actors});
  const turn = combatTurnEvent(combat, current);
  if (turn) events.push(turn);
  return events;
}

/** The turn event of the combatant acting: named by the change (current.combatantId), else the combat's own. */
export function combatTurnEvent(combat, current = null) {
  const round = Number(current?.round ?? combat?.round ?? 0), combatantId = current?.combatantId ?? combat?.combatant?.id ?? null;
  const active = [...(combat?.combatants ?? [])].find(c => c.id === combatantId)?.actor?.uuid;
  if (round < 1 || !active) return null;
  const pass = Number(combat?.getFlag?.("rule-them-all", "initiativePass") ?? 1) || 1;
  return {eventTypeId: "rta.combat.turn", payload: {combatId: String(combat?.id ?? ""), round, turn: Number(current?.turn ?? combat?.turn ?? 0), pass}, refs: [active], key: `${round}|${combatantId}|${pass}`};
}

/** World clock change to an elapsed-time event (none when the clock goes back). */
export function timeElapsedPayload(worldTime, delta, secondsPerDay = 86400) {
  const seconds = Number(delta);
  if (!(seconds > 0)) return null;
  const days = Math.floor(worldTime / secondsPerDay) - Math.floor((worldTime - seconds) / secondsPerDay);
  return {seconds, days, worldTime};
}
