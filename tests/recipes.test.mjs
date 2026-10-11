import test from 'node:test';
import assert from 'node:assert/strict';
import {createConfiguratorAPI} from '../src/configurator/configurator-api.mjs';
import {emptyStorageSnapshot} from '../src/configurator/configurator-storage.mjs';
import {RECIPES, recipeTextKeys} from '../src/configurator/recipes.mjs';
import {MemoryRuntimeAdapter} from '../src/runtime/memory-runtime-adapter.mjs';
import {RuntimeEngine} from '../src/runtime/runtime-engine.mjs';
import fs from 'node:fs';
class Storage{value=emptyStorageSnapshot();async load(){return structuredClone(this.value)}async save(v){this.value=structuredClone(v)}}
const lang=JSON.parse(fs.readFileSync(new URL('../lang/fr.json',import.meta.url)));
const lookup=key=>key.split('.').reduce((o,k)=>o?.[k],lang);

async function withRecipe(recipeId){
  const api=await createConfiguratorAPI(new Storage());const v=(await api.createRuleset({id:'r',nameKey:'R',version:'1'})).versionId;
  const created=await api.applyRecipe(v,recipeId,Object.fromEntries(recipeTextKeys(recipeId).map(key=>[key,lookup(key)])));
  await api.publishRuleset(v);
  const engine=new RuntimeEngine({configurator:api,adapter:new MemoryRuntimeAdapter(),hooks:null}),actor={kind:'actor',id:'a'};
  await engine.initializeContainer(v,actor);
  return {api,v,engine,actor,created,context:{roles:{self:actor,target:actor}}};
}

test('§8: every recipe is documented in both languages and publishes cleanly', async () => {
  const en=JSON.parse(fs.readFileSync(new URL('../lang/en.json',import.meta.url)));
  for(const recipe of RECIPES){
    for(const dict of [lang,en]){
      const r=dict.RTA.Recipe[recipe.id];
      assert.ok(r?.Title&&r?.Summary,recipe.id);
      for(const step of recipe.steps)assert.ok(r.Steps?.[step],`${recipe.id} step ${step}`);
      for(const key of recipeTextKeys(recipe.id))assert.ok(key.split('.').reduce((o,k)=>o?.[k],dict),key);
    }
    const {api,v}=await withRecipe(recipe.id);
    assert.equal(api.diagnoseRuleset(v,{scope:'publish'}).diagnostics.length,0,recipe.id);
  }
});

test('§8 recipe weapon with ammunition: shooting spends ammo until empty', async () => {
  const {engine,v,context}=await withRecipe('weaponAmmo');
  const ammo=async()=>(await engine.getContainerState(context.roles.self)).definitionStates['weapon-ammo-bow'].capabilityStates.pool.ammo.current;
  assert.equal(await ammo(),20);
  for(let i=0;i<20;i++)assert.equal((await engine.executeAction(v,'weapon-ammo-shoot',context)).allowed,true);
  assert.equal(await ammo(),0);
  assert.equal((await engine.executeAction(v,'weapon-ammo-shoot',context)).allowed,false);
});

test('§8 recipe consumable: drinking costs a dose and heals within the pool bounds', async () => {
  const {engine,v,context}=await withRecipe('consumable');
  const state=async()=>(await engine.getContainerState(context.roles.self)).definitionStates;
  await engine.executeAction(v,'consumable-drink',context);
  assert.equal((await state())['consumable-vitality'].capabilityStates.pool.hp.current,10);
  await engine.executeAction(v,'consumable-drink',context);
  assert.equal((await state())['consumable-vitality'].capabilityStates.pool.hp.current,12);
  assert.equal((await state())['consumable-potion'].capabilityStates.pool.doses.current,1);
});

test('§8 recipe XP progression: the level follows experience', async () => {
  const {engine,v,context}=await withRecipe('xpProgression');
  const level=()=>engine.evaluator(v).formula('xp-progression-level',context);
  assert.equal(await level(),1);
  for(let i=0;i<4;i++)await engine.executeAction(v,'xp-progression-award-xp',context);
  assert.equal(await level(),2);
});

test('§8 recipe encumbrance: overloaded when the load exceeds strength × 10', async () => {
  const {engine,v,actor,context}=await withRecipe('encumbrance');
  const adapter=engine.adapter;
  const set=async(id,value)=>{const state=await engine.getContainerState(actor);state.definitionStates[id].capabilityStates.value.base=value;await adapter.saveMany([{ref:actor,state}]);};
  await set('encumbrance-strength',3);await set('encumbrance-load',25);
  assert.equal(await engine.evaluator(v).condition('encumbrance-overloaded',context),false);
  await set('encumbrance-load',31);
  assert.equal(await engine.evaluator(v).condition('encumbrance-overloaded',context),true);
});

test('§8: applying a recipe twice keeps ids unique', async () => {
  const api=await createConfiguratorAPI(new Storage());const v=(await api.createRuleset({id:'r',nameKey:'R',version:'1'})).versionId;
  await api.applyRecipe(v,'weaponAmmo');
  const second=await api.applyRecipe(v,'weaponAmmo');
  assert.ok(second.every(entry=>entry.id.endsWith('-2')));
  assert.equal(api.listActions(v).length,2);
});

test('§8: every editor kind has localized help; a Definition shows its type description', async () => {
  const {HELP_KINDS, entryHelp} = await import('../src/configurator/entry-help.mjs');
  const en=JSON.parse(fs.readFileSync(new URL('../lang/en.json',import.meta.url)));
  for(const kind of HELP_KINDS)for(const dict of [lang,en])assert.ok(dict.RTA.Help[kind]?.Summary&&dict.RTA.Help[kind]?.Usage,kind);
  assert.equal(entryHelp('definition',{definitionType:{descriptionKey:'Physical traits.'}}).typeDescription,'Physical traits.');
  assert.equal(entryHelp('nope'),null);
  assert.match(fs.readFileSync(new URL('../templates/configurator/entry-editor.hbs',import.meta.url),'utf8'),/data-entry-help/);
});
