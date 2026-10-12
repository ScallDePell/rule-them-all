import test from 'node:test';
import assert from 'node:assert/strict';
import {createConfiguratorAPI} from '../src/configurator/configurator-api.mjs';
import {emptyStorageSnapshot} from '../src/configurator/configurator-storage.mjs';
import {MemoryRuntimeAdapter} from '../src/runtime/memory-runtime-adapter.mjs';
import {createRuntimeAPI} from '../src/runtime/runtime-api.mjs';
import {installInitiative, rerollEachRound} from '../src/runtime/foundry-initiative.mjs';
class Storage{value=emptyStorageSnapshot();async load(){return structuredClone(this.value)}async save(v){this.value=structuredClone(v)}}
class Adapter extends MemoryRuntimeAdapter{queue=[];async roll(formula){const n=this.queue.shift()??10;return {formula,total:n,natural:n,result:String(n)};}}
const value=id=>({objectKind:'definition',objectId:id,capabilityId:'value',outputId:'value.final'});

async function setup(initiative={testRef:'init',tieBreakFormulaRef:'dex',eachRound:true}){
  const api=await createConfiguratorAPI(new Storage());
  const v=(await api.createRuleset({id:'combat',nameKey:'Combat',version:'1'})).versionId;
  await api.registerDefinitionType(v,{id:'stat',key:'stat',nameKey:'Stat',allowedCapabilities:['value'],defaultCapabilities:['value'],requiredCapabilities:[],fields:{}});
  await api.createDefinition(v,{id:'dex',key:'dex',definitionTypeId:'stat',nameKey:'Dex',data:{},capabilities:['value']});
  await api.createRoll(v,{id:'d20',nameKey:'d20',formula:'1d20'});
  await api.createFormula(v,{id:'dex',nameKey:'Dex',resultType:'number',expression:{type:'reference',reference:value('dex')}});
  await api.createTest(v,{id:'init',nameKey:'Initiative',rollRef:'d20',bonusFormulaRef:'dex'});
  await api.updateRuleset(v,{initiative});
  await api.publishRuleset(v);
  const adapter=new Adapter(),runtime=createRuntimeAPI(api,{adapter,hooks:null});
  for(const [id,dex] of [['a',3],['b',1]])await runtime.initializeContainer(v,{kind:'actor',id},{definitionIds:['dex'],initialByDefinition:{dex:{'value.base':dex}}});
  return {api,v,runtime,adapter};
}

test('The initiative Test gives the total, with the tie-break Formula as hundredths', async()=>{
  const {v,runtime,adapter}=await setup();
  adapter.queue=[14];
  const rolled=await runtime.rollInitiative(v,{kind:'actor',id:'a'});
  assert.equal(rolled.initiative,17.03);assert.equal(rolled.eachRound,true);
});

test('The combat tracker uses it for Ruleset Actors, the game system for the others, and rerolls each new round', async()=>{
  const {runtime,adapter}=await setup();
  const original=[];
  class Combat{
    constructor(){this.combatants=new Map([['ca',{id:'ca',name:'A',actor:{uuid:'actor:a'}}],['cb',{id:'cb',name:'B',actor:{uuid:'actor:b'}}],['cx',{id:'cx',name:'X',actor:{uuid:'Actor.other'}}]]);this.initiatives={};this.turn=3;}
    async rollInitiative(ids){original.push(...ids);return this;}
    async updateEmbeddedDocuments(_type,updates){for(const u of updates)this.initiatives[u._id]=u.initiative;}
    async update(data){Object.assign(this,data);}
  }
  const ids={'actor:a':{kind:'actor',id:'a'},'actor:b':{kind:'actor',id:'b'}};
  const bridged={...runtime,getContainerState:uuid=>runtime.getContainerState(ids[uuid]??{kind:'actor',id:uuid}),rollInitiative:(v,uuid)=>runtime.rollInitiative(v,ids[uuid])};
  installInitiative(Combat,()=>bridged,{chat:null});
  const combat=new Combat();
  adapter.queue=[10,12];
  await combat.rollInitiative(['ca','cb','cx']);
  assert.deepEqual(combat.initiatives,{ca:13.03,cb:13.01});assert.deepEqual(original,['cx']);
  adapter.queue=[2,20];
  assert.equal(await rerollEachRound(combat,{round:1},{round:2},()=>bridged),true);
  assert.deepEqual(combat.initiatives,{ca:5.03,cb:21.01});assert.equal(combat.turn,0);
  assert.equal(await rerollEachRound(combat,{round:2,turn:0},{round:2,turn:1},()=>bridged),false,'not a new round');
});

test('Saving checks the initiative settings', async()=>{
  const {api,v}=await setup(null);
  await assert.rejects(api.updateRuleset(v,{initiative:{testRef:'missing'}}),/test\/missing/);
  await assert.rejects(api.updateRuleset(v,{initiative:{testRef:'init',when:'always'}}),/Unsupported field/);
});

test('The Ruleset editor saves the initiative settings, and none when the game system rolls', async()=>{
  const {collectEntryData}=await import('../src/configurator/entry-data-collector.mjs');
  const collect=(values,current={id:'r',nameKey:'R'})=>{const fd=new Map(Object.entries({nameKey:'R',version:'1',...values}));
    return collectEntryData('ruleset',{fd,current,bool:key=>fd.get(key)==='on',checkedIds:()=>[],queryOne:()=>null,queryAll:()=>[],uid:()=>'x',fieldUid:()=>'y'}).initiative;};
  assert.deepEqual(collect({initiativeTestRef:'init',initiativeTieBreakFormulaRef:'agility',initiativeEachRound:'on'}),{testRef:'init',tieBreakFormulaRef:'agility',eachRound:true});
  assert.equal(collect({initiativeTestRef:''}),null);
  assert.deepEqual(collect({},{id:'r',initiative:{testRef:'init',eachRound:false}}),{testRef:'init',eachRound:false},'a form without the fields keeps them');
});
