import test from 'node:test';
import assert from 'node:assert/strict';
import {createConfiguratorAPI} from '../src/configurator/configurator-api.mjs';
import {emptyStorageSnapshot} from '../src/configurator/configurator-storage.mjs';
import {MemoryRuntimeAdapter} from '../src/runtime/memory-runtime-adapter.mjs';
import {createRuntimeAPI} from '../src/runtime/runtime-api.mjs';
import {RELAYED_METHODS} from '../src/runtime/runtime-relay.mjs';
import {actionSummary, createRulesetSheets, registerRulesetSheets} from '../src/runtime/foundry-sheets.mjs';
import {renderSheetHTML, formatSheetValue} from '../src/ui/sheet-markup.mjs';

class Storage{value=emptyStorageSnapshot();async load(){return structuredClone(this.value)}async save(v){this.value=structuredClone(v)}}
class Base{constructor(document){this.document=document;this.isEditable=true;this.renders=0;}async _prepareContext(){return {};}render(){this.renders++;}}

async function world(){
  const api=await createConfiguratorAPI(new Storage());
  const v=(await api.createRuleset({id:'g',nameKey:'Game',version:'1'})).versionId;
  await api.registerDefinitionType(v,{id:'attribute',key:'attribute',nameKey:'Attributes',allowedCapabilities:['value'],defaultCapabilities:['value'],requiredCapabilities:[],fields:{}});
  await api.createDefinition(v,{id:'str',key:'str',definitionTypeId:'attribute',nameKey:'Strength',data:{},capabilities:['value']});
  await api.createAction(v,{id:'rest',nameKey:'Rest',effectRefs:[]});
  await api.publishRuleset(v);api.setActiveVersionId?.(v);
  const adapter=new MemoryRuntimeAdapter(),runtime=createRuntimeAPI(api,{adapter,hooks:null});
  globalThis.game={ruleThemAll:{configurator:api,runtime,configuratorReady:Promise.resolve(api)},i18n:{lang:'en',localize:k=>k},user:{id:'gm',isGM:true}};
  return {api,v,runtime,adapter};
}

test('the Actor sheet offers to use the Ruleset, then shows and writes its AUTO layout', async()=>{
  const {v,runtime}=await world();
  const {RulesetActorSheet}=createRulesetSheets({ActorSheetV2:Base,ItemSheetV2:Base});
  const sheet=new RulesetActorSheet({uuid:'Actor.hero',name:'Hero',img:'',documentName:'Actor'});
  await sheet._prepareContext({});
  let html=await sheet._renderHTML();
  assert.match(html,/data-sheet-command="initialize"/);
  await runtime.initializeContainer(v,'Actor.hero');
  await sheet._prepareContext({});
  html=await sheet._renderHTML();
  assert.match(html,/data-sheet-write="each-attribute-value" data-definition-id="str" data-operation="set"/);
  assert.match(html,/data-sheet-action="rest"/);
  assert.match(html,/<input class="rta-sheet__name" type="text" data-sheet-name value="Hero"/);
  await runtime.writeSheetValue(v,'Actor.hero',{sheetId:'auto',nodeId:'each-attribute-value',definitionId:'str',value:15});
  await sheet._prepareContext({});
  assert.match(await sheet._renderHTML(),/data-definition-id="str" data-operation="set" value="15"/);
  delete globalThis.game;
});

test('sheets are offered for every Actor and Item type, never as the default; sheet writes reach the GM relay', ()=>{
  const calls=[];
  registerRulesetSheets({applications:{sheets:{ActorSheetV2:Base,ItemSheetV2:Base},apps:{DocumentSheetConfig:{registerSheet:(doc,scope,cls,options)=>calls.push([doc,scope,options])}}}},{Actor:'Actor',Item:'Item'});
  assert.deepEqual(calls.map(([doc,scope,options])=>[doc,scope,options.makeDefault,options.types]),[['Actor','rule-them-all',false,undefined],['Item','rule-them-all',false,undefined]]);
  assert.ok(RELAYED_METHODS.includes('writeSheetValue'));
});

test('markup: values, bounds, amounts, tabs and the Action chat summary', ()=>{
  const view={sheetId:'s',root:{id:'root',kind:'tabs',children:[{id:'a',kind:'tab',label:'A',children:[
    {id:'hp',kind:'value',label:'HP',value:8,maximum:12,valueType:'number',write:{operation:'subtract'}},
    {id:'luck',kind:'value',label:'Luck',value:2.345,valueType:'number',write:null},
    {id:'gone',kind:'value',label:'Gone',value:null,error:'not held',valueType:'number',write:null}]},{id:'b',kind:'tab',label:'B',children:[]}]}};
  const html=renderSheetHTML(view,{name:'Hero'});
  assert.match(html,/<span class="rta-sheet-value__text">8<\/span><span class="rta-sheet-value__bound">\/ 12<\/span><input type="number" class="rta-sheet-value__amount" data-sheet-write="hp"/);
  assert.match(html,/>2\.35</);assert.match(html,/title="not held"/);
  assert.match(html,/data-sheet-panel="b"[^>]*hidden/);
  assert.equal(formatSheetValue(null),'—');
  const ruleset={actions:[{id:'hit',nameKey:'Hit'}],definitions:[]};
  const summary=actionSummary({actionId:'hit',testResult:{roll:{formula:'1d20',result:'14'},total:14,target:12,outcome:{labelKey:'Success'}}},{t:k=>k,ruleset});
  assert.deepEqual(summary,{title:'Hit',lines:[{label:'1d20',value:'14 = 14'},{label:'RTA.Sheet.TestTarget',value:'12'}],outcome:'Success'});
});
