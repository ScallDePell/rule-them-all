// Acquires every content template of the Ruleset on a fresh Actor and reports failures and timings.
// Usage: node verify-all.mjs <repo> <package.json>
import {readFileSync} from "node:fs";
import {pathToFileURL} from "node:url";
import assert from "node:assert/strict";
const [repo, file] = process.argv.slice(2);
const imp = p => import(pathToFileURL(`${repo}/src/${p}`).href);
const {createConfiguratorAPI} = await imp("configurator/configurator-api.mjs");
const {emptyStorageSnapshot} = await imp("configurator/configurator-storage.mjs");
const {MemoryRuntimeAdapter} = await imp("runtime/memory-runtime-adapter.mjs");
const {createRuntimeAPI} = await imp("runtime/runtime-api.mjs");
const {FoundryContentBridge} = await imp("runtime/foundry-content-bridge.mjs");

class Storage { data = emptyStorageSnapshot(); async load() { return structuredClone(this.data); } async save(d) { this.data = structuredClone(d); } }
const actors = new Map();
const makeActor = (name) => { const uuid = `Actor.${actors.size + 1}`; const a = {uuid, documentName: "Actor", name, type: "character", flags: {}, getFlag(s, k) { return this.flags[s]?.[k]; }, async setFlag(s, k, v) { (this.flags[s] ??= {})[k] = structuredClone(v); }, async delete() { actors.delete(uuid); }}; actors.set(uuid, a); return a; };
let nextNatural = 10;
class Adapter extends MemoryRuntimeAdapter {
  async resolveDocument(uuid) { const a = actors.get(uuid); if (!a) throw new Error("Actor not found"); return a; }
  async canWrite() { return true; }
  async roll(formula) { assert.equal(formula, "1d20"); return {formula, result: String(nextNatural), total: nextNatural, natural: nextNatural}; }
}
const api = await createConfiguratorAPI(new Storage());
const imported = await api.importRuleset(readFileSync(file, "utf8"), "NEW");
const v = imported.versionId;
const runtime = createRuntimeAPI(api, {adapter: new Adapter(), hooks: null});
const bridge = new FoundryContentBridge(api, runtime, {hooks: null, documentTypeResolver: () => "character"});
globalThis.Actor = {create: data => makeActor(data.name)};
const ruleset = api.getRuleset(v);
const kinds = Object.fromEntries(ruleset.contentTypes.map(t => [t.id, t.documentName ?? t.storage ?? t.documentKind]));
const failures = []; const times = {}; let n = 0;
for (const t of ruleset.contentTemplates) {
  const holder = makeActor(`Porteur ${t.id}`);
  const selections = Object.fromEntries((t.choiceGroups ?? []).map(g => [g.id, g.options.slice(0, g.min).map(o => o.id)]));
  const t0 = Date.now();
  try { await bridge.acquireTemplate(v, holder.uuid, t.id, {sourceItemId: `item-${t.id}`, selections}); n++; }
  catch (e) { failures.push([t.id, e.message]); }
  const ms = Date.now() - t0; const k = t.contentTypeId ?? t.contentTypeRef ?? "?";
  (times[k] ??= []).push(ms);
  actors.delete(holder.uuid);
}
console.log(JSON.stringify({acquired: n, total: ruleset.contentTemplates.length, failures, times: Object.fromEntries(Object.entries(times).map(([k, a]) => [k, {n: a.length, avgMs: Math.round(a.reduce((x, y) => x + y, 0) / a.length), maxMs: Math.max(...a)}]))}, null, 1));
