import test from 'node:test';
import assert from 'node:assert/strict';
import {createConfiguratorAPI} from '../src/configurator/configurator-api.mjs';
import {emptyStorageSnapshot} from '../src/configurator/configurator-storage.mjs';
import {MemoryRuntimeAdapter} from '../src/runtime/memory-runtime-adapter.mjs';
import {RuntimeEngine} from '../src/runtime/runtime-engine.mjs';
class Storage{value=emptyStorageSnapshot();async load(){return structuredClone(this.value)}async save(v){this.value=structuredClone(v)}}
const lit=value=>({type:'literal',value});
const pcActive={type:'reference',reference:{objectKind:'definition',objectId:'pc',capabilityId:'state',outputId:'state.active'}};
const hero={kind:'actor',id:'hero'},beast={kind:'actor',id:'beast'};

// RWF-like: a player character's characteristics go from 1 to 5; a creature's have no bounds; Luck stops at 3 for everyone.
async function setup(){
  const api=await createConfiguratorAPI(new Storage());
  const v=(await api.createRuleset({id:'bounds',nameKey:'Bounds',version:'1'})).versionId;
  await api.registerDefinitionType(v,{id:'status',key:'status',nameKey:'Status',allowedCapabilities:['state'],defaultCapabilities:['state'],requiredCapabilities:[],fields:{}});
  await api.createDefinition(v,{id:'pc',key:'pc',definitionTypeId:'status',nameKey:'Player character',data:{},capabilities:['state']});
  await api.createFormula(v,{id:'pc-min',nameKey:'PC minimum',expression:{type:'if',condition:pcActive,then:lit(1),else:lit(null)}});
  await api.createFormula(v,{id:'pc-max',nameKey:'PC maximum',expression:{type:'if',condition:pcActive,then:lit(5),else:lit(null)}});
  await api.registerDefinitionType(v,{id:'attr',key:'attr',nameKey:'Attribute',allowedCapabilities:['value'],defaultCapabilities:['value'],requiredCapabilities:[],fields:{},valueBounds:{minimum:{formulaRef:'pc-min'},maximum:{formulaRef:'pc-max'}}});
  await api.createDefinition(v,{id:'str',key:'str',definitionTypeId:'attr',nameKey:'Strength',data:{},capabilities:['value']});
  await api.createDefinition(v,{id:'luck',key:'luck',definitionTypeId:'attr',nameKey:'Luck',data:{},capabilities:['value'],valueBounds:{maximum:{literal:3}}});
  await api.createAction(v,{id:'train',nameKey:'Train',acquisitions:[{definitionId:'str',ifAbsent:true,add:{'value.base':10}}]});
  await api.publishRuleset(v);
  const engine=new RuntimeEngine({configurator:api,adapter:new MemoryRuntimeAdapter(),hooks:null});
  await engine.initializeContainer(v,hero,{definitionIds:['pc','str','luck'],initialByDefinition:{pc:{'state.active':true}}});
  await engine.initializeContainer(v,beast,{definitionIds:['str','luck']});
  return {api,v,engine};
}
const base=async(engine,ref,id)=>(await engine.getContainerState(ref)).definitionStates[id].capabilityStates.value.base;

test('A value base stays within the bounds of its type, a Formula that gives nothing setting no bound', async()=>{
  const {v,engine}=await setup();
  assert.equal(await base(engine,hero,'str'),1,'a new base rises to the minimum');
  assert.deepEqual(await engine.valueBounds(v,hero,'str'),{minimum:1,maximum:5});
  assert.deepEqual(await engine.valueBounds(v,beast,'str'),{minimum:null,maximum:null});
  await engine.setDefinitionState(v,hero,'str',{base:7});
  assert.equal(await base(engine,hero,'str'),5);
  await engine.setDefinitionState(v,hero,'str',{base:-2});
  assert.equal(await base(engine,hero,'str'),1);
  await engine.setDefinitionState(v,beast,'str',{base:9});
  assert.equal(await base(engine,beast,'str'),9,'a creature has no bound');
  await engine.executeAction(v,'train',{roles:{self:hero,source:hero,target:hero},defaultRole:'self'});
  assert.equal(await base(engine,hero,'str'),5,'an acquisition that raises the base stops at the maximum');
});

test('A Definition’s own bound replaces its type’s; a base already past a bound may only move back', async()=>{
  const {v,engine}=await setup();
  await engine.setDefinitionState(v,beast,'luck',{base:8});
  assert.equal(await base(engine,beast,'luck'),3);
  assert.deepEqual(await engine.valueBounds(v,hero,'luck'),{minimum:1,maximum:3},'the minimum is still its type’s');
  await engine.setDefinitionState(v,beast,'str',{base:9});
  await engine.instantiateDefinition(v,beast,'pc',{initial:{'state.active':true}});
  await engine.setDefinitionState(v,beast,'str',{base:10});
  assert.equal(await base(engine,beast,'str'),9,'above its maximum, the base does not rise further');
  await engine.setDefinitionState(v,beast,'str',{base:8});
  assert.equal(await base(engine,beast,'str'),8,'it may come back down');
});

test('Value bounds are checked: known fields, a minimum not above the maximum', async()=>{
  const {api,v}=await setup();
  const target=v;
  await assert.rejects(api.createDefinition(target,{id:'bad',key:'bad',definitionTypeId:'attr',nameKey:'Bad',data:{},capabilities:['value'],valueBounds:{minimum:{literal:4},maximum:{literal:2}}}),/minimum is above the maximum/);
  await assert.rejects(api.createDefinition(target,{id:'odd',key:'odd',definitionTypeId:'attr',nameKey:'Odd',data:{},capabilities:['value'],valueBounds:{step:{literal:1}}}),/unsupported field: step/);
});
