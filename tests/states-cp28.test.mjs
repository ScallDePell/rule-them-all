import test from 'node:test';
import assert from 'node:assert/strict';
import {createConfiguratorAPI} from '../src/configurator/configurator-api.mjs';
import {emptyStorageSnapshot} from '../src/configurator/configurator-storage.mjs';
import {prepareAction, prepareDuration} from '../src/configurator/rule-contracts.mjs';
import {MemoryRuntimeAdapter} from '../src/runtime/memory-runtime-adapter.mjs';
import {RuntimeEngine} from '../src/runtime/runtime-engine.mjs';
import {applyModifierStack, durationEnded, startDuration} from '../src/runtime/runtime-states.mjs';
class Storage{value=emptyStorageSnapshot();async load(){return structuredClone(this.value)}async save(v){this.value=structuredClone(v)}}
const might=outputId=>({objectKind:'definition',objectId:'might',capabilityId:'value',outputId});
const poisoned=outputId=>({objectKind:'definition',objectId:'poisoned',capabilityId:'state',outputId});
const hero={kind:'actor',id:'hero'},context={roles:{self:hero,target:hero},defaultRole:'self'};

async function setup({publish=true}={}){
  const api=await createConfiguratorAPI(new Storage());
  const v=(await api.createRuleset({id:'st',nameKey:'States',version:'1'})).versionId;
  await api.registerDefinitionType(v,{id:'trait',key:'trait',nameKey:'Trait',descriptionKey:'',color:null,enabled:true,allowedCapabilities:['value','state'],defaultCapabilities:['value'],requiredCapabilities:[],fields:{},constraints:[]});
  await api.createDefinition(v,{id:'might',key:'might',definitionTypeId:'trait',nameKey:'Might',descriptionKey:'',data:{},capabilities:['value'],enabled:true,tags:[]});
  await api.createDefinition(v,{id:'poisoned',key:'poisoned',definitionTypeId:'trait',nameKey:'Poisoned',descriptionKey:'',data:{},capabilities:['state'],enabled:true,tags:[]});
  await api.createEventType(v,{id:'rest',nameKey:'Rest',descriptionKey:'',payloadFields:{},roles:[],enabled:true});
  await api.createDuration(v,{id:'two-rounds',nameKey:'Two rounds',mode:'fixed',amount:2,unit:'round'});
  await api.createDuration(v,{id:'until-rest',nameKey:'Until rest',mode:'untilEvent',eventTypeRef:'rest'});
  const modifier={conditionRefs:[],stacking:{mode:'stack',group:''},priority:0,enabled:true,tags:[]};
  await api.createModifier(v,{id:'weakness',nameKey:'Weakness',targetRef:might('value.final'),operation:'subtract',valueSource:{kind:'literal',value:1},...modifier});
  await api.createModifier(v,{id:'blessing',nameKey:'Blessing',targetRef:might('value.final'),operation:'add',valueSource:{kind:'literal',value:2},...modifier});
  await api.createAction(v,{id:'poison',nameKey:'Poison',stateApplications:[{definitionId:'poisoned',durationRef:'two-rounds',stacking:'stack',modifierRefs:['weakness']}],enabled:true,tags:[]});
  await api.createAction(v,{id:'cure',nameKey:'Cure',stateRemovals:[{definitionId:'poisoned'}],enabled:true,tags:[]});
  await api.createAction(v,{id:'bless',nameKey:'Bless',modifierApplications:[{modifierRef:'blessing',durationRef:'until-rest'}],enabled:true,tags:[]});
  if(publish)await api.publishRuleset(v);
  const adapter=new MemoryRuntimeAdapter(),engine=new RuntimeEngine({configurator:api,adapter,hooks:null});
  if(publish)await engine.initializeContainer(v,hero,{definitionIds:['might'],initialByDefinition:{might:{'value.base':3}}});
  return {api,v,engine,adapter};
}
const read=(engine,v,reference)=>engine.resolveReference(v,reference,context);

test('CP-28: applying a state creates a StateInstance and the ModifierStates it owns, without touching the base value', async () => {
  const {v,engine}=await setup();
  assert.equal(await read(engine,v,poisoned('state.active')),false);
  await engine.executeAction(v,'poison',context);
  const state=await engine.getContainerState(hero);
  assert.equal(state.stateInstances.length,1);
  const [instance]=state.stateInstances;
  assert.equal(instance.definitionId,'poisoned');
  assert.deepEqual(instance.sourceRef,{kind:'action',id:'poison'});
  assert.equal(instance.durationState.expiresAt,12);
  assert.equal(await read(engine,v,poisoned('state.active')),true);
  assert.equal(await read(engine,v,might('value.base')),3);
  assert.equal(await read(engine,v,might('value.final')),2);
  const [modifier]=state.definitionStates.might.modifiers;
  assert.deepEqual(modifier.sourceRef,{kind:'stateInstance',id:instance.id});
  assert.deepEqual(instance.modifierIds,[modifier.id]);
  assert.equal((await engine.getLedger(hero)).at(-1).changes.some(change=>change.scope==='stateInstance'&&change.id===instance.id),true);
});

test('CP-28: applying the state again stacks it on the same instance and renews its duration', async () => {
  const {v,engine,adapter}=await setup();
  await engine.executeAction(v,'poison',context);
  adapter.clock=6;
  await engine.executeAction(v,'poison',context);
  const state=await engine.getContainerState(hero);
  assert.equal(state.stateInstances.length,1);
  assert.equal(await read(engine,v,poisoned('state.stacks')),2);
  assert.equal(state.stateInstances[0].durationState.expiresAt,18);
  assert.equal(await read(engine,v,might('value.final')),2);
});

test('CP-28: the world clock ends a timed state together with its ModifierStates', async () => {
  const {v,engine,adapter}=await setup();
  await engine.executeAction(v,'poison',context);
  adapter.clock=11;
  assert.deepEqual((await engine.expireAll()).length,0);
  adapter.clock=12;
  const [expired]=await engine.expireAll();
  assert.equal(expired.stateInstanceIds.length,1);
  assert.equal(await read(engine,v,poisoned('state.active')),false);
  assert.equal(await read(engine,v,might('value.final')),3);
  assert.equal((await engine.getLedger(hero)).at(-1).kind,'expire');
});

test('CP-28: an Action removes a state, and an untilEvent Modifier ends with its event', async () => {
  const {v,engine}=await setup();
  await engine.executeAction(v,'poison',context);
  await engine.executeAction(v,'cure',context);
  assert.equal((await engine.getContainerState(hero)).stateInstances.length,0);
  assert.equal(await read(engine,v,might('value.final')),3);
  await engine.executeAction(v,'bless',context);
  assert.equal(await read(engine,v,might('value.final')),5);
  const emitted=await engine.emitEvent(v,'rest',{},context);
  assert.equal(emitted.expired[0].modifierStateIds.length,1);
  assert.equal(await read(engine,v,might('value.final')),3);
});

test('CP-28: durations and modifier stacking are pure rules', () => {
  assert.equal(startDuration({id:'d',mode:'fixed',amount:3,unit:'minute'},{worldTime:100}).expiresAt,280);
  assert.equal(startDuration({id:'d',mode:'absoluteTime',at:500},{worldTime:100}).expiresAt,500);
  assert.equal(durationEnded({mode:'untilEvent',eventTypeRef:'rest',expiresAt:null},{eventTypeId:'rest'}),true);
  assert.equal(durationEnded({mode:'untilRemoved',expiresAt:null},{worldTime:1e9}),false);
  const rows=[{id:'a',operation:'add',value:2,priority:0,stacking:{mode:'highest',group:'g'}},{id:'b',operation:'add',value:5,priority:0,stacking:{mode:'highest',group:'g'}},{id:'c',operation:'multiply',value:2,priority:10}];
  assert.deepEqual(applyModifierStack(1,rows),{value:12,applied:['b','c']});
});

test('CP-28: state and modifier applications are validated', async () => {
  assert.throws(()=>prepareAction({id:'a',nameKey:'A',stateApplications:[{definitionId:'x',stacking:'merge'}]}),/stacking/);
  assert.throws(()=>prepareAction({id:'a',nameKey:'A',stateApplications:[{definitionId:'x',stacks:0}]}),/stacks/);
  assert.throws(()=>prepareAction({id:'a',nameKey:'A',modifierApplications:[{}]}),/modifierRef/);
  assert.throws(()=>prepareDuration({id:'d',nameKey:'D',mode:'fixed',amount:1,unit:'fortnight'}),/unit/);
  const {api,v}=await setup({publish:false});
  await api.createAction(v,{id:'odd',nameKey:'Odd',stateApplications:[{definitionId:'might'}],modifierApplications:[{modifierRef:'weakness'}],enabled:true,tags:[]});
  const codes=api.diagnoseRuleset(v,{scope:'edit'}).diagnostics.map(d=>d.code);
  assert.ok(codes.includes('STATE_DEFINITION'));
  await assert.rejects(()=>api.deleteDuration(v,'two-rounds'),/referenced/);
  await assert.rejects(()=>api.deleteModifier(v,'weakness'),/referenced/);
});
