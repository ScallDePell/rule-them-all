import test from 'node:test';
import assert from 'node:assert/strict';
import {createConfiguratorAPI} from '../src/configurator/configurator-api.mjs';
import {emptyStorageSnapshot} from '../src/configurator/configurator-storage.mjs';
import {MemoryRuntimeAdapter} from '../src/runtime/memory-runtime-adapter.mjs';
import {createRuntimeAPI} from '../src/runtime/runtime-api.mjs';
import {FoundryContentBridge} from '../src/runtime/foundry-content-bridge.mjs';

class Storage{data=emptyStorageSnapshot();async load(){return structuredClone(this.data)}async save(next){this.data=structuredClone(next)}}
class ActorMock{constructor(uuid){this.uuid=uuid;this.documentName='Actor';this.flags={};}getFlag(s,k){return this.flags[s]?.[k]}async setFlag(s,k,v){(this.flags[s]??={})[k]=structuredClone(v)}}
class Adapter extends MemoryRuntimeAdapter{constructor(actors){super();this.actors=actors}async resolveDocument(uuid){const a=this.actors.get(uuid);if(!a)throw new Error('Actor not found');return a}async canWrite(){return true}}
const grant=(id,config={})=>({id,operation:'grant',targetRef:{objectKind:'definition',objectId:id},config});

async function system(){
  const configurator=await createConfiguratorAPI(new Storage());
  const v=(await configurator.createRuleset({id:'add',nameKey:'Add',version:'1.0.0'})).versionId;
  await configurator.registerDefinitionType(v,{id:'skill',key:'skill',nameKey:'Skill',allowedCapabilities:['value'],defaultCapabilities:['value'],requiredCapabilities:['value'],fields:{}});
  for(const id of ['vigilance','stealth'])await configurator.createDefinition(v,{id,key:id,nameKey:id,definitionTypeId:'skill',capabilities:['value'],data:{}});
  await configurator.createContentType(v,{id:'origin',nameKey:'Origin',storageKind:'item',runtimeMode:'unique'});
  await configurator.createContentTemplate(v,{id:'base',nameKey:'Base',contentTypeId:'origin',relations:[grant('vigilance'),grant('stealth')],choiceGroups:[]});
  await configurator.createContentTemplate(v,{id:'police',nameKey:'Police',contentTypeId:'origin',relations:[grant('vigilance',{add:{'value.base':1}})],
    choiceGroups:[{id:'pick',name:'Pick',min:1,max:1,options:[{id:'o-vigilance',operation:'grant',targetRef:{objectKind:'definition',objectId:'vigilance'},config:{add:{'value.base':1}}},{id:'o-stealth',operation:'grant',targetRef:{objectKind:'definition',objectId:'stealth'},config:{add:{'value.base':1}}}]}]});
  await configurator.createContentTemplate(v,{id:'urban',nameKey:'Urban',contentTypeId:'origin',relations:[grant('vigilance',{add:{'value.base':1}})],choiceGroups:[]});
  await configurator.publishRuleset(v);
  const actors=new Map(),adapter=new Adapter(actors),runtime=createRuntimeAPI(configurator,{adapter,hooks:null});
  const bridge=new FoundryContentBridge(configurator,runtime,{hooks:null});
  const actor=uuid=>{const a=new ActorMock(uuid);actors.set(uuid,a);return a;};
  const base=async(uuid,id)=>(await runtime.getContainerState(uuid)).definitionStates[id]?.capabilityStates?.value?.base;
  return {v,bridge,actor,base};
}

test('Grants with config.add sum up across Contents and choices, in any order', async()=>{
  const {v,bridge,actor,base}=await system();
  for(const order of [['base','police','urban'],['urban','police','base']]){
    const a=actor(`Actor.${order.join('-')}`);
    for(const id of order)await bridge.acquireTemplate(v,a.uuid,id,{sourceItemId:id,selections:id==='police'?{pick:['o-vigilance']}:{}});
    assert.equal(await base(a.uuid,'vigilance'),3,order.join(' then '));
    assert.equal(await base(a.uuid,'stealth'),0);
  }
});

test('A grant adding to a Definition already there writes the new value', async()=>{
  const {v,bridge,actor,base}=await system();
  const a=actor('Actor.solo');
  await bridge.acquireTemplate(v,a.uuid,'base',{sourceItemId:'base'});
  const result=await bridge.acquireTemplate(v,a.uuid,'urban',{sourceItemId:'urban'});
  assert.deepEqual(result.createdDefinitionIds,[]);
  assert.equal(await base(a.uuid,'vigilance'),1);
});

test('Publishing refuses a config.add on anything but value.base', async()=>{
  const configurator=await createConfiguratorAPI(new Storage());
  const v=(await configurator.createRuleset({id:'bad',nameKey:'Bad',version:'1.0.0'})).versionId;
  await configurator.registerDefinitionType(v,{id:'skill',key:'skill',nameKey:'Skill',allowedCapabilities:['value'],defaultCapabilities:['value'],requiredCapabilities:['value'],fields:{}});
  await configurator.createDefinition(v,{id:'vigilance',key:'vigilance',nameKey:'Vigilance',definitionTypeId:'skill',capabilities:['value'],data:{}});
  await configurator.createContentType(v,{id:'origin',nameKey:'Origin',storageKind:'item',runtimeMode:'unique'});
  await configurator.createContentTemplate(v,{id:'bad',nameKey:'Bad',contentTypeId:'origin',relations:[grant('vigilance',{add:{'value.final':1}})],choiceGroups:[]});
  await assert.rejects(configurator.publishRuleset(v),/config\.add/);
});
