import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {COLLECTION_FIELDS} from '../src/configurator/configurator-schema.mjs';
import {COLLECTION_TO_KIND} from '../src/configurator/relation-contract.mjs';
import {CREATION_SOURCE_COLLECTIONS,listCreationSourceCollections,getCreationSources,getCreationSourceDescriptor} from '../src/configurator/creation-source-catalog.mjs';
import {createConfiguratorAPI} from '../src/configurator/configurator-api.mjs';
import {emptyStorageSnapshot} from '../src/configurator/configurator-storage.mjs';
import {planCreationSystem} from '../src/runtime/creation-plan.mjs';
import {renderChoiceGroupHTML} from '../src/ui/entry-editor-markup.mjs';

class Storage{
 constructor(){this.value=emptyStorageSnapshot()}
 async load(){return structuredClone(this.value)}
 async save(value){this.value=structuredClone(value)}
}

test('Creation sources are the supported collections of the supplied Ruleset snapshot',async()=>{
 const api=await createConfiguratorAPI(new Storage());
 const {versionId}=await api.createRuleset({id:'every-family',nameKey:'No game rules baked in',version:'1'});
 const draft=api.getRulesetVersion(versionId).workingDraft;
 const discovered=listCreationSourceCollections(draft);
 assert.deepEqual(discovered.map(entry=>entry.id),CREATION_SOURCE_COLLECTIONS);
 for(const source of discovered)assert.equal(source.objectKind,COLLECTION_TO_KIND[source.id]);
 const sources=getCreationSources(api,versionId);
 assert.deepEqual(sources.map(source=>source.id),CREATION_SOURCE_COLLECTIONS);
 assert.deepEqual(getCreationSources({},versionId,draft),sources);
 const scoped=structuredClone(draft);
 delete scoped.contentTemplates;
 scoped.unknownArray=[{id:'not-an-object'}];
 assert.deepEqual(getCreationSources({},versionId,scoped).map(x=>x.id),['definitions']);
 assert.throws(()=>getCreationSources({getRuleset:()=>null},versionId),/Ruleset document/);
});

test('A stored source the runtime cannot apply is refused at planning, not offered in the editor',async()=>{
 const api=await createConfiguratorAPI(new Storage());
 const {versionId}=await api.createRuleset({id:'portable',nameKey:'Portable',version:'1'});
 await api.createContentType(versionId,{id:'sample-kind',nameKey:'Kind',storageKind:'item',fields:{},color:'#224466'});
 await api.createCreationSystem(versionId,{id:'builder',nameKey:'Builder',steps:[{id:'choose-type',name:'Choose type',kind:'choice',min:1,max:1,source:{collection:'contentTypes',objectIds:['sample-kind']}}]});
 assert.equal(getCreationSources(api,versionId).some(source=>source.id==='contentTypes'),false);
 await assert.rejects(()=>planCreationSystem(api.getRuleset(versionId),'builder',{'choose-type':['sample-kind']}),/explicit runtime mapping/);
});

test('FR/EN creation source titles exist for every supported collection',()=>{
 const fr=JSON.parse(readFileSync(new URL('../lang/fr.json',import.meta.url)));
 const en=JSON.parse(readFileSync(new URL('../lang/en.json',import.meta.url)));
 for(const locale of [fr,en])for(const collection of CREATION_SOURCE_COLLECTIONS){
   for(const key of ['Label','Allowed','Help'])assert.ok(locale.RTA.CreationSource[collection]?.[key],`${collection}.${key}`);
 }
 const prior=globalThis.game;
 try{
   globalThis.game={i18n:{lang:'fr',localize:key=>key.split('.').reduce((value,name)=>value?.[name],fr)??key}};
   assert.equal(getCreationSourceDescriptor('contentTemplates').label,'Modèles de contenu');
   globalThis.game={i18n:{lang:'en',localize:key=>key.split('.').reduce((value,name)=>value?.[name],en)??key}};
   assert.equal(getCreationSourceDescriptor('contentTemplates').label,'Content templates');
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
