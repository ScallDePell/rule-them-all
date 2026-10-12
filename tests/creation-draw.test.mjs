import test from 'node:test';
import assert from 'node:assert/strict';
import {createConfiguratorAPI} from '../src/configurator/configurator-api.mjs';
import {emptyStorageSnapshot} from '../src/configurator/configurator-storage.mjs';
import {CreationSessions, MemoryCreationSessionStore} from '../src/runtime/creation-sessions.mjs';
import {analyzeCreationSystem} from '../src/runtime/creation-plan.mjs';
class Storage{data=emptyStorageSnapshot();async load(){return structuredClone(this.data)}async save(data){this.data=structuredClone(data)}}

// WFRP-like: species drawn by their d100 share, characteristics rolled 2d10 + 20 each, then a career among those the species allows.
async function build({locked=false}={}){
  const api=await createConfiguratorAPI(new Storage()),v=(await api.createRuleset({id:'draw',nameKey:'Draw',version:'1'})).versionId;
  await api.registerDefinitionType(v,{id:'stat',key:'stat',nameKey:'Stat',allowedCapabilities:['value'],defaultCapabilities:['value'],requiredCapabilities:[],fields:{}});
  for(const id of ['ws','bs'])await api.createDefinition(v,{id,key:id,nameKey:id,definitionTypeId:'stat',capabilities:['value'],data:{}});
  await api.createContentType(v,{id:'species',nameKey:'Species',storageKind:'item',fields:{share:{id:'share',name:'Share',valueType:'integer',required:false,nullable:true}}});
  for(const [id,share] of [['human',90],['dwarf',4],['elf',0]])await api.createContentTemplate(v,{id,nameKey:id,contentTypeId:'species',data:{share}});
  await api.createRoll(v,{id:'stat-roll',nameKey:'2d10+20',formula:'2d10+20'});
  await api.createCreationSystem(v,{id:'creation',nameKey:'Creation',steps:[
    {id:'species',name:'Species',kind:'content',min:1,max:1,source:{collection:'contentTemplates',objectIds:['human','dwarf','elf']},draw:{weightField:'share',locked}},
    {id:'stats',name:'Characteristics',kind:'allocation',required:false,min:0,max:0,source:{collection:'definitions',objectIds:['ws','bs']},draw:{rollRef:'stat-roll'}}]});
  await api.publishRuleset(v);
  const rolls=[31,27],randoms=[];
  const sessions=new CreationSessions({configurator:api,store:new MemoryCreationSessionStore(),userId:()=>'alice',random:()=>randoms.shift()??0,roll:async formula=>({total:rolls.shift(),result:formula}),finalize:async()=>({})});
  return {api,v,sessions,randoms};
}

test('A drawn content step picks by the weight field, never an option of weight 0', async()=>{
  const {v,sessions,randoms}=await build();
  let session=await sessions.start(v,'creation');
  randoms.push(0.97);// 0.97 × 94 = 91.2: past the 90 of human, inside dwarf
  session=await sessions.draw(session.id,'species');
  assert.deepEqual(session.answers.species,{selectedIds:['dwarf'],drawn:true});
  assert.deepEqual(session.rolls.species,[{id:'dwarf',weight:4,of:94}]);
  randoms.push(0.5);session=await sessions.draw(session.id,'species');
  assert.deepEqual(session.answers.species.selectedIds,['human']);
});

test('A drawn allocation rolls once per Definition and keeps the dice outside the step bounds', async()=>{
  const {api,v,sessions}=await build();
  let session=await sessions.start(v,'creation');
  session=await sessions.draw(session.id,'stats');
  assert.deepEqual(session.answers.stats,{allocations:{ws:31,bs:27},drawn:true});
  assert.equal(session.rolls.stats.length,2);
  const ruleset=api.getRulesetVersion(v).publishedSnapshot;
  const analysis=await analyzeCreationSystem(ruleset,'creation',{...session.answers,species:['human']});
  assert.deepEqual(analysis.steps.map(step=>step.errors),[[],[]],'a drawn allocation is not held to min 0 / max 0');
  assert.deepEqual(analysis.operations.find(op=>op.kind==='allocation').allocations,{ws:31,bs:27});
});

test('A locked draw cannot be redrawn nor replaced by a choice; saving checks the draw settings', async()=>{
  const {v,sessions,randoms}=await build({locked:true});
  let session=await sessions.start(v,'creation');
  randoms.push(0.1);session=await sessions.draw(session.id,'species');
  await assert.rejects(sessions.draw(session.id,'species'),/already drawn/);
  await assert.rejects(sessions.answer(session.id,'species',['dwarf']),/cannot be changed/);
  const {prepareCreationSystem}=await import('../src/configurator/rule-contracts.mjs');
  assert.throws(()=>prepareCreationSystem({id:'c',nameKey:'C',steps:[{id:'s',name:'S',kind:'allocation',draw:{}}]},{strict:true}),/needs a Roll/);
  assert.throws(()=>prepareCreationSystem({id:'c',nameKey:'C',steps:[{id:'s',name:'S',kind:'review',draw:{}}]}),/review step has no draw settings/);
  assert.throws(()=>prepareCreationSystem({id:'c',nameKey:'C',steps:[{id:'s',name:'S',draw:{dice:'1d6'}}]}),/unsupported field: dice/);
});
