import test from 'node:test';
import assert from 'node:assert/strict';
import {createConfiguratorAPI} from '../src/configurator/configurator-api.mjs';
import {emptyStorageSnapshot} from '../src/configurator/configurator-storage.mjs';
import {resolveRuntimeRuleset} from '../src/runtime/runtime-contracts.mjs';

class Storage{data=emptyStorageSnapshot();async load(){return structuredClone(this.data)}async save(next){this.data=structuredClone(next)}}

test('The runtime reads one frozen copy of a published Ruleset until it is published again', async()=>{
  const api=await createConfiguratorAPI(new Storage());
  const v=(await api.createRuleset({id:'r',nameKey:'R',version:'1.0.0'})).versionId;
  await api.createParameter(v,{id:'p',nameKey:'P',valueType:'number',value:1});
  await api.publishRuleset(v);
  const first=resolveRuntimeRuleset(api,v);
  assert.equal(resolveRuntimeRuleset(api,v),first,'no copy per read');
  assert.ok(Object.isFrozen(first.parameters[0]));
  assert.throws(()=>{first.parameters[0].value=2;},TypeError);
  await api.updateParameter(v,'p',{...api.getRuleset(v).parameters[0],value:3});
  assert.equal(resolveRuntimeRuleset(api,v).parameters[0].value,1,'a draft edit is not live');
  assert.equal(resolveRuntimeRuleset(api,v,{source:'draft'}).parameters[0].value,3);
  await api.publishRuleset(v);
  assert.equal(resolveRuntimeRuleset(api,v).parameters[0].value,3);
});
