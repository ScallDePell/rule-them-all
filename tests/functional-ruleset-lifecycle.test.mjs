import test from 'node:test';
import assert from 'node:assert/strict';
import {createConfiguratorAPI} from '../src/configurator/configurator-api.mjs';
import {emptyStorageSnapshot} from '../src/configurator/configurator-storage.mjs';

// Simulate only Foundry's window chrome: the actual editor context and registry run unchanged.
class ApplicationV2 {async _prepareContext(){return {}}}
globalThis.foundry ??= {applications:{api:{ApplicationV2,HandlebarsApplicationMixin:Base=>Base}}};
globalThis.game ??= {i18n:{lang:'fr',localize:key=>key},system:{documentTypes:{Actor:['hero'],Item:['equipment']}}};
const {ConfiguratorEntryEditor} = await import('../src/configurator/configurator-entry-editor.mjs');

class Storage {
  constructor(){this.snapshot=emptyStorageSnapshot();}
  async load(){return structuredClone(this.snapshot)}
  async save(next){this.snapshot=structuredClone(next)}
}

test('new Ruleset editor renders with no version or existing Ruleset, then a saved Ruleset survives API reload',async()=>{
  const storage=new Storage(),api=await createConfiguratorAPI(storage);
  const editor=new ConfiguratorEntryEditor({api,versionId:'',kind:'ruleset'});
  const context=await editor._prepareContext({});
  assert.equal(context.creating,true);
  assert.equal(context.isRuleset,true);
  assert.deepEqual(context.contentTypeChoices,[]);
  assert.deepEqual(context.acquiredDefinitionChoices,[]);
  const record=await api.createRuleset({id:'test-universe',nameKey:'Test Universe',version:'1.0.0'});
  assert.equal(api.getRulesetVersion(record.versionId)?.workingDraft?.nameKey,'Test Universe');
  const reopened=await createConfiguratorAPI(storage);
  assert.equal(reopened.getRulesetVersion(record.versionId)?.workingDraft?.nameKey,'Test Universe');
  const existing=new ConfiguratorEntryEditor({api:reopened,versionId:record.versionId,kind:'ruleset',id:record.versionId});
  const storedContext=await existing._prepareContext({});
  assert.equal(storedContext.creating,false);
  assert.equal(storedContext.data.nameKey,'Test Universe');
});

test('import REPLACE never overwrites a Validated version and NEW rejects a duplicate version label',async()=>{
  const api=await createConfiguratorAPI(new Storage());
  const {versionId}=await api.createRuleset({id:'fam',nameKey:'Family',version:'1.0.0'});
  await api.publishRuleset(versionId);
  const payload=api.exportRuleset(versionId);
  await api.validateRulesetVersion(versionId);
  await assert.rejects(()=>api.importRuleset(payload,'REPLACE'),/immutable/);
  assert.equal(api.getRulesetVersion(versionId).status,'validated');
  const copy=JSON.parse(typeof payload==='string'?payload:JSON.stringify(payload));
  copy.versionId=copy.versionRecord.versionId='other-version-id';
  await assert.rejects(()=>api.importRuleset(copy,'NEW'),/already exists in family/);
});
