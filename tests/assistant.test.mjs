import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createConfiguratorAPI} from '../src/configurator/configurator-api.mjs';
import {emptyStorageSnapshot} from '../src/configurator/configurator-storage.mjs';
import {ASSISTANT_PATHS, ASSISTANT_SHARED_TEXTS} from '../src/configurator/assistant-paths.mjs';
import {assistantPathTextKeys, QUESTION_KINDS} from '../src/configurator/assistant-engine.mjs';
import {MemoryRuntimeAdapter} from '../src/runtime/memory-runtime-adapter.mjs';
import {RuntimeEngine} from '../src/runtime/runtime-engine.mjs';

class Storage{value=emptyStorageSnapshot();saves=0;async load(){return structuredClone(this.value)}async save(v){this.saves++;this.value=structuredClone(v)}}
/** Dice for tests: a d20 shows `d20` (or `advantage` for a kept-best pair), any other die shows `face`. */
class Dice extends MemoryRuntimeAdapter{d20=10;advantage=18;face=3;rolled=[];
  async roll(formula){this.rolled.push(formula);const f=String(formula).trim();if(/^-?\d+(\.\d+)?$/.test(f))return {formula:f,total:Number(f),natural:Number(f),result:f};
    if(/^2d20kh/.test(f))return {formula:f,total:this.advantage,natural:this.advantage,result:String(this.advantage)};
    if(/^1d20$/.test(f))return {formula:f,total:this.d20,natural:this.d20,result:String(this.d20)};
    const dice=[...f.matchAll(/(\d+)d\d+/g)].reduce((n,m)=>n+Number(m[1]),0);return {formula:f,total:dice*this.face,natural:this.face,result:String(dice*this.face)};}}
const lang=name=>JSON.parse(fs.readFileSync(new URL(`../lang/${name}.json`,import.meta.url)));
const fr=lang('fr'),en=lang('en');
const lookup=(dict,key)=>key.split('.').reduce((o,k)=>o?.[k],dict);
const texts=api=>Object.fromEntries(api.assistantTextKeys().map(key=>[key,lookup(fr,key)??key]));

async function setup(){
  const storage=new Storage(),api=await createConfiguratorAPI(storage);
  const v=(await api.createRuleset({id:'r',nameKey:'R',version:'1'})).versionId;
  const apply=(pathId,answers)=>api.applyAssistant(v,pathId,answers,{texts:texts(api)});
  return {api,v,storage,apply};
}
async function play(api,v,{dice=new Dice()}={}){
  await api.publishRuleset(v);
  const engine=new RuntimeEngine({configurator:api,adapter:dice,hooks:null}),hero={kind:'actor',id:'hero'},foe={kind:'actor',id:'foe'};
  await engine.initializeContainer(v,hero);await engine.initializeContainer(v,foe);
  return {engine,dice,hero,foe,context:{roles:{self:hero,target:foe},defaultRole:'self'}};
}
const pool=async(engine,actor,id,slot='points')=>(await engine.getContainerState(actor)).definitionStates[id].capabilityStates.pool[slot].current;
const named=(api,v,collection,name)=>api.getRuleset(v)[collection].find(entry=>entry.nameKey===name);

test('Assistant: every path is described in both languages, with known question kinds', ()=>{
  for(const path of ASSISTANT_PATHS){
    const walk=questions=>{for(const q of questions){assert.ok(QUESTION_KINDS.includes(q.kind),`${path.id}.${q.id}`);if(q.kind==='list')walk(q.fields);if(q.create)assert.ok(ASSISTANT_PATHS.some(p=>p.id===q.create),`${path.id}.${q.id} creates with ${q.create}`);}};
    walk(path.questions);
    for(const key of assistantPathTextKeys(path))for(const [name,dict] of [['fr',fr],['en',en]])assert.equal(typeof lookup(dict,key),'string',`${name}: ${key}`);
  }
  for(const key of ASSISTANT_SHARED_TEXTS)for(const [name,dict] of [['fr',fr],['en',en]])assert.equal(typeof lookup(dict,`RTA.Assistant.Text.${key}`),'string',`${name}: ${key}`);
});

test('Assistant: a skeleton built only with paths publishes and plays an attack', async()=>{
  const {api,v,apply}=await setup();
  await apply('characteristics',{items:[{name:'Force'},{name:'Agilité'}]});
  await apply('skills',{items:[{name:'Mêlée',linked:{use:'force'}},{name:'Tir',linked:{use:'agilite'}}]});
  await apply('derivedValue',{name:'Défense',expression:{type:'add',args:[{type:'literal',value:10},{type:'reference',reference:{objectKind:'definition',objectId:'agilite',capabilityId:'value',outputId:'value.final'}}]}});
  await apply('resource',{name:'Vitalité',maxValue:12});
  const attack=await apply('attack',{name:'Coup d\'épée',
    test:{create:{name:'Attaque de mêlée',dice:'1d20',bonus:{type:'formula',id:'bonus-melee'},target:'formula',targetFormula:{type:'reference',container:'target',reference:{objectKind:'definition',objectId:'defense',capabilityId:'value',outputId:'value.final'}},critical:20}},
    damage:'1d8',damageBonus:2,damageTarget:{use:'vitalite'}});
  assert.equal(attack.main.collection,'actions');
  assert.deepEqual(attack.reused.map(x=>x.id),['vitalite']);
  assert.equal(api.diagnoseRuleset(v,{scope:'publish'}).errors.length,0,JSON.stringify(api.diagnoseRuleset(v,{scope:'publish'}).errors));
  const {engine,dice,hero,foe,context}=await play(api,v);
  await engine.setDefinitionState(v,hero,'force',{base:3});
  dice.d20=6;await engine.executeAction(v,attack.main.id,context);
  assert.equal(await pool(engine,foe,'vitalite'),12,'6 + 3 misses Défense 10');
  dice.d20=12;await engine.executeAction(v,attack.main.id,context);
  assert.equal(await pool(engine,foe,'vitalite'),7,'a hit: 1d8 (3) + 2');
  dice.d20=20;await engine.executeAction(v,attack.main.id,context);
  assert.equal(await pool(engine,foe,'vitalite'),0,'a critical doubles the dice: 6 + 2, down to 0');
});

test('Assistant: the plan lists what it creates, uses and adds, and writes nothing', async()=>{
  const {api,v,apply,storage}=await setup();
  await apply('resource',{name:'Mana',maxValue:5});
  await apply('action',{name:'Boule de feu'});
  const saves=storage.saves;
  const plan=api.planAssistant(v,'cost',{action:{use:'boule-de-feu'},resource:{use:'mana'},amount:2},{texts:texts(api)});
  assert.equal(plan.valid,true,JSON.stringify(plan.errors));
  assert.deepEqual(plan.reused.map(x=>x.id),['boule-de-feu','mana']);
  assert.deepEqual(plan.added.map(x=>`${x.id}.${x.field}`),['boule-de-feu.costEffectRefs','boule-de-feu.conditionRefs']);
  assert.equal(storage.saves,saves,'planning writes nothing');
  assert.equal(plan.created.length,2);
});

test('Assistant: a skill linked to an existing characteristic does not create it again', async()=>{
  const {api,v,apply}=await setup();
  await apply('characteristics',{items:[{name:'Esprit'}]});
  const before=api.getRuleset(v).definitions.length;
  const result=await apply('skills',{items:[{name:'Occultisme',linked:{use:'esprit'}}]});
  assert.equal(api.getRuleset(v).definitions.length,before+1);
  assert.equal(result.reused[0].id,'esprit');
  // The same Formula is not written twice: a second identical bonus reuses the first.
  const again=api.planAssistant(v,'formula',{name:'Autre',expression:named(api,v,'formulas','Bonus : Occultisme').expression});
  assert.equal(again.created.length,0);
});

test('Assistant: answers to questions the GM no longer sees are left out', async()=>{
  const {api,v,apply}=await setup();
  const result=await apply('test',{name:'Perception',dice:'1d20',target:'fixed',targetValue:12,askedDefault:15,targetFormula:{type:'literal',value:99}});
  const created=api.getRuleset(v).tests.find(t=>t.id===result.main.id);
  assert.equal(created.targetValue,12);
  assert.equal(created.targetFormulaRef,null);
  assert.deepEqual(created.inputBindings,[]);
  const action=api.getRuleset(v).actions.find(a=>a.testRef===created.id);
  assert.deepEqual(action.inputs,[]);
});

test('Assistant: invalid answers are refused with their path, and nothing is written', async()=>{
  const {api,v,apply,storage}=await setup();
  await apply('resource',{name:'Vitalité',maxValue:10});
  const saves=storage.saves;
  const plan=api.planAssistant(v,'attack',{name:'Coup',test:{use:'absent'},damage:'1d6+',damageTarget:{use:'vitalite',slotId:'nope'}});
  assert.equal(plan.valid,false);
  assert.deepEqual(plan.errors.map(e=>`${e.path}:${e.code}`).sort(),['damage:DICE','damageTarget:NOT_FOUND','test:NOT_FOUND']);
  await assert.rejects(()=>apply('attack',{name:'Coup',test:{use:'absent'}}),error=>error.code==='ASSISTANT_INVALID');
  await assert.rejects(()=>apply('characteristics',{type:{use:'vitalite'},items:[{name:'X'}]}),/NOT_FOUND|NOT_ACCEPTED/);
  assert.equal(storage.saves,saves);
});

test('Assistant: a plan made on an older draft is refused, and a second GM does not overwrite the first', async()=>{
  const {api,v,apply}=await setup();
  const plan=api.planAssistant(v,'value',{name:'Chance'});
  await apply('value',{name:'Courage'});
  await assert.rejects(()=>api.applyAssistant(v,'value',{name:'Chance'},{baseFingerprint:plan.fingerprint}),error=>error.code==='ASSISTANT_STALE');
  assert.ok(api.getRuleset(v).definitions.some(d=>d.id==='courage'));
  assert.ok(!api.getRuleset(v).definitions.some(d=>d.id==='chance'));
  // Two clients on the same stored data: the second write is refused by the storage revision.
  const storage=new Storage(),first=await createConfiguratorAPI(storage);
  const w=(await first.createRuleset({id:'s',nameKey:'S',version:'1'})).versionId;
  const second=await createConfiguratorAPI({load:async()=>structuredClone(storage.value),save:async value=>{if(value.storageRevision!==storage.value.storageRevision+1)throw new Error('conflict');storage.value=structuredClone(value);}});
  await first.applyAssistant(w,'value',{name:'Un'});
  await assert.rejects(()=>second.applyAssistant(w,'value',{name:'Deux'}));
  assert.deepEqual((await createConfiguratorAPI(storage)).getRuleset(w).definitions.map(d=>d.id),['un']);
});

test('Assistant: a validated version cannot be changed', async()=>{
  const {api,v,apply}=await setup();
  await apply('value',{name:'Chance'});
  await api.publishRuleset(v);await api.validateRulesetVersion(v);
  await assert.rejects(()=>apply('value',{name:'Courage'}),/immutable/i);
});

test('Assistant: applying a path twice keeps ids unique', async()=>{
  const {api,v,apply}=await setup();
  await apply('consumable',{name:'Potion',doses:3,amount:4,effectTarget:{create:{name:'Vitalité',maxValue:12}}});
  await apply('consumable',{name:'Potion',doses:3,amount:4,effectTarget:{use:'vitalite'}});
  const ids=api.getRuleset(v).actions.map(a=>a.id);
  assert.equal(new Set(ids).size,ids.length);
  assert.equal(api.getRuleset(v).definitions.filter(d=>d.nameKey==='Potion').length,2);
});

test('Assistant: a state with a duration and modifiers lowers a value while it is active', async()=>{
  const {api,v,apply}=await setup();
  await apply('characteristics',{items:[{name:'Agilité'}]});
  await apply('state',{name:'Empoisonné',duration:'round',amount:3,modifiers:[{target:{use:'agilite'},operation:'subtract',amount:2}]});
  const {engine,hero,foe,context}=await play(api,v);
  await engine.setDefinitionState(v,foe,'agilite',{base:5});
  const agility=()=>engine.resolveReference(v,{container:'target',reference:{objectKind:'definition',objectId:'agilite',capabilityId:'value',outputId:'value.final'}},context);
  assert.equal(await agility(),5);
  await engine.executeAction(v,named(api,v,'actions','Infliger : Empoisonné').id,context);
  assert.equal(await agility(),3);
  assert.equal(api.getRuleset(v).durations[0].amount,3);
  await engine.executeAction(v,named(api,v,'actions','Retirer : Empoisonné').id,context);
  assert.equal(await agility(),5);
});

test('Assistant: a cost refuses the Action without the resource and spends it', async()=>{
  const {api,v,apply}=await setup();
  await apply('cost',{action:{create:{name:'Tirer'}},resource:{create:{name:'Munitions',maxValue:2}}});
  const {engine,hero,context}=await play(api,v);
  for(let i=0;i<2;i++)assert.equal((await engine.executeAction(v,'tirer',{...context,roles:{self:hero,target:hero}})).allowed,true);
  assert.equal(await pool(engine,hero,'munitions'),0);
  assert.equal((await engine.executeAction(v,'tirer',{...context,roles:{self:hero,target:hero}})).allowed,false);
});

test('Assistant: a consumable costs a dose and heals within the resource bounds', async()=>{
  const {api,v,apply}=await setup();
  const result=await apply('consumable',{name:'Potion',doses:2,effectTarget:{create:{name:'Vitalité',maxValue:12,initial:'minimum'}},amount:5});
  const {engine,hero}=await play(api,v),self={roles:{self:hero,target:hero}};
  await engine.executeAction(v,result.main.id,self);await engine.executeAction(v,result.main.id,self);
  assert.equal(await pool(engine,hero,'vitalite'),10);
  assert.equal(await pool(engine,hero,'potion','doses'),0);
  assert.equal((await engine.executeAction(v,result.main.id,self)).allowed,false);
});

test('Assistant: a level follows experience, by a step or by a table', async()=>{
  const {api,v,apply}=await setup();
  await apply('level',{perLevel:300});
  await apply('level',{name:'Rang',experience:{use:'experience'},rule:'table',thresholds:[{level:1,experience:0},{level:2,experience:300},{level:3,experience:900}],award:false});
  const {engine,hero}=await play(api,v),self={roles:{self:hero,target:hero}};
  const read=id=>engine.resolveReference(v,{objectKind:'definition',objectId:id,capabilityId:'value',outputId:'value.final'},self);
  assert.deepEqual([await read('niveau'),await read('rang')],[1,1]);
  await engine.executeAction(v,named(api,v,'actions','Gagner : Expérience').id,{...self,variables:{input:{amount:950}}});
  assert.deepEqual([await read('niveau'),await read('rang')],[4,3]);
});

test('Assistant: encumbrance compares the load with a capacity Formula', async()=>{
  const {api,v,apply}=await setup();
  await apply('characteristics',{items:[{name:'Force'}]});
  const result=await apply('encumbrance',{capacity:{type:'multiply',args:[{type:'reference',reference:{objectKind:'definition',objectId:'force',capabilityId:'value',outputId:'value.final'}},{type:'literal',value:10}]}});
  const {engine,hero}=await play(api,v),self={roles:{self:hero,target:hero}};
  await engine.setDefinitionState(v,hero,'force',{base:3});await engine.setDefinitionState(v,hero,'charge',{base:25});
  assert.equal(await engine.evaluateCondition(v,result.main.id,self),false);
  await engine.setDefinitionState(v,hero,'charge',{base:31});
  assert.equal(await engine.evaluateCondition(v,result.main.id,self),true);
});

test('Assistant: advantage, a bonus die and a flat malus are added to existing Tests', async()=>{
  const {api,v,apply}=await setup();
  const t=await apply('test',{name:'Discrétion',dice:'1d20',target:'fixed',targetValue:15});
  await apply('state',{name:'Invisible',applyAction:false,removeAction:false});
  await apply('state',{name:'Béni',applyAction:false,removeAction:false});
  const invisible=await apply('condition',{name:'Est invisible',expression:{type:'reference',reference:{objectKind:'definition',objectId:'invisible',capabilityId:'state',outputId:'state.active'}}});
  const blessed=await apply('condition',{name:'Est béni',expression:{type:'reference',reference:{objectKind:'definition',objectId:'beni',capabilityId:'state',outputId:'state.active'}}});
  const added=await apply('advantage',{tests:[{use:t.main.id}],when:{use:invisible.main.id},dice:'2d20kh'});
  assert.equal(added.added[0].field,'variants');
  await apply('advantage',{tests:[{use:t.main.id}],when:{use:blessed.main.id},effect:'extraDie',extraDice:'1d4'});
  const {engine,dice,hero}=await play(api,v),self={roles:{self:hero,target:hero}};
  dice.d20=10;
  assert.equal((await engine.executeTest(v,t.main.id,self)).total,10);
  await engine.setDefinitionState(v,hero,'invisible',{active:true});
  assert.equal((await engine.executeTest(v,t.main.id,self)).total,18,'2d20kh while invisible');
  await engine.setDefinitionState(v,hero,'beni',{active:true});
  assert.equal((await engine.executeTest(v,t.main.id,self)).total,21,'+1d4 (3) while blessed');
});

test('Assistant: damage types give a factor that halves damage on a resistant target', async()=>{
  const {api,v,apply}=await setup();
  await apply('damageTypes',{types:[{name:'Feu'}]});
  await apply('resource',{name:'Vitalité',maxValue:20});
  const factor=named(api,v,'formulas','Facteur de dégâts : Feu');
  const result=await apply('power',{name:'Trait de feu',resolution:'automatic',dice:'2d6',target:{use:'vitalite'}});
  const effect=api.getRuleset(v).effects.find(e=>api.getRuleset(v).actions.find(a=>a.id===result.main.id).effectRefs.includes(e.id));
  assert.ok(factor&&effect);
  const resisted=await apply('attack',{name:'Torche',test:{create:{name:'Coup de torche',dice:'1d20',target:'fixed',targetValue:0}},damage:'2d6',damageTarget:{use:'vitalite'},factor:{use:factor.id},criticalDouble:false});
  const {engine,foe,context}=await play(api,v);
  await engine.setDefinitionState(v,foe,named(api,v,'definitions','Résistance : Feu').id,{active:true});
  await engine.executeAction(v,resisted.main.id,context);
  assert.equal(await pool(engine,foe,'vitalite'),17,'6 halved to 3');
});

test('Assistant: a save-based power deals half on a failed attempt, and a power can cost a resource', async()=>{
  const {api,v,apply}=await setup();
  await apply('resource',{name:'Vitalité',maxValue:20});
  const result=await apply('power',{name:'Boule de feu',resolution:'save',test:{create:{name:'Jet de sort',dice:'1d20',target:'fixed',targetValue:15}},dice:'4d6',target:{use:'vitalite'},
    cost:{create:{name:'Mana',maxValue:3}},costAmount:2});
  const {engine,dice,hero,foe,context}=await play(api,v);
  dice.d20=16;await engine.executeAction(v,result.main.id,context);
  assert.equal(await pool(engine,foe,'vitalite'),8,'12 on a success');
  assert.equal(await pool(engine,hero,'mana'),1);
  assert.equal((await engine.executeAction(v,result.main.id,context)).allowed,false,'not enough mana');
  await engine.setDefinitionState(v,hero,'mana',{pools:{points:3}});
  dice.d20=2;await engine.executeAction(v,result.main.id,context);
  assert.equal(await pool(engine,foe,'vitalite'),2,'half (6) on a failure');
});

test('Assistant: a threshold applies and removes a state on its event, and can mark the defeated', async()=>{
  const {api,v,apply}=await setup();
  await apply('resource',{name:'Vitalité',maxValue:10});
  await apply('initiative',{test:{create:{name:'Initiative',dice:'1d20',target:'none'}}});
  const result=await apply('threshold',{name:'Vitalité à zéro',watched:{use:'vitalite'},state:{create:{name:'Hors de combat',applyAction:false,removeAction:false}},event:'rta.combat.turn',defeated:true});
  assert.equal(api.getRuleset(v).initiative.defeatedConditionRef,result.main.id);
  const {engine,hero}=await play(api,v),self={roles:{self:hero,target:hero}};
  await engine.setDefinitionState(v,hero,'vitalite',{pools:{points:0}});
  await engine.emitEvent(v,'rta.combat.turn',{combatId:'c',round:1,turn:0,pass:1},self);
  const active=()=>engine.resolveReference(v,{objectKind:'definition',objectId:'hors-de-combat',capabilityId:'state',outputId:'state.active'},self);
  assert.equal(await active(),true);
  await engine.setDefinitionState(v,hero,'vitalite',{pools:{points:4}});
  await engine.emitEvent(v,'rta.combat.turn',{combatId:'c',round:1,turn:0,pass:1},self);
  assert.equal(await active(),false);
});

test('Assistant: a rest recovers resources, and completes an existing rest without changing it', async()=>{
  const {api,v,apply}=await setup();
  await apply('resource',{name:'Vitalité',maxValue:10});
  await apply('resource',{name:'Endurance',maxValue:6});
  const rest=await apply('rest',{resources:[{resource:{use:'vitalite'},recovery:'full'}],daily:true});
  const completed=await apply('rest',{mode:'existing',action:{use:rest.main.id},resources:[{resource:{use:'endurance'},recovery:'amount',amount:2}]});
  assert.deepEqual(completed.added.map(a=>a.field),['effectRefs']);
  assert.equal(api.getRuleset(v).actions.find(a=>a.id===rest.main.id).effectRefs.length,2);
  const {engine,hero}=await play(api,v),self={roles:{self:hero,target:hero}};
  await engine.setDefinitionState(v,hero,'vitalite',{pools:{points:1}});await engine.setDefinitionState(v,hero,'endurance',{pools:{points:1}});
  await engine.emitEvent(v,'rta.time.elapsed',{seconds:86400,days:1,worldTime:86400},self);
  assert.deepEqual([await pool(engine,hero,'vitalite'),await pool(engine,hero,'endurance')],[10,3]);
});

test('Assistant: initiative fills the Ruleset once; a second time is refused', async()=>{
  const {api,v,apply}=await setup();
  await apply('initiative',{test:{create:{name:'Initiative',dice:'1d10',target:'none'}},eachRound:true,tieBreak:{type:'literal',value:0}});
  assert.equal(api.getRuleset(v).initiative.eachRound,true);
  const plan=api.planAssistant(v,'initiative',{test:{use:api.getRuleset(v).initiative.testRef}});
  assert.deepEqual(plan.errors.map(e=>e.code),['ALREADY_SET']);
});

test('Assistant: character creation steps, with the choices of the content steps before them', async()=>{
  const {api,v,apply}=await setup();
  await apply('characteristics',{items:[{name:'Force'},{name:'Esprit'}]});
  await apply('contentType',{name:'Origine'});
  await api.createContentTemplate(v,{id:'noble',nameKey:'Noble',contentTypeId:'origine'});
  await api.createContentTemplate(v,{id:'paysan',nameKey:'Paysan',contentTypeId:'origine'});
  const result=await apply('creation',{steps:[{kind:'content',name:'Origine',templates:[{use:'noble'},{use:'paysan'}]},{kind:'contentChoices',name:'Choix de l\'origine'},{kind:'allocation',name:'Points',definitions:[{use:'force'},{use:'esprit'}],min:4,max:4,perTargetMax:3},{kind:'review',name:'Fin'}]});
  const system=api.getRuleset(v).creationSystems.find(s=>s.id===result.main.id);
  assert.deepEqual([system.steps[2].min,system.steps[2].max,system.steps[2].perTargetMax],[4,4,3]);
  assert.deepEqual(system.steps.map(s=>s.kind),['content','contentChoices','allocation','review']);
  assert.deepEqual(system.steps[1].source.stepIds,['origine']);
  await apply('creation',{mode:'existing',system:{use:system.id},steps:[{kind:'content',name:'Origine',templates:[{use:'noble'}]}]});
  assert.deepEqual(api.getRuleset(v).creationSystems[0].steps.map(s=>s.id),['origine','choix-de-l-origine','points','fin','origine-2']);
  assert.equal(api.diagnoseRuleset(v,{scope:'publish'}).errors.length,0);
});

test('Assistant: progression by spending a currency, and by level milestones', async()=>{
  const {api,v,apply}=await setup();
  await apply('skills',{items:[{name:'Athlétisme'}]});
  await apply('value',{name:'Pratique',type:{use:'competence'}});
  await apply('progression',{values:[{value:{use:'athletisme'}}],currency:{use:'pratique'},costs:[{level:1,cost:5},{level:2,cost:10}],maximum:2});
  const {engine,hero}=await play(api,v);
  await engine.setDefinitionState(v,hero,'pratique',{base:12});
  const system=api.getRuleset(v).progressionSystems[0];
  await engine.advance(v,system.id,hero,system.advancements[0].id,'athletisme');
  const state=(await engine.getContainerState(hero)).definitionStates;
  assert.deepEqual([state.athletisme.capabilityStates.value.base,state.pratique.capabilityStates.value.base],[1,7]);
  const {api:api2,v:w,apply:apply2}=await setup();
  await apply2('state',{name:'Attaque supplémentaire',applyAction:false,removeAction:false});
  const milestones=await apply2('progression',{mode:'milestones',level:{create:{perLevel:1000}},milestones:[{level:5,grants:[{use:'attaque-supplementaire'}]}]});
  assert.equal(api2.getRuleset(w).progressionSystems[0].milestones[0].definitionIds[0],'attaque-supplementaire');
  assert.equal(milestones.main.collection,'progressionSystems');
  assert.equal(api2.diagnoseRuleset(w,{scope:'publish'}).errors.length,0);
});

test('Assistant: a scale is linked to Definitions that have none, never replacing one', async()=>{
  const {api,v,apply}=await setup();
  await apply('characteristics',{items:[{name:'Force'}]});
  await apply('scale',{name:'Force perçue',rows:[{max:1,words:'Frêle'},{min:2,words:'Solide'}],definitions:[{use:'force'}]});
  assert.equal(api.getRuleset(v).definitions[0].scaleRef,'force-percue');
  const plan=api.planAssistant(v,'scale',{name:'Autre',rows:[{words:'X'}],definitions:[{use:'force'}]});
  assert.deepEqual(plan.errors.map(e=>e.code),['ALREADY_SET']);
});

test('Assistant: every brick and system path publishes cleanly on its own', async()=>{
  const {api,v,apply}=await setup();
  await apply('value',{name:'Chance'});
  await apply('counter',{name:'Attaques du round',resetOn:'rta.combat.round'});
  await apply('formula',{name:'Double chance',expression:{type:'multiply',args:[{type:'reference',reference:{objectKind:'definition',objectId:'chance',capabilityId:'value',outputId:'value.final'}},{type:'literal',value:2}]}});
  await apply('effect',{name:'Perdre de la chance',target:{use:'chance'},role:'self',operation:'subtract',operand:'dice',dice:'1d4',minimum:0});
  await apply('action',{name:'Tenter sa chance',inputs:[{name:'Difficulté',valueType:'number',default:'10'}],effects:[{use:'perdre-de-la-chance'}]});
  await apply('trigger',{name:'Chance au round',event:'rta.combat.round',actions:[{use:'tenter-sa-chance'}]});
  await apply('table',{name:'Coup critique',dice:'1d6',rows:[{label:'Bras',min:1,max:3},{label:'Tête',min:4,max:6,actions:[{use:'tenter-sa-chance'}]}]});
  await apply('die',{name:'Dé de destin',letter:'q',faces:[{label:'Succès',counter:'Succès'},{label:'Échec',counter:'Succès',count:-1},{label:'Rien'}]});
  await apply('contentType',{name:'Arme',fields:[{name:'Dégâts',valueType:'string'},{name:'Portée',valueType:'integer'}]});
  await apply('permission',{kind:'action',actions:[{use:'tenter-sa-chance'}],who:'gamemaster'});
  await apply('permission',{kind:'definition',definitions:[{use:'chance'}]});
  const errors=api.diagnoseRuleset(v,{scope:'publish'}).errors;
  assert.equal(errors.length,0,JSON.stringify(errors));
  assert.deepEqual(Object.keys(api.getRuleset(v).contentTypes[0].fields),['degats','portee']);
  assert.deepEqual(api.getRuleset(v).dice[0].counters.map(c=>c.id),['succes']);
  await api.publishRuleset(v);
});

test('Assistant: describing a path shows the questions its answers make visible, with their choices', async()=>{
  const {api,v,apply}=await setup();
  await apply('resource',{name:'Vitalité',maxValue:10});
  const ids=answers=>api.describeAssistantPath(v,'test',answers).questions.map(q=>q.id);
  assert.ok(ids({}).includes('askedDefault')&&!ids({}).includes('targetValue'));
  assert.ok(ids({target:'fixed'}).includes('targetValue'));
  const attack=api.describeAssistantPath(v,'attack',{});
  const target=attack.questions.find(q=>q.id==='damageTarget');
  assert.deepEqual(target.choices.map(c=>c.id),['vitalite']);
  assert.equal(target.create,'resource');
  assert.equal(attack.questions.find(q=>q.id==='test').default.create.target,'formula');
  const list=api.describeAssistantPath(v,'creation',{steps:[{kind:'allocation'},{kind:'content'}]}).questions.find(q=>q.id==='steps');
  assert.ok(list.rows[0].includes('perTargetMax')&&!list.rows[0].includes('templates'));
  assert.ok(list.rows[1].includes('templates'));
});

test('Assistant window: the form shows what the plan is made of, and a type it creates keeps the capability it needs', async()=>{
  const {api,v}=await setup();
  const {assistantFormModel,answersOf}=await import('../src/configurator/assistant-view.mjs');
  const t=key=>lookup(fr,key)??key,describe=(pathId,answers)=>api.describeAssistantPath(v,pathId,answers,{texts:texts(api)});
  const form=assistantFormModel('state',{name:'Béni'},{describe,paths:ASSISTANT_PATHS,t,entryName:key=>key});
  const type=form.fields.find(field=>field.path==='type');
  assert.equal(type.create.selected,true,'no state type yet: one is created');
  assert.ok(!type.sub.some(field=>field.path==='type.create.capability'),'its capability is not asked');
  assert.deepEqual(form.answers.type.create,{name:'État',fields:[],capability:'state'});
  assert.deepEqual(answersOf(form.fields),form.answers);
  const plan=api.planAssistant(v,'state',form.answers,{texts:texts(api)});
  assert.equal(plan.valid,true,JSON.stringify(plan.errors));
  // A GM's other capability is not taken: the question imposes it.
  const forced=api.planAssistant(v,'state',{name:'Béni',type:{create:{name:'X',capability:'value'}}},{texts:texts(api)});
  assert.equal(forced.valid,true,JSON.stringify(forced.errors));
});
