import {COLLECTION_FIELDS, copyJSON} from "./configurator-schema.mjs";
import {DependencyIndex} from "./dependency-index.mjs";
import {applyRulesetPartImport, collectionOfKind, kindOfCollection, planRulesetPartImport, readRulesetPart, renamePartEntries} from "./ruleset-parts.mjs";

/* Ruleset extensions: parts with a header (id, name, version, the Ruleset they add to and from which version).
   The Ruleset keeps one record per installed extension: the entries it brought, the Ruleset's own entries it
   replaced (with their previous content) and the ids it renamed, so a new version updates it and removal undoes it. */

const keyOf = ref => `${ref.objectKind}:${ref.objectId}`;
const refOf = key => {const at = key.indexOf(":"); return {objectKind: key.slice(0, at), objectId: key.slice(at + 1)};};

/** Compares dotted versions number by number ("1.10.0" > "1.9.2"); a part that is not a number compares as text. */
export function compareVersions(a, b) {
  const left = String(a).split("."), right = String(b).split(".");
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    const x = left[i] ?? "0", y = right[i] ?? "0", nx = Number(x), ny = Number(y);
    const order = Number.isFinite(nx) && Number.isFinite(ny) ? nx - ny : x.localeCompare(y);
    if (order) return Math.sign(order);
  }
  return 0;
}

export const installedExtensions = ruleset => copyJSON(ruleset?.extensions ?? []);
/** Which installed extension brought each entry: "kind:id" -> its record. */
export function extensionOwners(ruleset) {
  const owners = new Map();
  for (const extension of ruleset?.extensions ?? []) for (const ref of [...extension.entries, ...extension.replaced]) owners.set(keyOf(ref), extension);
  return owners;
}

/** The part as this Ruleset will read it: an installed version's renamed ids are kept by the new version. */
function preparePart(ruleset, payload) {
  const part = readRulesetPart(payload);
  if (!part.extension) throw new Error("This Ruleset part is not an extension.");
  const header = part.extension, previous = (ruleset.extensions ?? []).find(extension => extension.id === header.id) ?? null;
  if (header.target.rulesetId !== ruleset.id) return {part, header, previous, refusal: {code: "TARGET", rulesetId: header.target.rulesetId}};
  if (header.target.minVersion && compareVersions(ruleset.version, header.target.minVersion) < 0) return {part, header, previous, refusal: {code: "VERSION", minVersion: header.target.minVersion}};
  const renamed = new Map(Object.entries(previous?.renamed ?? {}));
  const carried = renamePartEntries(part, renamed);
  const renamedPart = {...part, entries: Object.fromEntries(Object.entries(carried).filter(([, list]) => list.length)),
    roots: part.roots.map(ref => renamed.has(keyOf(ref)) ? {...ref, objectId: renamed.get(keyOf(ref))} : ref)};
  return {part: renamedPart, header, previous, renamed, refusal: null};
}

/** What installing (or updating) an extension would do. Entries of an installed version are the extension's own:
    they are replaced without asking, and those the new version drops are removed. Only conflicts with the
    Ruleset's own entries are left to decide. */
export function planExtensionInstall(ruleset, payload) {
  const {part, header, previous, refusal} = preparePart(ruleset, payload);
  const base = {extension: copyJSON(header), installedVersion: previous?.version ?? null,
    action: !previous ? "install" : compareVersions(header.version, previous.version) > 0 ? "update" : compareVersions(header.version, previous.version) < 0 ? "downgrade" : "reinstall"};
  if (refusal) return {...base, refusal, entries: [], missing: [], removed: [], blocked: true};
  const plan = planRulesetPartImport(ruleset, part), owned = new Set([...(previous?.entries ?? []), ...(previous?.replaced ?? [])].map(keyOf));
  const entries = plan.entries.map(row => ({...row, owned: owned.has(row.key)}));
  const carried = new Set(entries.map(row => row.key));
  const removed = [...owned].filter(key => !carried.has(key)).map(refOf);
  return {...base, refusal: null, entries, missing: plan.missing, removed, blocked: plan.blocked};
}

/** The Ruleset patch installing or updating an extension, with its new record. `decisions` decides conflicts with
    the Ruleset's own entries, as for any part. */
export function applyExtensionInstall(ruleset, payload, decisions = {}) {
  const {part, header, previous, renamed: kept, refusal} = preparePart(ruleset, payload);
  if (refusal) throw new Error(refusal.code === "TARGET" ? `This extension adds to Ruleset ${refusal.rulesetId}.` : `This extension needs version ${refusal.minVersion} of the Ruleset or later.`);
  const plan = planExtensionInstall(ruleset, payload);
  const forced = Object.fromEntries(plan.entries.filter(row => row.owned && row.status === "conflict").map(row => [row.key, "replace"]));
  const result = applyRulesetPartImport(ruleset, part, {...decisions, ...forced});
  const next = {...copyJSON(ruleset), ...result.patch};
  // What the previous version had and this one drops: its own entries go, the Ruleset's replaced entries come back.
  const previousContent = new Map((previous?.replaced ?? []).map(ref => [keyOf(ref), ref.previous]));
  const restored = [];
  for (const ref of plan.removed) {
    const collection = collectionOfKind(ref.objectKind), list = next[collection] ?? [], at = list.findIndex(entry => entry.id === ref.objectId);
    if (at < 0) continue;
    if (previousContent.has(keyOf(ref))) {list[at] = copyJSON(previousContent.get(keyOf(ref))); restored.push(ref);}
    else list.splice(at, 1);
  }
  const brought = new Set((previous?.entries ?? []).map(keyOf));
  const entries = [], replaced = [];
  for (const row of result.created) entries.push({objectKind: kindOfCollection(row.collection), objectId: row.id});
  for (const row of result.replaced) {
    const ref = {objectKind: kindOfCollection(row.collection), objectId: row.id}, key = keyOf(ref);
    if (brought.has(key)) entries.push(ref);
    else replaced.push({...ref, previous: previousContent.has(key) ? copyJSON(previousContent.get(key)) : copyJSON((ruleset[row.collection] ?? []).find(entry => entry.id === row.id))});
  }
  // Entries of the previous version this one carries unchanged stay the extension's.
  for (const row of plan.entries) if (row.owned && row.status === "same") {
    const ref = refOf(row.key);
    if (previousContent.has(row.key)) replaced.push({...ref, previous: copyJSON(previousContent.get(row.key))}); else entries.push(ref);
  }
  const record = {id: header.id, name: header.name, version: header.version, entries, replaced,
    renamed: {...Object.fromEntries(kept ?? []), ...originalKeys(result.renamed, kept)}};
  const others = (ruleset.extensions ?? []).filter(extension => extension.id !== header.id);
  const patch = {extensions: [...others, record]};
  for (const collection of COLLECTION_FIELDS) if (result.patch[collection] || plan.removed.some(ref => collectionOf(ref) === collection)) patch[collection] = next[collection];
  assertNothingNeedsRemoved(next, plan.removed.filter(ref => !restored.some(r => keyOf(r) === keyOf(ref))));
  return {patch, record, created: result.created, replaced: result.replaced, removed: plan.removed, localizations: result.localizations};
}
const collectionOf = ref => collectionOfKind(ref.objectKind);
// Renames made now are keyed by the part's own ids; keep them so the next version finds them.
const originalKeys = (renamed, kept) => {
  const back = new Map([...(kept ?? new Map())].map(([key, id]) => [`${refOf(key).objectKind}:${id}`, key]));
  return Object.fromEntries(Object.entries(renamed).map(([key, id]) => [back.get(key) ?? key, id]));
};

/** Throws, naming who still uses them, when entries about to disappear are needed by what stays. */
function assertNothingNeedsRemoved(next, gone) {
  if (!gone.length) return;
  const goneKeys = new Set(gone.map(keyOf)), users = [];
  for (const edge of new DependencyIndex(next).list()) if (goneKeys.has(keyOf(edge.targetRef)) && !goneKeys.has(keyOf(edge.consumerRef))) users.push(edge);
  if (users.length) {
    const error = new Error(`Still used: ${[...new Set(users.map(edge => `${edge.consumerRef.objectKind} ${edge.consumerRef.objectId} uses ${edge.targetRef.objectKind} ${edge.targetRef.objectId}`))].join(", ")}.`);
    error.code = "EXTENSION_IN_USE"; error.users = users.map(edge => ({consumer: edge.consumerRef, target: edge.targetRef}));
    throw error;
  }
}

/** The Ruleset patch removing an installed extension: the entries it brought go, the entries it replaced come back.
    Refused, naming them, while the Ruleset's own entries still use what it brought. */
export function removeExtension(ruleset, extensionId) {
  const record = (ruleset.extensions ?? []).find(extension => extension.id === extensionId);
  if (!record) throw new Error(`Extension not installed: ${extensionId}.`);
  const next = copyJSON(ruleset), touched = new Set();
  for (const ref of record.replaced) {
    const collection = collectionOf(ref), list = next[collection] ?? [], at = list.findIndex(entry => entry.id === ref.objectId);
    if (at >= 0) list[at] = copyJSON(ref.previous); else list.push(copyJSON(ref.previous));
    touched.add(collection);
  }
  const gone = record.entries.filter(ref => (next[collectionOf(ref)] ?? []).some(entry => entry.id === ref.objectId));
  for (const ref of gone) {next[collectionOf(ref)] = next[collectionOf(ref)].filter(entry => entry.id !== ref.objectId); touched.add(collectionOf(ref));}
  assertNothingNeedsRemoved(next, gone);
  const patch = {extensions: next.extensions.filter(extension => extension.id !== extensionId)};
  for (const collection of touched) patch[collection] = next[collection];
  return {patch, removed: gone, restored: record.replaced.map(ref => ({objectKind: ref.objectKind, objectId: ref.objectId}))};
}
