import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {listCreationSourceCollections,getCreationSources,getCreationSourceDescriptor} from '../src/configurator/creation-source-catalog.mjs';
import {createConfiguratorAPI} from '../src/configurator/configurator-api.mjs';
import {emptyStorageSnapshot} from '../src/configurator/configurator-storage.mjs';

class MemoryStorage {
  constructor(){this.value=emptyStorageSnapshot();this.listeners=new Set();}
  async load(){return structuredClone(this.value);}
  async save(value){this.value=structuredClone(value);for(const listener of this.listeners)listener(this.value);}
  subscribe(listener){this.listeners.add(listener);return ()=>this.listeners.delete(listener);}
}

test('Creation sources list Definition Types separately from individual Definitions',async()=>{
  const api=await createConfiguratorAPI(new MemoryStorage());
  const {versionId}=await api.createRuleset({id:'sample',nameKey:'Example game',version:'1.0.0'});
  await api.registerDefinitionType(versionId,{id:'characteristic',key:'characteristic',nameKey:'Characteristics',allowedCapabilities:[],defaultCapabilities:[],requiredCapabilities:[],fields:{}});
  await api.createDefinition(versionId,{id:'strength',key:'strength',nameKey:'Strength',definitionTypeId:'characteristic',data:{},categories:[],capabilities:[],tags:[]});
  await api.createDefinition(versionId,{id:'agility',key:'agility',nameKey:'Agility',definitionTypeId:'characteristic',data:{},categories:[],capabilities:[],tags:[]});
  const sources=getCreationSources(api,versionId);
  assert.deepEqual(sources.find(source=>source.id==='definitionTypes')?.items,[{id:'characteristic',label:'Characteristics'}]);
  assert.deepEqual(sources.find(source=>source.id==='definitions')?.items.map(x=>x.label),['Strength','Agility']);
  assert.equal(sources[0].id,'definitionTypes');
});

test('Legacy individual Definition source keeps the same collection and entry IDs',async()=>{
  const api=await createConfiguratorAPI(new MemoryStorage());
  const {versionId}=await api.createRuleset({id:'legacy-source',nameKey:'Portable',version:'1'});
  await api.registerDefinitionType(versionId,{id:'group',key:'group',nameKey:'Group',allowedCapabilities:[],defaultCapabilities:[],requiredCapabilities:[],fields:{}});
  await api.createDefinition(versionId,{id:'old',key:'old',nameKey:'Old',definitionTypeId:'group',data:{},categories:[],capabilities:[],tags:[]});
  const sources=getCreationSources(api,versionId);
  assert.deepEqual(sources.find(x=>x.id==='definitions')?.items,[{id:'old',label:'Old'}]);
  assert.equal(listCreationSourceCollections(api.getRuleset(versionId)).find(x=>x.id==='definitionTypes')?.entries[0].id,'group');
  assert.equal(getCreationSourceDescriptor('definitions').allowedLabel,'Allowed Definitions');
  assert.match(getCreationSourceDescriptor('definitionTypes').allowedLabel,/^Allowed Definition Types$/);
  assert.equal(getCreationSourceDescriptor('').allowedLabel,'Allowed entries');
});

test('Step editor changes selection label and help, without changing saved data format',()=>{
  const editor=readFileSync(new URL('../src/configurator/configurator-entry-editor.mjs',import.meta.url),'utf8');
  assert.match(editor,/data-step-source-label/);
  assert.match(editor,/data-step-source-hint/);
  assert.match(editor,/getCreationSourceDescriptor\(sourceFamily\)/);
  assert.match(editor,/label\.textContent=descriptor\.allowedLabel/);
  assert.match(editor,/hint\.textContent=descriptor\.help/);
  const serializer=readFileSync(new URL("../src/configurator/creation-step-serialization.mjs",import.meta.url),"utf8");
  assert.match(serializer,/collection:family,objectIds/);
  assert.doesNotMatch(serializer,/original\.source\?\.collection/);
});

test('new source keeps empty state distinct from missing source selection',()=>{
  const editor=readFileSync(new URL('../src/configurator/configurator-entry-editor.mjs',import.meta.url),'utf8');
  assert.match(editor,/Select a Ruleset source above/);
  assert.match(editor,/uiText\("NoSourceItems"/);
  assert.match(editor,/uiText\("MissingSource"/);
  assert.doesNotMatch(editor,/No objects available\./);
});
