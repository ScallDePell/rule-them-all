import test from 'node:test';
import assert from 'node:assert/strict';
import {createConfiguratorAPI} from '../src/configurator/configurator-api.mjs';
import {emptyStorageSnapshot} from '../src/configurator/configurator-storage.mjs';
import {prepareTest, prepareInputBinding} from '../src/configurator/rule-contracts.mjs';
import {MemoryRuntimeAdapter} from '../src/runtime/memory-runtime-adapter.mjs';
import {RuntimeEngine} from '../src/runtime/runtime-engine.mjs';
class Storage{value=emptyStorageSnapshot();async load(){return structuredClone(this.value)}async save(v){this.value=structuredClone(v)}}
const ctx=path=>({type:'context',path:`variables.test.${path}`});

async function setup(){
  const api=await createConfiguratorAPI(new Storage());const v=(await api.createRuleset({id:'r',nameKey:'R',version:'1'})).versionId;
  await api.createParameter(v,{id:'level',nameKey:'Level',valueType:'integer',value:3,scope:'ruleset',enabled:true,order:10,tags:[]});
  await api.createFormula(v,{id:'double-level',nameKey:'Double level',resultType:'number',expression:{type:'multiply',args:[{type:'parameter',id:'level'},{type:'literal',value:2}]},enabled:true,order:10,tags:[]});
  await api.createFormula(v,{id:'skill-total',nameKey:'Skill total',resultType:'number',expression:{type:'add',args:[ctx('inputs.rank'),ctx('inputs.edge')]},enabled:true,order:20,tags:[]});
  await api.createFormula(v,{id:'half-margin',nameKey:'Half margin',resultType:'number',expression:{type:'divide',args:[{type:'subtract',args:[ctx('total'),ctx('target')]},{type:'literal',value:2}]},enabled:true,order:30,tags:[]});
  await api.createCondition(v,{id:'passed',nameKey:'Passed',expression:{type:'gte',left:ctx('margin'),right:{type:'literal',value:0}},enabled:true,order:10,tags:[]});
  await api.createOutcome(v,{id:'success',nameKey:'Success',resultKey:'success',conditionRef:'passed',priority:10,enabled:true,order:10,tags:[]});
  await api.createOutcome(v,{id:'failure',nameKey:'Failure',resultKey:'failure',conditionRef:null,priority:0,enabled:true,order:20,tags:[]});
  return {api,v};
}

test('CP-29: a Test runs without a Roll from typed inputs, a total Formula and a margin Formula', async () => {
  const {api,v}=await setup();
  await api.createTest(v,{id:'knowledge',nameKey:'Knowledge',rollRef:null,
    inputBindings:[{id:'rank',source:{formulaRef:'double-level'},valueType:'number',required:true},{id:'edge',source:{literal:1},valueType:'integer',required:true}],
    totalFormulaRef:'skill-total',targetValue:5,marginFormulaRef:'half-margin',outcomeRefs:['success'],fallbackOutcomeRef:'failure',enabled:true,order:10,tags:[]});
  await api.publishRuleset(v);
  const result=await new RuntimeEngine({configurator:api,adapter:new MemoryRuntimeAdapter(),hooks:null}).executeTest(v,'knowledge',{});
  assert.deepEqual(result.inputs,{rank:6,edge:1});
  assert.equal(result.roll,null);
  assert.equal(result.total,7);
  assert.equal(result.target,5);
  assert.equal(result.margin,1);
  assert.equal(result.outcome.id,'success');
});

test('CP-29: with a Roll and no total Formula, total is roll + bonus and margin is total - target', async () => {
  const {api,v}=await setup();
  await api.createRoll(v,{id:'fixed',nameKey:'Fixed',formula:'4',data:{},enabled:true,order:10,tags:[]});
  await api.createTest(v,{id:'attack',nameKey:'Attack',rollRef:'fixed',bonusFormulaRef:'double-level',targetValue:12,outcomeRefs:['success'],fallbackOutcomeRef:'failure',enabled:true,order:10,tags:[]});
  await api.publishRuleset(v);
  const result=await new RuntimeEngine({configurator:api,adapter:new MemoryRuntimeAdapter(),hooks:null}).executeTest(v,'attack',{});
  assert.equal(result.roll.total,4);
  assert.equal(result.total,10);
  assert.equal(result.margin,-2);
  assert.equal(result.outcome.id,'failure');
});

test('CP-29: a missing required input uses its default, otherwise fails explicitly', async () => {
  const {api,v}=await setup();
  await api.createFormula(v,{id:'nothing',nameKey:'Nothing',resultType:'number',expression:{type:'context',path:'variables.absent'},enabled:true,order:40,tags:[]});
  const base={rollRef:null,totalFormulaRef:'skill-total',outcomeRefs:[],enabled:true,tags:[]};
  await api.createTest(v,{...base,id:'with-default',nameKey:'With default',order:10,inputBindings:[{id:'rank',source:{formulaRef:'nothing'},valueType:'number',required:true,defaultValue:2},{id:'edge',source:{literal:0},valueType:'number',required:true}]});
  await api.createTest(v,{...base,id:'without',nameKey:'Without',order:20,inputBindings:[{id:'rank',source:{formulaRef:'nothing'},valueType:'number',required:true},{id:'edge',source:{literal:0},valueType:'number',required:true}]});
  await api.publishRuleset(v);
  const engine=new RuntimeEngine({configurator:api,adapter:new MemoryRuntimeAdapter(),hooks:null});
  assert.equal((await engine.executeTest(v,'with-default',{})).total,2);
  await assert.rejects(()=>engine.executeTest(v,'without',{}),/input rank has no value/);
});

test('CP-29: Test and InputBinding contracts', () => {
  assert.throws(()=>prepareTest({id:'t',nameKey:'T'}),/Roll or a total Formula/);
  assert.deepEqual(prepareTest({id:'t',nameKey:'T'},{incomplete:[]}).inputBindings,[]);
  assert.throws(()=>prepareInputBinding({id:'a',source:{literal:1,formulaRef:'f'}}),/exactly one/);
  assert.throws(()=>prepareInputBinding({id:'a',source:{literal:'x'},valueType:'number'}),/literal/);
  assert.throws(()=>prepareInputBinding({id:'1a',source:{literal:1}}),/start with a letter/);
  assert.throws(()=>prepareTest({id:'t',nameKey:'T',totalFormulaRef:'f',inputBindings:[{id:'a',source:{literal:1}},{id:'a',source:{literal:2}}]}),/Duplicate Test input/);
});

test('CP-29: Formulas used by a Test are protected dependencies', async () => {
  const {api,v}=await setup();
  await api.createTest(v,{id:'knowledge',nameKey:'Knowledge',inputBindings:[{id:'rank',source:{formulaRef:'double-level'},valueType:'number',required:true},{id:'edge',source:{literal:1},valueType:'number',required:true}],totalFormulaRef:'skill-total',marginFormulaRef:'half-margin',outcomeRefs:[],enabled:true,order:10,tags:[]});
  for(const id of ['double-level','skill-total'])await assert.rejects(()=>api.deleteFormula(v,id),/referenced/,id);
  // The margin Formula is optional (CP-31): deleting it needs an explicit clear.
  await assert.rejects(()=>api.deleteFormula(v,'half-margin'),error=>error.code==='OPTIONAL_REFERENCES');
  await api.deleteFormula(v,'half-margin',{clearOptionalReferences:true});
  assert.equal(api.getTest(v,'knowledge').marginFormulaRef,null);
});

test('CP-29 editor: input rows mirror the stored source and parse typed text', async () => {
  const {buildTestInputContext, parseTypedText} = await import('../src/configurator/test-input-form.mjs');
  const {rows, blank} = buildTestInputContext({inputs: [{id: 'rank', valueType: 'integer', source: {formulaRef: 'f1'}, required: false, defaultValue: 2}], formulas: [{id: 'f1', label: 'F1'}, {id: 'f2', label: 'F2'}]});
  assert.equal(rows[0].isFormula, true);
  assert.deepEqual(rows[0].formulas.map(f => f.selected), [true, false]);
  assert.equal(rows[0].required, false);
  assert.equal(rows[0].defaultValue, '2');
  assert.equal(blank.isLiteral, true);
  assert.equal(parseTypedText('integer', ' 3 ', 'x'), 3);
  assert.equal(parseTypedText('boolean', 'true', 'x'), true);
  assert.equal(parseTypedText('string', '', 'x'), undefined);
  assert.throws(() => parseTypedText('integer', '2.5', 'Input a'), /Input a must be an integer/);
});
