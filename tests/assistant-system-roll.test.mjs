import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createConfiguratorAPI} from '../src/configurator/configurator-api.mjs';
import {emptyStorageSnapshot} from '../src/configurator/configurator-storage.mjs';
import {MemoryRuntimeAdapter} from '../src/runtime/memory-runtime-adapter.mjs';
import {createRuntimeAPI} from '../src/runtime/runtime-api.mjs';
import {hookEvents} from '../src/runtime/hook-events.mjs';
class Storage{value=emptyStorageSnapshot();async load(){return structuredClone(this.value)}async save(v){this.value=structuredClone(v)}}
const fr=JSON.parse(fs.readFileSync(new URL('../lang/fr.json',import.meta.url)));
const lookup=key=>key.split('.').reduce((o,k)=>o?.[k],fr);
const texts=api=>Object.fromEntries(api.assistantTextKeys().map(key=>[key,lookup(key)??key]));
const hero={documentName:'Actor',uuid:'Actor.hero'};
const attackArgs=(total,weapon)=>[[{total}],{subject:{actor:hero,item:{documentName:'Item',name:weapon,actor:hero}}}];

// Luca's case with the assistant only: a dnd5e weapon that saps 1 Strength when its attack reaches the target's AC.
test('Assistant: a state that lowers dnd5e Strength, applied when a dnd5e attack with the weapon hits', async()=>{
  const api=await createConfiguratorAPI(new Storage());
  const v=(await api.createRuleset({id:'r',nameKey:'R',version:'1'})).versionId;
  const apply=(pathId,answers)=>api.applyAssistant(v,pathId,answers,{texts:texts(api)});
  await apply('state',{name:'Force sapée',type:{create:{name:'Affaiblissements'}},stacking:'stack',removeAction:false,
    systemChanges:[{key:'system.abilities.str.value',type:'add',value:'-1'}]});
  const ruleset=()=>api.getRuleset(v),stateId=ruleset().definitions.find(d=>d.nameKey==='Force sapée').id;
  assert.deepEqual(ruleset().definitions.find(d=>d.id===stateId).systemChanges,[{key:'system.abilities.str.value',type:'add',value:-1}]);
  const inflict=ruleset().actions.find(a=>(a.stateApplications??[]).some(s=>s.definitionId===stateId)).id;
  const applied=await apply('systemRoll',{name:'Attaque dnd5e',hook:'dnd5e.rollAttack',selfPath:'1.subject',totalPath:'0.0.total',itemPath:'1.subject.item',item:'Lame sapante',
    reach:{type:'systemData',of:'target',path:'system.attributes.ac.value',default:{type:'literal',value:10}},actions:[{use:inflict}]});
  const event=ruleset().eventTypes.find(e=>e.id===applied.main.id);
  assert.deepEqual(event.hook,{name:'dnd5e.rollAttack',who:'local',selfPath:'1.subject',fieldPaths:{total:'0.0.total',item:'1.subject.item'}});
  const trigger=ruleset().triggers.find(t=>t.eventTypeId===event.id);
  assert.deepEqual(trigger.actionRefs,[inflict]);
  await api.publishRuleset(v);
  const adapter=new MemoryRuntimeAdapter();adapter.systemDocuments=new Map([['Actor.foe',{system:{attributes:{ac:{value:14}}}}]]);
  const runtime=createRuntimeAPI(api,{adapter,hooks:null});
  const fire=async args=>{for(const {payload,context} of hookEvents(event,args,{targets:['Actor.foe']}))await runtime.emitEvent(v,event.id,payload,context);};
  await fire(attackArgs(13,'Lame sapante'));
  await fire(attackArgs(19,'Épée longue'));
  assert.deepEqual(await runtime.systemChanges('Actor.foe'),[],'a miss or another weapon does nothing');
  await fire(attackArgs(14,'Lame sapante'));
  await fire(attackArgs(20,'Lame sapante'));
  const [effect]=await runtime.systemChanges('Actor.foe');
  assert.deepEqual([effect.stacks,effect.changes.map(c=>c.value)],[2,['-1','-1']],'two hits: Strength -2');
});

test('Assistant: the system roll path asks the item and the mark only once their paths are given', async()=>{
  const api=await createConfiguratorAPI(new Storage());
  const v=(await api.createRuleset({id:'r',nameKey:'R',version:'1'})).versionId;
  const ids=answers=>api.describeAssistantPath(v,'systemRoll',answers,{texts:texts(api)}).questions.filter(q=>q.visible!==false).map(q=>q.id);
  assert.ok(!ids({}).includes('item')&&!ids({}).includes('reach'));
  assert.ok(ids({itemPath:'1.subject.item',totalPath:'0.0.total'}).includes('item'));
  assert.ok(ids({itemPath:'1.subject.item',totalPath:'0.0.total'}).includes('reach'));
});
