import test from 'node:test';
import assert from 'node:assert/strict';
import {createConfiguratorAPI} from '../src/configurator/configurator-api.mjs';
import {emptyStorageSnapshot} from '../src/configurator/configurator-storage.mjs';
import {MemoryRuntimeAdapter} from '../src/runtime/memory-runtime-adapter.mjs';
import {createRuntimeAPI} from '../src/runtime/runtime-api.mjs';
import {WORLD_CONTAINER} from '../src/runtime/runtime-engine.mjs';
import {hasSharedResources} from '../src/runtime/shared-resources.mjs';
import {renderSharedResourcesHTML} from '../src/ui/shared-resources-markup.mjs';
class Storage{value=emptyStorageSnapshot();async load(){return structuredClone(this.value)}async save(v){this.value=structuredClone(v)}}
const fight={kind:'combat',id:'c1'},t=key=>key;

// The GM's Fear (a pool 0..12) and a Doom value held by the world, an escalation die (0..6) held by each combat.
async function setup(){
  const api=await createConfiguratorAPI(new Storage());
  const v=(await api.createRuleset({id:'shared',nameKey:'Shared',version:'1'})).versionId;
  await api.registerDefinitionType(v,{id:'track',key:'track',nameKey:'Track',allowedCapabilities:['pool','value'],defaultCapabilities:['pool'],requiredCapabilities:[],fields:{}});
  const pool=(id,max)=>({id,key:id,definitionTypeId:'track',nameKey:id,data:{},capabilities:['pool'],slots:{pool:[{id:'points',minimum:{literal:0},maximum:{literal:max},initial:{literal:0}}]}});
  await api.createDefinition(v,pool('fear',12));
  await api.createDefinition(v,pool('escalation',6));
  await api.createDefinition(v,{id:'doom',key:'doom',definitionTypeId:'track',nameKey:'Doom',data:{},capabilities:['value']});
  await api.updateRuleset(v,{sharedDefinitions:{world:['fear','doom'],combat:['escalation']}});
  await api.publishRuleset(v);
  const adapter=new MemoryRuntimeAdapter(),runtime=createRuntimeAPI(api,{adapter,hooks:null});
  return {api,v,adapter,runtime};
}

test('The panel lists the world resources, and the combat ones only while a combat is in progress', async()=>{
  const {api,v,runtime}=await setup();
  assert.equal(hasSharedResources(api.getPublishedRuleset(v)),true);
  await runtime.initializeShared(v);
  let groups=await runtime.describeShared(v);
  assert.deepEqual(groups.map(g=>[g.holder,g.ref]),[['world',WORLD_CONTAINER],['combat',null]]);
  assert.deepEqual(groups[0].rows.map(r=>[r.definitionId,r.slotId,r.value,r.minimum,r.maximum,r.writable]),[['fear','points',0,0,12,true],['doom',null,0,null,null,true]]);
  assert.match(renderSharedResourcesHTML(groups,{t}),/RTA\.Shared\.NoCombat/);
  await runtime.initializeShared(v,{combat:fight});
  groups=await runtime.describeShared(v,{combat:fight});
  assert.deepEqual(groups[1].rows.map(r=>[r.definitionId,r.value,r.maximum]),[['escalation',0,6]]);
});

test('The GM sets a shared value or pool slot, held within its bounds', async()=>{
  const {v,runtime}=await setup();
  await runtime.initializeShared(v,{combat:fight});
  await runtime.setSharedValue(v,WORLD_CONTAINER,'fear','points',5);
  await runtime.setSharedValue(v,WORLD_CONTAINER,'doom',null,-3);
  await runtime.setSharedValue(v,fight,'escalation','points',9);
  const [world,combat]=await runtime.describeShared(v,{combat:fight});
  assert.deepEqual(world.rows.map(r=>r.value),[5,-3]);
  assert.equal(combat.rows[0].value,6);
  await assert.rejects(runtime.setSharedValue(v,WORLD_CONTAINER,'fear','points','abc'),/number/);
});

test('A player sees the shared resources without changing them', async()=>{
  const {v,adapter,runtime}=await setup();
  await runtime.initializeShared(v);
  // Foundry's world container makes every player an observer.
  adapter.users.set('alice',{role:'player',isGM:false});adapter.ownership.set('world:world|alice','observer');adapter.currentUserId='alice';
  const [world]=await runtime.describeShared(v);
  assert.deepEqual(world.rows.map(r=>[r.value,r.writable]),[[0,false],[0,false]]);
  const html=renderSharedResourcesHTML([world],{t});
  assert.doesNotMatch(html,/data-shared-value/);
  assert.match(html,/<strong class="rta-shared__number">0 \/ 12<\/strong>/);
});

test('The GM rows carry the inputs the panel reads, and a Ruleset without shared resources offers no panel', async()=>{
  const {v,runtime}=await setup();
  await runtime.initializeShared(v);
  const html=renderSharedResourcesHTML(await runtime.describeShared(v),{t});
  assert.match(html,/data-shared-value data-holder="world" data-definition="fear" data-slot="points"/);
  assert.match(html,/min="0" max="12" value="0"/);
  assert.equal(hasSharedResources({sharedDefinitions:{world:[],combat:[]}}),false);
  assert.match(renderSharedResourcesHTML([],{t}),/RTA\.Shared\.None/);
});
