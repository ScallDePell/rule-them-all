import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildFieldRow,buildEventFieldRow,buildDefinitionFieldModel} from '../src/configurator/entry-field-models.mjs';
import {collectFieldDefinitions,collectDefinitionData,collectEventPayloadFields} from '../src/configurator/entry-field-serialization.mjs';
import {collectEntryData} from '../src/configurator/entry-data-collector.mjs';
import {buildRuleReferenceChoices} from '../src/configurator/entry-reference-catalog.mjs';
import {prepareContentType} from '../src/configurator/rule-contracts.mjs';
import {resolveDocumentType} from '../src/core/system-document-types.mjs';
import {refToken} from '../src/configurator/reference-token.mjs';

function row(data,props={}){
  return {dataset:data,querySelector:selector=>{
    const key=selector.match(/\[data-(?:field|event-field)-prop="([^"]+)"\]/)?.[1]??selector;
    return Object.hasOwn(props,key)?props[key]:null;
  }};
}
const field=(id,props)=>row({fieldId:id},Object.fromEntries(Object.entries(props).map(([key,value])=>[key,typeof value==='object'?value:{value}])));
const input=(value,checked=false)=>({value,checked});
const deps=(values={},rows={})=>({
  fd:{get:name=>Object.hasOwn(values,name)?values[name]:null},
  current:{id:'record-1',nameKey:'Previous',enabled:true,customExtension:{source:'old'}},
  bool:name=>values[name]===true,
  checkedIds:name=>values[`ids:${name}`]??[],
  queryOne:()=>null,queryAll:selector=>rows[selector]??[],
  capabilityTypes:[],collectFormulaExpression:x=>x,collectConditionExpression:x=>x,collectCreation:()=>({}),
  uid:k=>`${k}-new`,fieldUid:()=>"field-new"
});

test('field view models preserve existing values, missing references and requirements',()=>{
  const field={id:'hp',name:'Health',valueType:'number',cardinality:'one',required:true,nullable:false,defaultValue:10,constraints:[{kind:'min',value:0}]};
  const row=buildFieldRow('hp',field,[{id:'number'},{id:'string'}]);
  assert.equal(row.min,0);assert.equal(row.hasDefault,true);
  assert.deepEqual(row.valueTypes.map(x=>x.selected),[true,false]);
  const created=buildDefinitionFieldModel('hp',field,{},true,'type');
  assert.equal(created.valueText,'10');assert.equal(created.present,true);assert.equal(created.inputRequired,false);
  const existing=buildDefinitionFieldModel('hp',field,{hp:6},false,'type');
  assert.equal(existing.valueText,'6');assert.equal(existing.hasValue,true);
  assert.equal(buildEventFieldRow('event',{valueType:'boolean',required:true},[{id:'boolean'}]).valueTypes[0].selected,true);
});

test('field serializer retains advanced JSON constraints and rejects duplicate ids',()=>{
  const props={name:input('Reference'),valueType:input('reference'),cardinality:input('one'),referenceTarget:input('{"objectKind":"definition","definitionTypeId":"type-1"}'),referenceTargetKind:input('definition'),constraints:input('[]'),nullable:input('',false),editable:input('',true),required:input('',true)};
  const serialized=collectFieldDefinitions([field('ref',props)]);
  assert.deepEqual(serialized.ref.referenceTarget,{objectKind:'definition',definitionTypeId:'type-1'});
  assert.equal(serialized.ref.required,true);
  assert.throws(()=>collectFieldDefinitions([field('ref',props),field('ref',props)]),/Duplicate FieldDefinition/);
  const incompatible=structuredClone(props);incompatible.referenceTargetKind=input('formula');
  assert.deepEqual(collectFieldDefinitions([field('ref',incompatible)]).ref.referenceTarget,{objectKind:'formula'});
});

test('definition data serializer preserves structured many-references and absent optional fields',()=>{
  const defs=['alpha','beta'].map(id=>({objectKind:'definition',objectId:id}));
  const refs={dataset:{definitionField:'refs',valueType:'reference',cardinality:'many',nullable:'false',required:'true'},querySelector:()=>({selectedOptions:defs.map(d=>({value:refToken(d)}))})};
  const optional={dataset:{definitionField:'optional',valueType:'string',cardinality:'one',nullable:'false',required:'false'},querySelector:()=>input('')};
  assert.deepEqual(collectDefinitionData([refs,optional]),{refs:defs});
  const payloadRow=row({eventFieldId:'title'},{name:input('Title'),valueType:input('string'),required:input('',true),nullable:input('',false)});
  assert.deepEqual(collectEventPayloadFields([payloadRow]),{title:{name:'Title',valueType:'string',required:true,nullable:false}});
});


test('content subtype choice survives Content Type serialization and preserves unknown metadata',()=>{
  const data=collectEntryData('contentType',deps({nameKey:'Inventory',storageKind:'actor',documentSubtypeActor:'pilot',documentSubtypeItem:'gear',runtimeMode:'stackable',enabled:true}));
  assert.equal(data.documentSubtype,'pilot');assert.equal(data.storageKind,'actor');
  assert.deepEqual(data.customExtension,{source:'old'});
  assert.equal(prepareContentType({...data,id:'type-1'}).documentSubtype,'pilot');
  const item=collectEntryData('contentType',deps({nameKey:'Inventory',storageKind:'item',documentSubtypeActor:'pilot',documentSubtypeItem:'gear'}));
  assert.equal(item.documentSubtype,'gear');
  assert.throws(()=>prepareContentType({...item,id:'type-1',documentSubtype:33}),/ContentType.documentSubtype/);
});

test('content subtypes are unique-or-explicit, never first-in-list when ambiguous',()=>{
  const multi={documentTypes:{Actor:['human','alien'],Item:['spell','armor']}};
  assert.throws(()=>resolveDocumentType('Actor',{system:multi}),/Select a subtype/);
  assert.equal(resolveDocumentType('Item',{system:multi,requestedType:'armor'}),'armor');
  assert.equal(resolveDocumentType('Actor',{system:{documentTypes:{Actor:['golem']}}}),'golem');
  assert.throws(()=>resolveDocumentType('Actor',{system:multi,requestedType:'npc'}),/Unsupported/);
});

test('reference catalog is Ruleset-fed, filtered and colors are injected',()=>{
  const choices=buildRuleReferenceChoices({definitions:[{id:'a',nameKey:'Alpha',capabilities:['pool'],slots:{pool:[{id:'hp'}]}}],parameters:[{id:'p',nameKey:'Param'}],formulas:[],findCapability:id=>id==='pool'?{outputs:{current:{id:'current',valueType:'number',mutable:true},maximum:{id:'maximum',valueType:'number',mutable:false}}}:null,optionColors:()=>['#808080']});
  assert.equal(choices.length,4);
  const mutable=buildRuleReferenceChoices({mutableOnly:true,definitions:[{id:'a',nameKey:'Alpha',capabilities:['pool'],slots:{pool:[{id:'hp'},{id:'mp'}]}}],findCapability:()=>({outputs:{current:{id:'current',mutable:true},maximum:{id:'maximum',mutable:false}}})});
  assert.equal(mutable.length,2);assert.match(mutable[0].token,/hp\|current/);assert.match(mutable[1].token,/mp\|current/);
  assert.equal(buildRuleReferenceChoices({definitions:[{id:'a',nameKey:'Alpha',capabilities:['pool']}],findCapability:()=>({outputs:{current:{id:'current'}}})}).length,1,'no slot, no pool output');
});

test('new rule defaults do not silently create a d20 mechanic',()=>{
  const roll=collectEntryData('roll',deps({nameKey:'Roll',rollFormula:''}));
  const tested=collectEntryData('test',deps({nameKey:'Test',targetValue:''}));
  assert.equal(roll.formula,'');assert.equal(tested.targetValue,null);
});

import {collectRuleOperand,collectFormulaExpression,collectConditionExpression} from '../src/configurator/entry-expression-serialization.mjs';
import {collectCreationSteps} from '../src/configurator/creation-step-serialization.mjs';
const fakeOperand=(kind,value)=>({querySelector:selector=>{
  if(selector==='[data-rule-operand-kind]')return input(kind);
  return input(value);
}});
const fakeBuilder=(operator,operands=[],supported='true')=>({dataset:{supported},querySelector:()=>input(operator),querySelectorAll:()=>operands});

test('formula and condition AST serializers preserve typed literal, reference and fallback',()=>{
  const numeric=fakeOperand('literal','3.5'),boolean=fakeOperand('literal','true');
  assert.deepEqual(collectRuleOperand(numeric),{type:'literal',value:3.5});
  assert.deepEqual(collectRuleOperand(boolean),{type:'literal',value:true});
  assert.deepEqual(collectRuleOperand(fakeOperand('literal','alpha')),{type:'literal',value:'alpha'});
  const fallback={type:'reference',reference:{objectKind:'definition',objectId:'old'}};
  assert.deepEqual(collectFormulaExpression(fakeBuilder('add',[numeric,boolean]),fallback),{type:'add',args:[{type:'literal',value:3.5},{type:'literal',value:true}]});
  assert.equal(collectFormulaExpression(fakeBuilder('add',[],'false'),fallback),fallback);
  assert.deepEqual(collectConditionExpression(fakeBuilder('alwaysFalse',[]),fallback),{type:'literal',value:false});
  assert.deepEqual(collectConditionExpression(fakeBuilder('eq',[numeric,boolean]),fallback),{type:'eq',left:{type:'literal',value:3.5},right:{type:'literal',value:true}});
});

function creationRow({name='Step',min='0',max='1',source='definitions',objects=['x'],original='{}'}={}){
  return {dataset:{original},querySelector:selector=>{
    if(selector.includes('"name"'))return input(name);
    if(selector.includes('"min"'))return input(min);
    if(selector.includes('"max"'))return input(max);
    if(selector.includes('source-family'))return source?input(source):null;
    if(selector.includes('"kind"'))return input('choice');
    return null;
  },querySelectorAll:selector=>selector.includes('sourceObjects')?objects.map(input):[]};
}
test('creation steps validate sources, cardinality and duplicate ids, and keep the step id',()=>{
  const sources=[{id:'definitions',items:[{id:'x'}]}];const uid=kind=>kind+'-new';
  const args={sources,uid};
  const [step]=collectCreationSteps([creationRow()],args);
  assert.deepEqual(step.source,{collection:'definitions',objectIds:['x']});
  assert.throws(()=>collectCreationSteps([creationRow({objects:['gone']})],args),/Missing Ruleset object/);
  assert.throws(()=>collectCreationSteps([creationRow({min:'3',max:'1'})],args),/Invalid minimum/);
  assert.throws(()=>collectCreationSteps([creationRow(),creationRow()],args),/unique/);
  const [cleared]=collectCreationSteps([creationRow({source:'',original:'{"id":"keep","source":{"collection":"retired","objectIds":["old"]}}'})],args);
  assert.equal(cleared.id,'keep');
  assert.equal(cleared.source,undefined);
  assert.equal(step.required,false);
});

import {createConfiguratorAPI} from '../src/configurator/configurator-api.mjs';
import {emptyStorageSnapshot} from '../src/configurator/configurator-storage.mjs';
import {exportRulesetData,readRulesetPayload} from '../src/configurator/configurator-serialization.mjs';

test('Actor/Item mapping persists through save/reload and RTA export (and the import-only historical format)',async()=>{
  class Storage{
    snapshot=emptyStorageSnapshot(); listeners=new Set();
    async load(){return structuredClone(this.snapshot);}
    async save(value){this.snapshot=structuredClone(value);for(const listener of this.listeners)listener(this.snapshot);}
    subscribe(listener){this.listeners.add(listener);return()=>this.listeners.delete(listener);}
  }
  const storage=new Storage();
  let api=await createConfiguratorAPI(storage);
  const v=(await api.createRuleset({id:'setting-no-d20',nameKey:'Setting',version:'1.0'})).versionId;
  await api.createContentType(v,{id:'pilot-gear',nameKey:'Pilot gear',storageKind:'item',documentSubtype:'augment',runtimeMode:'unique',enabled:true,tags:[]});
  assert.equal(api.getContentType(v,'pilot-gear').documentSubtype,'augment');
  api=await createConfiguratorAPI(storage);
  assert.equal(api.getContentType(v,'pilot-gear').documentSubtype,'augment');
  const version=api.getRulesetVersion(v);
  const exported=exportRulesetData(version);
  for(const format of ['rwf-ruleset','rta-ruleset']){
    const record=readRulesetPayload({...exported,format}).record;
    assert.equal(record.workingDraft.contentTypes.find(t=>t.id==='pilot-gear').documentSubtype,'augment');
  }
});
