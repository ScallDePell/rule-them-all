import test from 'node:test';
import assert from 'node:assert/strict';

// The actual list renderer is imported with a tiny ApplicationV2 substitute;
// this test does not pretend to run Foundry or its app lifecycle.
globalThis.foundry??={applications:{api:{ApplicationV2:class {async _prepareContext(){return {}}},HandlebarsApplicationMixin:Base=>Base}}};
const {renderChoiceListBody}=await import('../src/configurator/configurator-entry-editor.mjs');

test('type selector renders a framed, searchable, safe checkbox list',()=>{
  const html=renderChoiceListBody([{id:'attribute',label:'Characteristics'},{id:'skill',label:'Skills & abilities'},{id:'inject',label:'<script>alert(1)</script>'}],{selected:['attribute']});
  assert.match(html,/class="rta-picker__body rta-choice-list"/);
  assert.match(html,/type="search" data-picker-filter/);
  assert.match(html,/value="attribute" checked/);
  assert.match(html,/Skills &amp; abilities/);
  assert.doesNotMatch(html,/<script>/);
  assert.equal((html.match(/type="checkbox"/g)??[]).length,3);
});

test('actual Creation System editor renders the chosen source and its entries',async()=>{
  const {ConfiguratorEntryEditor}=await import('../src/configurator/configurator-entry-editor.mjs');
  const {createConfiguratorAPI}=await import('../src/configurator/configurator-api.mjs');
  const {emptyStorageSnapshot}=await import('../src/configurator/configurator-storage.mjs');
  class Storage{constructor(){this.value=emptyStorageSnapshot();}async load(){return structuredClone(this.value);}async save(v){this.value=structuredClone(v);}}
  const api=await createConfiguratorAPI(new Storage());
  const {versionId}=await api.createRuleset({id:'r',nameKey:'R',version:'1'});
  await api.registerDefinitionType(versionId,{id:'attributes',nameKey:'Attributes',key:'attributes',fields:{},allowedCapabilities:[],defaultCapabilities:[],requiredCapabilities:[]});
  await api.createDefinition(versionId,{id:'strength',nameKey:'Strength',key:'strength',definitionTypeId:'attributes',data:{},capabilities:[],tags:[]});
  await api.createCreationSystem(versionId,{id:'setup',nameKey:'Setup',steps:[{id:'s2',name:'Choose Strength',source:{collection:'definitions',objectIds:['strength']},min:1,max:1}]});
  const editor=new ConfiguratorEntryEditor({api,versionId,kind:'creationSystem',id:'setup'});
  const html=(await editor._prepareContext({})).creationStepRows[0].html;
  assert.match(html,/data-step-prop="sourceCollection"/);
  assert.match(html,/value="definitions" checked/);
  assert.match(html,/value="strength" checked/);
  assert.match(html,/Allowed Definitions/);
  assert.match(html,/checked > Strength<\/label>/);
  assert.doesNotMatch(html,/value="definitionTypes"/);
});
