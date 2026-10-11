import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {applyRuntimeChoice, describeRuntimeResult} from "../src/configurator/runtime-lab-view.mjs";
import {MemoryRuntimeAdapter} from "../src/runtime/memory-runtime-adapter.mjs";

const list = [{id: "a"}, {id: "b"}];

test("Runtime Lab: an unset choice gets a default, a cleared one stays cleared", () => {
  const selection = {testId: null, target: null};
  assert.equal(applyRuntimeChoice(selection, "testId", list), "a");
  assert.equal(applyRuntimeChoice(selection, "target", list, {fallbackIndex: 1}), "b");
  selection.testId = "";
  assert.equal(applyRuntimeChoice(selection, "testId", list), "");
  assert.equal(selection.testId, "");
});

test("Runtime Lab: a choice whose entry disappeared falls back to a default", () => {
  const selection = {testId: "deleted"};
  assert.equal(applyRuntimeChoice(selection, "testId", list), "a");
  const empty = {testId: "deleted"};
  assert.equal(applyRuntimeChoice(empty, "testId", []), "");
});

test("Runtime Lab: results are translated cards with a tone", () => {
  const i18n = (key, data) => data ? `${key}:${JSON.stringify(data)}` : key;
  const nameOf = (collection, id) => `${collection}/${id}`;
  const testCard = describeRuntimeResult("test", {roll: {formula: "1d20", total: 12}, bonus: 2, total: 14, target: 10, margin: 4, outcome: {id: "hit"}}, {i18n, nameOf});
  assert.equal(testCard.title, "RTA.Lab.Result.Test");
  assert.equal(testCard.tone, "success");
  assert.equal(testCard.message, "outcomes/hit");
  assert.deepEqual(testCard.rows.map(row => row.value), ["1d20 → 12", "2", "14", "10", "4"]);
  assert.equal(describeRuntimeResult("condition", {value: false}, {i18n}).tone, "failure");
  const blocked = describeRuntimeResult("action", {allowed: false, reason: "condition", conditionId: "alive", preview: true}, {i18n, nameOf});
  assert.equal(blocked.title, "RTA.Lab.Result.ActionPreview");
  assert.match(blocked.message, /conditions\/alive/);
  assert.deepEqual(describeRuntimeResult("event", {triggered: [{triggerId: "t1"}]}, {i18n, nameOf}).triggered, ["triggers/t1"]);
  assert.equal(describeRuntimeResult("error", {message: "boom"}, {i18n}).tone, "error");
});

test("Runtime Lab: every Lab translation key exists in English and French", () => {
  const sources = readFileSync(new URL("../src/configurator/runtime-lab-view.mjs", import.meta.url), "utf8") + readFileSync(new URL("../src/configurator/configurator-app.mjs", import.meta.url), "utf8") + readFileSync(new URL("../templates/configurator/configurator.hbs", import.meta.url), "utf8");
  const keys = new Set([...sources.matchAll(/"(RTA\.Lab\.[A-Za-z.]+)"/g)].map(match => match[1]));
  for (const tool of ["test", "action", "formula", "condition", "event"]) keys.add(`RTA.Lab.Empty.${tool}`);
  for (const tool of ["test", "action", "formula", "condition", "event", "roll"]) keys.add(`RTA.Lab.Guide.${tool}`);
  for (const key of ["testId", "actionId", "formulaId", "conditionId", "eventTypeId", "rollFormula"]) keys.add(`RTA.Lab.Error.Choose.${key}`);
  for (const title of ["Test", "Formula", "Condition", "ActionPreview", "ActionExecuted", "Event", "Roll", "ActorsReady", "Initialized", "Reset", "Saved", "Error"]) keys.add(`RTA.Lab.Result.${title}`);
  for (const lang of ["en", "fr"]) {
    const dictionary = JSON.parse(readFileSync(new URL(`../lang/${lang}.json`, import.meta.url), "utf8"));
    for (const key of keys) assert.equal(typeof key.split(".").reduce((node, part) => node?.[part], dictionary), "string", `${lang}: ${key}`);
  }
});

test("Runtime Lab: resetting a container drops its runtime data", async () => {
  const adapter = new MemoryRuntimeAdapter(), ref = {kind: "actor", id: "a"};
  await adapter.save(ref, {...(await adapter.load(ref, {rulesetVersionId: "v1"})), runtimeRevision: 4});
  await adapter.reset(ref);
  assert.equal((await adapter.load(ref, {rulesetVersionId: "v2"})).runtimeRevision, 0);
});
