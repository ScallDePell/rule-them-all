import test from 'node:test';
import assert from 'node:assert/strict';
import {createConfiguratorAPI} from '../src/configurator/configurator-api.mjs';
import {emptyStorageSnapshot} from '../src/configurator/configurator-storage.mjs';
import {DEPENDENCY_STRENGTHS} from '../src/configurator/dependency-index.mjs';
class Storage{value=emptyStorageSnapshot();async load(){return structuredClone(this.value)}async save(v){this.value=structuredClone(v)}}
const meta={enabled:true,order:10,tags:[]};
const strength={objectKind:'definition',objectId:'strength',capabilityId:'value',outputId:'value.base'};

async function setup(){
  const api=await createConfiguratorAPI(new Storage());const v=(await api.createRuleset({id:'r',nameKey:'R',version:'1'})).versionId;
  await api.registerDefinitionType(v,{id:'attribute',key:'attribute',nameKey:'Attribute',descriptionKey:'',color:null,enabled:true,order:10,allowedCapabilities:['value','state'],defaultCapabilities:['value'],requiredCapabilities:['value'],fields:{},constraints:[]});
  await api.createDefinition(v,{id:'strength',key:'strength',definitionTypeId:'attribute',nameKey:'Strength',descriptionKey:'',data:{},categories:[],capabilities:['value','state'],...meta});
  await api.createFormula(v,{id:'total',nameKey:'Total',resultType:'number',expression:{type:'reference',reference:strength},...meta});
  await api.createFormula(v,{id:'bonus',nameKey:'Bonus',resultType:'number',expression:{type:'literal',value:1},...meta});
  await api.createTest(v,{id:'check',nameKey:'Check',rollRef:null,totalFormulaRef:'total',bonusFormulaRef:'bonus',inputBindings:[],targetValue:5,outcomeRefs:[],fallbackOutcomeRef:null,...meta});
  await api.createEffect(v,{id:'raise',nameKey:'Raise',targetRef:{objectKind:'definition',objectId:'strength',capabilityId:'state',outputId:'state.active'},operation:'toggle',operand:{kind:'literal',value:0},...meta});
  return {api,v};
}

test('CP-31: dependencies carry required, optional or metadata strength', async () => {
  assert.deepEqual(DEPENDENCY_STRENGTHS,['required','optional','metadata']);
  const {api,v}=await setup();
  const edges=api.listDependencies(v).filter(edge=>edge.consumerRef.objectId==='check');
  assert.equal(edges.find(edge=>edge.kind==='testTotal').strength,'required');
  assert.equal(edges.find(edge=>edge.kind==='testBonus').strength,'optional');
  const status=api.getDeletionStatus(v,'bonus','formula');
  assert.equal(status.canDelete,true);
  assert.equal(status.code,'OPTIONAL_REFERENCES');
  assert.equal(api.getDeletionStatus(v,'total','formula').canDelete,false);
});

test('CP-31: analyzeChangeImpact reports broken references before a deletion', async () => {
  const {api,v}=await setup();
  const blocked=api.analyzeChangeImpact(v,{delete:{kind:'formula',id:'total'}});
  assert.equal(blocked.blocking,true);
  assert.deepEqual(blocked.brokenReferences.map(edge=>[edge.consumerRef.objectId,edge.kind,edge.strength]),[['check','testTotal','required']]);
  const optional=api.analyzeChangeImpact(v,{delete:{kind:'formula',id:'bonus'}});
  assert.deepEqual(optional.brokenReferences.map(edge=>edge.strength),['optional']);
  const cleared=api.analyzeChangeImpact(v,{delete:{kind:'formula',id:'bonus'},clearOptionalReferences:true});
  assert.equal(cleared.blocking,false);
  assert.deepEqual(cleared.brokenReferences,[]);
  // The analysis writes nothing.
  assert.ok(api.getFormula(v,'bonus'));
  assert.equal(api.getTest(v,'check').bonusFormulaRef,'bonus');
});

test('CP-31: analyzeChangeImpact reports incompatible consumers and runtime impacts of an update', async () => {
  const {api,v}=await setup();
  const retype=api.analyzeChangeImpact(v,{update:{kind:'formula',id:'total',patch:{resultType:'boolean'}}});
  assert.deepEqual(retype.incompatibleConsumers.map(d=>[d.code,d.objectId]),[['FORMULA_TYPE','total'],['TEST_TYPE','check']]);
  assert.equal(retype.blocking,false);
  const drop=api.analyzeChangeImpact(v,{update:{kind:'definition',id:'strength',patch:{capabilities:['value'],enabled:false}}});
  assert.deepEqual(drop.runtimeImpacts,[{kind:'inactiveState',definitionId:'strength'},{kind:'capabilityRemoved',definitionId:'strength',capabilityId:'state'}]);
  assert.deepEqual(drop.blockingDiagnostics.map(d=>[d.code,d.objectId]),[['REFERENCE_CAPABILITY','raise']]);
  assert.equal(drop.blocking,true);
});
