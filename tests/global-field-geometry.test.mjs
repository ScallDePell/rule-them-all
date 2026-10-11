import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=file=>readFileSync(new URL('../'+file,import.meta.url),'utf8');
const css=source('styles/configurator.css');
const qa=source('qa/form-matrix.py');
const select=source('src/ui/rta-select.mjs');

test('all editor form inputs and selects share exactly one control-height token',()=>{
  assert.match(css,/--rta-form-control-height:\s*2\.1rem/);
  assert.match(css,/\.rta-form-row :is\(input:not\(\[type="checkbox"\]\)/);
  assert.match(css,/height:\s*var\(--rta-form-control-height\)/);
  assert.doesNotMatch(css,/\.rta-rule-builder \.rta-select__trigger,[\s\S]{0,150}height:\s*32px/);
  assert.match(css,/\.rta-sheet-component__toolbar > input:not\(\[type="checkbox"\]\)/);
  assert.match(css,/\.rta-config-entry__technical input:not\(\[type="checkbox"\]\)/);
});

test('normal selectors share the framed fieldset right edge and compact operands do not reserve ghost columns',()=>{
  assert.match(css,/\.rta-config-entry__scroll > \.rta-form-row--picker\s*\{[\s\S]*?padding-inline-end:\s*var\(--rta-space-6\)/);
  assert.match(css,/\.rta-rule-builder > \.rta-form-row,[\s\S]*?width:\s*calc\(100% \+ \.7rem \+ 1px\)/);
  assert.match(css,/\.rta-rule-operand__controls:not\(:has\(> \[data-action="removeRuleOperand"\]\)\)/);
  assert.match(css,/@media \(max-width:\s*620px\)[\s\S]*?\.rta-config-entry__scroll > \.rta-form-row--picker/);
  assert.match(select,/const formRow=\(control,label\)=>/);
});

test('browser matrix validates 25 actual Handlebars editor branches including dynamic Creation steps',()=>{
  const expected=['Ruleset','DefinitionType','Definition','ContentType','ContentTemplate','Formula','Condition','SheetDefinition','CreationSystem','Modifier','Restriction','Duration','ProgressionSystem'];
  for(const kind of expected)assert.ok(qa.includes(`'${kind}'`),kind);
  assert.match(qa,/RTASelect\.enhance\(document\.querySelector/);
  assert.match(qa,/len\(results\)==len\(KINDS\)\*3/);
  assert.match(qa,/Non-canonical input\/select heights/);
  assert.match(qa,/Form-row labels overlap controls/);
  assert.match(qa,/Unlabeled selector/);
});
