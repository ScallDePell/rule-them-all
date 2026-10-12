import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {renderRuleOperandHTML} from '../src/ui/entry-editor-markup.mjs';
import {localizedMarkup} from '../src/ui/ui-localization.mjs';
const locales={
 fr:JSON.parse(readFileSync(new URL('../lang/fr.json',import.meta.url))),
 en:JSON.parse(readFileSync(new URL('../lang/en.json',import.meta.url)))
};
const previousGame=globalThis.game;
function chooseLocale(locale){
 globalThis.game={i18n:{localize:key=>{
   const [root,group,name]=key.split('.');
   return locales[locale]?.[root]?.[group]?.[name]??key;
 }}};
}
test('dynamic builders localize visible labels without mutating field IDs or select values',()=>{
 try{
  chooseLocale('fr');
  const operand=renderRuleOperandHTML({index:0,parameters:'',formulas:'',references:''});
  assert.match(operand,/>Op\u00e9rande 1</);
  assert.match(operand,/value="parameter"/);
 }finally{globalThis.game=previousGame;}
});
test('translated values are HTML-escaped even when a third-party locale is malformed',()=>{
 try{
  globalThis.game={i18n:{localize:()=>'<script>alert(1)</script>'}};
  assert.equal(localizedMarkup('Name','Name'),'&lt;script&gt;alert(1)&lt;/script&gt;');
  assert.match(renderRuleOperandHTML({index:0,parameters:'',formulas:'',references:''}),/&lt;script&gt;/);
 }finally{globalThis.game=previousGame;}
});
