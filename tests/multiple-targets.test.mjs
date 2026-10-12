import test from 'node:test';
import assert from 'node:assert/strict';
import {createConfiguratorAPI} from '../src/configurator/configurator-api.mjs';
import {emptyStorageSnapshot} from '../src/configurator/configurator-storage.mjs';
import {MemoryRuntimeAdapter} from '../src/runtime/memory-runtime-adapter.mjs';
import {RuntimeEngine} from '../src/runtime/runtime-engine.mjs';
class Storage{value=emptyStorageSnapshot();async load(){return structuredClone(this.value)}async save(v){this.value=structuredClone(v)}}
// Dice come from a queue; each throw is recorded.
class Adapter extends MemoryRuntimeAdapter{queue=[];rolled=[];async roll(formula){const n=this.queue.shift()??5;this.rolled.push(formula);return {formula,total:n,natural:n,result:String(n)};}}
const ref=(objectId,capabilityId,outputId,slotId)=>({objectKind:'definition',objectId,capabilityId,outputId,...(slotId?{slotId}:{})});
const mage={kind:'actor',id:'mage'},orc={kind:'actor',id:'orc'},goblin={kind:'actor',id:'goblin'};
const context={roles:{self:mage},targets:[orc,goblin],defaultRole:'self'};
const pool=id=>ref(id,'pool','pool.current','points');

async function setup(targeting){
  const api=await createConfiguratorAPI(new Storage());
  const v=(await api.createRuleset({id:'area',nameKey:'Area',version:'1'})).versionId;
  await api.registerDefinitionType(v,{id:'trait',key:'trait',nameKey:'Trait',allowedCapabilities:['pool','value'],defaultCapabilities:['pool'],requiredCapabilities:[],fields:{}});
  await api.createDefinition(v,{id:'hp',key:'hp',definitionTypeId:'trait',nameKey:'HP',data:{},capabilities:['pool'],slots:{pool:[{id:'points',minimum:{literal:0},maximum:{literal:30}}]}});
  await api.createDefinition(v,{id:'mana',key:'mana',definitionTypeId:'trait',nameKey:'Mana',data:{},capabilities:['pool'],slots:{pool:[{id:'points',minimum:{literal:0},maximum:{literal:10}}]}});
  await api.createDefinition(v,{id:'dex',key:'dex',definitionTypeId:'trait',nameKey:'Dex',data:{},capabilities:['value']});
  await api.createRoll(v,{id:'d20',nameKey:'d20',formula:'1d20'});
  await api.createRoll(v,{id:'fire',nameKey:'8d6',formula:'8d6'});
  await api.createFormula(v,{id:'save-bonus',nameKey:'Save bonus',resultType:'number',expression:{type:'reference',reference:ref('dex','value','value.final')}});
  await api.createFormula(v,{id:'half-on-save',nameKey:'Half',resultType:'number',expression:{type:'if',condition:{type:'eq',left:{type:'context',path:'variables.test.outcome.resultKey'},right:{type:'literal',value:'saved'}},then:{type:'literal',value:0.5},else:{type:'literal',value:1}}});
  await api.createCondition(v,{id:'beats-dc',nameKey:'Beats DC',expression:{type:'gte',left:{type:'context',path:'variables.test.total'},right:{type:'context',path:'variables.test.target'}}});
  await api.createOutcome(v,{id:'saved',nameKey:'Saved',resultKey:'saved',conditionRef:'beats-dc'});
  await api.createOutcome(v,{id:'failed',nameKey:'Failed',resultKey:'failed'});
  // The target rolls its save: an opposed-style Test is not needed, the bonus reads the target's Dex.
  await api.createFormula(v,{id:'target-dex',nameKey:'Target Dex',resultType:'number',expression:{type:'reference',container:'target',reference:ref('dex','value','value.final')}});
  await api.createTest(v,{id:'dex-save',nameKey:'Dex save',rollRef:'d20',bonusFormulaRef:'target-dex',targetValue:15,outcomeRefs:['saved'],fallbackOutcomeRef:'failed'});
  await api.createEffect(v,{id:'spend',nameKey:'Spend mana',targetRef:pool('mana'),targetRole:'self',operation:'subtract',operand:{kind:'literal',value:3}});
  await api.createEffect(v,{id:'burn',nameKey:'Burn',targetRef:pool('hp'),targetRole:'target',operation:'subtract',operand:{kind:'roll',rollRef:'fire',factorFormulaRef:'half-on-save'}});
  await api.createAction(v,{id:'fireball',nameKey:'Fireball',targeting,testRef:'dex-save',costEffectRefs:['spend'],effectRefs:['burn']});
  await api.publishRuleset(v);
  const adapter=new Adapter(),engine=new RuntimeEngine({configurator:api,adapter,hooks:null});
  for(const actor of [mage,orc,goblin])await engine.initializeContainer(v,actor,{});
  await engine.setDefinitionState(v,goblin,'dex',{base:10});
  return {api,v,engine,adapter};
}
const read=(engine,v,actor,id)=>engine.resolveReference(v,{container:'target',reference:pool(id)},{roles:{target:actor}});

test('Shared dice: one damage roll for every target, each target saves on its own, the cost is paid once', async()=>{
  const {v,engine,adapter}=await setup('shared');
  adapter.queue=[3,28,7,9];// orc save 3 (fails), fire 28 rolled once, goblin save 7+10 (saves)
  const result=await engine.executeAction(v,'fireball',context);
  assert.deepEqual(result.targets.map(run=>run.testResult.outcome.resultKey),['failed','saved']);
  assert.equal(adapter.rolled.filter(formula=>formula==='8d6').length,1);
  assert.equal(await read(engine,v,orc,'hp'),2);assert.equal(await read(engine,v,goblin,'hp'),16,'half of 28');
  assert.equal(await read(engine,v,mage,'mana'),7);
  assert.equal(new Set(result.ledgerEntryIds).size,result.ledgerEntryIds.length);
});

test('Dice per target: each target takes its own damage roll', async()=>{
  const {v,engine,adapter}=await setup('each');
  adapter.queue=[3,20,4,10];
  await engine.executeAction(v,'fireball',context);
  assert.equal(adapter.rolled.filter(formula=>formula==='8d6').length,2);
  assert.equal(await read(engine,v,orc,'hp'),10);assert.equal(await read(engine,v,goblin,'hp'),20);
});

test('writeTargets lists every target and the user, and an empty target list is refused', async()=>{
  const {v,engine}=await setup('shared');
  assert.deepEqual(engine.writeTargets('executeAction',[v,'fireball',context]).map(r=>r.id).sort(),['goblin','mage','orc']);
  await assert.rejects(engine.executeAction(v,'fireball',{roles:{self:mage},targets:[]}),/needs at least one target/);
});

test('Saving checks the targeting', async()=>{
  const {api,v}=await setup('one');
  await assert.rejects(api.updateAction(v,'fireball',{targeting:'all'}),/targeting must be one of/);
});
