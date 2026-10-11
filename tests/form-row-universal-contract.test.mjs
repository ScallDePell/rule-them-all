import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=(file)=>readFileSync(new URL('../'+file,import.meta.url),'utf8');
const hbs=read('templates/configurator/entry-editor.hbs');
const shell=read('templates/configurator/configurator.hbs');
const css=read('styles/configurator.css');
const component=read('src/ui/rta-select.mjs');
const editor=read('src/configurator/configurator-entry-editor.mjs')+read('src/ui/entry-editor-markup.mjs');

test('every static classic entry-editor form-group declares canonical row',()=>{
  assert.equal((hbs.match(/class="form-group"/g)||[]).length,0);
  assert.ok((hbs.match(/class="form-group rta-form-row"/g)||[]).length>=50);
});
test('Runtime Lab ordinary Source and Target fields reuse the same row',()=>{
  assert.ok(shell.includes('class="form-group rta-form-row"><label>{{localize "RTA.Template.SourceSelf"}}'));
  assert.ok(shell.includes('class="form-group rta-form-row"><label>{{localize "RTA.Template.Target"}}'));
});
test('RTA Select wraps generic picker choices in the shared two-column row',()=>{
  assert.match(component,/const formRow=\(control,label\)=>/);
  assert.match(component,/rta-form-row rta-form-row--picker/);
  assert.match(component,/const replacement=nestedInRow\?root:formRow\(root,heading/);
  assert.match(component,/if\(old\.id\)replacement\.id=old\.id/);
  assert.doesNotMatch(component,/RTASelect\.#attachLabel\(root,heading\)/);
});
test('no duplicate row for pickers already nested in creation step form-group',()=>{
  assert.match(component,/const nestedInRow=alreadyInFormRow\(old\)/);
  assert.match(editor,/class="form-group"[^\n]*Ruleset source/);
  assert.match(component,/if\(addFormRow\)native\.parentNode\.insertBefore\(formRow\(root/);
});
test('Definitions granted retains data-bound cards but selector uses same grid',()=>{
  assert.match(component,/list\.parentNode\.insertBefore\(formRow\(root,"Definitions granted"\),list\)/);
  assert.match(component,/row\.hidden=!original\.checked/);
  assert.match(component,/emit\(original\)/);
  assert.match(hbs,/data-binding-slot="value\.base"/);
});
test('form row enhancement runs after every selector pass including dynamic render',()=>{
  assert.match(component,/RTAFormRows\.enhance\(root\);/);
  assert.match(component,/MutationObserver\(records=>/);
  assert.match(component,/queueMicrotask\(\(\)=>\{queued=false;RTASelect\.enhance\(root\);\}\)/);
  assert.match(component,/\.rta-config-entry \.rta-field-editor__grid > label/);
});
test('one shared CSS grid, nested-inset compensation and responsive behavior',()=>{
  const block=css.split('/* v0.1.47 — CANONICAL FIELD ROW')[1];
  assert.ok(block);
  assert.match(block,/--rta-form-label-column-max:\s*200px/);
  assert.match(block,/\.rta-form-row\s*\{[\s\S]*?grid-template-columns:\s*minmax\(calc\(var\(--rta-form-label-column-min\)/);
  assert.match(block,/--rta-form-column-inset:\s*\.8rem/);
  assert.match(block,/@media\s*\(max-width:\s*620px\)/);
  assert.match(block,/label\.rta-form-row--nested/);
});
test('specialized compact builders and technical panels stay explicitly excluded',()=>{
  assert.doesNotMatch(component,/'.rta-config-entry \.rta-sheet-component__config > label'/);
  assert.doesNotMatch(component,/'.rta-config-entry \.rta-binding-card__values > label'/);
  assert.match(component,/label\.closest\('\.rta-config-entry__technical, \.rta-binding-card__values, \.rta-sheet-component__config'\)/);
  assert.match(component,/const isToolbarControl=/);
});
