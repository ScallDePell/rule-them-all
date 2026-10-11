import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {readStorageSnapshot} from '../src/configurator/configurator-storage.mjs';
import {createConfiguratorAPI} from '../src/configurator/configurator-api.mjs';
import {convertSnapshot} from '../tools/convert-stored-data.mjs';

// Saved by the module as it was just before the 2026-10-11 UI simplification.
const old=()=>JSON.parse(fs.readFileSync(new URL('./fixtures/world-before-ui-simplification.json',import.meta.url),'utf8'));

test('a World saved before the UI simplification is refused as is and loads once converted', async () => {
  assert.throws(()=>readStorageSnapshot(old()),/Unsupported field: references/);
  const {snapshot,notes}=convertSnapshot(old());
  readStorageSnapshot(snapshot);
  await createConfiguratorAPI({load:async()=>snapshot,save:async()=>{},subscribe:()=>()=>{}});
  assert.equal(snapshot.rulesetFamilies[0].versions[0].status,'ready');
  const r=snapshot.rulesetFamilies[0].versions[0].workingDraft;
  assert.deepEqual(r.tests[0].outcomeRefs,['high','low']);
  assert.deepEqual(r.effects[0].targetRef,{objectKind:'definition',objectId:'str',capabilityId:'value',outputId:'value.base'});
  const sword=r.contentTemplates[0];
  assert.deepEqual(sword.relations.map(x=>[x.targetRef.objectId,x.config]),[['str',{initial:{'value.base':4}}],['hurt',{}]]);
  assert.deepEqual(sword.choiceGroups[0].options[0],{id:'o1',operation:'grant',targetRef:{objectKind:'definition',objectId:'fight'},config:{initial:{'value.base':1}}});
  assert.deepEqual(r.definitions[0].capabilities,['value']);
  assert.equal(r.permissionPolicies[0].enabled,false);
  assert.deepEqual(r.sectionColors,{organization:'#445566'});
  assert.ok(notes.some(note=>note.includes('Restriction')));
});
