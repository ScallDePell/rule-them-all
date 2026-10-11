import test from 'node:test';
import assert from 'node:assert/strict';
import {createConfiguratorAPI} from '../src/configurator/configurator-api.mjs';
import {emptyStorageSnapshot} from '../src/configurator/configurator-storage.mjs';
import {analyzeCreationSystem} from '../src/runtime/creation-plan.mjs';
import {FoundryContentBridge} from '../src/runtime/foundry-content-bridge.mjs';
import {MemoryRuntimeAdapter} from '../src/runtime/memory-runtime-adapter.mjs';
import {createRuntimeAPI} from '../src/runtime/runtime-api.mjs';

class Storage{data=emptyStorageSnapshot();async load(){return structuredClone(this.data)}async save(data){this.data=structuredClone(data)}}
class Actors{map=new Map();async create({name}){const id=`Actor.${this.map.size+1}`,actor={uuid:id,documentName:'Actor',name,flags:{},getFlag(s,k){return this.flags[s]?.[k]},async setFlag(s,k,v){(this.flags[s]??={})[k]=structuredClone(v)},async delete(){}};this.map.set(id,actor);return actor;}}
class Adapter extends MemoryRuntimeAdapter{constructor(actors){super();this.actors=actors}async resolveDocument(uuid){const doc=this.actors.map.get(uuid);if(!doc)throw new Error('Document not found');return doc}}
const ctx=path=>({type:'context',path});
const field=id=>({id,name:id,valueType:'integer',cardinality:'one',nullable:false,required:false,constraints:[]});

async function build(){
  const api=await createConfiguratorAPI(new Storage()),v=(await api.createRuleset({id:'alloc',nameKey:'Alloc',version:'1.0.0'})).versionId;
  await api.registerDefinitionType(v,{id:'attribute',key:'attribute',nameKey:'Attribute',allowedCapabilities:['value'],defaultCapabilities:['value'],requiredCapabilities:['value'],fields:{}});
  for(const id of ['strength','mind'])await api.createDefinition(v,{id,key:id,nameKey:id,definitionTypeId:'attribute',capabilities:['value'],data:{}});
  await api.createContentType(v,{id:'age',nameKey:'Age',storageKind:'item',fields:{points:field('points'),oldest:field('oldest'),careers:field('careers')}});
  await api.createContentType(v,{id:'career',nameKey:'Career',storageKind:'item',fields:{minAge:field('minAge')}});
  await api.createContentTemplate(v,{id:'teen',nameKey:'Teen',contentTypeId:'age',data:{points:3,oldest:18,careers:1}});
  await api.createContentTemplate(v,{id:'adult',nameKey:'Adult',contentTypeId:'age',data:{points:5,oldest:50,careers:2}});
  await api.createContentTemplate(v,{id:'base',nameKey:'Base',contentTypeId:'career',data:{minAge:14},relations:[{id:'strength',operation:'grant',targetRef:{objectKind:'definition',objectId:'strength'},config:{initial:{'value.base':1}}},{id:'mind',operation:'grant',targetRef:{objectKind:'definition',objectId:'mind'},config:{initial:{'value.base':1}}}]});
  await api.createContentTemplate(v,{id:'surgeon',nameKey:'Surgeon',contentTypeId:'career',data:{minAge:30}});
  await api.createFormula(v,{id:'age-points',nameKey:'Points',resultType:'number',expression:ctx('variables.creation.age.fields.points')});
  await api.createFormula(v,{id:'age-careers',nameKey:'Careers',resultType:'number',expression:ctx('variables.creation.age.fields.careers')});
  await api.createCondition(v,{id:'old-enough',nameKey:'Old enough',expression:{type:'lte',left:ctx('variables.option.fields.minAge'),right:ctx('variables.creation.age.fields.oldest')}});
  await api.createCreationSystem(v,{id:'creation',nameKey:'Creation',steps:[
    {id:'age',name:'Age',kind:'content',min:1,max:1,source:{collection:'contentTemplates',objectIds:['teen','adult']}},
    {id:'careers',name:'Careers',kind:'content',min:1,max:1,maxFormulaRef:'age-careers',optionConditionRef:'old-enough',source:{collection:'contentTemplates',objectIds:['base','surgeon']}},
    {id:'points',name:'Free points',kind:'allocation',min:0,max:0,minFormulaRef:'age-points',maxFormulaRef:'age-points',perTargetMax:3,source:{collection:'definitions',objectIds:['strength','mind']}}
  ]});
  await api.publishRuleset(v);
  const actors=new Actors(),runtime=createRuntimeAPI(api,{adapter:new Adapter(actors),hooks:null});
  const bridge=new FoundryContentBridge(api,runtime,{hooks:null,documentTypeResolver:()=>'character'});
  return {api,v,actors,runtime,bridge};
}
const errorsOf=async(ruleset,answers)=>Object.fromEntries((await analyzeCreationSystem(ruleset,'creation',answers)).steps.map(step=>[step.id,step.errors.join(' ')]));

test('Step bounds and option availability follow the earlier steps', async()=>{
  const {api,v}=await build(),ruleset=api.getRuleset(v);
  let errors=await errorsOf(ruleset,{age:['teen'],careers:{selectedIds:['base','surgeon']},points:{allocations:{strength:3}}});
  assert.match(errors.careers,/1 to 1/,'a teen has one career');
  errors=await errorsOf(ruleset,{age:['teen'],careers:['surgeon'],points:{allocations:{strength:3}}});
  assert.match(errors.careers,/not available/,'a teen is too young to be a surgeon');
  errors=await errorsOf(ruleset,{age:['adult'],careers:['base','surgeon'],points:{allocations:{strength:3,mind:2}}});
  assert.deepEqual(errors,{age:'',careers:'',points:''});
});

test('Allocation points respect the budget and the per-target maximum, then add to the granted values', async()=>{
  const {api,v,actors,runtime,bridge}=await build(),ruleset=api.getRuleset(v);
  assert.match((await errorsOf(ruleset,{age:['adult'],careers:['base'],points:{allocations:{strength:4,mind:1}}})).points,/at most 3/);
  assert.match((await errorsOf(ruleset,{age:['adult'],careers:['base'],points:{allocations:{strength:3}}})).points,/exactly 5/);
  assert.match((await errorsOf(ruleset,{age:['adult'],careers:['base'],points:{allocations:{luck:5}}})).points,/cannot raise luck/);
  globalThis.Actor={create:data=>actors.create(data)};
  try{
    const {actor}=await bridge.createActorFromCreationSystem(v,'creation',{name:'Hero',answers:{age:['adult'],careers:['base'],points:{allocations:{strength:3,mind:2}}}});
    const state=await runtime.getContainerState(actor.uuid);
    assert.equal(state.definitionStates.strength.capabilityStates.value.base,4,'1 granted + 3 allocated');
    assert.equal(state.definitionStates.mind.capabilityStates.value.base,3);
  }finally{delete globalThis.Actor;}
});
