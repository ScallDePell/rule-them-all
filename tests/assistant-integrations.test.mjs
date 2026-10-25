import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createConfiguratorAPI} from '../src/configurator/configurator-api.mjs';
import {emptyStorageSnapshot} from '../src/configurator/configurator-storage.mjs';
import {ASSISTANT_PATHS} from '../src/configurator/assistant-paths.mjs';
import {QUESTION_KINDS} from '../src/configurator/assistant-engine.mjs';
import {createIntegrationRegistry, INTEGRATION_CAPABILITIES} from '../src/integrations/integration-registry.mjs';
import {API_VERSION} from '../src/core/module-contract.mjs';

/* The assistant as another module uses it (docs/architecture.md §6 "Ruleset assistant for other modules"): the
   catalog, a plan that writes nothing, an apply refused on a changed draft, and panels in the assistant window. */
class Storage{value=emptyStorageSnapshot();saves=0;async load(){return structuredClone(this.value)}async save(v){this.saves++;this.value=structuredClone(v)}}
const fr=JSON.parse(fs.readFileSync(new URL('../lang/fr.json',import.meta.url)));
const lookup=key=>key.split('.').reduce((o,k)=>o?.[k],fr);
async function setup(){
  const storage=new Storage(),api=await createConfiguratorAPI(storage);
  const v=(await api.createRuleset({id:'r',nameKey:'R',version:'1'})).versionId;
  const texts=Object.fromEntries(api.assistantTextKeys().map(key=>[key,lookup(key)??key]));
  return {api,v,storage,texts};
}

test('Assistant catalog: every path and question, with words, kinds and how to answer them', async()=>{
  const {api,texts}=await setup();
  const catalog=api.describeAssistantCatalog({texts});
  assert.deepEqual(catalog.paths.map(path=>path.id),ASSISTANT_PATHS.map(path=>path.id));
  assert.deepEqual(Object.keys(catalog.answerFormats).sort(),[...QUESTION_KINDS].sort());
  const walk=(path,questions)=>{for(const q of questions){
    assert.ok(QUESTION_KINDS.includes(q.kind));
    assert.ok(q.label&&q.label!==q.labelKey,`${path.id}.${q.id} has words`);
    if(q.kind==='choice')for(const option of q.options)assert.ok(option.label&&option.label!==option.labelKey,`${path.id}.${q.id}=${option.value}`);
    if(q.create)assert.ok(catalog.paths.some(other=>other.id===q.create));
    if(q.kind==='list')walk(path,q.fields);
  }};
  for(const path of catalog.paths){assert.ok(path.title!==path.titleKey&&'produces' in path,path.id);walk(path,path.questions);}
  assert.ok(catalog.groups.every(group=>group.label!==group.labelKey));
  // The catalog is plain JSON: it can be sent as it is.
  assert.deepEqual(JSON.parse(JSON.stringify(catalog)),catalog);
});

test('Assistant catalog: a conditional question says which answers show it', async()=>{
  const {api}=await setup();
  const catalog=api.describeAssistantCatalog();
  const questions=catalog.paths.flatMap(path=>path.questions.map(q=>({path:path.id,...q})));
  const conditional=questions.filter(q=>q.visibility);
  assert.ok(conditional.length>10);
  for(const q of conditional)assert.ok(q.visibility.dependsOn.length>0,`${q.path}.${q.id}`);
  // A list field visible for one value of a choice of its row.
  const field=catalog.paths.flatMap(path=>path.questions.flatMap(q=>q.fields??[])).find(f=>f.id==='referenceType');
  assert.deepEqual(field.visibility,{dependsOn:['valueType'],shownWhen:[{valueType:'reference'}]});
  // Two answers read together: every combination that shows the question, and only those.
  const both=conditional.find(q=>q.visibility.dependsOn.length===2&&q.visibility.shownWhen);
  assert.ok(both,'a question shown by two answers together');
  const source=catalog.paths.find(path=>path.id===both.path);
  const original=ASSISTANT_PATHS.find(path=>path.id===both.path).questions.find(q=>q.id===both.id);
  for(const combination of both.visibility.shownWhen)assert.equal(Boolean(original.visible(combination)),true);
  assert.ok(source.questions.some(q=>q.id===both.visibility.dependsOn[0]));
});

test('Assistant: planAssistant writes nothing; applyAssistant refuses a draft changed since the plan', async()=>{
  const {api,v,storage,texts}=await setup();
  const before=storage.saves,draft=JSON.stringify(api.getRuleset(v));
  const plan=api.planAssistant(v,'characteristics',{items:[{name:'Force'}]},{texts});
  assert.equal(plan.valid,true);assert.equal(typeof plan.fingerprint,'string');assert.equal(plan.patch,undefined);
  assert.equal(storage.saves,before);assert.equal(JSON.stringify(api.getRuleset(v)),draft);
  // Errors name the answer at fault, for a program to correct it.
  const wrong=api.planAssistant(v,'characteristics',{items:[{name:''}]},{texts});
  assert.equal(wrong.valid,false);assert.ok(wrong.errors.some(error=>error.path.startsWith('items[0]')&&error.code));
  await api.applyAssistant(v,'parameter',{name:'Seuil',number:3},{texts});
  await assert.rejects(async()=>api.applyAssistant(v,'characteristics',{items:[{name:'Force'}]},{texts,baseFingerprint:plan.fingerprint}),error=>error.code==='ASSISTANT_STALE');
  const fresh=api.planAssistant(v,'characteristics',{items:[{name:'Force'}]},{texts});
  const result=await api.applyAssistant(v,'characteristics',{items:[{name:'Force'}]},{texts,baseFingerprint:fresh.fingerprint});
  assert.ok(result.created.some(entry=>entry.collection==='definitions'));
});

test('Integrations: assistant panels are kept by id, removable, and their failures stay theirs', ()=>{
  const reports=[],{registry,internal}=createIntegrationRegistry({report:(id,error)=>reports.push([id,error.message])});
  let changes=0;internal.onChange(()=>changes++);
  assert.deepEqual(registry.capabilities,INTEGRATION_CAPABILITIES);
  assert.equal(registry.apiVersion,API_VERSION);
  assert.ok(Object.isFrozen(registry));
  const render=()=>{};
  const remove=registry.registerAssistantPanel({id:'other.designer',ownerModule:'other',title:'Other.Title',icon:'fa-solid fa-robot',render});
  registry.registerAssistantPanel({id:'other.designer',ownerModule:'other',title:'Other.Title2',icon:'fa-solid fa-robot',render});
  assert.deepEqual(registry.listAssistantPanels(),[{id:'other.designer',ownerModule:'other',title:'Other.Title2',icon:'fa-solid fa-robot'}]);
  // The remover of a replaced registration leaves the newer one alone.
  remove();
  assert.equal(registry.listAssistantPanels().length,1);
  registry.registerAssistantPanel({id:'broken',title:'B',render,isVisible:()=>{throw new Error('boom');}});
  registry.registerAssistantPanel({id:'gm-only',title:'G',render,isVisible:context=>context.user.isGM});
  assert.deepEqual(internal.assistantPanels({user:{isGM:false}}).map(panel=>panel.id),['other.designer']);
  assert.deepEqual(internal.assistantPanels({user:{isGM:true}}).map(panel=>panel.id),['other.designer','gm-only']);
  assert.deepEqual(reports[0],['broken','boom']);
  registry.unregisterAssistantPanel('other.designer');
  assert.deepEqual(registry.listAssistantPanels().map(panel=>panel.id),['broken','gm-only']);
  assert.equal(changes,5);
  for(const bad of [null,{id:'x'},{id:'x',title:'T'},{id:'bad id',title:'T',render},{id:'x',title:'T',render,icon:'<b>'}])assert.throws(()=>registry.registerAssistantPanel(bad));
});
