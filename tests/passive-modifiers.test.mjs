import test from 'node:test';
import assert from 'node:assert/strict';
import {createConfiguratorAPI} from '../src/configurator/configurator-api.mjs';
import {emptyStorageSnapshot} from '../src/configurator/configurator-storage.mjs';
import {MemoryRuntimeAdapter} from '../src/runtime/memory-runtime-adapter.mjs';
import {RuntimeEngine} from '../src/runtime/runtime-engine.mjs';
class Storage{value=emptyStorageSnapshot();async load(){return structuredClone(this.value)}async save(v){this.value=structuredClone(v)}}
const ref=(objectId,outputId='value.final')=>({objectKind:'definition',objectId,capabilityId:'value',outputId});
const hero={kind:'actor',id:'hero'},context={roles:{self:hero,target:hero},defaultRole:'self'};
const modifier={conditionRefs:[],stacking:{mode:'stack',group:''},priority:0,enabled:true,tags:[]};

async function setup(){
  const api=await createConfiguratorAPI(new Storage());
  const v=(await api.createRuleset({id:'pm',nameKey:'Passive',version:'1'})).versionId;
  await api.registerDefinitionType(v,{id:'trait',key:'trait',nameKey:'Trait',descriptionKey:'',color:null,allowedCapabilities:['value'],defaultCapabilities:['value'],requiredCapabilities:[],fields:{},constraints:[]});
  for(const id of ['might','fatigue','defense'])await api.createDefinition(v,{id,key:id,definitionTypeId:'trait',nameKey:id,descriptionKey:'',data:{},capabilities:['value'],enabled:true,tags:[]});
  await api.createFormula(v,{id:'defense-formula',nameKey:'Defense',resultType:'number',expression:{type:'add',args:[{type:'literal',value:10},{type:'reference',reference:ref('might')}]}});
  await api.createFormulaBinding(v,{id:'defense-binding',nameKey:'Defense',formulaRef:'defense-formula',targetRef:ref('defense')});
  await api.createCondition(v,{id:'tired',nameKey:'Tired',expression:{type:'gte',left:{type:'reference',reference:ref('fatigue','value.base')},right:{type:'literal',value:2}}});
  await api.createModifier(v,{id:'tired-penalty',nameKey:'Tired',targetRef:ref('might'),operation:'subtract',valueSource:{kind:'literal',value:1},...modifier,conditionRefs:['tired']});
  await api.createModifier(v,{id:'shield',nameKey:'Shield',targetRef:ref('defense'),operation:'add',valueSource:{kind:'literal',value:2},...modifier});
  await api.createModifier(v,{id:'blessing',nameKey:'Blessing',targetRef:ref('might'),operation:'add',valueSource:{kind:'literal',value:5},...modifier});
  await api.createAction(v,{id:'bless',nameKey:'Bless',modifierApplications:[{modifierRef:'blessing'}],enabled:true,tags:[]});
  await api.publishRuleset(v);
  const engine=new RuntimeEngine({configurator:api,adapter:new MemoryRuntimeAdapter(),hooks:null});
  await engine.initializeContainer(v,hero,{initialByDefinition:{might:{'value.base':3},fatigue:{'value.base':0}}});
  return {v,engine};
}

test('A Modifier no Action applies changes value.final while its Conditions are true', async()=>{
  const {v,engine}=await setup();
  assert.equal(await engine.resolveReference(v,ref('might'),context),3);
  await engine.setDefinitionState(v,hero,'fatigue',{base:2});
  assert.equal(await engine.resolveReference(v,ref('might'),context),2);
  assert.equal(await engine.resolveReference(v,ref('might','value.base'),context),3,'the base value is untouched');
});

test('A derived value.final takes passive Modifiers on top of its FormulaBinding', async()=>{
  const {v,engine}=await setup();
  assert.equal(await engine.resolveReference(v,ref('defense'),context),15);
});

test('A Modifier an Action applies only works through the ModifierState that Action creates', async()=>{
  const {v,engine}=await setup();
  assert.equal(await engine.resolveReference(v,ref('might'),context),3);
  await engine.executeAction(v,'bless',context);
  assert.equal(await engine.resolveReference(v,ref('might'),context),8);
});

test('One FormulaBinding derives the output for every role', async()=>{
  const {v,engine}=await setup();
  const foe={kind:'actor',id:'foe'};
  await engine.initializeContainer(v,foe,{initialByDefinition:{might:{'value.base':6},fatigue:{'value.base':0}}});
  assert.equal(await engine.resolveReference(v,{container:'target',reference:ref('defense')},{roles:{self:hero,target:foe},defaultRole:'self'}),18);
});
