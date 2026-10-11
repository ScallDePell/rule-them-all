import test from 'node:test';
import assert from 'node:assert/strict';
import {createConfiguratorAPI} from '../src/configurator/configurator-api.mjs';
import {emptyStorageSnapshot} from '../src/configurator/configurator-storage.mjs';
import {MemoryRuntimeAdapter} from '../src/runtime/memory-runtime-adapter.mjs';
import {createRuntimeAPI} from '../src/runtime/runtime-api.mjs';
import {FoundryContentBridge} from '../src/runtime/foundry-content-bridge.mjs';

class Storage{data=emptyStorageSnapshot();async load(){return structuredClone(this.data)}async save(next){this.data=structuredClone(next)}}
class ActorMock{constructor(uuid){this.uuid=uuid;this.documentName='Actor';this.flags={};}getFlag(s,k){return this.flags[s]?.[k]}async setFlag(s,k,v){(this.flags[s]??={})[k]=structuredClone(v)}}
class Adapter extends MemoryRuntimeAdapter{constructor(actors){super();this.actors=actors;this.rolled=[]}async resolveDocument(uuid){const a=this.actors.get(uuid);if(!a)throw new Error('Actor not found');return a}async canWrite(){return true}
  async roll(formula){this.rolled.push(formula);const dice=[...formula.matchAll(/(\d+)d\d+/g)].reduce((n,m)=>n+Number(m[1]),0);return {formula,total:dice*3,result:String(dice*3)};}}
const field=(id,valueType)=>({id,name:id,valueType,cardinality:'one',nullable:false,required:false,constraints:[]});
const ref=(objectId,capabilityId,outputId,slotId)=>({objectKind:'definition',objectId,capabilityId,outputId,...(slotId?{slotId}:{})});

async function system(){
  const api=await createConfiguratorAPI(new Storage());
  const v=(await api.createRuleset({id:'gear',nameKey:'Gear',version:'1.0.0'})).versionId;
  await api.registerDefinitionType(v,{id:'stat',key:'stat',nameKey:'Stat',allowedCapabilities:['value','pool'],defaultCapabilities:['value'],requiredCapabilities:[],fields:{}});
  await api.createDefinition(v,{id:'vitality',key:'vitality',nameKey:'Vitality',definitionTypeId:'stat',capabilities:['pool'],slots:{pool:[{id:'points',minimum:{literal:0},maximum:{literal:20}}]},data:{}});
  await api.createDefinition(v,{id:'protection',key:'protection',nameKey:'Protection',definitionTypeId:'stat',capabilities:['value'],data:{}});
  await api.createContentType(v,{id:'armour',nameKey:'Armour',storageKind:'item',runtimeMode:'stackable',fields:{protection:field('protection','integer'),equipped:field('equipped','boolean')}});
  await api.createContentType(v,{id:'weapon',nameKey:'Weapon',storageKind:'item',runtimeMode:'stackable',fields:{damage:field('damage','string')}});
  await api.createFormula(v,{id:'protection-sum',nameKey:'Protection',resultType:'number',expression:{type:'min',args:[{type:'literal',value:10},{type:'contentAggregate',operation:'sum',contentTypeId:'armour',field:'protection',whereField:'equipped'}]}});
  await api.createFormulaBinding(v,{id:'protection-binding',nameKey:'Protection',formulaRef:'protection-sum',targetRef:ref('protection','value','value.final')});
  await api.createRoll(v,{id:'weapon-damage',nameKey:'Weapon damage',formula:'@content.damage'});
  await api.createEffect(v,{id:'hit',nameKey:'Hit',targetRef:ref('vitality','pool','pool.current','points'),targetRole:'target',operation:'subtract',operand:{kind:'roll',rollRef:'weapon-damage'}});
  await api.createAction(v,{id:'attack',nameKey:'Attack',effectRefs:['hit']});
  await api.createContentTemplate(v,{id:'vest',nameKey:'Vest',contentTypeId:'armour',data:{protection:3,equipped:true},relations:[],choiceGroups:[]});
  await api.createContentTemplate(v,{id:'helmet',nameKey:'Helmet',contentTypeId:'armour',data:{protection:2,equipped:false},relations:[],choiceGroups:[]});
  await api.createContentTemplate(v,{id:'sword',nameKey:'Sword',contentTypeId:'weapon',data:{damage:'1d8'},relations:[{id:'attack',operation:'grant',targetRef:{objectKind:'action',objectId:'attack'}}],choiceGroups:[]});
  await api.createContentTemplate(v,{id:'axe',nameKey:'Axe',contentTypeId:'weapon',data:{damage:'2d6'},relations:[{id:'attack',operation:'grant',targetRef:{objectKind:'action',objectId:'attack'}}],choiceGroups:[]});
  await api.publishRuleset(v);
  const actors=new Map(),adapter=new Adapter(actors),runtime=createRuntimeAPI(api,{adapter,hooks:null}),bridge=new FoundryContentBridge(api,runtime,{hooks:null});
  const actor=uuid=>{const a=new ActorMock(uuid);actors.set(uuid,a);return a;};
  return {v,runtime,bridge,actor,adapter};
}

test('A Formula sums a field over the equipped Contents an Actor owns', async()=>{
  const {v,runtime,bridge,actor}=await system();
  const hero=actor('Actor.hero');
  await runtime.initializeContainer(v,hero.uuid);
  const protection=()=>runtime.evaluateFormula(v,'protection-sum',{roles:{self:hero.uuid}});
  await bridge.acquireTemplate(v,hero.uuid,'vest',{sourceItemId:'vest-1'});
  await bridge.acquireTemplate(v,hero.uuid,'helmet',{sourceItemId:'helmet-1'});
  assert.equal(await protection(),3,'the helmet is not equipped');
  await runtime.setContentField(v,hero.uuid,'helmet-1','equipped',true);
  assert.equal(await protection(),5);
  await assert.rejects(runtime.setContentField(v,hero.uuid,'helmet-1','equipped','yes'),/equipped/);
  await bridge.acquireTemplate(v,hero.uuid,'vest',{sourceItemId:'vest-2'});
  assert.equal(await protection(),8,'two vests');
  await bridge.releaseAcquisition(hero.uuid,'vest-2');
  assert.equal(await protection(),5);
});

test('An Action used from a Content rolls that Content\'s damage', async()=>{
  const {v,runtime,bridge,actor,adapter}=await system();
  const hero=actor('Actor.hero'),foe=actor('Actor.foe');
  for(const a of [hero,foe])await runtime.initializeContainer(v,a.uuid);
  await bridge.acquireTemplate(v,hero.uuid,'sword',{sourceItemId:'sword-1'});
  await bridge.acquireTemplate(v,hero.uuid,'axe',{sourceItemId:'axe-1'});
  const vitality=async()=>(await runtime.getContainerState(foe.uuid)).definitionStates.vitality.capabilityStates.pool.points.current;
  await bridge.executeAcquiredAction(v,hero.uuid,'attack',{roles:{target:foe.uuid}},{contentKey:'axe-1'});
  assert.equal(adapter.rolled.at(-1),'2d6');assert.equal(await vitality(),14);
  await bridge.executeAcquiredAction(v,hero.uuid,'attack',{roles:{target:foe.uuid}},{contentKey:'sword-1'});
  assert.equal(adapter.rolled.at(-1),'1d8');assert.equal(await vitality(),11);
  await assert.rejects(bridge.executeAcquiredAction(v,hero.uuid,'attack',{roles:{target:foe.uuid}},{contentKey:'missing'}),/not granted by Content/);
});

test('Publishing checks the Content Type and fields a contentAggregate reads', async()=>{
  const api=await createConfiguratorAPI(new Storage());
  const v=(await api.createRuleset({id:'bad',nameKey:'Bad',version:'1.0.0'})).versionId;
  await api.createContentType(v,{id:'armour',nameKey:'Armour',storageKind:'item',runtimeMode:'stackable',fields:{protection:field('protection','integer')}});
  await api.createFormula(v,{id:'f',nameKey:'F',resultType:'number',expression:{type:'contentAggregate',operation:'sum',contentTypeId:'armour',field:'weight'}});
  await assert.rejects(api.publishRuleset(v),/no field weight/);
  await assert.rejects(api.deleteContentType(v,'armour'),error=>error.code==='REFERENTIAL_INTEGRITY');
});
