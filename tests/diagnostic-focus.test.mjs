import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {diagnosticEditor, diagnosticFocusTargets, pathInObject} from "../src/configurator/diagnostic-focus.mjs";

test("A diagnostic opens the editor of the object it is about", () => {
  assert.deepEqual(diagnosticEditor({objectKind: "formula", objectId: "ratio", path: "formulas[2].expression.args[0]"}, "v1"), {kind: "formula", id: "ratio"});
  assert.deepEqual(diagnosticEditor({objectKind: "ruleset", objectId: "rwf", path: "nameKey"}, "v1"), {kind: "ruleset", id: "v1"});
  assert.equal(diagnosticEditor({objectKind: "formula", objectId: null, path: "formulas[9]"}, "v1"), null);
  assert.equal(pathInObject("formulas[2].expression.args[0].reference"), "expression.args[0].reference");
});

test("Diagnostic paths resolve to the control that fixes them", () => {
  const first = (kind, path) => diagnosticFocusTargets(kind, path)[0];
  assert.deepEqual(first("formula", "expression.args[1].reference"), {selector: "[data-rule-operand]", index: 1});
  assert.deepEqual(first("condition", "expression.right.reference"), {selector: "[data-rule-operand]", index: 1});
  assert.deepEqual(first("condition", "expression.left"), {selector: "[data-rule-operand]", index: 0});
  assert.deepEqual(first("effect", "operand.reference"), {selector: '[name="operandReference"]', index: 0});
  assert.deepEqual(first("effect", "targetRef"), {selector: '[name="targetRef"]', index: 0});
  assert.deepEqual(first("definition", "data.abbreviation"), {selector: '[data-definition-field="abbreviation"]', index: 0});
  assert.deepEqual(first("definition", "slots.pool[1].maximum"), {selector: '[data-slot-card="pool"]', index: 1});
  assert.ok(diagnosticFocusTargets("modifier", "").some(target => target.selector === '[name="genericJson"]'));
});

test("Every simple property selector names a control that exists in the editor template", () => {
  const template = readFileSync(new URL("../templates/configurator/entry-editor.hbs", import.meta.url), "utf8");
  for (const name of ["targetRef", "operandReference", "operandKind", "expressionJson", "genericJson", "nameKey", "rollRef", "formulaRef"]) assert.match(template, new RegExp(`name="${name}"`), name);
  for (const attribute of ["data-rule-operand", "data-definition-field=", "data-slot-card="]) assert.ok(template.includes(attribute) || readFileSync(new URL("../src/configurator/configurator-entry-editor.mjs", import.meta.url), "utf8").includes(attribute), attribute);
});
