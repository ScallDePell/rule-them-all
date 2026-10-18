import test from 'node:test';
import assert from 'node:assert/strict';
import {createConfiguratorAPI} from '../src/configurator/configurator-api.mjs';
import {emptyStorageSnapshot} from '../src/configurator/configurator-storage.mjs';
import {MemoryRuntimeAdapter} from '../src/runtime/memory-runtime-adapter.mjs';
import {createRuntimeAPI} from '../src/runtime/runtime-api.mjs';
import {FoundryContentBridge} from '../src/runtime/foundry-content-bridge.mjs';

class Storage{data=emptyStorageSnapshot();async load(){return structuredClone(this.data)}async save(next){this.data=structuredClone(next)}}
class ActorMock{constructor(uuid){this.uuid=uuid;this.documentName='Actor';this.flags={};}getFlag(s,k){return this.flags[s]?.[k]}async setFlag(s,k,v){(this.flags[s]??={})[k]=structuredClone(v)}}
class Adapter extends MemoryRuntimeAdapter{constructor(actors){super();this.actors=actors;}async resolveDocument(uuid){const a=this.actors.get(uuid);if(!a)throw new Error('Actor not found');return a}async canWrite(){return true}
  async roll(formula){return {formula,total:4,result:'4'};}}
const field=(id,valueType)=>({id,name:id,valueType,cardinality:'one',nullable:false,required:false,constraints:[]});
const ref=(objectId,capabilityId,outputId,slotId)=>({objectKind:'definition',objectId,capabilityId,outputId,...(slotId?{slotId}:{})});
const lit=value=>({type:'literal',value}),cf=f=>({type:'contentField',field:f}),ctx=path=>({type:'context',path});

async function system(){
  const api=await createConfiguratorAPI(new Storage());
  const v=(await api.createRuleset({id:'guns',nameKey:'Guns',version:'1.0.0'})).versionId;
  await api.registerDefinitionType(v,{id:'stat',key:'stat',nameKey:'Stat',allowedCapabilities:['pool'],defaultCapabilities:['pool'],requiredCapabilities:[],fields:{}});
  await api.createDefinition(v,{id:'vitality',key:'vitality',nameKey:'Vitality',definitionTypeId:'stat',capabilities:['pool'],slots:{pool:[{id:'points',minimum:{literal:0},maximum:{literal:20}}]},data:{}});
  await api.createContentType(v,{id:'gun',nameKey:'Gun',storageKind:'item',runtimeMode:'unique',fields:{loaded:field('loaded','integer'),magazine:field('magazine','integer'),reserve:field('reserve','integer'),name:field('name','string')}});
  await api.createCondition(v,{id:'has-ammo',nameKey:'Has ammo',expression:{type:'gte',left:cf('loaded'),right:lit(1)}});
  await api.createFormula(v,{id:'to-load',nameKey:'To load',resultType:'number',expression:{type:'min',args:[{type:'subtract',args:[cf('magazine'),cf('loaded')]},cf('reserve')]}});
  await api.createFormula(v,{id:'loaded-now',nameKey:'Loaded now',resultType:'number',expression:ctx('variables.effects.load.operand')});
  await api.createEffect(v,{id:'spend',nameKey:'Spend',targetContentField:'loaded',targetRole:'self',operation:'subtract',operand:{kind:'literal',value:1}});
  await api.createEffect(v,{id:'load',nameKey:'Load',targetContentField:'loaded',operation:'add',operand:{kind:'formula',id:'to-load'}});
  await api.createEffect(v,{id:'unreserve',nameKey:'Unreserve',targetContentField:'reserve',operation:'subtract',operand:{kind:'formula',id:'loaded-now'}});
  await api.createEffect(v,{id:'hit',nameKey:'Hit',targetRef:ref('vitality','pool','pool.current','points'),targetRole:'target',operation:'subtract',operand:{kind:'literal',value:3}});
  await api.createAction(v,{id:'shoot',nameKey:'Shoot',conditionRefs:['has-ammo'],costEffectRefs:['spend'],effectRefs:['hit']});
  await api.createAction(v,{id:'reload',nameKey:'Reload',effectRefs:['load','unreserve']});
  await api.createContentTemplate(v,{id:'pistol',nameKey:'Pistol',contentTypeId:'gun',data:{loaded:2,magazine:6,reserve:10},relations:[{id:'shoot',operation:'grant',targetRef:{objectKind:'action',objectId:'shoot'}},{id:'reload',operation:'grant',targetRef:{objectKind:'action',objectId:'reload'}}],choiceGroups:[]});
  await api.publishRuleset(v);
  const actors=new Map(),adapter=new Adapter(actors),runtime=createRuntimeAPI(api,{adapter,hooks:null}),bridge=new FoundryContentBridge(api,runtime,{hooks:null});
  const actor=uuid=>{const a=new ActorMock(uuid);actors.set(uuid,a);return a;};
  return {api,v,runtime,bridge,actor};
}

test('An Effect writes a number field of the Content used, and the next Effects read what the previous ones did', async()=>{
  const {v,runtime,bridge,actor}=await system();
  const hero=actor('Actor.hero'),foe=actor('Actor.foe');
  for(const a of [hero,foe])await runtime.initializeContainer(v,a.uuid);
  await runtime.instantiateDefinition(v,foe.uuid,'vitality',{initial:{'pool.points.current':20}}).catch(()=>{});
  await bridge.acquireTemplate(v,hero.uuid,'pistol',{sourceItemId:'gun-1'});
  const use=actionId=>runtime.executeAction(v,actionId,{roles:{self:hero.uuid,target:foe.uuid},content:{key:'gun-1',role:'self'}});
  const fields=async()=>(await runtime.listOwnedContents(v,hero.uuid)).find(row=>row.key==='gun-1').fields;
  const shot=await use('shoot');
  assert.equal(shot.allowed,true);
  assert.deepEqual(shot.changes.find(change=>change.effectId==='spend'),{effectId:'spend',before:2,after:1,operand:1,containerRef:shot.changes.find(change=>change.effectId==='spend').containerRef,contentKey:'gun-1',fieldId:'loaded'});
  await use('shoot');
  assert.equal((await fields()).loaded,0);
  assert.equal((await use('shoot')).allowed,false,'an empty magazine');
  await use('reload');
  assert.deepEqual([(await fields()).loaded,(await fields()).reserve],[6,4],'six loaded, taken from the reserve');
});

test('An Effect on a Content field is checked when saved and needs a Content in use', async()=>{
  const {api,v,runtime,actor}=await system();
  await assert.rejects(api.createEffect(v,{id:'bad',nameKey:'Bad',targetContentField:'two words',operation:'add',operand:{kind:'literal',value:1}}),/Content field id/);
  await assert.rejects(api.createEffect(v,{id:'both',nameKey:'Both',targetContentField:'loaded',targetDefinitionFormulaRef:'to-load',operation:'add',operand:{kind:'literal',value:1}}),/not both/);
  const hero=actor('Actor.hero');await runtime.initializeContainer(v,hero.uuid);
  await assert.rejects(runtime.executeAction(v,'reload',{roles:{self:hero.uuid}}),/no Content is used/);
});

test('The Effect editor offers the number fields of the Content Types as targets', async()=>{
  const {collectEntryData}=await import('../src/configurator/entry-data-collector.mjs');
  const fd=new Map(Object.entries({nameKey:'Spend',targetRef:'contentField|loaded',targetRole:'self',targetDefinitionFormulaRef:'x',operation:'subtract',operandKind:'literal',operandLiteral:'1'}));
  const data=collectEntryData('effect',{fd,current:{id:'spend'},bool:()=>true,checkedIds:()=>[],queryOne:()=>null,queryAll:()=>[],uid:()=>'x',fieldUid:()=>'y'});
  assert.equal(data.targetContentField,'loaded');assert.equal(data.targetRef,null);assert.equal(data.targetDefinitionFormulaRef,null);
});
