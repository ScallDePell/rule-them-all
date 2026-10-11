import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {readCssBundle} from './helpers/css-bundle.mjs';
const css=readCssBundle();
const home=readFileSync(new URL('../templates/configurator/configurator.hbs',import.meta.url),'utf8');

test('one canonical full-height rail for Ruleset tiles, General, collections, dependencies, and navigation',()=>{
  assert.equal((css.match(/--rta-rail-width:\s*4px;/g)||[]).length,1);
  assert.equal((css.match(/border-left:\s*var\(--rta-rail-width\) solid var\(--rta-card-accent, #666666\)/g)||[]).length,1);
  for(const className of ['rta-ruleset-tile','rta-config-card','rta-general__card','rta-general__storage','rta-dependencies__row','rta-explorer__group.is-active','rta-explorer__flyout-list .rta-explorer__item']) {
    const common=css.match(/\/\* Canonical full-height Ruleset rail:[\s\S]*?\}\n/)[0];
    assert.ok(common.includes(`.${className}`),`Missing shared rail: ${className}`);
  }
  assert.doesNotMatch(css,/box-shadow:\s*inset\s+3px\s+0\s+var\(--rta-nav-accent/);
  assert.doesNotMatch(css,/border-left:\s*4px\s+solid\s+var\(--rta-card-accent/);
  assert.doesNotMatch(css,/\.rta-explorer__accent\s*\{/);
  assert.doesNotMatch(home,/rta-explorer__accent/);
});

test('navigation reuses the color variable of the Ruleset rail without losing section hues',()=>{
  assert.equal((home.match(/style="--rta-card-accent:\{\{color\}\};--rta-nav-accent:\{\{color\}\}"/g)||[]).length,2);
  assert.match(home,/class="rta-general" style="--rta-card-accent:\{\{rulesetAccent\}\}"/);
  assert.match(home,/class="rta-ruleset-tile" role="listitem" style="--rta-card-accent:\{\{color\}\}"/);
});
