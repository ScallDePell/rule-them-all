import test from 'node:test';
import assert from 'node:assert/strict';
import {createConfiguratorAPI} from '../src/configurator/configurator-api.mjs';
import {emptyStorageSnapshot} from '../src/configurator/configurator-storage.mjs';
import {MemoryRuntimeAdapter} from '../src/runtime/memory-runtime-adapter.mjs';
import {RuntimeEngine,WORLD_CONTAINER} from '../src/runtime/runtime-engine.mjs';
import {combatChangeEvents} from '../src/configurator/system-events.mjs';
class Storage{value=emptyStorageSnapshot();async load(){return structuredClone(this.value)}async save(v){this.value=structuredClone(v)}}
const ref=(objectId,slotId='points')=>({objectKind:'definition',objectId,capabilityId:'pool',outputId:'pool.current',slotId});
const hero={kind:'actor',id:'hero'},foe={kind:'actor',id:'foe'},fight={kind:'combat',id:'c1'};
const context={roles:{self:hero,target:foe},defaultRole:'self'};

async function setup(){
  const api=await createConfiguratorAPI(new Storage());
  const v=(await api.createRuleset({id:'shared',nameKey:'Shared',version:'1'})).versionId;
  await api.registerDefinitionType(v,{id:'track',key:'track',nameKey:'Track',allowedCapabilities:['pool'],defaultCapabilities:['pool'],requiredCapabilities:[],fields:{}});
  await api.createDefinition(v,{id:'fear',key:'fear',definitionTypeId:'track',nameKey:'Fear',data:{},capabilities:['pool'],slots:{pool:[{id:'points',minimum:{literal:0},maximum:{literal:12},initial:{literal:0}}]}});
  await api.createDefinition(v,{id:'escalation',key:'escalation',definitionTypeId:'track',nameKey:'Escalation die',data:{},capabilities:['pool'],slots:{pool:[{id:'points',minimum:{literal:0},maximum:{literal:6},initial:{literal:0}}]}});
  await api.createDefinition(v,{id:'hp',key:'hp',definitionTypeId:'track',nameKey:'HP',data:{},capabilities:['pool'],slots:{pool:[{id:'points',minimum:{literal:0},maximum:{literal:20}}]}});
  await api.updateRuleset(v,{sharedDefinitions:{world:['fear'],combat:['escalation']}});
  await api.createFormula(v,{id:'escalation-bonus',nameKey:'Escalation',resultType:'number',expression:{type:'reference',reference:ref('escalation'),container:'combat'}});
  await api.createEffect(v,{id:'gain-fear',nameKey:'GM gains Fear',targetRef:ref('fear'),targetRole:'world',operation:'add',operand:{kind:'literal',value:1}});
  await api.createEffect(v,{id:'escalate',nameKey:'Escalate',targetRef:ref('escalation'),targetRole:'combat',operation:'add',operand:{kind:'literal',value:1}});
  await api.createEffect(v,{id:'strike',nameKey:'Strike',targetRef:ref('hp'),targetRole:'target',operation:'subtract',operand:{kind:'formula',id:'escalation-bonus'}});
  await api.createAction(v,{id:'risky',nameKey:'Risky move',effectRefs:['gain-fear']});
  await api.createAction(v,{id:'escalate',nameKey:'Escalate',effectRefs:['escalate']});
  await api.createAction(v,{id:'strike',nameKey:'Strike',effectRefs:['strike']});
  await api.createTrigger(v,{id:'round',nameKey:'New round',eventTypeId:'rta.combat.round',holder:'combat',actionRefs:['escalate']});
  await api.publishRuleset(v);
  const adapter=new MemoryRuntimeAdapter(),engine=new RuntimeEngine({configurator:api,adapter,hooks:null});
  for(const actor of [hero,foe])await engine.initializeContainer(v,actor,{definitionIds:['hp']});
  return {api,v,engine,adapter};
}

test('The world holds a GM reserve that every Action reaches with the world role', async()=>{
  const {v,engine}=await setup();
  assert.deepEqual(await engine.initializeShared(v),{world:1});
  await engine.executeAction(v,'risky',context);await engine.executeAction(v,'risky',{roles:{self:foe,target:hero}});
  assert.equal(await engine.resolveReference(v,{container:WORLD_CONTAINER,reference:ref('fear')},{}),2);
});

test('A combat holds its own die: its Trigger hears each new round once, and the Actors read it', async()=>{
  const {v,engine,adapter}=await setup();
  adapter.combat=fight;
  await engine.initializeShared(v,{combat:fight});
  const combat={id:'c1',combatants:[{actor:{uuid:null}}]};
  // The events of a new round go to the Actors and to the combat; only the combat's Trigger runs, once.
  for(const round of [1,2,3]){
    for(const {eventTypeId,payload,refs} of combatChangeEvents(combat,{round:round-1},{round}))await engine.emitSystemEvent(eventTypeId,payload,[hero,foe,...refs.filter(r=>r.kind==='combat')]);
  }
  assert.equal(await engine.resolveReference(v,{container:fight,reference:ref('escalation')},{}),3);
  await engine.executeAction(v,'strike',context);
  assert.equal(await engine.resolveReference(v,{container:foe,reference:ref('hp')},{}),17,'the strike adds the escalation die');
  assert.deepEqual(engine.writeTargets('executeAction',[v,'escalate',context]),[fight]);
});

test('Saving checks the shared Definitions and the Trigger holder', async()=>{
  const {api,v}=await setup();
  await assert.rejects(api.updateRuleset(v,{sharedDefinitions:{world:['nowhere'],combat:[]}}),/definition\/nowhere/);
  await assert.rejects(api.createTrigger(v,{id:'t',nameKey:'T',eventTypeId:'rta.combat.round',holder:'party'}),/holder must be/);
});
