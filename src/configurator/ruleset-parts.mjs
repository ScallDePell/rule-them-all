import {MODULE_ID} from "../core/module-contract.mjs";
import {COLLECTION_FIELDS, copyJSON, ENGINE_CONTRACT_VERSION, isRecord} from "./configurator-schema.mjs";
import {DependencyIndex} from "./dependency-index.mjs";
import {RULESET_SECTIONS} from "./ruleset-colors.mjs";

/* A Ruleset part: some entries of a Ruleset with the entries they need, read into another Ruleset's draft.
   Entries the part does not carry are listed as expected; the receiving Ruleset must already have them. */
export const RULESET_PART_FORMAT = `${MODULE_ID}-part`;
export const RULESET_PART_FORMAT_VERSION = 1;

const KIND_BY_COLLECTION = Object.freeze(Object.fromEntries(COLLECTION_FIELDS.map(collection => [collection,
  collection === "dice" ? "die" : collection.endsWith("ies") ? `${collection.slice(0, -3)}y` : collection.replace(/s$/, "")])));
const COLLECTION_BY_KIND = Object.freeze(Object.fromEntries(Object.entries(KIND_BY_COLLECTION).map(([collection, kind]) => [kind, collection])));
// Tags name their holders by the collection less its "s", which leaves "dice" as is.
const kindOf = kind => kind === "dice" ? "die" : kind;
const keyOf = ref => `${kindOf(ref.objectKind)}:${ref.objectId}`;
export const collectionOfKind = kind => COLLECTION_BY_KIND[kindOf(kind)] ?? null;
export const kindOfCollection = collection => KIND_BY_COLLECTION[collection] ?? null;

const entryIndex = ruleset => {
  const entries = new Map();
  for (const collection of COLLECTION_FIELDS) for (const entry of ruleset?.[collection] ?? []) {
    if (isRecord(entry) && entry.id) entries.set(`${KIND_BY_COLLECTION[collection]}:${entry.id}`, {collection, kind: KIND_BY_COLLECTION[collection], entry});
  }
  return entries;
};
const dependencyMap = ruleset => {
  const targets = new Map();
  for (const edge of new DependencyIndex(ruleset).list()) {
    const from = keyOf(edge.consumerRef);
    if (!targets.has(from)) targets.set(from, []);
    targets.get(from).push(keyOf(edge.targetRef));
  }
  return targets;
};
const refOf = key => {const at = key.indexOf(":"); return {objectKind: key.slice(0, at), objectId: key.slice(at + 1)};};

/** What a selection needs, all the way down: entries of the Ruleset, in the order they are first reached.
    Entries named in `stop` are reached but not followed (they will be expected, not carried). */
export function collectDependencies(ruleset, selection, {stop = []} = {}) {
  const entries = entryIndex(ruleset), targets = dependencyMap(ruleset), stopped = new Set(stop.map(keyOf));
  const roots = [...new Set(selection.map(keyOf))].filter(key => entries.has(key));
  const seen = new Set(roots), dependencies = [], queue = roots.filter(key => !stopped.has(key));
  while (queue.length) for (const target of targets.get(queue.shift()) ?? []) {
    if (seen.has(target) || !entries.has(target)) continue;
    seen.add(target); dependencies.push(target);
    if (!stopped.has(target)) queue.push(target);
  }
  return {roots: roots.map(refOf), dependencies: dependencies.map(refOf)};
}

/** The entries one configurator view lists: a family, or the Definitions / Contents of one type with that type. */
export function selectionForView(ruleset, view) {
  const all = collection => (ruleset?.[collection] ?? []).map(entry => ({objectKind: KIND_BY_COLLECTION[collection], objectId: entry.id}));
  for (const [prefix, typeCollection, collection, field] of [["definitions:", "definitionTypes", "definitions", "definitionTypeId"], ["content:", "contentTypes", "contentTemplates", "contentTypeId"]]) {
    if (!view.startsWith(prefix)) continue;
    const typeId = view.slice(prefix.length);
    return [{objectKind: KIND_BY_COLLECTION[typeCollection], objectId: typeId},
      ...(ruleset?.[collection] ?? []).filter(entry => entry[field] === typeId).map(entry => ({objectKind: KIND_BY_COLLECTION[collection], objectId: entry.id}))];
  }
  return COLLECTION_FIELDS.includes(view) ? all(view) : [];
}

/** Every entry of one section of the configurator. */
export function selectionForSection(ruleset, sectionId) {
  const section = RULESET_SECTIONS.find(entry => entry.id === sectionId);
  return (section?.collections ?? []).flatMap(collection => selectionForView(ruleset, collection));
}

const stringsOf = (value, out = new Set()) => {
  if (typeof value === "string") out.add(value);
  else if (Array.isArray(value)) value.forEach(part => stringsOf(part, out));
  else if (isRecord(value)) Object.values(value).forEach(part => stringsOf(part, out));
  return out;
};

/** A part holding the selection and its dependencies, except those in `expect` (and what only they need). */
export function exportRulesetPart(ruleset, {selection, expect = [], name = "", worldLocalizations = {}, extension = null} = {}) {
  if (!Array.isArray(selection) || !selection.length) throw new Error("A Ruleset part needs at least one entry.");
  const entries = entryIndex(ruleset), expected = new Set(expect.map(keyOf));
  const {roots, dependencies} = collectDependencies(ruleset, selection, {stop: expect});
  if (!roots.length) throw new Error("None of the chosen entries is in this Ruleset.");
  const carried = [...roots, ...dependencies].map(keyOf).filter(key => !expected.has(key) || roots.some(root => keyOf(root) === key));
  const part = {format: RULESET_PART_FORMAT, formatVersion: RULESET_PART_FORMAT_VERSION, engineContractVersion: ENGINE_CONTRACT_VERSION,
    name: String(name ?? ""), source: {rulesetId: ruleset.id, version: ruleset.version, nameKey: ruleset.nameKey ?? ""},
    roots: copyJSON(roots), entries: {}, expects: [], localizations: {}};
  for (const key of carried) {
    const {collection, entry} = entries.get(key);
    (part.entries[collection] ??= []).push(copyJSON(entry));
  }
  for (const key of dependencies.map(keyOf).filter(key => expected.has(key))) {
    const {kind, entry} = entries.get(key);
    part.expects.push({objectKind: kind, objectId: entry.id, nameKey: entry.nameKey ?? ""});
  }
  // World translations of the texts the carried entries use.
  const texts = stringsOf(part.entries);
  for (const [locale, translations] of Object.entries(worldLocalizations ?? {})) for (const [key, text] of Object.entries(translations ?? {})) {
    if (texts.has(key)) (part.localizations[locale] ??= {})[key] = text;
  }
  // An extension names itself, its version, and the Ruleset (from which version) it adds to.
  if (extension) part.extension = {id: String(extension.id), name: String(extension.name || name), version: String(extension.version),
    target: {rulesetId: ruleset.id, ...(extension.minVersion ? {minVersion: String(extension.minVersion)} : {})}};
  return part;
}

/** A part read from a file or an object; throws when it is not one. */
export function readRulesetPart(payload) {
  const part = copyJSON(typeof payload === "string" ? JSON.parse(payload) : payload);
  if (!isRecord(part) || part.format !== RULESET_PART_FORMAT || part.formatVersion !== RULESET_PART_FORMAT_VERSION) throw new Error("Unsupported Ruleset part format.");
  if (part.engineContractVersion !== ENGINE_CONTRACT_VERSION) throw new Error("Unsupported engine contract version.");
  if (!isRecord(part.entries) || !Array.isArray(part.expects) || !Array.isArray(part.roots)) throw new Error("Invalid Ruleset part.");
  for (const [collection, list] of Object.entries(part.entries)) {
    if (!COLLECTION_FIELDS.includes(collection) || !Array.isArray(list)) throw new Error(`Invalid Ruleset part collection: ${collection}.`);
    if (list.some(entry => !isRecord(entry) || typeof entry.id !== "string" || !entry.id.trim())) throw new Error(`Invalid Ruleset part entry in ${collection}.`);
  }
  part.localizations = isRecord(part.localizations) ? part.localizations : {};
  if (part.extension !== undefined) {
    const header = part.extension, text = value => typeof value === "string" && value.trim().length > 0;
    if (!isRecord(header) || !text(header.id) || !text(header.name) || !text(header.version) || !isRecord(header.target) || !text(header.target.rulesetId)
      || (header.target.minVersion !== undefined && !text(header.target.minVersion))) throw new Error("Invalid Ruleset extension header.");
  }
  return part;
}

export const isRulesetPart = payload => isRecord(payload) && payload.format === RULESET_PART_FORMAT;

const canonical = value => Array.isArray(value) ? value.map(canonical)
  : isRecord(value) ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const same = (a, b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));

/** What reading a part into a Ruleset would do: each entry is new, the same as the one there, or in conflict with it;
    expected entries the Ruleset lacks block the import. */
export function planRulesetPartImport(ruleset, payload) {
  const part = readRulesetPart(payload), present = entryIndex(ruleset), roots = new Set(part.roots.map(keyOf));
  const entries = Object.entries(part.entries).flatMap(([collection, list]) => list.map(entry => {
    const kind = KIND_BY_COLLECTION[collection], key = `${kind}:${entry.id}`, current = present.get(key)?.entry;
    return {key, collection, kind, id: entry.id, nameKey: entry.nameKey ?? "", root: roots.has(key),
      status: !current ? "new" : same(current, entry) ? "same" : "conflict", currentNameKey: current?.nameKey ?? ""};
  }));
  const missing = part.expects.filter(ref => !present.has(keyOf(ref))).map(ref => copyJSON(ref));
  return {name: part.name, source: copyJSON(part.source), entries, missing, blocked: missing.length > 0};
}

const pathTokens = path => [...path.matchAll(/([^.[\]]+)|\[(\d+)\]/g)].map(match => match[2] !== undefined ? Number(match[2]) : match[1]);
/** Points the reference found at `path` (an id, a typed reference, or a node naming one) to the new id. */
function rewriteAt(root, path, oldId, newId) {
  const tokens = pathTokens(path), last = tokens.pop();
  let holder = root;
  for (const token of tokens) {holder = holder?.[token]; if (holder === undefined || holder === null) return;}
  const value = holder?.[last];
  if (value === oldId) {holder[last] = newId; return;}
  if (!isRecord(value)) return;
  if (value.objectId === oldId) value.objectId = newId;
  else if (isRecord(value.reference) && value.reference.objectId === oldId) value.reference.objectId = newId;
  else if (value.id === oldId) value.id = newId;
  else if (value.contentTypeId === oldId) value.contentTypeId = newId;
}

const freeId = (id, taken) => {
  for (let n = 2; ; n++) {const candidate = `${id}-${n}`; if (!taken.has(candidate)) {taken.add(candidate); return candidate;}}
};

/** The part's entries by collection, with the entries named in `renamed` ("kind:id" -> new id) under their new id
    and every reference the dependency index finds inside the part following them. Same order as the part. */
export function renamePartEntries(part, renamed) {
  const carried = Object.fromEntries(COLLECTION_FIELDS.map(collection => [collection, copyJSON(part.entries[collection] ?? [])]));
  if (!renamed.size) return carried;
  for (const edge of new DependencyIndex({id: "part", ...carried}).list()) {
    const newId = renamed.get(keyOf(edge.targetRef));
    if (newId) rewriteAt(carried, edge.path, edge.targetRef.objectId, newId);
  }
  for (const action of carried.actions) for (const [eventTypeId, values] of Object.entries(action.eventPayloads ?? {})) {
    const newId = renamed.get(`eventType:${eventTypeId}`);
    if (newId) {delete action.eventPayloads[eventTypeId]; action.eventPayloads[newId] = values;}
  }
  for (const collection of COLLECTION_FIELDS) for (const entry of carried[collection]) {
    const newId = renamed.get(`${KIND_BY_COLLECTION[collection]}:${entry.id}`);
    if (newId) entry.id = newId;
  }
  return carried;
}

/** The Ruleset patch reading a part gives. `decisions` maps "kind:id" of conflicting entries to keep (the Ruleset's
    own stays and the part uses it), replace, or rename (the part's comes in under a free id, and the part's
    references follow it). Undecided conflicts keep the Ruleset's entry. */
export function applyRulesetPartImport(ruleset, payload, decisions = {}) {
  const part = readRulesetPart(payload), plan = planRulesetPartImport(ruleset, part);
  if (plan.blocked) throw new Error(`Ruleset part needs entries this Ruleset lacks: ${plan.missing.map(ref => `${ref.objectKind} ${ref.objectId}`).join(", ")}.`);
  const choice = new Map(plan.entries.map(row => [row.key, row.status === "conflict" ? (decisions[row.key] ?? "keep") : row.status]));
  for (const [key, value] of choice) if (!["new", "same", "keep", "replace", "rename"].includes(value)) throw new Error(`Unknown import choice for ${key}: ${value}.`);
  const taken = new Set(COLLECTION_FIELDS.flatMap(collection => [...(ruleset?.[collection] ?? []), ...(part.entries[collection] ?? [])].map(entry => entry?.id)));
  const renamed = new Map();
  for (const row of plan.entries) if (choice.get(row.key) === "rename") renamed.set(row.key, freeId(row.id, taken));
  // References inside the part follow renamed entries, wherever the dependency index finds them.
  const carried = renamePartEntries(part, renamed);
  const patch = {}, created = [], replaced = [];
  for (const collection of COLLECTION_FIELDS) {
    const kind = KIND_BY_COLLECTION[collection];
    let list = null;
    for (const [i, entry] of carried[collection].entries()) {
      const key = `${kind}:${part.entries[collection][i].id}`, decision = choice.get(key);
      if (decision === "same" || decision === "keep") continue;
      list ??= copyJSON(ruleset?.[collection] ?? []);
      if (decision === "replace") {list[list.findIndex(current => current.id === entry.id)] = entry; replaced.push({collection, id: entry.id}); continue;}
      list.push(entry); created.push({collection, id: entry.id, nameKey: entry.nameKey ?? ""});
    }
    if (list) patch[collection] = list;
  }
  return {patch, created, replaced, renamed: Object.fromEntries(renamed), localizations: copyJSON(part.localizations)};
}
