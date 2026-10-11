import test from 'node:test';
import assert from 'node:assert/strict';
import {createConfiguratorAPI} from '../src/configurator/configurator-api.mjs';
import {emptyStorageSnapshot} from '../src/configurator/configurator-storage.mjs';
import {MemoryRuntimeAdapter} from '../src/runtime/memory-runtime-adapter.mjs';
import {RuntimeEngine} from '../src/runtime/runtime-engine.mjs';
import {LEDGER_LIMIT, diffRuntimeStates} from '../src/runtime/runtime-transaction.mjs';
class Storage{value=emptyStorageSnapshot();async load(){return structuredClone(this.value)}async save(v){this.value=structuredClone(v)}}
const ref=(objectId,slotId)=>({objectKind:'definition',objectId,capabilityId:'pool',slotId,outputId:'pool.current'});
const A={kind:'actor',id:'a'},B={kind:'actor',id:'b'};
const context={roles:{self:A,target:B},defaultRole:'self'};

async function setup(adapter=new MemoryRuntimeAdapter()){
  const api=await createConfiguratorAPI(new Storage());
  const v=(await api.createRuleset({id:'tx',nameKey:'Tx',version:'1'})).versionId;
  await api.registerDefinitionType(v,{id:'body',key:'body',nameKey:'Body',descriptionKey:'',color:null,allowedCapabilities:['pool'],defaultCapabilities:['pool'],requiredCapabilities:[],fields:{},constraints:[]});
  await api.createDefinition(v,{id:'hero',key:'hero',definitionTypeId:'body',nameKey:'Hero',descriptionKey:'',data:{},capabilities:['pool'],slots:{pool:[{id:'hp',minimum:{literal:0},maximum:{literal:10}},{id:'stamina',minimum:{literal:0},maximum:{literal:3}}]},enabled:true,tags:[]});
  await api.createEffect(v,{id:'tire',nameKey:'Tire',targetRole:'self',targetRef:ref('hero','stamina'),operation:'subtract',operand:{kind:'literal',value:1},enabled:true,tags:[]});
  await api.createEffect(v,{id:'hurt',nameKey:'Hurt',targetRole:'target',targetRef:ref('hero','hp'),operation:'subtract',operand:{kind:'literal',value:4},enabled:true,tags:[]});
  await api.createAction(v,{id:'strike',nameKey:'Strike',costEffectRefs:['tire'],effectRefs:['hurt'],enabled:true,tags:[]});
  await api.publishRuleset(v);
  const engine=new RuntimeEngine({configurator:api,adapter,hooks:null});
  for(const actor of [A,B])await engine.initializeContainer(v,actor);
  return {api,v,engine,adapter};
}
const pool=async(engine,actor,slot)=>(await engine.getContainerState(actor)).definitionStates.hero.capabilityStates.pool[slot].current;

test('CP-08: an Action writes each container once, with one ledger entry per container and one transaction id', async () => {
  const {v,engine}=await setup();
  const before=(await engine.getContainerState(B)).runtimeRevision;
  const result=await engine.executeAction(v,'strike',context);
  assert.equal(result.duplicate,false);
  assert.equal(await pool(engine,A,'stamina'),2);
  assert.equal(await pool(engine,B,'hp'),6);
  assert.equal((await engine.getContainerState(B)).runtimeRevision,before+1);
  const [a]=(await engine.getLedger(A)).filter(entry=>entry.kind==='action'),[b]=(await engine.getLedger(B)).filter(entry=>entry.kind==='action');
  assert.equal(a.transactionId,result.transactionId);
  assert.equal(b.transactionId,result.transactionId);
  assert.deepEqual(result.ledgerEntryIds.sort(),[a.id,b.id].sort());
  assert.deepEqual(b.summary,{actionId:'strike',outcomeKey:null});
  assert.equal(b.changes[0].scope,'definition');
  assert.equal(b.changes[0].before.capabilityStates.pool.hp.current,10);
  assert.equal(b.changes[0].after.capabilityStates.pool.hp.current,6);
});

test('CP-08: replaying a transaction id is idempotent', async () => {
  const {v,engine}=await setup();
  await engine.executeAction(v,'strike',context,{transactionId:'swing-1'});
  const replay=await engine.executeAction(v,'strike',context,{transactionId:'swing-1'});
  assert.equal(replay.duplicate,true);
  assert.equal(await pool(engine,B,'hp'),6);
  assert.equal((await engine.getLedger(B)).filter(entry=>entry.transactionId==='swing-1').length,1);
});

test('CP-08: a container changed since it was read is a conflict and nothing is written', async () => {
  const {v,engine}=await setup();
  const tx=engine.transaction(v,'set');
  const state=await tx.load(B);
  await engine.setDefinitionState(v,B,'hero',{pools:{hp:9}});
  state.definitionStates.hero.capabilityStates.pool.hp.current=1;
  await assert.rejects(()=>tx.commit(),error=>error.code==='RUNTIME_CONFLICT');
  assert.equal(await pool(engine,B,'hp'),9);
});

test('CP-08: a failed write compensates the containers already written', async () => {
  class Failing extends MemoryRuntimeAdapter{failOn=null;async write(ref,payload){if(ref.id===this.failOn)throw new Error('disk full');return super.write(ref,payload);}}
  const adapter=new Failing();
  const {v,engine}=await setup(adapter);
  const ledgerA=await engine.getLedger(A),revisionA=(await engine.getContainerState(A)).runtimeRevision;
  adapter.failOn='b';
  await assert.rejects(()=>engine.executeAction(v,'strike',context),error=>error.code==='TRANSACTION_FAILED'&&error.details.compensated===true&&/disk full/.test(error.message));
  assert.equal(await pool(engine,A,'stamina'),3);
  assert.equal(await pool(engine,B,'hp'),10);
  assert.deepEqual(await engine.getLedger(A),ledgerA);
  // The restored content carries a newer revision, so a writer that read the failed state still conflicts.
  assert.equal((await engine.getContainerState(A)).runtimeRevision,revisionA+2);
});

test('CP-08: every container is checked for Foundry write permission before the first write', async () => {
  class ReadOnlyB extends MemoryRuntimeAdapter{async canWrite(ref){return ref.id!=='b';}}
  const adapter=new MemoryRuntimeAdapter();
  const {v,engine,api}=await setup(adapter);
  const locked=new RuntimeEngine({configurator:api,adapter:Object.assign(new ReadOnlyB(),{states:adapter.states,ledgers:adapter.ledgers}),hooks:null});
  await assert.rejects(()=>locked.executeAction(v,'strike',context),error=>error.code==='RUNTIME_NEEDS_GM');
  assert.equal(await pool(engine,A,'stamina'),3);
});

test('CP-08: a correction is a new compensating entry, refused once the state moved on', async () => {
  const {v,engine}=await setup();
  await engine.setDefinitionState(v,B,'hero',{pools:{hp:7}});
  const first=(await engine.getLedger(B)).at(-1);
  await engine.setDefinitionState(v,B,'hero',{pools:{hp:5}});
  await assert.rejects(()=>engine.compensate(v,B,first.id),error=>error.code==='COMPENSATION_REFUSED');
  const second=(await engine.getLedger(B)).at(-1);
  const correction=await engine.compensate(v,B,second.id);
  assert.equal(correction.kind,'compensation');
  assert.equal(correction.corrects,second.id);
  assert.equal(await pool(engine,B,'hp'),7);
  await assert.rejects(()=>engine.compensate(v,B,second.id),/already compensated/);
  // The original entries are still in the ledger, unchanged.
  assert.deepEqual((await engine.getLedger(B)).find(entry=>entry.id===second.id),second);
});

test('CP-08: removing a DefinitionState is journaled and can be compensated', async () => {
  const {v,engine}=await setup();
  await engine.removeDefinitionState(v,A,'hero');
  const entry=(await engine.getLedger(A)).at(-1);
  assert.equal(entry.kind,'remove');
  assert.equal(entry.changes[0].after,null);
  await engine.compensate(v,A,entry.id);
  assert.equal(await pool(engine,A,'hp'),10);
});

test('CP-08: the ledger keeps the most recent entries and states without changes write nothing', async () => {
  const {v,engine}=await setup();
  const revision=(await engine.getContainerState(A)).runtimeRevision;
  const tx=engine.transaction(v,'set');await tx.load(A);
  assert.deepEqual((await tx.commit()).entries,[]);
  assert.equal((await engine.getContainerState(A)).runtimeRevision,revision);
  for(let i=0;i<LEDGER_LIMIT+5;i++)await engine.setDefinitionState(v,A,'hero',{pools:{hp:i%2?4:5}});
  assert.equal((await engine.getLedger(A)).length,LEDGER_LIMIT);
  assert.deepEqual(diffRuntimeStates({definitionStates:{},stateInstances:[{id:'s',active:true}]},{definitionStates:{},stateInstances:[]}),[{scope:'stateInstance',id:'s',before:{id:'s',active:true},after:null}]);
});

test('CP-08 Foundry adapter: state and ledger go out in one Document update, the state replacing the stored object', async () => {
  const {FoundryRuntimeAdapter}=await import('../src/runtime/foundry-runtime-adapter.mjs');
  const updates=[],flags={};
  const doc={id:'a',name:'A',getFlag:(scope,key)=>flags[key],canUserModify:()=>true,async update(data){updates.push(data);}};
  class ForcedReplacement{static create(value){return {replaced:value};}}
  const previous={foundry:globalThis.foundry,game:globalThis.game};
  globalThis.foundry={data:{operators:{ForcedReplacement}}};globalThis.game={actors:{get:()=>doc},user:{}};
  try{
    const adapter=new FoundryRuntimeAdapter(),state={schemaVersion:2,rulesetVersionId:'v',runtimeRevision:1,definitionStates:{},stateInstances:[]};
    await adapter.write({kind:'actor',id:'a'},{state,ledger:[{id:'l1'}]});
    assert.equal(updates.length,1);
    assert.deepEqual(updates[0],{'flags.rule-them-all.runtimeState':{replaced:state},'flags.rule-them-all.runtimeLedger':[{id:'l1'}]});
    flags.runtimeLedger=[{id:'l1'}];
    assert.deepEqual(await adapter.loadLedger({kind:'actor',id:'a'}),[{id:'l1'}]);
  }finally{globalThis.foundry=previous.foundry;globalThis.game=previous.game;}
});
