import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {COLLECTION_FIELDS} from '../src/configurator/configurator-schema.mjs';
import {COLLECTION_TO_KIND} from '../src/configurator/relation-contract.mjs';
import {listCreationSourceCollections,getCreationSources,getCreationSourceDescriptor} from '../src/configurator/creation-source-catalog.mjs';
import {createConfiguratorAPI} from '../src/configurator/configurator-api.mjs';
import {emptyStorageSnapshot} from '../src/configurator/configurator-storage.mjs';
import {planCreationSystem} from '../src/runtime/creation-plan.mjs';
import {renderChoiceGroupHTML} from '../src/ui/entry-editor-markup.mjs';

class Storage{
 constructor(){this.value=emptyStorageSnapshot()}
 async load(){return structuredClone(this.value)}
 async save(value){this.value=structuredClone(value)}
}

test('Creation sources are discovered from actual Ruleset arrays, without a static editor catalog or provider-name guessing',async()=>{
 const api=await createConfiguratorAPI(new Storage());
 const {versionId}=await api.createRuleset({id:'every-family',nameKey:'No game rules baked in',version:'1'});
 const draft=api.getRulesetVersion(versionId).workingDraft;
 const discovered=listCreationSourceCollections(draft);
 assert.deepEqual(discovered.map(entry=>entry.id),COLLECTION_FIELDS);
 for(const source of discovered)assert.equal(source.objectKind,COLLECTION_TO_KIND[source.id]);
 const sources=getCreationSources(api,versionId);
 assert.deepEqual(sources.map(source=>source.id),discovered.map(entry=>entry.id));
 assert.deepEqual(getCreationSources({},versionId,draft),sources);
 // The UI reflects the supplied Ruleset snapshot, not the global schema list.
 const scoped=structuredClone(draft);
 delete scoped.contentTypes;
 assert.equal(getCreationSources({},versionId,scoped).some(x=>x.id==='contentTypes'),false);
 // An arbitrary array is not a registered Ruleset collection.
 scoped.unknownArray=[{id:'not-an-object'}];
 assert.equal(getCreationSources({},versionId,scoped).some(x=>x.id==='unknownArray'),false);
 assert.throws(()=>getCreationSources({getRuleset:()=>null},versionId),/Ruleset document/);
});

test('Content Type in Creation System: UI source, storage, dependency protection, reload; no invented Runtime grant',async()=>{
 const store=new Storage();let api=await createConfiguratorAPI(store);
 const {versionId}=await api.createRuleset({id:'portable',nameKey:'Portable',version:'1'});
 await api.createContentType(versionId,{id:'sample-kind',nameKey:'Configurable content category',storageKind:'item',fields:{},color:'#224466'});
 await api.createCreationSystem(versionId,{id:'builder',nameKey:'Builder',steps:[{
   id:'choose-type',name:'Choose type',kind:'choice',min:1,max:1,required:true,
   source:{collection:'contentTypes',objectIds:['sample-kind'],externalMetadata:{kept:true}},otherMetadata:'untouched'
 }]});
 assert.deepEqual(getCreationSources(api,versionId).find(source=>source.id==='contentTypes').items,[{id:'sample-kind',label:'Configurable content category'}]);
 const status=api.getDeletionStatus(versionId,'sample-kind','contentType');
 assert.equal(status.canDelete,false);
 assert.ok(status.consumers.some(c=>c.path.includes('creationSystems')&&c.path.includes('source.objectIds')));
 await assert.rejects(()=>api.deleteContentType(versionId,'sample-kind'),/REFERENTIAL_INTEGRITY|dependency|used|referenc/i);
 api=await createConfiguratorAPI(store);
 const step=api.getCreationSystem(versionId,'builder').steps[0];
 assert.deepEqual(step.source,{collection:'contentTypes',objectIds:['sample-kind'],externalMetadata:{kept:true}});
 assert.equal(step.otherMetadata,'untouched');
 assert.throws(()=>planCreationSystem(api.getRuleset(versionId),'builder',{'choose-type':['sample-kind']}),/explicit runtime mapping/);
});

test('FR/EN Content Type source title and help distinguish category, model and effect',()=>{
 const fr=JSON.parse(readFileSync(new URL('../lang/fr.json',import.meta.url)));
 const en=JSON.parse(readFileSync(new URL('../lang/en.json',import.meta.url)));
 for(const locale of [fr,en])for(const collection of COLLECTION_FIELDS){
   for(const key of ['Label','Allowed','Help'])assert.ok(locale.RTA.CreationSource[collection]?.[key],`${collection}.${key}`);
 }
 const prior=globalThis.game;
 try{
   globalThis.game={i18n:{lang:'fr',localize:key=>key.split('.').reduce((value,name)=>value?.[name],fr)??key}};
   assert.equal(getCreationSourceDescriptor('contentTypes').label,'Types de contenu');
   assert.match(getCreationSourceDescriptor('contentTypes').help,/catégories de contenu/);
   globalThis.game={i18n:{lang:'en',localize:key=>key.split('.').reduce((value,name)=>value?.[name],en)??key}};
   assert.equal(getCreationSourceDescriptor('contentTypes').label,'Content types');
 }finally{globalThis.game=prior;}
});

test('Both acquisition choice renderers share the canonical two-column form row for operation and target',()=>{
 const fresh=renderChoiceGroupHTML({id:'choice-1',choices:'<div class="rta-picker__body rta-choice-list"></div>'});
 const saved=readFileSync(new URL('../templates/configurator/entry-editor.hbs',import.meta.url),'utf8');
 for(const html of [fresh,saved]){
   assert.match(html,/<div class="form-group rta-form-row"><label class="rta-form-row__label">[^<]*Operation/);
   assert.match(html,/<div class="form-group rta-form-row"><label class="rta-form-row__label">(?:[^<]*objects|\{\{localize "RTA.Relations.Target"\}\})/);
   assert.match(html,/data-choice-prop="operation"/);
   assert.match(html,/data-picker/);
 }
});
