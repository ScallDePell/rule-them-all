import test from 'node:test';
import assert from 'node:assert/strict';
import {createConfiguratorAPI} from '../src/configurator/configurator-api.mjs';
import {emptyStorageSnapshot} from '../src/configurator/configurator-storage.mjs';
import {MemoryRuntimeAdapter} from '../src/runtime/memory-runtime-adapter.mjs';
import {createRuntimeAPI} from '../src/runtime/runtime-api.mjs';
import {FoundryContentBridge} from '../src/runtime/foundry-content-bridge.mjs';

class Storage{data=emptyStorageSnapshot();async load(){return structuredClone(this.data)}async save(next){this.data=structuredClone(next)}}
class ActorMock{constructor(uuid){this.uuid=uuid;this.documentName='Actor';this.flags={};}getFlag(s,k){return this.flags[s]?.[k]}async setFlag(s,k,v){(this.flags[s]??={})[k]=structuredClone(v)}}
class Adapter extends MemoryRuntimeAdapter{constructor(actors){super();this.actors=actors}async resolveDocument(uuid){const a=this.actors.get(uuid);if(!a)throw new Error('Actor not found');return a}async canWrite(){return true}
  async roll(formula){return {formula,total:10,natural:10,result:'10'};}}
const field=(id,valueType)=>({id,name:id,valueType,cardinality:'one',nullable:false,required:false,constraints:[]});
const def=id=>({objectKind:'definition',objectId:id});
const chosen={type:'context',path:'variables.test.inputs.skill'};

async function system(){
  const api=await createConfiguratorAPI(new Storage());
  const v=(await api.createRuleset({id:'skills',nameKey:'Skills',version:'1.0.0'})).versionId;
  await api.registerDefinitionType(v,{id:'attribute',key:'attribute',nameKey:'Attribute',allowedCapabilities:['value'],defaultCapabilities:['value'],requiredCapabilities:[],fields:{}});
  await api.registerDefinitionType(v,{id:'skill',key:'skill',nameKey:'Skill',allowedCapabilities:['value'],defaultCapabilities:['value'],requiredCapabilities:[],fields:{attribute:{...field('attribute','reference')}}});
  for(const id of ['mind','body'])await api.createDefinition(v,{id,key:id,nameKey:id,definitionTypeId:'attribute',capabilities:['value'],data:{}});
  await api.createDefinition(v,{id:'occult',key:'occult',nameKey:'Occult',definitionTypeId:'skill',capabilities:['value'],data:{attribute:def('mind')}});
  await api.createDefinition(v,{id:'climb',key:'climb',nameKey:'Climb',definitionTypeId:'skill',capabilities:['value'],data:{attribute:def('body')}});
  await api.createFormula(v,{id:'asked-skill',nameKey:'Asked skill',resultType:'reference',expression:{type:'context',path:'variables.skill'}});
  // One bonus for every skill: the skill's value plus its own attribute's value.
  await api.createFormula(v,{id:'skill-bonus',nameKey:'Skill bonus',resultType:'number',expression:{type:'add',args:[
    {type:'definitionValue',definition:chosen,capabilityId:'value',outputId:'value.final'},
    {type:'definitionValue',definition:{type:'definitionField',definition:chosen,field:'attribute'},capabilityId:'value',outputId:'value.final'}]}});
  await api.createRoll(v,{id:'d20',nameKey:'d20',formula:'1d20'});
  await api.createTest(v,{id:'skill-check',nameKey:'Skill check',rollRef:'d20',bonusFormulaRef:'skill-bonus',targetValue:13,inputBindings:[{id:'skill',valueType:'reference',source:{formulaRef:'asked-skill'}}]});
  // A latent power is known once the mind reaches its own threshold.
  await api.createCondition(v,{id:'power-known',nameKey:'Power known',expression:{type:'gte',left:{type:'reference',reference:{...def('mind'),capabilityId:'value',outputId:'value.final'}},right:{type:'contentField',field:'threshold'}}});
  await api.createContentType(v,{id:'power',nameKey:'Power',storageKind:'item',runtimeMode:'unique',availabilityConditionRef:'power-known',fields:{threshold:field('threshold','integer')}});
  await api.createAction(v,{id:'cast',nameKey:'Cast',testRef:'skill-check'});
  await api.createContentTemplate(v,{id:'ward',nameKey:'Ward',contentTypeId:'power',data:{threshold:3},relations:[{id:'cast',operation:'grant',targetRef:{objectKind:'action',objectId:'cast'}}],choiceGroups:[]});
  await api.publishRuleset(v);
  const actors=new Map(),runtime=createRuntimeAPI(api,{adapter:new Adapter(actors),hooks:null}),bridge=new FoundryContentBridge(api,runtime,{hooks:null});
  const hero=new ActorMock('Actor.hero');actors.set(hero.uuid,hero);
  await runtime.initializeContainer(v,hero.uuid);
  for(const [id,base] of [['mind',2],['body',4],['occult',1],['climb',3]])await runtime.setDefinitionState(v,hero.uuid,id,{base});
  return {api,v,runtime,bridge,hero};
}

test('One Test serves every skill: the bonus reads the chosen skill and its own attribute', async()=>{
  const {v,runtime,hero}=await system();
  const check=skill=>runtime.executeTest(v,'skill-check',{roles:{self:hero.uuid},variables:{skill:def(skill)}});
  assert.equal((await check('occult')).bonus,3,'occult 1 + mind 2');
  assert.equal((await check('climb')).bonus,7,'climb 3 + body 4');
  await assert.rejects(check('nothing'),/Definition/);
});

test('A Content Type availability Condition reads the Content\'s own fields', async()=>{
  const {v,runtime,bridge,hero}=await system();
  await bridge.acquireTemplate(v,hero.uuid,'ward',{sourceItemId:'ward-1'});
  const [row]=await runtime.listOwnedContents(v,hero.uuid);
  assert.equal(row.available,false,'mind 2 is below the threshold 3');
  await assert.rejects(bridge.executeAcquiredAction(v,hero.uuid,'cast',{variables:{skill:def('occult')}},{contentKey:'ward-1'}),/not available/);
  await runtime.setDefinitionState(v,hero.uuid,'mind',{base:3});
  assert.equal((await runtime.listOwnedContents(v,hero.uuid))[0].available,true);
  const result=await bridge.executeAcquiredAction(v,hero.uuid,'cast',{variables:{skill:def('occult')}},{contentKey:'ward-1'});
  assert.ok(result);
});

test('Saving refuses an availability Condition that does not exist', async()=>{
  const api=await createConfiguratorAPI(new Storage());
  const v=(await api.createRuleset({id:'bad',nameKey:'Bad',version:'1.0.0'})).versionId;
  await assert.rejects(api.createContentType(v,{id:'power',nameKey:'Power',storageKind:'item',availabilityConditionRef:'missing'}),/condition\/missing/);
});
