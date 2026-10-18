/* The module's own events (combat tracker, world clock), emitted one batch after the other so a combat's start, round
   and turn keep their order whatever hooks fire meanwhile. A combatant hears its turn once per round, combatant and
   pass (key), however it came to act; a start or a new round resets what the turn set, so the turn is heard again
   after it. */
export function createModuleEventQueue(emit, {ready = () => null, onError = error => console.error("Rule Them'All | Module event failed", error)} = {}) {
  let queue = Promise.resolve();
  const announced = new Map();
  const push = events => (queue = queue.then(async () => {
    await ready();
    for (const {eventTypeId, payload, refs, key} of (await events()).filter(Boolean)) {
      if (eventTypeId === "rta.combat.turn") { if (key && announced.get(payload.combatId) === key) continue; announced.set(payload.combatId, key); }
      else if (eventTypeId === "rta.combat.start" || eventTypeId === "rta.combat.round") announced.delete(payload.combatId);
      // One event that fails (a Trigger in error) does not take the next ones of its batch with it.
      try { await emit(eventTypeId, payload, refs); } catch (error) { onError(error); }
    }
  }).catch(onError));
  return {push, forget: combatId => announced.delete(combatId), idle: () => queue};
}
