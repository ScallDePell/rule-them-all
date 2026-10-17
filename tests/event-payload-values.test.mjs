import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createConfiguratorAPI} from '../src/configurator/configurator-api.mjs';
import {emptyStorageSnapshot} from '../src/configurator/configurator-storage.mjs';
import {prepareAction,prepareEventType} from '../src/configurator/rule-contracts.mjs';
import {collectEventPayloadFields} from '../src/configurator/entry-field-serialization.mjs';
import {collectEventPayloads,eventPayloadContext} from '../src/configurator/action-event-payload-form.mjs';
import {convertSnapshot} from '../src/configurator/stored-data-repair.mjs';
import {MemoryRuntimeAdapter} from '../src/runtime/memory-runtime-adapter.mjs';
import {RuntimeEngine} from '../src/runtime/runtime-engine.mjs';
class Storage{value=emptyStorageSnapshot();async load(){return structuredClone(this.value)}async save(v){this.value=structuredClone(v)}}
const pool=id=>({objectKind:'definition',objectId:id,capabilityId:'pool',outputId:'pool.current',slotId:'points'});
const hero={kind:'actor',id:'hero'},foe={kind:'actor',id:'foe'};

// Call of Cthulhu: a Sanity roll emits "Sanity lost" carrying how much was lost; a Trigger reacts only to a big loss of a kind.
async function setup(){
  const api=await createConfiguratorAPI(new Storage());
  const v=(await api.createRuleset({id:'coc',nameKey:'CoC',version:'1'})).versionId;
  await api.registerDefinitionType(v,{id:'trait',key:'trait',nameKey:'Trait',allowedCapabilities:['pool'],defaultCapabilities:[],requiredCapabilities:[],fields:{}});
  await api.createDefinition(v,{id:'san',key:'san',definitionTypeId:'trait',nameKey:'SAN',data:{},capabilities:['pool'],slots:{pool:[{id:'points',minimum:{literal:0},maximum:{literal:99}}]}});
  await api.createDefinition(v,{id:'madness',key:'madness',definitionTypeId:'trait',nameKey:'Madness',data:{},capabilities:['pool'],slots:{pool:[{id:'points',minimum:{literal:0},maximum:{literal:9}}]}});
  await api.createFormula(v,{id:'loss',nameKey:'Loss',resultType:'number',expression:{type:'literal',value:6}});
  await api.createFormula(v,{id:'san-left',nameKey:'SAN left',resultType:'number',expression:{type:'reference',container:'self',reference:pool('san')}});
  await api.createEffect(v,{id:'lose',nameKey:'Lose',targetRef:pool('san'),targetRole:'self',operation:'subtract',operand:{kind:'formula',id:'loss'}});
  await api.createEffect(v,{id:'go-mad',nameKey:'Go mad',targetRef:pool('madness'),targetRole:'self',operation:'add',operand:{kind:'literal',value:1}});
  await api.createEventType(v,{id:'san-lost',nameKey:'Sanity lost',payloadFields:{amount:{name:'Amount',valueType:'integer'},kind:{name:'Kind',valueType:'string'},left:{name:'Left',valueType:'integer'}}});
  await api.createAction(v,{id:'see',nameKey:'See the horror',effectRefs:['lose'],eventTypeRefs:['san-lost'],eventPayloads:{'san-lost':{amount:{formulaRef:'loss'},kind:{literal:'mythos'},left:{formulaRef:'san-left'}}}});
  await api.createAction(v,{id:'snap',nameKey:'Snap',effectRefs:['go-mad']});
  return {api,v};
}
async function run(api,v,filter){
  await api.createTrigger(v,{id:'temporary-insanity',nameKey:'Temporary insanity',eventTypeId:'san-lost',eventFilter:filter,actionRefs:['snap']});
  await api.publishRuleset(v);
  const engine=new RuntimeEngine({configurator:api,adapter:new MemoryRuntimeAdapter()});
  await engine.instantiateDefinition(v,hero,'san',{initial:{'pool.points.current':50}});
  await engine.instantiateDefinition(v,hero,'madness',{initial:{'pool.points.current':0}});
  const result=await engine.executeAction(v,'see',{roles:{self:hero,target:foe}});
  return {result,madness:(await engine.getContainerState(hero)).definitionStates.madness.capabilityStates.pool.points.current};
}

test('an Action fills the payload fields of its event from Formulas (after its Effects) and fixed values', async()=>{
  const {api,v}=await setup();
  const {result,madness}=await run(api,v,{payloadMatches:{kind:'mythos',amount:6}});
  assert.equal(result.events[0].triggered.length,1);
  assert.equal(madness,1);
});

test('a Trigger filter on a payload field or the Outcome key that does not match runs nothing', async()=>{
  for(const filter of [{payloadMatches:{kind:'violence'}},{payloadMatches:{outcomeKey:'fumble'}}]){
    const {api,v}=await setup();
    const {result,madness}=await run(api,v,filter);
    assert.equal(result.events[0].triggered.length,0);assert.equal(madness,0);
  }
});

test('the payload carries the declared fields set by the Action, the Action and its Outcome key', async()=>{
  const {api,v}=await setup();await api.publishRuleset(v);
  const calls=[],engine=new RuntimeEngine({configurator:api,adapter:new MemoryRuntimeAdapter(),hooks:{callAll:(...a)=>calls.push(a)}});
  await engine.instantiateDefinition(v,hero,'san',{initial:{'pool.points.current':50}});
  await engine.executeAction(v,'see',{roles:{self:hero}});
  const event=calls.find(c=>c[0]==='ruleThemAllEvent')[1];
  assert.deepEqual(event.payload,{amount:6,kind:'mythos',left:44,actionId:'see',outcomeKey:null});
});

test('Action.eventPayloads only for an event the Action emits, each value a Formula or a fixed value', ()=>{
  assert.throws(()=>prepareAction({id:'a',nameKey:'A',eventPayloads:{e:{x:{literal:1}}}}),/does not emit e/);
  assert.throws(()=>prepareAction({id:'a',nameKey:'A',eventTypeRefs:['e'],eventPayloads:{e:{x:{value:1}}}}),/formulaRef/);
  assert.deepEqual(prepareAction({id:'a',nameKey:'A',eventTypeRefs:['e'],eventPayloads:{e:{x:{literal:0},y:{formulaRef:'f'}}}}).eventPayloads,{e:{x:{literal:0},y:{formulaRef:'f'}}});
  assert.throws(()=>prepareEventType({id:'e',nameKey:'E',roles:['self']}),/roles/);
});

test('a new payload field takes an id slugged from its name; a saved one keeps its id', ()=>{
  const input=value=>({value,checked:false});
  const row=(id,name)=>({dataset:{eventFieldId:id},querySelector:selector=>({'[data-event-field-prop="name"]':input(name),'[data-event-field-prop="valueType"]':input('integer')})[selector]??null});
  assert.deepEqual(Object.keys(collectEventPayloadFields([row('perte','Perte'),row('','Perte'),row('','Dégâts subis'),row('','Outcome key'),row('','!!')])),['perte','perte-2','degats-subis','outcome-key','field']);
});

test('the Action editor offers the fields of each ticked event and reads them back typed', ()=>{
  const eventTypes=[{id:'hit',nameKey:'Hit',payloadFields:{dmg:{name:'Damage',valueType:'integer'},kind:{name:'Kind',valueType:'string'}}},{id:'rest',nameKey:'Rest',payloadFields:{}}];
  const context=eventPayloadContext({eventTypeRefs:['hit'],eventPayloads:{hit:{dmg:{formulaRef:'f'},kind:{literal:'fire'}}}},{eventTypes,formulas:[{id:'f',nameKey:'F'}]});
  assert.deepEqual(context.eventPayloadGroups.map(g=>[g.eventTypeId,g.shown]),[['hit',true]]);
  assert.deepEqual(context.eventPayloadGroups[0].rows.map(r=>[r.fieldId,r.sourceChoices.find(c=>c.selected).id,r.literalText]),[['dmg','f',''],['kind','__fixed','fire']]);
  const field=(id,valueType,source,literal)=>({dataset:{eventPayloadField:id,valueType},querySelector:s=>s==='[data-event-payload-source]'?{value:source}:{value:literal}});
  const group={dataset:{eventPayloadGroup:'hit'},querySelectorAll:()=>[field('dmg','integer','__fixed','3'),field('kind','string','',''),field('x','string','f','')]};
  assert.deepEqual(collectEventPayloads([group],['hit']),{hit:{dmg:{literal:3},x:{formulaRef:'f'}}});
  assert.deepEqual(collectEventPayloads([group],[]),{},'an event no longer ticked keeps nothing');
  assert.throws(()=>collectEventPayloads([{...group,querySelectorAll:()=>[field('dmg','integer','__fixed','')]}],['hit']),/number/);
});

test('stored Event Types lose their roles once converted', ()=>{
  const source=JSON.parse(fs.readFileSync(new URL('./fixtures/world-before-ui-simplification.json',import.meta.url),'utf8'));
  const {snapshot}=convertSnapshot(source);
  assert.equal(Object.hasOwn(snapshot.rulesetFamilies[0].versions[0].workingDraft.eventTypes[0],'roles'),false);
});
