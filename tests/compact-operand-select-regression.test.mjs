import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {readCssBundle} from './helpers/css-bundle.mjs';
const file=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');
const js=file('src/ui/rta-select.mjs');
const css=readCssBundle();
const hbs=file('templates/configurator/entry-editor.hbs');
const editor=file('src/configurator/expression-builder-controller.mjs');
const markup=file('src/ui/expression-builder-markup.mjs');

test('Formula and Condition keep the ONE RTA Select without adding a nested grid',()=>{
  assert.match(js,/const compactOperand=Boolean\(native\.closest\('\.rta-rule-operand'\)\)/);
  assert.match(js,/const addFormRow=!compactOperand&&!hasLabel/);
  assert.match(js,/if\(!compactOperand&&!hasLabel&&!addFormRow\)RTASelect\.#attachLabel/);
  assert.match(js,/this\.trigger\.setAttribute\("aria-label",host\.dataset\.rtaSelectLabel/);
});

test('Formula and Condition render one builder markup, the same for the editor and for the blocks drawn later',()=>{
  assert.equal((hbs.match(/\{\{\{expressionBuilder\.html\}\}\}/g)||[]).length,2);
  assert.doesNotMatch(hbs,/data-rule-operand/);
  assert.match(markup,/<div class="rta-rule-operand rta-form-row" data-rule-operand data-kind="\$\{escape\(slot\.kind\)\}" data-expr-path="\$\{escape\(slot\.path\)\}"><label class="rta-rule-operand__label">/);
  assert.match(markup,/<div class="rta-rule-operand__controls">\$\{controls\}<\/div>/);
  assert.match(markup,/trash\("removeRuleOperand"/);
  assert.match(editor,/renderExpressionSlotHTML\(slotView\(/);
  assert.match(editor,/renderExpressionBlockHTML\(blockView\(/);
});

test('one canonical label/control geometry and specialized right-hand operand layout',()=>{
  assert.match(css,/:is\([^)]*\.rta-rule-builder[^)]*\)\s*\{\s*--rta-form-column-inset:\s*var\(--rta-frame-step\)/);
  assert.match(css,/\.rta-rule-operand__controls\s*\{\s*display:\s*grid;\s*grid-template-columns:\s*minmax\(8rem, 10rem\) minmax\(0, 1fr\) auto;/);
  assert.match(css,/\.rta-rule-operand__controls > \[data-rule-operand-editor\]\s*\{\s*grid-column:\s*2;/);
  assert.match(css,/\.rta-rule-operand__controls > \[data-action="removeRuleOperand"\]\s*\{\s*grid-column:\s*3;\s*\}/);
  assert.match(css,/@container rta-window \(max-width: 586px\)[\s\S]*\.rta-rule-operand__controls > \[data-rule-operand-editor\] \{\s*grid-column:\s*1 \/ -1;\s*grid-row:\s*2;\s*\}/);
  assert.match(css,/\.rta-rule-builder \.rta-select__trigger,[\s\S]*?height:\s*var\(--rta-form-control-height\);/);
  assert.doesNotMatch(css,/\.rta-rule-operand > \.rta-select \{ grid-column:/);
});
