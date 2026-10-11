import test from 'node:test';
import assert from 'node:assert/strict';
import {createConfiguratorAPI} from '../src/configurator/configurator-api.mjs';
import {emptyStorageSnapshot} from '../src/configurator/configurator-storage.mjs';
import {MemoryRuntimeAdapter} from '../src/runtime/memory-runtime-adapter.mjs';
import {RuntimeEngine} from '../src/runtime/runtime-engine.mjs';
import {RuntimeEvaluator} from '../src/runtime/runtime-evaluator.mjs';
class Storage{constructor(){this.value=emptyStorageSnapshot();this.listeners=new Set();}async load(){return structuredClone(this.value)}async save(v){this.value=structuredClone(v);for(const f of this.listeners)f(this.value)}subscribe(f){this.listeners.add(f);return()=>this.listeners.delete(f)}}

async function setup(){
 const api=await createConfiguratorAPI(new Storage());const v=(await api.createRuleset({id:'r',nameKey:'R',version:'1'})).versionId;
 await api.registerDefinitionType(v,{id:'attribute',key:'attribute',nameKey:'Attribute',descriptionKey:'',color:null,order:10,allowedCapabilities:['value'],defaultCapabilities:['value'],requiredCapabilities:['value'],fields:{},constraints:[]});
 await api.registerDefinitionType(v,{id:'resource',key:'resource',nameKey:'Resource',descriptionKey:'',color:null,order:20,allowedCapabilities:['pool'],defaultCapabilities:['pool'],requiredCapabilities:['pool'],fields:{},constraints:[]});
 await api.createDefinition(v,{id:'strength',key:'strength',definitionTypeId:'attribute',nameKey:'Strength',descriptionKey:'',data:{},categories:[],capabilities:['value'],enabled:true,order:10,tags:[]});
 await api.createDefinition(v,{id:'vitality',key:'vitality',definitionTypeId:'resource',nameKey:'Vitality',descriptionKey:'',data:{},categories:[],capabilities:['pool'],slots:{pool:[{id:'hp',minimum:{literal:0},maximum:{literal:12}}]},enabled:true,order:20,tags:[]});
 await api.createParameter(v,{id:'base',nameKey:'Base',valueType:'integer',value:7,scope:'ruleset',enabled:true,order:10,tags:[]});
 await api.createFormula(v,{id:'max',nameKey:'Maximum',resultType:'number',expression:{type:'add',args:[{type:'parameter',id:'base'},{type:'reference',reference:{objectKind:'definition',objectId:'strength',capabilityId:'value',outputId:'value.final'}}]},enabled:true,order:10,tags:[]});
 await api.createCondition(v,{id:'alive',nameKey:'Alive',expression:{type:'gt',left:{type:'reference',reference:{objectKind:'definition',objectId:'vitality',capabilityId:'pool',slotId:'hp',outputId:'pool.current'}},right:{type:'literal',value:0}},enabled:true,order:10,tags:[]});
 await api.createEffect(v,{id:'damage',nameKey:'Damage',targetRef:{objectKind:'definition',objectId:'vitality',capabilityId:'pool',slotId:'hp',outputId:'pool.current'},operation:'subtract',operand:{kind:'literal',value:2},enabled:true,order:10,tags:[]});
 await api.createAction(v,{id:'hit',nameKey:'Hit',conditionRefs:['alive'],costEffectRefs:[],effectRefs:['damage'],enabled:true,order:10,tags:[]});
 return {api,v};
}

test('Runtime evaluates formulas against instantiated Definition outputs',async()=>{const {api,v}=await setup();await api.publishRuleset(v);const adapter=new MemoryRuntimeAdapter(),engine=new RuntimeEngine({configurator:api,adapter,hooks:null});const actor={kind:'actor',id:'a'};await engine.instantiateDefinition(v,actor,'strength',{initial:{'value.base':3}});assert.equal(await engine.evaluateFormula(v,'max',{roles:{self:actor}}),10);});

test('Runtime previews and commits an Action through adapter state',async()=>{const {api,v}=await setup();await api.publishRuleset(v);const adapter=new MemoryRuntimeAdapter(),engine=new RuntimeEngine({configurator:api,adapter,hooks:null});const actor={kind:'actor',id:'a'};await engine.instantiateDefinition(v,actor,'vitality',{initial:{'pool.hp.current':8}});const context={roles:{self:actor,target:actor}};const preview=await engine.executeAction(v,'hit',context,{preview:true});assert.equal(preview.changes[0].before,8);assert.equal(preview.changes[0].after,6);assert.equal((await engine.getContainerState(actor)).definitionStates.vitality.capabilityStates.pool.hp.current,8);await engine.executeAction(v,'hit',context);assert.equal((await engine.getContainerState(actor)).definitionStates.vitality.capabilityStates.pool.hp.current,6);});

test('Runtime blocks Action when Condition fails',async()=>{const {api,v}=await setup();await api.publishRuleset(v);const adapter=new MemoryRuntimeAdapter(),engine=new RuntimeEngine({configurator:api,adapter,hooks:null});const actor={kind:'actor',id:'a'};await engine.instantiateDefinition(v,actor,'vitality',{initial:{'pool.hp.current':0}});const result=await engine.previewAction(v,'hit',{roles:{self:actor,target:actor}});assert.equal(result.allowed,false);assert.equal(result.conditionId,'alive');});


test('Runtime initializes all enabled Definitions without duplicating existing state',async()=>{const {api,v}=await setup();await api.publishRuleset(v);const adapter=new MemoryRuntimeAdapter(),engine=new RuntimeEngine({configurator:api,adapter,hooks:null});const actor={kind:'actor',id:'a'};await engine.instantiateDefinition(v,actor,'strength',{initial:{'value.base':3}});const result=await engine.initializeContainer(v,actor);assert.equal(result.created,1);assert.ok(result.state.definitionStates.strength);assert.ok(result.state.definitionStates.vitality);});

test('Runtime emits configured EventTypes and executes matching Triggers',async()=>{const {api,v}=await setup();await api.createEventType(v,{id:'impact',nameKey:'Impact',descriptionKey:'',payloadFields:{},roles:[],enabled:true,order:10});await api.createTrigger(v,{id:'on-impact',nameKey:'On Impact',descriptionKey:'',eventTypeId:'impact',eventFilter:null,conditionRefs:[],actionRefs:['hit'],enabled:true,order:10,tags:[]});await api.publishRuleset(v);const adapter=new MemoryRuntimeAdapter(),calls=[],engine=new RuntimeEngine({configurator:api,adapter,hooks:{callAll:(...a)=>calls.push(a)}});const actor={kind:'actor',id:'a'};await engine.instantiateDefinition(v,actor,'vitality',{initial:{'pool.hp.current':8}});const result=await engine.emitEvent(v,'impact',{}, {roles:{self:actor,target:actor}});assert.equal(result.triggered.length,1);assert.equal((await engine.getContainerState(actor)).definitionStates.vitality.capabilityStates.pool.hp.current,6);assert.equal(calls.at(-1)[0],'ruleThemAllEvent');});

test('Runtime delegates rolls to the adapter',async()=>{const {api,v}=await setup();await api.publishRuleset(v);const adapter=new MemoryRuntimeAdapter(),engine=new RuntimeEngine({configurator:api,adapter,hooks:null});const result=await engine.roll('17');assert.equal(result.total,17);});

test('Runtime resolves declarative Test Roll and Outcome with typed context variables',async()=>{
 const {api,v}=await setup();
 await api.createRoll(v,{id:'d20-fixed',nameKey:'D20',formula:'20',data:{},enabled:true,order:10,tags:[]});
 await api.createFormula(v,{id:'athletics-bonus',nameKey:'Bonus',resultType:'number',expression:{type:'reference',reference:{objectKind:'definition',objectId:'strength',capabilityId:'value',outputId:'value.final'}},enabled:true,order:10,tags:[]});
 await api.createCondition(v,{id:'natural-20',nameKey:'Critical',expression:{type:'eq',left:{type:'context',path:'variables.test.natural'},right:{type:'literal',value:20}},enabled:true,order:10,tags:[]});
 await api.createOutcome(v,{id:'critical',nameKey:'Critical',resultKey:'critical',conditionRef:'natural-20',priority:100,enabled:true,order:10,tags:[]});
 await api.createOutcome(v,{id:'fallback',nameKey:'Success',resultKey:'success',conditionRef:null,priority:0,enabled:true,order:20,tags:[]});
 await api.createTest(v,{id:'check',nameKey:'Check',rollRef:'d20-fixed',bonusFormulaRef:'athletics-bonus',targetFormulaRef:null,targetValue:13,outcomeRefs:['critical','fallback'],enabled:true,order:10,tags:[]});
 await api.publishRuleset(v);const adapter=new MemoryRuntimeAdapter(),engine=new RuntimeEngine({configurator:api,adapter,hooks:null}),actor={kind:'actor',id:'a'};
 await engine.instantiateDefinition(v,actor,'strength',{initial:{'value.base':3}});
 const result=await engine.executeTest(v,'check',{roles:{self:actor,target:actor}});
 assert.equal(result.total,23);assert.equal(result.margin,10);assert.equal(result.outcome.resultKey,'critical');assert.equal(result.context.variables.test.natural,20);
});

test('v0.6.0 FormulaBinding exposes live derived outputs and makes them read-only',async()=>{
 const {api,v}=await setup();await api.createFormulaBinding(v,{id:'vitality-max-binding',nameKey:'Vitality max binding',formulaRef:'max',targetRef:{objectKind:'definition',objectId:'vitality',capabilityId:'pool',slotId:'hp',outputId:'pool.maximum'},targetRole:'self',enabled:true,order:10,tags:[]});
 await api.publishRuleset(v);const adapter=new MemoryRuntimeAdapter(),engine=new RuntimeEngine({configurator:api,adapter,hooks:null}),actor={kind:'actor',id:'a'};
 await engine.instantiateDefinition(v,actor,'strength',{initial:{'value.base':3}});await engine.instantiateDefinition(v,actor,'vitality',{initial:{'pool.hp.current':8}});
 const ref={objectKind:'definition',objectId:'vitality',capabilityId:'pool',slotId:'hp',outputId:'pool.maximum'};
 assert.equal(await engine.resolveReference(v,ref,{roles:{self:actor}}),10);
 await assert.rejects(()=>engine.resolveReference(v,ref,{roles:{self:actor}},{forWrite:true}),/derived and read-only/);
});

test('v0.6.0 Action can run a Test, map its Outcome, commit Effects and emit a Triggered Event',async()=>{
 const {api,v}=await setup();await api.createRoll(v,{id:'fixed',nameKey:'Fixed',formula:'20',data:{},enabled:true,order:10,tags:[]});
 await api.createCondition(v,{id:'nat20',nameKey:'Nat20',expression:{type:'eq',left:{type:'context',path:'variables.test.natural'},right:{type:'literal',value:20}},enabled:true,order:10,tags:[]});
 await api.createOutcome(v,{id:'crit',nameKey:'Critical',resultKey:'critical',conditionRef:'nat20',priority:100,enabled:true,order:10,tags:[]});
 await api.createTest(v,{id:'attack',nameKey:'Attack',rollRef:'fixed',bonusFormulaRef:null,targetFormulaRef:null,targetValue:13,outcomeRefs:['crit'],enabled:true,order:10,tags:[]});
 await api.createEventType(v,{id:'resolved',nameKey:'Resolved',descriptionKey:'',payloadFields:{},roles:[],enabled:true,order:10});
 await api.createTrigger(v,{id:'after-resolved',nameKey:'After resolved',descriptionKey:'',eventTypeId:'resolved',eventFilter:null,conditionRefs:[],actionRefs:[],enabled:true,order:10,tags:[]});
 await api.createAction(v,{id:'tested-hit',nameKey:'Tested hit',conditionRefs:[],costEffectRefs:[],effectRefs:[],testRef:'attack',outcomeMappings:[{outcomeId:'crit',effectRefs:['damage']}],eventTypeRefs:['resolved'],enabled:true,order:10,tags:[]});
 await api.publishRuleset(v);const adapter=new MemoryRuntimeAdapter(),engine=new RuntimeEngine({configurator:api,adapter,hooks:null}),actor={kind:'actor',id:'a'};await engine.instantiateDefinition(v,actor,'vitality',{initial:{'pool.hp.current':8}});
 const result=await engine.executeAction(v,'tested-hit',{roles:{self:actor,target:actor}});assert.equal(result.testResult.outcome.resultKey,'critical');assert.equal(result.changes[0].after,6);assert.equal(result.events[0].triggered.length,1);
});

test('v0.6.1 Test result stays plain even when adapter roll contains a Foundry-like class instance',async()=>{
 const {api,v}=await setup();
 await api.createRoll(v,{id:'d20-object',nameKey:'D20',formula:'1d20',data:{},enabled:true,order:10,tags:[]});
 await api.createCondition(v,{id:'natural-20-object',nameKey:'Critical',expression:{type:'eq',left:{type:'context',path:'variables.test.natural'},right:{type:'literal',value:20}},enabled:true,order:10,tags:[]});
 await api.createOutcome(v,{id:'critical-object',nameKey:'Critical',resultKey:'critical',conditionRef:'natural-20-object',priority:100,enabled:true,order:10,tags:[]});
 await api.createTest(v,{id:'plain-check',nameKey:'Plain Check',rollRef:'d20-object',bonusFormulaRef:null,targetFormulaRef:null,targetValue:13,outcomeRefs:['critical-object'],enabled:true,order:10,tags:[]});
 class RollLike{constructor(){this.secret=Symbol('not-json')}}
 const adapter=new MemoryRuntimeAdapter();adapter.roll=async()=>({formula:'1d20',result:'20',total:20,natural:20,roll:new RollLike()});
 await api.publishRuleset(v);const calls=[],engine=new RuntimeEngine({configurator:api,adapter,hooks:{callAll:(...args)=>calls.push(args)}});
 const result=await engine.executeTest(v,'plain-check',{roles:{self:{kind:'actor',id:'a'}}});
 assert.equal(result.outcome.resultKey,'critical');
 assert.equal(result.roll.total,20);
 assert.equal('roll' in result.roll,false);
 assert.doesNotThrow(()=>structuredClone(result));
 assert.equal(calls[0][0],'ruleThemAllTestResolved');
});

// v0.6.2 regression: context-dependent conditions must not crash when the Lab
// evaluates them outside a Test context. Missing context values resolve as
// undefined and comparisons simply evaluate to false.
test("context AST tolerates missing runtime variables", async () => {
  const evaluator = new RuntimeEvaluator({ruleset:{conditions:[{id:"natural20",enabled:true,expression:{type:"eq",left:{type:"context",path:"variables.test.natural"},right:{type:"literal",value:20}}}]},resolveReference:async()=>0});
  assert.equal(await evaluator.condition("natural20",{}), false);
});

test('Runtime reads only the published snapshot; the draft source is an explicit sandbox',async()=>{
 const {api,v}=await setup();const adapter=new MemoryRuntimeAdapter(),actor={kind:'actor',id:'a'};
 const engine=new RuntimeEngine({configurator:api,adapter,hooks:null});
 await assert.rejects(()=>engine.instantiateDefinition(v,actor,'strength'),/not published/);
 const lab=new RuntimeEngine({configurator:api,adapter,hooks:null,rulesetSource:'draft'});
 await lab.instantiateDefinition(v,actor,'strength');
 await api.publishRuleset(v);
 await api.createParameter(v,{id:'draft-only',nameKey:'Draft only',valueType:'integer',value:1,scope:'ruleset',enabled:true,order:30,tags:[]});
 assert.equal(engine.ruleset(v).parameters.some(p=>p.id==='draft-only'),false,'unpublished edits never reach gameplay');
 assert.equal(lab.ruleset(v).parameters.some(p=>p.id==='draft-only'),true);
 assert.throws(()=>new RuntimeEngine({configurator:api,adapter,rulesetSource:'latest'}).ruleset(v),/Unknown runtime Ruleset source/);
});

test('lookup and rangeLookup nodes validate and evaluate',async()=>{
 const {prepareFormula}=await import('../src/configurator/rule-contracts.mjs');
 const evaluator=new RuntimeEvaluator({ruleset:{parameters:[{id:'size',value:'large'},{id:'score',value:14}]},resolveReference:async()=>0});
 const lookup={type:'lookup',key:{type:'parameter',id:'size'},table:[{key:'small',value:-1},{key:'large',value:2}],default:{type:'literal',value:0}};
 const range={type:'rangeLookup',value:{type:'parameter',id:'score'},ranges:[{max:9,value:-1},{min:10,max:15,value:1},{min:16,value:3}]};
 assert.equal(prepareFormula({id:'f',nameKey:'F',expression:lookup}).id,'f');
 assert.equal(await evaluator.evaluate(lookup),2);
 assert.equal(await evaluator.evaluate(range),1);
 assert.equal(await evaluator.evaluate({...lookup,key:{type:'literal',value:'tiny'}}),0);
 await assert.rejects(()=>evaluator.evaluate({...range,value:{type:'literal',value:-5},ranges:[{min:0,value:1}]}),/no range/);
 assert.throws(()=>prepareFormula({id:'f',nameKey:'F',expression:{type:'lookup',key:{type:'literal',value:1},table:[]}}),/non-empty/);
 assert.throws(()=>prepareFormula({id:'f',nameKey:'F',expression:{type:'rangeLookup',value:{type:'literal',value:1},ranges:[{min:5,max:1,value:0}]}}),/min greater than max/);
});

test('Outcomes resolve by descending priority, then the explicit fallback, else fail',async()=>{
 const {api,v}=await setup();
 await api.createRoll(v,{id:'fixed',nameKey:'Fixed',formula:'20',data:{},enabled:true,order:10,tags:[]});
 await api.createCondition(v,{id:'yes',nameKey:'Yes',expression:{type:'literal',value:true},enabled:true,order:10,tags:[]});
 await api.createCondition(v,{id:'no',nameKey:'No',expression:{type:'literal',value:false},enabled:true,order:20,tags:[]});
 await api.createOutcome(v,{id:'plain',nameKey:'Plain',resultKey:'plain',conditionRef:'yes',priority:0,enabled:true,order:10,tags:[]});
 await api.createOutcome(v,{id:'great',nameKey:'Great',resultKey:'great',conditionRef:'yes',priority:10,enabled:true,order:20,tags:[]});
 await api.createOutcome(v,{id:'never',nameKey:'Never',resultKey:'never',conditionRef:'no',priority:50,enabled:true,order:30,tags:[]});
 await api.createTest(v,{id:'ordered',nameKey:'Ordered',rollRef:'fixed',outcomeRefs:['plain','great','never'],enabled:true,order:10,tags:[]});
 await api.createTest(v,{id:'fallback',nameKey:'Fallback',rollRef:'fixed',outcomeRefs:['never'],fallbackOutcomeRef:'plain',enabled:true,order:20,tags:[]});
 await api.createTest(v,{id:'strict',nameKey:'Strict',rollRef:'fixed',outcomeRefs:['never'],enabled:true,order:30,tags:[]});
 await api.publishRuleset(v);
 const engine=new RuntimeEngine({configurator:api,adapter:new MemoryRuntimeAdapter(),hooks:null});
 assert.equal((await engine.executeTest(v,'ordered',{})).outcome.id,'great','priority 10 beats an earlier priority 0');
 assert.equal((await engine.executeTest(v,'fallback',{})).outcome.id,'plain');
 await assert.rejects(()=>engine.executeTest(v,'strict',{}),/no fallback Outcome/);
 await assert.rejects(()=>api.deleteOutcome(v,'plain'),/referenced/,'a fallback Outcome is a protected dependency');
});
