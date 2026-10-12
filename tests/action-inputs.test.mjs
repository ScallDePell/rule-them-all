import test from 'node:test';
import assert from 'node:assert/strict';
import {createConfiguratorAPI} from '../src/configurator/configurator-api.mjs';
import {emptyStorageSnapshot} from '../src/configurator/configurator-storage.mjs';
import {MemoryRuntimeAdapter} from '../src/runtime/memory-runtime-adapter.mjs';
import {RuntimeEngine} from '../src/runtime/runtime-engine.mjs';
class Storage{value=emptyStorageSnapshot();async load(){return structuredClone(this.value)}async save(v){this.value=structuredClone(v)}}
class Adapter extends MemoryRuntimeAdapter{natural=45;async roll(formula){return {formula,total:this.natural,natural:this.natural,result:String(this.natural)};}}
const ref=(objectId,capabilityId,outputId,slotId)=>({objectKind:'definition',objectId,capabilityId,outputId,...(slotId?{slotId}:{})});
const hero={kind:'actor',id:'hero'},context={roles:{self:hero,target:hero},defaultRole:'self'};
const ctx=path=>({type:'context',path});

async function setup(){
  const api=await createConfiguratorAPI(new Storage());
  const v=(await api.createRuleset({id:'inputs',nameKey:'Inputs',version:'1'})).versionId;
  await api.registerDefinitionType(v,{id:'slot',key:'slot',nameKey:'Spell slots',allowedCapabilities:['pool'],defaultCapabilities:['pool'],requiredCapabilities:[],fields:{}});
  for(const id of ['first','second','third'])await api.createDefinition(v,{id,key:id,definitionTypeId:'slot',nameKey:id,data:{},capabilities:['pool'],slots:{pool:[{id:'uses',minimum:{literal:0},maximum:{literal:3}}]}});
  await api.createRoll(v,{id:'d100',nameKey:'d100',formula:'1d100'});
  await api.createFormula(v,{id:'skill-target',nameKey:'Target',resultType:'number',expression:{type:'add',args:[{type:'literal',value:40},ctx('variables.input.difficulty')]}});
  await api.createFormula(v,{id:'chosen-slot',nameKey:'Chosen slot',resultType:'reference',expression:ctx('variables.input.slot')});
  await api.createCondition(v,{id:'under',nameKey:'Under',expression:{type:'lte',left:ctx('variables.test.total'),right:ctx('variables.test.target')}});
  await api.createOutcome(v,{id:'success',nameKey:'Success',resultKey:'success',conditionRef:'under'});
  await api.createOutcome(v,{id:'failure',nameKey:'Failure',resultKey:'failure'});
  await api.createTest(v,{id:'skill',nameKey:'Skill',rollRef:'d100',targetFormulaRef:'skill-target',outcomeRefs:['success'],fallbackOutcomeRef:'failure'});
  await api.createAction(v,{id:'try',nameKey:'Try',testRef:'skill',inputs:[{id:'difficulty',labelKey:'Difficulty',valueType:'integer',options:[{value:20,labelKey:'Easy'},{value:0,labelKey:'Challenging'},{value:-20,labelKey:'Hard'}],defaultValue:0}]});
  await api.createEffect(v,{id:'spend-slot',nameKey:'Spend a slot',targetRef:ref('first','pool','pool.current','uses'),targetDefinitionFormulaRef:'chosen-slot',targetRole:'self',operation:'subtract',operand:{kind:'literal',value:1}});
  await api.createAction(v,{id:'cast',nameKey:'Cast',costEffectRefs:['spend-slot'],inputs:[{id:'slot',labelKey:'Slot level',valueType:'reference',definitionTypeId:'slot'}]});
  await api.publishRuleset(v);
  const adapter=new Adapter(),engine=new RuntimeEngine({configurator:api,adapter,hooks:null});
  await engine.initializeContainer(v,hero,{definitionIds:['first','second']});
  return {api,v,engine,adapter};
}

test('A chosen difficulty reaches the Test through variables.input, and the default applies when nothing is chosen', async()=>{
  const {v,engine}=await setup();
  const outcome=async input=>(await engine.executeAction(v,'try',{...context,...(input?{variables:{input}}:{})})).testResult;
  let result=await outcome({difficulty:20});
  assert.equal(result.target,60);assert.equal(result.outcome.resultKey,'success');
  result=await outcome({difficulty:-20});
  assert.equal(result.target,20);assert.equal(result.outcome.resultKey,'failure');
  result=await outcome(null);
  assert.equal(result.target,40,'default 0');
});

test('A value outside the listed options or a missing required input is refused before anything is written', async()=>{
  const {v,engine}=await setup();
  await assert.rejects(engine.executeAction(v,'try',{...context,variables:{input:{difficulty:5}}}),/not a choice/);
  await assert.rejects(engine.executeAction(v,'cast',context),/needs a value for Slot level/);
  await assert.rejects(engine.executeAction(v,'cast',{...context,variables:{input:{slot:'nowhere'}}}),/must be a Definition of type slot/);
});

test('An Effect can write the Definition an input chose', async()=>{
  const {v,engine}=await setup();
  const uses=id=>engine.resolveReference(v,ref(id,'pool','pool.current','uses'),context);
  await engine.executeAction(v,'cast',{...context,variables:{input:{slot:'second'}}});
  assert.equal(await uses('second'),2);assert.equal(await uses('first'),3);
  await assert.rejects(engine.executeAction(v,'cast',{...context,variables:{input:{slot:'third'}}}),/not instantiated/,'a slot level the caster does not have');
});

test('describeActionInputs lists the options, and for a Definition the ones the user holds', async()=>{
  const {v,engine}=await setup();
  const [difficulty]=await engine.describeActionInputs(v,'try',context);
  assert.deepEqual(difficulty.options.map(option=>option.value),[20,0,-20]);assert.equal(difficulty.defaultValue,0);
  const [slot]=await engine.describeActionInputs(v,'cast',context);
  assert.deepEqual(slot.options.map(option=>option.value),['first','second']);
  assert.deepEqual((await engine.describeActionInputs(v,'cast',{roles:{}}))[0].options.map(option=>option.value),['first','second','third']);
});

test('Saving checks Action inputs', async()=>{
  const {api,v}=await setup();
  await assert.rejects(api.createAction(v,{id:'bad',nameKey:'Bad',inputs:[{id:'x',valueType:'integer',options:[{value:1.5}]}]}),/integer/i);
  await assert.rejects(api.createAction(v,{id:'twice',nameKey:'Twice',inputs:[{id:'x'},{id:'x'}]}),/same id twice/);
  await assert.rejects(api.createAction(v,{id:'lost',nameKey:'Lost',inputs:[{id:'x',valueType:'reference',definitionTypeId:'missing'}]}),/definitionType\/missing/);
});
