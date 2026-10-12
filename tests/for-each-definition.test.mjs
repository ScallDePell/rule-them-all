import test from 'node:test';
import assert from 'node:assert/strict';
import {createConfiguratorAPI} from '../src/configurator/configurator-api.mjs';
import {emptyStorageSnapshot} from '../src/configurator/configurator-storage.mjs';
import {MemoryRuntimeAdapter} from '../src/runtime/memory-runtime-adapter.mjs';
import {RuntimeEngine} from '../src/runtime/runtime-engine.mjs';
class Storage{value=emptyStorageSnapshot();async load(){return structuredClone(this.value)}async save(v){this.value=structuredClone(v)}}
class Adapter extends MemoryRuntimeAdapter{queue=[];async roll(formula){const n=this.queue.shift();return {formula,total:n,natural:n,result:String(n)};}}
const hero={kind:'actor',id:'hero'},context={roles:{self:hero,target:hero},defaultRole:'self'};
const each={type:'context',path:'variables.each.definition'},lit=value=>({type:'literal',value});
const skillValue={type:'definitionValue',definition:each,capabilityId:'value',outputId:'value.base'};
const ticked={type:'definitionValue',definition:each,capabilityId:'state',outputId:'state.active'};
const base=id=>({objectKind:'definition',objectId:id,capabilityId:'value',outputId:'value.base'});
const mark=id=>({objectKind:'definition',objectId:id,capabilityId:'state',outputId:'state.active'});

async function setup(){
  const api=await createConfiguratorAPI(new Storage());
  const v=(await api.createRuleset({id:'brp',nameKey:'BRP',version:'1'})).versionId;
  await api.registerDefinitionType(v,{id:'skill',key:'skill',nameKey:'Skill',allowedCapabilities:['value','state'],defaultCapabilities:['value','state'],requiredCapabilities:[],fields:{}});
  for(const [id,value] of [['spot',40],['climb',70],['swim',30]])await api.createDefinition(v,{id,key:id,definitionTypeId:'skill',nameKey:id,data:{},capabilities:['value','state']});
  await api.createRoll(v,{id:'d100',nameKey:'d100',formula:'1d100'});
  await api.createFormula(v,{id:'the-skill',nameKey:'The skill',resultType:'reference',expression:each});
  await api.createFormula(v,{id:'skill-value',nameKey:'Skill',resultType:'number',expression:skillValue});
  await api.createCondition(v,{id:'ticked',nameKey:'Ticked',expression:ticked});
  // Improvement: roll above the skill to raise it.
  await api.createCondition(v,{id:'above',nameKey:'Above',expression:{type:'gt',left:{type:'context',path:'variables.test.total'},right:{type:'context',path:'variables.test.target'}}});
  await api.createOutcome(v,{id:'improves',nameKey:'Improves',resultKey:'improves',conditionRef:'above'});
  await api.createOutcome(v,{id:'stays',nameKey:'Stays',resultKey:'stays'});
  await api.createTest(v,{id:'improve',nameKey:'Improve',rollRef:'d100',targetFormulaRef:'skill-value',outcomeRefs:['improves'],fallbackOutcomeRef:'stays'});
  await api.createEffect(v,{id:'raise',nameKey:'Raise',targetRef:base('spot'),targetDefinitionFormulaRef:'the-skill',targetRole:'self',operation:'add',operand:{kind:'literal',value:5}});
  await api.createEffect(v,{id:'untick',nameKey:'Untick',targetRef:mark('spot'),targetDefinitionFormulaRef:'the-skill',targetRole:'self',operation:'set',operand:{kind:'literal',value:false}});
  await api.createAction(v,{id:'session-end',nameKey:'End of session',forEach:{definitionTypeId:'skill',conditionRef:'ticked'},testRef:'improve',effectRefs:['untick'],outcomeMappings:[{outcomeId:'improves',effectRefs:['raise','untick']}]});
  await api.publishRuleset(v);
  const adapter=new Adapter(),engine=new RuntimeEngine({configurator:api,adapter,hooks:null});
  await engine.initializeContainer(v,hero,{});
  for(const [id,value,active] of [['spot',40,true],['climb',70,true],['swim',30,false]])await engine.setDefinitionState(v,hero,id,{base:value,active});
  return {api,v,engine,adapter};
}

test('An Action runs its Test and Effects once for each ticked skill, in one transaction', async()=>{
  const {v,engine,adapter}=await setup();
  adapter.queue=[85,20];
  const used=await engine.executeAction(v,'session-end',context);
  assert.deepEqual(used.each.map(run=>[run.definitionId,run.testResult.outcome.resultKey]),[['spot','improves'],['climb','stays']]);
  const value=id=>engine.resolveReference(v,base(id),context),active=id=>engine.resolveReference(v,mark(id),context);
  assert.equal(await value('spot'),45);assert.equal(await value('climb'),70);assert.equal(await value('swim'),30,'not ticked, not rolled');
  assert.equal(await active('spot'),false);assert.equal(await active('climb'),false);
  assert.equal((await engine.getLedger(hero)).filter(entry=>entry.transactionId===used.transactionId).length,1);
});

test('Saving checks forEach', async()=>{
  const {api,v}=await setup();
  await assert.rejects(api.createAction(v,{id:'x',nameKey:'X',forEach:{definitionTypeId:'nowhere'}}),/definitionType\/nowhere/);
  await assert.rejects(api.createAction(v,{id:'y',nameKey:'Y',targeting:'each',forEach:{definitionTypeId:'skill'}}),/not both/);
});
