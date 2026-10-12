import test from 'node:test';
import assert from 'node:assert/strict';
import {createConfiguratorAPI} from '../src/configurator/configurator-api.mjs';
import {emptyStorageSnapshot} from '../src/configurator/configurator-storage.mjs';
import {MemoryRuntimeAdapter} from '../src/runtime/memory-runtime-adapter.mjs';
import {RuntimeEngine} from '../src/runtime/runtime-engine.mjs';
class Storage{value=emptyStorageSnapshot();async load(){return structuredClone(this.value)}async save(v){this.value=structuredClone(v)}}
// The dice show whatever the test queues; a d100 Test reads the first, the Table the next.
class Adapter extends MemoryRuntimeAdapter{queue=[];async roll(formula){const n=this.queue.shift()??50;return {formula,total:n,natural:n,result:String(n)};}}
const ref=(objectId,capabilityId,outputId,slotId)=>({objectKind:'definition',objectId,capabilityId,outputId,...(slotId?{slotId}:{})});
const hero={kind:'actor',id:'hero'},foe={kind:'actor',id:'foe'},context={roles:{self:hero,target:foe},defaultRole:'self'};
const wounds=(engine,v,actor)=>engine.resolveReference(v,{container:actor===hero?'self':'target',reference:ref('wounds','pool','pool.current','points')},context);

async function setup(){
  const api=await createConfiguratorAPI(new Storage());
  const v=(await api.createRuleset({id:'crit',nameKey:'Crit',version:'1'})).versionId;
  await api.registerDefinitionType(v,{id:'trait',key:'trait',nameKey:'Trait',allowedCapabilities:['pool','value'],defaultCapabilities:['pool'],requiredCapabilities:[],fields:{}});
  await api.createDefinition(v,{id:'wounds',key:'wounds',definitionTypeId:'trait',nameKey:'Wounds',data:{},capabilities:['pool'],slots:{pool:[{id:'points',minimum:{literal:0},maximum:{literal:20}}]}});
  await api.createDefinition(v,{id:'luck',key:'luck',definitionTypeId:'trait',nameKey:'Luck',data:{},capabilities:['value']});
  await api.createRoll(v,{id:'d100',nameKey:'d100',formula:'1d100'});
  await api.createFormula(v,{id:'luck',nameKey:'Luck',resultType:'number',expression:{type:'reference',reference:ref('luck','value','value.final')}});
  await api.createCondition(v,{id:'under',nameKey:'Under',expression:{type:'lte',left:{type:'context',path:'variables.test.total'},right:{type:'context',path:'variables.test.target'}}});
  await api.createCondition(v,{id:'never',nameKey:'Never',expression:{type:'literal',value:false}});
  await api.createOutcome(v,{id:'hit',nameKey:'Hit',resultKey:'hit',conditionRef:'under'});
  await api.createOutcome(v,{id:'miss',nameKey:'Miss',resultKey:'miss'});
  await api.createTest(v,{id:'attack',nameKey:'Attack',rollRef:'d100',targetValue:50,outcomeRefs:['hit'],fallbackOutcomeRef:'miss'});
  const hurt=(id,role,n)=>api.createEffect(v,{id,nameKey:id,targetRef:ref('wounds','pool','pool.current','points'),targetRole:role,operation:'subtract',operand:{kind:'literal',value:n}});
  await hurt('graze','target',1);await hurt('maim','target',5);await hurt('fumble','self',2);
  await api.createAction(v,{id:'maim',nameKey:'Maim',effectRefs:['maim']});
  await api.createAction(v,{id:'graze',nameKey:'Graze',effectRefs:['graze']});
  await api.createAction(v,{id:'blocked',nameKey:'Blocked',conditionRefs:['never'],effectRefs:['maim']});
  await api.createAction(v,{id:'fumble',nameKey:'Fumble',effectRefs:['fumble']});
  await api.createTable(v,{id:'crits',nameKey:'Critical hits',rollRef:'d100',bonusFormulaRef:'luck',rows:[{id:'low',labelKey:'Scratch',min:null,max:50,actionRefs:['graze']},{id:'high',labelKey:'Severed',min:51,max:null,actionRefs:['maim','blocked']}]});
  await api.createAction(v,{id:'strike',nameKey:'Strike',testRef:'attack',effectRefs:['graze'],tableRef:'crits',outcomeMappings:[{outcomeId:'miss',effectRefs:[],actionRefs:['fumble']}]});
  await api.publishRuleset(v);
  const adapter=new Adapter(),engine=new RuntimeEngine({configurator:api,adapter,hooks:null});
  for(const actor of [hero,foe])await engine.initializeContainer(v,actor,{});
  return {api,v,engine,adapter};
}

test('A Table row is found from the roll plus its bonus, open ends included', async()=>{
  const {v,engine,adapter}=await setup();
  adapter.queue=[3];assert.equal((await engine.rollTable(v,'crits',context)).row.id,'low');
  adapter.queue=[51];assert.equal((await engine.rollTable(v,'crits',context)).row.id,'high');
  await engine.setDefinitionState(v,hero,'luck',{base:10});
  adapter.queue=[45];const result=await engine.rollTable(v,'crits',context);
  assert.equal(result.total,55);assert.equal(result.row.id,'high');assert.equal(result.roll.bonus,10);
});

test('An Action rolls its Table after its Effects and runs the row Actions in the same transaction; a refused follow-up changes nothing', async()=>{
  const {v,engine,adapter}=await setup();
  adapter.queue=[10,80];
  const result=await engine.executeAction(v,'strike',context);
  assert.equal(result.testResult.outcome.resultKey,'hit');assert.equal(result.tableResult.row.id,'high');
  assert.deepEqual(result.followUps.map(f=>[f.actionId,f.allowed]),[['maim',true],['blocked',false]]);
  assert.equal(await wounds(engine,v,foe),14,'graze 1 + maim 5, blocked adds nothing');
  assert.equal(result.ledgerEntryIds.length>0,true);
});

test('An Outcome can run other Actions, here on a miss', async()=>{
  const {v,engine,adapter}=await setup();
  adapter.queue=[90,10];
  const result=await engine.executeAction(v,'strike',context);
  assert.equal(result.testResult.outcome.resultKey,'miss');
  assert.deepEqual(result.followUps.map(f=>f.actionId),['fumble','graze']);
  assert.equal(await wounds(engine,v,hero),18);assert.equal(await wounds(engine,v,foe),19,'the table still rolls: the low row grazes');
});

test('Saving checks Table rows and references', async()=>{
  const {api,v}=await setup();
  await assert.rejects(api.createTable(v,{id:'overlap',nameKey:'O',rollRef:'d100',rows:[{id:'a',min:1,max:10},{id:'b',min:10,max:20}]}),/overlap/);
  await assert.rejects(api.createTable(v,{id:'lost',nameKey:'L',rollRef:'d100',rows:[{id:'a',min:1,max:10,actionRefs:['missing']}]}),/action\/missing/);
  await assert.rejects(api.createAction(v,{id:'loop',nameKey:'L',outcomeMappings:[{outcomeId:'hit',actionRefs:['nowhere']}]}),/action\/nowhere/);
});
