import test from 'node:test';
import assert from 'node:assert/strict';
import {createConfiguratorAPI} from '../src/configurator/configurator-api.mjs';
import {emptyStorageSnapshot} from '../src/configurator/configurator-storage.mjs';
import {MemoryRuntimeAdapter} from '../src/runtime/memory-runtime-adapter.mjs';
import {RuntimeEngine} from '../src/runtime/runtime-engine.mjs';
import {multiplyDice} from '../src/configurator/roll-grammar.mjs';
class Storage{value=emptyStorageSnapshot();async load(){return structuredClone(this.value)}async save(v){this.value=structuredClone(v)}}
// d20 rolls give `natural`; any other dice give 3 per die, so 2d8 totals 6.
class Adapter extends MemoryRuntimeAdapter{natural=10;rolled=[];async roll(formula){this.rolled.push(formula);if(formula==='1d20')return {formula,total:this.natural,natural:this.natural,result:String(this.natural)};const dice=[...formula.matchAll(/(\d+)d\d+/g)].reduce((n,m)=>n+Number(m[1]),0);return {formula,total:dice*3,result:String(dice*3)};}}
const ref=(objectId,capabilityId,outputId,slotId)=>({objectKind:'definition',objectId,capabilityId,outputId,...(slotId?{slotId}:{})});
const hero={kind:'actor',id:'hero'},foe={kind:'actor',id:'foe'},context={roles:{self:hero,target:foe},defaultRole:'self'};
const ctx=path=>({type:'context',path});

async function setup(){
  const api=await createConfiguratorAPI(new Storage());
  const v=(await api.createRuleset({id:'dmg',nameKey:'Damage',version:'1'})).versionId;
  await api.registerDefinitionType(v,{id:'trait',key:'trait',nameKey:'Trait',descriptionKey:'',color:null,allowedCapabilities:['value','pool'],defaultCapabilities:['value'],requiredCapabilities:[],fields:{},constraints:[]});
  await api.createDefinition(v,{id:'might',key:'might',definitionTypeId:'trait',nameKey:'Might',descriptionKey:'',data:{},capabilities:['value'],enabled:true,tags:[]});
  await api.createDefinition(v,{id:'vitality',key:'vitality',definitionTypeId:'trait',nameKey:'Vitality',descriptionKey:'',data:{},capabilities:['pool'],slots:{pool:[{id:'points',minimum:{literal:0},maximum:{literal:30}}]},enabled:true,tags:[]});
  await api.createRoll(v,{id:'d20',nameKey:'d20',formula:'1d20'});
  await api.createRoll(v,{id:'sword',nameKey:'Sword',formula:'1d8'});
  await api.createFormula(v,{id:'might-bonus',nameKey:'Might',resultType:'number',expression:{type:'reference',reference:ref('might','value','value.final')}});
  await api.createFormula(v,{id:'double',nameKey:'Double',resultType:'number',expression:{type:'literal',value:2}});
  await api.createFormula(v,{id:'margin',nameKey:'Margin',resultType:'number',expression:ctx('variables.test.margin')});
  await api.createCondition(v,{id:'natural-20',nameKey:'20',expression:{type:'eq',left:ctx('variables.test.natural'),right:{type:'literal',value:20}}});
  await api.createCondition(v,{id:'hits',nameKey:'Hits',expression:{type:'gte',left:ctx('variables.test.margin'),right:{type:'literal',value:0}}});
  await api.createOutcome(v,{id:'critical',nameKey:'Critical',resultKey:'critical',conditionRef:'natural-20'});
  await api.createOutcome(v,{id:'hit',nameKey:'Hit',resultKey:'hit',conditionRef:'hits'});
  await api.createOutcome(v,{id:'miss',nameKey:'Miss',resultKey:'miss'});
  await api.createTest(v,{id:'attack',nameKey:'Attack',rollRef:'d20',targetValue:12,outcomeRefs:['critical','hit'],fallbackOutcomeRef:'miss'});
  const hurt=(id,operand)=>api.createEffect(v,{id,nameKey:id,targetRef:ref('vitality','pool','pool.current','points'),targetRole:'target',operation:'subtract',operand});
  await hurt('damage',{kind:'roll',rollRef:'sword',bonusFormulaRef:'might-bonus'});
  await hurt('critical-damage',{kind:'roll',rollRef:'sword',multiplierFormulaRef:'double',bonusFormulaRef:'might-bonus'});
  await hurt('margin-damage',{kind:'formula',id:'margin'});
  await api.createAction(v,{id:'strike',nameKey:'Strike',testRef:'attack',outcomeMappings:[{outcomeId:'critical',effectRefs:['critical-damage']},{outcomeId:'hit',effectRefs:['damage']},{outcomeId:'miss',effectRefs:[]}]});
  await api.createAction(v,{id:'push',nameKey:'Push',testRef:'attack',effectRefs:['margin-damage']});
  await api.publishRuleset(v);
  const adapter=new Adapter(),engine=new RuntimeEngine({configurator:api,adapter,hooks:null});
  for(const actor of [hero,foe])await engine.initializeContainer(v,actor,{initialByDefinition:{might:{'value.base':2}}});
  const vitality=async()=>engine.resolveReference(v,{container:'target',reference:ref('vitality','pool','pool.current','points')},context);
  return {v,engine,adapter,vitality};
}

test('A roll operand applies dice plus a bonus, and a multiplier Formula doubles the dice on a critical', async()=>{
  const {v,engine,adapter,vitality}=await setup();
  adapter.natural=15;let result=await engine.executeAction(v,'strike',context);
  assert.equal(result.changes[0].roll.formula,'1d8');assert.equal(result.changes[0].operand,3+2);
  assert.equal(await vitality(),25);
  adapter.natural=20;result=await engine.executeAction(v,'strike',context);
  assert.equal(result.changes[0].roll.formula,'2d8');assert.equal(await vitality(),25-8);
  adapter.natural=3;result=await engine.executeAction(v,'strike',context);
  assert.deepEqual(result.changes,[]);
});

test('Effects of an Action read its Test result', async()=>{
  const {v,engine,adapter,vitality}=await setup();
  adapter.natural=16;await engine.executeAction(v,'push',context);
  assert.equal(await vitality(),30-4,'margin 16 - 12');
});

test('Dice multiplication keeps modifiers and refuses computed counts', ()=>{
  assert.equal(multiplyDice('2d6kh1 + 1d4 + 3',3),'6d6kh1 + 3d4 + 3');
  assert.throws(()=>multiplyDice('(1+1)d6',2),/computed/);
  assert.throws(()=>multiplyDice('1d6',0),/positive integer/);
});
