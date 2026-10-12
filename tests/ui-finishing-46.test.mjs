import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createConfiguratorAPI} from '../src/configurator/configurator-api.mjs';
import {emptyStorageSnapshot} from '../src/configurator/configurator-storage.mjs';
class Storage{value=emptyStorageSnapshot();saves=0;async load(){return structuredClone(this.value)}async save(v){this.saves++;this.value=structuredClone(v)}}

test('§46: new entries go after the existing ones; reordering is one atomic write', async () => {
  const storage=new Storage(),api=await createConfiguratorAPI(storage);const v=(await api.createRuleset({id:'r',nameKey:'R',version:'1'})).versionId;
  for(const id of ['a','b','c'])await api.createTag(v,{id,nameKey:id,descriptionKey:'',enabled:true,color:null});
  assert.deepEqual(api.listTags(v).map(tag=>tag.order),[10,20,30]);
  await api.createTag(v,{id:'d',nameKey:'d',descriptionKey:'',enabled:true,color:null,order:5});
  assert.equal(api.getTag(v,'d').order,5);
  const before=storage.saves;
  await api.reorderEntries(v,'tag',['c','a','d','b']);
  assert.equal(storage.saves-before,1);
  assert.deepEqual(Object.fromEntries(api.listTags(v).map(tag=>[tag.id,tag.order])),{a:20,b:40,c:10,d:30});
  await assert.rejects(()=>api.reorderEntries(v,'tag',['nope']),/tag not found: nope/);
  await assert.rejects(()=>api.reorderEntries(v,'reference',[]),/cannot be reordered/);
});

test('§46: Activate is offered only for a published version; counters and graph nodes are live', () => {
  const list=readFileSync(new URL('../templates/configurator/configurator.hbs',import.meta.url),'utf8');
  assert.match(list,/\{\{#if canActivate\}\}<button[^>]*data-action="activate"/);
  assert.match(list,/data-node-kind="\{\{kind\}\}" data-node-id="\{\{id\}\}"/);
  const editor=readFileSync(new URL('../templates/configurator/entry-editor.hbs',import.meta.url),'utf8');
  assert.equal((editor.match(/data-live-count=/g)??[]).length,4,"entries, Test inputs, Trigger filters and the shared card list");
  const app=readFileSync(new URL('../src/configurator/configurator-app.mjs',import.meta.url),'utf8');
  assert.match(app,/canActivate:Boolean\(record\.publishedSnapshot\)/);
});
