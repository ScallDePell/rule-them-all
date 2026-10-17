import test from 'node:test';
import assert from 'node:assert/strict';
import {createConfiguratorAPI} from '../src/configurator/configurator-api.mjs';
import {emptyStorageSnapshot} from '../src/configurator/configurator-storage.mjs';
import {prepareFormula} from '../src/configurator/rule-contracts.mjs';
import {validateRuleset} from '../src/configurator/configurator-validation.mjs';
import {MemoryRuntimeAdapter} from '../src/runtime/memory-runtime-adapter.mjs';
import {RuntimeEngine} from '../src/runtime/runtime-engine.mjs';
import {prepareRuntimeReference, toRuntimeReference} from '../src/runtime/runtime-reference.mjs';
class Storage{value=emptyStorageSnapshot();async load(){return structuredClone(this.value)}async save(v){this.value=structuredClone(v)}}
const meta={enabled:true,order:10,tags:[]};
const ref=(outputId,capabilityId='value',extra={})=>({objectKind:'definition',objectId:'strength',capabilityId,outputId,...extra});

async function setup(){
  const api=await createConfiguratorAPI(new Storage());const v=(await api.createRuleset({id:'r',nameKey:'R',version:'1'})).versionId;
  await api.registerDefinitionType(v,{id:'attribute',key:'attribute',nameKey:'Attribute',descriptionKey:'',color:null,order:10,allowedCapabilities:['value'],defaultCapabilities:['value'],requiredCapabilities:['value'],fields:{},constraints:[]});
  await api.createDefinition(v,{id:'strength',key:'strength',definitionTypeId:'attribute',nameKey:'Strength',descriptionKey:'',data:{},capabilities:['value'],...meta});
  await api.createParameter(v,{id:'level',nameKey:'Level',valueType:'integer',value:3,scope:'ruleset',...meta});
  return {api,v};
}
const formula=(id,reference)=>({id,nameKey:id,resultType:'number',expression:{type:'reference',reference},...meta});
const found=(result,code)=>result.diagnostics.filter(x=>x.code===code).map(x=>[x.objectId,x.severity]);

test('CP-24: each level a Reference names must exist on its target', async () => {
  const {api,v}=await setup();
  const ruleset=structuredClone(api.getRuleset(v));
  ruleset.formulas.push(formula('unknown-capability',ref('pool.current','pool',{slotId:'hp'})),formula('unknown-output',ref('value.nope')),
    formula('output-only',{objectKind:'definition',objectId:'strength',outputId:'value.base'}),formula('parameter-output',{objectKind:'parameter',objectId:'level',outputId:'value.base'}),formula('ok',ref('value.final')));
  const result=validateRuleset(ruleset,{scope:'save'});
  assert.deepEqual(found(result,'REFERENCE_CAPABILITY'),[['unknown-capability','ERROR']]);
  assert.deepEqual(found(result,'REFERENCE_OUTPUT'),[['unknown-output','ERROR']]);
  assert.deepEqual(found(result,'REFERENCE_LEVEL'),[['output-only','ERROR'],['parameter-output','ERROR']]);
  assert.ok(!result.diagnostics.some(x=>x.objectId==='ok'));
});

test('CP-24: a value consumer must reach an output; an unset operand blocks only publish', async () => {
  const {api,v}=await setup();
  await api.createFormula(v,formula('object-level',{objectKind:'definition',objectId:'strength'}));
  await api.createFormula(v,formula('unset',{objectKind:'',objectId:''}));
  const save=api.diagnoseRuleset(v,{scope:'save'}),publish=api.diagnoseRuleset(v,{scope:'publish'});
  assert.deepEqual(found(save,'REFERENCE_LEVEL'),[['object-level','WARNING']]);
  assert.deepEqual(found(save,'REFERENCE_UNSET'),[['unset','WARNING']]);
  assert.deepEqual(found(publish,'REFERENCE_UNSET'),[['unset','ERROR']]);
});

test('CP-24: Reference types must match their consumer', async () => {
  const {api,v}=await setup();
  await api.createParameter(v,{id:'label',nameKey:'Label',valueType:'string',value:'x',scope:'ruleset',...meta});
  await api.createFormula(v,{id:'text',nameKey:'Text',resultType:'string',expression:{type:'parameter',id:'label'},...meta});
  await api.createTest(v,{id:'check',nameKey:'Check',rollRef:null,totalFormulaRef:'text',inputBindings:[{id:'flag',valueType:'boolean',source:{reference:ref('value.final')},required:true}],targetValue:0,outcomeRefs:[],fallbackOutcomeRef:null,...meta});
  const result=api.diagnoseRuleset(v,{scope:'publish'});
  assert.deepEqual(found(result,'TEST_TYPE'),[['check','ERROR']]);
  assert.deepEqual(found(result,'TEST_INPUT_TYPE'),[['check','ERROR']]);
});

test('CP-24: RuntimeReference is {container, reference}; containers are roles or RuntimeContainerRefs', async () => {
  assert.deepEqual(toRuntimeReference(ref('value.base'),'target'),{container:'target',reference:ref('value.base')});
  assert.deepEqual(prepareRuntimeReference({container:{kind:'actor',id:'a'},reference:ref('value.base')}).container,{kind:'actor',id:'a'});
  assert.throws(()=>prepareRuntimeReference({container:'not a role',reference:ref('value.base')}),/valid role/);
  assert.throws(()=>prepareFormula({id:'f',nameKey:'F',expression:{type:'reference',reference:ref('value.base'),container:'Actor.abc def'}}),/container must be a context role/);
  const {api,v}=await setup();
  await api.createFormula(v,{id:'their-strength',nameKey:'Their strength',resultType:'number',expression:{type:'reference',reference:ref('value.base'),container:'target'},...meta});
  await api.publishRuleset(v);
  const engine=new RuntimeEngine({configurator:api,adapter:new MemoryRuntimeAdapter(),hooks:null}),me={kind:'actor',id:'me'},them={kind:'actor',id:'them'};
  await engine.instantiateDefinition(v,me,'strength',{initial:{'value.base':2}});
  await engine.instantiateDefinition(v,them,'strength',{initial:{'value.base':7}});
  const context={roles:{self:me,target:them}};
  assert.equal(await engine.resolveReference(v,{container:'self',reference:ref('value.base')},context),2);
  assert.equal(await engine.resolveReference(v,{container:them,reference:ref('value.base')},{roles:{}}),7);
  assert.equal(await engine.evaluator(v).formula('their-strength',context),7);
  await assert.rejects(()=>engine.resolveReference(v,{container:'ally',reference:ref('value.base')},context),/role is missing: ally/);
});
