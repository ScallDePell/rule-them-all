import test from 'node:test';
import assert from 'node:assert/strict';
import {buildFieldReferenceChoices} from '../src/configurator/field-reference-choices.mjs';
import {refToken} from '../src/configurator/reference-token.mjs';

const snap={definitions:[{id:'a',nameKey:'Athletics',definitionTypeId:'skills'},{id:'b',nameKey:'Strength',definitionTypeId:'stats'},{id:'c',nameKey:'Athletics',definitionTypeId:'stats'}],parameters:[{id:'p',nameKey:'Athletics'}],formulas:[],rolls:[],conditions:[],tests:[],actions:[],contentTemplates:[]};
const options={listCollection:key=>snap[key],findDefinitionType:id=>({nameKey:id}),optionColors:()=>[]};
test('homogeneous references use uncluttered names, filter exact definition family and preserve saved identity',()=>{
 const stored={objectKind:'definition',objectId:'a'};
 const result=buildFieldReferenceChoices({referenceTarget:{objectKind:'definition',definitionTypeId:'skills'}},stored,options);
 assert.equal(result.length,1);
 assert.equal(result[0].label,'Athletics');
 assert.equal(result[0].selected,true);
 assert.equal(result[0].token,refToken(stored));
});
test('mixed choices disambiguate collisions, retain immutable token and do not drop missing targets',()=>{
 const missing={objectKind:'definition',objectId:'deleted'};
 const result=buildFieldReferenceChoices({},[missing],options);
 assert.ok(result.some(x=>x.label==='Athletics (skills) · Definition'));
 assert.ok(result.some(x=>x.label==='Athletics (stats) · Definition'));
 assert.ok(result.some(x=>x.label==='Athletics (p) · Parameter'));
 const stale=result.find(x=>x.token===refToken(missing));
 assert.equal(stale.selected,true);
 assert.match(stale.label,/missing target/);
});
test('provider must be explicit, never use hidden global Ruleset',()=>{
 assert.throws(()=>buildFieldReferenceChoices({},null),/collection provider/);
});
test('all Ruleset families share dynamic references rather than a hand-maintained short list',()=>{
 const dataset={sheetDefinitions:[{id:'sheet',nameKey:'Sheet'}],modifiers:[{id:'mod',nameKey:'Modifier'}],progressionSystems:[{id:'prog',nameKey:'Progression'}]};
 const options={listCollection:key=>dataset[key]??[],findDefinitionType:()=>null,optionColors:()=>[]};
 const all=buildFieldReferenceChoices({},null,options);
 assert.ok(all.some(x=>x.token===refToken({objectKind:'sheetDefinition',objectId:'sheet'})));
 assert.ok(all.some(x=>x.token===refToken({objectKind:'modifier',objectId:'mod'})));
 assert.ok(all.some(x=>x.token===refToken({objectKind:'progressionSystem',objectId:'prog'})));
 const targeted=buildFieldReferenceChoices({referenceTarget:{objectKind:'progressionSystem'}},{objectKind:'progressionSystem',objectId:'prog'},options);
 assert.equal(targeted.length,1);assert.equal(targeted[0].selected,true);
});
test('every canonical Ruleset collection is selectable by a typed reference field',async()=>{
 const {COLLECTION_TO_KIND}=await import('../src/configurator/relation-contract.mjs');
 const dataset=Object.fromEntries(Object.keys(COLLECTION_TO_KIND).map(collection=>[collection,[{id:collection+'-id',nameKey:collection}]]));
 const selected=buildFieldReferenceChoices({},null,{listCollection:key=>dataset[key]??[],findDefinitionType:()=>null,optionColors:()=>[]});
 assert.equal(selected.length,Object.keys(COLLECTION_TO_KIND).length);
 for(const [collection,kind] of Object.entries(COLLECTION_TO_KIND))
   assert.ok(selected.some(option=>option.token===refToken({objectKind:kind,objectId:collection+'-id'})),collection);
});
