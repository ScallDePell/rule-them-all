import test from 'node:test';
import assert from 'node:assert/strict';
import {createConfiguratorAPI} from '../src/configurator/configurator-api.mjs';
import {emptyStorageSnapshot} from '../src/configurator/configurator-storage.mjs';
import {prepareCreationSystem} from '../src/configurator/rule-contracts.mjs';
import {collectCreationSteps} from '../src/configurator/creation-step-serialization.mjs';
import {CreationSessions, MemoryCreationSessionStore} from '../src/runtime/creation-sessions.mjs';
import {analyzeCreationSystem} from '../src/runtime/creation-plan.mjs';
class Storage{data=emptyStorageSnapshot();async load(){return structuredClone(this.data)}async save(data){this.data=structuredClone(data)}}
const ctx=path=>({type:'context',path}),lit=value=>({type:'literal',value});

// Traveller-like: point-buy attributes (a point costs more past the second), then careers term after term:
// a survival roll each term, a skill only for a term survived, at most 3 terms and none after a failed survival.
async function build(){
  const api=await createConfiguratorAPI(new Storage()),v=(await api.createRuleset({id:'terms',nameKey:'Terms',version:'1'})).versionId;
  await api.registerDefinitionType(v,{id:'stat',key:'stat',nameKey:'Stat',allowedCapabilities:['value'],defaultCapabilities:['value'],requiredCapabilities:[],fields:{}});
  for(const id of ['str','int','pilot','gun'])await api.createDefinition(v,{id,key:id,nameKey:id,definitionTypeId:'stat',capabilities:['value'],data:{}});
  await api.createFormula(v,{id:'point-cost',nameKey:'Point cost',resultType:'number',expression:{type:'add',args:[lit(1),{type:'floor',value:{type:'divide',args:[ctx('variables.allocation.point'),lit(3)]}}]}});
  await api.createRoll(v,{id:'survival',nameKey:'2d6',formula:'2d6'});
  await api.createCondition(v,{id:'survived',nameKey:'Survived',expression:{type:'gte',left:ctx('variables.creation.survival.total'),right:lit(7)}});
  await api.createCreationSystem(v,{id:'creation',nameKey:'Creation',steps:[
    {id:'attributes',name:'Attributes',kind:'allocation',min:6,max:6,costFormulaRef:'point-cost',source:{collection:'definitions',objectIds:['str','int']}},
    {id:'survival',name:'Survival',kind:'roll',rollRef:'survival'},
    {id:'skill',name:'Skill',kind:'choice',min:1,max:1,conditionRef:'survived',source:{collection:'definitions',objectIds:['pilot','gun']},repeat:{steps:2,max:3,continueConditionRef:'survived'}}]});
  await api.publishRuleset(v);
  const rolls=[];
  const sessions=new CreationSessions({configurator:api,store:new MemoryCreationSessionStore(),userId:()=>'alice',roll:async formula=>({total:rolls.shift(),result:formula}),finalize:async()=>({})});
  return {api,v,sessions,rolls,ruleset:()=>api.getRuleset(v)};
}
const errorsOf=async(ruleset,answers)=>Object.fromEntries((await analyzeCreationSystem(ruleset,'creation',answers)).steps.map(step=>[step.id,step.errors.join(' ')]));

test('An allocation can cost a Formula per point', async()=>{
  const {ruleset}=await build();
  // str 3 (1+1+2) + int 2 (1+1) = 6; str 4 alone costs 1+1+2+2 = 6 too.
  assert.equal((await errorsOf(ruleset(),{attributes:{allocations:{str:3,int:2}},survival:{total:5}})).attributes,'');
  assert.match((await errorsOf(ruleset(),{attributes:{allocations:{str:3,int:3}},survival:{total:5}})).attributes,/costs 8, not 6/);
  const plan=await analyzeCreationSystem(ruleset(),'creation',{attributes:{allocations:{str:4}},survival:{total:5}});
  assert.equal(plan.steps[0].errors.length,0);
});

test('Terms repeat a block of steps; a skipped step needs no answer; the continue Condition and the maximum end the series', async()=>{
  const {ruleset}=await build(),base={attributes:{allocations:{str:3,int:2}}};
  // Two terms survived with a skill each, then a failed survival: the third term has no skill to pick.
  let plan=await analyzeCreationSystem(ruleset(),'creation',{...base,survival:{terms:[{total:9},{total:8},{total:4}]},skill:{terms:[['pilot'],['gun']]}});
  assert.ok(plan.complete,JSON.stringify(plan.steps));
  assert.deepEqual(plan.operations.filter(op=>op.kind==='definition').map(op=>op.definitionId),['pilot','gun']);
  assert.equal(plan.steps.find(step=>step.id==='skill').skipped,true,'the last term skipped the skill');
  // After a failed survival no new term may start.
  let errors=await errorsOf(ruleset(),{...base,survival:{terms:[{total:3},{total:9}]},skill:{terms:[null,['gun']]}});
  assert.match(errors.survival,/Term 2 cannot start: the earlier term ended the series/);
  // At most three terms.
  errors=await errorsOf(ruleset(),{...base,survival:{terms:[{total:9},{total:9},{total:9},{total:9}]},skill:{terms:[['gun'],['gun'],['gun'],['gun']]}});
  assert.match(errors.skill,/Term 4 cannot start: at most 3 term/);
  // A term survived still needs its skill.
  errors=await errorsOf(ruleset(),{...base,survival:{terms:[{total:9}]},skill:{terms:[]}});
  assert.match(errors.skill,/Term 1: .*requires 1 to 1/);
});

test('A session rolls a roll step once, answers each term and starts the next one', async()=>{
  const {v,sessions,rolls}=await build();
  let session=await sessions.start(v,'creation');
  session=await sessions.answer(session.id,'attributes',{allocations:{str:3,int:2}});
  rolls.push(10);session=await sessions.draw(session.id,'survival');
  assert.deepEqual(session.answers.survival,{terms:[{total:10,result:'2d6',drawn:true}]});
  await assert.rejects(sessions.draw(session.id,'survival'),/already drawn/,'a roll step is thrown once');
  session=await sessions.answer(session.id,'skill',['pilot']);
  session=await sessions.nextTerm(session.id,'skill');
  assert.equal(session.currentStepId,'survival');assert.equal(session.currentTerm,1);
  rolls.push(5);session=await sessions.draw(session.id,'survival');
  const context=await sessions.context(session.id);
  assert.equal(context.complete,true,'the second term failed: no skill to choose');
  assert.deepEqual(session.answers.skill,{terms:[['pilot']]});
});

test('Saving checks the new step settings, and the editor writes them', ()=>{
  const system=steps=>prepareCreationSystem({id:'c',nameKey:'C',steps});
  assert.throws(()=>system([{id:'a',name:'A',kind:'choice',repeat:{steps:2}}]),/between 1 and 1/);
  assert.throws(()=>system([{id:'a',name:'A',repeat:{steps:1}},{id:'b',name:'B',repeat:{steps:2}}]),/overlap/);
  assert.throws(()=>system([{id:'a',name:'A',kind:'roll',draw:{}}]),/no draw settings/);
  assert.equal(system([{id:'a',name:'A',kind:'choice',rollRef:'x',costFormulaRef:'y'}]).steps[0].rollRef,undefined,'a choice keeps no Roll or cost');
  const input=(value)=>({value});
  const row=props=>({dataset:{original:'{}'},querySelector:selector=>{const key=selector.match(/data-step-prop="([^"]+)"/)?.[1];return key&&props[key]!==undefined?input(props[key]):null;},querySelectorAll:()=>[]});
  const [roll,skill]=collectCreationSteps([row({name:'Survival',kind:'roll',rollRef:'survival',min:'0',max:'1'}),row({name:'Skill',kind:'choice',min:'1',max:'1',conditionRef:'survived',repeatSteps:'2',repeatMax:'3',repeatContinueConditionRef:'survived'})],{uid:()=>'id'+Math.random()});
  assert.equal(roll.rollRef,'survival');assert.equal(roll.min,1);
  assert.deepEqual(skill.repeat,{steps:2,max:3,continueConditionRef:'survived'});assert.equal(skill.conditionRef,'survived');
});
