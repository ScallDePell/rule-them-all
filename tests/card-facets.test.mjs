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

test('a Ruleset has no Categories any more: their tags do that job, and a stored categories list is refused until converted',async()=>{
  const {api,v}=await setup();
  assert.equal(api.createCategory,undefined);
  await assert.rejects(()=>api.createDefinition(v,{id:'spell',key:'spell',definitionTypeId:'kind',nameKey:'Spell',descriptionKey:'',data:{},categories:['magic'],enabled:true,order:0,tags:[]}),/Unsupported field: categories/);
  await api.createTag(v,{id:'magic',nameKey:'Magic'});
  await api.createDefinition(v,{id:'spell',key:'spell',definitionTypeId:'kind',nameKey:'Spell',descriptionKey:'',data:{},enabled:true,order:0,tags:['magic']});
  assert.deepEqual(api.getConsumers(v,'magic','tag').map(edge=>edge.consumerRef?.objectId),['spell']);
});

test('Loading a Ruleset never invents Tags or Content Types from entry strings',()=>{
  const ruleset=normalizeRulesetCollections({id:'old',nameKey:'Old',version:'1',definitions:[{id:'a',tags:['x']}],contentTemplates:[{id:'t',contentTypeId:'gear',tags:['loot']}]});
  assert.deepEqual([ruleset.tags,ruleset.contentTypes],[[],[]]);
});

test('Card facets count the full collection and combine selections with AND',()=>{
  const cards=[{id:'a',tags:['t1','c1']},{id:'b',tags:['t1','c2']},{id:'c',tags:['c1','gone']}];
  const known=new Set(['t1','c1','c2']);
  const facet=buildFacet(cards,card=>card.tags,id=>known.has(id)?{name:id.toUpperCase()}:null,new Set(['c1']));
  assert.deepEqual(facet,[{name:'C1',id:'c1',count:2,selected:true},{name:'T1',id:'t1',count:2,selected:false},{name:'C2',id:'c2',count:1,selected:false}]);
  const filters=toggleFacet(new Map(),'view','c1');
  const visible=cards.filter(card=>matchesFacet(card.tags,filters.get('view'))&&matchesFacet(card.tags,new Set(['t1'])));
  assert.deepEqual(visible.map(card=>card.id),['a']);
  toggleFacet(filters,'view','c1');
  assert.equal(filters.get('view').size,0);
});

test('a Tag shows its own color even where its section does not allow custom colors', async () => {
  const {objectColor} = await import('../src/configurator/ruleset-colors.mjs');
  const ruleset = {sectionColors: {organization: '#445566', definitions: '#112233'}, sectionColorOverrides: {}};
  assert.equal(objectColor(ruleset, 'tags', {color: '#aa0000'}), '#aa0000');
  assert.equal(objectColor(ruleset, 'tags', {color: null}), '#445566');
  assert.equal(objectColor(ruleset, 'definitionTypes', {color: '#aa0000'}), '#112233', 'a type still needs its section to allow it');
});
