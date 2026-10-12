import test from 'node:test';
import assert from 'node:assert/strict';
import {createConfiguratorAPI} from '../src/configurator/configurator-api.mjs';
import {emptyStorageSnapshot} from '../src/configurator/configurator-storage.mjs';
import {MemoryRuntimeAdapter} from '../src/runtime/memory-runtime-adapter.mjs';
import {RuntimeEngine} from '../src/runtime/runtime-engine.mjs';
class Storage{value=emptyStorageSnapshot();async load(){return structuredClone(this.value)}async save(v){this.value=structuredClone(v)}}
class Adapter extends MemoryRuntimeAdapter{queue=[];async roll(formula){const n=this.queue.shift();return {formula,total:n,natural:n,result:String(n)};}}
const pool=id=>({objectKind:'definition',objectId:id,capabilityId:'pool',outputId:'pool.current',slotId:'points'});
const lead={kind:'actor',id:'lead'},a={kind:'actor',id:'a'},b={kind:'actor',id:'b'},ship={kind:'actor',id:'ship'},foe={kind:'actor',id:'foe'};
const ctx=path=>({type:'context',path}),lit=value=>({type:'literal',value});

async function setup(){
  const api=await createConfiguratorAPI(new Storage());
  const v=(await api.createRuleset({id:'crew',nameKey:'Crew',version:'1'})).versionId;
  await api.registerDefinitionType(v,{id:'trait',key:'trait',nameKey:'Trait',allowedCapabilities:['pool','collection'],defaultCapabilities:[],requiredCapabilities:[],fields:{}});
  await api.createContentType(v,{id:'being',nameKey:'Being',storageKind:'actor'});
  for(const id of ['stress','hull'])await api.createDefinition(v,{id,key:id,definitionTypeId:'trait',nameKey:id,data:{},capabilities:['pool'],slots:{pool:[{id:'points',minimum:{literal:0},maximum:{literal:10},initial:{literal:id==='hull'?10:0}}]}});
  await api.createDefinition(v,{id:'crew',key:'crew',definitionTypeId:'trait',nameKey:'Crew',data:{},capabilities:['collection'],slots:{collection:[{id:'members',entryMode:'reference',allowedKinds:['being']}]}});
  await api.createDefinition(v,{id:'vessel',key:'vessel',definitionTypeId:'trait',nameKey:'Vessel',data:{},capabilities:['collection'],slots:{collection:[{id:'members',entryMode:'reference',allowedKinds:['being']}]}});
  await api.createRoll(v,{id:'d6',nameKey:'d6',formula:'1d6'});
  await api.createCondition(v,{id:'six-ish',nameKey:'4+',expression:{type:'gte',left:ctx('variables.test.total'),right:lit(4)}});
  await api.createOutcome(v,{id:'success',nameKey:'Success',resultKey:'success',conditionRef:'six-ish'});
  await api.createOutcome(v,{id:'failure',nameKey:'Failure',resultKey:'failure'});
  await api.createTest(v,{id:'roll',nameKey:'Roll',rollRef:'d6',outcomeRefs:['success'],fallbackOutcomeRef:'failure'});
  // The leader takes 1 stress per member who failed.
  await api.createFormula(v,{id:'failures',nameKey:'Failures',resultType:'number',expression:{type:'if',condition:{type:'gt',left:ctx('variables.group.outcomes.failure'),right:lit(0)},then:ctx('variables.group.outcomes.failure'),else:lit(0)}});
  await api.createEffect(v,{id:'stress',nameKey:'Stress',targetRef:pool('stress'),targetRole:'self',operation:'add',operand:{kind:'formula',id:'failures'}});
  await api.createFormula(v,{id:'best',nameKey:'Best',resultType:'number',expression:ctx('variables.group.best')});
  await api.createEffect(v,{id:'ram',nameKey:'Ram',targetRef:pool('hull'),targetRole:'target',operation:'subtract',operand:{kind:'formula',id:'best'}});
  await api.createEffect(v,{id:'strain',nameKey:'Strain',targetRef:pool('hull'),targetRole:'vehicle',operation:'subtract',operand:{kind:'literal',value:1}});
  await api.createAction(v,{id:'group-action',nameKey:'Group action',group:{testRef:'roll'},effectRefs:['stress','ram']});
  await api.createAction(v,{id:'crew-action',nameKey:'Crew action',group:{testRef:'roll',includeSelf:false,helpersFrom:{definitionId:'crew',slotId:'members'}},effectRefs:['ram']});
  await api.createAction(v,{id:'push-engine',nameKey:'Push the engine',roleLinks:[{role:'vehicle',definitionId:'vessel',slotId:'members'}],effectRefs:['strain']});
  await api.publishRuleset(v);
  const adapter=new Adapter(),engine=new RuntimeEngine({configurator:api,adapter,hooks:null});
  for(const actor of [lead,a,b,ship,foe])await engine.initializeContainer(v,actor,{});
  await engine.addCollectionEntry(v,ship,'crew','members',{kind:'being',entityRef:a});
  await engine.addCollectionEntry(v,ship,'crew','members',{kind:'being',entityRef:b});
  await engine.addCollectionEntry(v,lead,'vessel','members',{kind:'being',entityRef:ship});
  return {api,v,engine,adapter};
}
const read=(engine,v,actor,id)=>engine.resolveReference(v,{container:actor,reference:pool(id)},{});

test('A group action rolls for each member; the best counts and the leader pays for each failure', async()=>{
  const {v,engine,adapter}=await setup();
  adapter.queue=[2,5,1];
  const used=await engine.executeAction(v,'group-action',{roles:{self:lead,target:foe},helpers:[a,b]});
  assert.equal(await read(engine,v,foe,'hull'),5,'the best roll, 5');
  assert.equal(await read(engine,v,lead,'stress'),2,'two members failed');
  assert.equal(used.allowed,true);
});

test('The members can come from a collection of the acting Actor, and a role from a linked Actor', async()=>{
  const {v,engine,adapter}=await setup();
  adapter.queue=[3,6];
  await engine.executeAction(v,'crew-action',{roles:{self:ship,target:foe}});
  assert.equal(await read(engine,v,foe,'hull'),4);
  await engine.executeAction(v,'push-engine',{roles:{self:lead}});
  assert.equal(await read(engine,v,ship,'hull'),9,'the pilot strains the ship it crews');
  assert.deepEqual(await engine.needsGM('executeAction',[v,'push-engine',{roles:{self:lead}}]),false);
});

test('Saving checks group actions and role links', async()=>{
  const {api,v}=await setup();
  await assert.rejects(api.createAction(v,{id:'x',nameKey:'X',group:{testRef:'nowhere'}}),/test\/nowhere/);
  await assert.rejects(api.createAction(v,{id:'y',nameKey:'Y',roleLinks:[{role:'vehicle',definitionId:'vessel'}]}),/slotId is required/);
});
