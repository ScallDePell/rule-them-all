import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {readCssBundle,stylesheetPaths} from './helpers/css-bundle.mjs';
const source = readCssBundle();
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
    // Only the three gap tokens (or aliases defined from them) are allowed.
    assert.ok(/^(?:0|var\(--rta-(?:gap-(?:tight|row|block)|form-row-gap|form-control-gap|card-gap|editor-gap)\))(?:\s+(?:0|var\(--rta-(?:gap-(?:tight|row|block)|form-row-gap|form-control-gap|card-gap|editor-gap)\)))?$/.test(value),
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

test('CSS has one unconditional rule per selector; responsive exceptions stay in container queries', () => {
  // Count only unconditional selectors at depth zero, never @media or @container branches.
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

test('hard-coded colors live only in tokens.css', () => {
  for (const path of stylesheetPaths().filter(path => !path.endsWith('/tokens.css'))) {
    const text = readFileSync(new URL(`../${path}`, import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    assert.doesNotMatch(text, /#[0-9a-fA-F]{3,8}\b/, `${path} contains a literal hex color`);
    assert.doesNotMatch(text, /var\(--color-/, `${path} reads a Foundry color variable directly instead of a --rta-color-* token`);
  }
});

test('!important is reserved to the visually hidden native select', () => {
  const text = readCssBundle().replace(/\/\*[\s\S]*?\*\//g, '');
  const offenders = [...text.matchAll(/([^{}]+)\{([^{}]*!important[^{}]*)\}/g)].map(match => match[1].trim()).filter(selector => selector !== '.rta-select__native');
  assert.deepEqual(offenders, []);
});

test('gap aliases resolve to the three gap tokens (4 / 8 / 12 px)', () => {
  assert.match(source, /--rta-gap-tight:\s*var\(--rta-space-2\)/);
  assert.match(source, /--rta-gap-row:\s*var\(--rta-space-4\)/);
  assert.match(source, /--rta-gap-block:\s*var\(--rta-space-6\)/);
  for (const alias of ['form-row-gap','form-control-gap','card-gap','editor-gap']) {
    for (const m of cssWithoutComments.matchAll(new RegExp(`--rta-${alias}:\\s*([^;]+);`, 'g'))) {
      assert.match(m[1].trim(), /^var\(--rta-gap-(?:tight|row|block)\)$/, `${alias} = ${m[1]}`);
    }
  }
});

test('checkboxes have exactly Foundry --checkbox-size so its two icon layers overlap', () => {
  assert.match(cssWithoutComments, /input\[type="checkbox"\]\s*{[^}]*inline-size:\s*var\(--checkbox-size[^}]*block-size:\s*var\(--checkbox-size/);
  for (const rule of cssWithoutComments.matchAll(/([^{}]*input\[type="checkbox"\][^{}]*){([^}]*)}/g)) {
    assert.doesNotMatch(rule[2], /(?:^|[;\s])(?:width|height)\s*:/, `Checkbox resized outside the canonical rule: ${rule[1].trim()}`);
  }
});

test('frames share one padding/border step used as the column inset', () => {
  assert.match(source, /--rta-frame-step:\s*calc\(var\(--rta-frame-pad\)\s*\+\s*var\(--rta-frame-border\)\)/);
  assert.match(cssWithoutComments, /--rta-form-column-inset:\s*calc\(2 \* var\(--rta-frame-step\)\)/);
  // Only 0 (no frame) or multiples of --rta-frame-step: no hand-tuned insets.
  for (const m of cssWithoutComments.matchAll(/--rta-form-column-inset:\s*([^;]+);/g)) {
    assert.match(m[1].trim(), /^(?:0px|var\(--rta-frame-step\)|calc\([23] \* var\(--rta-frame-step\)\))$/, m[1]);
  }
});

test('vertical rhythm: siblings are spaced by a single gap token, never stacked margins', () => {
  assert.match(cssWithoutComments, /> :not\(\[hidden\], div:empty\) ~ :not\(\[hidden\], div:empty\)\s*{\s*margin-block-start:\s*var\(--rta-gap-row\)/);
  assert.match(cssWithoutComments, /> :not\(\[hidden\], div:empty\) ~ :not\(\[hidden\], div:empty\)\s*{\s*margin-block-start:\s*var\(--rta-gap-block\)/);
});

test('field cards count as one frame step and open frames keep their bottom padding',()=>{
  assert.match(cssWithoutComments,/\.rta-field-editor, \.rta-binding-card\)\s*{\s*--rta-form-column-inset:\s*var\(--rta-frame-step\)/);
  assert.doesNotMatch(cssWithoutComments,/rta-field-editor__(?:grid|body), [^{]*{\s*--rta-form-column-inset/,'grid/body add no inset of their own');
  assert.match(cssWithoutComments,/\.rta-field-editor__body\s*{\s*padding:\s*var\(--rta-frame-pad\)/);
  assert.match(cssWithoutComments,/details\.rta-config-entry__technical\)\[open\]\s*{\s*padding-bottom:\s*var\(--rta-frame-pad\)/);
  assert.match(cssWithoutComments,/> label:not\(\.rta-form-row\):has\(/,'stacked label rule never applies to a form row');
});
