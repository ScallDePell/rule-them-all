import test from 'node:test';
import assert from 'node:assert/strict';
import {createConfiguratorAPI} from '../src/configurator/configurator-api.mjs';
import {emptyStorageSnapshot} from '../src/configurator/configurator-storage.mjs';
import {CreationSessions, MemoryCreationSessionStore} from '../src/runtime/creation-sessions.mjs';
import {creationView, renderCreationHTML, renderCreationStartHTML, readCreationAnswer} from '../src/ui/creation-markup.mjs';
import {startableSystems, neighbourStep, createCreationWindow} from '../src/runtime/foundry-creation.mjs';
class Storage{data=emptyStorageSnapshot();async load(){return structuredClone(this.data)}async save(data){this.data=structuredClone(data)}}
const grant=(id,objectId)=>({id,operation:'grant',targetRef:{objectKind:'definition',objectId},config:{add:{'value.base':1}}});

// An origin with its own pick of a skill, points on attributes, then careers term after term with a roll each.
async function build(){
  const api=await createConfiguratorAPI(new Storage()),v=(await api.createRuleset({id:'wiz',nameKey:'Wizard',version:'1'})).versionId;
  await api.registerDefinitionType(v,{id:'stat',key:'stat',nameKey:'Stat',allowedCapabilities:['value'],defaultCapabilities:['value'],requiredCapabilities:[],fields:{}});
  for(const [id,name] of [['str','Strength'],['int','Intellect'],['pilot','Pilot'],['gun','Gunnery']])await api.createDefinition(v,{id,key:id,nameKey:name,definitionTypeId:'stat',capabilities:['value'],data:{}});
  await api.createContentType(v,{id:'origin',nameKey:'Origin',storageKind:'item',runtimeMode:'unique'});
  await api.createContentTemplate(v,{id:'navy',nameKey:'Navy brat',contentTypeId:'origin',relations:[],choiceGroups:[{id:'pick',name:'A skill',min:1,max:1,options:[grant('o-pilot','pilot'),grant('o-gun','gun')]}]});
  await api.createContentTemplate(v,{id:'colony',nameKey:'Colonist',contentTypeId:'origin',relations:[],choiceGroups:[]});
  await api.createRoll(v,{id:'survival',nameKey:'2d6',formula:'2d6'});
  await api.createCreationSystem(v,{id:'creation',nameKey:'Traveller',steps:[
    {id:'origin',name:'Origin',kind:'content',min:1,max:1,source:{collection:'contentTemplates',objectIds:['navy','colony']}},
    {id:'attributes',name:'Attributes',kind:'allocation',min:4,max:4,perTargetMax:3,source:{collection:'definitions',objectIds:['str','int']}},
    {id:'survival',name:'Survival',kind:'roll',rollRef:'survival'},
    {id:'skill',name:'Skill',kind:'choice',min:1,max:1,source:{collection:'definitions',objectIds:['pilot','gun']},repeat:{steps:2,max:3}},
    {id:'done',name:'Review',kind:'review'}]});
  await api.publishRuleset(v);
  const rolls=[9,5];
  const sessions=new CreationSessions({configurator:api,store:new MemoryCreationSessionStore(),userId:()=>'alice',roll:async formula=>({total:rolls.shift(),result:formula}),finalize:async()=>({})});
  return {api,v,sessions,ruleset:()=>api.getPublishedRuleset(v)};
}
const t=key=>({'RTA.Creation.ChooseExactly':'Choose {count}.','RTA.Creation.Term':'Term {number}','RTA.Creation.Spent':'Spent: {count}','RTA.Creation.SpendExactly':'Spend {count} points.'})[key]??key;
// A tiny stand-in for the page: the inputs readCreationAnswer reads.
const page=inputs=>({querySelectorAll:selector=>inputs.filter(input=>selector.includes(input.kind)&&(!selector.includes(':checked')||input.checked))});

test('From the first step to the review, as a player clicks through', async()=>{
  const {v,sessions,ruleset}=await build();
  let {id}=await sessions.start(v,'creation');
  let view=creationView(await sessions.context(id),ruleset(),t);
  assert.equal(view.title,'Traveller');assert.deepEqual(view.steps.map(step=>step.state),['open','open','open','open','open']);
  assert.deepEqual(view.step.options,[{id:'navy',label:'Navy brat',checked:false},{id:'colony',label:'Colonist',checked:false}]);
  assert.equal(view.step.boundsText,'Choose 1.');assert.deepEqual(view.step.errors,[],'no error before an answer');
  let html=renderCreationHTML(view,{t});
  assert.match(html,/data-creation-single/);assert.match(html,/aria-current="step"/);assert.match(html,/data-creation-command="previous" disabled/);
  // Navy brat chosen: its own pick shows, and the answer read from the page carries it.
  await sessions.answer(id,'origin',{selectedIds:['navy']});await sessions.goTo(id,'origin');
  view=creationView(await sessions.context(id),ruleset(),t);
  assert.deepEqual(view.step.groups.map(group=>[group.label,group.options.map(o=>o.label)]),[['Navy brat · A skill',['Pilot','Gunnery']]]);
  assert.equal(view.steps[0].state,'error','the pick is missing');
  const answer=readCreationAnswer(page([{kind:'data-creation-option',value:'navy',checked:true},{kind:'data-creation-choice',value:'o-gun',checked:true,dataset:{template:'navy',group:'pick'}}]),view.step);
  assert.deepEqual(answer,{selectedIds:['navy'],contentChoices:{navy:{pick:['o-gun']}}});
  await sessions.answer(id,'origin',answer);
  view=creationView(await sessions.context(id),ruleset(),t);
  assert.equal(view.steps[0].state,'done');assert.equal(view.step.id,'attributes');
  assert.equal(view.step.boundsText,'Spend 4 points.');assert.match(renderCreationHTML(view,{t}),/max="3" data-creation-points="str"/);
  assert.deepEqual(readCreationAnswer(page([{kind:'data-creation-points',value:'3',dataset:{creationPoints:'str'}},{kind:'data-creation-points',value:'1',dataset:{creationPoints:'int'}}]),view.step),{allocations:{str:3,int:1}});
  await sessions.answer(id,'attributes',{allocations:{str:3,int:1}});
  view=creationView(await sessions.context(id),ruleset(),t);
  assert.equal(view.step.kind,'roll');assert.equal(view.step.canDraw,true);assert.equal(readCreationAnswer(page([]),view.step),null);
  await sessions.draw(id,'survival');
  await sessions.answer(id,'skill',{selectedIds:['pilot']},{term:0});await sessions.goTo(id,'skill');
  view=creationView(await sessions.context(id),ruleset(),t);
  assert.equal(view.step.term,1);assert.equal(view.step.canNextTerm,true);assert.match(renderCreationHTML(view,{t}),/data-creation-command="term"/);
  await sessions.nextTerm(id,'skill');
  view=creationView(await sessions.context(id),ruleset(),t);
  assert.equal(view.step.id,'survival');assert.equal(view.step.term,2);assert.equal(view.step.total,null,'a new term rolls again');
  await sessions.draw(id,'survival');await sessions.answer(id,'skill',{selectedIds:['gun']});
  view=creationView(await sessions.context(id),ruleset(),t);
  assert.equal(view.step.kind,'review');assert.equal(view.step.canFinish,true);
  assert.deepEqual(view.step.summary,[{label:'Origin',value:'Navy brat'},{label:'Attributes',value:'Strength +3, Intellect +1'},{label:'Survival',value:'9, 5'},{label:'Skill',value:'Pilot, Gunnery'}]);
  assert.match(renderCreationHTML(view,{t}),/data-creation-command="finish" class="rta-creation__primary">RTA.Creation.Finish/);
  assert.equal(neighbourStep(view,-1),'skill');assert.equal(neighbourStep(view,1),null);
});

test('The first page lists unfinished characters and the Creation Systems to start', async()=>{
  const {ruleset}=await build();
  const systems=startableSystems(ruleset(),key=>key);
  assert.deepEqual(systems,[{id:'creation',label:'Traveller'}]);
  const html=renderCreationStartHTML({drafts:[{id:'s1',label:'Traveller · today'}],systems},{t});
  assert.match(html,/data-creation-command="resume" data-session="s1"/);assert.match(html,/data-creation-command="start" data-system="creation"/);
  assert.match(renderCreationStartHTML({drafts:[],systems:[]},{t}),/RTA.Creation.NoSystem/);
});

test('The Foundry window opens on the first page, with the unfinished characters of this player', async()=>{
  const {api,v,sessions}=await build();
  await api.setActiveVersionId(v);
  await sessions.start(v,'creation');
  globalThis.game={ruleThemAll:{configurator:api,creation:sessions,configuratorReady:Promise.resolve(api)},i18n:{lang:'en',localize:k=>k}};
  class Base{async _prepareContext(){return {};}}
  const Window=createCreationWindow({ApplicationV2:Base}),window=new Window();
  await window._prepareContext({});
  const html=await window._renderHTML();
  assert.match(html,/data-creation-command="resume"/);assert.match(html,/data-creation-command="start" data-system="creation"/);
  delete globalThis.game;
});
