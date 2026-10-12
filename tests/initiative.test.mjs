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
  await assert.rejects(api.updateRuleset(v,{initiative:{testRef:'init',tableRef:'cards'}}),/not both/);
  await assert.rejects(api.updateRuleset(v,{initiative:{tableRef:'missing'}}),/table\/missing/);
});

test('The Ruleset editor saves the initiative settings, and none when the game system rolls', async()=>{
  const {collectEntryData}=await import('../src/configurator/entry-data-collector.mjs');
  const collect=(values,current={id:'r',nameKey:'R'})=>{const fd=new Map(Object.entries({nameKey:'R',version:'1',...values}));
    return collectEntryData('ruleset',{fd,current,bool:key=>fd.get(key)==='on',checkedIds:()=>[],queryOne:()=>null,queryAll:()=>[],uid:()=>'x',fieldUid:()=>'y'}).initiative;};
  assert.deepEqual(collect({initiativeSource:'test:init',initiativeTieBreakFormulaRef:'agility',initiativeEachRound:'on'}),{testRef:'init',tieBreakFormulaRef:'agility',eachRound:true,bySide:false});
  assert.deepEqual(collect({initiativeSource:'table:deck',initiativeBySide:'on'}),{tableRef:'deck',tieBreakFormulaRef:null,eachRound:false,bySide:true});
  assert.equal(collect({initiativeSource:''}),null);
  assert.deepEqual(collect({},{id:'r',initiative:{testRef:'init',eachRound:false}}),{testRef:'init',eachRound:false},'a form without the fields keeps them');
});

test('Initiative drawn from a Table: the row gives the value, rows drawn this round are skipped, the row Actions run', async()=>{
  const api=await createConfiguratorAPI(new Storage());
  const v=(await api.createRuleset({id:'deck',nameKey:'Deck',version:'1'})).versionId;
  await api.registerDefinitionType(v,{id:'stat',key:'stat',nameKey:'Stat',allowedCapabilities:['value'],defaultCapabilities:['value'],requiredCapabilities:[],fields:{}});
  await api.createDefinition(v,{id:'joker',key:'joker',definitionTypeId:'stat',nameKey:'Joker',data:{},capabilities:['value']});
  await api.createEffect(v,{id:'wild',nameKey:'Wild',targetRef:{objectKind:'definition',objectId:'joker',capabilityId:'value',outputId:'value.base'},targetRole:'self',operation:'set',operand:{kind:'literal',value:1}});
  await api.createAction(v,{id:'wild',nameKey:'Wild card',effectRefs:['wild']});
  await api.createRoll(v,{id:'d3',nameKey:'d3',formula:'1d3'});
  await api.createTable(v,{id:'cards',nameKey:'Cards',rollRef:'d3',rows:[{id:'two',labelKey:'Two',min:2,max:2},{id:'king',labelKey:'King',min:13,max:13},{id:'joker',labelKey:'Joker',min:20,max:20,actionRefs:['wild']}]});
  await api.updateRuleset(v,{initiative:{tableRef:'cards',bySide:true}});
  await api.publishRuleset(v);
  const adapter=new Adapter(),runtime=createRuntimeAPI(api,{adapter,hooks:null}),hero={kind:'actor',id:'hero'};
  await runtime.initializeContainer(v,hero,{definitionIds:['joker']});
  adapter.queue=[3];
  const first=await runtime.rollInitiative(v,hero);
  assert.equal(first.initiative,20);assert.equal(first.rowId,'joker');assert.equal(first.labelKey,'Joker');assert.equal(first.bySide,true);
  assert.equal((await runtime.getContainerState(hero)).definitionStates.joker?.capabilityStates?.value?.base,1,'the row Action ran');
  adapter.queue=[2];
  assert.equal((await runtime.rollInitiative(v,hero,{drawn:['two']})).rowId,'joker','the second row of what is left');
  await assert.rejects(runtime.rollInitiative(v,hero,{drawn:['two','king','joker']}),/Every row/);

  // The tracker: one draw per side, shared by the side; the next side cannot draw the same card this round.
  class Combat{
    constructor(){this.round=1;this.combatants=new Map([['a',{id:'a',name:'A',token:{disposition:1},actor:{uuid:'a'}}],['b',{id:'b',name:'B',token:{disposition:1},actor:{uuid:'b'}}],['c',{id:'c',name:'C',token:{disposition:-1},actor:{uuid:'c'}}]]);this.initiatives={};}
    async rollInitiative(){return this;}
    async updateEmbeddedDocuments(_type,updates){for(const u of updates)this.initiatives[u._id]=u.initiative;}
  }
  for(const id of ['a','b','c'])await runtime.initializeContainer(v,{kind:'actor',id},{definitionIds:['joker']});
  const draws=[];
  const bridged={getContainerState:uuid=>runtime.getContainerState({kind:'actor',id:uuid}),rollInitiative:(version,uuid,options)=>{draws.push([uuid,[...options.drawn]]);return runtime.rollInitiative(version,{kind:'actor',id:uuid},options);}};
  installInitiative(Combat,()=>bridged,{chat:null});
  const combat=new Combat();
  adapter.queue=[2,2];
  await combat.rollInitiative(['a','b','c']);
  assert.deepEqual(combat.initiatives,{a:13,b:13,c:20},'king for the first side, then the joker among two and joker');
  assert.deepEqual(draws,[['a',[]],['c',['king']]]);
  combat.round=2;adapter.queue=[1];
  await combat.rollInitiative(['c']);
  assert.deepEqual(draws.at(-1),['c',[]],'a new round shuffles the deck');
});
