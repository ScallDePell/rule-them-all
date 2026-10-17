import test from 'node:test';
import assert from 'node:assert/strict';
import {createConfiguratorAPI} from '../src/configurator/configurator-api.mjs';
import {emptyStorageSnapshot} from '../src/configurator/configurator-storage.mjs';
import {prepareCreationSystem} from '../src/configurator/rule-contracts.mjs';
import {analyzeCreationSystem} from '../src/runtime/creation-plan.mjs';
import {CreationSessions, MemoryCreationSessionStore} from '../src/runtime/creation-sessions.mjs';
import {FoundryContentBridge} from '../src/runtime/foundry-content-bridge.mjs';
import {MemoryRuntimeAdapter} from '../src/runtime/memory-runtime-adapter.mjs';
import {createRuntimeAPI} from '../src/runtime/runtime-api.mjs';
import {creationView, readCreationAnswer, renderCreationHTML} from '../src/ui/creation-markup.mjs';

class Storage{data=emptyStorageSnapshot();async load(){return structuredClone(this.data)}async save(data){this.data=structuredClone(data)}}
class Actors{map=new Map();async create({name}){const id=`Actor.${this.map.size+1}`,actor={uuid:id,documentName:'Actor',name,flags:{},getFlag(s,k){return this.flags[s]?.[k]},async setFlag(s,k,v){(this.flags[s]??={})[k]=structuredClone(v)},async delete(){}};this.map.set(id,actor);return actor;}}
class Adapter extends MemoryRuntimeAdapter{constructor(actors){super();this.actors=actors}async resolveDocument(uuid){const doc=this.actors.map.get(uuid);if(!doc)throw new Error('Document not found');return doc}}
const plus=id=>({id,targetRef:{objectKind:'definition',objectId:id},operation:'grant',config:{add:{'value.base':1}}});

async function build(){
  const api=await createConfiguratorAPI(new Storage()),v=(await api.createRuleset({id:'cc',nameKey:'CC',version:'1.0.0'})).versionId;
  await api.registerDefinitionType(v,{id:'skill',key:'skill',nameKey:'Skill',allowedCapabilities:['value'],defaultCapabilities:['value'],requiredCapabilities:['value'],fields:{}});
  for(const id of ['law','tech','charm'])await api.createDefinition(v,{id,key:id,nameKey:id,definitionTypeId:'skill',capabilities:['value'],data:{}});
  await api.createContentType(v,{id:'career',nameKey:'Career',storageKind:'item',fields:{}});
  await api.createContentType(v,{id:'event',nameKey:'Event',storageKind:'item',fields:{}});
  await api.createContentTemplate(v,{id:'cop',nameKey:'Cop',contentTypeId:'career',relations:['law','tech','charm'].map(id=>({id,operation:'grant',targetRef:{objectKind:'definition',objectId:id}})),choiceGroups:[{id:'skill',name:'Skill (+1)',min:1,max:1,options:[plus('law'),plus('tech')]}]});
  await api.createContentTemplate(v,{id:'flood',nameKey:'Flood',contentTypeId:'event'});
  await api.createCreationSystem(v,{id:'creation',nameKey:'Creation',steps:[
    {id:'career',name:'Career',kind:'content',min:1,max:1,source:{collection:'contentTemplates',objectIds:['cop']}},
    {id:'career-skills',name:'Career skills',kind:'contentChoices',source:{stepIds:['career']}},
    {id:'events',name:'Events',kind:'content',min:1,max:1,source:{collection:'contentTemplates',objectIds:['flood']}},
    {id:'event-choices',name:'Event choices',kind:'contentChoices',source:{stepIds:['events']}},
    {id:'review',name:'Review',kind:'review',required:false,min:0,max:0}
  ]});
  await api.publishRuleset(v);
  const actors=new Actors(),runtime=createRuntimeAPI(api,{adapter:new Adapter(actors),hooks:null});
  return {api,v,actors,runtime,bridge:new FoundryContentBridge(api,runtime,{hooks:null,documentTypeResolver:()=>'character'})};
}

test('A contentChoices step only covers earlier content steps, once each', () => {
  const step=(id,kind,more={})=>({id,name:id,kind,...more});
  assert.throws(()=>prepareCreationSystem({id:'c',nameKey:'C',steps:[step('ask','contentChoices',{source:{stepIds:['pick']}}),step('pick','content',{source:{collection:'contentTemplates',objectIds:[]}})]}),/not an earlier content step/);
  assert.throws(()=>prepareCreationSystem({id:'c',nameKey:'C',steps:[step('pick','content',{source:{collection:'contentTemplates',objectIds:[]}}),step('a','contentChoices',{source:{stepIds:['pick']}}),step('b','contentChoices',{source:{stepIds:['pick']}})]}),/asked on two steps/);
  assert.throws(()=>prepareCreationSystem({id:'c',nameKey:'C',steps:[step('pick','content',{source:{collection:'contentTemplates',objectIds:[]}}),step('a','contentChoices',{source:{stepIds:['pick']},draw:{}})]}),/no draw settings/);
});

test('The choices of a Content move to their own step, which is skipped when nothing is to choose', async () => {
  const {api,v,actors,runtime,bridge}=await build(),ruleset=api.getRuleset(v);
  let analysis=await analyzeCreationSystem(ruleset,'creation',{career:['cop'],events:['flood']});
  const byId=Object.fromEntries(analysis.steps.map(step=>[step.id,step]));
  assert.equal(byId.career.errors.length,0,'the career step no longer asks for the skill');
  assert.match(byId['career-skills'].errors.join(' '),/not been answered/);
  assert.equal(byId['event-choices'].skipped,true,'the event has no choice');
  assert.match((await analyzeCreationSystem(ruleset,'creation',{career:['cop'],'career-skills':{contentChoices:{cop:{skill:['charm']}}},events:['flood']})).steps.find(step=>step.id==='career-skills').errors.join(' '),/charm|option/i);
  const answers={career:['cop'],'career-skills':{contentChoices:{cop:{skill:['tech']}}},events:['flood']};
  analysis=await analyzeCreationSystem(ruleset,'creation',answers);
  assert.equal(analysis.complete,true);
  assert.deepEqual(analysis.operations.find(op=>op.templateId==='cop').selections,{skill:['tech']});
  globalThis.Actor={create:data=>actors.create(data)};
  try{
    const {actor}=await bridge.createActorFromCreationSystem(v,'creation',{name:'Hero',answers});
    const state=await runtime.getContainerState(actor.uuid);
    assert.equal(state.definitionStates.tech.capabilityStates.value.base,1,'the skill chosen on its own step');
    assert.equal(state.definitionStates.law.capabilityStates.value.base,0);
  }finally{delete globalThis.Actor;}
});

test('The wizard shows the choices on their step and passes over an empty one', async () => {
  const {api,v}=await build(),ruleset=api.getRuleset(v),t=key=>key;
  const sessions=new CreationSessions({configurator:api,store:new MemoryCreationSessionStore(),userId:()=>'u1',finalize:async()=>({})});
  let session=await sessions.start(v,'creation');
  session=await sessions.answer(session.id,'career',{selectedIds:['cop']});
  assert.equal(session.currentStepId,'career-skills');
  let context=await sessions.context(session.id),view=creationView(context,ruleset,t);
  assert.equal(view.step.kind,'contentChoices');
  assert.deepEqual(view.step.groups.map(group=>group.options.map(option=>option.id)),[['law','tech']]);
  assert.equal(view.steps.some(step=>step.id==='event-choices'),false,'an empty choices step is left out of the list');
  const html=renderCreationHTML(view,{t});
  assert.match(html,/data-creation-choice/);
  const root={querySelectorAll:selector=>selector==='[data-creation-choice]:checked'?[{dataset:{template:'cop',group:'skill'},value:'tech'}]:[]};
  assert.deepEqual(readCreationAnswer(root,view.step),{contentChoices:{cop:{skill:['tech']}}});
  // The career step itself no longer shows the choice.
  session=await sessions.goTo(session.id,'career');
  context=await sessions.context(session.id);
  assert.deepEqual(creationView(context,ruleset,t).step.groups,[]);
  session=await sessions.answer(session.id,'career-skills',{contentChoices:{cop:{skill:['tech']}}});
  session=await sessions.answer(session.id,'events',{selectedIds:['flood']});
  assert.equal(session.currentStepId,'review','the empty choices step is passed over');
});

test('A creation adds the steps up before bounding the values: a penalty is not lost to the minimum', async () => {
  const api=await createConfiguratorAPI(new Storage()),v=(await api.createRuleset({id:'b',nameKey:'B',version:'1.0.0'})).versionId;
  await api.createFormula(v,{id:'one',nameKey:'One',resultType:'number',expression:{type:'literal',value:1}});
  await api.createFormula(v,{id:'five',nameKey:'Five',resultType:'number',expression:{type:'literal',value:5}});
  await api.registerDefinitionType(v,{id:'attribute',key:'attribute',nameKey:'Attribute',allowedCapabilities:['value'],defaultCapabilities:['value'],requiredCapabilities:['value'],fields:{},valueBounds:{minimum:{formulaRef:'one'},maximum:{formulaRef:'five'}}});
  for(const id of ['strength','mind'])await api.createDefinition(v,{id,key:id,nameKey:id,definitionTypeId:'attribute',capabilities:['value'],data:{}});
  await api.createContentType(v,{id:'age',nameKey:'Age',storageKind:'item',fields:{}});
  await api.createContentTemplate(v,{id:'elder',nameKey:'Elder',contentTypeId:'age',relations:['strength','mind'].map(id=>({id,operation:'grant',targetRef:{objectKind:'definition',objectId:id},config:{initial:{'value.base':1}}})),
    choiceGroups:[{id:'penalty',name:'Penalty',min:1,max:1,options:[{id:'strength',targetRef:{objectKind:'definition',objectId:'strength'},operation:'grant',config:{add:{'value.base':-1}}}]}]});
  await api.createCreationSystem(v,{id:'creation',nameKey:'Creation',steps:[
    {id:'age',name:'Age',kind:'content',min:1,max:1,source:{collection:'contentTemplates',objectIds:['elder']}},
    {id:'age-effects',name:'Age effects',kind:'contentChoices',source:{stepIds:['age']}},
    {id:'points',name:'Points',kind:'allocation',min:2,max:2,source:{collection:'definitions',objectIds:['strength','mind']}}]});
  await api.publishRuleset(v);
  const actors=new Actors(),runtime=createRuntimeAPI(api,{adapter:new Adapter(actors),hooks:null}),bridge=new FoundryContentBridge(api,runtime,{hooks:null,documentTypeResolver:()=>'character'});
  globalThis.Actor={create:data=>actors.create(data)};
  try{
    const {actor}=await bridge.createActorFromCreationSystem(v,'creation',{name:'Elder',answers:{age:['elder'],'age-effects':{contentChoices:{elder:{penalty:['strength']}}},points:{allocations:{strength:2}}}});
    const state=await runtime.getContainerState(actor.uuid);
    assert.equal(state.definitionStates.strength.capabilityStates.value.base,2,'1 − 1 + 2, not 1 (bounded) + 2');
    const {actor:low}=await bridge.createActorFromCreationSystem(v,'creation',{name:'Low',answers:{age:['elder'],'age-effects':{contentChoices:{elder:{penalty:['strength']}}},points:{allocations:{mind:2}}}});
    assert.equal((await runtime.getContainerState(low.uuid)).definitionStates.strength.capabilityStates.value.base,1,'the built character is still bounded');
  }finally{delete globalThis.Actor;}
});
