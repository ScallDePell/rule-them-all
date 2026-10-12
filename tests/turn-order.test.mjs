import test from 'node:test';
import assert from 'node:assert/strict';
import {createConfiguratorAPI} from '../src/configurator/configurator-api.mjs';
import {emptyStorageSnapshot} from '../src/configurator/configurator-storage.mjs';
import {MemoryRuntimeAdapter} from '../src/runtime/memory-runtime-adapter.mjs';
import {createRuntimeAPI} from '../src/runtime/runtime-api.mjs';
import {RuntimeEngine} from '../src/runtime/runtime-engine.mjs';
import {planTurnChange, applyTurnChange} from '../src/runtime/foundry-initiative.mjs';
class Storage{value=emptyStorageSnapshot();async load(){return structuredClone(this.value)}async save(v){this.value=structuredClone(v)}}

async function setup(){
  const api=await createConfiguratorAPI(new Storage());
  const v=(await api.createRuleset({id:'g',nameKey:'Game',version:'1'})).versionId;
  await api.createFormula(v,{id:'spend',nameKey:'Spend',resultType:'number',expression:{type:'literal',value:-10}});
  await api.createAction(v,{id:'interrupt',nameKey:'Interrupt',turnOrder:{move:'add',formulaRef:'spend'}});
  await api.createAction(v,{id:'delay',nameKey:'Delay',turnOrder:{move:'last'}});
  await api.createAction(v,{id:'trip',nameKey:'Trip',turnOrder:{move:'last',role:'target'}});
  await api.publishRuleset(v);
  const adapter=new MemoryRuntimeAdapter(),runtime=createRuntimeAPI(api,{adapter,hooks:null});
  return {api,v,runtime,adapter};
}

test('An Action moves a combatant in the combat in progress, through the combat tracker', async()=>{
  const {api,v,runtime,adapter}=await setup();
  const hero={kind:'actor',id:'hero'},orc={kind:'actor',id:'orc'};
  await runtime.executeAction(v,'delay',{roles:{self:hero}});
  assert.equal(adapter.turnChanges,undefined,'no combat, no move');
  adapter.combat={kind:'combat',id:'c1'};
  const result=await runtime.executeAction(v,'interrupt',{roles:{self:hero}});
  await runtime.executeAction(v,'trip',{roles:{self:hero,target:orc}});
  assert.deepEqual(adapter.turnChanges,[{ref:hero,move:'add',value:-10},{ref:orc,move:'last',value:null}]);
  assert.deepEqual(result.changes,[{turnOrder:{move:'add',value:-10},turnRef:hero}]);
  // Only the GM may update a combat: a player's use goes through the GM relay.
  const engine=new RuntimeEngine({configurator:api,adapter,hooks:null});
  assert.deepEqual(engine.writeTargets('executeAction',[v,'delay',{roles:{self:hero}}]),[{kind:'combat',id:'c1'}]);
});

test('Saving checks the turn order settings', async()=>{
  const {api,v}=await setup();
  await assert.rejects(api.createAction(v,{id:'x',nameKey:'X',turnOrder:{move:'swap'}}),/move must be one of/);
  await assert.rejects(api.createAction(v,{id:'x',nameKey:'X',turnOrder:{move:'set'}}),/Formula is needed/);
  await assert.rejects(api.createAction(v,{id:'x',nameKey:'X',turnOrder:{move:'now',formulaRef:'spend'}}),/Formula is needed/);
  await assert.rejects(api.deleteFormula(v,'spend'),/still referenced/);
});

test('Turn plan: interrupt, delay, a new initiative, and whose turn it is afterwards', ()=>{
  const turns=[{id:'a',initiative:20},{id:'b',initiative:15},{id:'c',initiative:10},{id:'d',initiative:5}];
  assert.deepEqual(planTurnChange(turns,1,'d',{move:'now'}),{initiative:15.01,turnId:'d'},'d interrupts b');
  assert.deepEqual(planTurnChange(turns,1,'b',{move:'last'}),{initiative:4.99,turnId:'c'},'b delays: c acts');
  assert.deepEqual(planTurnChange(turns,1,'c',{move:'last'}),{initiative:4.99,turnId:'b'},'b keeps acting');
  assert.deepEqual(planTurnChange(turns,1,'b',{move:'add',value:-8}),{initiative:7,turnId:'c'});
  assert.deepEqual(planTurnChange(turns,1,'b',{move:'set',value:30}),{initiative:30,turnId:'b'});
  assert.deepEqual(planTurnChange(turns,null,'a',{move:'last'}),{initiative:4.99,turnId:null});
  assert.equal(planTurnChange(turns,0,'z',{move:'now'}),null);
});

test('Applying a turn plan to a Foundry combat', async()=>{
  const make=(id,initiative,uuid)=>({id,initiative,actor:{uuid},async update(data){Object.assign(this,data);}});
  const list=[make('a',20,'Actor.a'),make('b',15,'Actor.b'),make('c',10,'Actor.c')];
  const combat={turn:0,combatants:new Map(list.map(c=>[c.id,c])),get turns(){return [...this.combatants.values()].sort((x,y)=>y.initiative-x.initiative);},setupTurns(){return this.turns;},async update(data){Object.assign(this,data);}};
  assert.equal(await applyTurnChange(combat,'Actor.a',{move:'last'}),true);
  assert.equal(list[0].initiative,9.99);assert.equal(combat.turns[combat.turn].id,'b');
  assert.equal(await applyTurnChange(combat,'Actor.c',{move:'now'}),true);
  assert.equal(combat.turns[combat.turn].id,'c');
  assert.equal(await applyTurnChange(combat,'Actor.zz',{move:'now'}),false);
});
