import test from 'node:test';
import assert from 'node:assert/strict';
import {createConfiguratorAPI} from '../src/configurator/configurator-api.mjs';
import {emptyStorageSnapshot} from '../src/configurator/configurator-storage.mjs';
import {MemoryRuntimeAdapter} from '../src/runtime/memory-runtime-adapter.mjs';
import {createRuntimeAPI} from '../src/runtime/runtime-api.mjs';
import {FoundryContentBridge} from '../src/runtime/foundry-content-bridge.mjs';
import {createFieldServices} from '../src/integrations/field-services.mjs';
import {describeField, listBindableFields, listSheets} from '../src/integrations/sheet-fields.mjs';
import {createRulesetChangeWatcher} from '../src/integrations/ruleset-changes.mjs';
import {extensionCards, withExtensionItems} from '../src/integrations/configurator-sections.mjs';
import {createIntegrationRegistry} from '../src/integrations/integration-registry.mjs';
import {renderFieldActionButtons, renderSheetHTML} from '../src/ui/sheet-markup.mjs';

/* Companion modules (docs/architecture.md §6 "Integrations for companion modules"): sheet fields, sources read for the
   current user, targets checked when written, configurator sections, Ruleset changes and the places of field buttons. */
class Storage{data=emptyStorageSnapshot();async load(){return structuredClone(this.data)}async save(next){this.data=structuredClone(next)}}
class ActorMock{constructor(uuid){this.uuid=uuid;this.documentName='Actor';this.flags={};}getFlag(s,k){return this.flags[s]?.[k]}async setFlag(s,k,v){(this.flags[s]??={})[k]=structuredClone(v)}}
class Adapter extends MemoryRuntimeAdapter{constructor(actors){super();this.actors=actors;}async resolveDocument(uuid){const a=this.actors.get(uuid);if(!a)throw new Error('Actor not found');return a}}
const field=(id,valueType)=>({id,name:id,valueType,cardinality:'one',nullable:true,required:false,constraints:[]});
const vitality={objectKind:'definition',objectId:'vitality',capabilityId:'pool',slotId:'points',outputId:'pool.current'};

async function world(){
  const api=await createConfiguratorAPI(new Storage());
  const v=(await api.createRuleset({id:'r',nameKey:'R',version:'1.0.0'})).versionId;
  await api.registerDefinitionType(v,{id:'stat',key:'stat',nameKey:'Stat',allowedCapabilities:['value','pool'],defaultCapabilities:['value'],requiredCapabilities:[],fields:{}});
  await api.createScale(v,{id:'health',nameKey:'Health',basis:'percent',rows:[{id:'fine',labelKey:'Unhurt',min:100,max:null},{id:'hurt',labelKey:'Hurt',min:1,max:99.99},{id:'down',labelKey:'Down',min:null,max:0}]});
  await api.createDefinition(v,{id:'vitality',key:'vitality',nameKey:'Vitality',definitionTypeId:'stat',capabilities:['pool'],scaleRef:'health',slots:{pool:[{id:'points',minimum:{literal:0},maximum:{literal:20}}]},data:{}});
  await api.createParameter(v,{id:'base',nameKey:'Base',valueType:'number',value:7});
  await api.createContentType(v,{id:'gear',nameKey:'Gear',storageKind:'item',runtimeMode:'stackable',fields:{lore:field('lore','string'),weight:field('weight','integer')}});
  await api.createContentTemplate(v,{id:'sword',nameKey:'Sword',contentTypeId:'gear',image:'sword.webp',data:{lore:'Old',weight:2},relations:[],choiceGroups:[]});
  await api.createSheetDefinition(v,{id:'pc',nameKey:'PC',target:'actor',root:{id:'root',kind:'grid',columns:2,children:[
    {id:'pic',kind:'portrait'},{id:'tok',kind:'token',updatePlaced:true},{id:'nm',kind:'name'},
    {id:'bio',kind:'notes',format:'rich',write:{operation:'set'}},{id:'secret',kind:'notes',seenBy:['gm'],write:{operation:'set'}},{id:'gmnote',kind:'notes',write:{operation:'set',by:'gm'}},
    {id:'ro',kind:'notes'},{id:'banner',kind:'image',src:'banner.webp'},{id:'hp',kind:'value',source:{kind:'output',reference:vitality}}]}});
  await api.createSheetDefinition(v,{id:'item',nameKey:'Item',target:'item',header:'none',root:{id:'root',kind:'grid',columns:1,children:[
    {id:'lore',kind:'value',source:{kind:'field',fieldId:'lore'},write:{operation:'set'}},{id:'weight',kind:'value',source:{kind:'field',fieldId:'weight'},write:{operation:'set'}}]}});
  await api.publishRuleset(v);await api.setActiveVersionId(v);
  const actors=new Map(),adapter=new Adapter(actors),runtime=createRuntimeAPI(api,{adapter,hooks:null});
  adapter.users.set('pl',{role:'player',isGM:false});
  actors.set('Actor.hero',new ActorMock('Actor.hero'));
  await runtime.initializeContainer(v,'Actor.hero');
  await runtime.setDefinitionState(v,'Actor.hero','vitality',{capabilityStates:{pool:{points:{current:10}}}}).catch(()=>{});
  const docs=new Map([
    ['Actor.hero',{uuid:'Actor.hero',id:'hero',documentName:'Actor',name:'Hero',img:'hero.webp',token:'hero-token.webp',canView:true,canUpdate:true,sheetId:'pc',items:[],ownerUuid:null,flag:null}],
    ['Item.loose',{uuid:'Item.loose',id:'loose',documentName:'Item',name:'Sword',img:'sword.webp',token:'',canView:true,canUpdate:true,sheetId:'item',items:[],ownerUuid:null,flag:{versionId:v,templateId:'sword',contentTypeId:'gear'}}]]);
  const writes=[],who={id:'gm',isGM:true};
  const documents={get:async uuid=>docs.get(uuid)?{...docs.get(uuid)}:null,update:async(handle,data)=>{writes.push(['update',handle.uuid,data]);Object.assign(docs.get(handle.uuid),data);},
    setTokenImage:async(handle,path,options)=>{writes.push(['token',handle.uuid,path,options]);docs.get(handle.uuid).token=path;},sanitizeRichText:html=>html.replace(/<script[\s\S]*?<\/script>/g,'')};
  const services=createFieldServices({configurator:()=>api,runtime:()=>runtime,documents,user:()=>who,translate:(version,key)=>`t:${key}`});
  const as=user=>{adapter.currentUserId=user;who.id=user;who.isGM=user==='gm';};
  return {api,v,runtime,adapter,docs,services,writes,as,actors};
}

test('Sheet fields: what a sheet offers to read or fill, the AUTO sheet included, and a lost or changed block', async()=>{
  const {api,v}=await world();
  const ruleset=api.getRuleset(v);
  assert.deepEqual(listSheets(ruleset).map(s=>`${s.id}/${s.target}`),['pc/actor','item/item','auto/actor','auto/item']);
  const fields=listBindableFields(ruleset,{sheetId:'pc',target:'actor'});
  assert.deepEqual(fields.map(f=>f.ref.slot??f.ref.nodeId),['header.img','header.name','pic','tok','nm','bio','secret','gmnote','ro','banner']);
  const by=id=>fields.find(f=>(f.ref.slot??f.ref.nodeId)===id);
  assert.deepEqual([by('pic').storage,by('tok').storage,by('nm').storage,by('bio').valueKind,by('banner').scope],['documentImg','tokenImg','documentName','richText','definition']);
  assert.equal(by('ro').writable,false);assert.equal(by('gmnote').writeBy,'gm');assert.deepEqual(by('secret').seenBy,['gm']);
  assert.equal(by('tok').updatePlaced,true);
  // Numbers are not fields; on an Item sheet, a text field of the Content and its template's picture are.
  assert.ok(!fields.some(f=>f.ref.nodeId==='hp'));
  const item=listBindableFields(ruleset,{sheetId:'item',target:'item'});
  assert.deepEqual(item.map(f=>f.ref.slot??f.ref.nodeId),['template.image','lore']);
  assert.equal(listBindableFields(ruleset,{sheetId:'auto',target:'actor'}).filter(f=>f.ref.slot).length,2);
  // A block removed or turned into another kind is reported as such, never as another block.
  assert.deepEqual(describeField(ruleset,{sheetId:'pc',target:'actor',nodeId:'gone'}),{status:'missing',reason:'node'});
  assert.deepEqual(describeField(ruleset,{sheetId:'nope',target:'actor',nodeId:'bio'}),{status:'missing',reason:'sheet'});
  assert.deepEqual(describeField(ruleset,{sheetId:'pc',target:'actor',nodeId:'bio',nodeKind:'image'}),{status:'typeChanged',previous:'image',current:'notes'});
  assert.equal(describeField(ruleset,{sheetId:'pc',target:'actor',nodeId:'hp'}).status,'typeChanged');
});

test('Sources: read for the current user as the sheet shows it; a description gives words, never the number', async()=>{
  const {services,as}=await world();
  const ctx={documentUuid:'Actor.hero'};
  const narrative=await services.resolveSource(ctx,{kind:'output',reference:vitality,narrative:true});
  assert.equal(narrative.status,'ok');assert.equal(narrative.valueKind,'text');
  assert.ok(!/\d/.test(JSON.stringify(narrative.value)),`no number in ${JSON.stringify(narrative)}`);
  assert.equal((await services.resolveSource(ctx,{kind:'output',reference:vitality})).valueKind,'number');
  assert.deepEqual(await services.resolveSource(ctx,{kind:'parameter',parameterRef:'base'}),{status:'ok',valueKind:'number',value:7,label:'t:Base'});
  assert.equal((await services.resolveSource(ctx,{kind:'document',path:'img'})).value,'hero.webp');
  assert.equal((await services.resolveSource(ctx,{kind:'parameter',parameterRef:'gone'})).status,'missing');
  assert.equal((await services.resolveSource(ctx,{kind:'field',ref:{rulesetId:'other',sheetId:'pc',target:'actor',nodeId:'bio'}})).status,'rulesetMismatch');
  // A block only the GM gets is never read for a player, not even in part.
  as('pl');
  assert.equal((await services.resolveSource(ctx,{kind:'field',ref:{rulesetId:'r',sheetId:'pc',target:'actor',nodeId:'secret'}})).status,'forbidden');
  as('gm');
  assert.equal((await services.resolveSource(ctx,{kind:'field',ref:{rulesetId:'r',sheetId:'pc',target:'actor',nodeId:'secret'}})).status,'ok');
  const candidates=await services.listSourceCandidates('r',{sheetId:'pc',target:'actor'});
  assert.ok(candidates.some(c=>c.source.kind==='output'&&c.hasNarrative));
  assert.ok(candidates.some(c=>c.source.kind==='field'&&c.source.ref.nodeId==='bio'));
});

test('Targets: checked when served (sheet, seenBy, GM only, validated version, conflict) and written by their owner', async()=>{
  const {api,v,services,writes,as,adapter}=await world();
  const ctx={documentUuid:'Actor.hero'},at=(nodeId,extra={})=>({rulesetId:'r',sheetId:'pc',target:'actor',nodeId,...extra});
  assert.equal((await services.validateTarget(ctx,at('ro'))).code,'FORBIDDEN');
  assert.equal((await services.validateTarget(ctx,at('gone'))).code,'MISSING');
  assert.equal((await services.validateTarget(ctx,at('bio',{sheetId:'auto'}))).code,'NOT_ON_SHEET');
  assert.equal((await services.validateTarget(ctx,{...at('bio'),rulesetId:'x'})).code,'RULESET_MISMATCH');
  // A note goes through the runtime: in the ledger, its HTML cleaned.
  const ok=await services.updateTarget(ctx,at('bio'),'<p>Born <b>here</b></p><script>x()</script>',{expectedCurrent:''});
  assert.deepEqual(ok,{ok:true,previous:'',current:'<p>Born <b>here</b></p>'});
  assert.equal((await services.validateTarget(ctx,at('bio'))).current,'<p>Born <b>here</b></p>');
  assert.ok((await adapter.loadLedger('Actor.hero')).some(entry=>JSON.stringify(entry).includes('note')));
  assert.equal((await services.updateTarget(ctx,at('bio'),'again',{expectedCurrent:''})).code,'CONFLICT');
  assert.equal((await services.updateTarget(ctx,at('pic'),42)).code,'INVALID_VALUE');
  // The Document's name, image and token, as its sheet would.
  assert.equal((await services.updateTarget(ctx,{rulesetId:'r',sheetId:'pc',target:'actor',slot:'header.name'},'Heroine')).ok,true);
  await services.updateTarget(ctx,at('tok'),'new-token.webp');
  assert.deepEqual(writes,[['update','Actor.hero',{name:'Heroine'}],['token','Actor.hero','new-token.webp',{placed:true}]]);
  // A player: no block they do not get, no value only the GM changes, no picture of the Ruleset.
  adapter.ownership.set('Actor.hero|pl','owner');as('pl');
  assert.equal((await services.validateTarget(ctx,at('secret'))).code,'FORBIDDEN');
  assert.equal((await services.validateTarget(ctx,at('gmnote'))).code,'GM_ONLY');
  assert.equal((await services.validateTarget(ctx,at('banner'))).code,'GM_ONLY');
  assert.equal((await services.validateTarget(ctx,at('bio'))).allowed,true);
  // The GM changes a picture of the sheet in the draft; a validated version refuses it.
  as('gm');
  const banner=await services.updateTarget(ctx,at('banner'),'new-banner.webp');
  assert.deepEqual(banner,{ok:true,previous:'banner.webp',current:'new-banner.webp',draftOnly:true});
  const node=api.getRuleset(v).sheetDefinitions.find(s=>s.id==='pc').root.children.find(n=>n.id==='banner');
  assert.equal(node.src,'new-banner.webp');
  await api.publishRuleset(v);await api.validateRulesetVersion(v);
  assert.equal((await services.validateTarget(ctx,at('banner'))).code,'DEFINITION_VALIDATED');
});

test('Targets on an Item: a Content field only on an owned Item, the template picture by the GM', async()=>{
  const {api,v,runtime,services,docs,actors}=await world();
  const ctx={documentUuid:'Item.loose'},lore={rulesetId:'r',sheetId:'item',target:'item',nodeId:'lore'};
  assert.equal((await services.validateTarget(ctx,lore)).code,'NOT_OWNED_CONTENT');
  const image=await services.updateTarget(ctx,{rulesetId:'r',sheetId:'item',target:'item',slot:'template.image'},'blade.webp');
  assert.equal(image.ok,true);assert.equal(api.getRuleset(v).contentTemplates.find(t=>t.id==='sword').image,'blade.webp');
  const bridge=new FoundryContentBridge(api,runtime,{hooks:null});
  await bridge.acquireTemplate(v,'Actor.hero','sword',{sourceItemId:'owned'});
  docs.set('Item.owned',{...docs.get('Item.loose'),uuid:'Item.owned',id:'owned',ownerUuid:'Actor.hero'});
  const written=await services.updateTarget({documentUuid:'Item.owned'},lore,'Forged by giants',{expectedCurrent:'Old'});
  assert.deepEqual(written,{ok:true,previous:'Old',current:'Forged by giants'});
  assert.equal((await runtime.listOwnedContents(v,'Actor.hero')).find(row=>row.key==='owned').fields.lore,'Forged by giants');
  assert.ok(actors.size);
});

test('Ruleset changes: once per version and source, with the blocks and sheets removed', async()=>{
  const {api,v}=await world();
  const seen=[],watcher=createRulesetChangeWatcher(api,change=>seen.push(change));
  assert.deepEqual(watcher.scan(),[]);
  const sheet=api.getRuleset(v).sheetDefinitions.find(s=>s.id==='pc');
  await api.updateSheetDefinition(v,'pc',{root:{...sheet.root,children:sheet.root.children.filter(n=>n.id!=='bio').map(n=>n.id==='ro'?{id:'ro',kind:'image',src:'x.webp'}:n)}});
  watcher.scan();
  assert.equal(seen.length,1);
  assert.deepEqual({source:seen[0].source,changed:seen[0].changed.sheetDefinitions,removed:seen[0].removedNodes,retyped:seen[0].retypedNodes},
    {source:'draft',changed:['pc'],removed:[{sheetId:'pc',nodeId:'bio'}],retyped:[{sheetId:'pc',nodeId:'ro',previous:'notes',current:'image'}]});
  await api.deleteSheetDefinition(v,'item');watcher.scan();
  assert.deepEqual(seen[1].removedSheets,['item']);
  assert.deepEqual(watcher.scan(),[],'nothing new, nothing told');
});

test('Configurator sections: placed after the view they name, cards in the configurator shape', ()=>{
  const items=[{view:'creationSystems'},{view:'sheetDefinitions'},{view:'sheetThemes'}];
  const placed=withExtensionItems(items,[{id:'a.one',title:'One',icon:'fa-solid fa-a',after:'sheetDefinitions'},{id:'b.two',title:'Two',icon:'fa-solid fa-b',after:'sheetDefinitions'},{id:'c',title:'End',icon:'fa-solid fa-c',after:'none'}],{activeView:'extension:b.two'});
  assert.deepEqual(placed.map(item=>item.view),['creationSystems','sheetDefinitions','extension:a.one','extension:b.two','sheetThemes','extension:c']);
  assert.equal(placed[3].active,true);
  assert.deepEqual(withExtensionItems(items,[]),items);
  const cards=extensionCards([{id:'b',name:'Beta',order:2,badges:[{icon:'<x>',label:'Text'}]},{id:'a',name:'Alpha',order:1,enabled:false,tags:[{id:'t',name:'Tag'}],invalid:{message:'Gone'}},{name:'no id'}],{color:'#123456'});
  assert.deepEqual(cards.map(card=>[card.id,card.enabled,card.cardColor]),[['a',false,'#123456'],['b',true,'#123456']]);
  assert.deepEqual(cards[0].invalid,{message:'Gone'});assert.deepEqual(cards[0].tags,['t']);
  assert.equal(cards[1].badges[0].icon,'','an icon that is not Font Awesome classes is dropped');
  const {registry}=createIntegrationRegistry({report:()=>{}});
  assert.throws(()=>registry.registerConfiguratorSection({id:'x',title:'X',parentGroup:'systems'}),/cards.list/);
  assert.throws(()=>registry.registerSheetFieldAction({id:'x',label:'X',icon:'fa-solid fa-x',matches:()=>true}),/execute/);
});

test('Field action places: drawn only when some module offers actions, never in a list row or the editor', ()=>{
  const view={sheetId:'s',root:{id:'root',kind:'grid',columns:1,children:[{id:'n',kind:'notes',format:'plain',value:'x',write:null},
    {id:'list',kind:'repeater',columns:1,rows:[{definitionId:'d',label:'D',children:[{id:'inner',kind:'notes',value:'',write:null}]}]}]}};
  assert.doesNotMatch(renderSheetHTML(view,{name:'Hero',img:'h.webp'}),/data-sheet-field-actions|data-sheet-node/);
  const html=renderSheetHTML(view,{name:'Hero',img:'h.webp',fieldActions:true});
  assert.match(html,/data-sheet-slot="header.img"/);assert.match(html,/data-sheet-field-actions="slot:header.name"/);
  assert.match(html,/class="rta-sheet-notes"[^>]*data-sheet-node="n"/);assert.match(html,/data-sheet-field-actions="node:n"/);
  assert.doesNotMatch(html,/node:inner/);
  assert.match(renderFieldActionButtons([{id:'a',icon:'fa-solid fa-wand-magic-sparkles',label:'Generate'}]),/data-sheet-field-action="a" title="Generate"/);
  assert.match(renderFieldActionButtons([{id:'a',icon:'fa-solid fa-a',label:'A'},{id:'b',icon:'fa-solid fa-b',label:'B'}],{grouped:true,menuLabel:'Actions'}),/^<button[^>]*data-sheet-field-menu[^>]*>.*<\/button>$/);
  assert.doesNotMatch(renderSheetHTML(view,{notice:'Not ready',fieldActions:true}),/data-sheet-field-actions/);
});
