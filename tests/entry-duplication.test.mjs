import test from 'node:test';
import assert from 'node:assert/strict';
import {createConfiguratorAPI} from '../src/configurator/configurator-api.mjs';
import {emptyStorageSnapshot} from '../src/configurator/configurator-storage.mjs';
import {contextMenuHTML} from '../src/ui/context-menu.mjs';
class Storage{value=emptyStorageSnapshot();async load(){return structuredClone(this.value)}async save(v){this.value=structuredClone(v)}}

async function setup(){
  const api=await createConfiguratorAPI(new Storage());
  const v=(await api.createRuleset({id:'dup',nameKey:'Dup',version:'1'})).versionId;
  await api.registerDefinitionType(v,{id:'stat',key:'stat',nameKey:'Stat',allowedCapabilities:['value'],defaultCapabilities:['value'],requiredCapabilities:[],fields:{},valueBounds:{maximum:{literal:5}}});
  await api.createDefinition(v,{id:'force',key:'force',definitionTypeId:'stat',nameKey:'Force',descriptionKey:'Muscles',data:{},capabilities:['value'],tags:[]});
  await api.createDie(v,{id:'d-fate',nameKey:'Fate',denomination:'g',faces:[{labelKey:'+',value:1},{labelKey:' ',value:0},{labelKey:'-',value:-1}],counters:[]});
  return {api,v};
}

test('Duplicating an entry copies it under the name given, with a fresh id and key', async()=>{
  const {api,v}=await setup();
  const copy=await api.duplicateEntry(v,'definition','force','Agilité');
  assert.equal(copy.id,'agilite');assert.equal(copy.key,'agilite');assert.equal(copy.nameKey,'Agilité');assert.equal(copy.descriptionKey,'Muscles');
  assert.equal(api.getDefinition(v,'force').nameKey,'Force','the original is untouched');
  const again=await api.duplicateEntry(v,'definition','force','Agilité');
  assert.equal(again.id,'agilite-2');assert.equal(again.key,'agilite-2');
  const type=await api.duplicateEntry(v,'definitionType','stat','Compétence');
  assert.deepEqual([type.id,type.valueBounds],['competence',{maximum:{literal:5}}]);
  assert.equal(api.listDefinitions(v).length,3,'a type copy does not copy its Definitions');
});

test('What must stay unique is left empty, and a name is required', async()=>{
  const {api,v}=await setup();
  const die=await api.duplicateEntry(v,'die','d-fate','Fate 2');
  assert.equal(die.denomination,'');assert.equal(die.faces.length,3);
  await assert.rejects(api.duplicateEntry(v,'definition','force','  '),/name is required/);
  await assert.rejects(api.duplicateEntry(v,'definition','nope','X'),/not found/);
});

test('The right-click menu lists its choices, escaped', ()=>{
  const html=contextMenuHTML([{label:'Éditer',icon:'fa-solid fa-pen'},{label:'<b>Dupliquer</b>',icon:'fa-solid fa-copy'}]);
  assert.match(html,/<ol class="context-items"><li class="context-item" data-context-item="0"><i class="fa-solid fa-pen"/);
  assert.match(html,/&lt;b&gt;Dupliquer/);
});
