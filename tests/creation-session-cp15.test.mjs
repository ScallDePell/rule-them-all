import test from 'node:test';
import assert from 'node:assert/strict';
import {createConfiguratorAPI} from '../src/configurator/configurator-api.mjs';
import {emptyStorageSnapshot} from '../src/configurator/configurator-storage.mjs';
import {CreationSessions, MemoryCreationSessionStore} from '../src/runtime/creation-sessions.mjs';
import {FoundryContentBridge} from '../src/runtime/foundry-content-bridge.mjs';
import {MemoryRuntimeAdapter} from '../src/runtime/memory-runtime-adapter.mjs';
import {createRuntimeAPI} from '../src/runtime/runtime-api.mjs';

class Storage{data=emptyStorageSnapshot();async load(){return structuredClone(this.data)}async save(data){this.data=structuredClone(data)}}
class Actors{
  map=new Map();created=[];
  find(fn){return [...this.map.values()].find(fn);}
  async create({name,type,flags={}}){
    const actors=this,id=`Actor.${this.created.length+1}`;
    const actor={uuid:id,documentName:'Actor',name,type,flags:structuredClone(flags),deleted:false,
      getFlag(scope,key){return this.flags[scope]?.[key]},async setFlag(scope,key,val){(this.flags[scope]??={})[key]=structuredClone(val)},
      async delete(){this.deleted=true;actors.map.delete(this.uuid)}};
    this.map.set(id,actor);this.created.push(actor);return actor;
  }
}
class Adapter extends MemoryRuntimeAdapter{constructor(actors){super();this.actors=actors}async resolveDocument(uuid){const doc=this.actors.map.get(uuid);if(!doc)throw new Error('Document not found');return doc}}

async function build(){
  const api=await createConfiguratorAPI(new Storage()),v=(await api.createRuleset({id:'world',nameKey:'World',version:'1'})).versionId;
  await api.registerDefinitionType(v,{id:'ability',key:'ability',nameKey:'Ability',allowedCapabilities:['value'],defaultCapabilities:['value'],requiredCapabilities:['value'],fields:{}});
  for(const id of ['sense','grit'])await api.createDefinition(v,{id,key:id,nameKey:id,definitionTypeId:'ability',capabilities:['value'],data:{}});
  await api.createContentType(v,{id:'origin',nameKey:'Origin',storageKind:'item'});
  await api.createContentTemplate(v,{id:'culture',nameKey:'Culture',contentTypeId:'origin',relations:[{id:'sense',operation:'grant',targetRef:{objectKind:'definition',objectId:'sense'},config:{initial:{'value.base':7}}}]});
  await api.createCreationSystem(v,{id:'creation',nameKey:'Creation',steps:[
    {id:'abilities',name:'Ability',kind:'choice',required:true,min:1,max:2,source:{collection:'definitions',objectIds:['sense','grit']}},
    {id:'origin',name:'Origin',kind:'content',required:true,min:1,max:1,source:{collection:'contentTemplates',objectIds:['culture']}},
    {id:'review',name:'Review',kind:'review',required:false}]});
  await api.publishRuleset(v);
  const actors=new Actors(),runtime=createRuntimeAPI(api,{adapter:new Adapter(actors),hooks:null});
  const bridge=new FoundryContentBridge(api,runtime,{hooks:null,documentTypeResolver:()=> 'hero'});
  let user='alice';
  const sessions=new CreationSessions({configurator:api,store:new MemoryCreationSessionStore(),userId:()=>user,
    finalize:(session,{name,actorType})=>bridge.createActorFromCreationSystem(session.rulesetVersionId,session.creationSystemId,{name,actorType,answers:session.answers,sessionId:session.id})});
  return {api,v,actors,runtime,sessions,setUser:id=>{user=id;}};
}
async function withActors(actors,work){
  const previous={Actor:globalThis.Actor,game:globalThis.game};
  globalThis.Actor={create:data=>actors.create(data)};globalThis.game={actors};
  try{return await work();}finally{globalThis.Actor=previous.Actor;globalThis.game=previous.game;}
}

test('CP-15: a creation session keeps its answers between visits and moves step by step', async () => {
  const {v,sessions}=await build();
  const started=await sessions.start(v,'creation');
  assert.equal(started.status,'draft');
  assert.equal(started.currentStepId,'abilities');
  assert.equal(started.validationState.complete,false);
  const answered=await sessions.answer(started.id,'abilities',['sense'],{revision:started.revision});
  assert.equal(answered.currentStepId,'origin');
  // Leaving and coming back: the stored session is read again.
  const [resumed]=await sessions.list();
  assert.deepEqual(resumed.answers,{abilities:['sense']});
  const context=await sessions.context(resumed.id);
  assert.deepEqual(context.steps.map(step=>[step.id,step.valid]),[['abilities',true],['origin',false],['review',true]]);
  assert.equal(context.preview,null);
});

test('CP-15: a stale revision is refused and an invalid answer is kept, marked invalid', async () => {
  const {v,sessions}=await build();
  const s=await sessions.start(v,'creation');
  await sessions.answer(s.id,'abilities',['sense']);
  await assert.rejects(()=>sessions.answer(s.id,'abilities',['grit'],{revision:s.revision}),error=>error.code==='CREATION_SESSION_CONFLICT');
  const bad=await sessions.answer(s.id,'abilities',['sense','grit','sense']);
  assert.deepEqual(bad.answers.abilities,['sense','grit','sense']);
  assert.match(bad.validationState.steps.find(step=>step.id==='abilities').errors[0],/Duplicate/);
});

test('CP-15: finalizing builds the character, and only then completes the session', async () => {
  const {v,sessions,actors,runtime}=await build();
  const s=await sessions.start(v,'creation');
  await assert.rejects(()=>sessions.finalize(s.id,{name:'Hero'}),error=>error.code==='CREATION_SESSION_INCOMPLETE');
  await sessions.answer(s.id,'abilities',['sense','grit']);
  const ready=await sessions.answer(s.id,'origin',['culture']);
  assert.ok((await sessions.context(s.id)).preview.operations.length);
  const {session,actor}=await withActors(actors,()=>sessions.finalize(s.id,{name:'Hero',revision:ready.revision}));
  assert.equal(session.status,'completed');
  assert.equal(session.result.actorUuid,actor.uuid);
  const state=await runtime.getContainerState(actor.uuid);
  assert.deepEqual(Object.keys(state.definitionStates).sort(),['grit','sense']);
  assert.equal(state.definitionStates.sense.capabilityStates.value.base,7);
  // The chosen Definitions were written in one transaction.
  assert.equal((await runtime.getLedger(actor.uuid)).filter(entry=>entry.kind==='acquisition').length,1);
  await assert.rejects(()=>sessions.answer(s.id,'abilities',['sense']),error=>error.code==='CREATION_SESSION_CLOSED');
});

test('CP-15: finalizing again after an interruption reuses or rebuilds the session Actor, never duplicates it', async () => {
  const {v,sessions,actors}=await build();
  const s=await sessions.start(v,'creation');
  await sessions.answer(s.id,'abilities',['sense']);await sessions.answer(s.id,'origin',['culture']);
  // An earlier attempt stopped after Actor.create: its half-built Actor is replaced.
  const orphan=await actors.create({name:'Hero',type:'hero',flags:{'rule-them-all':{creationSessionId:s.id}}});
  const {actor}=await withActors(actors,()=>sessions.finalize(s.id,{name:'Hero'}));
  assert.equal(orphan.deleted,true);
  assert.notEqual(actor.uuid,orphan.uuid);
  assert.equal(actors.map.size,1);
});

test('CP-15: sessions belong to their user and can be abandoned', async () => {
  const {v,sessions,setUser}=await build();
  const s=await sessions.start(v,'creation');
  setUser('bob');
  assert.deepEqual(await sessions.list(),[]);
  await assert.rejects(()=>sessions.answer(s.id,'abilities',['sense']),error=>error.code==='CREATION_SESSION_NOT_FOUND');
  setUser('alice');
  assert.equal((await sessions.abandon(s.id)).status,'abandoned');
});
