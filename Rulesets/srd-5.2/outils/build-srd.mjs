// Builds the SRD 5.2 Ruleset (5th edition, 2024 rules) for Rule Them'All from the SRD 5.2 data of 5e-bits/5e-database
// (src/2024/*.json) and its French translation (../sources/fr.json).
// Usage: node build-srd.mjs <repo> <srdDir> <frJson> <outDir>
import {writeFileSync, mkdirSync} from "node:fs";
import {pathToFileURL} from "node:url";
import {C, loadSources, registerAptitudes} from "./lib.mjs";
import {rules, damageRules} from "./regles.mjs";
import {combat} from "./combat.mjs";
import {feats, origins} from "./origines.mjs";
import {classLevels, classFeatures} from "./classes.mjs";
import {magic} from "./magie.mjs";
import {equipment} from "./equipement.mjs";
import {creatures} from "./creatures.mjs";
import {final} from "./final.mjs";

const [repo, srdDir, frFile, outDir] = process.argv.slice(2);
if (!outDir) { console.error("Usage: node build-srd.mjs <repo> <srdDir> <frJson> <outDir>"); process.exit(2); }
const imp = p => import(pathToFileURL(p).href);
const {createConfiguratorAPI} = await imp(`${repo}/src/configurator/configurator-api.mjs`);
const {emptyStorageSnapshot} = await imp(`${repo}/src/configurator/configurator-storage.mjs`);

loadSources(srdDir, frFile);
registerAptitudes();
rules(); damageRules(); combat(); feats(); classLevels(); magic(); classFeatures(); origins(); equipment(); creatures();
const R = final();

// Every data key a Definition carries is a declared field of its Definition Type.
const kind = v => typeof v === "boolean" ? "boolean" : typeof v === "number" ? (Number.isInteger(v) ? "integer" : "number") : "string";
for (const d of C.definitions) {
  const type = C.definitionTypes.find(t => t.id === d.definitionTypeId);
  for (const [key, v] of Object.entries(d.data ?? {})) type.fields[key] ??= {id: key, name: key, valueType: kind(v), cardinality: "one", required: false, nullable: false, constraints: []};
}

// Plain JSON only: report what is not (undefined, NaN, a function) with its path.
const bad = [];
const walk = (v, path) => { if (v === undefined || typeof v === "function" || (typeof v === "number" && !Number.isFinite(v))) bad.push(path); else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) walk(x, `${path}.${k}`); };
for (const [k, rows] of Object.entries(C)) rows.forEach(row => walk(row, `${k}/${row.id}`));
walk(R, "ruleset");
if (bad.length) { console.error(bad.slice(0, 40).join("\n")); console.error(`${bad.length} value(s) not plain JSON`); process.exit(1); }

class Storage { constructor() { this.data = emptyStorageSnapshot(); } async load() { return structuredClone(this.data); } async save(d) { this.data = structuredClone(d); } }
const api = await createConfiguratorAPI(new Storage(), {onError: e => { throw e; }});
const versionId = `srd-5-2-${R.version.replaceAll(".", "-")}`;
try { await api.createRuleset({...R, ...C, versionId}); }
catch (error) { const list = error.validation?.errors ?? []; console.error(list.length ? list.slice(0, 60).map(e => `${e.code} ${e.path}: ${e.message}`).join("\n") + `\n${list.length} error(s)` : error); process.exit(1); }
const draft = api.validateRuleset(api.getRuleset(versionId), {scope: "publish"});
if (!draft.valid) { console.error(draft.errors.slice(0, 60).map(e => `${e.code} ${e.path}: ${e.message}`).join("\n")); console.error(`${draft.errors.length} error(s)`); process.exit(1); }
await api.publishRuleset(versionId);
const exported = api.exportRuleset(versionId);
mkdirSync(outDir, {recursive: true});
writeFileSync(`${outDir}/srd-5.2-ruleset-${R.version}.json`, JSON.stringify(exported));
const counts = Object.fromEntries(Object.entries(C).map(([k, v]) => [k, v.length]).filter(([, n]) => n));
console.log(JSON.stringify({versionId, counts, warnings: draft.warnings?.length ?? 0}, null, 1));
