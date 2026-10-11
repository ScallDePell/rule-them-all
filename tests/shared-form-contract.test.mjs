import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {readCssBundle} from './helpers/css-bundle.mjs';
const hbs=readFileSync(new URL('../templates/configurator/entry-editor.hbs',import.meta.url),'utf8');
const js=readFileSync(new URL('../src/configurator/configurator-entry-editor.mjs',import.meta.url),'utf8');
const css=readCssBundle();
for(const [partial,field,minimum] of [
  ['rtaIdentityName','nameKey',18],
  ['rtaIdentityDescription','descriptionKey',18],
  ['rtaEnabled','enabled',18]
]){
  test(`${field}: a single canonical markup implementation is reused`,()=>{
    assert.equal((hbs.match(new RegExp(`#\\*inline "${partial}"`,'g'))||[]).length,1);
    assert.ok((hbs.match(new RegExp(`{{> ${partial}}`,'g'))||[]).length>=minimum);
  });
}
test('shared field partials retain readOnly and checked contracts',()=>{
  assert.match(hbs,/#\*inline "rtaIdentityName"[^\n]*{{#if readOnly}}readonly/);
  assert.match(hbs,/#\*inline "rtaIdentityDescription"[^\n]*{{#if readOnly}}readonly/);
  assert.match(hbs,/#\*inline "rtaEnabled"[^\n]*{{#if data.enabled}}checked[^\n]*{{#if readOnly}}disabled/);
});
test('all checkbox list bodies share a common class across templates and JS',()=>{
  assert.doesNotMatch(hbs,/class="rta-picker__body"/);
  assert.doesNotMatch(js,/class="rta-picker__body"/);
  assert.match(hbs,/rta-config-entry__check-group rta-choice-list/);
  assert.match(css,/\.rta-config-entry \.rta-choice-list > label/);
});
