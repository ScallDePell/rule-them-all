import test from 'node:test';
import assert from 'node:assert/strict';
import {createConfiguratorAPI} from '../src/configurator/configurator-api.mjs';
import {emptyStorageSnapshot} from '../src/configurator/configurator-storage.mjs';
import {MemoryRuntimeAdapter} from '../src/runtime/memory-runtime-adapter.mjs';
import {createRuntimeAPI} from '../src/runtime/runtime-api.mjs';
import {systemEffectPlan, syncSystemEffects, activeEffectData} from '../src/runtime/foundry-system-changes.mjs';
import {collectSystemChanges, systemChangeContext} from '../src/configurator/rule-cards-form.mjs';
class Storage{value=emptyStorageSnapshot();async load(){return structuredClone(this.value)}async save(v){this.value=structuredClone(v)}}
const hero={kind:'actor',id:'hero'},foe={kind:'actor',id:'foe'},context={roles:{self:hero,target:foe},defaultRole:'self'};
const weaken=[{key:'system.abilities.str.value',type:'add',value:-2}];

// A dnd5e weapon that saps Strength: the state "Weakened" lowers the system's own Strength while it lasts.
async function setup(){
  const api=await createConfiguratorAPI(new Storage());
  const v=(await api.createRuleset({id:'sap',nameKey:'Sap',version:'1'})).versionId;
  await api.registerDefinitionType(v,{id:'status',key:'status',nameKey:'Status',allowedCapabilities:['state'],defaultCapabilities:['state'],requiredCapabilities:[],fields:{}});
  await api.createDefinition(v,{id:'weakened',key:'weakened',definitionTypeId:'status',nameKey:'Weakened',data:{},capabilities:['state'],systemChanges:weaken});
  await api.createAction(v,{id:'sap',nameKey:'Sapping blade',stateApplications:[{definitionId:'weakened',stacking:'stack'}]});
  await api.createAction(v,{id:'cure',nameKey:'Cure',stateRemovals:[{definitionId:'weakened',targetRole:'target'}]});
  await api.publishRuleset(v);
  const runtime=createRuntimeAPI(api,{adapter:new MemoryRuntimeAdapter(),hooks:null});
  for(const ref of [hero,foe])await runtime.initializeContainer(v,ref,{definitionIds:[]});
  return {api,v,runtime};
}

test('A state with system changes asks one Active Effect of its target, its changes repeated per stack, none once removed', async()=>{
  const {v,runtime}=await setup();
  assert.deepEqual(await runtime.systemChanges(foe),[]);
  await runtime.executeAction(v,'sap',context);
  let [effect]=await runtime.systemChanges(foe);
  assert.deepEqual([effect.definitionId,effect.name,effect.stacks,effect.changes],['weakened','Weakened',1,[{key:'system.abilities.str.value',type:'add',value:'-2'}]]);
  assert.deepEqual(await runtime.systemChanges(hero),[],'the wielder is untouched');
  await runtime.executeAction(v,'sap',context);
  [effect]=await runtime.systemChanges(foe);
  assert.equal(effect.changes.length,2,'two stacks: -2 twice');
  await runtime.executeAction(v,'cure',context);
  assert.deepEqual(await runtime.systemChanges(foe),[]);
});

test('System changes are refused without the state capability or with a bad row', async()=>{
  const {api,v}=await setup();
  await api.registerDefinitionType(v,{id:'stat',key:'stat',nameKey:'Stat',allowedCapabilities:['value','state'],defaultCapabilities:['value'],requiredCapabilities:[],fields:{}});
  await assert.rejects(api.createDefinition(v,{id:'s1',key:'s1',definitionTypeId:'stat',nameKey:'S1',data:{},capabilities:['value'],systemChanges:weaken}),/state capability/);
  await assert.rejects(api.createDefinition(v,{id:'s2',key:'s2',definitionTypeId:'stat',nameKey:'S2',data:{},capabilities:['state'],systemChanges:[{key:'system.x',type:'subtract',value:1}]}),/type must be/);
  await assert.rejects(api.createDefinition(v,{id:'s3',key:'s3',definitionTypeId:'stat',nameKey:'S3',data:{},capabilities:['state'],systemChanges:[{key:'flags.rule-them-all.runtime',type:'override',value:1}]}),/module's own data/);
  await assert.rejects(api.createDefinition(v,{id:'s4',key:'s4',definitionTypeId:'stat',nameKey:'S4',data:{},capabilities:['state'],systemChanges:[{key:'system.x',type:'add',value:''}]}),/value/);
});

test('The GM keeps the managed Active Effects of an Actor in step: stale ones deleted, missing ones created', async()=>{
  assert.deepEqual(systemEffectPlan([{id:'a',definitionId:'weakened',signature:'old'},{id:'b',definitionId:'gone',signature:'x'}],[{definitionId:'weakened',signature:'new'}]),{remove:['a','b'],create:[{definitionId:'weakened',signature:'new'}]});
  assert.deepEqual(systemEffectPlan([{id:'a',definitionId:'weakened',signature:'s'}],[{definitionId:'weakened',signature:'s'}]),{remove:[],create:[]});
  const calls=[],actor={uuid:'Actor.foe',effects:[{id:'other',flags:{}},{id:'old',flags:{'rule-them-all':{systemChanges:{definitionId:'weakened',signature:'old'}}}}],
    createEmbeddedDocuments:async(type,data)=>calls.push(['create',type,data]),deleteEmbeddedDocuments:async(type,ids)=>calls.push(['delete',type,ids])};
  const wanted=[{definitionId:'weakened',name:'Weakened',stacks:1,changes:[{key:'system.abilities.str.value',type:'add',value:'-2'}],signature:'new'}];
  await syncSystemEffects(actor,{systemChanges:async()=>wanted});
  assert.deepEqual(calls.map(call=>call.slice(0,2)),[['delete','ActiveEffect'],['create','ActiveEffect']]);
  assert.deepEqual(calls[0][2],['old'],'an effect the module did not make is left alone');
  assert.deepEqual(calls[1][2][0].system.changes,wanted[0].changes,'Foundry v14 keeps changes in system.changes');
  assert.deepEqual(activeEffectData(wanted[0],{schemaFields:{changes:{}},modes:{ADD:2}}).changes,[{key:'system.abilities.str.value',mode:2,value:'-2'}],'an older schema takes numeric modes');
});

test('The Definition editor lists the system changes and reads them back, numbers kept as numbers', ()=>{
  const context=systemChangeContext({systemChanges:weaken});
  assert.equal(context.systemChanges.rows[0].types.find(type=>type.selected).id,'add');
  const cards=[{key:'system.abilities.str.value',type:'add',value:'-2'},{key:'system.traits.size',type:'override',value:'sm'},{key:'',type:'add',value:'1'}];
  const queryAll=()=>cards.map(card=>({querySelectorAll:()=>Object.entries(card).map(([name,value])=>({dataset:{cardProp:name},value,closest:function(){return this.owner;}}))}));
  const fake=()=>queryAll().map(card=>{const controls=card.querySelectorAll();const node={querySelectorAll:()=>controls};for(const control of controls)control.owner=node;return node;});
  assert.deepEqual(collectSystemChanges(fake),[{key:'system.abilities.str.value',type:'add',value:-2},{key:'system.traits.size',type:'override',value:'sm'}]);
  assert.equal(collectSystemChanges(()=>[]),undefined);
});
