import test from 'node:test';
import assert from 'node:assert/strict';
import {createConfiguratorAPI} from '../src/configurator/configurator-api.mjs';
import {emptyStorageSnapshot} from '../src/configurator/configurator-storage.mjs';
import {MemoryRuntimeAdapter} from '../src/runtime/memory-runtime-adapter.mjs';
import {createRuntimeAPI} from '../src/runtime/runtime-api.mjs';
import {FoundryContentBridge} from '../src/runtime/foundry-content-bridge.mjs';

class Storage {
  constructor(){this.data=emptyStorageSnapshot()}
  async load(){return structuredClone(this.data)}
  async save(next){this.data=structuredClone(next)}
}
class ActorMock {
  constructor(uuid){this.uuid=uuid;this.documentName='Actor';this.flags={};}
  getFlag(scope,key){return this.flags[scope]?.[key]}
  async setFlag(scope,key,value){(this.flags[scope]??={})[key]=structuredClone(value)}
}
class Adapter extends MemoryRuntimeAdapter {
  constructor(actors){super();this.actors=actors}
  async resolveDocument(uuid){const actor=this.actors.get(uuid);if(!actor)throw new Error('Actor not found');return actor}
  async canWrite(){return true}
}

async function system(){
  const storage=new Storage(),configurator=await createConfiguratorAPI(storage);
  const versionId=(await configurator.createRuleset({id:'generic-universe',nameKey:'Generic Universe',version:'1.0.0'})).versionId;
  await configurator.registerDefinitionType(versionId,{id:'ability',key:'ability',nameKey:'Ability',allowedCapabilities:['value'],defaultCapabilities:['value'],requiredCapabilities:['value'],fields:{}});
  await configurator.createDefinition(versionId,{id:'practised',key:'practised',nameKey:'Practised',definitionTypeId:'ability',capabilities:['value'],data:{}});
  await configurator.createEffect(versionId,{id:'increase',nameKey:'Increase',targetRef:{objectKind:'definition',objectId:'practised',capabilityId:'value',outputId:'value.base'},operation:'add',operand:{kind:'literal',value:2}});
  await configurator.createAction(versionId,{id:'use-ability',nameKey:'Use Ability',conditionRefs:[],costEffectRefs:[],effectRefs:['increase']});
  await configurator.createContentType(versionId,{id:'background',nameKey:'Background',storageKind:'item',runtimeMode:'unique'});
  await configurator.createContentTemplate(versionId,{id:'starter',nameKey:'Starter',contentTypeId:'background',relations:[{id:'practised',operation:'grant',targetRef:{objectKind:'definition',objectId:'practised'},config:{initial:{'value.base':0}}},{id:'use-ability',operation:'grant',targetRef:{objectKind:'action',objectId:'use-ability'}}],choiceGroups:[]});
  const actor=new ActorMock('Actor.A'),other=new ActorMock('Actor.B'),actors=new Map([[actor.uuid,actor],[other.uuid,other]]);
  await configurator.publishRuleset(versionId);const runtime=createRuntimeAPI(configurator,{adapter:new Adapter(actors),hooks:null});
  const content=new FoundryContentBridge(configurator,runtime,{hooks:null});
  return {configurator,storage,versionId,actor,other,runtime,content};
}

test('Ruleset -> Content Type -> Content Template -> Actor acquisition -> authorized Action -> save -> release',async()=>{
  const {configurator,storage,versionId,actor,other,runtime,content}=await system();
  const reloaded=await createConfiguratorAPI(storage);
  assert.equal(reloaded.getContentTemplate(versionId,'starter').relations[0].targetRef.objectId,'practised');
  assert.deepEqual(await content.listAcquiredActions(versionId,actor.uuid),[]);
  await assert.rejects(()=>content.executeAcquiredAction(versionId,actor.uuid,'use-ability'),/not acquired/);
  const grant=await content.acquireTemplate(versionId,actor.uuid,'starter',{sourceItemId:'item-1'});
  assert.deepEqual(grant.actionIds,['use-ability']);
  assert.equal((await runtime.getContainerState(actor.uuid)).definitionStates.practised.capabilityStates.value.base,0);
  assert.deepEqual(await content.listAcquiredActions(versionId,actor.uuid),['use-ability']);
  assert.deepEqual(await content.listAcquiredActions(versionId,other.uuid),[]);
  await assert.rejects(()=>content.executeAcquiredAction(versionId,other.uuid,'use-ability'),/not acquired/);
  const executed=await content.executeAcquiredAction(versionId,actor.uuid,'use-ability',{roles:{self:other.uuid,target:actor.uuid}});
  assert.equal(executed.committed,true);
  assert.equal((await runtime.getContainerState(actor.uuid)).definitionStates.practised.capabilityStates.value.base,2);
  await content.releaseOwnedItem({id:'item-1',parent:actor,getFlag:()=>({managed:true})});
  assert.deepEqual(await content.listAcquiredActions(versionId,actor.uuid),[]);
  await assert.rejects(()=>content.executeAcquiredAction(versionId,actor.uuid,'use-ability'),/not acquired/);
  assert.equal((await runtime.getContainerState(actor.uuid)).definitionStates.practised,undefined);
});

test('overlapping Content grants keep a Definition until its last acquisition is removed',async()=>{
  const {configurator,versionId,actor,runtime,content}=await system();
  await configurator.createContentTemplate(versionId,{id:'second',nameKey:'Second Source',contentTypeId:'background',relations:[{id:'practised',operation:'grant',targetRef:{objectKind:'definition',objectId:'practised'}}],choiceGroups:[]});
  await configurator.publishRuleset(versionId);
  await content.acquireTemplate(versionId,actor.uuid,'starter',{sourceItemId:'item-first'});
  await content.acquireTemplate(versionId,actor.uuid,'second',{sourceItemId:'item-second'});
  await content.releaseAcquisition(actor.uuid,'item-first');
  assert.ok((await runtime.getContainerState(actor.uuid)).definitionStates.practised,'second grant keeps Definition');
  await content.releaseAcquisition(actor.uuid,'item-second');
  assert.equal((await runtime.getContainerState(actor.uuid)).definitionStates.practised,undefined,'last grant removes the Definition originally created by Content');
});

test('acquiring an already present Definition never destroys that preexisting state on release',async()=>{
  const {versionId,actor,runtime,content}=await system();
  await runtime.instantiateDefinition(versionId,actor.uuid,'practised',{initial:{'value.base':42}});
  await content.acquireTemplate(versionId,actor.uuid,'starter',{sourceItemId:'item-existing'});
  await content.releaseAcquisition(actor.uuid,'item-existing');
  assert.equal((await runtime.getContainerState(actor.uuid)).definitionStates.practised.capabilityStates.value.base,42);
});
