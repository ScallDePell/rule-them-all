import test from 'node:test';
import assert from 'node:assert/strict';
import {createConfiguratorAPI} from '../src/configurator/configurator-api.mjs';
import {emptyStorageSnapshot} from '../src/configurator/configurator-storage.mjs';
import {prepareValueSource, preparePoolSlot, prepareCollectionSlot} from '../src/configurator/capability-slots.mjs';
import {MemoryRuntimeAdapter} from '../src/runtime/memory-runtime-adapter.mjs';
import {RuntimeEngine} from '../src/runtime/runtime-engine.mjs';
class Storage{constructor(){this.value=emptyStorageSnapshot();}async load(){return structuredClone(this.value)}async save(v){this.value=structuredClone(v)}}
const ref=(objectId,capabilityId,outputId,slotId)=>({objectKind:'definition',objectId,capabilityId,...(slotId?{slotId}:{}),outputId});

async function setup(){
  const api=await createConfiguratorAPI(new Storage());
  const v=(await api.createRuleset({id:'slots',nameKey:'Slots',version:'1'})).versionId;
  await api.registerDefinitionType(v,{id:'trait',key:'trait',nameKey:'Trait',descriptionKey:'',color:null,order:10,allowedCapabilities:['value'],defaultCapabilities:['value'],requiredCapabilities:[],fields:{},constraints:[]});
  await api.registerDefinitionType(v,{id:'body',key:'body',nameKey:'Body',descriptionKey:'',color:null,order:20,allowedCapabilities:['pool','collection'],defaultCapabilities:['pool'],requiredCapabilities:[],fields:{},constraints:[]});
  await api.createContentType(v,{id:'gear',nameKey:'Gear',storageKind:'item',documentSubtype:'gear',runtimeMode:'stackable'});
  await api.createDefinition(v,{id:'might',key:'might',definitionTypeId:'trait',nameKey:'Might',descriptionKey:'',data:{},capabilities:['value'],enabled:true,order:10,tags:[]});
  await api.createFormula(v,{id:'twice-might',nameKey:'Twice might',resultType:'number',expression:{type:'multiply',args:[{type:'literal',value:2},{type:'reference',reference:ref('might','value','value.final')}]}});
  return {api,v};
}

test('ValueSource holds exactly one of a literal or a Formula',()=>{
  assert.deepEqual(prepareValueSource({literal:3},'max'),{literal:3});
  assert.deepEqual(prepareValueSource({formulaRef:'f'},'max'),{formulaRef:'f'});
  assert.throws(()=>prepareValueSource({literal:3,formulaRef:'f'},'max'),/cannot combine/);
  assert.throws(()=>prepareValueSource({},'max'),error=>error.code==='INCOMPLETE');
  assert.throws(()=>preparePoolSlot({id:'hp',minimum:{literal:5},maximum:{literal:1}}),/greater than its maximum/);
  assert.throws(()=>preparePoolSlot({id:'hp',minimum:{literal:0},maximum:{literal:9},overflowPolicy:'wrap'}),/clamp, reject or allow/);
  assert.throws(()=>preparePoolSlot({id:'2bad',minimum:{literal:0},maximum:{literal:1}}),/start with a letter/);
  assert.throws(()=>prepareCollectionSlot({id:'bag',entryMode:'copy',allowedKinds:['gear']}),/owned, reference or value/);
  assert.throws(()=>prepareCollectionSlot({id:'notes',entryMode:'value',allowedKinds:['nonsense']}),/unknown value type/);
});

test('Pool and Collection slots are local to a Definition and validated with it',async()=>{
  const {api,v}=await setup();
  await assert.rejects(()=>api.createDefinition(v,{id:'x',key:'x',definitionTypeId:'trait',nameKey:'X',descriptionKey:'',data:{},capabilities:['value'],slots:{pool:[{id:'hp',maximum:{literal:3}}]},enabled:true,order:0,tags:[]}),/requires the pool capability/);
  await assert.rejects(()=>api.createDefinition(v,{id:'x',key:'x',definitionTypeId:'body',nameKey:'X',descriptionKey:'',data:{},capabilities:['pool'],slots:{pool:[{id:'hp',maximum:{literal:3}},{id:'hp',maximum:{literal:4}}]},enabled:true,order:0,tags:[]}),/Duplicate pool slot id: hp/);
  // A draft may leave a bound empty; publish needs every bound.
  await api.createDefinition(v,{id:'hero',key:'hero',definitionTypeId:'body',nameKey:'Hero',descriptionKey:'',data:{},capabilities:['pool','collection'],slots:{pool:[{id:'hp',minimum:{literal:0}}],collection:[{id:'bag',entryMode:'owned',allowedKinds:['gear'],capacityFormulaRef:'twice-might'}]},enabled:true,order:0,tags:[]});
  assert.match(api.diagnoseRuleset(v).errors.map(entry=>entry.message).join(),/maximum requires a literal or a Formula/);
  await api.updateDefinition(v,'hero',{slots:{pool:[{id:'hp',minimum:{literal:0},maximum:{formulaRef:'twice-might'}}],collection:[{id:'bag',entryMode:'owned',allowedKinds:['gear'],capacityFormulaRef:'twice-might'}]}});
  assert.equal(api.diagnoseRuleset(v).valid,true);
  // Bound Formulas and allowed ContentTypes are protected dependencies.
  await assert.rejects(()=>api.deleteFormula(v,'twice-might'),error=>error.code==='REFERENTIAL_INTEGRITY');
  await assert.rejects(()=>api.deleteContentType(v,'gear'),error=>error.code==='REFERENTIAL_INTEGRITY');
});

test('References into a slotted capability must name an existing slot',async()=>{
  const {api,v}=await setup();
  await api.createDefinition(v,{id:'hero',key:'hero',definitionTypeId:'body',nameKey:'Hero',descriptionKey:'',data:{},capabilities:['pool'],slots:{pool:[{id:'hp',minimum:{literal:0},maximum:{literal:10}}]},enabled:true,order:0,tags:[]});
  await api.createEffect(v,{id:'hurt',nameKey:'Hurt',targetRef:ref('hero','pool','pool.current'),operation:'subtract',operand:{kind:'literal',value:1},enabled:true,order:0,tags:[]});
  assert.match(api.diagnoseRuleset(v).errors.map(entry=>entry.message).join(),/requires a slot/);
  await assert.rejects(()=>api.updateEffect(v,'hurt',{targetRef:ref('hero','pool','pool.current','mana')}),/Slot does not exist: hero\/pool\/mana/);
  await api.updateEffect(v,'hurt',{targetRef:ref('hero','pool','pool.current','hp')});
  assert.equal(api.diagnoseRuleset(v).valid,true);
  // Removing a slot that is still referenced is refused.
  await assert.rejects(()=>api.updateDefinition(v,'hero',{slots:{pool:[]}}),/Slot does not exist/);
});

async function runtime(slot){
  const {api,v}=await setup();
  await api.createDefinition(v,{id:'hero',key:'hero',definitionTypeId:'body',nameKey:'Hero',descriptionKey:'',data:{},capabilities:['pool'],slots:{pool:[{id:'hp',minimum:{literal:0},maximum:{formulaRef:'twice-might'},...slot}]},enabled:true,order:0,tags:[]});
  for(const [id,operation,value] of [['hurt','subtract',5],['heal','add',5]])await api.createEffect(v,{id,nameKey:id,targetRef:ref('hero','pool','pool.current','hp'),operation,operand:{kind:'literal',value},enabled:true,order:0,tags:[]});
  for(const id of ['hurt','heal'])await api.createAction(v,{id:`do-${id}`,nameKey:id,conditionRefs:[],costEffectRefs:[],effectRefs:[id],enabled:true,order:0,tags:[]});
  await api.publishRuleset(v);
  const engine=new RuntimeEngine({configurator:api,adapter:new MemoryRuntimeAdapter(),hooks:null}),actor={kind:'actor',id:'a'};
  await engine.initializeContainer(v,actor,{initialByDefinition:{might:{'value.base':4}}});
  const context={roles:{self:actor,target:actor}};
  const current=async()=>engine.resolveReference(v,ref('hero','pool','pool.current','hp'),context);
  return {engine,v,actor,context,current};
}

test('Pool bounds are recomputed from their ValueSource and the policies apply on write',async()=>{
  const {engine,v,actor,context,current}=await runtime({});
  assert.equal(await current(),8,'starts at its maximum (2 x might)');
  assert.equal(await engine.resolveReference(v,ref('hero','pool','pool.maximum','hp'),context),8);
  assert.equal(await engine.resolveReference(v,ref('hero','pool','pool.minimum','hp'),context),0);
  await engine.executeAction(v,'do-heal',context);
  assert.equal(await current(),8,'clamped at the maximum');
  await engine.executeAction(v,'do-hurt',context);await engine.executeAction(v,'do-hurt',context);
  assert.equal(await current(),0,'clamped at the minimum');
  const state=await engine.getContainerState(actor);
  assert.deepEqual(state.definitionStates.hero.capabilityStates.pool,{hp:{current:0}},'only current is stored');
  await assert.rejects(()=>engine.resolveReference(v,ref('hero','pool','pool.current'),context),/requires slotId/);
});

test('reject and allow policies refuse or keep out-of-range pool values',async()=>{
  const strict=await runtime({underflowPolicy:'reject',overflowPolicy:'reject',initial:{literal:4}});
  assert.equal(await strict.current(),4);
  await assert.rejects(()=>strict.engine.executeAction(strict.v,'do-hurt',strict.context),error=>error.code==='POOL_UNDERFLOW');
  await assert.rejects(()=>strict.engine.executeAction(strict.v,'do-heal',strict.context),error=>error.code==='POOL_OVERFLOW');
  assert.equal(await strict.current(),4,'a rejected Action changes nothing');
  const loose=await runtime({underflowPolicy:'allow',overflowPolicy:'allow'});
  await loose.engine.executeAction(loose.v,'do-heal',loose.context);
  assert.equal(await loose.current(),13);
  await loose.engine.setDefinitionState(loose.v,loose.actor,'hero',{pools:{hp:-4}});
  assert.equal(await loose.current(),-4);
});

test('Collections hold owned, reference or value entries without cloning on transfer',async()=>{
  const {api,v}=await setup();
  const slots={collection:[
    {id:'bag',entryMode:'owned',allowedKinds:['gear'],capacityFormulaRef:'twice-might',unique:true},
    {id:'chest',entryMode:'owned',allowedKinds:['gear'],maximumEntries:1},
    {id:'known',entryMode:'reference',allowedKinds:['gear'],minimumEntries:1},
    {id:'notes',entryMode:'value',allowedKinds:['string']}
  ]};
  await api.createDefinition(v,{id:'pack',key:'pack',definitionTypeId:'body',nameKey:'Pack',descriptionKey:'',data:{},capabilities:['collection'],slots,enabled:true,order:0,tags:[]});
  await api.createFormula(v,{id:'count-bag',nameKey:'Bag count',resultType:'number',expression:{type:'reference',reference:ref('pack','collection','collection.count','bag')}});
  await api.publishRuleset(v);
  const engine=new RuntimeEngine({configurator:api,adapter:new MemoryRuntimeAdapter(),hooks:null}),a={kind:'actor',id:'a'},b={kind:'actor',id:'b'};
  for(const actor of [a,b])await engine.initializeContainer(v,actor,{initialByDefinition:{might:{'value.base':1},pack:{'collection.known.entries':[{id:'k0',kind:'gear',entityRef:{uuid:'Item.lore'}}]}}});
  const rope=await engine.addCollectionEntry(v,a,'pack','bag',{id:'rope',kind:'gear',entityRef:{uuid:'Item.rope'}});
  await engine.addCollectionEntry(v,a,'pack','bag',{id:'arrows',kind:'gear',templateRef:'arrow',quantity:20});
  await assert.rejects(()=>engine.addCollectionEntry(v,a,'pack','bag',{kind:'gear',entityRef:{uuid:'Item.torch'}}),error=>error.code==='COLLECTION_FULL','capacity is 2 x might = 2');
  await assert.rejects(()=>engine.addCollectionEntry(v,b,'pack','bag',{kind:'weapon',entityRef:{uuid:'Item.x'}}),/does not accept kind weapon/);
  await engine.addCollectionEntry(v,b,'pack','bag',{kind:'gear',entityRef:{uuid:'Item.rope'}});
  await assert.rejects(()=>engine.addCollectionEntry(v,b,'pack','bag',{kind:'gear',entityRef:{uuid:'Item.rope'}}),/unique/);
  await assert.rejects(()=>engine.addCollectionEntry(v,a,'pack','notes',{kind:'string',value:12}),/value is invalid/);
  await engine.addCollectionEntry(v,a,'pack','notes',{kind:'string',value:'Owes the innkeeper'});
  assert.equal(await engine.evaluateFormula(v,'count-bag',{roles:{self:a}}),2);
  // Transfer moves the same entry to the other owner; it is not cloned.
  const moved=await engine.transferCollectionEntry(v,{from:{containerRef:a,definitionId:'pack',slotId:'bag'},to:{containerRef:b,definitionId:'pack',slotId:'chest'},entryId:'rope'});
  assert.deepEqual(moved,rope);
  assert.deepEqual((await engine.getContainerState(a)).definitionStates.pack.capabilityStates.collection.bag.entries.map(entry=>entry.id),['arrows']);
  assert.deepEqual((await engine.getContainerState(b)).definitionStates.pack.capabilityStates.collection.chest.entries.map(entry=>entry.id),['rope']);
  await assert.rejects(()=>engine.transferCollectionEntry(v,{from:{containerRef:a,definitionId:'pack',slotId:'known'},to:{containerRef:b,definitionId:'pack',slotId:'chest'},entryId:'k0'}),/Only owned/);
  await assert.rejects(()=>engine.removeCollectionEntry(v,a,'pack','known','k0'),error=>error.code==='COLLECTION_MINIMUM');
  const removed=await engine.removeCollectionEntry(v,a,'pack','notes',(await engine.getContainerState(a)).definitionStates.pack.capabilityStates.collection.notes.entries[0].id);
  assert.equal(removed.value,'Owes the innkeeper');
});

test('Slot editor round-trips pool and collection slots through the form',async()=>{
  const {buildSlotFormContext,collectDefinitionSlots}=await import('../src/configurator/slot-form.mjs');
  const definition={slots:{pool:[{id:'hp',minimum:{literal:0},maximum:{formulaRef:'f'},overflowPolicy:'reject',order:5}],collection:[{id:'bag',entryMode:'owned',allowedKinds:['gear'],maximumEntries:3}]}};
  const context=buildSlotFormContext({definition,permittedCapabilities:['pool'],formulas:[{id:'f',nameKey:'F'}],contentTypes:[{id:'gear',nameKey:'Gear'}],valueTypes:[{id:'string'}]});
  assert.equal(context.showPools,true);assert.equal(context.showCollections,false);
  assert.equal(context.poolRows[0].maximum.isFormula,true);
  assert.equal(context.poolRows[0].maximum.formulas[0].selected,true);
  assert.equal(context.blankPool.initial.kinds[0].id,'none');
  const field=(value,checked=false)=>({value,checked});
  const source=(kind,literal='',formula='')=>({querySelector:sel=>sel==='[data-source-kind]'?field(kind):sel==='[data-source-literal]'?field(literal):sel==='[data-source-formula]'?field(formula):null});
  const pool={dataset:{slotOriginal:'hp'},querySelector(sel){
    const prop=sel.match(/data-slot-prop="([^"]+)"/)?.[1];if(prop)return field({id:'hp',valueType:'integer',underflowPolicy:'allow',overflowPolicy:'clamp'}[prop]);
    const bound=sel.match(/data-slot-source="([^"]+)"/)?.[1];return {minimum:source('literal','1'),maximum:source('formula','','f'),initial:source('none')}[bound];
  }};
  const bag={dataset:{slotOriginal:'bag'},querySelector(sel){const prop=sel.match(/data-slot-prop="([^"]+)"/)?.[1];return field({id:'sack',entryMode:'value',minimumEntries:'',maximumEntries:'2',capacityFormulaRef:'',unique:''}[prop]??'',prop==='unique');},
    querySelectorAll:sel=>sel.includes('slotValueKind')?[field('string',true)]:[]};
  const slots=collectDefinitionSlots(sel=>sel.includes('pool')?[pool]:[bag],definition);
  assert.deepEqual(slots.pool,[{id:'hp',minimum:{literal:1},maximum:{formulaRef:'f'},overflowPolicy:'clamp',order:5,valueType:'integer',underflowPolicy:'allow'}]);
  assert.deepEqual(slots.collection,[{id:'sack',entryMode:'value',allowedKinds:['string'],unique:true,maximumEntries:2}]);
});
