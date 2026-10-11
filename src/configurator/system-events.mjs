/** Events the module emits itself, from Foundry's combat tracker and world clock.
 * A Trigger listens to one by id exactly like a Ruleset Event Type; the Actor concerned is the self role. */
const field = (id, name, valueType) => ({id, name, valueType, cardinality: "one", nullable: false, required: true, constraints: []});
const combat = [field("combatId", "Combat", "string"), field("round", "Round", "integer")];
const type = (id, nameKey, fields) => Object.freeze({id, nameKey, system: true, roles: ["self"], payloadFields: Object.freeze(Object.fromEntries(fields.map(f => [f.id, f])))});

export const SYSTEM_EVENT_PREFIX = "rta.";
export const SYSTEM_EVENT_TYPES = Object.freeze([
  type("rta.combat.start", "RTA.SystemEvent.CombatStart", combat),
  type("rta.combat.round", "RTA.SystemEvent.CombatRound", combat),
  type("rta.combat.turn", "RTA.SystemEvent.CombatTurn", [...combat, field("turn", "Turn", "integer")]),
  type("rta.combat.end", "RTA.SystemEvent.CombatEnd", combat),
  // seconds: time just elapsed; days: midnights crossed (a daily recovery).
  type("rta.time.elapsed", "RTA.SystemEvent.TimeElapsed", [field("seconds", "Seconds", "number"), field("days", "Days", "integer"), field("worldTime", "World time", "number")])
]);
export const systemEventType = id => SYSTEM_EVENT_TYPES.find(type => type.id === id) ?? null;
export const isSystemEventType = id => Boolean(systemEventType(id));

/** Combat change (Foundry combatTurnChange: prior and current {round, turn, combatantId}) to the events it means. */
export function combatChangeEvents(combat, prior, current) {
  const combatId = String(combat?.id ?? ""), round = Number(current?.round ?? 0), actors = (combat?.combatants ?? []).map(c => c.actor?.uuid).filter(Boolean);
  if (round < 1) return [];
  const events = [], payload = {combatId, round};
  const previousRound = Number(prior?.round ?? 0);
  if (previousRound < 1) events.push({eventTypeId: "rta.combat.start", payload, refs: actors});
  if (round !== previousRound) events.push({eventTypeId: "rta.combat.round", payload, refs: actors});
  const active = [...(combat?.combatants ?? [])].find(c => c.id === current?.combatantId)?.actor?.uuid;
  if (active) events.push({eventTypeId: "rta.combat.turn", payload: {...payload, turn: Number(current?.turn ?? 0)}, refs: [active]});
  return events;
}

/** World clock change to an elapsed-time event (none when the clock goes back). */
export function timeElapsedPayload(worldTime, delta, secondsPerDay = 86400) {
  const seconds = Number(delta);
  if (!(seconds > 0)) return null;
  const days = Math.floor(worldTime / secondsPerDay) - Math.floor((worldTime - seconds) / secondsPerDay);
  return {seconds, days, worldTime};
}
