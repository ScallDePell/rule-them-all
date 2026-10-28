import test from 'node:test';
import assert from 'node:assert/strict';
import {createConfiguratorAPI} from '../src/configurator/configurator-api.mjs';
import {emptyStorageSnapshot} from '../src/configurator/configurator-storage.mjs';
import {MemoryRuntimeAdapter} from '../src/runtime/memory-runtime-adapter.mjs';
import {RuntimeEngine} from '../src/runtime/runtime-engine.mjs';
import {createRuntimeAPI} from '../src/runtime/runtime-api.mjs';
import {hookEvents, readHookPath, actorOf} from '../src/runtime/hook-events.mjs';
import {installHookEvents} from '../src/runtime/foundry-hook-events.mjs';
import {formOf, nodeOf} from '../src/configurator/entry-expression-model.mjs';
import {RELAYED_METHODS} from '../src/runtime/runtime-relay.mjs';
class Storage{value=emptyStorageSnapshot();async load(){return structuredClone(this.value)}async save(v){this.value=structuredClone(v)}}
const ctx=path=>({type:'context',path});
const hero={documentName:'Actor',uuid:'Actor.hero',name:'Hero'};
// dnd5e.rollAttack(rolls, {subject: activity}): the activity knows its Actor and its weapon.
const attackArgs=(total,weapon='Sapping blade')=>[[{total}],{subject:{actor:hero,item:{documentName:'Item',name:weapon,actor:hero}}}];
const field=(name,valueType)=>({name,valueType,required:false,nullable:false});
const hook={name:'dnd5e.rollAttack',who:'local',selfPath:'1.subject',fieldPaths:{total:'0.0.total',weapon:'1.subject.item'}};

async function setup(){
  const api=await createConfiguratorAPI(new Storage());
  const v=(await api.createRuleset({id:'hooks',nameKey:'Hooks',version:'1'})).versionId;
  await api.registerDefinitionType(v,{id:'status',key:'status',nameKey:'Status',allowedCapabilities:['state'],defaultCapabilities:['state'],requiredCapabilities:[],fields:{}});
  await api.createDefinition(v,{id:'weakened',key:'weakened',definitionTypeId:'status',nameKey:'Weakened',data:{},capabilities:['state'],systemChanges:[{key:'system.abilities.str.value',type:'add',value:-1}]});
  await api.createEventType(v,{id:'attack',nameKey:'dnd5e attack',payloadFields:{total:field('Total','number'),weapon:field('Weapon','string')},hook});
  // Hit: the attack total reaches the target's Armor Class, read in the game system's data.
  await api.createCondition(v,{id:'hit',nameKey:'Sapping blade hits',expression:{type:'and',args:[
    {type:'eq',left:ctx('event.payload.weapon'),right:{type:'literal',value:'Sapping blade'}},
    {type:'gte',left:ctx('event.payload.total'),right:{type:'systemData',of:'target',path:'system.attributes.ac.value'}}]}});
  await api.createAction(v,{id:'sap',nameKey:'Sap',stateApplications:[{definitionId:'weakened',stacking:'stack'}]});
  await api.createTrigger(v,{id:'on-hit',nameKey:'On hit',eventTypeId:'attack',conditionRefs:['hit'],actionRefs:['sap']});
  await api.publishRuleset(v);
  const adapter=new MemoryRuntimeAdapter();
  adapter.systemDocuments=new Map([['Actor.foe',{system:{attributes:{ac:{value:15}}}}]]);
  return {api,v,adapter,runtime:createRuntimeAPI(api,{adapter,hooks:null}),engine:new RuntimeEngine({configurator:api,adapter,hooks:null})};
}

test('A hook call becomes one event per target, its fields read in the arguments', ()=>{
  assert.equal(readHookPath(attackArgs(17),'0.0.total'),17);
  assert.equal(actorOf({actor:hero}),hero);
  const eventType={hook,payloadFields:{total:field('Total','number'),weapon:field('Weapon','string')}};
  assert.deepEqual(hookEvents(eventType,attackArgs(17),{targets:['Actor.foe','Actor.orc','Actor.hero']}).map(e=>[e.payload,e.context.roles]),[
    [{total:17,weapon:'Sapping blade'},{self:'Actor.hero',target:'Actor.foe'}],[{total:17,weapon:'Sapping blade'},{self:'Actor.hero',target:'Actor.orc'}]]);
  assert.deepEqual(hookEvents(eventType,attackArgs(9)).map(e=>e.context.roles),[{self:'Actor.hero'}],'no target: one event');
  assert.deepEqual(hookEvents({hook:{name:'x',fieldPaths:{}},payloadFields:{}},[1]),[],'no Actor found: no event');
  assert.equal(hookEvents({hook:{name:'x'},payloadFields:{}},[1],{speaker:hero})[0].context.roles.self,'Actor.hero','the speaker acts when no path is given');
});

test('An attack that reaches the Armor Class runs the Trigger: the target is weakened; a miss or another weapon does nothing', async()=>{
  const {v,runtime}=await setup();
  const roles={roles:{self:'Actor.hero',target:'Actor.foe'},defaultRole:'self'};
  await runtime.emitEvent(v,'attack',{total:12,weapon:'Sapping blade'},roles);
  await runtime.emitEvent(v,'attack',{total:20,weapon:'Longsword'},roles);
  assert.deepEqual(await runtime.systemChanges('Actor.foe'),[]);
  await runtime.emitEvent(v,'attack',{total:15,weapon:'Sapping blade'},roles);
  assert.equal((await runtime.systemChanges('Actor.foe'))[0].changes[0].value,'-1');
});

test('A player emitting an event goes through the GM when its Actions write what the player cannot', async()=>{
  const {v,engine}=await setup();
  assert.ok(RELAYED_METHODS.includes('emitEvent'));
  const refs=engine.writeTargets('emitEvent',[v,'attack',{},{roles:{self:'Actor.hero',target:'Actor.foe'}}]).map(ref=>ref.uuid);
  assert.deepEqual(refs.sort(),['Actor.foe','Actor.hero']);
});

test('The module listens to the hooks of the active Ruleset and emits their events', async()=>{
  const {api,v}=await setup();
  await api.setActiveVersionId(v);
  const on=new Map(),off=[],emitted=[];let id=0;
  const hooks={on:(name,fn)=>{on.set(name,fn);return ++id;},off:(name,hookId)=>off.push([name,hookId])};
  globalThis.game={user:{targets:new Set([{actor:{uuid:'Actor.foe'}}])},users:{activeGM:{isSelf:false}}};
  try{
    const bridge=installHookEvents({configurator:api,getRuntime:()=>({emitEvent:async(...args)=>emitted.push(args)}),resolveRuleset:id=>api.getPublishedRuleset(id),hooks});
    assert.deepEqual(bridge.refresh(),['dnd5e.rollAttack']);
    on.get('dnd5e.rollAttack')(...attackArgs(18));
    await new Promise(resolve=>setTimeout(resolve,0));
    assert.deepEqual(emitted,[[v,'attack',{total:18,weapon:'Sapping blade'},{roles:{self:'Actor.hero',target:'Actor.foe'},defaultRole:'self'}]]);
  }finally{delete globalThis.game;}
});

test('Event hooks are checked: a path, a known payload field, a known side', async()=>{
  const {api,v}=await setup();
  const make=(id,h)=>api.createEventType(v,{id,nameKey:id,payloadFields:{total:field('Total','number')},hook:h});
  await assert.rejects(make('e1',{name:'bad name!'}),/hook name/);
  await assert.rejects(make('e2',{name:'x',fieldPaths:{other:'0'}}),/names no payload field/);
  await assert.rejects(make('e3',{name:'x',who:'everyone'}),/who must be/);
  await assert.rejects(make('e4',{name:'x',selfPath:'1..a'}),/selfPath/);
  await make('e5',{name:'x',fieldPaths:{total:'0.0.total'}});
});

test('The visual builder reads and writes the System data operand', ()=>{
  const node={type:'systemData',of:'target',path:'system.attributes.ac.value',default:{type:'literal',value:10}};
  assert.deepEqual(formOf(node),{kind:'systemData',of:'target',path:'system.attributes.ac.value',fallback:'10'});
  assert.deepEqual(nodeOf(formOf(node)),node);
});
