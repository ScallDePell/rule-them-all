import test from 'node:test';
import assert from 'node:assert/strict';
import {createConfiguratorAPI} from '../src/configurator/configurator-api.mjs';
import {emptyStorageSnapshot} from '../src/configurator/configurator-storage.mjs';
import {MemoryRuntimeAdapter} from '../src/runtime/memory-runtime-adapter.mjs';
import {RuntimeEngine} from '../src/runtime/runtime-engine.mjs';
import {projectSheet} from '../src/runtime/sheet-projection.mjs';
import {writeSheetValue} from '../src/runtime/sheet-writes.mjs';
import {prepareRuntimeState} from '../src/runtime/runtime-contracts.mjs';
import {applyLedgerChanges, diffRuntimeStates} from '../src/runtime/runtime-transaction.mjs';
import {prepareLayout} from '../src/configurator/layout-contract.mjs';
import {canPlace, newNode, paletteGroups, paletteNode, previewView} from '../src/configurator/sheet-layout-model.mjs';
import {sheetStyle} from '../src/ui/sheet-style.mjs';
import {renderLayoutPreviewHTML, renderSheetHTML, textWithValues} from '../src/ui/sheet-markup.mjs';
import {renderLayoutPropertiesHTML} from '../src/ui/sheet-editor-markup.mjs';

class Storage{value=emptyStorageSnapshot();async load(){return structuredClone(this.value)}async save(v){this.value=structuredClone(v)}}
const hero={kind:'actor',id:'hero'};
const out=(objectId,capabilityId,outputId,slotId)=>({objectKind:'definition',objectId,capabilityId,outputId,...(slotId?{slotId}:{})});
const leaf=node=>prepareLayout({id:'root',kind:'grid',columns:2,children:[node]}).children[0];
const find=(node,id)=>{if(!node)return null;if(node.id===id)return node;for(const child of [...(node.children??[]),...(node.rows??[]).flatMap(r=>r.children)]){const hit=find(child,id);if(hit)return hit;}return null;};

async function setup(sheets=[],before=async()=>{}){
  const api=await createConfiguratorAPI(new Storage());
  const v=(await api.createRuleset({id:'g',nameKey:'Game',version:'1'})).versionId;
  await api.registerDefinitionType(v,{id:'attribute',key:'attribute',nameKey:'Attributes',allowedCapabilities:['value'],defaultCapabilities:['value'],requiredCapabilities:[],fields:{}});
  await api.registerDefinitionType(v,{id:'skill',key:'skill',nameKey:'Skills',allowedCapabilities:['value'],defaultCapabilities:['value'],requiredCapabilities:[],fields:{}});
  await api.createDefinition(v,{id:'str',key:'str',definitionTypeId:'attribute',nameKey:'Strength',descriptionKey:'Raw might',data:{},capabilities:['value']});
  await api.createDefinition(v,{id:'stress',key:'stress',definitionTypeId:'attribute',nameKey:'Stress',data:{},capabilities:['value']});
  for(const id of ['climb','swim'])await api.createDefinition(v,{id,key:id,definitionTypeId:'skill',nameKey:id,data:{},capabilities:['value']});
  await api.createParameter(v,{id:'level',nameKey:'Level',valueType:'number',value:3});
  await api.createCondition(v,{id:'strong',nameKey:'Strong',expression:{type:'gte',left:{type:'reference',reference:out('str','value','value.final')},right:{type:'literal',value:10}}});
  await api.createCondition(v,{id:'climbing',nameKey:'Climbing',expression:{type:'eq',left:{type:'context',path:'variables.each.definitionId'},right:{type:'literal',value:'climb'}}});
  await api.createAction(v,{id:'roll',nameKey:'Roll',effectRefs:[]});
  for(const sheet of sheets)await api.createSheetDefinition(v,sheet);
  await before(api,v);
  await api.publishRuleset(v);
  const adapter=new MemoryRuntimeAdapter(),engine=new RuntimeEngine({configurator:api,adapter,hooks:null});
  await engine.initializeContainer(v,hero,{definitionIds:['str','stress','climb','swim']});
  await engine.setDefinitionState(v,hero,'str',{base:7});
  await engine.setDefinitionState(v,hero,'stress',{base:2});
  await engine.setDefinitionState(v,hero,'climb',{base:40});
  return {api,v,engine,adapter};
}

test('the layout grammar takes spans, fixed widths, Conditions, tooltips, overlays, foldable sections and click Actions', ()=>{
  assert.deepEqual(leaf({id:'t',kind:'text',textKey:'x',rowSpan:2,width:'small',visibleIf:'strong',tooltip:{text:'Hello'},clickActionRef:'roll'}),
    {id:'t',kind:'text',rowSpan:2,width:'small',visibleIf:'strong',tooltip:{text:'Hello'},clickActionRef:'roll',textKey:'x'});
  assert.equal(leaf({id:'t',kind:'text',textKey:'x',rowSpan:1}).rowSpan,undefined,'one row is the default');
  for(const [node,message] of [[{id:'t',kind:'text',textKey:'x',rowSpan:7},/rowSpan/],[{id:'t',kind:'text',textKey:'x',width:'huge'},/width must be/],
    [{id:'t',kind:'text',textKey:'x',tooltip:{description:true}},/tooltip must be/],[{id:'t',kind:'text',textKey:'x',tooltip:{text:''}},/tooltip must be/],
    [{id:'g',kind:'grid',overlay:'left',children:[]},/overlay must be/],[{id:'g',kind:'grid',collapsible:true,children:[]},/unsupported field: collapsible/],
    [{id:'a',kind:'action',actionRef:'roll',clickActionRef:'roll'},/unsupported field: clickActionRef/],
    [{id:'v',kind:'value',source:{kind:'formula',formulaRef:'f'},display:'clock',dots:21},/dots must be/]])
    assert.throws(()=>leaf(node),message,JSON.stringify(node));
  assert.throws(()=>prepareLayout({id:'root',kind:'grid',visibleIf:'strong',children:[]}),/below the root/);
  assert.deepEqual(leaf({id:'v',kind:'value',source:{kind:'output',reference:out('str','value','value.final')},tooltip:{description:true},display:'boxes',dots:8}).tooltip,{description:true});
  assert.deepEqual(leaf({id:'s',kind:'section',labelKey:'S',collapsible:true,overlay:'bottom',children:[]}),{id:'s',kind:'section',columns:1,labelKey:'S',collapsible:true,overlay:'bottom',children:[]});
});

test('a text shows values by name; notes and separators are checked leaves', ()=>{
  assert.deepEqual(leaf({id:'t',kind:'text',textKey:'Level {Level}',values:{Level:{kind:'parameter',parameterRef:'level'}}}).values,{Level:{kind:'parameter',parameterRef:'level'}});
  assert.throws(()=>leaf({id:'t',kind:'text',textKey:'x',values:{'a{b':{kind:'parameter',parameterRef:'level'}}}),/cannot be a value name/);
  assert.throws(()=>leaf({id:'t',kind:'text',textKey:'x',values:{a:{kind:'field',fieldId:'f'}}}),/kind must be output, formula, parameter, each/);
  assert.throws(()=>leaf({id:'t',kind:'text',textKey:'x',values:{a:{kind:'each',capabilityId:'value',outputId:'value.final'}}}),/inside a repeater/);
  assert.deepEqual(leaf({id:'n',kind:'notes',labelKey:'Background',format:'rich',height:'large',write:{operation:'set',by:'gm'}}),{id:'n',kind:'notes',labelKey:'Background',format:'rich',height:'large',write:{operation:'set',by:'gm'}});
  assert.equal(leaf({id:'n',kind:'notes',format:'plain'}).format,undefined,'plain is the default');
  assert.throws(()=>leaf({id:'n',kind:'notes',write:{operation:'add'}}),/write must be/);
  assert.throws(()=>prepareLayout({id:'root',kind:'grid',children:[{id:'l',kind:'repeater',query:{definitionTypeId:'skill'},children:[{id:'n',kind:'notes'}]}]}),/never once per row/);
  assert.deepEqual(leaf({id:'s',kind:'separator',look:'line'}),{id:'s',kind:'separator'});
  assert.deepEqual(leaf({id:'s',kind:'separator',look:'image',src:'ui/divider.webp'}),{id:'s',kind:'separator',look:'image',src:'ui/divider.webp'});
  assert.throws(()=>leaf({id:'s',kind:'separator',src:'a.webp'}),/only for a picture/);
});

test('a background picture covers, fits, stretches, keeps its size or tiles, at a chosen position', ()=>{
  const style=extra=>prepareLayout({id:'root',kind:'grid',children:[{id:'g',kind:'grid',children:[],style:{image:'a.webp',...extra}}]}).children[0].style;
  assert.deepEqual(style({imageFit:'tile',imagePosition:'top'}),{image:'a.webp',imageFit:'tile',imagePosition:'top'});
  assert.throws(()=>style({imageFit:'zoom'}),/imageFit must be/);
  assert.throws(()=>prepareLayout({id:'root',kind:'grid',children:[{id:'g',kind:'grid',children:[],style:{imageFit:'contain'}}]}),/with a background picture/);
  assert.throws(()=>prepareLayout({id:'root',kind:'grid',children:[{id:'t',kind:'text',textKey:'',style:{image:'a.webp',imagePosition:'top'}}]}),/only on containers/);
  assert.deepEqual(sheetStyle({kind:'grid',style:{image:'a.webp'}}).css,['background-image: url("a.webp")','background-size: cover','background-repeat: no-repeat','background-position: center']);
  assert.deepEqual(sheetStyle({kind:'grid',style:{image:'a.webp',imageFit:'stretch',imagePosition:'bottom'}}).css.slice(1),['background-size: 100% 100%','background-repeat: no-repeat','background-position: bottom']);
  assert.deepEqual(sheetStyle({kind:'grid',style:{image:'a.webp',imageFit:'tile'}}).css.slice(1,3),['background-size: auto','background-repeat: repeat']);
  assert.deepEqual(sheetStyle({kind:'grid',style:{image:'a.webp',imageFit:'natural'}}).css.slice(1,3),['background-size: auto','background-repeat: no-repeat']);
});

test('the played sheet leaves out what a Condition hides, fills text values, offers click Actions and description tooltips', async()=>{
  const {v,engine}=await setup();
  const sheet={id:'s',target:'actor',root:prepareLayout({id:'root',kind:'grid',columns:2,children:[
    {id:'mighty',kind:'text',textKey:'Mighty!',visibleIf:'strong'},
    {id:'line',kind:'text',textKey:'Level {Level}, Strength {Strength}, {Gone}',values:{Level:{kind:'parameter',parameterRef:'level'},Strength:{kind:'output',reference:out('str','value','value.final')}},clickActionRef:'roll'},
    {id:'str',kind:'value',source:{kind:'output',reference:out('str','value','value.final')},tooltip:{description:true},clickActionRef:'roll'},
    {id:'stress',kind:'value',source:{kind:'output',reference:out('stress','value','value.final')},display:'boxes',dots:6,write:{operation:'set'},rowSpan:2,width:'medium'},
    {id:'clock',kind:'value',source:{kind:'output',reference:out('stress','value','value.final')},display:'clock',dots:4},
    {id:'skills',kind:'repeater',query:{definitionTypeId:'skill'},clickActionRef:'roll',children:[{id:'rank',kind:'value',source:{kind:'each',capabilityId:'value',outputId:'value.final'}},{id:'only',kind:'text',textKey:'Rope!',visibleIf:'climbing'}]},
    {id:'fold',kind:'section',labelKey:'Details',collapsible:true,overlay:'center',children:[{id:'sep',kind:'separator',look:'ornament'},{id:'nopic',kind:'separator',look:'image',src:''}]}]})};
  let view=await projectSheet(engine,v,sheet,{actor:hero});
  assert.equal(find(view.root,'mighty'),null,'Strength 7: the Condition is false');
  assert.deepEqual(find(view.root,'line').values,{Level:3,Strength:7});
  assert.deepEqual(find(view.root,'line').click,{actionId:'roll',definitionId:null});
  assert.deepEqual(find(view.root,'str').tooltip,{text:'Raw might'});
  assert.equal(find(view.root,'skills').click.actionId,'roll');
  assert.deepEqual([find(view.root,'stress').rowSpan,find(view.root,'stress').width,find(view.root,'stress').dots],[2,'medium',6]);
  assert.equal(find(view.root,'nopic'),null,'a picture separator without its picture shows nothing');
  const html=renderSheetHTML(view,{t:key=>key});
  assert.match(html,/Level <span class="rta-sheet-text__value">3<\/span>, Strength <span class="rta-sheet-text__value">7<\/span>, \{Gone\}/);
  assert.match(html,/<button type="button" class="rta-sheet-roll" data-sheet-action="roll">/,'the text uses its Action');
  assert.match(html,/<button type="button" class="rta-sheet-value__label rta-sheet-roll" data-sheet-action="roll">/,'a value by its label');
  assert.match(html,/class="rta-sheet-row__label rta-sheet-roll" data-sheet-action="roll" data-definition-id="climb"/,'a list row by its name, on its Definition');
  assert.match(html,/data-tooltip="Raw might"/);
  assert.match(html,/rta-sheet-dots rta-sheet-dots--boxes/);
  assert.equal((html.match(/data-sheet-dot=/g)??[]).length,6,'six boxes, each sets the value');
  assert.match(html,/--rta-sheet-row-span: 2; --rta-sheet-width: 14rem/);
  assert.equal((html.match(/class="rta-sheet-clock__segment/g)??[]).length,4,'a clock of four segments');
  assert.equal((html.match(/rta-sheet-clock__segment--on/g)??[]).length,2);
  assert.match(html,/data-sheet-collapse="fold" aria-expanded="true"/);
  assert.match(html,/class="rta-sheet-grid rta-sheet-grid--overlay rta-sheet-grid--overlay-center"[^>]*data-sheet-collapsible="fold"/);
  assert.match(html,/rta-sheet-separator rta-sheet-separator--ornament/);
  await engine.setDefinitionState(v,hero,'str',{base:12});
  view=await projectSheet(engine,v,sheet,{actor:hero});
  assert.ok(find(view.root,'mighty'),'Strength 12: shown');
});

test('a value hidden by its Condition is not written through', async()=>{
  const sheet={id:'s',target:'actor',nameKey:'S',root:{id:'root',kind:'grid',columns:1,children:[{id:'box',kind:'grid',columns:1,visibleIf:'strong',children:[{id:'str',kind:'value',source:{kind:'output',reference:out('str','value','value.final')},write:{operation:'set'}}]}]}};
  const {v,engine}=await setup([sheet]);
  await assert.rejects(writeSheetValue(engine,v,hero,{sheetId:'s',nodeId:'str',value:9}),/not on your sheet/);
});

test('notes are kept on the Actor through the runtime: Permission, GM-only and the ledger apply', async()=>{
  const sheet={id:'s',target:'actor',nameKey:'S',root:prepareLayout({id:'root',kind:'grid',columns:1,children:[
    {id:'notes',kind:'notes',labelKey:'Notes',write:{operation:'set'}},{id:'secret',kind:'notes',write:{operation:'set',by:'gm'},format:'rich'},{id:'frozen',kind:'notes'}]})};
  const {v,engine,adapter}=await setup([sheet]);
  await writeSheetValue(engine,v,hero,{sheetId:'s',nodeId:'notes',value:'Owes the guild\n100 crowns'});
  const ledger=await adapter.loadLedger(hero);
  assert.deepEqual(ledger.at(-1).changes,[{scope:'note',id:'notes',before:null,after:'Owes the guild\n100 crowns'}]);
  let view=await projectSheet(engine,v,sheet,{actor:hero});
  assert.deepEqual([find(view.root,'notes').value,find(view.root,'notes').write,find(view.root,'notes').label],['Owes the guild\n100 crowns',{operation:'set'},'Notes']);
  assert.equal(find(view.root,'frozen').write,null,'not writable: read only');
  await assert.rejects(writeSheetValue(engine,v,hero,{sheetId:'s',nodeId:'frozen',value:'x'}),/does not let/);
  assert.match(renderSheetHTML(view,{t:k=>k}),/<textarea class="rta-sheet-notes__field" data-sheet-write="notes" data-operation="set" aria-label="Notes">Owes the guild\n100 crowns<\/textarea>/);
  await writeSheetValue(engine,v,hero,{sheetId:'s',nodeId:'secret',value:'<p>Is <strong>cursed</strong></p>'});
  // A player owner writes their notes, never the GM's; an observer writes none.
  adapter.users.set('p',{role:'player',isGM:false});adapter.ownership.set('actor:hero|p','owner');adapter.currentUserId='p';
  view=await projectSheet(engine,v,sheet,{actor:hero});
  assert.equal(find(view.root,'secret').write,null);
  assert.match(renderSheetHTML(view,{t:k=>k}),/data-sheet-note-rich="secret">Is cursed<\/div>/,'rich text without its tags until Foundry enriches it');
  await assert.rejects(writeSheetValue(engine,v,hero,{sheetId:'s',nodeId:'secret',value:'x'}),/Only a GM/);
  await writeSheetValue(engine,v,hero,{sheetId:'s',nodeId:'notes',value:''});
  assert.deepEqual((await adapter.load(hero)).notes,{secret:'<p>Is <strong>cursed</strong></p>'},'an emptied note is removed');
  adapter.ownership.set('actor:hero|p','observer');
  view=await projectSheet(engine,v,sheet,{actor:hero});
  assert.equal(find(view.root,'notes').write,null);
  await assert.rejects(writeSheetValue(engine,v,hero,{sheetId:'s',nodeId:'notes',value:'x'}),/Permission denied|GM/);
  adapter.currentUserId='gm';
  await assert.rejects(engine.setNote(v,hero,'notes','x'.repeat(20001)),/at most/);
});

test('a whole-Ruleset Permission that keeps players from writing keeps them from writing notes', async()=>{
  const sheet={id:'s',target:'actor',nameKey:'S',root:{id:'root',kind:'grid',columns:1,children:[{id:'notes',kind:'notes',write:{operation:'set'}}]}};
  const {v,engine,adapter}=await setup([sheet],(api,v)=>api.createPermissionPolicy(v,{id:'read-only',nameKey:'Read only',scope:{objectKind:'ruleset'},defaultEffect:'DENY',rules:[{id:'read',effect:'ALLOW',operations:['read','execute']}]}));
  adapter.users.set('p',{role:'player',isGM:false});adapter.ownership.set('actor:hero|p','owner');adapter.currentUserId='p';
  const view=await projectSheet(engine,v,sheet,{actor:hero});
  assert.equal(find(view.root,'notes').write,null,'read, not written');
  await assert.rejects(writeSheetValue(engine,v,hero,{sheetId:'s',nodeId:'notes',value:'x'}),/Permission denied/);
});

test('runtime notes: a map of texts, diffed and replayed like other runtime changes', ()=>{
  assert.deepEqual(prepareRuntimeState({schemaVersion:2,rulesetVersionId:'v',runtimeRevision:0,definitionStates:{},stateInstances:[]}).notes,{});
  assert.throws(()=>prepareRuntimeState({schemaVersion:2,rulesetVersionId:'v',runtimeRevision:0,definitionStates:{},stateInstances:[],notes:{a:3}}),/notes must map/);
  const before={definitionStates:{},stateInstances:[],notes:{a:'x'}},after={definitionStates:{},stateInstances:[],notes:{b:'y'}};
  const changes=diffRuntimeStates(before,after);
  assert.deepEqual(changes,[{scope:'note',id:'a',before:'x',after:null},{scope:'note',id:'b',before:null,after:'y'}]);
  assert.deepEqual(applyLedgerChanges(structuredClone(after),changes,'before').notes,{a:'x'});
});

test('the editor offers the new blocks and shows a block under a Condition dimmed', ()=>{
  const ruleset={definitions:[{id:'str',definitionTypeId:'attribute',nameKey:'Strength',descriptionKey:'Raw might',capabilities:['value']}],definitionTypes:[{id:'attribute',nameKey:'Attributes'}],parameters:[{id:'level',nameKey:'Level',valueType:'number',value:3}],actions:[{id:'roll',nameKey:'Roll'}],conditions:[{id:'strong',nameKey:'Strong'}]};
  const groups=paletteGroups(ruleset,{target:'actor'});
  assert.ok(groups[0].items.some(item=>item.kind==='separator'));
  assert.deepEqual(groups.find(group=>group.id==='fields').items.filter(item=>['boxes','clock','notes'].includes(item.kind)).map(item=>item.spec),[{kind:'value',display:'boxes'},{kind:'value',display:'clock'},{kind:'notes'}]);
  assert.ok(!paletteGroups(ruleset,{target:'item'})[1].items.some(item=>item.kind==='notes'),'notes are an Actor\'s');
  const root={id:'root',kind:'grid',columns:1,children:[{id:'list',kind:'repeater',query:{definitionTypeId:'attribute'},columns:1,children:[]}]};
  assert.equal(newNode('notes',root,ruleset,{target:'item'}),null);
  assert.equal(newNode('notes',root,ruleset,{parentId:'list'}),null);
  assert.equal(canPlace(root,{id:'n',kind:'notes'},'list'),false);
  assert.equal(paletteNode({kind:'value',display:'clock'},root,ruleset).dots,4,'a clock starts with four segments');
  const tree=prepareLayout({id:'root',kind:'grid',columns:1,children:[{id:'t',kind:'text',textKey:'Level {Level}',values:{Level:{kind:'parameter',parameterRef:'level'}},visibleIf:'strong',clickActionRef:'roll'},
    {id:'n',kind:'notes',write:{operation:'set'}},{id:'v',kind:'value',source:{kind:'output',reference:out('str','value','value.final')},tooltip:{description:true}}]});
  const view=previewView(tree,ruleset);
  assert.deepEqual(view.root.children[0].values,{Level:3});
  const html=renderLayoutPreviewHTML(view,{t:key=>key});
  assert.match(html,/data-layout-node="t" data-layout-conditional/);
  assert.match(html,/<p class="rta-sheet-text rta-sheet-roll"[^>]*>Level <span class="rta-sheet-text__value">3<\/span><\/p>/,'no button in the editor: the block still drags');
  assert.match(html,/rta-sheet-notes__text--sample/);
  assert.match(html,/data-tooltip="Raw might"/);
  assert.doesNotMatch(html,/<button/);
  assert.equal(textWithValues('{a} & {b}',{a:1.234}),'<span class="rta-sheet-text__value">1.23</span> &amp; {b}');
});

test('the properties show the new settings only where they apply', ()=>{
  const neutral='',ctx={parentColumns:1,isRoot:false,inGrid:true,columnChoices:()=>[],spanChoices:()=>[],rowSpans:[{value:'1',label:'1',colors:neutral}],widths:[{value:'auto',label:'Auto',colors:neutral}],
    visibility:[{value:'',label:'Always',colors:neutral},{value:'strong',label:'Strong',colors:neutral}],clickActions:[{value:'',label:'Nothing',colors:neutral},{value:'roll',label:'Roll',colors:neutral}],
    textValues:[{value:'parameter:level',label:'Level',colors:neutral}],noteFormats:[{value:'plain',label:'Plain',colors:neutral}],heights:[{value:'medium',label:'Medium',colors:neutral}],
    separatorLooks:[{value:'line',label:'Line',colors:neutral}],overlays:[{value:'none',label:'No',colors:neutral}],neutral};
  const text=renderLayoutPropertiesHTML({id:'t',kind:'text',textKey:''},{...ctx,clickable:true});
  for(const prop of ['insertValue','clickActionRef','visibleIf','rowSpan','width','tooltip']) assert.match(text,new RegExp(`data-layout-prop="${prop}"`),prop);
  const notes=renderLayoutPropertiesHTML({id:'n',kind:'notes',write:{operation:'set'}},ctx);
  for(const prop of ['format','height']) assert.match(notes,new RegExp(`data-layout-prop="${prop}"`),prop);
  assert.match(notes,/data-layout-write-by="gm"/);
  assert.doesNotMatch(notes,/clickActionRef|insertValue/);
  const section=renderLayoutPropertiesHTML({id:'s',kind:'section',labelKey:'',columns:1,children:[]},{...ctx,columnChoices:()=>[]});
  assert.match(section,/data-layout-prop="collapsible"/);assert.match(section,/data-layout-prop="overlay"/);
  assert.match(renderLayoutPropertiesHTML({id:'s',kind:'separator',look:'image',src:''},ctx),/data-layout-pick="src"/);
});

test('a list whose cell shows words gives them the free width and keeps the names whole', ()=>{
  const list=words=>({id:'l',kind:'repeater',columns:2,rows:[{definitionId:'str',label:'Strength',children:[{id:'c',kind:'value',...(words?{display:'description',valueType:'string',value:'Broad shoulders'}:{valueType:'number',value:3}),label:''}]}]});
  const template=html=>html.match(/--rta-sheet-list-narrow: ([^;"]+)/)[1];
  assert.equal(template(renderSheetHTML({root:list(false)})),'minmax(0, 1fr) auto');
  const html=renderSheetHTML({root:list(true)});
  assert.equal(template(html),'minmax(min-content, max-content) minmax(0, 1fr)');
  assert.match(html,/rta-sheet-value__words">Broad shoulders</);
});
