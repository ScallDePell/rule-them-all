import {fakeAcquire} from './helpers/fake-acquire.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createConfiguratorAPI} from '../src/configurator/configurator-api.mjs';
import {emptyStorageSnapshot} from '../src/configurator/configurator-storage.mjs';
import {normalizeRelations,relationCatalog,collectRelationRows,resolveRulesetRelations} from '../src/configurator/generic-relations.mjs';
import {refToken} from '../src/configurator/reference-token.mjs';
import {collectTemplateAcquisitions} from '../src/configurator/content-template-form.mjs';
import {ContentGrantHandlers} from '../src/runtime/content-relations.mjs';
import {FoundryContentBridge} from '../src/runtime/foundry-content-bridge.mjs';

class Storage{snapshot=emptyStorageSnapshot();async load(){return structuredClone(this.snapshot)}async save(x){this.snapshot=structuredClone(x)}}
class ActorMock{constructor(){this.uuid='Actor.generic';this.documentName='Actor';this.flags={};}getFlag(scope,key){return this.flags[scope]?.[key]}async setFlag(scope,key,value){(this.flags[scope]??={})[key]=structuredClone(value)}}
async function rules(){
 const storage=new Storage(),api=await createConfiguratorAPI(storage);
 const v=(await api.createRuleset({id:'test-ruleset',nameKey:'Neutral Ruleset',version:'1.0.0'})).versionId;
 await api.registerDefinitionType(v,{id:'t',key:'t',nameKey:'Type',allowedCapabilities:[],defaultCapabilities:[],requiredCapabilities:[],fields:{}});
 await api.createDefinition(v,{id:'d',key:'d',nameKey:'Definition',definitionTypeId:'t',capabilities:[],data:{}});
 await api.createAction(v,{id:'a',nameKey:'Action',conditionRefs:[],costEffectRefs:[],effectRefs:[]});
 await api.createContentType(v,{id:'ct',nameKey:'Type de contenu',storageKind:'item',runtimeMode:'unique'});
 await api.createContentTemplate(v,{id:'linked',nameKey:'Linked Content',contentTypeId:'ct'});
 await api.createContentTemplate(v,{id:'selected',nameKey:'Selecting Content',contentTypeId:'ct'});
 return {storage,api,v};
}
const rel=(id,operation,objectKind,objectId,config={})=>({id,operation,targetRef:{objectKind,objectId},config});

test('all catalog families are schema-driven and not special-cased for Content/Definition',async()=>{
 const {api,v}=await rules();const catalog=relationCatalog(api.getRuleset(v));
 assert.ok(catalog.some(x=>x.objectKind==='contentTemplate'&&x.objectId==='linked'));
 assert.ok(catalog.some(x=>x.objectKind==='definition'&&x.objectId==='d'));
 assert.ok(catalog.some(x=>x.objectKind==='action'&&x.objectId==='a'));
 assert.equal(catalog.find(x=>x.objectKind==='contentTemplate')?.collection,'contentTemplates');
});

test('a generic relation survives editor readback, world storage and dependency checks',async()=>{
 const {storage,api,v}=await rules();
 const fake=(id,op,target,config='{}')=>({dataset:{relationId:id},querySelector(sel){
  const value=sel==='[data-relation-operation]'?op:sel==='[data-relation-target]'?refToken(target):sel==='[data-relation-config]'?config:null;
  return value===null?null:{value};
 }});
 const submitted=collectRelationRows([
  fake('relation-one','link',{objectKind:'contentTemplate',objectId:'linked'}),
  fake('relation-two','unlock',{objectKind:'action',objectId:'a'}),
  fake('relation-three','grant',{objectKind:'definition',objectId:'d'},'{"initial":{"value.base":0}}')
 ]);
 await api.updateContentTemplate(v,'selected',{...api.getContentTemplate(v,'selected'),relations:submitted});
 const fresh=await createConfiguratorAPI(storage);
 assert.deepEqual(fresh.getContentTemplate(v,'selected').relations,submitted);
 const deps=fresh.listDependencies(v);
 for(const r of submitted)assert.ok(deps.some(e=>e.targetRef.objectKind===r.targetRef.objectKind&&e.targetRef.objectId===r.targetRef.objectId&&e.consumerRef.objectId==='selected'),JSON.stringify(r));
 assert.equal(fresh.getDeletionStatus(v,'linked','contentTemplate').canDelete,false);
 await assert.rejects(()=>fresh.deleteContentTemplate(v,'linked'),/referenced/i);
});

test('missing targets, invalid operations and duplicate relation IDs are rejected',async()=>{
 const {api,v}=await rules();
 const snap=api.getRuleset(v);
 assert.throws(()=>normalizeRelations([rel('x','link','contentTemplate','missing')],{ruleset:snap}),/missing target/);
 assert.throws(()=>normalizeRelations([rel('x','give','action','a')]),/supported operation/);
 assert.throws(()=>normalizeRelations([rel('x','link','action','a'),rel('x','unlock','definition','d')]),/Duplicate/);
 await assert.rejects(()=>api.updateContentTemplate(v,'selected',{...api.getContentTemplate(v,'selected'),relations:[rel('x','link','action','missing')]}),/invalid Ruleset/i);
});

test('generic choice options across Content/Definition/Action are serialized without family switch',async()=>{
 const {api,v}=await rules();
 const targets=[{objectKind:'contentTemplate',objectId:'linked'},{objectKind:'definition',objectId:'d'},{objectKind:'action',objectId:'a'}];
 const row={dataset:{choiceGroup:'choices'},querySelector(sel){
   return sel.includes('name')?{value:'One choice'}:sel.includes('min')||sel.includes('max')?{value:'1'}:sel.includes('operation')?{value:'unlock'}:sel.includes('choiceTargetRef')?{value:refToken(targets[0])}:null;
  },querySelectorAll(sel){return sel.includes('choiceTargetRef')?targets.map(ref=>({value:refToken(ref)})):[];}};
 const out=collectTemplateAcquisitions({current:{},choiceRows:[row]});
 assert.equal(out.choiceGroups.length,1);
 assert.equal(out.choiceGroups[0].options.length,3);
 assert.deepEqual(out.choiceGroups[0].options.map(x=>x.targetRef.objectKind),['contentTemplate','definition','action']);
 await api.updateContentTemplate(v,'selected',{...api.getContentTemplate(v,'selected'),choiceGroups:out.choiceGroups});
 assert.deepEqual(api.getContentTemplate(v,'selected').choiceGroups,out.choiceGroups);
});

test('Content runtime treats link, unlock and grant as separate semantics; release removes entitlement',async()=>{
 const {api,v}=await rules();
 const actor=new ActorMock(),calls=[];
 const runtime={acquire:fakeAcquire,adapter:{resolveDocument:async()=>actor,canWrite:async()=>true},
  getContainerState:async()=>({rulesetVersionId:v,definitionStates:{}}),
  instantiateDefinition:async(_v,_uuid,id,{initial})=>calls.push({id,initial}),removeDefinitionState:async()=>{}};
 await api.updateContentTemplate(v,'selected',{...api.getContentTemplate(v,'selected'),relations:[
  rel('l','link','contentTemplate','linked'),rel('u','unlock','contentTemplate','linked'),
  rel('g','grant','definition','d',{initial:{'value.base':0}}),rel('a','grant','action','a')
 ]});
 await api.publishRuleset(v);
 const bridge=new FoundryContentBridge(api,runtime,{hooks:null});
 const acq=await bridge.acquireTemplate(v,actor.uuid,'selected',{sourceItemId:'demo'});
 assert.deepEqual(calls,[{id:'d',initial:{'value.base':0}}]);
 assert.deepEqual(acq.actionIds,['a']);
 assert.deepEqual(await bridge.listUnlockedReferences(v,actor.uuid),[{objectKind:'contentTemplate',objectId:'linked'}]);
 assert.deepEqual(await bridge.listLinkedReferences(v,actor.uuid),[{objectKind:'contentTemplate',objectId:'linked'}]);
 await bridge.releaseAcquisition(actor.uuid,'demo');
 assert.deepEqual(await bridge.listUnlockedReferences(v,actor.uuid),[]);
 assert.deepEqual(await bridge.listLinkedReferences(v,actor.uuid),[]);
});

test('grant for an arbitrary Ruleset family persists an entitlement without inventing side effects',async()=>{
 const {api,v}=await rules();const actor=new ActorMock(),calls=[];
 await api.updateContentTemplate(v,'selected',{...api.getContentTemplate(v,'selected'),relations:[rel('bad','grant','contentTemplate','linked')]});
 const runtime={acquire:fakeAcquire,adapter:{resolveDocument:async()=>actor,canWrite:async()=>true},getContainerState:async()=>({definitionStates:{}}),instantiateDefinition:async()=>calls.push('changed')};
 await api.publishRuleset(v);
 const bridge=new FoundryContentBridge(api,runtime,{hooks:null});
 await bridge.acquireTemplate(v,actor.uuid,'selected',{sourceItemId:'demo'});
 assert.deepEqual(await bridge.listGrantedReferences(v,actor.uuid),[{objectKind:'contentTemplate',objectId:'linked'}]);
 assert.equal(await bridge.hasGrantedReference(v,actor.uuid,{objectKind:'contentTemplate',objectId:'linked'}),true);
 assert.deepEqual(calls,[],'a logical entitlement must not silently instantiate Content or other states');
 await bridge.releaseAcquisition(actor.uuid,'demo');
 assert.equal(await bridge.hasGrantedReference(v,actor.uuid,{objectKind:'contentTemplate',objectId:'linked'}),false);
});

test('historical choice metadata and initial Definition values survive migration to typed generic choices',()=>{
 const current={choiceGroups:[{id:'group',name:'Group',min:1,max:1,options:[{
  id:'old',kind:'definition',definitionId:'d',initial:{'value.base':3},labelKey:'custom',customProperty:'retained'
 }]}]};
 const target={objectKind:'definition',objectId:'d'};
 const row={dataset:{choiceGroup:'group'},querySelector(selector){
  if(selector.includes('"operation"'))return {value:'grant'};
  if(selector.includes('"name"'))return {value:'Group'};
  if(selector.includes('"min"')||selector.includes('"max"'))return {value:'1'};
  if(selector.includes('choiceTargetRef'))return {value:refToken(target)};
  return null;
 },querySelectorAll(selector){return selector.includes('choiceTargetRef')?[{value:refToken(target)}]:[]}};
 const result=collectTemplateAcquisitions({current,choiceRows:[row]});
 assert.deepEqual(result.choiceGroups[0].options,[{
  id:'old',labelKey:'custom',customProperty:'retained',operation:'grant',targetRef:target,config:{initial:{'value.base':3}}
 }]);
});

test('the same typed reference model persists on independent non-Content families',async()=>{
 const {storage,api,v}=await rules();
 const owned=rel('on-definition','link','action','a');
 const subject=rel('on-action','link','definition','d');
 await api.updateDefinition(v,'d',{relations:[owned]});
 await api.updateAction(v,'a',{relations:[subject]});
 const fresh=await createConfiguratorAPI(storage);
 assert.deepEqual(fresh.getDefinition(v,'d').relations,[owned]);
 assert.deepEqual(fresh.getAction(v,'a').relations,[subject]);
 assert.equal(fresh.getDeletionStatus(v,'a','action').canDelete,false);
 assert.equal(fresh.getDeletionStatus(v,'d','definition').canDelete,false);
});

test('disabled historical relation targets stay visible in the catalog so edits cannot erase them',async()=>{
 const {api,v}=await rules();
 await api.updateAction(v,'a',{enabled:false});
 const catalog=relationCatalog(api.getRuleset(v));
 assert.ok(catalog.some(target=>target.objectKind==='action'&&target.objectId==='a'));
});

test('a group with historically mixed per-option operations keeps them when saved unchanged',()=>{
 const old={choiceGroups:[{id:'mixed',name:'Mixed',min:0,max:2,options:[
  rel('one','link','definition','d'),rel('two','unlock','action','a')
 ]}]};
 const refs=[{objectKind:'definition',objectId:'d'},{objectKind:'action',objectId:'a'}];
 const row={dataset:{choiceGroup:'mixed',choiceInitialOperation:'link'},querySelector(selector){
  if(selector.includes('"operation"'))return {value:'link'};
  if(selector.includes('"name"'))return {value:'Mixed'};
  if(selector.includes('"min"'))return {value:'0'};
  if(selector.includes('"max"'))return {value:'2'};
  if(selector.includes('choiceTargetRef'))return {value:refToken(refs[0])};
  return null;
 },querySelectorAll(selector){return selector.includes('choiceTargetRef')?refs.map(ref=>({value:refToken(ref)})):[]}};
 const saved=collectTemplateAcquisitions({current:old,choiceRows:[row]});
 assert.deepEqual(saved.choiceGroups[0].options.map(x=>x.operation),['link','unlock']);
 row.querySelector=selector=>selector.includes('"operation"')?{value:'grant'}:selector.includes('"name"')?{value:'Mixed'}:selector.includes('"min"')?{value:'0'}:selector.includes('"max"')?{value:'2'}:null;
 const changed=collectTemplateAcquisitions({current:old,choiceRows:[row]});
 assert.deepEqual(changed.choiceGroups[0].options.map(x=>x.operation),['grant','grant']);
});


test('readback guard detects silently changed operation even when target ID survives',async()=>{
 const {assertPersistedRelations}=await import('../src/configurator/relation-persistence.mjs');
 const submitted={id:'selected',relations:[rel('r','unlock','contentTemplate','linked')]};
 const overwritten={id:'selected',relations:[rel('r','grant','contentTemplate','linked')]};
 assert.throws(()=>assertPersistedRelations('contentTemplate',submitted,overwritten),error=>error?.code==='RELATION_PERSISTENCE_MISMATCH');
 assert.equal(assertPersistedRelations('contentTemplate',submitted,structuredClone(submitted)),true);
});


test('generic reference resolution traverses non-Content families after storage reload',async()=>{
 const {storage,api,v}=await rules();
 await api.updateDefinition(v,'d',{relations:[rel('dep','link','action','a')]});
 const fresh=await createConfiguratorAPI(storage);
 const resolved=resolveRulesetRelations(fresh.getRuleset(v),{objectKind:'definition',objectId:'d'});
 assert.equal(resolved.length,1);
 assert.equal(resolved[0].targetCollection,'actions');
 assert.equal(resolved[0].target.nameKey,'Action');
 assert.equal(resolved[0].relation.operation,'link');
 assert.equal(resolveRulesetRelations(fresh.getRuleset(v),{objectKind:'definition',objectId:'d'},{operation:'grant'}).length,0);
});
