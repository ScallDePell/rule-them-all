import test from 'node:test';
import assert from 'node:assert/strict';
import {createConfiguratorAPI} from '../src/configurator/configurator-api.mjs';
import {emptyStorageSnapshot} from '../src/configurator/configurator-storage.mjs';
import {MemoryRuntimeAdapter} from '../src/runtime/memory-runtime-adapter.mjs';
import {RuntimeEngine} from '../src/runtime/runtime-engine.mjs';
import {createRuntimeAPI} from '../src/runtime/runtime-api.mjs';
import {FoundryContentBridge} from '../src/runtime/foundry-content-bridge.mjs';

class Storage{value=emptyStorageSnapshot();async load(){return structuredClone(this.value)}async save(v){this.value=structuredClone(v)}}
const hero={kind:'actor',id:'hero'},context={roles:{self:hero,target:hero},defaultRole:'self'};
const ctx=path=>({type:'context',path}),lit=value=>({type:'literal',value});

async function rules(){
  const api=await createConfiguratorAPI(new Storage());
  const v=(await api.createRuleset({id:'gaps',nameKey:'Gaps',version:'1'})).versionId;
  await api.registerDefinitionType(v,{id:'feat',key:'feat',nameKey:'Feat',allowedCapabilities:['state'],defaultCapabilities:['state'],requiredCapabilities:[],fields:{}});
  await api.registerDefinitionType(v,{id:'condition',key:'condition',nameKey:'Condition',allowedCapabilities:['state'],defaultCapabilities:['state'],requiredCapabilities:[],fields:{}});
  await api.registerDefinitionType(v,{id:'score',key:'score',nameKey:'Score',allowedCapabilities:['value'],defaultCapabilities:['value'],requiredCapabilities:[],fields:{}});
  for(const id of ['alert','tough','lucky'])await api.createDefinition(v,{id,key:id,nameKey:id,definitionTypeId:'feat',capabilities:['state'],data:{}});
  for(const id of ['prone','blinded'])await api.createDefinition(v,{id,key:id,nameKey:id,definitionTypeId:'condition',capabilities:['state'],data:{}});
  await api.createDefinition(v,{id:'strength',key:'strength',nameKey:'Strength',definitionTypeId:'score',capabilities:['value'],data:{}});
  await api.createFormula(v,{id:'chosen-condition',nameKey:'Chosen condition',resultType:'reference',expression:ctx('variables.input.condition')});
  await api.createFormula(v,{id:'reach',nameKey:'Reach',resultType:'number',expression:{type:'distance',from:'self',to:'target',default:lit(1.5)}});
  await api.createAction(v,{id:'pick-feat',nameKey:'Pick a feat',inputs:[{id:'feat',valueType:'reference',definitionTypeId:'feat',from:'unheld'}]});
  await api.createAction(v,{id:'use-feat',nameKey:'Use a feat',inputs:[{id:'feat',valueType:'reference',definitionTypeId:'feat',from:'held'}]});
  await api.createAction(v,{id:'any-feat',nameKey:'Any feat',inputs:[{id:'feat',valueType:'reference',definitionTypeId:'feat',from:'all'}]});
  await api.createAction(v,{id:'inflict',nameKey:'Inflict',inputs:[{id:'condition',valueType:'reference',definitionTypeId:'condition',from:'all'}],stateApplications:[{definitionFormulaRef:'chosen-condition',targetRole:'target'}]});
  await api.createAction(v,{id:'cure',nameKey:'Cure',inputs:[{id:'condition',valueType:'reference',definitionTypeId:'condition',from:'all'}],stateRemovals:[{definitionFormulaRef:'chosen-condition',targetRole:'target'}]});
  return {api,v};
}

test('A reference input offers the Definitions held, all of them, or those not held yet', async()=>{
  const {api,v}=await rules();await api.publishRuleset(v);
  const engine=new RuntimeEngine({configurator:api,adapter:new MemoryRuntimeAdapter(),hooks:null});
  await engine.initializeContainer(v,hero,{definitionIds:['alert']});
  const offered=async id=>(await engine.describeActionInputs(v,id,context))[0].options.map(option=>option.value);
  assert.deepEqual(await offered('pick-feat'),['tough','lucky']);
  assert.deepEqual(await offered('use-feat'),['alert']);
  assert.deepEqual(await offered('any-feat'),['alert','tough','lucky']);
  await assert.rejects(api.createAction(v,{id:'bad',nameKey:'Bad',inputs:[{id:'x',valueType:'reference',definitionTypeId:'feat',from:'some'}]}),/from must be one of/);
});

test('An Action applies and removes the state a Formula names', async()=>{
  const {api,v}=await rules();await api.publishRuleset(v);
  const engine=new RuntimeEngine({configurator:api,adapter:new MemoryRuntimeAdapter(),hooks:null});
  await engine.initializeContainer(v,hero,{definitionIds:['strength']});
  const has=async id=>(await engine.getContainerState(hero)).stateInstances.some(instance=>instance.definitionId===id);
  await engine.executeAction(v,'inflict',{...context,variables:{input:{condition:'blinded'}}});
  assert.equal(await has('blinded'),true);assert.equal(await has('prone'),false);
  await engine.executeAction(v,'cure',{...context,variables:{input:{condition:'blinded'}}});
  assert.equal(await has('blinded'),false);
  await assert.rejects(api.createAction(v,{id:'both',nameKey:'Both',stateApplications:[{definitionId:'prone',definitionFormulaRef:'chosen-condition'}]}),/not both/);
});

test('A distance falls back to its default when nothing can be measured', async()=>{
  const {api,v}=await rules();await api.publishRuleset(v);
  const engine=new RuntimeEngine({configurator:api,adapter:new MemoryRuntimeAdapter(),hooks:null});
  assert.equal(await engine.evaluator(v).formula('reach',context),1.5);
});

class Actors{map=new Map();
  make(name,flags={}){const id=`Actor.${this.map.size+1}`,items=[],actor={uuid:id,documentName:'Actor',name,flags:structuredClone(flags),items,
    getFlag(s,k){return this.flags[s]?.[k]},async setFlag(s,k,v){(this.flags[s]??={})[k]=structuredClone(v)},async delete(){},
    async createEmbeddedDocuments(kind,rows){return rows.map(data=>{const item={id:`item-${items.length+1}`,uuid:`${id}.Item.${items.length+1}`,documentName:kind,parent:actor,name:data.name,flags:structuredClone(data.flags),getFlag(s,k){return this.flags[s]?.[k]},async delete(){items.splice(items.indexOf(item),1)}};items.push(item);return item;});}};
    this.map.set(id,actor);return actor;}}
class Adapter extends MemoryRuntimeAdapter{constructor(actors){super();this.actors=actors}async resolveDocument(uuid){const doc=this.actors.map.get(uuid);if(!doc)throw new Error('Document not found');return doc}}

test('An Actor made from an Actor Content takes on its template and receives the Contents it grants', async()=>{
  const {api,v}=await rules();
  await api.createContentType(v,{id:'creature',nameKey:'Creature',storageKind:'actor',fields:{}});
  await api.createContentType(v,{id:'attack',nameKey:'Attack',storageKind:'item',runtimeMode:'stackable',fields:{}});
  await api.createContentTemplate(v,{id:'bite',nameKey:'Bite',contentTypeId:'attack'});
  await api.createContentTemplate(v,{id:'wolf',nameKey:'Wolf',contentTypeId:'creature',relations:[
    {id:'str',operation:'grant',targetRef:{objectKind:'definition',objectId:'strength'},config:{initial:{'value.base':12}}},
    {id:'alert',operation:'grant',targetRef:{objectKind:'definition',objectId:'alert'},config:{initial:{'state.active':true}}},
    {id:'bite',operation:'grant',targetRef:{objectKind:'contentTemplate',objectId:'bite'},config:{count:2}}]});
  await api.publishRuleset(v);
  const actors=new Actors(),runtime=createRuntimeAPI(api,{adapter:new Adapter(actors),hooks:null});
  const bridge=new FoundryContentBridge(api,runtime,{hooks:null,documentTypeResolver:()=>'npc'});
  const template=api.getRuleset(v).contentTemplates.find(t=>t.id==='wolf'),type=api.getRuleset(v).contentTypes.find(t=>t.id==='creature');
  const wolf=actors.make('Wolf',bridge.documentData(v,template,type).flags);
  const acquisition=await bridge.applyActorTemplate(wolf.uuid);
  assert.equal(acquisition.templateId,'wolf');
  const state=await runtime.getContainerState(wolf.uuid);
  assert.equal(state.definitionStates.strength.capabilityStates.value.base,12);
  assert.equal(state.definitionStates.alert.capabilityStates.state.active,true);
  assert.deepEqual(wolf.items.map(item=>item.name),['Bite','Bite'],'two bites, each an owned Content');
  assert.equal(Object.values(wolf.getFlag('rule-them-all','contentAcquisitions')).filter(a=>a.templateId==='bite').length,2);
  assert.equal(await bridge.applyActorTemplate(wolf.uuid),null,'applied once');
  assert.equal(await bridge.applyActorTemplate(actors.make('Plain').uuid),null,'an Actor without Content is left alone');
});

test('A state a milestone grants is held, active, from then on', async()=>{
  const {api,v}=await rules();
  await api.createCondition(v,{id:'strong',nameKey:'Strong',expression:{type:'gte',left:{type:'reference',reference:{objectKind:'definition',objectId:'strength',capabilityId:'value',outputId:'value.final'}},right:lit(10)}});
  await api.createProgressionSystem(v,{id:'levels',nameKey:'Levels',milestones:[{id:'tough',labelKey:'Tough',conditionRef:'strong',definitionIds:['tough','strength']}]});
  await api.publishRuleset(v);
  const engine=new RuntimeEngine({configurator:api,adapter:new MemoryRuntimeAdapter(),hooks:null});
  await engine.initializeContainer(v,hero,{definitionIds:['strength'],initialByDefinition:{strength:{'value.base':12}}});
  await engine.applyMilestones(v,'levels',hero);
  const state=await engine.getContainerState(hero);
  assert.equal(state.definitionStates.tough.capabilityStates.state.active,true);
  assert.equal(state.definitionStates.strength.capabilityStates.value.base,12,'a value already held is left as it is');
});

test('The generic Item sheet offers the Actions its template grants; the Actor sheet leaves them to the Items', async()=>{
  const {autoLayout,sheetActionIds,contentGrantedActionIds}=await import('../src/configurator/sheet-auto-layout.mjs');
  const ruleset={definitionTypes:[],definitions:[],progressionSystems:[],triggers:[],tables:[],
    actions:[{id:'swing'},{id:'cast'},{id:'rest'}],
    contentTypes:[{id:'weapon',storageKind:'item',fields:{damage:{id:'damage',valueType:'string'}}},{id:'spell',storageKind:'item',fields:{}}],
    contentTemplates:[{id:'sword',contentTypeId:'weapon',relations:[{id:'a',operation:'grant',targetRef:{objectKind:'action',objectId:'swing'}}]},
      {id:'bolt',contentTypeId:'spell',relations:[],choiceGroups:[{id:'g',options:[{id:'o',operation:'grant',targetRef:{objectKind:'action',objectId:'cast'}}]}]}]};
  assert.deepEqual([...contentGrantedActionIds(ruleset)],['swing','cast']);
  const ids=node=>[...(node.kind==='action'?[node.actionRef]:[]),...(node.children??[]).flatMap(ids)];
  assert.deepEqual(ids(autoLayout(ruleset,{target:'actor'})),['rest']);
  assert.deepEqual(ids(autoLayout(ruleset,{target:'item',contentTypeIds:['weapon']})),['swing']);
  assert.deepEqual(sheetActionIds(ruleset),['swing','cast','rest'],'still started by a player');
});
