import test from 'node:test';
import assert from 'node:assert/strict';
import {createConfiguratorAPI} from '../src/configurator/configurator-api.mjs';
import {emptyStorageSnapshot} from '../src/configurator/configurator-storage.mjs';
import {CreationSessions, MemoryCreationSessionStore} from '../src/runtime/creation-sessions.mjs';
import {creationView, renderCreationHTML, renderCreationStartHTML, readCreationAnswer, refreshChoiceLimits, refreshSteppers, stepPoints} from '../src/ui/creation-markup.mjs';
import {startableSystems, neighbourStep, createCreationWindow} from '../src/runtime/foundry-creation.mjs';
class Storage{data=emptyStorageSnapshot();async load(){return structuredClone(this.data)}async save(data){this.data=structuredClone(data)}}
const grant=(id,objectId)=>({id,operation:'grant',targetRef:{objectKind:'definition',objectId},config:{add:{'value.base':1}}});

// An origin with its own pick of a skill, points on attributes, then careers term after term with a roll each.
async function build(){
  const api=await createConfiguratorAPI(new Storage()),v=(await api.createRuleset({id:'wiz',nameKey:'Wizard',version:'1'})).versionId;
  await api.registerDefinitionType(v,{id:'stat',key:'stat',nameKey:'Stat',allowedCapabilities:['value'],defaultCapabilities:['value'],requiredCapabilities:[],fields:{}});
  for(const [id,name] of [['str','Strength'],['int','Intellect'],['pilot','Pilot'],['gun','Gunnery']])await api.createDefinition(v,{id,key:id,nameKey:name,definitionTypeId:'stat',capabilities:['value'],data:{}});
  await api.createContentType(v,{id:'origin',nameKey:'Origin',storageKind:'item',runtimeMode:'unique'});
  await api.createContentTemplate(v,{id:'navy',nameKey:'Navy brat',contentTypeId:'origin',relations:[{id:'str',operation:'grant',targetRef:{objectKind:'definition',objectId:'str'},config:{initial:{'value.base':1}}}],choiceGroups:[{id:'pick',name:'A skill',min:1,max:1,options:[grant('o-pilot','pilot'),grant('o-gun','gun')]}]});
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
  assert.match(html,/data-creation-single/);assert.match(html,/aria-current="step"/);
  // Two choices allowed: with two ticked, the others are disabled, and enabled again once one is unticked.
  const two=renderCreationHTML({...view,step:{...view.step,bounds:{min:2,max:2},options:[{id:'a',label:'A',checked:true},{id:'b',label:'B',checked:true},{id:'c',label:'C',checked:false}]}},{t});
  assert.match(two,/data-creation-max="2"/);assert.match(two,/value="c" disabled/);assert.doesNotMatch(two,/value="a"[^>]*disabled/);
  const boxes=['a','b','c'].map((value,i)=>({value,checked:i<2,disabled:false}));
  const list={dataset:{creationMax:'2'},querySelectorAll:()=>boxes};
  refreshChoiceLimits({querySelectorAll:()=>[list]});
  assert.deepEqual(boxes.map(box=>box.disabled),[false,false,true]);
  boxes[0].checked=false;refreshChoiceLimits({querySelectorAll:()=>[list]});
  assert.deepEqual(boxes.map(box=>box.disabled),[false,false,false]);assert.match(html,/data-creation-command="previous" disabled/);
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
  assert.equal(view.step.boundsText,'Spend 4 points.');
  // Navy brat starts Strength at 1: the field shows the value reached, and only the points above it are spent.
  assert.deepEqual(view.step.rows.map(row=>[row.id,row.start]),[['str',1],['int',0]]);
  html=renderCreationHTML(view,{t});
  assert.match(html,/min="1" step="1" max="4" data-creation-points="str" data-start="1" value="1"/);assert.match(html,/data-creation-budget="4"/);
  assert.match(html,/data-creation-step="-1"/);assert.match(html,/data-creation-step="1"/);
  assert.deepEqual(readCreationAnswer(page([{kind:'data-creation-points',value:'4',dataset:{creationPoints:'str',start:'1'}},{kind:'data-creation-points',value:'1',dataset:{creationPoints:'int',start:'0'}}]),view.step),{allocations:{str:3,int:1}});
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

test('Opened from an Actor sheet, the window starts that Actor creation at once, then picks it up again, with the Actor name ready', async()=>{
  const {api,v,sessions}=await build();
  await api.setActiveVersionId(v);
  await sessions.start(v,'creation');
  globalThis.game={ruleThemAll:{configurator:api,creation:sessions,configuratorReady:Promise.resolve(api)},i18n:{lang:'en',localize:k=>k}};
  globalThis.fromUuidSync=uuid=>uuid==='Actor.luca'?{name:'Luca'}:null;
  class Base{constructor(options){this.options=options;}async _prepareContext(){return {};}}
  const Window=createCreationWindow({ApplicationV2:Base}),window=new Window({actorUuid:'Actor.luca'});
  assert.equal(window.options.id,'rta-creation-Actor-luca');
  await window._prepareContext({});
  assert.match(await window._renderHTML(),/data-creation-goto="origin" data-state="open" aria-current="step"/);
  const mine=(await sessions.list()).filter(session=>session.targetActorUuid==='Actor.luca');
  assert.equal(mine.length,1,'the player other draft is not taken');
  const again=new Window({actorUuid:'Actor.luca'});await again._prepareContext({});
  assert.equal((await sessions.list()).filter(session=>session.targetActorUuid==='Actor.luca').length,1,'reopening resumes the same creation');
  delete globalThis.game;delete globalThis.fromUuidSync;
});

test('A new character asks for the game system Actor subtype when it has several, and keeps the name typed', async()=>{
  const {api,v,sessions}=await build();
  await api.setActiveVersionId(v);
  const {id}=await sessions.start(v,'creation');
  await sessions.goTo(id,'done');
  globalThis.game={ruleThemAll:{configurator:api,creation:sessions,configuratorReady:Promise.resolve(api)},i18n:{lang:'en',localize:k=>k},system:{documentTypes:{Actor:{character:{},npc:{}}}}};
  globalThis.CONFIG={Actor:{typeLabels:{character:'TYPES.Actor.character',npc:'TYPES.Actor.npc'}}};
  class Base{constructor(options){this.options=options;}async _prepareContext(){return {};}}
  const Window=createCreationWindow({ApplicationV2:Base}),window=new Window();
  await window._prepareContext({});
  await window._prepareContext({});
  let html=await window._renderHTML();
  if(!/data-creation-actor-type/.test(html)){ // the start page: resume the draft
    const page=await sessions.list();assert.equal(page.length,1);
  }
  const view=renderCreationHTML({title:'T',complete:true,index:0,count:1,steps:[],step:{id:'done',kind:'review',label:'Review',errors:[],summary:[],canFinish:true,first:true,last:true}},{t:k=>k,name:'Ayla',actorTypes:[{value:'character',label:'Character'},{value:'npc',label:'NPC'}],actorType:'npc'});
  assert.match(view,/data-creation-name value="Ayla"/);
  assert.match(view,/<select data-creation-actor-type><option value="character">Character<\/option><option value="npc" selected>NPC<\/option><\/select>/);
  assert.doesNotMatch(renderCreationHTML({title:'T',complete:true,index:0,count:1,steps:[],step:{id:'done',kind:'review',label:'Review',errors:[],summary:[],canFinish:true,first:true,last:true}},{t:k=>k,actorTypes:[{value:'character',label:'Character'}]}),/data-creation-actor-type/,'one subtype: nothing to ask');
  delete globalThis.game;delete globalThis.CONFIG;
});

// A stand-in for one allocation step: fields with their −/+ buttons, under a budget.
function pointsPage(budget,fields){
  const inputs=fields.map(([start,value,max])=>{const box={},input={value:String(value),min:String(start),max:max===null?'':String(max),dataset:{creationPoints:'x',start:String(start)},parentElement:box};
    const less={dataset:{creationStep:'-1'},disabled:false,parentElement:box},more={dataset:{creationStep:'1'},disabled:false,parentElement:box};
    box.querySelector=selector=>selector.includes('"-1"')?less:selector.includes('"1"')?more:input;return {input,less,more};});
  return {fields:inputs,root:{querySelector:()=>budget===null?null:{dataset:{creationBudget:String(budget)}},querySelectorAll:()=>inputs.map(field=>field.input)}};
}

test('The −/+ buttons stay within the starting value, the field maximum and the points left', ()=>{
  const {root,fields:[str,int]}=pointsPage(4,[[1,1,4],[0,0,3]]);
  refreshSteppers(root);
  assert.equal(str.less.disabled,true,'not below the starting value');assert.equal(str.more.disabled,false);
  for(let i=0;i<3;i++)assert.equal(stepPoints(str.more),true);
  assert.equal(stepPoints(str.more),false,'not above the field maximum');assert.equal(str.input.value,'4');
  refreshSteppers(root);assert.equal(str.more.disabled,true);assert.equal(int.more.disabled,false,'one point left');
  stepPoints(int.more);refreshSteppers(root);
  assert.equal(int.more.disabled,true,'the budget is spent: every + greys out');assert.equal(int.less.disabled,false);
  stepPoints(str.less);refreshSteppers(root);
  assert.equal(int.more.disabled,false,'a point given back frees the + buttons');
  const costed=pointsPage(null,[[0,9,null]]);refreshSteppers(costed.root);
  assert.equal(costed.fields[0].more.disabled,false,'no point budget with a cost Formula');
});
