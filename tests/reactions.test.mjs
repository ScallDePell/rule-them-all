import test from 'node:test';
import assert from 'node:assert/strict';
import {createConfiguratorAPI} from '../src/configurator/configurator-api.mjs';
import {emptyStorageSnapshot} from '../src/configurator/configurator-storage.mjs';
import {MemoryRuntimeAdapter} from '../src/runtime/memory-runtime-adapter.mjs';
import {RuntimeEngine} from '../src/runtime/runtime-engine.mjs';
class Storage{value=emptyStorageSnapshot();async load(){return structuredClone(this.value)}async save(v){this.value=structuredClone(v)}}
class Adapter extends MemoryRuntimeAdapter{queue=[];rolled=[];async roll(formula){const n=this.queue.shift()??10;this.rolled.push(formula);return {formula,total:n,natural:n,result:String(n)};}}
class Hooks{calls=[];callAll(name,...args){this.calls.push([name,...args]);}}
const ref=(objectId,capabilityId,outputId,slotId)=>({objectKind:'definition',objectId,capabilityId,outputId,...(slotId?{slotId}:{})});
const fighter={kind:'actor',id:'fighter'},wizard={kind:'actor',id:'wizard'},context={roles:{self:fighter,target:wizard},defaultRole:'self'};
const pool=id=>ref(id,'pool','pool.current','points'),value=id=>ref(id,'value','value.final');

// D&D-like: an attack hits when d20 + 5 reaches the target's AC. The wizard may cast Shield as a reaction
// (+5 AC, one slot), which replays the same attack roll; a thorny hide hurts any attacker that hits, automatically.
async function setup(){
  const api=await createConfiguratorAPI(new Storage());
  const v=(await api.createRuleset({id:'react',nameKey:'React',version:'1'})).versionId;
  await api.registerDefinitionType(v,{id:'trait',key:'trait',nameKey:'Trait',allowedCapabilities:['pool','value','state'],defaultCapabilities:['value'],requiredCapabilities:[],fields:{}});
  await api.createDefinition(v,{id:'hp',key:'hp',definitionTypeId:'trait',nameKey:'HP',data:{},capabilities:['pool'],slots:{pool:[{id:'points',minimum:{literal:0},maximum:{literal:20}}]}});
  await api.createDefinition(v,{id:'slots',key:'slots',definitionTypeId:'trait',nameKey:'Slots',data:{},capabilities:['pool'],slots:{pool:[{id:'points',minimum:{literal:0},maximum:{literal:2}}]}});
  await api.createDefinition(v,{id:'ac',key:'ac',definitionTypeId:'trait',nameKey:'AC',data:{},capabilities:['value']});
  await api.createDefinition(v,{id:'thorns',key:'thorns',definitionTypeId:'trait',nameKey:'Thorns',data:{},capabilities:['value']});
  await api.createModifier(v,{id:'shielded',nameKey:'Shielded',targetRef:value('ac'),operation:'add',valueSource:{kind:'literal',value:5},stacking:{mode:'highest',group:'shield'}});
  await api.createRoll(v,{id:'d20',nameKey:'d20',formula:'1d20'});
  await api.createFormula(v,{id:'proficiency',nameKey:'Proficiency',resultType:'number',expression:{type:'literal',value:5}});
  await api.createFormula(v,{id:'target-ac',nameKey:'Target AC',resultType:'number',expression:{type:'reference',container:'target',reference:value('ac')}});
  await api.createCondition(v,{id:'reaches',nameKey:'Reaches AC',expression:{type:'gte',left:{type:'context',path:'variables.test.total'},right:{type:'context',path:'variables.test.target'}}});
  await api.createCondition(v,{id:'has-slot',nameKey:'Has a slot',expression:{type:'gt',left:{type:'reference',reference:pool('slots')},right:{type:'literal',value:0}}});
  await api.createCondition(v,{id:'thorny',nameKey:'Thorny',expression:{type:'gt',left:{type:'reference',reference:value('thorns')},right:{type:'literal',value:0}}});
  await api.createOutcome(v,{id:'hit',nameKey:'Hit',resultKey:'hit',conditionRef:'reaches'});
  await api.createOutcome(v,{id:'miss',nameKey:'Miss',resultKey:'miss'});
  await api.createTest(v,{id:'attack',nameKey:'Attack',rollRef:'d20',bonusFormulaRef:'proficiency',targetFormulaRef:'target-ac',outcomeRefs:['hit'],fallbackOutcomeRef:'miss'});
  await api.createEffect(v,{id:'slash',nameKey:'Slash',targetRef:pool('hp'),targetRole:'target',operation:'subtract',operand:{kind:'literal',value:6}});
  await api.createEffect(v,{id:'prick',nameKey:'Prick',targetRef:pool('hp'),targetRole:'target',operation:'subtract',operand:{kind:'literal',value:2}});
  await api.createEffect(v,{id:'spend-slot',nameKey:'Spend a slot',targetRef:pool('slots'),targetRole:'self',operation:'subtract',operand:{kind:'literal',value:1}});
  await api.createEventType(v,{id:'hit-by',nameKey:'Hit by an attack',payloadFields:{}});
  await api.createAction(v,{id:'sword',nameKey:'Sword',testRef:'attack',effectRefs:['slash'],outcomeMappings:[{outcomeId:'miss',effectRefs:[]}],eventTypeRefs:['hit-by']});
  await api.createAction(v,{id:'shield',nameKey:'Shield',conditionRefs:['has-slot'],costEffectRefs:['spend-slot'],modifierApplications:[{modifierRef:'shielded',targetRole:'self'}],reroll:{actionRefs:['sword'],keepDice:true}});
  await api.createAction(v,{id:'thorns',nameKey:'Thorns',effectRefs:['prick']});
  await api.createTrigger(v,{id:'offer-shield',nameKey:'Shield?',eventTypeId:'hit-by',eventFilter:{payloadMatches:{outcomeKey:'hit'}},actionRefs:['shield'],actingRole:'target',mode:'offer'});
  await api.createTrigger(v,{id:'thorny-hide',nameKey:'Thorny hide',eventTypeId:'hit-by',eventFilter:{payloadMatches:{outcomeKey:'hit'}},conditionRefs:['thorny'],actionRefs:['thorns'],actingRole:'target'});
  await api.publishRuleset(v);
  const adapter=new Adapter(),hooks=new Hooks(),engine=new RuntimeEngine({configurator:api,adapter,hooks});
  for(const actor of [fighter,wizard])await engine.initializeContainer(v,actor,{});
  await engine.setDefinitionState(v,wizard,'ac',{base:12});
  return {api,v,engine,adapter,hooks};
}
const hp=(engine,v,actor)=>engine.resolveReference(v,{container:'target',reference:pool('hp')},{roles:{target:actor}});

test('A reaction runs as the target: the thorny hide pricks the attacker who hit', async()=>{
  const {v,engine,adapter}=await setup();
  await engine.setDefinitionState(v,wizard,'thorns',{base:1});
  adapter.queue=[10];
  await engine.executeAction(v,'sword',context);
  assert.equal(await hp(engine,v,wizard),14);assert.equal(await hp(engine,v,fighter),18,'the fighter is the target of Thorns');
});

test('An offered reaction is not run: the hook carries the Actions, the reacting Actor and the use it answers', async()=>{
  const {v,engine,adapter,hooks}=await setup();
  adapter.queue=[10];
  const result=await engine.executeAction(v,'sword',context);
  const [, offer]=hooks.calls.find(([name])=>name==='ruleThemAllReactionOffered');
  assert.deepEqual(offer.actionIds,['shield']);assert.deepEqual(offer.actor,wizard);
  assert.equal(offer.cause.transactionId,result.transactionId);
  assert.equal(result.events[0].triggered.find(t=>t.triggerId==='offer-shield').actions.length,0);
  assert.equal(await hp(engine,v,wizard),14);
});

test('Accepting the offer: Shield raises the AC and replays the attack with the same die, which now misses', async()=>{
  const {v,engine,adapter,hooks}=await setup();
  adapter.queue=[10];
  await engine.executeAction(v,'sword',context);
  const [, offer]=hooks.calls.find(([name])=>name==='ruleThemAllReactionOffered');
  adapter.queue=[1];// a new die would miss anyway: the replay must not throw it
  const result=await engine.rerollAction(v,'shield',offer.cause,offer.context);
  assert.equal(result.testResult.roll.total,10,'same d20');assert.equal(result.testResult.target,17);
  assert.equal(result.testResult.outcome.resultKey,'miss');
  assert.equal(await hp(engine,v,wizard),20);
  assert.equal(await engine.resolveReference(v,{container:'target',reference:pool('slots')},{roles:{target:wizard}}),1);
  assert.equal(adapter.queue.length,1,'no die thrown');
});

test('Saving checks the reaction fields', async()=>{
  const {api,v}=await setup();
  await assert.rejects(api.updateTrigger(v,'offer-shield',{actingRole:'gm'}),/actingRole/);
  await assert.rejects(api.updateTrigger(v,'offer-shield',{mode:'later'}),/mode/);
  await assert.rejects(api.updateAction(v,'shield',{reroll:{actionRefs:[],keepDice:'yes'}}),/keepDice/);
});
