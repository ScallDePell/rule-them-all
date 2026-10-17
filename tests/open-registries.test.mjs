import test from 'node:test';
import assert from 'node:assert/strict';
import {createConfiguratorAPI} from '../src/configurator/configurator-api.mjs';
import {emptyStorageSnapshot} from '../src/configurator/configurator-storage.mjs';
import {prepareFormula, prepareEffect} from '../src/configurator/rule-contracts.mjs';
import {formulaNodeRegistry, effectOperationRegistry, inferFormulaType, engineRegistries} from '../src/configurator/operation-registries.mjs';
import {RuntimeEvaluator} from '../src/runtime/runtime-evaluator.mjs';
import {MemoryRuntimeAdapter} from '../src/runtime/memory-runtime-adapter.mjs';
import {RuntimeEngine} from '../src/runtime/runtime-engine.mjs';
import {REGISTER_TYPES_HOOK} from '../src/core/module-contract.mjs';
class Storage{value=emptyStorageSnapshot();async load(){return structuredClone(this.value)}async save(v){this.value=structuredClone(v)}}
const meta={enabled:true,order:10,tags:[]};
const strength={objectKind:'definition',objectId:'strength',capabilityId:'value',outputId:'value.base'};

async function setup(){
  const api=await createConfiguratorAPI(new Storage());const v=(await api.createRuleset({id:'r',nameKey:'R',version:'1'})).versionId;
  await api.registerDefinitionType(v,{id:'attribute',key:'attribute',nameKey:'Attribute',descriptionKey:'',color:null,order:10,allowedCapabilities:['value','state'],defaultCapabilities:['value'],requiredCapabilities:['value'],fields:{},constraints:[]});
  await api.createDefinition(v,{id:'strength',key:'strength',definitionTypeId:'attribute',nameKey:'Strength',descriptionKey:'',data:{},capabilities:['value','state'],...meta});
  return {api,v};
}
const codes=(result,code)=>result.diagnostics.filter(x=>x.code===code);

test('the hook hands out the open registries', () => {
  assert.equal(REGISTER_TYPES_HOOK,'ruleThemAllRegisterTypes');
  const registries=engineRegistries();
  assert.equal(registries.formulaNodes,formulaNodeRegistry);
  assert.equal(registries.effectOperations,effectOperationRegistry);
  assert.ok(registries.valueTypes.has('integer'));
});

test('a module-registered Formula node validates, types and evaluates', async () => {
  formulaNodeRegistry.register({id:'test.double',resultType:(node,infer)=>infer(node.value),
    validate:(node,label)=>{if(!node.value)throw new Error(`${label}.value is required.`);},
    evaluate:async(node,{ev})=>2*Number(await ev(node.value))});
  assert.throws(()=>formulaNodeRegistry.register({id:'test.double',evaluate:()=>0}),/already registered/);
  assert.throws(()=>prepareFormula({id:'f',nameKey:'F',expression:{type:'test.double'}}),/value is required/);
  assert.throws(()=>prepareFormula({id:'f',nameKey:'F',expression:{type:'nope'}}),/unsupported node type: nope/);
  const expression={type:'test.double',value:{type:'literal',value:4}};
  prepareFormula({id:'f',nameKey:'F',expression});
  assert.equal(inferFormulaType(expression),'integer');
  const evaluator=new RuntimeEvaluator({ruleset:{formulas:[]},resolveReference:()=>0});
  assert.equal(await evaluator.evaluate(expression),8);
  await assert.rejects(()=>evaluator.evaluate({type:'nope'}),/does not support AST node: nope/);
});

test('a module-registered Effect operation runs in the engine', async () => {
  effectOperationRegistry.register({id:'test.halve',targetTypes:['number'],apply:(current,operand)=>Math.floor(Number(current)/Number(operand))});
  assert.throws(()=>prepareEffect({id:'e',nameKey:'E',targetRef:strength,operation:'nope',operand:{kind:'literal',value:1}}),/Unknown Effect operation: nope/);
  const {api,v}=await setup();
  await api.createEffect(v,{id:'halve',nameKey:'Halve',targetRef:strength,operation:'test.halve',operand:{kind:'literal',value:2},...meta});
  await api.createAction(v,{id:'weaken',nameKey:'Weaken',conditionRefs:[],costEffectRefs:[],effectRefs:['halve'],...meta});
  await api.publishRuleset(v);
  const engine=new RuntimeEngine({configurator:api,adapter:new MemoryRuntimeAdapter(),hooks:null}),actor={kind:'actor',id:'a'};
  await engine.instantiateDefinition(v,actor,'strength',{initial:{'value.base':9}});
  const result=await engine.executeAction(v,'weaken',{roles:{self:actor,target:actor}});
  assert.equal(result.changes[0].after,4);
});

test('a Formula must produce its resultType and a Condition a boolean: warning in draft, error at publish', async () => {
  const {api,v}=await setup();
  await api.createParameter(v,{id:'name',nameKey:'Name',valueType:'string',value:'x',scope:'ruleset',...meta});
  await api.createFormula(v,{id:'bad',nameKey:'Bad',resultType:'number',expression:{type:'parameter',id:'name'},...meta});
  await api.createFormula(v,{id:'ok',nameKey:'Ok',resultType:'number',expression:{type:'add',args:[{type:'literal',value:1},{type:'reference',reference:strength}]},...meta});
  await api.createCondition(v,{id:'not-bool',nameKey:'Not bool',expression:{type:'formula',id:'ok'},...meta});
  await api.createCondition(v,{id:'bool',nameKey:'Bool',expression:{type:'gt',left:{type:'formula',id:'ok'},right:{type:'literal',value:0}},...meta});
  const save=api.diagnoseRuleset(v,{scope:'save'}), publish=api.diagnoseRuleset(v,{scope:'publish'});
  assert.deepEqual(codes(save,'FORMULA_TYPE').map(x=>[x.objectId,x.severity]),[['bad','WARNING']]);
  assert.deepEqual(codes(save,'CONDITION_TYPE').map(x=>[x.objectId,x.severity]),[['not-bool','WARNING']]);
  assert.equal(save.valid,true);
  assert.deepEqual(codes(publish,'FORMULA_TYPE').map(x=>x.severity),['ERROR']);
  assert.equal(publish.valid,false);
});

test('an Effect must target a mutable output with a compatible operation and operand', async () => {
  const {api,v}=await setup();
  const final={...strength,outputId:'value.final'}, active={objectKind:'definition',objectId:'strength',capabilityId:'state',outputId:'state.active'};
  await api.createEffect(v,{id:'derived',nameKey:'Derived',targetRef:final,operation:'add',operand:{kind:'literal',value:1},...meta});
  await api.createEffect(v,{id:'toggle-number',nameKey:'Toggle number',targetRef:strength,operation:'toggle',operand:{kind:'literal',value:0},...meta});
  await api.createEffect(v,{id:'wrong-operand',nameKey:'Wrong operand',targetRef:strength,operation:'set',operand:{kind:'literal',value:true},...meta});
  await api.createEffect(v,{id:'toggle-state',nameKey:'Toggle state',targetRef:active,operation:'toggle',operand:{kind:'literal',value:0},...meta});
  await api.createEffect(v,{id:'add-int',nameKey:'Add int',targetRef:strength,operation:'add',operand:{kind:'literal',value:2},...meta});
  const result=api.diagnoseRuleset(v,{scope:'publish'});
  assert.deepEqual(codes(result,'EFFECT_TARGET').map(x=>x.objectId),['derived']);
  assert.deepEqual(codes(result,'EFFECT_OPERATION').map(x=>x.objectId),['toggle-number']);
  assert.deepEqual(codes(result,'EFFECT_OPERAND').map(x=>x.objectId),['wrong-operand']);
});
