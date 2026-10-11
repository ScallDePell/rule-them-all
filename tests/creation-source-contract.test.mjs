import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const editor=readFileSync(new URL('../src/configurator/configurator-entry-editor.mjs',import.meta.url),'utf8')+readFileSync(new URL('../src/ui/picker-markup.mjs',import.meta.url),'utf8');
const serializer=readFileSync(new URL('../src/configurator/creation-step-serialization.mjs',import.meta.url),'utf8');
test('Creation source and objects use visible checkbox frames, not select or details',()=>{
  assert.match(editor,/#creationCheckboxList\(/);
  assert.match(editor,/property:"sourceCollection"/);
  assert.match(editor,/property:"sourceObjects"/);
  assert.match(editor,/data-step-source-family/);
  assert.match(editor,/data-step-source-object/);
  assert.match(editor,/class="rta-picker rta-config-entry__section" data-picker/);
  assert.match(editor,/class="rta-picker__body rta-choice-list"/);
  assert.doesNotMatch(editor,/<select data-step-prop="sourceCollection"/);
  assert.doesNotMatch(editor,/<details[^>]*data-step-prop="sourceObjects"/);
  assert.match(editor,/other\.checked=false/);
  assert.match(serializer,/Missing Ruleset object/);
});
test('Creation duplication reads checked objects instead of stale selectedOptions',()=>{
  const start=editor.indexOf('if(action==="duplicateStep")');
  const end=editor.indexOf('row.insertAdjacentHTML("afterend"',start);
  const block=editor.slice(start,end);
  assert.match(block,/data-step-source-object\]:checked/);
  assert.doesNotMatch(block,/selectedOptions/);
});
