import test from 'node:test';
import assert from 'node:assert/strict';
import {createConfiguratorAPI} from '../src/configurator/configurator-api.mjs';
import {emptyStorageSnapshot} from '../src/configurator/configurator-storage.mjs';
import {validateRuleset, assertValidRuleset} from '../src/configurator/configurator-validation.mjs';
import {prepareTest, prepareRoll} from '../src/configurator/rule-contracts.mjs';
import {VALIDATION_SCOPES} from '../src/configurator/diagnostics.mjs';
class Storage{constructor(){this.value=emptyStorageSnapshot();}async load(){return structuredClone(this.value)}async save(v){this.value=structuredClone(v)}}

async function setup(){
  const api=await createConfiguratorAPI(new Storage());
  const v=(await api.createRuleset({id:'scopes',nameKey:'Scopes',version:'1'})).versionId;
  return {api,v};
}

test('CP-10 diagnostics carry severity, object location and blocking flag',async()=>{
  const {api,v}=await setup();
  await api.createTest(v,{id:'draft-test',nameKey:'Draft',outcomeRefs:[],enabled:true,order:10,tags:[]});
  const [diagnostic]=api.diagnoseRuleset(v,{scope:'save'}).diagnostics;
  assert.deepEqual(Object.keys(diagnostic).sort(),['blocking','code','details','message','messageKey','objectId','objectKind','path','relatedRefs','severity']);
  assert.equal(diagnostic.code,'INCOMPLETE');
  assert.equal(diagnostic.messageKey,'RTA.Diagnostic.INCOMPLETE');
  assert.equal(diagnostic.objectKind,'test');
  assert.equal(diagnostic.objectId,'draft-test');
  assert.equal(diagnostic.path,'tests[0]');
  assert.equal(diagnostic.severity,'WARNING');
  assert.equal(diagnostic.blocking,false);
  assert.match(diagnostic.message,/rollRef/);
});

test('An incomplete draft saves, but publish needs the complete graph',async()=>{
  const {api,v}=await setup();
  await api.createRoll(v,{id:'unwritten',nameKey:'',formula:'',data:{},enabled:true,order:10,tags:[]});
  await api.createTest(v,{id:'check',nameKey:'Check',outcomeRefs:[],enabled:true,order:10,tags:[]});
  assert.equal(validateRuleset(api.getRuleset(v)).valid,true);
  const publish=api.diagnoseRuleset(v);
  assert.equal(publish.scope,'publish');
  assert.equal(publish.valid,false);
  assert.deepEqual(publish.errors.map(entry=>`${entry.objectId}: ${entry.message}`).sort(),['check: Test requires rollRef.','unwritten: Roll requires nameKey.','unwritten: Roll.formula is required.']);
  assert.ok(publish.errors.every(entry=>entry.severity==='ERROR'&&entry.blocking));
  await assert.rejects(()=>api.publishRuleset(v),error=>error.code==='INVALID_RULESET'&&error.validation.scope==='publish');
  await api.updateRoll(v,'unwritten',{nameKey:'D20',formula:'1d20'});
  await api.updateTest(v,'check',{rollRef:'unwritten'});
  assert.equal(api.diagnoseRuleset(v).valid,true);
  await api.publishRuleset(v);
});

test('Structural problems block even a draft save',async()=>{
  const {api,v}=await setup();
  await assert.rejects(()=>api.createRoll(v,{id:'flavored',nameKey:'Flavored',formula:'1d20[fire]',data:{},enabled:true,order:10,tags:[]}),/Invalid Roll formula/);
  await assert.rejects(()=>api.createTest(v,{id:'dangling',nameKey:'Dangling',rollRef:'missing',outcomeRefs:[],enabled:true,order:10,tags:[]}),/Dependency target does not exist/);
  const ruleset={...api.getRuleset(v),unexpected:true};
  const save=validateRuleset(ruleset);
  assert.equal(save.valid,false);
  assert.equal(save.errors[0].code,'UNKNOWN_FIELD');
  assert.equal(save.errors[0].objectKind,'ruleset');
});

test('A missing required Definition value is incomplete; an out-of-range value is invalid',async()=>{
  const {api,v}=await setup();
  await api.registerDefinitionType(v,{id:'gauge',key:'gauge',nameKey:'Gauge',descriptionKey:'',color:null,enabled:true,order:10,allowedCapabilities:[],defaultCapabilities:[],requiredCapabilities:[],fields:{size:{id:'size',name:'Size',valueType:'number',cardinality:'one',required:true,nullable:false,editable:true}},constraints:[{kind:'min',field:'size',value:1}]});
  await api.createDefinition(v,{id:'empty',key:'empty',definitionTypeId:'gauge',nameKey:'Empty',descriptionKey:'',data:{},categories:[],capabilities:[],enabled:true,order:10,tags:[]});
  assert.match(api.diagnoseRuleset(v).errors.map(entry=>entry.message).join(),/Required field is missing: size/);
  await assert.rejects(()=>api.updateDefinition(v,'empty',{data:{size:0}}),/Constraint min failed/);
  await api.updateDefinition(v,'empty',{data:{size:2}});
  assert.equal(api.diagnoseRuleset(v).valid,true);
});

test('Contract helpers stay strict unless the caller collects completeness issues',()=>{
  assert.throws(()=>prepareTest({id:'t',nameKey:'T'}),error=>error.code==='INCOMPLETE');
  const options={incomplete:[]};
  prepareTest({id:'t',nameKey:'T'},options);
  assert.deepEqual(options.incomplete,['Test requires rollRef.']);
  assert.throws(()=>prepareRoll({nameKey:'R',formula:'1d6'},{incomplete:[]}),/requires id/);
});

test('Validation scopes are a closed list',()=>{
  assert.deepEqual(VALIDATION_SCOPES,['edit','save','publish','activate']);
  assert.throws(()=>validateRuleset({},{scope:'runtime'}),/Unknown validation scope/);
  assert.throws(()=>assertValidRuleset({id:''},{scope:'publish'}),error=>error.code==='INVALID_RULESET');
});
