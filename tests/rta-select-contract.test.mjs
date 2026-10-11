import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {RTASelect,enhanceRTASelects} from '../src/ui/rta-select.mjs';
const root=new URL('../',import.meta.url);
const read=path=>readFileSync(new URL(path,root),'utf8');
const editor=read('templates/configurator/entry-editor.hbs');
const config=read('templates/configurator/configurator.hbs');
const dynamic=read('src/configurator/configurator-entry-editor.mjs')+read('src/ui/entry-editor-markup.mjs');
const base=read('src/configurator/configurator-window.mjs');
const css=read('styles/configurator.css');
const source=read('src/ui/rta-select.mjs');

test('RTA Select is one generic JS entry point installed at window base',()=>{
  assert.equal(typeof RTASelect.enhance,'function');
  assert.equal(enhanceRTASelects(null),0);
  assert.match(base,/RTASelect\.enhance\(this\.element,\{observe:true\}\)/);
  assert.equal((base.match(/RTASelect\.enhance/g)||[]).length,1);
});
test('all native selects including runtime and dynamic edits are picked up',()=>{
  assert.ok((editor.match(/<select\b/g)||[]).length>=40);
  assert.ok((config.match(/<select\b/g)||[]).length>=8);
  assert.match(dynamic,/<select data-step-prop="kind"/);
  assert.match(dynamic,/<select data-sheet-prop="kind"/);
  assert.match(source,/scan\('select:not\(\[data-rta-select-source\]\)'/);
  assert.match(source,/MutationObserver/);
});
test('checkbox pickers, capabilities and data-bearing Definitions get same control',()=>{
  assert.ok((editor.match(/data-picker\b/g)||[]).length>=12);
  assert.match(source,/scan\("\[data-picker\]"/);
  assert.match(source,/rta-config-entry__check-group/);
  assert.match(source,/rta-binding-list:has/);
  assert.match(source,/templateDefinitionRefs/);
  assert.match(source,/\.rta-select__option/);
});
test('one CSS row visual without borders and shared selector frame',()=>{
  assert.match(css,/RTA Select v0\.1\.43/);
  assert.match(css,/\.rta-select__option\s*\{/);
  assert.match(css,/border: none;/);
  assert.match(css,/\.rta-select__panel:popover-open/);
});
test('single/multi, immediate summary, delayed selected sort and outside click implemented',()=>{
  assert.match(source,/this\.value\.textContent=labels\.length\?labels\.join\(", "\)/);
  assert.match(source,/if\(!this\.multiple&&event\.target\.checked\)this\.close\(\)/);
  assert.match(source,/this\.#reorder\(\);this\.refresh\(\)/);
  assert.match(source,/document\.addEventListener\("pointerdown"/);
  assert.match(source,/this\.search\.addEventListener\("input"/);
  assert.match(source,/this\.options\.addEventListener\("keydown"/);
});
test('original controls preserve native value and bubble change events',()=>{
  assert.match(source,/native\.dataset\.rtaSelectSource/);
  assert.match(source,/native\.selectedIndex=\[\.\.\.native\.options\]\.findIndex/);
  assert.match(source,/dispatchEvent\(new Event\("change",\{bubbles:true\}\)\)/);
  assert.match(source,/original\.checked=clone\.checked/);
});
