import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source = readFileSync(new URL('../styles/configurator.css', import.meta.url), 'utf8');
const markup = readFileSync(new URL('../templates/configurator/configurator.hbs', import.meta.url), 'utf8');
const cssWithoutComments = source.replace(/\/\*[\s\S]*?\*\//g, '');

const completeScale = ['1','2','3','4','5','6','7','8','10','12'];
test('canonical spacing tokens are declared once and used by all gap declarations', () => {
  for (const token of completeScale) {
    assert.equal((source.match(new RegExp(`--rta-space-${token}:`, 'g')) || []).length, 1, `space ${token}`);
  }
  // Unknown, hand-written dimensions must not silently proliferate inside gap rules.
  for (const declaration of cssWithoutComments.matchAll(/(?:^|\s)(?:row-gap|column-gap|gap)\s*:\s*([^;]+);/gm)) {
    const value = declaration[1].trim();
    assert.ok(value === '0' || /^var\(--rta-(?:space-|form-|card-|editor-)/.test(value),
      `Noncanonical spacing declaration: ${value}`);
  }
});

test('typography uses a single scale, with em allowed only for relative helper text', () => {
  const vars = ['micro','xs','sm','base','control','medium','heading','display'];
  for (const name of vars) assert.equal((source.match(new RegExp(`--rta-type-${name}:`, 'g')) || []).length, 1, `type ${name}`);
  for (const declaration of source.matchAll(/font-size\s*:\s*([^;]+);/g)) {
    const value = declaration[1].trim();
    assert.ok(/^var\(--rta-type-/.test(value) || /^0?\.\d+em$/.test(value), `Noncanonical type: ${value}`);
  }
});

test('cards use persisted Ruleset colors, never CSS colors assigned to game object kind', () => {
  assert.match(markup, /class="rta-config-card[\s\S]*?style="--rta-card-accent: \{\{cardColor\}\}"/);
  assert.doesNotMatch(source, /\.rta-config-card\.rta-config-card--(?:characteristic|skill|resource|pool|parameter|formula|condition|effect|action|category|capability)\s*\{/);
});

test('CSS has one unconditional rule per selector; responsive exceptions stay in media queries', () => {
  // Count only unconditional selectors at depth zero, never @media branches.
  let depth = 0;
  let start = 0;
  const selectors = [];
  for (let i=0;i<cssWithoutComments.length;i++) {
    if (cssWithoutComments[i] === '{') {
      if (depth===0) {
        const selector=cssWithoutComments.slice(start,i).trim();
        if (!selector.startsWith('@')) selectors.push(selector);
      }
      depth++;
    } else if (cssWithoutComments[i] === '}') {
      depth--;
      assert.ok(depth >= 0, 'Invalid CSS brace count');
      if (depth===0) start=i+1;
    }
  }
  assert.equal(depth,0,'Unclosed CSS rule');
  const duplicates = selectors.filter((item, index) => selectors.indexOf(item) < index);
  assert.deepEqual(duplicates, [], `Repeated CSS selectors: ${duplicates}`);
});
