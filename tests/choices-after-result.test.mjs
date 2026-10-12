import test from 'node:test';
import assert from 'node:assert/strict';
import {createConfiguratorAPI} from '../src/configurator/configurator-api.mjs';
import {emptyStorageSnapshot} from '../src/configurator/configurator-storage.mjs';
import {MemoryRuntimeAdapter} from '../src/runtime/memory-runtime-adapter.mjs';
import {RuntimeEngine} from '../src/runtime/runtime-engine.mjs';
import {collectOutcomeMappings} from '../src/configurator/action-outcome-form.mjs';
class Storage{value=emptyStorageSnapshot();async load(){return structuredClone(this.value)}async save(v){this.value=structuredClone(v)}}
class Adapter extends MemoryRuntimeAdapter{queue=[];async roll(formula){const n=this.queue.shift();return {formula,total:n,natural:n,result:String(n)};}}
const ref=id=>({objectKind:'definition',objectId:id,capabilityId:'pool',outputId:'pool.current',slotId:'points'});
const hero={kind:'actor',id:'hero'},foe={kind:'actor',id:'foe'},context={roles:{self:hero,target:foe},defaultRole:'self'};
const lit=value=>({type:'literal',value}),total={type:'context',path:'variables.test.total'};

async function setup(){
  const api=await createConfiguratorAPI(new Storage());
  const v=(await api.createRuleset({id:'moves',nameKey:'Moves',version:'1'})).versionId;
  await api.registerDefinitionType(v,{id:'track',key:'track',nameKey:'Track',allowedCapabilities:['pool'],defaultCapabilities:['pool'],requiredCapabilities:[],fields:{}});
  for(const id of ['harm','hold'])await api.createDefinition(v,{id,key:id,definitionTypeId:'track',nameKey:id,data:{},capabilities:['pool'],slots:{pool:[{id:'points',minimum:{literal:0},maximum:{literal:10},initial:{literal:id==='harm'?10:0}}]}});
  await api.createRoll(v,{id:'2d6',nameKey:'2d6',formula:'2d6'});
  await api.createCondition(v,{id:'strong',nameKey:'10+',expression:{type:'gte',left:total,right:lit(10)}});
  await api.createCondition(v,{id:'weak',nameKey:'7-9',expression:{type:'gte',left:total,right:lit(7)}});
  await api.createOutcome(v,{id:'strong',nameKey:'Strong hit',resultKey:'strong',conditionRef:'strong'});
  await api.createOutcome(v,{id:'weak',nameKey:'Weak hit',resultKey:'weak',conditionRef:'weak'});
  await api.createOutcome(v,{id:'miss',nameKey:'Miss',resultKey:'miss'});
  await api.createTest(v,{id:'move',nameKey:'Move',rollRef:'2d6',outcomeRefs:['strong','weak'],fallbackOutcomeRef:'miss'});
  // The damage chosen reads the roll it follows.
  await api.createFormula(v,{id:'total',nameKey:'Total',resultType:'number',expression:{type:'subtract',args:[total,lit(6)]}});
  await api.createEffect(v,{id:'hurt',nameKey:'Hurt',targetRef:ref('harm'),targetRole:'target',operation:'subtract',operand:{kind:'formula',id:'total'}});
  await api.createEffect(v,{id:'hold',nameKey:'Hold',targetRef:ref('hold'),targetRole:'self',operation:'add',operand:{kind:'literal',value:1}});
  await api.createEffect(v,{id:'exposed',nameKey:'Exposed',targetRef:ref('harm'),targetRole:'self',operation:'subtract',operand:{kind:'literal',value:1}});
  for(const [id,effect] of [['deal','hurt'],['hold','hold'],['exposed','exposed']])await api.createAction(v,{id,nameKey:id,effectRefs:[effect]});
  await api.createAction(v,{id:'act',nameKey:'Act under fire',testRef:'move',outcomeMappings:[{outcomeId:'strong',choice:{count:2,actionRefs:['deal','hold']}},{outcomeId:'weak',actionRefs:['exposed'],choice:{count:1,actionRefs:['deal','hold']}}]});
  await api.publishRuleset(v);
  const offers=[],adapter=new Adapter(),engine=new RuntimeEngine({configurator:api,adapter,hooks:{callAll:(hook,payload)=>{if(hook==='ruleThemAllChoiceOffered')offers.push(payload);}}});
  for(const actor of [hero,foe])await engine.initializeContainer(v,actor,{});
  return {api,v,engine,adapter,offers};
}
const read=(engine,v,actor,id)=>engine.resolveReference(v,{container:actor,reference:ref(id)},{});

test('On a 7-9 the player chooses one option once the roll is known; the chosen Action reads that roll', async()=>{
  const {v,engine,adapter,offers}=await setup();
  adapter.queue=[8];
  const used=await engine.executeAction(v,'act',context);
  assert.equal(await read(engine,v,hero,'harm'),9,'the weak hit cost is paid at once');
  assert.deepEqual(used.choices.map(c=>[c.count,c.actionIds]),[[1,['deal','hold']]]);assert.equal(offers.length,1);
  await engine.chooseActions(v,used.choices[0],['deal']);
  assert.equal(await read(engine,v,foe,'harm'),8,'8 - 6 = 2 harm');
  await assert.rejects(engine.chooseActions(v,used.choices[0],['deal','hold']),/Choose 1/);
  await assert.rejects(engine.chooseActions(v,{...used.choices[0],actionIds:['exposed']},['exposed']),/not one of the choices/);
});

test('On a 10+ two distinct options; a miss offers nothing', async()=>{
  const {v,engine,adapter}=await setup();
  adapter.queue=[11];
  const used=await engine.executeAction(v,'act',context);
  await assert.rejects(engine.chooseActions(v,used.choices[0],['hold','hold']),/once/);
  await engine.chooseActions(v,used.choices[0],['hold','deal']);
  assert.equal(await read(engine,v,hero,'hold'),1);assert.equal(await read(engine,v,foe,'harm'),5);
  adapter.queue=[4];
  assert.deepEqual((await engine.executeAction(v,'act',context)).choices,[]);
});

test('Saving checks a choice, and the editor reads it back', async()=>{
  const {api,v}=await setup();
  await assert.rejects(api.createAction(v,{id:'x',nameKey:'X',testRef:'move',outcomeMappings:[{outcomeId:'weak',choice:{count:3,actionRefs:['deal']}}]}),/count must be/);
  await assert.rejects(api.createAction(v,{id:'y',nameKey:'Y',testRef:'move',outcomeMappings:[{outcomeId:'weak',choice:{count:1,actionRefs:['nowhere']}}]}),/action\/nowhere/);
  const input=(attrs)=>({...attrs});
  const row={dataset:{outcomeMapping:'weak'},querySelector:selector=>selector==='[data-mapping-mode]'?{value:'default'}:selector==='[data-mapping-choice-count]'?{value:'2'}:null,
    querySelectorAll:selector=>selector==='[data-mapping-choice]:checked'?[input({value:'deal'}),input({value:'hold'})]:[]};
  assert.deepEqual(collectOutcomeMappings([row]),[{outcomeId:'weak',choice:{count:2,actionRefs:['deal','hold']}}]);
});
