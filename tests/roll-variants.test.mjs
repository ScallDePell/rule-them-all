import test from 'node:test';
import assert from 'node:assert/strict';
import {createConfiguratorAPI} from '../src/configurator/configurator-api.mjs';
import {emptyStorageSnapshot} from '../src/configurator/configurator-storage.mjs';
import {MemoryRuntimeAdapter} from '../src/runtime/memory-runtime-adapter.mjs';
import {RuntimeEngine} from '../src/runtime/runtime-engine.mjs';
class Storage{value=emptyStorageSnapshot();async load(){return structuredClone(this.value)}async save(v){this.value=structuredClone(v)}}
// Every die shows 3; the formulas thrown are recorded.
class Adapter extends MemoryRuntimeAdapter{rolled=[];async roll(formula){this.rolled.push(formula);const dice=[...formula.matchAll(/(\d+)d\d+/g)].reduce((n,m)=>n+Number(m[1]),0);return {formula,total:dice*3,natural:3,result:String(dice*3)};}}
const ref=(objectId,capabilityId,outputId,slotId)=>({objectKind:'definition',objectId,capabilityId,outputId,...(slotId?{slotId}:{})});
const hero={kind:'actor',id:'hero'},foe={kind:'actor',id:'foe'},context={roles:{self:hero,target:foe},defaultRole:'self'};
const above=(id,threshold=0)=>({type:'gt',left:{type:'reference',reference:ref(id,'value','value.final')},right:{type:'literal',value:threshold}});

async function setup(){
  const api=await createConfiguratorAPI(new Storage());
  const v=(await api.createRuleset({id:'dice',nameKey:'Dice',version:'1'})).versionId;
  await api.registerDefinitionType(v,{id:'trait',key:'trait',nameKey:'Trait',allowedCapabilities:['value','pool'],defaultCapabilities:['value'],requiredCapabilities:[],fields:{}});
  for(const id of ['edge','flaw','might','resistant'])await api.createDefinition(v,{id,key:id,definitionTypeId:'trait',nameKey:id,data:{},capabilities:['value']});
  await api.createDefinition(v,{id:'vitality',key:'vitality',definitionTypeId:'trait',nameKey:'Vitality',data:{},capabilities:['pool'],slots:{pool:[{id:'points',minimum:{literal:0},maximum:{literal:30}}]}});
  await api.createCondition(v,{id:'has-edge',nameKey:'Edge',expression:{type:'and',args:[above('edge'),{type:'not',value:above('flaw')}]}});
  await api.createCondition(v,{id:'has-flaw',nameKey:'Flaw',expression:{type:'and',args:[above('flaw'),{type:'not',value:above('edge')}]}});
  await api.createRoll(v,{id:'d20',nameKey:'d20',formula:'1d20',variants:[{conditionRef:'has-edge',formula:'2d20kh1'},{conditionRef:'has-flaw',formula:'2d20kl1'}]});
  await api.createRoll(v,{id:'pool',nameKey:'Pool',formula:'(@test.dice)d10cs>=8'});
  await api.createRoll(v,{id:'chosen',nameKey:'Chosen die',formula:'1d@input.faces'});
  await api.createFormula(v,{id:'might',nameKey:'Might',resultType:'number',expression:{type:'reference',reference:ref('might','value','value.final')}});
  await api.createFormula(v,{id:'half-if-resists',nameKey:'Half',resultType:'number',expression:{type:'if',condition:{type:'gt',left:{type:'reference',container:'target',reference:ref('resistant','value','value.final')},right:{type:'literal',value:0}},then:{type:'literal',value:0.5},else:{type:'literal',value:1}}});
  await api.createTest(v,{id:'check',nameKey:'Check',rollRef:'d20',targetValue:10});
  await api.createTest(v,{id:'pool-check',nameKey:'Pool check',rollRef:'pool',targetValue:1,inputBindings:[{id:'dice',valueType:'number',source:{formulaRef:'might'}}]});
  await api.createEffect(v,{id:'burn',nameKey:'Burn',targetRef:ref('vitality','pool','pool.current','points'),targetRole:'target',operation:'subtract',operand:{kind:'roll',rollRef:'chosen',bonusFormulaRef:'might',factorFormulaRef:'half-if-resists'}});
  await api.createAction(v,{id:'blast',nameKey:'Blast',effectRefs:['burn']});
  await api.publishRuleset(v);
  const adapter=new Adapter(),engine=new RuntimeEngine({configurator:api,adapter,hooks:null});
  for(const actor of [hero,foe])await engine.initializeContainer(v,actor,{initialByDefinition:{might:{'value.base':2}}});
  return {api,v,engine,adapter};
}

test('A Roll variant replaces the dice while its Condition is true, and cancelling Conditions fall back to the plain dice', async()=>{
  const {v,engine,adapter}=await setup();
  const thrown=async()=>{await engine.executeTest(v,'check',context);return adapter.rolled.at(-1);};
  assert.equal(await thrown(),'1d20');
  await engine.setDefinitionState(v,hero,'edge',{base:1});
  assert.equal(await thrown(),'2d20kh1');
  await engine.setDefinitionState(v,hero,'flaw',{base:1});
  assert.equal(await thrown(),'1d20','edge and flaw cancel out');
  await engine.setDefinitionState(v,hero,'edge',{base:0});
  assert.equal(await thrown(),'2d20kl1');
});

test('A dice count can come from a Test input and the faces from an Action input', async()=>{
  const {v,engine,adapter}=await setup();
  await engine.executeTest(v,'pool-check',context);
  assert.equal(adapter.rolled.at(-1),'(2)d10cs>=8','might 2 gives two dice');
  await engine.executeAction(v,'blast',{...context,variables:{input:{faces:6}}});
  assert.equal(adapter.rolled.at(-1),'1d6');
});

test('A factor applies after the roll and its bonus, rounded down', async()=>{
  const {v,engine}=await setup();
  const vitality=()=>engine.resolveReference(v,{container:'target',reference:ref('vitality','pool','pool.current','points')},context);
  let result=await engine.executeAction(v,'blast',{...context,variables:{input:{faces:6}}});
  assert.equal(result.changes[0].operand,5,'3 + might 2');
  assert.equal(await vitality(),25);
  await engine.setDefinitionState(v,foe,'resistant',{base:1});
  result=await engine.executeAction(v,'blast',{...context,variables:{input:{faces:6}}});
  assert.equal(result.changes[0].operand,2,'(3 + 2) × 0.5 rounded down');
  assert.equal(result.changes[0].roll.factor,0.5);
});

test('A Roll variant needs a Condition and a safe dice formula', async()=>{
  const {api,v}=await setup();
  await assert.rejects(api.createRoll(v,{id:'bad',nameKey:'Bad',formula:'1d20',variants:[{conditionRef:'has-edge',formula:'1d20; drop'}]}),/Invalid Roll formula/);
  await assert.rejects(api.createRoll(v,{id:'lost',nameKey:'Lost',formula:'1d20',variants:[{conditionRef:'missing',formula:'2d20kh1'}]}),/condition\/missing/);
});
