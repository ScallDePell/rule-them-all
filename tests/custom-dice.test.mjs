import test from 'node:test';
import assert from 'node:assert/strict';
import {createConfiguratorAPI} from '../src/configurator/configurator-api.mjs';
import {emptyStorageSnapshot} from '../src/configurator/configurator-storage.mjs';
import {MemoryRuntimeAdapter} from '../src/runtime/memory-runtime-adapter.mjs';
import {RuntimeEngine} from '../src/runtime/runtime-engine.mjs';
import {foundryDice,dieFace} from '../src/runtime/dice-results.mjs';
import {rulesetDieClass,registerRulesetDice} from '../src/runtime/foundry-dice.mjs';
import {parseRollFormula,multiplyDice} from '../src/configurator/roll-grammar.mjs';
import {collectDie} from '../src/configurator/die-form.mjs';
class Storage{value=emptyStorageSnapshot();async load(){return structuredClone(this.value)}async save(v){this.value=structuredClone(v)}}

// Narrative dice: a green die with successes and advantages, a purple one whose failures and threats cancel them.
const ability={id:'ability',nameKey:'Ability',denomination:'a',counters:[{id:'success',labelKey:'Success'},{id:'advantage',labelKey:'Advantage'}],
  faces:[{labelKey:'Blank'},{labelKey:'Success',counts:{success:1}},{labelKey:'Success Advantage',counts:{success:1,advantage:1}},{labelKey:'Advantage x2',counts:{advantage:2}}]};
const difficulty={id:'difficulty',nameKey:'Difficulty',denomination:'k',counters:[{id:'success',labelKey:'Success'},{id:'advantage',labelKey:'Advantage'}],
  faces:[{labelKey:'Blank'},{labelKey:'Failure',counts:{success:-1}},{labelKey:'Threat',counts:{advantage:-1}}]};
const counter=(id,group)=>({type:'dice',read:'counter',counter:id,...(group?{group}:{})});
/** Each pool roll takes the next scripted faces, described as Foundry would ({die, results with face and counts}). */
const term=(die,faces,sign=1)=>({group:null,faces:die.faces.length,modifiers:[],sign,pooled:false,die:{id:die.id,faces:die.faces},value:faces.reduce((s,f)=>s+dieFace(die,f).value,0),results:faces.map(f=>({...dieFace(die,f),active:true}))});
class Adapter extends MemoryRuntimeAdapter{pools=[];singles=[];seen=[];async roll(formula,data,options={}){this.seen.push({formula,options});
  if(/^1d\d+$/.test(formula)){const n=this.singles.shift();return {formula,total:n,natural:n,result:String(n)};}
  const dice=this.pools.shift(),total=dice.reduce((s,t)=>s+t.sign*t.value,0);return {formula,total,natural:null,result:String(total),dice};}}
const hero={kind:'actor',id:'hero'},context={roles:{self:hero},defaultRole:'self'};

async function setup(){
  const api=await createConfiguratorAPI(new Storage());
  const v=(await api.createRuleset({id:'narrative',nameKey:'Narrative',version:'1'})).versionId;
  await api.createDie(v,ability);await api.createDie(v,difficulty);
  await api.createRoll(v,{id:'check',nameKey:'Check',formula:'2da + 1dk'});
  await api.createFormula(v,{id:'net-success',nameKey:'Net successes',resultType:'number',expression:counter('success')});
  await api.createFormula(v,{id:'net-advantage',nameKey:'Net advantages',resultType:'number',expression:counter('advantage')});
  await api.createCondition(v,{id:'succeeds',nameKey:'Succeeds',expression:{type:'gte',left:{type:'context',path:'variables.test.total'},right:{type:'literal',value:1}}});
  await api.createOutcome(v,{id:'success',nameKey:'Success',resultKey:'success',conditionRef:'succeeds'});
  await api.createOutcome(v,{id:'failure',nameKey:'Failure',resultKey:'failure'});
  await api.createTest(v,{id:'check',nameKey:'Check',rollRef:'check',totalFormulaRef:'net-success',outcomeRefs:['success'],fallbackOutcomeRef:'failure'});
  await api.createAction(v,{id:'check',nameKey:'Check',testRef:'check'});
  await api.createAction(v,{id:'push',nameKey:'Push',reroll:{actionRefs:['check'],dice:{compare:'eq',value:1}}});
  await api.publishRuleset(v);
  const adapter=new Adapter(),engine=new RuntimeEngine({configurator:api,adapter,hooks:null});
  await engine.initializeContainer(v,hero,{});
  return {api,v,engine,adapter};
}

test('A Test counts the symbols of the Ruleset dice, and the opposite symbols cancel', async()=>{
  const {v,engine,adapter}=await setup();
  adapter.pools=[[term(ability,[2,3]),term(difficulty,[2])]];
  const result=(await engine.executeAction(v,'check',context)).testResult;
  assert.equal(result.total,1,'two successes, one failure');
  assert.equal(result.outcome.resultKey,'success');
  assert.equal(await engine.evaluateFormula(v,'net-advantage',{...context,variables:{roll:result.roll}}),1);
  assert.deepEqual(adapter.seen[0].options.dice.map(d=>d.denomination),['a','k'],'the adapter gets the dice to make known to Foundry');
  assert.equal(adapter.seen[0].options.rulesetKey,'narrative');
});

test('A partial reroll lands the dice on new faces, with their symbols', async()=>{
  const {v,engine,adapter}=await setup();
  adapter.pools=[[term(ability,[1,1]),term(difficulty,[2])]];
  const first=await engine.executeAction(v,'check',context);
  assert.equal(first.testResult.outcome.resultKey,'failure');
  adapter.singles=[2,3];
  const second=await engine.rerollAction(v,'push',first.use,context);
  assert.deepEqual(second.testResult.roll.dice[0].results.map(r=>r.counts),[{success:1},{success:1,advantage:1}]);
  assert.equal(second.testResult.total,1);
});

test('Saving checks the Die, its letter, its counters and who throws it', async()=>{
  const {api,v}=await setup();
  await assert.rejects(api.createDie(v,{...ability,id:'x',denomination:'d'}),/letter/);
  await assert.rejects(api.createDie(v,{...ability,id:'x',denomination:'zz'}),/letter/);
  await assert.rejects(api.createDie(v,{...ability,id:'x',denomination:'z',faces:[{counts:{luck:1}},{}]}),/unknown counter: luck/);
  await assert.rejects(api.createDie(v,{...ability,id:'x',denomination:'a'}),/both use the letter a/);
  await assert.rejects(api.createRoll(v,{id:'r',nameKey:'R',formula:'1dq'}),/die\/dq/);
  await assert.rejects(api.createFormula(v,{id:'f',nameKey:'F',resultType:'number',expression:counter('luck')}),/No Die counts luck/);
  await assert.rejects(api.deleteDie(v,'ability'),/still referenced/);
  assert.deepEqual(parseRollFormula('2da+1dk[fear]+4df').customDice,['a','k']);
  assert.equal(multiplyDice('2da+1',2),'4da+1');
});

test('Foundry: a Die becomes a dice term under its letter, totals its values and shows its faces', ()=>{
  class Base{constructor({number=1,faces=6,modifiers=[],results=[]}={}){Object.assign(this,{number,faces,modifiers,results,_evaluated:true});}}
  const marvel={id:'marvel',denomination:'m',faces:[{labelKey:'M',value:6},{},{},{},{},{}]};
  const config={Dice:{terms:{}}};
  const [Cls]=registerRulesetDice('marvel-rpg',[marvel,{...ability,enabled:false}],{config,Base});
  assert.equal(config.Dice.terms.m,Cls);assert.equal(config.Dice.termTypes[Cls.name],Cls);assert.equal(Object.keys(config.Dice.terms).length,1,'a disabled Die stays unknown');
  assert.equal(rulesetDieClass(Base,'marvel-rpg',marvel),Cls,'made once');
  const t=new Cls({number:2,results:[{result:1,active:true},{result:4,active:true}]});
  assert.equal(t.faces,6);assert.equal(t.total,10,'the first face is worth 6');assert.equal(t.expression,'2dm');assert.equal(t.getResultLabel({result:1}),'M');
  const [described]=foundryDice({terms:[t],dice:[t]});
  assert.equal(described.die.id,'marvel');assert.deepEqual(described.results.map(r=>[r.face,r.value]),[[1,6],[4,4]]);
});

test('The Die editor turns counter and face cards into the Die', ()=>{
  const cards={dieCounter:[{id:'success',key:'success',labelKey:'Success'},{id:'',key:'new-1',labelKey:'Dark side'}],dieFace:[{labelKey:'Hit',value:'','count:success':'1','count:new-1':''},{labelKey:'Doom',value:'2','count:success':'-1','count:new-1':'1'}]};
  // A card whose controls all belong to it, as readCard expects.
  const card=props=>{const self={},controls=Object.entries(props).map(([cardProp,value])=>({dataset:{cardProp},value,closest:()=>self}));self.querySelectorAll=()=>controls;return self;};
  const fixed=selector=>(cards[selector.match(/"(.+)"/)[1]]??[]).map(card);
  assert.deepEqual(collectDie(fixed),{counters:[{id:'success',labelKey:'Success'},{id:'dark-side',labelKey:'Dark side'}],faces:[{labelKey:'Hit',value:null,counts:{success:1}},{labelKey:'Doom',value:2,counts:{success:-1,'dark-side':1}}]});
});
