import test from 'node:test';
import assert from 'node:assert/strict';
import {createConfiguratorAPI} from '../src/configurator/configurator-api.mjs';
import {emptyStorageSnapshot} from '../src/configurator/configurator-storage.mjs';
import {MemoryRuntimeAdapter} from '../src/runtime/memory-runtime-adapter.mjs';
import {RuntimeEngine} from '../src/runtime/runtime-engine.mjs';
import {foundryDice,rerollSomeDice} from '../src/runtime/dice-results.mjs';
import {readDice} from '../src/configurator/dice-reading.mjs';
class Storage{value=emptyStorageSnapshot();async load(){return structuredClone(this.value)}async save(v){this.value=structuredClone(v)}}
const term=(group,values,modifiers=['cs>=6'],sign=1)=>({group,faces:10,modifiers,sign,pooled:false,value:modifiers.length?values.filter(v=>v>=6).length:values.reduce((a,b)=>a+b,0),results:values.map(value=>({value,active:true}))});
/** Each roll of the pool formula takes the next scripted dice; a single die thrown again takes the next of `singles`. */
class Adapter extends MemoryRuntimeAdapter{pools=[];singles=[];async roll(formula){
  if(/^1d\d+$/.test(formula)){const n=this.singles.shift();return {formula,total:n,natural:n,result:String(n)};}
  const dice=this.pools.shift(),total=dice.reduce((sum,t)=>sum+t.sign*t.value,0);return {formula,total,natural:dice[0].results[0].value,result:String(total),dice};}}
const ref=(objectId,capabilityId,outputId,slotId)=>({objectKind:'definition',objectId,capabilityId,outputId,...(slotId?{slotId}:{})});
const hero={kind:'actor',id:'hero'},context={roles:{self:hero,target:hero},defaultRole:'self'};
const dice=(read,extra={})=>({type:'dice',read,...extra});
const lit=value=>({type:'literal',value});

async function setup(){
  const api=await createConfiguratorAPI(new Storage());
  const v=(await api.createRuleset({id:'pools',nameKey:'Pools',version:'1'})).versionId;
  await api.registerDefinitionType(v,{id:'trait',key:'trait',nameKey:'Trait',allowedCapabilities:['pool','value'],defaultCapabilities:[],requiredCapabilities:[],fields:{}});
  await api.createDefinition(v,{id:'willpower',key:'willpower',definitionTypeId:'trait',nameKey:'Willpower',data:{},capabilities:['pool'],slots:{pool:[{id:'points',minimum:{literal:0},maximum:{literal:5}}]}});
  await api.createDefinition(v,{id:'momentum',key:'momentum',definitionTypeId:'trait',nameKey:'Momentum',data:{},capabilities:['value']});
  await api.createRoll(v,{id:'pool',nameKey:'Pool',formula:'3d10cs>=6[base] + 2d10cs>=6[hunger]'});
  await api.createFormula(v,{id:'tens',nameKey:'Tens',resultType:'integer',expression:dice('count',{compare:'eq',value:lit(10)})});
  await api.createFormula(v,{id:'momentum-value',nameKey:'Momentum',resultType:'number',expression:{type:'reference',reference:ref('momentum','value','value.base')}});
  // A pair of 10s is a critical; with a hunger 10 among them it is messy. Each pair adds 2 successes.
  await api.createFormula(v,{id:'successes',nameKey:'Successes',resultType:'number',expression:{type:'add',args:[{type:'context',path:'variables.test.rollTotal'},{type:'multiply',args:[lit(2),{type:'floor',value:{type:'divide',args:[{type:'formula',id:'tens'},lit(2)]}}]}]}});
  await api.createCondition(v,{id:'messy',nameKey:'Messy',expression:{type:'and',args:[{type:'gte',left:{type:'formula',id:'tens'},right:lit(2)},{type:'gte',left:dice('count',{group:'hunger',compare:'eq',value:lit(10)}),right:lit(1)}]}});
  await api.createCondition(v,{id:'win',nameKey:'Win',expression:{type:'gte',left:{type:'context',path:'variables.test.total'},right:lit(3)}});
  await api.createCondition(v,{id:'has-will',nameKey:'Has Willpower',expression:{type:'gt',left:{type:'reference',reference:ref('willpower','pool','pool.current','points')},right:lit(0)}});
  await api.createOutcome(v,{id:'messy',nameKey:'Messy critical',resultKey:'messy',conditionRef:'messy'});
  await api.createOutcome(v,{id:'win',nameKey:'Win',resultKey:'win',conditionRef:'win'});
  await api.createOutcome(v,{id:'fail',nameKey:'Fail',resultKey:'fail'});
  await api.createTest(v,{id:'act',nameKey:'Act',rollRef:'pool',totalFormulaRef:'successes',outcomeRefs:['messy','win'],fallbackOutcomeRef:'fail'});
  await api.createEffect(v,{id:'spend-will',nameKey:'Spend Willpower',targetRef:ref('willpower','pool','pool.current','points'),targetRole:'self',operation:'subtract',operand:{kind:'literal',value:1}});
  await api.createAction(v,{id:'act',nameKey:'Act',testRef:'act'});
  // Willpower: throw again the base dice that failed; the hunger dice stay.
  await api.createAction(v,{id:'reroll-failures',nameKey:'Reroll failures',conditionRefs:['has-will'],costEffectRefs:['spend-will'],reroll:{actionRefs:['act'],dice:{group:'base',compare:'lt',value:6}}});
  // Burn momentum: the lowest... here every hunger die takes the momentum value.
  await api.createAction(v,{id:'burn',nameKey:'Burn',reroll:{actionRefs:['act'],dice:{group:'hunger',replaceFormulaRef:'momentum-value'}}});
  await api.publishRuleset(v);
  const adapter=new Adapter(),engine=new RuntimeEngine({configurator:api,adapter,hooks:null});
  await engine.initializeContainer(v,hero,{});
  await engine.setDefinitionState(v,hero,'momentum',{base:7});
  return {api,v,engine,adapter};
}

test('Formulas read the dice one by one and by group: a pair of 10s with a hunger 10 is a messy critical', async()=>{
  const {v,engine,adapter}=await setup();
  adapter.pools=[[term('base',[10,3,7]),term('hunger',[10,2])]];
  const result=(await engine.executeAction(v,'act',context)).testResult;
  assert.equal(result.roll.total,3,'three successes on the dice');
  assert.equal(result.total,5,'plus 2 for the pair of 10s');
  assert.equal(result.outcome.resultKey,'messy');
  adapter.pools=[[term('base',[10,10,7]),term('hunger',[2,2])]];
  assert.equal((await engine.executeAction(v,'act',context)).testResult.outcome.resultKey,'win','a clean critical');
});

test('A reroll throws again only the matching dice, and the total follows', async()=>{
  const {v,engine,adapter}=await setup();
  adapter.pools=[[term('base',[1,3,7]),term('hunger',[2,4])]];
  const first=await engine.executeAction(v,'act',context);
  assert.equal(first.testResult.outcome.resultKey,'fail');
  adapter.singles=[8,9];
  const second=await engine.rerollAction(v,'reroll-failures',first.use,context);
  assert.deepEqual(second.testResult.roll.dice.map(t=>t.results.map(r=>r.value)),[[8,9,7],[2,4]],'only the failed base dice moved');
  assert.equal(second.testResult.roll.total,3);assert.equal(second.testResult.outcome.resultKey,'win');
  assert.equal(await engine.resolveReference(v,ref('willpower','pool','pool.current','points'),context),4);
});

test('A reroll can set the matching dice to a Formula value instead of throwing them', async()=>{
  const {v,engine,adapter}=await setup();
  adapter.pools=[[term('base',[1,3,7]),term('hunger',[2,4])]];
  const first=await engine.executeAction(v,'act',context);
  const second=await engine.rerollAction(v,'burn',first.use,context);
  assert.deepEqual(second.testResult.roll.dice[1].results.map(r=>r.value),[7,7]);
  assert.equal(second.testResult.roll.total,3);
});

test('Dice helpers: keep modifiers choose again, subtracted terms keep their sign, pooled dice refuse a partial reroll', async()=>{
  const roll={total:9,dice:[{group:null,faces:20,modifiers:['kh'],sign:1,pooled:false,value:12,results:[{value:12,active:true},{value:5,active:false,dropped:true}]},{group:'malus',faces:6,modifiers:[],sign:-1,pooled:false,value:3,results:[{value:3,active:true}]}]};
  const next=await rerollSomeDice(roll,{compare:'eq',value:12},{next:async()=>2});
  assert.equal(next.total,2,'5 is kept now, minus 3');assert.deepEqual(next.dice[0].results.map(r=>r.active),[false,true]);
  assert.equal(readDice(next.dice,{read:'highest'}),5);assert.equal(readDice(next.dice,{read:'size'}),2);
  assert.equal(readDice([{results:[{value:4,active:true},{value:4,active:true},{value:1,active:true}]}],{read:'matches'}),2);
  await assert.rejects(rerollSomeDice({total:8,dice:[{...roll.dice[1],pooled:true}]},{},{next:async()=>1}),/cannot be thrown again/);
  // A Foundry Roll: operators give the sign; dice nested in a pool are listed as pooled.
  const die=(faces,flavor,values)=>({faces,flavor,modifiers:[],total:values.reduce((a,b)=>a+b,0),results:values.map(result=>({result,active:true}))});
  const inner=die(6,'',[5]),foundry={terms:[die(20,'',[11]),{operator:'-'},die(4,'fear',[2]),{operator:'+'},{rolls:[]}],dice:[]};foundry.dice=[foundry.terms[0],foundry.terms[2],inner];
  assert.deepEqual(foundryDice(foundry).map(t=>[t.group,t.sign,t.pooled]),[[null,1,false],['fear',-1,false],[null,1,true]]);
});

test('Saving checks the dice node and the partial reroll', async()=>{
  const {api,v}=await setup();
  await assert.rejects(api.createFormula(v,{id:'bad',nameKey:'Bad',resultType:'integer',expression:dice('average')}),/read must be/);
  await assert.rejects(api.createFormula(v,{id:'bad2',nameKey:'Bad',resultType:'integer',expression:dice('count',{compare:'eq'})}),/value must be an AST/);
  await assert.rejects(api.createAction(v,{id:'r1',nameKey:'R',reroll:{dice:{compare:'lt'}}}),/value must be a number/);
  await assert.rejects(api.createAction(v,{id:'r2',nameKey:'R',reroll:{dice:{replaceFormulaRef:'missing'}}}),/formula\/missing/);
});
