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
  // A number input cannot show "null": the browser warns and the field shows empty anyway.
  assert.equal(buildDefinitionFieldModel('hp',{...field,nullable:true},{hp:null},false,'type').valueText,'');
  assert.equal(buildDefinitionFieldModel('tag',{id:'tag',valueType:'string',cardinality:'one',nullable:true},{tag:null},false,'type').valueText,'null');
  assert.equal(buildEventFieldRow('event',{valueType:'boolean',required:true},[{id:'boolean'}]).valueTypes[0].selected,true);
});

test('field serializer writes the reference target from its selects and rejects duplicate ids',()=>{
  const props={name:input('Reference'),valueType:input('reference'),cardinality:input('one'),referenceTargetKind:input('definition'),referenceDefinitionTypeId:input('type-1'),nullable:input('',false),required:input('',true),defaultValue:input('')};
  const serialized=collectFieldDefinitions([field('ref',props)]);
  assert.deepEqual(serialized.ref.referenceTarget,{objectKind:'definition',definitionTypeId:'type-1'});
  assert.equal(serialized.ref.required,true);
  assert.throws(()=>collectFieldDefinitions([field('ref',props),field('ref',props)]),/Duplicate FieldDefinition/);
  const incompatible=structuredClone(props);incompatible.referenceTargetKind=input('formula');
  assert.deepEqual(collectFieldDefinitions([field('ref',incompatible)]).ref.referenceTarget,{objectKind:'formula'});
  const ref=collectFieldDefinitions([field('ref',props)]).ref;
  assert.equal(Object.hasOwn(ref,'defaultValue'),false,'an empty default value means no default');
  const scored=collectFieldDefinitions([field('score',{name:input('Score'),valueType:input('integer'),cardinality:input('one'),defaultValue:input('3'),min:input('1')})]).score;
  assert.equal(scored.defaultValue,3);
  assert.deepEqual(scored.constraints,[{kind:'min',value:1}]);
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
  assert.equal(item.sheetPalette,false,'"Offered in the sheet editor" unticked is stored');
  assert.equal('sheetPalette' in collectEntryData('contentType',deps({nameKey:'Inventory',storageKind:'item',sheetPalette:true})),false,'ticked (the default) stores nothing');
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

import {collectRuleOperand,collectExpression} from '../src/configurator/entry-expression-serialization.mjs';
import {blockNodeOf} from '../src/configurator/entry-expression-model.mjs';
import {collectCreationSteps} from '../src/configurator/creation-step-serialization.mjs';
const fakeOperand=(kind,value)=>({querySelector:selector=>selector.includes('[data-rule-operand-kind]')?input(kind):selector.includes('data-operand-part')?input(value):null});

test('formula and condition AST serializers preserve typed literal, reference and fallback',()=>{
  assert.deepEqual(collectRuleOperand(fakeOperand('literal','3.5')),{type:'literal',value:3.5});
  assert.deepEqual(collectRuleOperand(fakeOperand('literal','true')),{type:'literal',value:true});
  assert.deepEqual(collectRuleOperand(fakeOperand('literal','alpha')),{type:'literal',value:'alpha'});
  assert.deepEqual(collectRuleOperand(fakeOperand('context','variables.test.total')),{type:'context',path:'variables.test.total'});
  const fallback={type:'reference',reference:{objectKind:'definition',objectId:'old'}};
  assert.equal(collectExpression({dataset:{supported:'false'}},fallback),fallback);
  assert.deepEqual(blockNodeOf({operation:'alwaysFalse'}),{type:'literal',value:false});
  assert.deepEqual(blockNodeOf({operation:'eq',children:[{kind:'literal',value:'3.5'},{kind:'literal',value:'true'}]}),{type:'eq',left:{type:'literal',value:3.5},right:{type:'literal',value:true}});
});

function creationRow({name='Step',min='0',max='1',source='definitions',objects=['x'],original='{}',id=''}={}){
  return {dataset:{original},querySelector:selector=>{
    if(selector.includes('"name"'))return input(name);
    if(selector.includes('"min"'))return input(min);
    if(selector.includes('"max"'))return input(max);
    if(selector.includes('source-family'))return source?input(source):null;
    if(selector.includes('"kind"'))return input('choice');
    if(selector.includes('"id"'))return input(id);
    return null;
  },querySelectorAll:selector=>selector.includes('sourceObjects')?objects.map(input):[]};
}
test('creation steps validate sources, cardinality and duplicate ids, and keep the step id',()=>{
  const sources=[{id:'definitions',items:[{id:'x'}]}];
  const args={sources};
  const [step]=collectCreationSteps([creationRow()],args);
  assert.deepEqual(step.source,{collection:'definitions',objectIds:['x']});
  assert.throws(()=>collectCreationSteps([creationRow({objects:['gone']})],args),/Missing Ruleset object/);
  assert.throws(()=>collectCreationSteps([creationRow({min:'3',max:'1'})],args),/Invalid minimum/);
  const saved='{"id":"same"}';
  assert.throws(()=>collectCreationSteps([creationRow({original:saved}),creationRow({original:saved})],args),/unique/);
  // A new step's id is readable: typed, else taken from its name (accents stripped), never one already used.
  const named=collectCreationSteps([creationRow({name:'Élève doué',original:'{"id":"eleve-doue"}'}),creationRow({name:'Élève doué'}),creationRow({name:'Survie',id:'survie-1'}),creationRow({name:'!!'})],args);
  assert.deepEqual(named.map(x=>x.id),['eleve-doue','eleve-doue-2','survie-1','step']);
  assert.throws(()=>collectCreationSteps([creationRow({original:'{"id":"survie"}'}),creationRow({id:'survie'})],args),/already used/);
  assert.throws(()=>collectCreationSteps([creationRow({id:'Survie !'})],args),/Invalid step identifier/);
  const [cleared]=collectCreationSteps([creationRow({source:'',original:'{"id":"keep","source":{"collection":"retired","objectIds":["old"]}}'})],args);
  assert.equal(cleared.id,'keep');
  assert.equal(cleared.source,undefined);
  assert.equal(step.required,false);
});

import {createConfiguratorAPI} from '../src/configurator/configurator-api.mjs';
import {emptyStorageSnapshot} from '../src/configurator/configurator-storage.mjs';
import {exportRulesetData,readRulesetPayload} from '../src/configurator/configurator-serialization.mjs';

test('Actor/Item mapping persists through save/reload and RTA export',async()=>{
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
  const record=readRulesetPayload(exported).record;
  assert.equal(record.workingDraft.contentTypes.find(t=>t.id==='pilot-gear').documentSubtype,'augment');
});
