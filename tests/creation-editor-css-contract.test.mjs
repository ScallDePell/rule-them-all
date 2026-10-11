import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {readCssBundle} from './helpers/css-bundle.mjs';
const css=readCssBundle();
const js=readFileSync(new URL('../src/configurator/configurator-entry-editor.mjs',import.meta.url),'utf8');
const markup=readFileSync(new URL('../src/ui/entry-editor-markup.mjs',import.meta.url),'utf8');
test('Creation steps use shared form stack and canonical row labels without scoped CSS patches',()=>{
 assert.match(css,/\.rta-config-entry \.rta-form-stack \{/);
 assert.match(css,/label:not\(\.rta-field-editor__check\):not\(\.rta-form-row__label\):not\(\.rta-form-row--nested\):not\(\[data-picker-option\]\)/);
 assert.doesNotMatch(css,/\[data-creation-step\]/);
 const start=js.indexOf('#creationStepHTML(step={})');
 const end=js.indexOf('\n  #',start+1);
 const html=js.slice(start,end)+markup;
 assert.match(html,/rta-field-editor__body rta-form-stack/);
 assert.match(html,/class="rta-form-row__label"/);
 assert.doesNotMatch(html,/rta-creation-step__/);
});
