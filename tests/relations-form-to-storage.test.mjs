import test from 'node:test';
import assert from 'node:assert/strict';
import {createConfiguratorAPI} from '../src/configurator/configurator-api.mjs';
import {emptyStorageSnapshot} from '../src/configurator/configurator-storage.mjs';
import {collectEntryData} from '../src/configurator/entry-data-collector.mjs';
import {collectCrossFamilyRelations,COLLECTION_TO_KIND} from '../src/configurator/relation-contract.mjs';
import {refToken} from '../src/configurator/reference-token.mjs';

class Storage{
  snapshot=emptyStorageSnapshot();listeners=new Set();
  async load(){return structuredClone(this.snapshot);}
  async save(data){this.snapshot=structuredClone(data);for(const f of this.listeners)f(this.snapshot);}
  subscribe(f){this.listeners.add(f);return()=>this.listeners.delete(f);}
}
const input=(value='',checked=false)=>({value,checked});
const token=(objectKind,objectId)=>refToken({objectKind,objectId});
function choiceRow(id,selected=[],metadata={}){
  return {dataset:{choiceGroup:id},querySelector(selector){
    const key=selector.match(/data-choice-prop="([^"]+)"/)?.[1];
    return key?input(({name:'Choose one',min:'1',max:'1',operation:'grant',...metadata})[key]):null;
  },querySelectorAll(selector){
    return selector.includes('choiceTargetRef')?selected.map(value=>input(value,true)):[];
  }};
}
function collectTemplate(current,{choiceRows=[],other={}}={}){
  const values={nameKey:current.nameKey,descriptionKey:current.descriptionKey,contentTypeId:current.contentTypeId,runtimeMode:current.runtimeMode??'unique',...other};
  return collectEntryData('contentTemplate',{
    fd:{get:key=>Object.hasOwn(values,key)?values[key]:null},current,
    bool:key=>key==='enabled',
    checkedIds:()=>[],
    queryOne:()=>null,
    queryAll:selector=>({'[data-choice-group]':choiceRows,'[data-definition-field]':[]})[selector]??[],
    uid:kind=>`${kind}-generated`,fieldUid:()=> 'field-generated'
  });
}

test('cross-family collection-kind mapping follows the actual schema',()=>{
  assert.equal(COLLECTION_TO_KIND.definitionTypes,'definitionType');
  assert.equal(COLLECTION_TO_KIND.contentTemplates,'contentTemplate');
  assert.equal(COLLECTION_TO_KIND.permissionPolicies,'permissionPolicy');
  assert.equal(COLLECTION_TO_KIND.sheetDefinitions,'sheetDefinition');
});

test('form selection -> API save -> storage reload -> saved selection -> dependencies -> deletion protection',async()=>{
  const storage=new Storage();let api=await createConfiguratorAPI(storage);
  const v=(await api.createRuleset({id:'generic-world',nameKey:'Generic World',version:'1.0.0'})).versionId;
  await api.registerDefinitionType(v,{id:'type',key:'type',nameKey:'Type',order:0,allowedCapabilities:[],defaultCapabilities:[],requiredCapabilities:[],fields:{},constraints:[]});
  await api.createDefinition(v,{id:'def-1',key:'def-1',definitionTypeId:'type',nameKey:'Definition One',data:{},capabilities:[],enabled:true,order:1,tags:[]});
  await api.createAction(v,{id:'act-1',nameKey:'Action One',conditionRefs:[],costEffectRefs:[],effectRefs:[],enabled:true,order:1,tags:[]});
  await api.createContentType(v,{id:'type-content',nameKey:'Content Type',storageKind:'item',runtimeMode:'unique',fields:{},enabled:true,order:1,tags:[]});
  const relations=[{id:'grant-def',operation:'grant',targetRef:{objectKind:'definition',objectId:'def-1'},config:{initial:{'value.base':7}}}];
  await api.createContentTemplate(v,{id:'template-1',nameKey:'Content One',contentTypeId:'type-content',relations,choiceGroups:[],enabled:true,order:1,tags:[]});
  const previous=api.getContentTemplate(v,'template-1');
  const picks=[token('definition','def-1'),token('action','act-1')];
  const form=collectTemplate(previous,{choiceRows:[choiceRow('choice-1',picks,{min:'1',max:'2'})]});
  assert.deepEqual(form.relations,relations,'relations edited elsewhere must not be silently erased');
  await api.updateContentTemplate(v,'template-1',form);
  await api.createCreationSystem(v,{id:'creator',nameKey:'Creator',enabled:true,order:1,steps:[{id:'choose',name:'Choose',kind:'content',required:true,min:1,max:1,source:{collection:'contentTemplates',objectIds:['template-1']}}]});
  api=await createConfiguratorAPI(storage);
  const reopened=api.getContentTemplate(v,'template-1');
  assert.deepEqual(reopened.relations,relations);
  assert.deepEqual(reopened.choiceGroups[0].options.map(x=>[x.operation,x.targetRef.objectKind,x.targetRef.objectId]),[['grant','definition','def-1'],['grant','action','act-1']]);
  const deps=api.listDependencies(v);
  assert.ok(deps.some(x=>x.consumerRef.objectId==='creator'&&x.targetRef.objectKind==='contentTemplate'&&x.targetRef.objectId==='template-1'));
  assert.ok(deps.some(x=>x.consumerRef.objectId==='def-1'&&x.targetRef.objectKind==='definitionType'&&x.targetRef.objectId==='type'));
  assert.ok(deps.some(x=>x.consumerRef.objectId==='template-1'&&x.path.includes('.relations[')&&x.targetRef.objectId==='def-1'));
  assert.ok(deps.some(x=>x.consumerRef.objectId==='template-1'&&x.path.includes('.choiceGroups[')&&x.targetRef.objectId==='act-1'));
  assert.equal(api.getDeletionStatus(v,'template-1','contentTemplate').canDelete,false);
  assert.equal(api.getDeletionStatus(v,'def-1','definition').canDelete,false);
  await assert.rejects(()=>api.deleteContentTemplate(v,'template-1'),/still referenced/i);
  await assert.rejects(()=>api.deleteDefinition(v,'def-1'),/still referenced/i);
  await assert.rejects(()=>api.deleteAction(v,'act-1'),/still referenced/i);
  // Reopening the saved form and saving without changing those selections
  // must preserve identity, choice metadata and relations.
  const unchanged=collectTemplate(reopened,{choiceRows:[choiceRow('choice-1',picks,{min:'1',max:'2'})]});
  await api.updateContentTemplate(v,'template-1',unchanged);
  assert.deepEqual(api.getContentTemplate(v,'template-1').choiceGroups,reopened.choiceGroups);
  assert.deepEqual(api.getContentTemplate(v,'template-1').relations,reopened.relations);
});

test('saved nested logical reference protects its target even inside an extensible generic collection',async()=>{
  const storage=new Storage();const api=await createConfiguratorAPI(storage);
  const v=(await api.createRuleset({id:'portable',nameKey:'Portable',version:'1.0.0'})).versionId;
  await api.createParameter(v,{id:'p',nameKey:'P',valueType:'number',value:12,enabled:true,order:0,tags:[]});
  await api.createPermissionPolicy(v,{id:'policy',nameKey:'Policy',scope:{objectKind:'parameter',objectId:'p'},rules:[],defaultEffect:'DENY',enabled:true,order:0,tags:[]});
  const edges=collectCrossFamilyRelations(api.getRuleset(v));
  assert.ok(edges.some(x=>x.consumerRef.objectId==='policy'&&x.targetRef.objectId==='p'));
  await assert.rejects(()=>api.deleteParameter(v,'p'),/still referenced/i);
});

test('invalid Creation System source references cannot be saved as dangling strings',async()=>{
  const storage=new Storage();const api=await createConfiguratorAPI(storage);
  const v=(await api.createRuleset({id:'portable',nameKey:'Portable',version:'1.0.0'})).versionId;
  await assert.rejects(()=>api.createCreationSystem(v,{id:'creator',nameKey:'Creator',enabled:true,steps:[{id:'choose',name:'Choose',kind:'choice',source:{collection:'definitions',objectIds:['missing']}}]}),/Dependency target does not exist/);
});

test('generic readback guard detects dropped UI references after a claimed save',async()=>{
 const {assertPersistedRelations}=await import('../src/configurator/relation-persistence.mjs');
 const submitted={id:'c',nameKey:'Content',contentTypeId:'type',relations:[{id:'b',operation:'grant',targetRef:{objectKind:'action',objectId:'action'}}],choiceGroups:[]};
 const saved=structuredClone(submitted);
 assert.equal(assertPersistedRelations('contentTemplate',submitted,saved),true);
 saved.relations=[];
 assert.throws(()=>assertPersistedRelations('contentTemplate',submitted,saved),error=>error?.code==='RELATION_PERSISTENCE_MISMATCH');
 assert.throws(()=>assertPersistedRelations('contentTemplate',submitted,null),/readback/);
});
