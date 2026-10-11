import test from 'node:test';
import assert from 'node:assert/strict';
import {createConfiguratorAPI} from '../src/configurator/configurator-api.mjs';
import {emptyStorageSnapshot} from '../src/configurator/configurator-storage.mjs';
import {prepareAction} from '../src/configurator/rule-contracts.mjs';
import {MemoryRuntimeAdapter} from '../src/runtime/memory-runtime-adapter.mjs';
import {RuntimeEngine} from '../src/runtime/runtime-engine.mjs';
class Storage{value=emptyStorageSnapshot();async load(){return structuredClone(this.value)}async save(v){this.value=structuredClone(v)}}
const value=(objectId,outputId='value.base')=>({objectKind:'definition',objectId,capabilityId:'value',outputId});
const self={kind:'actor',id:'hero'},context={roles:{self},defaultRole:'self'};

async function setup({publish=true}={}){
  const api=await createConfiguratorAPI(new Storage());
  const v=(await api.createRuleset({id:'acq',nameKey:'Acq',version:'1'})).versionId;
  await api.registerDefinitionType(v,{id:'trait',key:'trait',nameKey:'Trait',descriptionKey:'',color:null,allowedCapabilities:['value'],defaultCapabilities:['value'],requiredCapabilities:[],fields:{},constraints:[]});
  for(const id of ['xp','swordplay','riding'])await api.createDefinition(v,{id,key:id,definitionTypeId:'trait',nameKey:id,descriptionKey:'',data:{},capabilities:['value'],enabled:true,tags:[]});
  await api.createCondition(v,{id:'has-xp',nameKey:'Has XP',expression:{type:'gte',left:{type:'reference',reference:value('xp')},right:{type:'literal',value:5}},enabled:true,tags:[]});
  await api.createEffect(v,{id:'spend-xp',nameKey:'Spend XP',targetRole:'self',targetRef:value('xp'),operation:'subtract',operand:{kind:'literal',value:5},enabled:true,tags:[]});
  await api.createEffect(v,{id:'first-rank',nameKey:'First rank',targetRole:'self',targetRef:value('swordplay'),operation:'set',operand:{kind:'literal',value:1},enabled:true,tags:[]});
  await api.createAction(v,{id:'learn-swordplay',nameKey:'Learn swordplay',purpose:'acquisition',conditionRefs:['has-xp'],costEffectRefs:['spend-xp'],acquisitions:[{definitionId:'swordplay'}],effectRefs:['first-rank'],enabled:true,tags:[]});
  await api.createAction(v,{id:'train',nameKey:'Train',purpose:'acquisition',conditionRefs:['has-xp'],costEffectRefs:['spend-xp'],enabled:true,tags:[]});
  if(publish){await api.deleteAction(v,'train');await api.publishRuleset(v);}
  const engine=new RuntimeEngine({configurator:api,adapter:new MemoryRuntimeAdapter(),hooks:null});
  if(publish)await engine.initializeContainer(v,self,{definitionIds:['xp'],initialByDefinition:{xp:{'value.base':7}}});
  return {api,v,engine};
}
const states=async engine=>(await engine.getContainerState(self)).definitionStates;

test('CP-16: an acquisition Action checks its Conditions, pays its Costs and instantiates the Definition in one transaction', async () => {
  const {v,engine}=await setup();
  const before=(await engine.getLedger(self)).length;
  const result=await engine.executeAction(v,'learn-swordplay',context);
  assert.equal(result.allowed,true);
  assert.deepEqual(result.acquired,['swordplay']);
  const defs=await states(engine);
  assert.equal(defs.xp.capabilityStates.value.base,2);
  // The Effects run after the acquisition, so they can target the new DefinitionState.
  assert.equal(defs.swordplay.capabilityStates.value.base,1);
  const ledger=await engine.getLedger(self);
  assert.equal(ledger.length,before+1);
  assert.deepEqual(ledger.at(-1).changes.map(change=>[change.id,change.before===null]).sort(),[['swordplay',true],['xp',false]]);
});

test('CP-16: acquiring a Definition already there, or without meeting the Conditions, is refused and writes nothing', async () => {
  const {v,engine}=await setup();
  await engine.setDefinitionState(v,self,'xp',{base:20});
  await engine.executeAction(v,'learn-swordplay',context);
  const again=await engine.executeAction(v,'learn-swordplay',context);
  assert.equal(again.allowed,false);
  assert.equal(again.reason,'acquired');
  assert.equal((await states(engine)).xp.capabilityStates.value.base,15);
  const poor=await setup();
  await poor.engine.setDefinitionState(poor.v,self,'xp',{base:4});
  assert.equal((await poor.engine.executeAction(poor.v,'learn-swordplay',context)).reason,'condition');
  assert.equal((await states(poor.engine)).swordplay,undefined);
});

test('CP-16: Content acquisition grants only the absent Definitions, with or without an acquisition Action', async () => {
  const {v,engine}=await setup();
  const direct=await engine.acquire(v,self,{definitionBindings:[{definitionId:'xp'},{definitionId:'riding',initial:{'value.base':3}}]});
  assert.deepEqual(direct.acquiredDefinitionIds,['riding']);
  assert.equal((await states(engine)).riding.capabilityStates.value.base,3);
  assert.equal((await engine.getLedger(self)).at(-1).kind,'acquisition');
  // The Content's acquisition Action adds its own Conditions and Costs to the same transaction.
  await engine.removeDefinitionState(v,self,'riding');
  const paid=await engine.acquire(v,self,{actionId:'learn-swordplay',definitionBindings:[{definitionId:'riding'}]});
  assert.deepEqual(paid.acquiredDefinitionIds.sort(),['riding','swordplay']);
  assert.equal(paid.ledgerEntryIds.length,1);
  assert.equal((await states(engine)).xp.capabilityStates.value.base,2);
  const refused=await engine.acquire(v,self,{actionId:'learn-swordplay',definitionBindings:[]});
  assert.equal(refused.allowed,false);
});

test('CP-16: Action purpose and acquisitions are validated and protect their Definitions', async () => {
  assert.throws(()=>prepareAction({id:'a',nameKey:'A',purpose:'shopping'}),/purpose/);
  assert.throws(()=>prepareAction({id:'a',nameKey:'A',acquisitions:[{definitionId:'x'},{definitionId:'x'}]}),/twice/);
  assert.throws(()=>prepareAction({id:'a',nameKey:'A',acquisitions:[{definitionId:'x',targetRole:'1'}]}),/role name/);
  assert.deepEqual(prepareAction({id:'a',nameKey:'A',acquisitions:[{definitionId:'x'}]}).acquisitions,[{definitionId:'x',targetRole:'self',initial:{}}]);
  const {api,v}=await setup({publish:false});
  const draft=api.diagnoseRuleset(v,{scope:'edit'}).diagnostics.filter(d=>d.code==='ACTION_ACQUISITION');
  assert.equal(draft.length,1);
  assert.equal(draft[0].severity,'WARNING');
  assert.equal(api.diagnoseRuleset(v,{scope:'publish'}).diagnostics.find(d=>d.code==='ACTION_ACQUISITION').severity,'ERROR');
  await assert.rejects(()=>api.deleteDefinition(v,'swordplay'),/referenced/);
});
