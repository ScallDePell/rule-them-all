import test from 'node:test';
import assert from 'node:assert/strict';
import {startWorld} from './helpers/foundry-sim/world.mjs';

/* Several Foundry clients over one world (tests/helpers/foundry-sim): a GM and two players, each running the real
   module. What one client writes reaches the others only through the simulated server, which refuses what Foundry's
   server refuses. */
const USERS=[{_id:'gm',name:'GM',role:4},{_id:'alice',name:'Alice'},{_id:'bob',name:'Bob'}];
// Ana is Alice's; Bob only observes her. Ogre is the GM's, seen by all.
const ACTORS=[{_id:'ana',name:'Ana',ownership:{default:0,alice:3,bob:2}},{_id:'bea',name:'Bea',ownership:{default:0,bob:3}},{_id:'ogre',name:'Ogre',type:'npc',ownership:{default:2}}];

/** On the GM client: a Ruleset with hit points, a strike, and counters the combat Triggers raise; published and active. */
async function buildRuleset(){
  const api=game.ruleThemAll.configurator;
  const v=(await api.createRuleset({id:'sim',nameKey:'Sim',version:'1.0.0'})).versionId;
  const pool=(id,max,initial)=>({id,key:id,definitionTypeId:'body',nameKey:id,descriptionKey:'',data:{},capabilities:['pool'],slots:{pool:[{id:'points',minimum:{literal:0},maximum:{literal:max},initial:{literal:initial}}]},enabled:true,tags:[]});
  const ref=id=>({objectKind:'definition',objectId:id,capabilityId:'pool',slotId:'points',outputId:'pool.current'});
  await api.registerDefinitionType(v,{id:'body',key:'body',nameKey:'Body',descriptionKey:'',color:null,allowedCapabilities:['pool','value'],defaultCapabilities:['pool'],requiredCapabilities:[],fields:{},constraints:[]});
  for(const [id,max,initial] of [['hp',10,10],['turns',100,0],['rounds',100,0],['starts',100,0]])await api.createDefinition(v,pool(id,max,initial));
  await api.createEffect(v,{id:'hurt',nameKey:'Hurt',targetRole:'target',targetRef:ref('hp'),operation:'subtract',operand:{kind:'literal',value:3},enabled:true,tags:[]});
  await api.createAction(v,{id:'strike',nameKey:'Strike',effectRefs:['hurt'],enabled:true,tags:[]});
  for(const id of ['turns','rounds','starts']){
    await api.createEffect(v,{id:`count-${id}`,nameKey:id,targetRole:'self',targetRef:ref(id),operation:'add',operand:{kind:'literal',value:1},enabled:true,tags:[]});
    await api.createAction(v,{id:`tick-${id}`,nameKey:id,effectRefs:[`count-${id}`],enabled:true,tags:[]});
  }
  await api.createTrigger(v,{id:'on-turn',nameKey:'Turn',eventTypeId:'rta.combat.turn',actionRefs:['tick-turns']});
  await api.createTrigger(v,{id:'on-round',nameKey:'Round',eventTypeId:'rta.combat.round',actionRefs:['tick-rounds']});
  await api.createTrigger(v,{id:'on-start',nameKey:'Start',eventTypeId:'rta.combat.start',actionRefs:['tick-starts']});
  await api.publishRuleset(v);
  await api.setActiveVersionId(v);
  for(const actor of game.actors)await game.ruleThemAll.runtime.initializeContainer(v,actor.uuid);
  return v;
}
const points=async(client,actor,id)=>client.run(async({actor,id})=>(await game.ruleThemAll.runtime.getContainerState(`Actor.${actor}`)).definitionStates[id].capabilityStates.pool.points.current,{actor,id});
const strike=(client,v,self,target)=>client.run(async({v,self,target})=>{
  const result=await game.ruleThemAll.runtime.executeAction(v,'strike',{roles:{self:`Actor.${self}`,target:`Actor.${target}`},defaultRole:'self'});
  return {committed:result.committed};
},{v,self,target});
const failure=promise=>promise.then(()=>null,error=>({code:error.code??null,message:error.message}));
const errorsOf=clients=>clients.flatMap(client=>client.errors().map(entry=>`${client.userId}: ${entry.message}`));

async function session(t,{turnHooks}={}){
  const world=startWorld({users:USERS,actors:ACTORS,options:{turnHooks}});
  t.after(()=>world.close());
  const gm=await world.connect('gm'),alice=await world.connect('alice'),bob=await world.connect('bob');
  const v=await gm.run(buildRuleset);
  await world.settle();
  return {world,gm,alice,bob,v,clients:[gm,alice,bob]};
}

test('multi-client: every client loads the module and sees the Ruleset the GM published', async t=>{
  const {gm,alice,bob,v,clients}=await session(t);
  for(const client of clients){
    const seen=await client.run(async()=>({active:game.ruleThemAll.configurator.getActiveVersionId(),menus:[...game.settings.menus.keys()]}));
    assert.equal(seen.active,v,`${client.userId} reads the active version from the world settings`);
    assert.deepEqual(seen.menus,['rule-them-all.configurator','rule-them-all.repair'],'both menus register with an Application class');
  }
  assert.equal(await points(bob,'ana','hp'),10,'the GM initialized every Actor');
  assert.deepEqual(errorsOf(clients),[]);
  // A player cannot configure: the storage refuses before the server would.
  const refused=await failure(alice.run(async({v})=>game.ruleThemAll.configurator.setActiveVersionId(null),{v}));
  assert.ok(refused,'a player cannot change the active Ruleset');
  assert.equal(await gm.run(async()=>game.ruleThemAll.configurator.getActiveVersionId()),v);
});

test('multi-client: a player hits a GM Actor through the GM client; every client sees it, signed by the player', async t=>{
  const {world,gm,alice,bob,v,clients}=await session(t);
  assert.deepEqual(await strike(alice,v,'ana','ogre'),{committed:true});
  await world.settle();
  for(const client of clients)assert.equal(await points(client,'ogre','hp'),7,`${client.userId} sees the Ogre hurt`);
  const entry=await bob.run(async()=>(await game.ruleThemAll.runtime.getLedger('Actor.ogre')).at(-1));
  assert.equal(entry.userId,'alice','the GM wrote it for Alice');
  // On her own Actor Alice writes herself: the server accepts it from her.
  await alice.run(async({v})=>game.ruleThemAll.runtime.setDefinitionState(v,'Actor.ana','hp',{pools:{points:4}}),{v});
  await world.settle();
  assert.equal(await points(gm,'ana','hp'),4);
  assert.deepEqual(errorsOf(clients),[]);
});

test('multi-client: a player cannot write an Actor they only observe, through the GM client or around it', async t=>{
  const {world,gm,alice,bob,v,clients}=await session(t);
  const relayed=await failure(bob.run(async({v})=>game.ruleThemAll.runtime.setDefinitionState(v,'Actor.ana','hp',{pools:{points:1}}),{v}));
  assert.equal(relayed?.code,'RUNTIME_FORBIDDEN','the GM checks the rules for Bob, not for itself');
  // Straight to the server, as a modified client would: Foundry's server refuses it.
  const direct=await failure(bob.run(async()=>game.actors.get('ana').setFlag('rule-them-all','runtimeState',{})));
  assert.match(direct?.message??'',/lacks permission/);
  await world.settle();
  assert.equal(await points(alice,'ana','hp'),10,'nothing was written');
  assert.deepEqual(errorsOf([gm,alice]),[]);
});

test('multi-client: without a connected GM a player write on a GM Actor fails at once and writes nothing', async t=>{
  const {world,gm,alice,v}=await session(t);
  await gm.disconnect();
  const refused=await failure(strike(alice,v,'ana','ogre'));
  assert.equal(refused?.code,'RUNTIME_GM_UNAVAILABLE');
  await world.settle();
  assert.equal(await points(alice,'ogre','hp'),10);
});

test('multi-client: two players hitting the same GM Actor at once both count', async t=>{
  const {world,alice,bob,gm,v,clients}=await session(t);
  const results=await Promise.all([strike(alice,v,'ana','ogre'),strike(bob,v,'bea','ogre')]);
  assert.deepEqual(results,[{committed:true},{committed:true}]);
  await world.settle();
  assert.equal(await points(gm,'ogre','hp'),4,'neither write was lost');
  assert.equal((await gm.run(async()=>(await game.ruleThemAll.runtime.getLedger('Actor.ogre')).length))>=2,true);
  assert.deepEqual(errorsOf(clients),[]);
});

for(const turnHooks of ['updateFirst','turnChangeFirst']){
  test(`multi-client: combat events run once, on the GM client, in order (${turnHooks})`, async t=>{
    const {world,gm,alice,bob,clients}=await session(t,{turnHooks});
    await gm.run(async()=>{
      const combat=await Combat.create({});
      await combat.createEmbeddedDocuments('Combatant',[{actorId:'ana'},{actorId:'bea'},{actorId:'ogre'}]);
      await combat.updateEmbeddedDocuments('Combatant',combat.turns.map((c,i)=>({_id:c.id,initiative:[15,10,5][['ana','bea','ogre'].indexOf(c.actorId)]})));
      await combat.startCombat();
    });
    await world.settle();
    // Three clients heard the start: the Triggers ran once, and Ana, first to act, heard her turn after the start.
    for(const [actor,expected] of [['ana',{starts:1,rounds:1,turns:1}],['bea',{starts:1,rounds:1,turns:0}],['ogre',{starts:1,rounds:1,turns:0}]])
      for(const [id,value] of Object.entries(expected))assert.equal(await points(gm,actor,id),value,`${actor} ${id}`);
    await gm.run(async()=>{const combat=game.combat;await combat.nextTurn();await combat.nextTurn();await combat.nextTurn();});
    await world.settle();
    for(const [actor,expected] of [['ana',{rounds:2,turns:2}],['bea',{rounds:2,turns:1}],['ogre',{rounds:2,turns:1}]])
      for(const [id,value] of Object.entries(expected))assert.equal(await points(bob,actor,id),value,`${actor} ${id} after a round`);
    assert.deepEqual(errorsOf(clients),[]);
  });
}

test('multi-client: a player cannot act in the name of another player or of the GM', async t=>{
  const {world,gm,alice,bob,v,clients}=await session(t);
  const hp=()=>world.data.actors.bea.flags['rule-them-all'].runtimeState.definitionStates.hp.capabilityStates.pool.points.current;
  // A forged request on the module socket, claiming Bob, then the GM: the GM no longer takes requests from the socket.
  for(const claimed of ['bob','gm'])await alice.run(async({v,claimed})=>game.socket.emit('module.rule-them-all',{type:'request',id:`forged-${claimed}`,userId:claimed,method:'setDefinitionState',args:[v,'Actor.bea','hp',{pools:{points:1}}]}),{v,claimed});
  await world.settle();
  assert.equal(hp(),10,'a socket message names any user it likes: it is not a request');
  // A request written in Bob's User document: Foundry's server refuses it to Alice.
  const forged=await failure(alice.run(async({v})=>game.users.get('bob').update({'flags.rule-them-all.relay.forged':JSON.stringify({method:'setDefinitionState',args:[v,'Actor.bea','hp',{pools:{points:1}}]})}),{v}));
  assert.match(forged?.message??'',/lacks permission/);
  // In her own User document, the request is Alice's: the rules are checked for her.
  const own=await failure(alice.run(async({v})=>game.ruleThemAll.runtime.setDefinitionState(v,'Actor.bea','hp',{pools:{points:1}}),{v}));
  assert.equal(own?.code,'RUNTIME_FORBIDDEN');
  await world.settle();
  assert.equal(hp(),10);
  // A request a GM writes in a player's document is not that player's: removed unserved.
  await gm.run(async({v})=>game.users.get('bob').update({'flags.rule-them-all.relay.gm-made':JSON.stringify({method:'setDefinitionState',args:[v,'Actor.bea','hp',{pools:{points:1}}]})}),{v});
  await world.settle();
  assert.equal(hp(),10,'served neither as Bob nor as the GM');
  // Bob's own relayed request still works, and leaves nothing behind in his User document.
  assert.deepEqual(await strike(bob,v,'bea','ogre'),{committed:true});
  await world.settle();
  assert.equal(await points(gm,'ogre','hp'),7);
  assert.deepEqual(world.data.users.bob.flags['rule-them-all'],{relay:{},relayAnswer:{}},'nothing is left in Bob\'s User document');
  assert.deepEqual(errorsOf(clients),[]);
});

test('multi-client: a forged answer does not reach the player who asked', async t=>{
  const {world,gm,alice,bob,v,clients}=await session(t);
  // Alice sees Bob's request in his User document and answers it first, "done", on the socket and in his document.
  await alice.run(async()=>{
    globalThis.forgeries=[];
    Hooks.on('updateUser',(user,changed)=>{
      for(const id of Object.keys(changed?.flags?.['rule-them-all']?.relay??{}).filter(id=>!id.startsWith('-='))){
        game.socket.emit('module.rule-them-all',{type:'response',id,to:user.id,ok:true,result:{committed:true}});
        user.update({[`flags.rule-them-all.relayAnswer.${id}`]:JSON.stringify({ok:true,result:{committed:true}})}).then(()=>forgeries.push('written'),error=>forgeries.push(error.message));
      }
    });
  });
  // Bob may not write Ana's hit points: the GM refuses, and Bob hears the GM, not Alice.
  const relayed=await failure(bob.run(async({v})=>game.ruleThemAll.runtime.setDefinitionState(v,'Actor.ana','hp',{pools:{points:1}}),{v}));
  assert.equal(relayed?.code,'RUNTIME_FORBIDDEN');
  await world.settle();
  const forgeries=await alice.run(async()=>globalThis.forgeries);
  assert.ok(forgeries.length&&forgeries.every(entry=>/lacks permission/.test(entry)),'Foundry\'s server refuses Alice\'s answer in Bob\'s document');
  assert.equal(await points(gm,'ana','hp'),10);
  assert.deepEqual(errorsOf(clients),[]);
});
