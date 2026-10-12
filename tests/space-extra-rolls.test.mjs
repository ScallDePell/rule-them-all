import test from 'node:test';
import assert from 'node:assert/strict';
import {createConfiguratorAPI} from '../src/configurator/configurator-api.mjs';
import {emptyStorageSnapshot} from '../src/configurator/configurator-storage.mjs';
import {MemoryRuntimeAdapter} from '../src/runtime/memory-runtime-adapter.mjs';
import {RuntimeEngine} from '../src/runtime/runtime-engine.mjs';
class Storage{value=emptyStorageSnapshot();async load(){return structuredClone(this.value)}async save(v){this.value=structuredClone(v)}}
class Adapter extends MemoryRuntimeAdapter{queue=[];async roll(formula){const n=this.queue.shift();return {formula,total:n,natural:n,result:String(n)};}}
const hero={kind:'actor',id:'hero'},foe={kind:'actor',id:'foe'},ally={kind:'actor',id:'ally'},context={roles:{self:hero,target:foe},defaultRole:'self'};
const ctx=path=>({type:'context',path}),lit=value=>({type:'literal',value});

async function setup(){
  const api=await createConfiguratorAPI(new Storage());
  const v=(await api.createRuleset({id:'red',nameKey:'Red',version:'1'})).versionId;
  await api.createRoll(v,{id:'d10',nameKey:'d10',formula:'1d10'});
  await api.createCondition(v,{id:'ten',nameKey:'Natural 10',expression:{type:'eq',left:ctx('variables.test.natural'),right:lit(10)}});
  await api.createCondition(v,{id:'one',nameKey:'Natural 1',expression:{type:'eq',left:ctx('variables.test.natural'),right:lit(1)}});
  // Long range: -2 beyond 10 units; flanked: +2 when an ally stands within 2 of the target.
  await api.createFormula(v,{id:'range',nameKey:'Range',resultType:'number',expression:{type:'if',condition:{type:'gt',left:{type:'distance',from:'self',to:'target'},right:lit(10)},then:lit(-2),else:lit(0)}});
  await api.createFormula(v,{id:'flank',nameKey:'Flank',resultType:'number',expression:{type:'if',condition:{type:'gt',left:{type:'nearby',of:'target',within:lit(2),side:'enemy'},right:lit(0)},then:lit(2),else:lit(0)}});
  await api.createFormula(v,{id:'bonus',nameKey:'Bonus',resultType:'number',expression:{type:'add',args:[{type:'formula',id:'range'},{type:'formula',id:'flank'}]}});
  await api.createTest(v,{id:'shoot',nameKey:'Shoot',rollRef:'d10',bonusFormulaRef:'bonus',extraRolls:[{conditionRef:'ten',rollRef:'d10'},{conditionRef:'one',rollRef:'d10',operation:'subtract'}]});
  await api.publishRuleset(v);
  const adapter=new Adapter(),engine=new RuntimeEngine({configurator:api,adapter,hooks:null});
  adapter.positions=new Map([['actor:hero',{x:0,y:0,disposition:1}],['actor:foe',{x:12,y:0,disposition:-1}],['actor:ally',{x:13,y:1,disposition:1}]]);
  return {api,v,engine,adapter};
}

test('A natural 10 adds a d10 and a natural 1 takes one away, within the same Test', async()=>{
  const {v,engine,adapter}=await setup();
  adapter.queue=[10,7];
  let result=await engine.executeTest(v,'shoot',context);
  assert.equal(result.total,10+7-2+2);assert.deepEqual(result.roll.extra,[{rollId:'d10',total:7,operation:'add'}]);
  adapter.queue=[1,4];
  result=await engine.executeTest(v,'shoot',context);
  assert.equal(result.total,1-4-2+2);
});

test('Formulas measure the distance between roles and count the Actors around one', async()=>{
  const {v,engine,adapter}=await setup();
  assert.equal(await engine.evaluateFormula(v,'range',context),-2);
  assert.equal(await engine.evaluateFormula(v,'flank',context),2,'an enemy of the foe stands next to it');
  adapter.positions.set('actor:hero',{x:11,y:0,disposition:1});
  assert.equal(await engine.evaluateFormula(v,'range',context),0);
  adapter.positions.delete('actor:foe');
  await assert.rejects(engine.evaluateFormula(v,'range',context),/tokens on the scene/);
});

test('Saving checks extra rolls and the space nodes', async()=>{
  const {api,v}=await setup();
  await assert.rejects(api.createTest(v,{id:'x',nameKey:'X',rollRef:'d10',extraRolls:[{conditionRef:'ten',rollRef:'nowhere'}]}),/roll\/nowhere/);
  await assert.rejects(api.createFormula(v,{id:'d',nameKey:'D',resultType:'number',expression:{type:'distance',from:'self'}}),/to must be a role/);
});
