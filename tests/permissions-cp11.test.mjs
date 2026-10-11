import test from 'node:test';
import assert from 'node:assert/strict';
import {createConfiguratorAPI} from '../src/configurator/configurator-api.mjs';
import {emptyStorageSnapshot} from '../src/configurator/configurator-storage.mjs';
import {preparePermissionRule} from '../src/configurator/permission-contract.mjs';
import {preparePermissionPolicy} from '../src/configurator/rule-contracts.mjs';
import {resolvePermission} from '../src/runtime/permission-policy.mjs';
import {MemoryRuntimeAdapter} from '../src/runtime/memory-runtime-adapter.mjs';
import {createRuntimeAPI} from '../src/runtime/runtime-api.mjs';
import {FoundrySocketRelay, serveRuntimeRelay} from '../src/runtime/runtime-relay.mjs';
class Storage{value=emptyStorageSnapshot();async load(){return structuredClone(this.value)}async save(v){this.value=structuredClone(v)}}
const player={userId:'p',role:'player',isGM:false,ownership:'owner'};
const rule=(id,effect,operations,extra={})=>({id,effect,operations,...extra});
const policy=(id,scope,rules,defaultEffect='DENY')=>preparePermissionPolicy({id,nameKey:id,scope,rules,defaultEffect});
const decide=(policies,operation,target,subject=player,condition)=>resolvePermission(policies,{operation,target,subject,condition});
const def={objectKind:'definition',objectId:'hero'};

test('CP-11: without a policy Foundry ownership decides, and a GM is always allowed', async () => {
  assert.equal((await decide([],'write',def)).allowed,true);
  assert.equal((await decide([],'write',def,{...player,ownership:'observer'})).allowed,false);
  assert.equal((await decide([],'read',def,{...player,ownership:'observer'})).allowed,true);
  assert.equal((await decide([policy('lock',{objectKind:'ruleset'},[])],'write',def,{userId:'g',role:'gamemaster',isGM:true,ownership:'none'})).allowed,true);
  assert.equal((await decide([],'configure',{objectKind:'ruleset'})).allowed,false);
});

test('CP-11: the most specific scope decides, then priority, then DENY on ties, then the default', async () => {
  const ruleset=policy('all',{objectKind:'ruleset'},[]);
  assert.deepEqual(await decide([ruleset],'write',def),{allowed:false,reason:'default',policyId:'all',ruleId:null});
  const kind=policy('defs',{objectKind:'definition'},[rule('players-write','ALLOW',['write'],{roles:['player']})]);
  assert.equal((await decide([ruleset,kind],'write',def)).allowed,true);
  const one=policy('hero',{objectKind:'definition',objectId:'hero'},[rule('allow','ALLOW',['write']),rule('deny','DENY',['write'])],'ALLOW');
  assert.equal((await decide([ruleset,kind,one],'write',def)).ruleId,'deny');
  const ranked=policy('hero',{objectKind:'definition',objectId:'hero'},[rule('allow','ALLOW',['write'],{priority:5}),rule('deny','DENY',['write'])]);
  assert.equal((await decide([ranked],'write',def)).ruleId,'allow');
  // An object-level policy for another object does not apply.
  assert.equal((await decide([ruleset,policy('other',{objectKind:'definition',objectId:'other'},[],'ALLOW')],'write',def)).allowed,false);
});

test('CP-11: rule criteria are role, minimum ownership, explicit users and a Condition', async () => {
  const p=policy('hero',{objectKind:'definition',objectId:'hero'},[rule('observers','ALLOW',['read'],{minimumOwnership:'observer'}),rule('alice','ALLOW',['write'],{userIds:['alice']}),rule('when','ALLOW',['execute'],{conditionRef:'awake'})]);
  assert.equal((await decide([p],'read',def,{...player,ownership:'limited'})).allowed,false);
  assert.equal((await decide([p],'read',def,{...player,ownership:'observer'})).allowed,true);
  assert.equal((await decide([p],'write',def)).allowed,false);
  assert.equal((await decide([p],'write',def,{...player,userId:'alice'})).allowed,true);
  assert.equal((await decide([p],'execute',def,player,async id=>id!=='awake')).allowed,false);
  assert.equal((await decide([p],'execute',def,player,async()=>true)).allowed,true);
});

test('CP-11: PermissionPolicy rules are a closed contract', () => {
  assert.throws(()=>preparePermissionRule({id:'r',effect:'MAYBE',operations:['read']}),/ALLOW or DENY/);
  assert.throws(()=>preparePermissionRule({id:'r',effect:'ALLOW',operations:['delete']}),/operations/);
  assert.throws(()=>preparePermissionRule({id:'r',effect:'ALLOW',operations:['read'],roles:['king']}),/roles/);
  assert.throws(()=>preparePermissionRule({id:'r',effect:'ALLOW',operations:['read'],minimumOwnership:'full'}),/minimumOwnership/);
  assert.throws(()=>preparePermissionPolicy({id:'p',nameKey:'P',rules:[rule('a','ALLOW',['read']),rule('a','DENY',['read'])]}),/Duplicate permission rule/);
});

async function world(){
  const api=await createConfiguratorAPI(new Storage());
  const v=(await api.createRuleset({id:'perm',nameKey:'Perm',version:'1'})).versionId;
  await api.registerDefinitionType(v,{id:'body',key:'body',nameKey:'Body',descriptionKey:'',color:null,enabled:true,allowedCapabilities:['pool','value'],defaultCapabilities:['pool'],requiredCapabilities:[],fields:{},constraints:[]});
  await api.createDefinition(v,{id:'hero',key:'hero',definitionTypeId:'body',nameKey:'Hero',descriptionKey:'',data:{},capabilities:['pool'],slots:{pool:[{id:'hp',minimum:{literal:0},maximum:{literal:10}}]},enabled:true,tags:[]});
  await api.createDefinition(v,{id:'secret',key:'secret',definitionTypeId:'body',nameKey:'Secret',descriptionKey:'',data:{},capabilities:['value'],enabled:true,tags:[]});
  await api.createCondition(v,{id:'always',nameKey:'Always',expression:{type:'literal',value:true},enabled:true,tags:[]});
  await api.createEffect(v,{id:'hurt',nameKey:'Hurt',targetRole:'target',targetRef:{objectKind:'definition',objectId:'hero',capabilityId:'pool',slotId:'hp',outputId:'pool.current'},operation:'subtract',operand:{kind:'literal',value:3},enabled:true,tags:[]});
  await api.createAction(v,{id:'strike',nameKey:'Strike',effectRefs:['hurt'],enabled:true,tags:[]});
  await api.createPermissionPolicy(v,{id:'combat',nameKey:'Combat',scope:{objectKind:'definition',objectId:'hero'},defaultEffect:'DENY',rules:[rule('anyone-reads','ALLOW',['read']),rule('players-hurt','ALLOW',['write'],{roles:['player'],conditionRef:'always'})]});
  await api.createPermissionPolicy(v,{id:'hidden',nameKey:'Hidden',scope:{objectKind:'definition',objectId:'secret'},defaultEffect:'DENY',rules:[]});
  await api.publishRuleset(v);
  // Two clients over the same world: the GM's and the player's (who owns A, not B).
  const gmAdapter=new MemoryRuntimeAdapter();
  gmAdapter.users.set('p',{role:'player',isGM:false});gmAdapter.ownership.set('actor:a|p','owner');gmAdapter.ownership.set('actor:b|p','observer');
  const playerAdapter=Object.assign(new MemoryRuntimeAdapter(),{states:gmAdapter.states,ledgers:gmAdapter.ledgers,users:gmAdapter.users,ownership:gmAdapter.ownership,currentUserId:'p'});
  const gm=createRuntimeAPI(api,{adapter:gmAdapter,hooks:null});
  for(const id of ['a','b'])await gm.initializeContainer(v,{kind:'actor',id});
  return {api,v,gm,playerAdapter};
}
const context={roles:{self:{kind:'actor',id:'a'},target:{kind:'actor',id:'b'}},defaultRole:'self'};

test('CP-11: a player write on a Document they do not own needs the GM client, which checks the rules for that player', async () => {
  const {api,v,gm,playerAdapter}=await world();
  const alone=createRuntimeAPI(api,{adapter:playerAdapter,hooks:null});
  await assert.rejects(()=>alone.executeAction(v,'strike',context),error=>error.code==='RUNTIME_NEEDS_GM');
  const relayed=[];
  const player=createRuntimeAPI(api,{adapter:playerAdapter,hooks:null,relay:{request:(method,args)=>{relayed.push(method);return gm.serveRelay(JSON.parse(JSON.stringify({method,args,userId:'p'})));}}});
  const result=await player.executeAction(v,'strike',context);
  assert.deepEqual(relayed,['executeAction']);
  assert.equal(result.committed,true);
  const entry=(await gm.getLedger({kind:'actor',id:'b'})).at(-1);
  assert.equal(entry.userId,'p');
  assert.equal((await gm.getContainerState({kind:'actor',id:'b'})).definitionStates.hero.capabilityStates.pool.hp.current,7);
  // A write on the player's own Actor stays local.
  await player.setDefinitionState(v,{kind:'actor',id:'a'},'hero',{pools:{hp:9}});
  assert.deepEqual(relayed,['executeAction']);
});

test('CP-11: the GM refuses a relayed write the rules deny to the player, and writes nothing', async () => {
  const {v,gm}=await world();
  await assert.rejects(()=>gm.serveRelay({method:'setDefinitionState',args:[v,{kind:'actor',id:'b'},'secret',{base:5}],userId:'p'}),error=>error.code==='RUNTIME_FORBIDDEN');
  assert.equal((await gm.getContainerState({kind:'actor',id:'b'})).definitionStates.secret.capabilityStates.value.base,0);
  await assert.rejects(()=>serveRuntimeRelay({},{method:'resetContainer',args:[],userId:'p'}),error=>error.code==='RUNTIME_RELAY_METHOD');
});

test('CP-11: a player never receives the DefinitionStates or ledger changes they cannot read', async () => {
  const {api,v,gm,playerAdapter}=await world();
  await gm.setDefinitionState(v,{kind:'actor',id:'a'},'secret',{base:42});
  const player=createRuntimeAPI(api,{adapter:playerAdapter,hooks:null});
  const seen=await player.getContainerState({kind:'actor',id:'a'});
  assert.deepEqual(Object.keys(seen.definitionStates),['hero']);
  assert.ok((await gm.getContainerState({kind:'actor',id:'a'})).definitionStates.secret);
  const ledger=await player.getLedger({kind:'actor',id:'a'});
  assert.equal(ledger.at(-1).changes.length,0);
  assert.equal(ledger.some(entry=>entry.changes.some(change=>change.id==='secret')),false);
});

test('CP-11: executing an Action needs the execute permission', async () => {
  const {api,v,playerAdapter}=await world();
  const engine=createRuntimeAPI(api,{adapter:playerAdapter,hooks:null});
  const decision=await engine.authorize(v,'execute',{objectKind:'action',objectId:'strike'},{kind:'actor',id:'a'});
  assert.equal(decision.allowed,true);
  assert.equal((await engine.authorize(v,'execute',{objectKind:'action',objectId:'strike'},{kind:'actor',id:'b'})).allowed,false);
});

test('CP-11: the socket relay answers only from the active GM, and only to the requester', async () => {
  const listeners=[];
  const bus={on:(channel,fn)=>listeners.push({channel,fn}),emit:(channel,message,from)=>{for(const l of listeners)if(l.channel===channel&&l.owner!==from)l.fn(structuredClone(message));}};
  const client=(id,isGM)=>{const socket={on:(channel,fn)=>{bus.on(channel,fn);listeners.at(-1).owner=id;},emit:(channel,message)=>bus.emit(channel,message,id)};return new FoundrySocketRelay({socket,user:()=>({id}),users:{activeGM:{isSelf:isGM}},timeout:200});};
  const gm=client('g',true),other=client('o',false),player=client('p',false);
  gm.listen(async message=>({served:message.method,for:message.userId}));
  other.listen(async()=>{throw new Error('not the GM');});player.listen(async()=>null);
  assert.deepEqual(await player.request('executeAction',[]),{served:'executeAction',for:'p'});
  const noGM=new FoundrySocketRelay({socket:{on(){},emit(){}},user:()=>({id:'p'}),users:{activeGM:null}});
  await assert.rejects(()=>noGM.request('executeAction',[]),error=>error.code==='RUNTIME_GM_UNAVAILABLE');
});

test('CP-11: a DENY rule carries the message that explains the refusal (former Restriction)', async () => {
  const {resolvePermission}=await import('../src/runtime/permission-policy.mjs');
  const {preparePermissionRule}=await import('../src/configurator/permission-contract.mjs');
  const rule=preparePermissionRule({id:'stunned',effect:'DENY',operations:['execute'],conditionRef:'is-stunned',priority:5,messageKey:'You are stunned.'});
  const decision=await resolvePermission([{id:'p',enabled:true,scope:{objectKind:'ruleset'},defaultEffect:'ALLOW',rules:[rule]}],{operation:'execute',target:{objectKind:'action',objectId:'attack'},subject:{userId:'u',role:'player',ownership:'owner'},condition:async id=>id==='is-stunned'});
  assert.equal(decision.allowed,false);
  assert.equal(decision.messageKey,'You are stunned.');
  assert.throws(()=>preparePermissionRule({id:'x',effect:'DENY',operations:['read'],messageKey:3}),/messageKey/);
});
