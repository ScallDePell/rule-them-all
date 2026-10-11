import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const file=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');
const js=file('src/ui/rta-select.mjs');
const css=file('styles/configurator.css');
const hbs=file('templates/configurator/entry-editor.hbs');
const editor=file('src/configurator/configurator-entry-editor.mjs');
const markup=file('src/ui/entry-editor-markup.mjs');
const expressionModel=file('src/configurator/entry-expression-model.mjs');

test('Formula and Condition keep the ONE RTA Select without adding a nested grid',()=>{
  assert.match(js,/const compactOperand=Boolean\(native\.closest\('\.rta-rule-operand'\)\)/);
  assert.match(js,/const addFormRow=!compactOperand&&!hasLabel/);
  assert.match(js,/if\(!compactOperand&&!hasLabel&&!addFormRow\)RTASelect\.#attachLabel/);
  assert.match(js,/this\.trigger\.setAttribute\("aria-label",host\.dataset\.rtaSelectLabel/);
});

test('Condition and Formula static operands both use the canonical left-label/right-control row',()=>{
  assert.equal((hbs.match(/<div class="rta-rule-operand rta-form-row" data-rule-operand>/g)||[]).length,2);
  assert.equal((hbs.match(/<label class="rta-rule-operand__label">\{\{operandLabel\}\}<\/label><div class="rta-rule-operand__controls">/g)||[]).length,2);
  assert.equal((hbs.match(/<\/div>\s*<\/div>\{\{\/each\}\}/g)||[]).length>=2,true);
  assert.match(hbs,/<span data-rule-operand-editor="reference"/);
  assert.doesNotMatch(hbs,/<div class="rta-rule-operand" data-rule-operand>/);
});

test('dynamic Add operand uses the same structure as existing Formula and Condition operands',()=>{
  assert.match(expressionModel,/operandLabel:`Operand \$\{index\+1\}`/);
  assert.match(markup,/data-rule-operand><label class="rta-rule-operand__label">/);
  assert.match(markup,/data-action="removeRuleOperand"/);
  assert.match(readFileSync(new URL("../src/configurator/entry-expression-serialization.mjs",import.meta.url),"utf8"),/row\?\.querySelector\(["']\[data-rule-operand-kind\]["']\)/);
  assert.match(readFileSync(new URL("../src/configurator/entry-expression-serialization.mjs",import.meta.url),"utf8"),/row\?\.querySelector\(["']\[data-rule-operand-editor="literal"\] input["']\)/);
});

test('one canonical label/control geometry and specialized right-hand operand layout',()=>{
  assert.match(css,/\.rta-rule-builder > \.rta-form-row,\s*\.rta-rule-builder \.rta-rule-operand\.rta-form-row\s*\{\s*--rta-form-column-inset:/);
  assert.match(css,/\.rta-rule-operand__controls\s*\{\s*display:\s*grid;\s*grid-template-columns:\s*minmax\(8rem, 10rem\) minmax\(0, 1fr\) auto;/);
  assert.match(css,/\.rta-rule-operand__controls > \[data-rule-operand-editor\]\s*\{\s*grid-column:\s*2;/);
  assert.match(css,/\.rta-rule-operand__controls > \[data-action="removeRuleOperand"\]\s*\{\s*grid-column:\s*3;\s*\}/);
  assert.match(css,/@media \(max-width:620px\)[\s\S]*\.rta-rule-operand__controls > \[data-rule-operand-editor\] \{\s*grid-column:\s*1 \/ -1;\s*grid-row:\s*2;\s*\}/);
  assert.match(css,/\.rta-rule-builder \.rta-select__trigger,[\s\S]*?height:\s*var\(--rta-form-control-height\);/);
  assert.doesNotMatch(css,/\.rta-rule-operand > \.rta-select \{ grid-column:/);
});

test('Formula operand labels are renumbered after addition and removal',()=>{
  assert.match(editor,/#renumberRuleOperands\(list\)\s*\{/);
  assert.match(editor,/label\.textContent=`Operand \$\{index\+1\}`/);
  assert.equal((editor.match(/this\.#renumberRuleOperands\(list\)/g)||[]).length,2);
});
