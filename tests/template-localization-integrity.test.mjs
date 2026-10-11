import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const root = new URL('../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
const templates = [read('templates/configurator/configurator.hbs'), read('templates/configurator/entry-editor.hbs')];
const catalogs = Object.fromEntries(['en','fr'].map(lang => [lang, JSON.parse(read(`lang/${lang}.json`))]));
const translate = (catalog, key) => key.split('.').reduce((node, part) => node?.[part], catalog);

test('every localized Handlebars expression resolves in both language catalogs', () => {
  const expressions = templates.flatMap(source => [...source.matchAll(/\blocalize\s+["']([^"']+)["']/g)].map(match => match[1]));
  assert.ok(expressions.length > 250, 'template migration should not silently disappear');
  for(const key of new Set(expressions))for(const [lang, catalog] of Object.entries(catalogs)) {
    assert.equal(typeof translate(catalog,key), 'string', `${lang}: missing key ${key}`);
    assert.ok(translate(catalog,key).trim(), `${lang}: empty key ${key}`);
  }
});

test('search partials use valid Handlebars subexpressions instead of nested mustaches in attributes', () => {
  const source=templates[1];
  assert.doesNotMatch(source, /\{\{>\s*\w+\s+\w+="\{\{/);
  assert.match(source, /\{\{> rtaPickerSearch placeholder=\(localize "RTA\.Template\.SearchTags"\)\}\}/);
  const occurrences=[...source.matchAll(/\{\{> rtaPickerSearch placeholder=/g)].length;
  assert.ok(occurrences >= 10, `expected shared selector partial, got ${occurrences}`);
});

test('persistent save bindings remain native HBS variables and are not translated', () => {
  const source=templates[1];
  for(const attribute of ['name="nameKey"', 'name="descriptionKey"','name="formulaOperator"']) {
    // Historically rendered field names are preserved for form readers.
    assert.ok(source.includes(attribute), `lost stable form binding ${attribute}`);
  }
  assert.match(source,/data-action="addFormulaOperand"/);
  assert.match(source,/data-action="saveQuit"/);
});
