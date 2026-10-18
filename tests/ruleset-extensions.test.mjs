import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {applyExtensionInstall, compareVersions, extensionOwners, planExtensionInstall, removeExtension} from "../src/configurator/ruleset-extensions.mjs";
import {exportRulesetPart, readRulesetPart} from "../src/configurator/ruleset-parts.mjs";
import {copyJSON} from "../src/configurator/configurator-schema.mjs";
import {assertValidRuleset} from "../src/configurator/configurator-validation.mjs";

const rwf = JSON.parse(fs.readFileSync(new URL("../Rulesets/rwf/rwf-ruleset-2.4.0.json", import.meta.url))).versionRecord.workingDraft;
const formula = (id, name, value) => ({...copyJSON(rwf.formulas.find(entry => entry.expression?.type === "literal") ?? rwf.formulas[0]), id, nameKey: name, expression: {type: "literal", value}, tags: []});
// An author's draft: RWF plus a "Fantaisies" extension made of two new Formulas and a changed one of RWF's.
const changed = copyJSON(rwf.formulas[0]);
changed.nameKey = `${changed.nameKey} (fantaisie)`;
const author = (formulas, version, extra = {}) => {
  const draft = copyJSON(rwf); draft.formulas = [...draft.formulas.map(entry => entry.id === changed.id ? changed : entry), ...formulas];
  return exportRulesetPart(draft, {selection: [...formulas, changed].map(entry => ({objectKind: "formula", objectId: entry.id})), expect: [],
    name: "Fantaisies", extension: {id: "fantaisies", version, minVersion: "2.0.0", ...extra}});
};
const v1 = author([formula("magie-a", "Magie A", 1), formula("magie-b", "Magie B", 2)], "1.0.0");
const install = (ruleset, part, decisions) => ({...ruleset, ...applyExtensionInstall(ruleset, part, decisions).patch});

test("versions compare number by number", () => {
  assert.equal(compareVersions("1.10.0", "1.9.2"), 1);
  assert.equal(compareVersions("2.0", "2.0.0"), 0);
  assert.equal(compareVersions("1.0.0", "1.0.1"), -1);
});

test("an extension names its target and is refused by another Ruleset or an older version", () => {
  assert.deepEqual(readRulesetPart(v1).extension, {id: "fantaisies", name: "Fantaisies", version: "1.0.0", target: {rulesetId: rwf.id, minVersion: "2.0.0"}});
  assert.equal(planExtensionInstall({...copyJSON(rwf), id: "autre"}, v1).refusal.code, "TARGET");
  assert.equal(planExtensionInstall({...copyJSON(rwf), version: "1.3.0"}, v1).refusal.code, "VERSION");
  assert.throws(() => applyExtensionInstall({...copyJSON(rwf), id: "autre"}, v1), /adds to Ruleset/);
});

test("installing records what the extension brought and replaced; removing undoes it", () => {
  const plan = planExtensionInstall(rwf, v1);
  assert.equal(plan.action, "install");
  assert.deepEqual(plan.entries.filter(row => row.status === "conflict").map(row => row.id), [changed.id]);
  const installed = install(rwf, v1, {[`formula:${changed.id}`]: "replace"});
  assertValidRuleset(installed);
  const [record] = installed.extensions;
  assert.deepEqual(record.entries.map(ref => ref.objectId).sort(), ["magie-a", "magie-b"]);
  assert.deepEqual(record.replaced.map(ref => ref.objectId), [changed.id]);
  assert.equal(extensionOwners(installed).get("formula:magie-a").name, "Fantaisies");
  const removed = {...installed, ...removeExtension(installed, "fantaisies").patch};
  assertValidRuleset(removed);
  assert.deepEqual(removed.extensions, []);
  assert.deepEqual(removed.formulas, rwf.formulas);
});

test("an update replaces the extension's own entries without asking and drops what it no longer has", () => {
  const installed = install(rwf, v1, {[`formula:${changed.id}`]: "replace"});
  const v2 = author([formula("magie-a", "Magie A", 10), formula("magie-c", "Magie C", 3)], "1.1.0");
  const plan = planExtensionInstall(installed, v2);
  assert.equal(plan.action, "update");
  assert.equal(plan.installedVersion, "1.0.0");
  assert.ok(plan.entries.every(row => row.status !== "conflict" || row.owned));
  assert.deepEqual(plan.removed.map(ref => ref.objectId), ["magie-b"]);
  const updated = install(installed, v2);
  assertValidRuleset(updated);
  assert.equal(updated.formulas.find(entry => entry.id === "magie-a").expression.value, 10);
  assert.ok(!updated.formulas.some(entry => entry.id === "magie-b"));
  const [record] = updated.extensions;
  assert.equal(record.version, "1.1.0");
  assert.deepEqual(record.entries.map(ref => ref.objectId).sort(), ["magie-a", "magie-c"]);
  // The Ruleset's own Formula it replaced still comes back on removal.
  assert.equal(record.replaced[0].previous.nameKey, rwf.formulas[0].nameKey);
  const removed = {...updated, ...removeExtension(updated, "fantaisies").patch};
  assert.deepEqual(removed.formulas, rwf.formulas);
});

test("an entry imported as a copy keeps its new id across updates", () => {
  const installed = install(rwf, v1, {[`formula:${changed.id}`]: "rename"});
  const record = installed.extensions[0], copyId = record.renamed[`formula:${changed.id}`];
  assert.ok(copyId && installed.formulas.some(entry => entry.id === copyId));
  assert.equal(installed.formulas.find(entry => entry.id === changed.id).nameKey, rwf.formulas[0].nameKey);
  const v2 = author([formula("magie-a", "Magie A", 1), formula("magie-b", "Magie B", 2)], "1.0.1");
  const plan = planExtensionInstall(installed, v2);
  assert.ok(plan.entries.every(row => row.status !== "conflict" || row.owned), JSON.stringify(plan.entries.filter(row => row.status === "conflict")));
  const updated = install(installed, v2);
  assert.equal(updated.extensions[0].renamed[`formula:${changed.id}`], copyId);
  assert.equal(updated.formulas.filter(entry => entry.nameKey === changed.nameKey).length, 1);
});

test("removal is refused while the Ruleset's own entries use what the extension brought", () => {
  const installed = install(rwf, v1);
  const user = copyJSON(installed);
  user.formulaBindings = [...user.formulaBindings];
  const action = copyJSON(user.actions[0]);
  user.actions[0] = {...action, conditionRefs: action.conditionRefs};
  const condition = copyJSON(user.conditions[0]);
  user.conditions.push({...condition, id: "utilise-magie", expression: {type: "formula", id: "magie-a"}});
  assert.throws(() => removeExtension(user, "fantaisies"), error => error.code === "EXTENSION_IN_USE" && /utilise-magie/.test(error.message));
});

test("the configurator API installs, updates and removes an extension, and the record survives a whole export", async () => {
  const {createConfiguratorAPI} = await import("../src/configurator/configurator-api.mjs");
  const {emptyStorageSnapshot} = await import("../src/configurator/configurator-storage.mjs");
  class Storage { value = emptyStorageSnapshot(); async load() { return structuredClone(this.value); } async save(v) { this.value = structuredClone(v); } }
  const api = await createConfiguratorAPI(new Storage());
  const record = JSON.parse(fs.readFileSync(new URL("../Rulesets/rwf/rwf-ruleset-2.4.0.json", import.meta.url)));
  const {versionId: v} = await api.importRuleset(record, "NEW");
  assert.equal(api.planExtensionInstall(v, v1).action, "install");
  await api.installExtension(v, v1, {});
  assert.equal(api.getRulesetVersion(v).workingDraft.extensions[0].version, "1.0.0");
  const v2 = author([formula("magie-a", "Magie A", 5)], "2.0.0");
  assert.equal(api.planExtensionInstall(v, v2).action, "update");
  await api.installExtension(v, v2, {});
  assert.ok(!api.getRulesetVersion(v).workingDraft.formulas.some(entry => entry.id === "magie-b"));
  const whole = api.exportRuleset(v);
  const {readRulesetPayload} = await import("../src/configurator/configurator-serialization.mjs");
  assert.equal(readRulesetPayload(JSON.stringify(whole)).record.workingDraft.extensions[0].version, "2.0.0");
  await api.removeExtension(v, "fantaisies");
  assert.deepEqual(api.getRulesetVersion(v).workingDraft.formulas, rwf.formulas);
});
