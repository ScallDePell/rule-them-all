import test from 'node:test';
import assert from 'node:assert/strict';
import {createConfiguratorAPI} from '../src/configurator/configurator-api.mjs';
import {emptyStorageSnapshot} from '../src/configurator/configurator-storage.mjs';
import {planCreationSystem} from '../src/runtime/creation-plan.mjs';
import {FoundryContentBridge} from '../src/runtime/foundry-content-bridge.mjs';
import {MemoryRuntimeAdapter} from '../src/runtime/memory-runtime-adapter.mjs';
import {createRuntimeAPI} from '../src/runtime/runtime-api.mjs';

class Storage{constructor(){this.data=emptyStorageSnapshot()}async load(){return structuredClone(this.data)}async save(data){this.data=structuredClone(data)}}
class Actors{
 constructor(){this.map=new Map();this.created=[]}
 async create({name,type}){
  const actors=this,id=`Actor.${this.created.length+1}`;
  const actor={uuid:id,documentName:'Actor',name,type,flags:{},deleted:false,
   getFlag(scope,key){return this.flags[scope]?.[key]},
   async setFlag(scope,key,val){(this.flags[scope]??={})[key]=structuredClone(val)},
   async delete(){this.deleted=true;actors.map.delete(this.uuid)}};
  this.map.set(id,actor);this.created.push(actor);return actor;
 }
}
class Adapter extends MemoryRuntimeAdapter{
 constructor(actors){super();this.actors=actors}
 async resolveDocument(uuid){const doc=this.actors.map.get(uuid);if(!doc)throw new Error('Document not found');return doc}
}
async function build(){
 const api=await createConfiguratorAPI(new Storage()),v=(await api.createRuleset({id:'world',nameKey:'World',version:'1.0.0'})).versionId;
 await api.registerDefinitionType(v,{id:'ability',key:'ability',nameKey:'Ability',allowedCapabilities:['value'],defaultCapabilities:['value'],requiredCapabilities:['value'],fields:{}});
 await api.createDefinition(v,{id:'sense',key:'sense',nameKey:'Sense',definitionTypeId:'ability',capabilities:['value'],data:{}});
 await api.createContentType(v,{id:'origin',nameKey:'Origin',storageKind:'item'});
 await api.createContentTemplate(v,{id:'culture',nameKey:'Culture',contentTypeId:'origin',definitionBindings:[{definitionId:'sense',initial:{'value.base':7}}],actionBindings:[]});
 await api.createCreationSystem(v,{id:'creation',nameKey:'Character creation',steps:[
  {id:'abilities',name:'Choose an ability',kind:'choice',required:true,min:1,max:1,source:{collection:'definitions',objectIds:['sense']}},
  {id:'origin',name:'Choose an origin',kind:'content',required:true,min:1,max:1,source:{collection:'contentTemplates',objectIds:['culture']}},
  {id:'review',name:'Review',kind:'review',required:false}
 ]});
 const answers={abilities:['sense'],origin:['culture']};
 await api.publishRuleset(v);const actors=new Actors(),adapter=new Adapter(actors),runtime=createRuntimeAPI(api,{adapter,hooks:null});
 const bridge=new FoundryContentBridge(api,runtime,{hooks:null,documentTypeResolver:(_n,{requestedType})=>{if(requestedType!=='hero')throw new Error('Choose a real Actor subtype');return requestedType}});
 return {api,v,answers,actors,runtime,bridge};
}
test('creation planner rejects unsupported and invalid steps BEFORE Actor creation',async()=>{
 const {api,v,answers,actors,bridge}=await build(),ruleset=api.getRuleset(v);
 assert.equal(planCreationSystem(ruleset,'creation',answers).operations.length,2);
 await assert.rejects(()=>bridge.createActorFromCreationSystem(v,'creation',{name:'Sample',actorType:'hero',answers:{abilities:['unknown'],origin:['culture']}}),/cannot select/);
 await assert.rejects(()=>bridge.createActorFromCreationSystem(v,'creation',{name:'Sample',actorType:'hero',answers:{abilities:['sense'],origin:[]}}),/requires 1 to 1/);
 assert.equal(actors.created.length,0);
 const invalid=structuredClone(ruleset);invalid.creationSystems[0].steps[0].source.collection='definitionTypes';
 assert.throws(()=>planCreationSystem(invalid,'creation',answers),/explicit runtime mapping/);
 invalid.creationSystems[0].steps[0].kind='allocation';
 assert.throws(()=>planCreationSystem(invalid,'creation',answers),/explicit allocation contract/);
 const conflicting=structuredClone(ruleset);
 conflicting.contentTemplates.push({...conflicting.contentTemplates[0],id:'culture-2',definitionBindings:[{definitionId:'sense',initial:{'value.base':99}}]});
 conflicting.creationSystems[0].steps[1].max=2;
 conflicting.creationSystems[0].steps[1].source.objectIds.push('culture-2');
 assert.throws(()=>planCreationSystem(conflicting,'creation',{abilities:['sense'],origin:['culture','culture-2']}),/Conflicting initial values/);
});
test('Creation System creates real Actor through injected Foundry API and persists selected Definitions and Content',async()=>{
 const {v,answers,actors,runtime,bridge}=await build();
 const previous=globalThis.Actor;globalThis.Actor={create:data=>actors.create(data)};
 try{
  const {actor,run}=await bridge.createActorFromCreationSystem(v,'creation',{name:'New Character',actorType:'hero',answers});
  assert.equal(actor.name,'New Character');assert.equal(actor.type,'hero');assert.equal(actors.created.length,1);
  assert.deepEqual(run.selectedByStep,{abilities:['sense'],origin:['culture'],review:[]});
  assert.equal(actor.getFlag('rule-them-all','creationRun').creationSystemId,'creation');
  const state=await runtime.getContainerState(actor.uuid);
  assert.ok(state.definitionStates.sense);
  assert.equal(state.definitionStates.sense.capabilityStates.value.base,7, 'Content initial values must be kept even when a previous step selects the same Definition');
  assert.equal(state.rulesetVersionId,v);
  assert.equal(Object.keys(state.definitionStates).length,1);
  const acquisition=actor.getFlag('rule-them-all','contentAcquisitions')['creation:creation:origin:culture'];
  assert.equal(acquisition.templateId,'culture');
 }finally{globalThis.Actor=previous}
});
test('when creation fails AFTER Foundry Actor.create, newly created Actor is deleted',async()=>{
 const {api,v,answers,actors,runtime}=await build();
 const bridge=new FoundryContentBridge(api,{...runtime,instantiateDefinition:async()=>{throw new Error('Runtime write failed')}},{hooks:null,documentTypeResolver:()=> 'hero'});
 const previous=globalThis.Actor;globalThis.Actor={create:data=>actors.create(data)};
 try{await assert.rejects(()=>bridge.createActorFromCreationSystem(v,'creation',{name:'Failing character',actorType:'hero',answers}),/Runtime write failed/);
 assert.equal(actors.created.length,1);assert.equal(actors.created[0].deleted,true);assert.equal(actors.map.size,0);
 }finally{globalThis.Actor=previous}
});

test('Creation allows Content before Definition without duplicating that Definition',async()=>{
 const {api,v,answers,actors,runtime}=await build();
 const steps=api.getCreationSystem(v,'creation').steps;
 await api.updateCreationSystem(v,'creation',{steps:[steps[1],steps[0],steps[2]]});
 const bridge=new FoundryContentBridge(api,runtime,{hooks:null,documentTypeResolver:()=> 'hero'});
 const previous=globalThis.Actor;globalThis.Actor={create:data=>actors.create(data)};
 try{const {actor}=await bridge.createActorFromCreationSystem(v,'creation',{name:'Content first',actorType:'hero',answers});
  const state=await runtime.getContainerState(actor.uuid);
  assert.equal(Object.keys(state.definitionStates).length,1);
  assert.equal(state.definitionStates.sense.capabilityStates.value.base,7);
 }finally{globalThis.Actor=previous}
});
