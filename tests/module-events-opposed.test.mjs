import test from 'node:test';
import assert from 'node:assert/strict';
import {createConfiguratorAPI} from '../src/configurator/configurator-api.mjs';
import {emptyStorageSnapshot} from '../src/configurator/configurator-storage.mjs';
import {MemoryRuntimeAdapter} from '../src/runtime/memory-runtime-adapter.mjs';
import {createRuntimeAPI} from '../src/runtime/runtime-api.mjs';
import {combatChangeEvents,timeElapsedPayload} from '../src/configurator/system-events.mjs';

class Storage{data=emptyStorageSnapshot();async load(){return structuredClone(this.data)}async save(next){this.data=structuredClone(next)}}
class Adapter extends MemoryRuntimeAdapter{rolls=[];async roll(formula){const total=this.rolls.shift()??10;return {formula,total,natural:total,result:String(total)};}}
const ref=(objectId,capabilityId,outputId,slotId)=>({objectKind:'definition',objectId,capabilityId,outputId,...(slotId?{slotId}:{})});
const value=id=>({type:'reference',reference:ref(id,'value','value.final')});
const payload=key=>({type:'context',path:`event.payload.${key}`});

async function system(){
  const api=await createConfiguratorAPI(new Storage());
  const v=(await api.createRuleset({id:'fight',nameKey:'Fight',version:'1.0.0'})).versionId;
  await api.registerDefinitionType(v,{id:'stat',key:'stat',nameKey:'Stat',allowedCapabilities:['value','pool'],defaultCapabilities:['value'],requiredCapabilities:[],fields:{}});
  await api.createDefinition(v,{id:'agility',key:'agility',nameKey:'Agility',definitionTypeId:'stat',capabilities:['value'],data:{}});
  await api.createDefinition(v,{id:'stamina',key:'stamina',nameKey:'Stamina',definitionTypeId:'stat',capabilities:['pool'],slots:{pool:[{id:'points',minimum:{literal:0},maximum:{literal:10}}]},data:{}});
  await api.createDefinition(v,{id:'vitality',key:'vitality',nameKey:'Vitality',definitionTypeId:'stat',capabilities:['pool'],slots:{pool:[{id:'points',minimum:{literal:0},maximum:{literal:10}}]},data:{}});
  // Every third round, each fighter loses 1 stamina; each day of rest gives back 1 vitality per day.
  await api.createCondition(v,{id:'third-round',nameKey:'Third round',expression:{type:'eq',left:{type:'mod',args:[payload('round'),{type:'literal',value:3}]},right:{type:'literal',value:0}}});
  await api.createFormula(v,{id:'days',nameKey:'Days',resultType:'number',expression:payload('days')});
  await api.createEffect(v,{id:'winded',nameKey:'Winded',targetRef:ref('stamina','pool','pool.current','points'),targetRole:'self',operation:'subtract',operand:{kind:'literal',value:1}});
  await api.createEffect(v,{id:'heal',nameKey:'Heal',targetRef:ref('vitality','pool','pool.current','points'),targetRole:'self',operation:'add',operand:{kind:'formula',id:'days'}});
  await api.createAction(v,{id:'tire',nameKey:'Tire',effectRefs:['winded']});
  await api.createAction(v,{id:'rest',nameKey:'Rest',effectRefs:['heal']});
  await api.createTrigger(v,{id:'every-third-round',nameKey:'Every third round',eventTypeId:'rta.combat.round',conditionRefs:['third-round'],actionRefs:['tire']});
  await api.createTrigger(v,{id:'daily',nameKey:'Daily',eventTypeId:'rta.time.elapsed',actionRefs:['rest']});
  // Opposed: an attack against the target's dodge.
  await api.createRoll(v,{id:'d20',nameKey:'d20',formula:'1d20'});
  await api.createFormula(v,{id:'agility-bonus',nameKey:'Agility bonus',resultType:'number',expression:value('agility')});
  await api.createTest(v,{id:'dodge',nameKey:'Dodge',rollRef:'d20',bonusFormulaRef:'agility-bonus'});
  await api.createTest(v,{id:'attack',nameKey:'Attack',rollRef:'d20',bonusFormulaRef:'agility-bonus',opposedTestRef:'dodge'});
  await api.publishRuleset(v);
  const adapter=new Adapter(),runtime=createRuntimeAPI(api,{adapter,hooks:null});
  for(const id of ['Actor.a','Actor.b'])await runtime.initializeContainer(v,id);
  const pool=async(id,def)=>(await runtime.getContainerState(id)).definitionStates[def].capabilityStates.pool.points.current;
  return {api,v,runtime,adapter,pool};
}

test('Combat tracker changes become start, round and turn events', ()=>{
  const combat={id:'c1',combatants:[{id:'x',actor:{uuid:'Actor.a'}},{id:'y',actor:{uuid:'Actor.b'}}]};
  assert.deepEqual(combatChangeEvents(combat,{round:0,turn:null},{round:1,turn:0,combatantId:'x'}).map(e=>[e.eventTypeId,e.refs]),
    [['rta.combat.start',['Actor.a','Actor.b']],['rta.combat.round',['Actor.a','Actor.b']],['rta.combat.turn',['Actor.a']]]);
  assert.deepEqual(combatChangeEvents(combat,{round:1,turn:0},{round:1,turn:1,combatantId:'y'}).map(e=>e.eventTypeId),['rta.combat.turn']);
  assert.deepEqual(timeElapsedPayload(86400*2+10,20),{seconds:20,days:1,worldTime:172810});
  assert.equal(timeElapsedPayload(100,-5),null);
});

test('Triggers react to combat rounds and to elapsed time', async()=>{
  const {runtime,pool}=await system();
  for(const round of [1,2,3])await runtime.emitSystemEvent('rta.combat.round',{combatId:'c1',round},['Actor.a','Actor.b']);
  assert.equal(await pool('Actor.a','stamina'),9);assert.equal(await pool('Actor.b','stamina'),9);
  await runtime.setDefinitionState((await runtime.getContainerState('Actor.a')).rulesetVersionId,'Actor.a','vitality',{pools:{points:4}});
  await runtime.emitSystemEvent('rta.time.elapsed',timeElapsedPayload(86400*3,86400*2),['Actor.a','Actor.unknown']);
  assert.equal(await pool('Actor.a','vitality'),6);
  await assert.rejects(runtime.emitSystemEvent('combat',{},[]),/Not a module event/);
});

test('An opposed Test takes the target\'s total on the other Test as its target', async()=>{
  const {v,runtime,adapter}=await system();
  await runtime.setDefinitionState(v,'Actor.a','agility',{base:3});
  await runtime.setDefinitionState(v,'Actor.b','agility',{base:5});
  adapter.rolls=[12,9];
  const result=await runtime.executeTest(v,'attack',{roles:{self:'Actor.a',target:'Actor.b'}});
  assert.equal(result.total,15);assert.equal(result.target,14);assert.equal(result.margin,1);
  assert.equal(result.opposed.testId,'dodge');
  await assert.rejects(runtime.executeTest(v,'attack',{roles:{self:'Actor.a'}}),/needs a target/);
});

test('An opposed Test refuses a fixed target and its own id; Rulesets cannot use module event ids', async()=>{
  const api=await createConfiguratorAPI(new Storage());
  const v=(await api.createRuleset({id:'bad',nameKey:'Bad',version:'1.0.0'})).versionId;
  await api.createRoll(v,{id:'d20',nameKey:'d20',formula:'1d20'});
  await assert.rejects(api.createTest(v,{id:'t',nameKey:'T',rollRef:'d20',opposedTestRef:'t'}),/oppose itself/);
  await api.createTest(v,{id:'u',nameKey:'U',rollRef:'d20'});
  await assert.rejects(api.createTest(v,{id:'t',nameKey:'T',rollRef:'d20',opposedTestRef:'u',targetValue:10}),/opposed Test only/);
  await assert.rejects(api.createEventType(v,{id:'rta.combat.start',nameKey:'Start'}),/kept for the module/);
});
