import test from 'node:test';
import assert from 'node:assert/strict';
import {createConfiguratorAPI} from '../src/configurator/configurator-api.mjs';
import {emptyStorageSnapshot} from '../src/configurator/configurator-storage.mjs';
import {MemoryRuntimeAdapter} from '../src/runtime/memory-runtime-adapter.mjs';
import {RuntimeEngine} from '../src/runtime/runtime-engine.mjs';
class Storage{value=emptyStorageSnapshot();async load(){return structuredClone(this.value)}async save(v){this.value=structuredClone(v)}}
class Adapter extends MemoryRuntimeAdapter{queue=[];async roll(formula){const n=this.queue.shift();return {formula,total:n,natural:n,result:String(n)};}}
const ref=id=>({objectKind:'definition',objectId:id,capabilityId:'pool',outputId:'pool.current',slotId:'points'});
const hero={kind:'actor',id:'hero'},foe={kind:'actor',id:'foe'},context={roles:{self:hero,target:foe},defaultRole:'self'};
const previous={type:'context',path:'variables.previous.total'};

async function setup(){
  const api=await createConfiguratorAPI(new Storage());
  const v=(await api.createRuleset({id:'duel',nameKey:'Duel',version:'1'})).versionId;
  await api.registerDefinitionType(v,{id:'track',key:'track',nameKey:'Track',allowedCapabilities:['pool'],defaultCapabilities:['pool'],requiredCapabilities:[],fields:{}});
  await api.createDefinition(v,{id:'hp',key:'hp',definitionTypeId:'track',nameKey:'HP',data:{},capabilities:['pool'],slots:{pool:[{id:'points',minimum:{literal:0},maximum:{literal:20},initial:{literal:20}}]}});
  await api.createRoll(v,{id:'d20',nameKey:'d20',formula:'1d20'});
  await api.createOutcome(v,{id:'done',nameKey:'Done',resultKey:'done'});
  await api.createTest(v,{id:'strike',nameKey:'Strike',rollRef:'d20',outcomeRefs:[],fallbackOutcomeRef:'done'});
  // The damage is what the attack rolled minus 10; the riposte hurts the attacker by the same.
  await api.createFormula(v,{id:'damage',nameKey:'Damage',resultType:'number',expression:{type:'subtract',args:[previous,{type:'literal',value:10}]}});
  await api.createEffect(v,{id:'hurt',nameKey:'Hurt',targetRef:ref('hp'),targetRole:'target',operation:'subtract',operand:{kind:'formula',id:'damage'}});
  await api.createAction(v,{id:'apply',nameKey:'Apply damage',effectRefs:['hurt']});
  await api.createAction(v,{id:'riposte',nameKey:'Riposte',effectRefs:['hurt']});
  await api.createAction(v,{id:'attack',nameKey:'Attack',testRef:'strike',chatActions:[{actionRef:'apply',who:'gm'},{actionRef:'riposte',who:'target'}]});
  await api.publishRuleset(v);
  const adapter=new Adapter(),engine=new RuntimeEngine({configurator:api,adapter,hooks:null});
  for(const actor of [hero,foe])await engine.initializeContainer(v,actor,{});
  return {api,v,engine,adapter};
}
const hp=(engine,v,actor)=>engine.resolveReference(v,{container:actor,reference:ref('hp')},{});

test('an Action offers its chat buttons with the result they read', async () => {
  const {v,engine,adapter}=await setup();
  adapter.queue=[16];
  const used=await engine.executeAction(v,'attack',context);
  assert.deepEqual(used.chatOffer.buttons,[{index:0,actionId:'apply',who:'gm'},{index:1,actionId:'riposte',who:'target'}]);
  assert.equal(used.chatOffer.previous.total,16);
  await engine.runChatAction(v,used.chatOffer,0);
  assert.equal(await hp(engine,v,foe),14,'the GM applies 16 - 10');
  await engine.runChatAction(v,used.chatOffer,1,{as:foe});
  assert.equal(await hp(engine,v,hero),14,'the target answers, the attacker is its target');
});

test('who may press a button is checked', async () => {
  const {v,engine,adapter}=await setup();
  adapter.queue=[12];
  const used=await engine.executeAction(v,'attack',context);
  await assert.rejects(engine.runChatAction(v,used.chatOffer,1,{as:hero}),/Only a target/);
  await assert.rejects(engine.runChatAction(v,used.chatOffer,5),/not one of the Action/);
  adapter.users.set('pl',{role:'player',isGM:false});adapter.ownership.set('actor:foe|pl','owner');
  // Writing the attacker follows the Ruleset's Permissions like any Action: here the player owns both.
  adapter.ownership.set('actor:hero|pl','owner');
  const player=engine.forUser('pl');
  await assert.rejects(player.runChatAction(v,used.chatOffer,0),/Only the GM/);
  await player.runChatAction(v,used.chatOffer,1,{as:foe});
  assert.equal(await hp(engine,v,hero),18);
  assert.deepEqual(engine.writeTargets('runChatAction',[v,used.chatOffer,1,{as:foe}]),[hero]);
});

test('a chat button must name an Action of the Ruleset', async () => {
  const {api,v}=await setup();
  await assert.rejects(api.updateAction(v,'attack',{...api.getAction(v,'attack'),chatActions:[{actionRef:'nope',who:'self'}]}),/nope/);
  await assert.rejects(api.updateAction(v,'attack',{...api.getAction(v,'attack'),chatActions:[{actionRef:'apply',who:'anyone'}]}),/who must be one of/);
});
