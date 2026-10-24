/* Data rules shared by the simulated Foundry server and its clients: Foundry's update syntax (dotted keys, "-=key"
   deletions, ForcedReplacement), and the ownership levels the server checks before it accepts a write. */

export const OWNERSHIP = Object.freeze({NONE: 0, LIMITED: 1, OBSERVER: 2, OWNER: 3});
export const ROLES = Object.freeze({NONE: 0, PLAYER: 1, TRUSTED: 2, ASSISTANT: 3, GAMEMASTER: 4});
/** ForcedReplacement.create(value) in the simulation: the value replaces the stored one instead of merging into it. */
export const FORCED = "__simForcedReplacement";

export const clone = value => value === undefined ? undefined : structuredClone(value);
const isObject = value => value !== null && typeof value === "object" && !Array.isArray(value);
const isForced = value => isObject(value) && FORCED in value;

/** {"flags.x.y": 1} -> {flags: {x: {y: 1}}}, as Foundry expands an update. */
export function expand(changes) {
  const out = {};
  for (const [key, value] of Object.entries(changes ?? {})) {
    const parts = key.split(".");
    let node = out;
    for (const part of parts.slice(0, -1)) node = isObject(node[part]) && !isForced(node[part]) ? node[part] : (node[part] = {});
    const last = parts.at(-1);
    node[last] = isObject(value) && !isForced(value) && isObject(node[last]) ? merge(node[last], expand(value)) : isObject(value) && !isForced(value) ? expand(value) : value;
  }
  return out;
}
const merge = (a, b) => { for (const [k, v] of Object.entries(b)) a[k] = isObject(v) && isObject(a[k]) && !isForced(v) ? merge(a[k], v) : v; return a; };

/** Apply an expanded change to a document's data in place; returns the change as hooks receive it (no markers). */
export function applyChanges(target, changes) {
  const plain = {};
  for (const [key, value] of Object.entries(changes)) {
    if (key.startsWith("-=")) { delete target[key.slice(2)]; plain[key] = null; continue; }
    if (isForced(value)) { target[key] = clone(value[FORCED]); plain[key] = clone(value[FORCED]); continue; }
    if (isObject(value)) { if (!isObject(target[key])) target[key] = {}; plain[key] = applyChanges(target[key], value); continue; }
    target[key] = clone(value);
    plain[key] = clone(value);
  }
  return plain;
}

/** The part of an expanded change that differs from the data: Foundry's server drops the rest, and an update that
 * changes nothing reaches no client. */
export function diffChanges(target, changes) {
  const out = {};
  for (const [key, value] of Object.entries(changes)) {
    if (key.startsWith("-=")) { if (target && key.slice(2) in target) out[key] = value; continue; }
    if (isObject(value) && !isForced(value)) { const inner = diffChanges(isObject(target?.[key]) ? target[key] : {}, value); if (Object.keys(inner).length || !isObject(target?.[key])) out[key] = inner; continue; }
    if (isForced(value) || JSON.stringify(target?.[key]) !== JSON.stringify(value)) out[key] = value;
  }
  return out;
}

export function getProperty(object, path) {
  return String(path).split(".").reduce((node, part) => node?.[part], object);
}

/** The ownership level of a user on a document's data ({ownership: {default, [userId]}}); a GM owns everything. */
export function userLevel(data, user) {
  if (!user) return OWNERSHIP.NONE;
  if (user.role >= ROLES.ASSISTANT) return OWNERSHIP.OWNER;
  return Number(data?.ownership?.[user._id] ?? data?.ownership?.default ?? OWNERSHIP.NONE);
}

/** A seeded uniform random number in [0, 1) (mulberry32): every run of a scenario throws the same dice. */
export function seededRandom(seed = 1) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
