import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {readCssBundle} from './helpers/css-bundle.mjs';
const source=file=>readFileSync(new URL('../'+file,import.meta.url),'utf8');
const css=readCssBundle();
const select=source('src/ui/rta-select.mjs');

test('all editor form inputs and selects share exactly one control-height token',()=>{
  assert.match(css,/--rta-form-control-height:\s*2\.1rem/);
  assert.match(css,/\.rta-form-row :is\(input:not\(\[type="checkbox"\]\)/);
  assert.match(css,/height:\s*var\(--rta-form-control-height\)/);
  assert.doesNotMatch(css,/\.rta-rule-builder \.rta-select__trigger,[\s\S]{0,150}height:\s*32px/);
  assert.match(css,/\.rta-config-entry__technical input:not\(\[type="checkbox"\]\)/);
});

test('normal selectors share the framed fieldset right edge and compact operands do not reserve ghost columns',()=>{
  assert.match(css,/\.rta-config-entry__scroll > \.rta-form-row--picker\s*\{[\s\S]*?padding-inline-end:\s*var\(--rta-space-6\)/);
  assert.match(css,/\.rta-rule-builder > \.rta-form-row,[\s\S]*?width:\s*calc\(100% \+ \.7rem \+ 1px\)/);
  assert.match(css,/\.rta-rule-operand__controls:not\(:has\(> \[data-action="removeRuleOperand"\]\)\)/);
  assert.match(css,/@container rta-window \(max-width:\s*586px\)[\s\S]*?\.rta-config-entry__scroll > \.rta-form-row--picker/);
  assert.match(select,/const formRow=\(control,label\)=>/);
});
