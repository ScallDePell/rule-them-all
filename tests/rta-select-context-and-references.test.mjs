import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {formatEditorValue,parseEditorValue} from '../src/configurator/editor-value.mjs';
const source=readFileSync(new URL('../src/ui/rta-select.mjs',import.meta.url),'utf8');
const editor=readFileSync(new URL('../src/configurator/configurator-entry-editor.mjs',import.meta.url),'utf8');
const fieldModels=readFileSync(new URL('../src/configurator/entry-field-models.mjs',import.meta.url),'utf8');
const serializer=readFileSync(new URL('../src/configurator/entry-field-serialization.mjs',import.meta.url),'utf8');
const hbs=readFileSync(new URL('../templates/configurator/entry-editor.hbs',import.meta.url),'utf8');

test('required capabilities are shown separately from selectable optional capabilities',()=>{
  assert.match(hbs,/rta-config-entry__fixed-capabilities/);
  assert.match(hbs,/hasForcedCapabilities/);
  assert.match(hbs,/hasOptionalCapabilities/);
  assert.match(hbs,/class="rta-select__fixed-source" type="checkbox" name="cap:{{id}}" checked disabled/);
  assert.match(editor,/hasOptionalCapabilities=capabilityChoices\.some\(cap=>cap\.permitted&&!cap\.forced\)/);
});
test('reference many fields render native multiselect enhanced by the shared component',()=>{
  assert.equal((hbs.match(/\{\{#if isReferenceMany\}\}<select data-field-value multiple/g)||[]).length,2);
  assert.match(fieldModels,/isReferenceMany:field\.valueType==="reference"&&field\.cardinality==="many"/);
  assert.match(serializer,/\[\.\.\.\(input\?\.selectedOptions\?\?\[\]\)\]\.map\(option=>parseRefToken\(option\.value\)\)/);
  assert.match(source,/scan\('select:not\(\[data-rta-select-source\]\)'/);
});
test('structured references round trip safely without object Object coercion',()=>{
  const refs=[{objectKind:'definition',objectId:'jump'},{objectKind:'definition',objectId:'sneak'}];
  const text=formatEditorValue('reference','many',refs);
  assert.doesNotMatch(text,/\[object Object\]/);
  assert.deepEqual(parseEditorValue('reference','many',false,text),refs);
  assert.deepEqual(parseEditorValue('reference','one',false,formatEditorValue('reference','one',refs[0])),refs[0]);
  assert.throws(()=>parseEditorValue('reference','many',false,'[object Object]'),/valid JSON/);
});
test('pickers and unlabeled native selects use a canonical form row; only toolbars retain internal title',()=>{
  assert.match(source,/const replacement=nestedInRow\?root:formRow\(root,heading/);
  assert.match(source,/if\(addFormRow\)native\.parentNode\.insertBefore\(formRow\(root/);
  assert.match(source,/if\(!compactOperand&&!hasLabel&&!addFormRow\)RTASelect\.#attachLabel/);
  assert.match(source,/if\(title\)this\.host\.prepend\(title\)/);
  assert.match(source,/this\.history=this\.#selected\(\)\.map\(input=>input\.value\)/);
});

test('real Definition editor context resolves existing reference arrays to checked named choices',async()=>{
  globalThis.foundry??={applications:{api:{ApplicationV2:class {async _prepareContext(){return {}}},HandlebarsApplicationMixin:Base=>Base}}};
  const {ConfiguratorEntryEditor}=await import('../src/configurator/configurator-entry-editor.mjs');
  const {createConfiguratorAPI}=await import('../src/configurator/configurator-api.mjs');
  const {emptyStorageSnapshot}=await import('../src/configurator/configurator-storage.mjs');
  class Storage{constructor(){this.value=emptyStorageSnapshot();}async load(){return structuredClone(this.value);}async save(v){this.value=structuredClone(v);}}
  const api=await createConfiguratorAPI(new Storage());
  const {versionId}=await api.createRuleset({id:'reference-roundtrip',nameKey:'R',version:'1'});
  await api.registerDefinitionType(versionId,{id:'skilltype',key:'skilltype',nameKey:'Skills',fields:{unlocked:{id:'unlocked',name:'Compétences débloquées',valueType:'reference',cardinality:'many',required:false,nullable:false,referenceTarget:{objectKind:'definition'}}},allowedCapabilities:[],defaultCapabilities:[],requiredCapabilities:[]});
  await api.createDefinition(versionId,{id:'jump',key:'jump',nameKey:'Saut',definitionTypeId:'skilltype',capabilities:[],data:{}});
  await api.createDefinition(versionId,{id:'sneak',key:'sneak',nameKey:'Discrétion',definitionTypeId:'skilltype',capabilities:[],data:{}});
  await api.createDefinition(versionId,{id:'learner',key:'learner',nameKey:'Apprenant',definitionTypeId:'skilltype',capabilities:[],data:{unlocked:[{objectKind:'definition',objectId:'jump'},{objectKind:'definition',objectId:'sneak'}]}});
  const editor=new ConfiguratorEntryEditor({api,versionId,kind:'definition',id:'learner'});
  const ctx=await editor._prepareContext({});
  const field=ctx.fieldContract.find(entry=>entry.id==='unlocked');
  assert.equal(field.isReferenceMany,true);
  assert.equal(field.isMany,false);
  assert.equal(field.referenceChoices.find(entry=>entry.label==='Saut')?.selected,true);
  assert.equal(field.referenceChoices.find(entry=>entry.label==='Discrétion')?.selected,true);
  assert.doesNotMatch(JSON.stringify(field),/\[object Object\]/);
});
