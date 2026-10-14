import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {renderExpressionSlotHTML} from '../src/ui/expression-builder-markup.mjs';
import {slotView} from '../src/configurator/entry-expression-model.mjs';
const operandHTML=()=>renderExpressionSlotHTML(slotView({kind:'literal',value:'0'},{label:{key:'RTA.Expression.Slot.operand',fallback:'Operand',number:1}}));
import {localizedMarkup} from '../src/ui/ui-localization.mjs';
const locales={
 fr:JSON.parse(readFileSync(new URL('../lang/fr.json',import.meta.url))),
 en:JSON.parse(readFileSync(new URL('../lang/en.json',import.meta.url)))
};
const previousGame=globalThis.game;
function chooseLocale(locale){
 globalThis.game={i18n:{localize:key=>{
   const value=key.split('.').reduce((node,part)=>node?.[part],locales[locale]);
   return typeof value==='string'?value:key;
 }}};
}
test('dynamic builders localize visible labels without mutating field IDs or select values',()=>{
 try{
  chooseLocale('fr');
  const operand=operandHTML();
  assert.match(operand,/>Op\u00e9rande 1</);
  assert.match(operand,/value="parameter"/);
 }finally{globalThis.game=previousGame;}
});
test('translated values are HTML-escaped even when a third-party locale is malformed',()=>{
 try{
  globalThis.game={i18n:{localize:()=>'<script>alert(1)</script>'}};
  assert.equal(localizedMarkup('Name','Name'),'&lt;script&gt;alert(1)&lt;/script&gt;');
  assert.match(operandHTML(),/&lt;script&gt;/);
 }finally{globalThis.game=previousGame;}
});
