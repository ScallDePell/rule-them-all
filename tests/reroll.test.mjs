import test from 'node:test';
import assert from 'node:assert/strict';
import {createConfiguratorAPI} from '../src/configurator/configurator-api.mjs';
import {emptyStorageSnapshot} from '../src/configurator/configurator-storage.mjs';
import {MemoryRuntimeAdapter} from '../src/runtime/memory-runtime-adapter.mjs';
import {RuntimeEngine} from '../src/runtime/runtime-engine.mjs';
class Storage{value=emptyStorageSnapshot();async load(){return structuredClone(this.value)}async save(v){this.value=structuredClone(v)}}
class Adapter extends MemoryRuntimeAdapter{queue=[];async roll(formula){const n=this.queue.shift()??50;return {formula,total:n,natural:n,result:String(n)};}}
const ref=(objectId,capabilityId,outputId,slotId)=>({objectKind:'definition',objectId,capabilityId,outputId,...(slotId?{slotId}:{})});
const hero={kind:'actor',id:'hero'},foe={kind:'actor',id:'foe'},context={roles:{self:hero,target:foe},defaultRole:'self'};
const pool=id=>ref(id,'pool','pool.current','points');

async function setup(){
  const api=await createConfiguratorAPI(new Storage());
  const v=(await api.createRuleset({id:'fortune',nameKey:'Fortune',version:'1'})).versionId;
  await api.registerDefinitionType(v,{id:'trait',key:'trait',nameKey:'Trait',allowedCapabilities:['pool'],defaultCapabilities:['pool'],requiredCapabilities:[],fields:{}});
  await api.createDefinition(v,{id:'wounds',key:'wounds',definitionTypeId:'trait',nameKey:'Wounds',data:{},capabilities:['pool'],slots:{pool:[{id:'points',minimum:{literal:0},maximum:{literal:12}}]}});
  await api.createDefinition(v,{id:'fortune',key:'fortune',definitionTypeId:'trait',nameKey:'Fortune',data:{},capabilities:['pool'],slots:{pool:[{id:'points',minimum:{literal:0},maximum:{literal:3}}]}});
  await api.createDefinition(v,{id:'ammo',key:'ammo',definitionTypeId:'trait',nameKey:'Ammo',data:{},capabilities:['pool'],slots:{pool:[{id:'points',minimum:{literal:0},maximum:{literal:10}}]}});
  await api.createRoll(v,{id:'d100',nameKey:'d100',formula:'1d100'});
  await api.createCondition(v,{id:'under',nameKey:'Under',expression:{type:'lte',left:{type:'context',path:'variables.test.total'},right:{type:'context',path:'variables.test.target'}}});
  await api.createCondition(v,{id:'has-fortune',nameKey:'Has Fortune',expression:{type:'gt',left:{type:'reference',reference:pool('fortune')},right:{type:'literal',value:0}}});
  await api.createCondition(v,{id:'first-reroll',nameKey:'Once',expression:{type:'lte',left:{type:'context',path:'variables.reroll.count'},right:{type:'literal',value:1}}});
  await api.createOutcome(v,{id:'hit',nameKey:'Hit',resultKey:'hit',conditionRef:'under'});
  await api.createOutcome(v,{id:'miss',nameKey:'Miss',resultKey:'miss'});
  await api.createTest(v,{id:'shoot',nameKey:'Shoot',rollRef:'d100',targetValue:40,outcomeRefs:['hit'],fallbackOutcomeRef:'miss'});
  await api.createEffect(v,{id:'shot',nameKey:'Spend a shot',targetRef:pool('ammo'),targetRole:'self',operation:'subtract',operand:{kind:'literal',value:1}});
  await api.createEffect(v,{id:'wound',nameKey:'Wound',targetRef:pool('wounds'),targetRole:'target',operation:'subtract',operand:{kind:'literal',value:4}});
  await api.createEffect(v,{id:'spend-fortune',nameKey:'Spend Fortune',targetRef:pool('fortune'),targetRole:'self',operation:'subtract',operand:{kind:'literal',value:1}});
  await api.createAction(v,{id:'fire',nameKey:'Fire',testRef:'shoot',costEffectRefs:['shot'],effectRefs:['wound'],outcomeMappings:[{outcomeId:'miss',effectRefs:[]}]});
  await api.createAction(v,{id:'use-fortune',nameKey:'Use Fortune',conditionRefs:['has-fortune','first-reroll'],costEffectRefs:['spend-fortune'],reroll:{actionRefs:[]}});
  await api.createAction(v,{id:'lucky',nameKey:'Lucky',conditionRefs:['has-fortune'],costEffectRefs:['spend-fortune'],reroll:{actionRefs:['fire']}});
  await api.publishRuleset(v);
  const adapter=new Adapter(),engine=new RuntimeEngine({configurator:api,adapter,hooks:null});
  for(const actor of [hero,foe])await engine.initializeContainer(v,actor,{});
  return {api,v,engine,adapter};
}
const read=(engine,v,actor,id)=>engine.resolveReference(v,{container:'target',reference:pool(id)},{roles:{target:actor}});

test('A reroll undoes the first use, pays its own cost and replays the Action, all in one transaction', async()=>{
  const {v,engine,adapter}=await setup();
  adapter.queue=[10];
  const first=await engine.executeAction(v,'fire',context);
  assert.equal(first.testResult.outcome.resultKey,'hit');assert.equal(await read(engine,v,foe,'wounds'),8);
  adapter.queue=[90];
  const second=await engine.rerollAction(v,'use-fortune',{actionId:'fire',transactionId:first.transactionId,context},context);
  assert.equal(second.testResult.outcome.resultKey,'miss');assert.equal(second.rerollCount,1);
  assert.equal(await read(engine,v,foe,'wounds'),12,'the wound is undone');
  assert.equal(await read(engine,v,hero,'ammo'),9,'one shot only: the first was refunded and the replay paid it');
  assert.equal(await read(engine,v,hero,'fortune'),2);
  const parts=(await engine.getLedger(hero)).filter(entry=>entry.transactionId===second.transactionId).map(entry=>entry.part);
  assert.deepEqual(parts,['undo','cost','action']);
});

test('A use is rerolled once; a Condition on variables.reroll.count caps the chain, and the cost is not refunded', async()=>{
  const {v,engine,adapter}=await setup();
  adapter.queue=[90];
  const first=await engine.executeAction(v,'fire',context);
  adapter.queue=[95];
  const second=await engine.rerollAction(v,'use-fortune',{actionId:'fire',transactionId:first.transactionId,context},context);
  await assert.rejects(engine.rerollAction(v,'use-fortune',{actionId:'fire',transactionId:first.transactionId,context},context),/already rerolled/);
  const third=await engine.rerollAction(v,'use-fortune',{actionId:'fire',transactionId:second.transactionId,context,rerollCount:second.rerollCount},context);
  assert.equal(third.allowed,false);assert.equal(third.conditionId,'first-reroll');
  assert.equal(await read(engine,v,hero,'fortune'),2);assert.equal(await read(engine,v,hero,'ammo'),9);
});

test('Rerolling a reroll undoes only its replay: earlier costs stay paid, and the count comes from the ledger', async()=>{
  const {v,engine,adapter}=await setup();
  adapter.queue=[90];
  const first=await engine.executeAction(v,'fire',context);
  adapter.queue=[95];
  const second=await engine.rerollAction(v,'use-fortune',{actionId:'fire',transactionId:first.transactionId,context},context);
  const capped=await engine.rerollAction(v,'use-fortune',{actionId:'fire',transactionId:second.transactionId,context,rerollCount:0},context);
  assert.equal(capped.allowed,false,'the ledger says this would be the second reroll');
  adapter.queue=[5];
  const third=await engine.rerollAction(v,'lucky',{actionId:'fire',transactionId:second.transactionId,context},context);
  assert.equal(third.rerollCount,2);assert.equal(third.testResult.outcome.resultKey,'hit');
  assert.equal(await read(engine,v,hero,'fortune'),1,'two Fortune points spent');
  assert.equal(await read(engine,v,hero,'ammo'),9);assert.equal(await read(engine,v,foe,'wounds'),8);
});

test('Something written after the use stops the reroll; saving checks the reroll list', async()=>{
  const {api,v,engine,adapter}=await setup();
  adapter.queue=[10];
  const first=await engine.executeAction(v,'fire',context);
  adapter.queue=[10];await engine.executeAction(v,'fire',context);
  await assert.rejects(engine.rerollAction(v,'use-fortune',{actionId:'fire',transactionId:first.transactionId,context},context),/can no longer be rerolled/);
  await assert.rejects(engine.rerollAction(v,'fire',{actionId:'fire',transactionId:first.transactionId,context},context),/Not a reroll Action/);
  await assert.rejects(api.updateAction(v,'use-fortune',{reroll:{actionRefs:['missing']}}),/action\/missing/);
  await assert.rejects(api.updateAction(v,'use-fortune',{reroll:{actionRefs:[],each:true}}),/unsupported field: each/);
});
