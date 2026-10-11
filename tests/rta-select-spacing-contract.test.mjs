import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const css = read('styles/configurator.css');
const select = read('src/ui/rta-select.mjs');
const editor = read('templates/configurator/entry-editor.hbs');

const contract = css.split('/* v0.1.44 - Canonical flow rhythm')[1]?.split('/* RTA Select v0.1.43')[0] ?? '';

test('Replacing a legacy picker places label and selector in the same canonical row', () => {
  assert.match(select, /const replacement=nestedInRow\?root:formRow\(root/);
  assert.match(select, /rta-form-row rta-form-row--picker/);
  const shared = css.split('/* v0.1.47 — CANONICAL FIELD ROW')[1] ?? '';
  assert.match(shared,/grid-template-columns: minmax\(calc\(var\(--rta-form-label-column-min\)/);
  for (const parent of ['.rta-config-entry__scroll', 'details.rta-config-entry__section',
    '.rta-binding-card', '.rta-field-editor__body']) {
    assert.ok(shared.includes(parent), `Missing canonical row flow container: ${parent}`);
  }
});

test('One select geometry is retained and spacing is not duplicated in managed grids/stacks', () => {
  assert.match(css, /\.rta-config-entry \.rta-select,\s*\.rta-configurator \.rta-select\s*\{[^}]*margin:\s*0;/s);
  for (const excluded of ['.form-group', 'fieldset', '.rta-form-stack', '.rta-field-editor__grid']) {
    assert.ok(!contract.split('*/').pop().split('> .rta-select')[0].includes(excluded), `A gap-managed or grid container must not gain select margins: ${excluded}`);
  }
});

test("Content editor adjacent selectors share the same canonical vertical flow", () => {
  const actions = editor.indexOf('<strong>{{localize "RTA.Template.ActionsGranted"}}</strong>');
  const capabilities = editor.indexOf('<strong>{{localize "RTA.Template.Capabilities"}}</strong>', actions);
  const advanced = editor.indexOf('<summary>{{localize "RTA.Template.AdvancedClassification"}}</summary>', capabilities);
  assert.ok(actions >= 0 && actions < capabilities && capabilities < advanced,
    'Expected the contiguous Content selectors and advanced section in this order');
});
