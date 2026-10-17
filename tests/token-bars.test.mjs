import test from 'node:test';
import assert from 'node:assert/strict';
import {createConfiguratorAPI} from '../src/configurator/configurator-api.mjs';
import {emptyStorageSnapshot} from '../src/configurator/configurator-storage.mjs';
import {MemoryRuntimeAdapter} from '../src/runtime/memory-runtime-adapter.mjs';
import {RuntimeEngine} from '../src/runtime/runtime-engine.mjs';
import {tokenBarAttributes, tokenBarValue} from '../src/runtime/token-bars.mjs';
import {installTokenBars} from '../src/runtime/foundry-token-bars.mjs';
class Storage{constructor(){this.value=emptyStorageSnapshot();}async load(){return structuredClone(this.value)}async save(v){this.value=structuredClone(v)}}
const ref=(objectId,capabilityId,outputId,slotId)=>({objectKind:'definition',objectId,capabilityId,...(slotId?{slotId}:{}),outputId});

async function setup(){
  const api=await createConfiguratorAPI(new Storage());
  const v=(await api.createRuleset({id:'bars',nameKey:'Bars',version:'1'})).versionId;
  await api.registerDefinitionType(v,{id:'trait',key:'trait',nameKey:'Trait',descriptionKey:'',color:null,order:10,allowedCapabilities:['value'],defaultCapabilities:['value'],requiredCapabilities:[],fields:{},constraints:[]});
  await api.registerDefinitionType(v,{id:'body',key:'body',nameKey:'Body',descriptionKey:'',color:null,order:20,allowedCapabilities:['pool'],defaultCapabilities:['pool'],requiredCapabilities:[],fields:{},constraints:[]});
  await api.createDefinition(v,{id:'might',key:'might',definitionTypeId:'trait',nameKey:'Might',descriptionKey:'',data:{},capabilities:['value'],enabled:true,order:10,tags:[]});
  await api.createDefinition(v,{id:'sanity',key:'sanity',definitionTypeId:'trait',nameKey:'Sanity',descriptionKey:'',data:{},capabilities:['value'],valueBounds:{minimum:{literal:0},maximum:{literal:99}},enabled:true,order:11,tags:[]});
  await api.createFormula(v,{id:'twice-might',nameKey:'Twice might',resultType:'number',expression:{type:'multiply',args:[{type:'literal',value:2},{type:'reference',reference:ref('might','value','value.final')}]}});
  await api.createDefinition(v,{id:'hero',key:'hero',definitionTypeId:'body',nameKey:'Health',descriptionKey:'',data:{},capabilities:['pool'],slots:{pool:[{id:'hp',name:'Hit points',minimum:{literal:0},maximum:{formulaRef:'twice-might'}}]},enabled:true,order:0,tags:[]});
  await api.publishRuleset(v);
  const engine=new RuntimeEngine({configurator:api,adapter:new MemoryRuntimeAdapter(),hooks:null}),actor={kind:'actor',id:'a'};
  await engine.initializeContainer(v,actor,{initialByDefinition:{might:{'value.base':4},sanity:{'value.base':60}}});
  return {engine,v,actor};
}

test('pool slots and bounded values are offered as token bars, unbounded values are not', async () => {
  const {engine,v}=await setup();
  assert.deepEqual(tokenBarAttributes(engine.ruleset(v)).map(bar=>bar.attribute).sort(),['rta.hero.hp','rta.sanity']);
});

test('a bar shows the current value and the maximum, recomputed from its Formula', async () => {
  const {engine,v,actor}=await setup();
  assert.deepEqual(await tokenBarValue(engine,v,actor,'rta.hero.hp'),{value:8,max:8});
  assert.deepEqual(await tokenBarValue(engine,v,actor,'rta.sanity'),{value:60,max:99});
  assert.equal(await tokenBarValue(engine,v,actor,'rta.might'),null);
  assert.equal(await tokenBarValue(engine,v,{kind:'actor',id:'nobody'},'rta.hero.hp'),null);
});

test('Foundry tokens read the Ruleset bar, then redraw once computed', async () => {
  class TokenDocument { getBarAttribute() { return {type: 'bar', attribute: 'system.hp', value: 1, max: 2}; }
    static getTrackedAttributes() { return {bar: [['system', 'hp']], value: []}; }
    static getTrackedAttributeChoices(tracked) { return tracked.bar.map(path => ({group: 'Attributes', value: path.join('.'), label: path.join('.')})); } }
  const hooks = {on() {}}, redrawn = [];
  const actor = {uuid: 'Actor.a', getActiveTokens: () => [token]};
  const token = {document: {bar1: {attribute: 'rta.hero.hp'}}, renderFlags: {set: flags => redrawn.push(flags)}};
  const runtime = {tokenBarValue: async () => ({value: 3, max: 8}), tokenBarAttributes: () => [{attribute: 'rta.hero.hp', nameKey: 'Health', slotName: 'Hit points'}]};
  const game = {ruleThemAll: {runtime, configurator: {getActiveVersionId: () => 'v1'}}, i18n: {localize: key => key}};
  const bars = installTokenBars({TokenDocumentClass: TokenDocument, hooks, game});
  const doc = Object.assign(new TokenDocument(), {actor, bar1: {attribute: 'rta.hero.hp'}, bar2: {attribute: 'system.hp'}});
  assert.equal(doc.getBarAttribute('bar1'), null, 'nothing until computed');
  await bars.refresh(actor);
  assert.deepEqual(doc.getBarAttribute('bar1'), {type: 'bar', attribute: 'rta.hero.hp', value: 3, max: 8, editable: false});
  assert.equal(doc.getBarAttribute('bar2').attribute, 'system.hp', 'a system bar is left to Foundry');
  assert.ok(redrawn.some(flags => flags.refreshBars));
  const tracked = TokenDocument.getTrackedAttributes({});
  assert.deepEqual(tracked.bar, [['system', 'hp'], ['rta', 'hero', 'hp']]);
  assert.deepEqual(TokenDocument.getTrackedAttributeChoices(tracked).at(-1), {group: "Rule Them'All", value: 'rta.hero.hp', label: 'Health (Hit points)'});
});
