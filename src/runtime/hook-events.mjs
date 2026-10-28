/* Ruleset Event Types bound to a Foundry hook (EventType.hook): what one call of the hook means, read in its
   arguments. Pure: foundry-hook-events.mjs listens to the hooks and emits the events. */

/** The value at a dotted path in the hook's arguments ("0.0.total": the first roll's total); getters are read. */
export function readHookPath(args, path) {
  let value = args;
  for (const part of String(path ?? "").split(".").filter(Boolean)) { if (value === null || value === undefined) return undefined; value = value[part]; }
  return value;
}

/** The Actor a value stands for: an Actor, a Token's, an Item's or an activity's owner. */
export function actorOf(value) {
  if (!value || typeof value !== "object") return null;
  if (value.documentName === "Actor") return value;
  for (const next of [value.actor, value.parent, value.item]) if (next && next !== value && typeof next === "object") { const found = next.documentName === "Actor" ? next : next.actor?.documentName === "Actor" ? next.actor : null; if (found) return found; }
  return null;
}

/** A payload field value from the hook, as its field's value type says (a Document gives its name). */
function coerce(value, field) {
  if (value === undefined || value === null) return undefined;
  const type = field?.valueType ?? "string";
  if (type === "number" || type === "integer") { const n = Number(typeof value === "object" ? value.total ?? value.value : value); return Number.isFinite(n) ? (type === "integer" ? Math.trunc(n) : n) : undefined; }
  if (type === "boolean") return Boolean(value);
  if (typeof value === "object") return value.name ?? value.id ?? undefined;
  return String(value);
}

/** The events one hook call makes for an Event Type: [{payload, context}], one per target (or one without).
 * speaker: the Actor when selfPath finds none; targets: the user's targeted Actors' uuids. */
export function hookEvents(eventType, args, {speaker = null, targets = []} = {}) {
  const hook = eventType?.hook;
  if (!hook) return [];
  const self = (hook.selfPath ? actorOf(readHookPath(args, hook.selfPath)) : null) ?? speaker;
  if (!self?.uuid) return [];
  const payload = {};
  for (const [id, path] of Object.entries(hook.fieldPaths ?? {})) {
    const value = coerce(readHookPath(args, path), eventType.payloadFields?.[id]);
    if (value !== undefined) payload[id] = value;
  }
  const make = target => ({payload: {...payload}, context: {roles: {self: self.uuid, ...(target ? {target} : {})}, defaultRole: "self"}});
  const aimed = [...new Set(targets.filter(uuid => uuid && uuid !== self.uuid))];
  return aimed.length ? aimed.map(make) : [make(null)];
}
