import test from 'node:test';
import assert from 'node:assert/strict';
import {createConfiguratorAPI} from '../src/configurator/configurator-api.mjs';
import {emptyStorageSnapshot} from '../src/configurator/configurator-storage.mjs';
import {MemoryRuntimeAdapter} from '../src/runtime/memory-runtime-adapter.mjs';
import {RuntimeEngine} from '../src/runtime/runtime-engine.mjs';
class Storage{value=emptyStorageSnapshot();async load(){return structuredClone(this.value)}async save(v){this.value=structuredClone(v)}}
const value=(objectId,outputId='value.base')=>({objectKind:'definition',objectId,capabilityId:'value',outputId});
const hero={kind:'actor',id:'hero'};
const ctx=path=>({type:'context',path});

// WFRP-like advances paid in XP, the cost growing with the current advances; D&D-like levels from XP,
// with a feat chosen at level 2 through the milestone Action's input.
async function setup(){
  const api=await createConfiguratorAPI(new Storage());
  const v=(await api.createRuleset({id:'prog',nameKey:'Prog',version:'1'})).versionId;
  for(const id of ['stat','feat','core'])await api.registerDefinitionType(v,{id,key:id,nameKey:id,allowedCapabilities:['value'],defaultCapabilities:['value'],requiredCapabilities:[],fields:{}});
  for(const [id,type] of [['ws','stat'],['bs','stat'],['xp','core'],['level','core'],['alert','feat'],['tough','feat'],['second-wind','feat']])await api.createDefinition(v,{id,key:id,definitionTypeId:type,nameKey:id,data:{},capabilities:['value']});
  // 25 XP per advance, +5 for every five advances already taken.
  await api.createFormula(v,{id:'advance-cost',nameKey:'Advance cost',resultType:'number',expression:{type:'add',args:[{type:'literal',value:25},{type:'multiply',args:[{type:'literal',value:5},{type:'floor',value:{type:'divide',args:[ctx('variables.advance.current'),{type:'literal',value:5}]}}]}]}});
  await api.createFormula(v,{id:'max-advances',nameKey:'Max',resultType:'number',expression:{type:'literal',value:6}});
  await api.createFormula(v,{id:'chosen-feat',nameKey:'Chosen feat',resultType:'reference',expression:ctx('variables.input.feat')});
  await api.createCondition(v,{id:'level-2',nameKey:'Level 2',expression:{type:'gte',left:{type:'reference',reference:value('level','value.final')},right:{type:'literal',value:2}}});
  await api.createCondition(v,{id:'level-3',nameKey:'Level 3',expression:{type:'gte',left:{type:'reference',reference:value('level','value.final')},right:{type:'literal',value:3}}});
  await api.createAction(v,{id:'pick-feat',nameKey:'Pick a feat',inputs:[{id:'feat',labelKey:'Feat',valueType:'reference',definitionTypeId:'feat'}],acquisitions:[{definitionFormulaRef:'chosen-feat'}]});
  await api.createProgressionSystem(v,{id:'career',nameKey:'Career',
    advancements:[{id:'stats',labelKey:'Characteristic advance',definitionTypeId:'stat',currencyRef:value('xp'),costFormulaRef:'advance-cost',maximumFormulaRef:'max-advances'}],
    milestones:[{id:'l2',labelKey:'Level 2',conditionRef:'level-2',definitionIds:['second-wind'],actionRef:'pick-feat'},{id:'l3',labelKey:'Level 3',conditionRef:'level-3',definitionIds:['tough']}]});
  await api.publishRuleset(v);
  const engine=new RuntimeEngine({configurator:api,adapter:new MemoryRuntimeAdapter(),hooks:null});
  await engine.initializeContainer(v,hero,{definitionIds:['ws','xp','level'],initialByDefinition:{ws:{'value.base':4},xp:{'value.base':100},level:{'value.base':1}}});
  return {api,v,engine};
}
const base=async(engine,id)=>(await engine.getContainerState(hero)).definitionStates[id]?.capabilityStates.value.base;

test('An advancement pays its cost Formula from the currency and raises the Definition, until the maximum', async()=>{
  const {v,engine}=await setup();
  const [stats]=(await engine.describeProgression(v,'career',hero)).advancements;
  assert.deepEqual(stats.targets.map(t=>[t.definitionId,t.cost,t.allowed]),[['ws',25,true]],'bs is not held');
  let result=await engine.advance(v,'career',hero,'stats','ws');
  assert.deepEqual([result.before,result.after,result.cost],[4,5,25]);
  result=await engine.advance(v,'career',hero,'stats','ws');
  assert.equal(result.cost,30,'the sixth advance costs more');
  assert.equal(await base(engine,'xp'),45);
  result=await engine.advance(v,'career',hero,'stats','ws');
  assert.deepEqual([result.allowed,result.reason],[false,'maximum']);
  await assert.rejects(engine.advance(v,'career',hero,'stats','bs'),/cannot raise bs/);
});

test('Milestones apply once, in order, when their Condition holds; a feat is chosen through the Action input', async()=>{
  const {v,engine}=await setup();
  assert.deepEqual((await engine.applyMilestones(v,'career',hero)).applied,[]);
  await engine.setDefinitionState(v,hero,'level',{base:3});
  const described=await engine.describeProgression(v,'career',hero);
  assert.deepEqual(described.milestones.map(m=>[m.id,m.reached,m.applied]),[['l2',true,false],['l3',true,false]]);
  assert.deepEqual(described.milestones[0].inputs[0].options.map(o=>o.value),['alert','tough','second-wind']);
  await assert.rejects(engine.applyMilestones(v,'career',hero),/needs a value for Feat/);
  const result=await engine.applyMilestones(v,'career',hero,{choices:{l2:{feat:'alert'}}});
  assert.deepEqual(result.applied,['l2','l3']);
  const state=await engine.getContainerState(hero);
  assert.deepEqual(['second-wind','alert','tough'].map(id=>Boolean(state.definitionStates[id])),[true,true,true]);
  assert.deepEqual(state.milestones,['career/l2','career/l3']);
  assert.deepEqual((await engine.applyMilestones(v,'career',hero,{choices:{l2:{feat:'alert'}}})).applied,[],'never twice');
});

test('Undoing a milestone transaction takes its mark back', async()=>{
  const {v,engine}=await setup();
  await engine.setDefinitionState(v,hero,'level',{base:3});
  const result=await engine.applyMilestones(v,'career',hero,{choices:{l2:{feat:'tough'}}});
  await engine.compensate(v,hero,result.ledgerEntryIds[0]);
  const state=await engine.getContainerState(hero);
  assert.deepEqual(state.milestones,[]);assert.equal(state.definitionStates.tough,undefined);
});

test('Saving checks advancements and milestones', async()=>{
  const {api,v}=await setup();
  const save=data=>api.createProgressionSystem(v,{id:'x',nameKey:'X',...data});
  await assert.rejects(save({advancements:[{id:'a',definitionIds:['ws'],currencyRef:value('xp','value.final'),costFormulaRef:'advance-cost'}]}),/currencyRef/);
  await assert.rejects(save({advancements:[{id:'a',definitionIds:['ws'],currencyRef:value('xp'),costFormulaRef:'missing'}]}),/formula\/missing/);
  await assert.rejects(save({milestones:[{id:'m',conditionRef:'level-2',definitionIds:[],actionRef:'nowhere'}]}),/action\/nowhere/);
  await assert.rejects(save({milestones:[{id:'m',conditionRef:'level-2',rank:2}]}),/unsupported field: rank/);
});

test('The Runtime Lab lists what can be bought and the choices a reached milestone asks for', async()=>{
  const {progressionLabRows}=await import('../src/configurator/runtime-lab-view.mjs');
  const {v,engine}=await setup();
  await engine.setDefinitionState(v,hero,'level',{base:2});
  const rows=progressionLabRows(await engine.describeProgression(v,'career',hero),{chosen:{'l2|feat':'tough'}});
  assert.deepEqual(rows.advances.map(row=>[row.definitionId,row.allowed]),[['ws',true]]);
  assert.equal(rows.canApply,true);
  assert.deepEqual(rows.milestones[0].inputs[0].options.find(option=>option.selected).value,'tough');
  assert.deepEqual(rows.milestones[1].inputs,[],'level 3 is not reached');
});
