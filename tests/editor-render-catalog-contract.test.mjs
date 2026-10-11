import test from 'node:test';
import assert from 'node:assert/strict';
import {createConfiguratorAPI} from '../src/configurator/configurator-api.mjs';
import {emptyStorageSnapshot} from '../src/configurator/configurator-storage.mjs';
import {getCreationSources} from '../src/configurator/creation-source-catalog.mjs';

globalThis.foundry ??= {applications:{api:{ApplicationV2:class {async _prepareContext(){return {}}},HandlebarsApplicationMixin:Base=>Base}}};
const {ConfiguratorEntryEditor}=await import('../src/configurator/configurator-entry-editor.mjs');
class Store{constructor(){this.data=emptyStorageSnapshot()}async load(){return structuredClone(this.data)}async save(value){this.data=structuredClone(value)}}

test('editor render reuses the detached Ruleset catalog without repeated whole-store list reads',async()=>{
 const api=await createConfiguratorAPI(new Store());
 const {versionId}=await api.createRuleset({id:'cached-read',nameKey:'Rules',version:'1'});
 await api.registerDefinitionType(versionId,{id:'type',key:'type',nameKey:'Type',color:null,fields:{},allowedCapabilities:[],defaultCapabilities:[],requiredCapabilities:[]});
 await api.createDefinition(versionId,{id:'def',key:'def',nameKey:'Definition',definitionTypeId:'type',capabilities:[],data:{}});
 const calls=[];
 const monitored=Object.fromEntries(Object.entries(api).map(([name,member])=>[name, name.startsWith('list')&&typeof member==='function' ? (...args)=>{calls.push(name);return member(...args)} : member]));
 const editor=new ConfiguratorEntryEditor({api:monitored,versionId,kind:'definition',id:'def'});
 const context=await editor._prepareContext({});
 assert.equal(context.data.nameKey,'Definition');
 assert.equal(context.definitionChoices.length,1);
 assert.equal(context.definitionChoices[0].colors,'#666666');
 assert.deepEqual(calls.filter(name=>name!=='listCapabilityTypes'&&name!=='listValueTypes'),[],`whole-store list lookups during editor render: ${calls.join(', ')}`);
 // Subsequent renders see the new catalog, never an obsolete instance cache.
 await api.createDefinition(versionId,{id:'next',key:'next',nameKey:'Next',definitionTypeId:'type',capabilities:[],data:{}});
 const renewed=await editor._prepareContext({});
 assert.equal(renewed.definitionChoices.length,2);
 assert.deepEqual(calls.filter(name=>name!=='listCapabilityTypes'&&name!=='listValueTypes'),[]);
});

test('Creation System source catalog accepts the render snapshot and preserves results',async()=>{
 const api=await createConfiguratorAPI(new Store());
 const {versionId}=await api.createRuleset({id:'sources-render',nameKey:'Rules',version:'1'});
 const record=api.getRulesetVersion(versionId);
 const baseline=getCreationSources(api,versionId);
 const cached=getCreationSources({/* should not be read with snapshot */},versionId,record.workingDraft);
 assert.deepEqual(cached,baseline);
});
