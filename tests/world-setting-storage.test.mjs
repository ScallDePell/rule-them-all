import test from 'node:test';
import assert from 'node:assert/strict';
import {createConfiguratorAPI} from '../src/configurator/configurator-api.mjs';
import {emptyStorageSnapshot} from '../src/configurator/configurator-storage.mjs';
import {STORAGE_KEY, WorldSettingStorage} from '../src/configurator/world-setting-storage.mjs';

// Foundry's game.settings, as far as the storage uses it: register, get, set (onChange on every client).
class Settings{
  config=new Map();values=new Map();writes=[];
  register(ns,key,config){this.config.set(`${ns}.${key}`,config);}
  get(ns,key){const id=`${ns}.${key}`;if(!this.config.has(id))throw new Error(`not registered: ${id}`);return structuredClone(this.values.has(id)?this.values.get(id):this.config.get(id).default);}
  async set(ns,key,value){const id=`${ns}.${key}`;this.values.set(id,structuredClone(value));this.writes.push(key);this.config.get(id).onChange?.(structuredClone(value));}
}

test('each RulesetVersion has its own world setting: a save sends only the versions it changed', async()=>{
  globalThis.game={user:{isGM:true}};
  const settings=new Settings(),storage=new WorldSettingStorage(settings);
  storage.register();
  const heard=[];storage.subscribe(snapshot=>heard.push(snapshot));
  const api=await createConfiguratorAPI(storage);
  const a=(await api.createRuleset({id:'alpha',nameKey:'Alpha',version:'1'})).versionId;
  const b=(await api.createRuleset({id:'beta',nameKey:'Beta',version:'1'})).versionId;
  settings.writes=[];
  await api.createFormula(a,{id:'f',nameKey:'F',expression:{type:'literal',value:1}});
  assert.deepEqual(settings.writes,[`rulesetVersion.${a}`,STORAGE_KEY],'beta is not sent again');
  const index=settings.get('rule-them-all',STORAGE_KEY);
  assert.deepEqual(index.rulesetFamilies.map(f=>f.versionIds),[[a],[b]]);
  assert.equal(heard.at(-1).rulesetFamilies[0].versions[0].workingDraft.formulas[0].id,'f','other clients get the whole snapshot back');
  // A second client (a reload) reads the same Rulesets back.
  const again=await createConfiguratorAPI(new WorldSettingStorage(settings));
  assert.deepEqual(again.listRulesetFamilies().map(f=>f.id).sort(),['alpha','beta']);
  settings.writes=[];
  await api.deleteRulesetVersion(b);
  assert.equal(settings.get('rule-them-all',`rulesetVersion.${b}`),null,'a deleted version’s setting is emptied');
  assert.deepEqual(settings.writes,[STORAGE_KEY,`rulesetVersion.${b}`]);
  delete globalThis.game;
});

test('a World still in the single-setting format asks for the conversion, which splits it', async()=>{
  globalThis.game={user:{isGM:true}};
  const settings=new Settings(),storage=new WorldSettingStorage(settings);
  storage.register();
  const source=createConfiguratorAPI({load:async()=>emptyStorageSnapshot(),save:async snapshot=>{former=snapshot;},subscribe:()=>()=>{}});
  let former;const api=await source;await api.createRuleset({id:'alpha',nameKey:'Alpha',version:'1'});
  settings.values.set(`rule-them-all.${STORAGE_KEY}`,former);
  await assert.rejects(storage.load(),/repair it once/);
  await storage.replace(former);
  const loaded=await new WorldSettingStorage(settings).load();
  assert.equal(loaded.rulesetFamilies[0].versions[0].rulesetId,'alpha');
  assert.equal(settings.get('rule-them-all',STORAGE_KEY).storageVersion,4);
  delete globalThis.game;
});
