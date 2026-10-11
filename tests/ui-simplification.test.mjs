import test from 'node:test';
import assert from 'node:assert/strict';
import {collectEntryData} from '../src/configurator/entry-data-collector.mjs';
import {prepareEffect} from '../src/configurator/rule-contracts.mjs';

/** A form holding only the given values; every checkbox list is empty unless listed. */
function form(values={},checked={}){
  return {fd:{get:key=>Object.hasOwn(values,key)?values[key]:null},bool:key=>values[key]===true,checkedIds:name=>checked[name]??[],
    queryOne:()=>null,queryAll:()=>[],uid:prefix=>`${prefix}-1`,fieldUid:()=>'field-1'};
}

test('saving an Outcome keeps its label key, which the form does not show', () => {
  const current={id:'hit',nameKey:'Hit',labelKey:'RULES.Hit',resultKey:'hit',priority:0,conditionRef:null,tags:[]};
  const saved=collectEntryData('outcome',{...form({nameKey:'Hit',resultKey:'hit',priority:'0'}),current});
  assert.equal(saved.labelKey,'RULES.Hit');
});

test('saving a Sheet keeps its tags', () => {
  const current={id:'sheet',nameKey:'Sheet',tags:['main'],layout:{direction:'column',components:[]}};
  assert.deepEqual(collectEntryData('sheetDefinition',{...form({nameKey:'Sheet'}),current}).tags,['main']);
});

test('a Content Template saves the categories chosen in its picker and no longer writes capabilities', () => {
  const current={id:'rope',nameKey:'Rope',contentTypeId:'gear',categories:['old'],capabilities:['value'],tags:[]};
  const saved=collectEntryData('contentTemplate',{...form({nameKey:'Rope',contentTypeId:'gear',runtimeMode:'unique'},{categories:['tools']}),current});
  assert.deepEqual(saved.categories,['tools']);
  assert.deepEqual(saved.capabilities,['value']);
});

test('an Effect can act on the acting container, which lets the UI build a cost', () => {
  const ref='{"objectKind":"definition","objectId":"mana","capabilityId":"pool","outputId":"pool.current","slotId":"mp"}';
  const saved=collectEntryData('effect',{...form({nameKey:'Pay',targetRef:ref,targetRole:'self',operation:'subtract',operandKind:'literal',operandLiteral:'2'}),current:{id:'pay'}});
  assert.equal(saved.targetRole,'self');
  const effect={id:'e',nameKey:'E',targetRef:JSON.parse(ref)};
  assert.equal(prepareEffect(effect).targetRole,'target');
  assert.throws(()=>prepareEffect({...effect,targetRole:'not a role'}),/targetRole/);
});

test('rule editors show the description only once, inside the folded Notes section', async () => {
  const {readFileSync}=await import('node:fs');
  const hbs=readFileSync(new URL('../templates/configurator/entry-editor.hbs',import.meta.url),'utf8');
  const rules=hbs.slice(hbs.indexOf('{{#if isParameter}}'),hbs.indexOf('{{#if isPermissionPolicy}}'));
  assert.doesNotMatch(rules,/rtaIdentityDescription/);
  assert.equal(rules.match(/{{> rtaNotesSection}}/g).length,9);
});
