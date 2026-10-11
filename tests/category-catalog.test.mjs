import test from 'node:test';
import assert from 'node:assert/strict';
import {createConfiguratorAPI} from '../src/configurator/configurator-api.mjs';
import {emptyStorageSnapshot} from '../src/configurator/configurator-storage.mjs';
import {normalizeRulesetCollections} from '../src/configurator/configurator-schema.mjs';
import {buildFacet, matchesFacet, toggleFacet} from '../src/configurator/card-facets.mjs';
class Storage{constructor(){this.value=emptyStorageSnapshot();}async load(){return structuredClone(this.value)}async save(v){this.value=structuredClone(v)}}

async function setup(){
  const storage=new Storage(),api=await createConfiguratorAPI(storage);
  const v=(await api.createRuleset({id:'catalog',nameKey:'Catalog',version:'1'})).versionId;
  await api.registerDefinitionType(v,{id:'kind',key:'kind',nameKey:'Kind',descriptionKey:'',color:null,order:10,allowedCapabilities:[],defaultCapabilities:[],requiredCapabilities:[],fields:{},constraints:[]});
  return {api,v,storage};
}

test('Categories are a GM-managed catalog persisted with the Ruleset',async()=>{
  const {api,v,storage}=await setup();
  const created=await api.createCategory(v,{id:'combat',nameKey:'Combat'});
  assert.deepEqual(created,{descriptionKey:'',order:10,id:'combat',nameKey:'Combat'});
  await api.updateCategory(v,'combat',{order:20});
  const reloaded=await createConfiguratorAPI(storage);
  assert.deepEqual(reloaded.listCategories(v).map(entry=>[entry.id,entry.order]),[['combat',20]]);
  await assert.rejects(()=>api.createCategory(v,{id:'combat',nameKey:'Again'}),/already exists/);
  await assert.rejects(()=>api.createCategory(v,{id:'colored',nameKey:'Colored',color:'#ff0000'}),/Unsupported Category field: color/);
});

test('Consumers store catalog ids only, and a used Category cannot be deleted',async()=>{
  const {api,v}=await setup();
  await api.createCategory(v,{id:'magic',nameKey:'Magic'});
  await assert.rejects(()=>api.createDefinition(v,{id:'free',key:'free',definitionTypeId:'kind',nameKey:'Free',descriptionKey:'',data:{},categories:['not-in-catalog'],enabled:true,order:0,tags:[]}),/Dependency target does not exist: category\/not-in-catalog/);
  await api.createDefinition(v,{id:'spell',key:'spell',definitionTypeId:'kind',nameKey:'Spell',descriptionKey:'',data:{},categories:['magic'],enabled:true,order:0,tags:[]});
  assert.deepEqual(api.getConsumers(v,'magic','category').map(edge=>edge.consumerRef?.objectId??edge.source),['spell']);
  await assert.rejects(()=>api.deleteCategory(v,'magic'),error=>error.code==='REFERENTIAL_INTEGRITY');
  await api.updateDefinition(v,'spell',{categories:[]});
  assert.equal(await api.deleteCategory(v,'magic'),true);
});

test('Loading a Ruleset never invents Tags, Categories or Content Types from entry strings',()=>{
  const ruleset=normalizeRulesetCollections({id:'old',nameKey:'Old',version:'1',definitions:[{id:'a',tags:['x'],categories:['melee']}],contentTemplates:[{id:'t',contentTypeId:'gear',categories:['loot']}]});
  assert.deepEqual([ruleset.tags,ruleset.categories,ruleset.contentTypes],[[],[],[]]);
});

test('Card facets count the full collection and combine facets with AND',()=>{
  const cards=[{id:'a',tags:['t1'],categories:['c1']},{id:'b',tags:['t1'],categories:['c2']},{id:'c',tags:[],categories:['c1','gone']}];
  const known=new Set(['c1','c2']);
  const facet=buildFacet(cards,card=>card.categories,id=>known.has(id)?{name:id.toUpperCase()}:null,new Set(['c1']));
  assert.deepEqual(facet,[{name:'C1',id:'c1',count:2,selected:true},{name:'C2',id:'c2',count:1,selected:false}]);
  const filters=toggleFacet(new Map(),'view','c1');
  const visible=cards.filter(card=>matchesFacet(card.categories,filters.get('view'))&&matchesFacet(card.tags,new Set(['t1'])));
  assert.deepEqual(visible.map(card=>card.id),['a']);
  toggleFacet(filters,'view','c1');
  assert.equal(filters.get('view').size,0);
});
