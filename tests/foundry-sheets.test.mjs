import test from 'node:test';
import assert from 'node:assert/strict';
import {createConfiguratorAPI} from '../src/configurator/configurator-api.mjs';
import {emptyStorageSnapshot} from '../src/configurator/configurator-storage.mjs';
import {MemoryRuntimeAdapter} from '../src/runtime/memory-runtime-adapter.mjs';
import {createRuntimeAPI} from '../src/runtime/runtime-api.mjs';
import {RELAYED_METHODS} from '../src/runtime/runtime-relay.mjs';
import {actionSummary, chosenSheet, createRulesetSheets, registerRulesetSheets} from '../src/runtime/foundry-sheets.mjs';
import {renderSheetHTML, formatSheetValue} from '../src/ui/sheet-markup.mjs';

class Storage{value=emptyStorageSnapshot();async load(){return structuredClone(this.value)}async save(v){this.value=structuredClone(v)}}
class Base{constructor(document){this.document=document;this.isEditable=true;this.renders=0;}async _prepareContext(){return {};}render(){this.renders++;}}

async function world(){
  const api=await createConfiguratorAPI(new Storage());
  const v=(await api.createRuleset({id:'g',nameKey:'Game',version:'1'})).versionId;
  await api.registerDefinitionType(v,{id:'attribute',key:'attribute',nameKey:'Attributes',allowedCapabilities:['value'],defaultCapabilities:['value'],requiredCapabilities:[],fields:{}});
  await api.createDefinition(v,{id:'str',key:'str',definitionTypeId:'attribute',nameKey:'Strength',data:{},capabilities:['value']});
  await api.createAction(v,{id:'rest',nameKey:'Rest',effectRefs:[]});
  await api.publishRuleset(v);api.setActiveVersionId?.(v);
  const adapter=new MemoryRuntimeAdapter(),runtime=createRuntimeAPI(api,{adapter,hooks:null});
  globalThis.game={ruleThemAll:{configurator:api,runtime,configuratorReady:Promise.resolve(api)},i18n:{lang:'en',localize:k=>k},user:{id:'gm',isGM:true}};
  return {api,v,runtime,adapter};
}

test('the Actor sheet offers to use the Ruleset, then shows and writes its AUTO layout', async()=>{
  const {v,runtime}=await world();
  const {RulesetActorSheet}=createRulesetSheets({ActorSheetV2:Base,ItemSheetV2:Base});
  const sheet=new RulesetActorSheet({uuid:'Actor.hero',name:'Hero',img:'',documentName:'Actor'});
  await sheet._prepareContext({});
  let html=await sheet._renderHTML();
  assert.match(html,/data-sheet-command="initialize"/);
  await runtime.initializeContainer(v,'Actor.hero');
  await sheet._prepareContext({});
  html=await sheet._renderHTML();
  assert.match(html,/data-sheet-write="each-attribute-value" data-definition-id="str" data-operation="set"/);
  assert.match(html,/data-sheet-action="rest"/);
  assert.match(html,/<input class="rta-sheet__name" type="text" data-sheet-name value="Hero"/);
  await runtime.writeSheetValue(v,'Actor.hero',{sheetId:'auto',nodeId:'each-attribute-value',definitionId:'str',value:15});
  await sheet._prepareContext({});
  assert.match(await sheet._renderHTML(),/data-definition-id="str" data-operation="set" value="15"/);
  delete globalThis.game;
});

test('sheets are offered for every Actor and Item type, never as the default; sheet writes reach the GM relay', ()=>{
  const calls=[];
  registerRulesetSheets({applications:{sheets:{ActorSheetV2:Base,ItemSheetV2:Base},apps:{DocumentSheetConfig:{registerSheet:(doc,scope,cls,options)=>calls.push([doc,scope,options])}}}},{Actor:'Actor',Item:'Item'});
  assert.deepEqual(calls.map(([doc,scope,options])=>[doc,scope,options.makeDefault,options.types]),[['Actor','rule-them-all',false,undefined],['Item','rule-them-all',false,undefined]]);
  assert.ok(RELAYED_METHODS.includes('writeSheetValue'));
});

test('the active Ruleset’s sheets are offered by name in the sheet choice, and withdrawn when they go', ()=>{
  const calls=[],removed=[];
  const sheets=registerRulesetSheets({applications:{sheets:{ActorSheetV2:Base,ItemSheetV2:Base},apps:{DocumentSheetConfig:{registerSheet:(doc,scope,cls,options)=>calls.push([doc,cls,options.label]),unregisterSheet:(doc,scope,cls)=>removed.push(cls.name)}}}},{Actor:'Actor',Item:'Item'});
  const ruleset={sheetDefinitions:[{id:'pc',nameKey:'Fiche PJ',target:'actor'},{id:'pc-2',nameKey:'Fiche PJ compacte',target:'actor'},{id:'npc',nameKey:'Fiche PNJ',target:'actor',enabled:false},{id:'weapon',nameKey:'Arme',target:'item',contentTypeIds:['arme']}]};
  assert.deepEqual(sheets.registerNamed(ruleset,key=>key.toUpperCase()),['RTASheet_pc','RTASheet_pc-2','RTASheet_weapon']);
  assert.deepEqual(calls.slice(2).map(([doc,cls,label])=>[doc,cls.rtaSheetId,label]),[['Actor','pc','FICHE PJ'],['Actor','pc-2','FICHE PJ COMPACTE'],['Item','weapon','ARME']]);
  assert.ok(calls[2][1].prototype instanceof sheets.RulesetActorSheet);
  sheets.registerNamed({sheetDefinitions:[ruleset.sheetDefinitions[0]]});
  assert.deepEqual(removed,['RTASheet_pc-2','RTASheet_weapon']);
  // The chosen sheet is shown while the Ruleset has it for this target; otherwise the first that fits.
  assert.equal(chosenSheet(ruleset,'pc-2',{target:'actor'}).id,'pc-2');
  assert.equal(chosenSheet(ruleset,'gone',{target:'actor'}).id,'pc');
  assert.equal(chosenSheet(ruleset,'weapon',{target:'item',contentTypeId:'pouvoir'}).id,'auto');
});

test('markup: values, bounds, amounts, tabs and the Action chat summary', ()=>{
  const view={sheetId:'s',root:{id:'root',kind:'tabs',children:[{id:'a',kind:'tab',label:'A',children:[
    {id:'hp',kind:'value',label:'HP',value:8,maximum:12,valueType:'number',write:{operation:'subtract'}},
    {id:'luck',kind:'value',label:'Luck',value:2.345,valueType:'number',write:null},
    {id:'gone',kind:'value',label:'Gone',value:null,error:'not held',valueType:'number',write:null}]},{id:'b',kind:'tab',label:'B',children:[]}]}};
  const html=renderSheetHTML(view,{name:'Hero'});
  assert.match(html,/<span class="rta-sheet-value__text">8<\/span><span class="rta-sheet-value__bound">\/ 12<\/span><input type="number" class="rta-sheet-value__amount" data-sheet-write="hp"/);
  assert.match(html,/>2\.35</);assert.match(html,/title="not held"/);
  assert.match(html,/data-sheet-panel="b"[^>]*hidden/);
  assert.equal(formatSheetValue(null),'—');
  const ruleset={actions:[{id:'hit',nameKey:'Hit'}],definitions:[]};
  const summary=actionSummary({actionId:'hit',testResult:{roll:{formula:'1d20',result:'14'},total:14,target:12,outcome:{labelKey:'Success'}}},{t:k=>k,ruleset});
  assert.deepEqual(summary,{title:'Hit',lines:[{label:'1d20',value:'14 = 14'},{label:'RTA.Sheet.TestTarget',value:'12'}],outcome:'Success'});
});

test('a character not made yet is offered the active Ruleset creation, on the notice then in the header, until it holds Contents', async()=>{
  const {api,v,runtime}=await world();
  const draft=(await api.createRuleset({id:'c',nameKey:'C',version:'1'})).versionId;
  await api.registerDefinitionType(draft,{id:'attribute',key:'attribute',nameKey:'Attributes',allowedCapabilities:['value'],defaultCapabilities:['value'],requiredCapabilities:[],fields:{}});
  await api.createDefinition(draft,{id:'str',key:'str',definitionTypeId:'attribute',nameKey:'Strength',data:{},capabilities:['value']});
  await api.createCreationSystem(draft,{id:'make',nameKey:'Make',steps:[{id:'points',name:'Points',kind:'allocation',min:2,max:2,source:{collection:'definitions',objectIds:['str']}},{id:'done',name:'Done',kind:'review'}]});
  await api.publishRuleset(draft);await api.setActiveVersionId(draft);
  const {RulesetActorSheet}=createRulesetSheets({ActorSheetV2:Base,ItemSheetV2:Base});
  const flags={};
  const doc={uuid:'Actor.new',name:'New',img:'',documentName:'Actor',items:[],getFlag:(_s,key)=>flags[key]};
  const sheet=new RulesetActorSheet(doc);
  await sheet._prepareContext({});
  let html=await sheet._renderHTML();
  assert.match(html,/RTA.Sheet.NotCreated/);
  assert.match(html,/class="rta-sheet-notice__primary" data-sheet-command="create">RTA.Creation.CreateThis/);
  assert.match(html,/data-sheet-command="initialize">RTA.Sheet.InitializeEmpty/);
  await runtime.initializeContainer(draft,'Actor.new');
  await sheet._prepareContext({});
  html=await sheet._renderHTML();
  assert.match(html,/class="rta-sheet__command" data-sheet-command="create"/,'started without creation: still offered in the header');
  flags.contentAcquisitions={'item-1':{templateId:'x'}};
  await sheet._prepareContext({});
  assert.doesNotMatch(await sheet._renderHTML(),/data-sheet-command="create"/);
  delete flags.contentAcquisitions;flags.creationRun={creationSystemId:'make'};
  await sheet._prepareContext({});
  assert.doesNotMatch(await sheet._renderHTML(),/data-sheet-command="create"/);
  void v;delete globalThis.game;
});

test('an Item dropped on the Actor sheet: a Ruleset Content is acquired, any other Item is added; Foundry data becomes plain JSON', async()=>{
  const {v}=await world();
  const calls=[];
  globalThis.game.ruleThemAll.content={createOwnedContentItem:async(...args)=>calls.push(['acquire',...args])};
  // Foundry hands objects with accessors: they must not reach copyJSON as they are.
  const withGetter=data=>Object.defineProperty({...data},'computed',{get:()=>1,enumerable:false});
  const items={
    'Compendium.rta.sword':{uuid:'Compendium.rta.sword',parent:null,getFlag:(_s,key)=>key==='contentTemplate'?{managed:true,versionId:v,templateId:'sword'}:undefined,toObject:()=>withGetter({_id:'abc',name:'Sword',type:'item',system:withGetter({})})},
    'Item.rope':{uuid:'Item.rope',parent:null,getFlag:()=>undefined,toObject:()=>({_id:'rope',name:'Rope',type:'item'})}
  };
  globalThis.fromUuid=async uuid=>items[uuid];
  let dragged=null;
  globalThis.foundry={applications:{ux:{TextEditor:{implementation:{getDragEventData:()=>dragged}}}}};
  const {RulesetActorSheet}=createRulesetSheets({ActorSheetV2:Base,ItemSheetV2:Base});
  const doc={uuid:'Actor.hero',name:'Hero',documentName:'Actor',items:[],getFlag:()=>undefined,createEmbeddedDocuments:async(name,data)=>calls.push(['embed',name,data])};
  const sheet=new RulesetActorSheet(doc);
  Object.defineProperty(sheet,'element',{value:{querySelector:()=>null}});
  const event=()=>({preventDefault(){}});
  dragged={type:'Item',uuid:'Compendium.rta.sword'};
  const drop=event();
  await sheet._onDrop(drop);await sheet._onDrop(drop);
  dragged={type:'Item',uuid:'Item.rope'};await sheet._onDrop(event());
  dragged={type:'Actor',uuid:'Actor.other'};await sheet._onDrop(event());
  assert.equal(calls.length,2,'the same drop is handled once; an Actor dropped does nothing');
  assert.deepEqual(calls[0].slice(0,4),['acquire',v,'Actor.hero','sword']);
  assert.deepEqual(calls[0][4].sourceData,{_id:'abc',name:'Sword',type:'item',system:{}});
  assert.deepEqual(calls[1],['embed','Item',[{name:'Rope',type:'item'}]]);
  delete globalThis.game;delete globalThis.fromUuid;delete globalThis.foundry;
});

test('markup: the Contents an Actor holds, by type, with their remove buttons only when the sheet is editable', ()=>{
  const view={sheetId:'s',root:{id:'root',kind:'grid',children:[{id:'c',kind:'contents',rows:[
    {key:'i1',label:'Sword',img:'s.webp',item:true,available:true,type:'Weapon'},{key:'i2',label:'Navy',img:'',item:false,available:false,type:'Background'}]},{id:'e',kind:'contents',rows:[]}]}};
  const html=renderSheetHTML(view,{name:'Hero',editable:true});
  assert.match(html,/<p class="rta-sheet-contents__type">Weapon<\/p>/);
  assert.match(html,/data-sheet-item-open="i1">Sword<\/button><button type="button" class="rta-sheet-content__remove" data-sheet-item-remove="i1"/);
  assert.match(html,/rta-sheet-content--unavailable"><span class="rta-sheet-content__image"><i class="fa-solid fa-suitcase"><\/i><\/span><span class="rta-sheet-content__name">Navy<\/span><\/li>/);
  assert.match(html,/RTA.Sheet.DropContents/);
  assert.doesNotMatch(renderSheetHTML(view,{name:'Hero'}),/data-sheet-item-remove/);
});

test('an Actor of a deleted Ruleset version moves onto the active one: values kept, new grants of its Contents added, flags renamed', async()=>{
  const {FoundryContentBridge}=await import('../src/runtime/foundry-content-bridge.mjs');
  const {api,v,runtime,adapter}=await world();
  await runtime.initializeContainer(v,'Actor.old');await runtime.setDefinitionState(v,'Actor.old','str',{base:7});
  const next=(await api.createRuleset({id:'g2',nameKey:'Game',version:'2'})).versionId;
  await api.registerDefinitionType(next,{id:'attribute',key:'attribute',nameKey:'Attributes',allowedCapabilities:['value'],defaultCapabilities:['value'],requiredCapabilities:[],fields:{}});
  await api.registerDefinitionType(next,{id:'status',key:'status',nameKey:'Status',allowedCapabilities:['state'],defaultCapabilities:['state'],requiredCapabilities:[],fields:{}});
  await api.createDefinition(next,{id:'str',key:'str',definitionTypeId:'attribute',nameKey:'Strength',data:{},capabilities:['value']});
  await api.createDefinition(next,{id:'pc',key:'pc',definitionTypeId:'status',nameKey:'Player character',data:{},capabilities:['state']});
  await api.createContentType(next,{id:'base',nameKey:'Base',storageKind:'item',documentSubtype:'',runtimeMode:'unique',fields:{}});
  await api.createContentTemplate(next,{id:'socle',nameKey:'Socle',contentTypeId:'base',data:{},relations:[{id:'g-pc',operation:'grant',targetRef:{objectKind:'definition',objectId:'pc'},config:{initial:{'state.active':true}}}]});
  await api.publishRuleset(next);await api.setActiveVersionId(next);await api.deleteRulesetVersion(v);
  const flags={contentAcquisitions:{'item-1':{templateId:'socle',versionId:v,createdDefinitionIds:['str']}},creationRun:{versionId:v}};
  const itemFlags={contentTemplate:{versionId:v,templateId:'socle',managed:true}};
  const item={getFlag:(_s,k)=>itemFlags[k],setFlag:async(_s,k,x)=>{itemFlags[k]=x;}};
  const doc={uuid:'Actor.old',name:'Old',img:'',documentName:'Actor',items:[item],getFlag:(_s,k)=>flags[k],setFlag:async(_s,k,x)=>{flags[k]=x;}};
  adapter.resolveDocument=async()=>doc;
  globalThis.game.i18n.format=(k,d)=>`${k}:${Object.values(d).join('|')}`;
  const {RulesetActorSheet}=createRulesetSheets({ActorSheetV2:Base,ItemSheetV2:Base});
  const sheet=new RulesetActorSheet(doc);
  await sheet._prepareContext({});
  const html=await sheet._renderHTML();
  assert.match(html,/RTA.Sheet.VersionGone/);assert.match(html,/data-sheet-command="rebind">RTA.Sheet.Rebind:Game 2/);
  const result=await new FoundryContentBridge(api,runtime).rebindActor(next,'Actor.old');
  assert.deepEqual(result.granted,['pc']);
  const state=await runtime.getContainerState('Actor.old');
  assert.equal(state.rulesetVersionId,next);assert.equal(state.definitionStates.str.capabilityStates.value.base,7);assert.equal(state.definitionStates.pc.capabilityStates.state.active,true);
  assert.deepEqual([flags.contentAcquisitions['item-1'].versionId,flags.creationRun.versionId,itemFlags.contentTemplate.versionId],[next,next,next]);
  delete globalThis.game;
});
