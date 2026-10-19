import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {applyRulesetPartImport, collectDependencies, exportRulesetPart, planRulesetPartImport, readRulesetPart, selectionForSection, selectionForView, RULESET_PART_FORMAT} from "../src/configurator/ruleset-parts.mjs";
import {COLLECTION_FIELDS, copyJSON, createRulesetData} from "../src/configurator/configurator-schema.mjs";
import {assertValidRuleset} from "../src/configurator/configurator-validation.mjs";
import {DependencyIndex} from "../src/configurator/dependency-index.mjs";

const rwf = JSON.parse(fs.readFileSync(new URL("../Rulesets/rwf/rwf-ruleset-2.6.0.json", import.meta.url))).versionRecord.workingDraft;
const empty = () => createRulesetData({id: "autre", nameKey: "Autre", version: "1.0.0"});
const ids = part => Object.values(part.entries).flat().map(entry => entry.id);
const pcSheet = rwf.sheetDefinitions[0];

test("an Action leaves with everything it needs and reads into an empty Ruleset", () => {
  const action = rwf.actions.find(entry => entry.testRef) ?? rwf.actions[0];
  const part = exportRulesetPart(rwf, {selection: [{objectKind: "action", objectId: action.id}], name: "Attaque"});
  assert.equal(part.format, RULESET_PART_FORMAT);
  assert.deepEqual(part.roots, [{objectKind: "action", objectId: action.id}]);
  assert.ok(part.entries.actions.some(entry => entry.id === action.id));
  if (action.testRef) assert.ok(part.entries.tests.some(entry => entry.id === action.testRef));
  assert.deepEqual(part.expects, []);
  const target = empty(), {patch, created} = applyRulesetPartImport(target, part);
  assert.equal(created.length, ids(part).length);
  assertValidRuleset({...target, ...patch});
});

test("a sheet leaves with its theme, blocks and the Definitions it shows", () => {
  const part = exportRulesetPart(rwf, {selection: [{objectKind: "sheetDefinition", objectId: pcSheet.id}]});
  const deps = new DependencyIndex(rwf).list().filter(edge => edge.consumerRef.objectKind === "sheetDefinition" && edge.consumerRef.objectId === pcSheet.id);
  for (const edge of deps) assert.ok(ids(part).includes(edge.targetRef.objectId) || !rwf[COLLECTION_FIELDS.find(c => (rwf[c] ?? []).some(e => e.id === edge.targetRef.objectId))], `${edge.targetRef.objectKind} ${edge.targetRef.objectId}`);
  assertValidRuleset({...empty(), ...applyRulesetPartImport(empty(), part).patch});
});

test("dependencies left out are expected, and what only they need stays home", () => {
  const action = rwf.actions.find(entry => entry.testRef);
  const full = collectDependencies(rwf, [{objectKind: "action", objectId: action.id}]);
  const test = {objectKind: "test", objectId: action.testRef};
  const part = exportRulesetPart(rwf, {selection: [{objectKind: "action", objectId: action.id}], expect: [test]});
  assert.ok(!ids(part).includes(action.testRef));
  assert.deepEqual(part.expects.map(ref => ref.objectId), [action.testRef]);
  assert.ok(ids(part).length < full.dependencies.length + 1);
  // Without the Test, the import is blocked; with it, it goes through.
  const plan = planRulesetPartImport(empty(), part);
  assert.equal(plan.blocked, true);
  assert.throws(() => applyRulesetPartImport(empty(), part), /lacks/);
  const withTest = {...empty(), ...applyRulesetPartImport(empty(), exportRulesetPart(rwf, {selection: [test]})).patch};
  assert.equal(planRulesetPartImport(withTest, part).blocked, false);
  assertValidRuleset({...withTest, ...applyRulesetPartImport(withTest, part).patch});
});

test("reading a part into its own Ruleset finds every entry the same", () => {
  const part = exportRulesetPart(rwf, {selection: selectionForView(rwf, "actions")});
  const plan = planRulesetPartImport(rwf, part);
  assert.ok(plan.entries.every(row => row.status === "same"));
  assert.deepEqual(applyRulesetPartImport(rwf, part).patch, {});
});

test("conflicts keep, replace or rename, and renamed entries carry the part's references along", () => {
  const changed = copyJSON(rwf);
  for (const collection of COLLECTION_FIELDS) for (const entry of changed[collection]) entry.nameKey = `${entry.nameKey ?? entry.id} (ici)`;
  const part = exportRulesetPart(rwf, {selection: [{objectKind: "sheetDefinition", objectId: pcSheet.id}]});
  const plan = planRulesetPartImport(changed, part);
  assert.ok(plan.entries.every(row => row.status === "conflict"));
  // Undecided: the Ruleset's own entries stay.
  assert.deepEqual(applyRulesetPartImport(changed, part).patch, {});
  const keys = plan.entries.map(row => row.key);
  const replace = applyRulesetPartImport(changed, part, Object.fromEntries(keys.map(key => [key, "replace"])));
  const replaced = {...changed, ...replace.patch};
  assertValidRuleset(replaced);
  assert.equal(replaced.sheetDefinitions.find(entry => entry.id === pcSheet.id).nameKey, pcSheet.nameKey);
  const rename = applyRulesetPartImport(changed, part, Object.fromEntries(keys.map(key => [key, "rename"])));
  const renamed = {...changed, ...rename.patch};
  assertValidRuleset(renamed);
  const newIds = new Set(Object.values(rename.renamed));
  assert.equal(newIds.size, keys.length);
  // Every reference a renamed entry makes points to another renamed entry.
  for (const edge of new DependencyIndex(renamed).list()) if (newIds.has(edge.consumerRef.objectId)) assert.ok(newIds.has(edge.targetRef.objectId), `${edge.consumerRef.objectId} -> ${edge.targetRef.objectId} at ${edge.path}`);
});

test("a whole section or the Definitions of one type make a selection", () => {
  const type = rwf.definitionTypes[0];
  const view = selectionForView(rwf, `definitions:${type.id}`);
  assert.deepEqual(view[0], {objectKind: "definitionType", objectId: type.id});
  assert.equal(view.length, 1 + rwf.definitions.filter(entry => entry.definitionTypeId === type.id).length);
  const rules = selectionForSection(rwf, "rules");
  assert.ok(rules.some(ref => ref.objectKind === "action") && rules.some(ref => ref.objectKind === "die") === rwf.dice.length > 0);
  const part = exportRulesetPart(rwf, {selection: selectionForSection(rwf, "systems")});
  assertValidRuleset({...empty(), ...applyRulesetPartImport(empty(), part).patch});
});

test("world translations of the carried texts travel with the part", () => {
  const action = rwf.actions[0];
  const part = exportRulesetPart(rwf, {selection: [{objectKind: "action", objectId: action.id}], worldLocalizations: {fr: {[action.nameKey]: "Autre nom", "pas-utilise": "x"}}});
  assert.deepEqual(part.localizations, {fr: {[action.nameKey]: "Autre nom"}});
  assert.throws(() => readRulesetPart({format: "rta-ruleset"}), /Unsupported Ruleset part/);
  assert.throws(() => readRulesetPart({...part, entries: {bogus: []}}), /collection/);
});

test("the dialogs list dependencies by family and conflicts with their choices, escaped", async () => {
  const {groupPartRefs, partFileName, partImportView} = await import("../src/configurator/ruleset-part-view.mjs");
  const {renderPartExportContent, renderPartImportContent} = await import("../src/ui/dialog-markup.mjs");
  const groups = groupPartRefs([{objectKind: "formula", objectId: "b"}, {objectKind: "definitionType", objectId: "t"}, {objectKind: "formula", objectId: "a"}, {objectKind: "die", objectId: "d"}], (collection, id) => `<${id}>`);
  assert.deepEqual(groups.map(group => group.collection), ["definitionTypes", "formulas", "dice"]);
  assert.deepEqual(groups[1].items.map(item => item.key), ["formula:a", "formula:b"]);
  const html = renderPartExportContent("Feuille", "1", groups.map(group => ({...group, title: group.collection})), {name: "N", dependencies: "D", hint: "H", none: "-"});
  assert.match(html, /data-part-group="1"[^>]*checked/);
  assert.match(html, /name="include" value="formula:a" data-part-member="1" checked> &lt;a&gt;/);
  assert.equal(partFileName("Feuille de PJ é!"), "rta-part-feuille-de-pj-e.json");
  const view = partImportView({entries: [{key: "action:x", collection: "actions", id: "x", nameKey: "X", status: "conflict"}, {key: "test:y", collection: "tests", id: "y", status: "new"}, {key: "roll:z", collection: "rolls", id: "z", status: "same"}]}, (collection, row) => row.nameKey || row.id);
  assert.deepEqual(view.counts, {new: 1, same: 1, conflict: 1});
  const form = renderPartImportContent("S", view.conflicts.map(row => ({...row, title: "Actions"})), view.added.map(row => ({...row, title: "Tests"})), [{value: "keep", label: "K"}, {value: "rename", label: "R"}], {conflicts: "C", hint: "H", added: "A"});
  assert.match(form, /<select name="decision" data-key="action:x"><option value="keep">K<\/option>/);
  assert.match(form, /A \(1\)/);
});

test("the configurator API exports a part and reads it into another draft, with its translations", async () => {
  const {createConfiguratorAPI} = await import("../src/configurator/configurator-api.mjs");
  const {emptyStorageSnapshot} = await import("../src/configurator/configurator-storage.mjs");
  class Storage { value = emptyStorageSnapshot(); async load() { return structuredClone(this.value); } async save(v) { this.value = structuredClone(v); } }
  const api = await createConfiguratorAPI(new Storage());
  const source = (await api.createRuleset({id: "source", nameKey: "Source", version: "1.0.0"})).versionId;
  await api.registerDefinitionType(source, {id: "stat", key: "stat", nameKey: "Stat", allowedCapabilities: ["value"], defaultCapabilities: ["value"], requiredCapabilities: [], fields: {}});
  await api.createDefinition(source, {id: "force", key: "force", definitionTypeId: "stat", nameKey: "Force", data: {}, capabilities: ["value"]});
  await api.setWorldOverride(source, "fr", "Force", "Puissance");
  const part = api.exportRulesetPart(source, {selection: [{objectKind: "definition", objectId: "force"}], name: "Force"});
  assert.deepEqual(ids(part).sort(), ["force", "stat"]);
  const target = (await api.createRuleset({id: "target", nameKey: "Target", version: "1.0.0"})).versionId;
  assert.equal(api.planRulesetPartImport(target, part).entries.every(row => row.status === "new"), true);
  const result = await api.importRulesetPart(target, part, {});
  assert.equal(result.created.length, 2);
  assert.equal(api.getDefinition(target, "force").nameKey, "Force");
  assert.equal(api.getWorldOverride(target, "fr", "Force"), "Puissance");
  await api.publishRuleset(target); await api.validateRulesetVersion(target);
  await assert.rejects(api.importRulesetPart(target, part, {}));
});
