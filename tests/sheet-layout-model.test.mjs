import test from 'node:test';
import assert from 'node:assert/strict';
import {canMoveInto, canPlace, paletteGroups, paletteNode, childKinds, insertNode, locate, moveInto, moveNode, newNode, previewView, removeNode, updateNode, writableSource} from '../src/configurator/sheet-layout-model.mjs';
import {prepareLayout} from '../src/configurator/layout-contract.mjs';
import {renderLayoutPreviewHTML} from '../src/ui/sheet-markup.mjs';
import {renderLayoutPropertiesHTML} from '../src/ui/sheet-editor-markup.mjs';

const ruleset={definitionTypes:[{id:'skill',nameKey:'Skills'},{id:'empty',nameKey:'Nothing'}],definitions:[{id:'climb',nameKey:'Climb',definitionTypeId:'skill',capabilities:['value','state']},{id:'swim',nameKey:'Swim',definitionTypeId:'skill',capabilities:['value']},{id:'hp',nameKey:'Health',definitionTypeId:'skill',capabilities:['pool'],slots:{pool:[{id:'points',name:'Points'}]}}],
  formulas:[{id:'f',nameKey:'Defence',resultType:'number'}],parameters:[],actions:[{id:'rest',nameKey:'Rest'}],contentTypes:[{id:'weapon',fields:{damage:{name:'Damage',valueType:'string'}}}]};
const tree=()=>prepareLayout({id:'root',kind:'grid',columns:2,children:[{id:'s',kind:'section',labelKey:'Main',columns:2,children:[{id:'v',kind:'value',span:2,source:{kind:'formula',formulaRef:'f'}}]},{id:'list',kind:'repeater',query:{definitionTypeId:'skill'},children:[]}]});

test('new blocks fit where they go and show something by default', ()=>{
  const root=tree();
  assert.deepEqual(newNode('value',root,ruleset,{parentId:'s'}).source,{kind:'output',reference:{objectKind:'definition',objectId:'climb',capabilityId:'value',outputId:'value.final'}});
  assert.deepEqual(newNode('value',root,ruleset,{parentId:'list'}).source,{kind:'each',capabilityId:'value',outputId:'value.final'});
  assert.deepEqual(newNode('value',root,ruleset,{target:'item'}).source,{kind:'field',fieldId:'damage'});
  assert.equal(newNode('value',root,{...ruleset,definitions:[],formulas:[]}),null,'nothing to show');
  const tabs=newNode('tabs',root,ruleset);assert.equal(tabs.children[0].kind,'tab');
  assert.deepEqual(childKinds(tabs),['tab']);
  assert.equal(newNode('section',root,ruleset).id,'section-1');
  const next=insertNode(root,'v',newNode('text',root,ruleset));
  assert.deepEqual(locate(next,'s').node.children.map(c=>c.kind),['value','text'],'next to a leaf, in its container');
  assert.throws(()=>insertNode(root,'root',{id:'t',kind:'tab',children:[]}),/cannot go there/);
});

test('moving, dropping and removing keep the tree valid', ()=>{
  let root=tree();
  root=insertNode(root,'list',{id:'rank',kind:'value',source:{kind:'each',capabilityId:'value',outputId:'value.final'}});
  assert.equal(canMoveInto(root,'rank','s'),false,'a row value stays in a list');
  assert.equal(canMoveInto(root,'s','v'),false,'not into itself');
  assert.equal(canMoveInto(root,'v','list'),true);
  root=moveInto(root,'v','list');
  assert.deepEqual(locate(root,'list').node.children.map(c=>c.id),['rank','v']);
  assert.equal(locate(root,'v').node.span,undefined,'a span the new place cannot hold is dropped');
  root=moveNode(root,'v',-1);assert.deepEqual(locate(root,'list').node.children.map(c=>c.id),['v','rank']);
  root=updateNode(root,'s',{columns:1});prepareLayout(root);
  root=removeNode(root,'list');assert.equal(locate(root,'rank'),null);
  assert.equal(removeNode(root,'root'),root,'the root stays');
});

test('only stored outputs and fields can be written', ()=>{
  assert.equal(writableSource({kind:'each',capabilityId:'value',outputId:'value.final'}),true);
  assert.equal(writableSource({kind:'each',capabilityId:'collection',outputId:'collection.count'}),false);
  assert.equal(writableSource({kind:'formula',formulaRef:'f'}),false);
  assert.equal(writableSource({kind:'field',fieldId:'damage'}),true);
});

test('the preview is the played sheet with sample values, every block selectable', ()=>{
  const root=insertNode(tree(),'list',{id:'rank',kind:'value',source:{kind:'each',capabilityId:'value',outputId:'value.final'},write:{operation:'set'}});
  const view=previewView(root,ruleset);
  const list=view.root.children[1];
  assert.deepEqual(list.rows.map(r=>r.label),['Climb','Swim']);
  assert.deepEqual(list.rows[0].children[0],{id:'rank',kind:'value',label:'',labelKey:'RTA.Sheet.Output.ValueFinal',write:{operation:'set'},valueType:'number',value:10});
  const html=renderLayoutPreviewHTML(view,{selectedId:'s'});
  for(const id of ['root','s','v','list','rank'])assert.match(html,new RegExp(`data-layout-node="${id}"`));
  assert.match(html,/data-layout-node="s" data-layout-selected/);
  const empty=renderLayoutPreviewHTML(previewView(prepareLayout({id:'root',kind:'grid',children:[{id:'l',kind:'repeater',query:{definitionTypeId:'empty'},children:[]}]}),ruleset));
  assert.match(empty,/data-layout-node="l" data-layout-drop/,'an empty list still offers a place to drop');
});

test('the properties offer only what the selected block can take', ()=>{
  const ctx={parentColumns:2,columnChoices:()=>[],spanChoices:()=>[{value:'1',label:'1',colors:''},{value:'2',label:'2',colors:''}],definitionTypes:[],conditions:[],actions:[],sourceKinds:[{value:'formula',label:'Formula',colors:''}],
    sourceChoices:()=>[{value:'f',label:'Defence',colors:''}],sourceToken:()=>'f',defaultLabel:()=>'Defence',writable:false,writeChoices:[],
    labelPlaces:[{value:'side',label:'Beside',colors:''},{value:'top',label:'Above',colors:''}],numeric:true,displays:[{value:'field',label:'Field',colors:''},{value:'dots',label:'Dots',colors:''}],dotCounts:[{value:'5',label:'5',colors:''}]};
  const html=renderLayoutPropertiesHTML({id:'v',kind:'value',source:{kind:'formula',formulaRef:'f'},span:2},ctx);
  assert.match(html,/data-layout-prop="sourceKind"/);assert.match(html,/placeholder="Defence"/);
  assert.doesNotMatch(html,/data-layout-prop="write"/,'a Formula is read only');
  assert.match(html,/<option value="2" data-rta-colors="" selected>/);
  assert.match(html,/data-layout-prop="labelPlace"/,'where the label goes is a setting of the value');assert.match(html,/data-layout-prop="display"/);
  assert.doesNotMatch(html,/data-layout-prop="dots"/,'the dot count only once shown as dots');
  assert.match(renderLayoutPropertiesHTML({id:'v',kind:'value',source:{kind:'formula',formulaRef:'f'},display:'dots'},ctx),/data-layout-prop="dots"/);
});

test('The palette offers layout blocks, fields, Definition families as lists and the Contents an Actor holds by type', ()=>{
  const groups=paletteGroups({...ruleset,contentTypes:[{id:'origin',nameKey:'Origin',storageKind:'item'}]},{target:'actor'});
  assert.deepEqual(groups.map(group=>group.id),['layout','document','fields','families','held','templates']);
  assert.deepEqual(groups[2].items.map(item=>item.kind),['value','gauge','dots','boxes','clock','notes','action','contents']);
  assert.deepEqual(groups[3].items.map(item=>[item.kind,item.label]),[['repeater','Skills']],'one item per family, never each Definition');
  assert.deepEqual(groups[4].items[0].spec,{kind:'value',source:{kind:'content',contentTypeId:'origin'}});
  const root=tree(),list=paletteNode(groups[3].items[0].spec,root,ruleset);
  assert.deepEqual(list.query,{definitionTypeId:'skill'});
  assert.equal(canPlace(root,list,'root'),true,'a new list goes on the sheet with its row value');
  assert.equal(canPlace(root,list,'list'),true,'and next to another list');assert.equal(list.children[0].source.kind,'each','a new list shows each row\'s value');
  const gauge=paletteNode({kind:'value',display:'gauge'},root,ruleset,{parentId:'s'});
  assert.equal(gauge.display,'gauge');assert.equal(gauge.source.reference.outputId,'pool.current','a gauge starts on a pool');
  assert.equal(locate(root,gauge.id),null,'a fresh id');
  assert.deepEqual(paletteGroups(ruleset,{target:'item'}).map(group=>group.id),['layout','document','fields','content-fields','templates']);
});

test('Values as dots or gauges, the Contents held, image shapes: checked by the layout contract', ()=>{
  const leaf=node=>prepareLayout({id:'root',kind:'grid',columns:1,children:[node]}).children[0];
  assert.deepEqual(leaf({id:'v',kind:'value',source:{kind:'formula',formulaRef:'f'},display:'dots',dots:3}),{id:'v',kind:'value',source:{kind:'formula',formulaRef:'f'},display:'dots',dots:3});
  assert.equal(leaf({id:'v',kind:'value',source:{kind:'formula',formulaRef:'f'},display:'field'}).display,undefined,'field is the default');
  assert.throws(()=>leaf({id:'v',kind:'value',source:{kind:'formula',formulaRef:'f'},dots:3}),/dots must be/);
  assert.throws(()=>leaf({id:'v',kind:'value',source:{kind:'formula',formulaRef:'f'},display:'pie'}),/display must be/);
  assert.deepEqual(leaf({id:'v',kind:'value',source:{kind:'content',contentTypeId:'origin'}}).source,{kind:'content',contentTypeId:'origin'});
  assert.equal(leaf({id:'i',kind:'image',src:'a.png',shape:'circle'}).shape,'circle');
  assert.throws(()=>leaf({id:'i',kind:'image',src:'a.png',shape:'star'}),/shape must be/);
  for(const shape of ['rounded','square','portrait','landscape','circle']) assert.equal(leaf({id:'i',kind:'image',src:'a.png',shape}).shape,shape);
  assert.equal(leaf({id:'v',kind:'value',source:{kind:'output',reference:{objectKind:'definition',objectId:'str',capabilityId:'value',outputId:'value.final'}},write:{operation:'adjust'}}).write.operation,'adjust','raised and lowered');
  const html=renderLayoutPreviewHTML(previewView(prepareLayout({id:'root',kind:'grid',columns:1,children:[{id:'d',kind:'value',source:{kind:'formula',formulaRef:'f'},display:'dots'},{id:'g',kind:'value',source:{kind:'formula',formulaRef:'f'},display:'gauge'},{id:'i',kind:'image',src:'a.png',shape:'circle'}]}),ruleset),{t:key=>key});
  assert.equal((html.match(/rta-sheet-dot rta-sheet-dot--on/g)??[]).length,3,'3 of 5 dots in the preview');
  assert.match(html,/rta-sheet-gauge__fill" style="--rta-gauge-share: 50%"/);assert.match(html,/rta-sheet-image--circle/);
  const portrait=renderLayoutPreviewHTML(previewView(prepareLayout({id:'root',kind:'grid',columns:1,children:[{id:'i',kind:'image',src:'a.png',shape:'portrait'}]}),ruleset),{t:key=>key});
  assert.match(portrait,/rta-sheet-image--portrait/);
});

test('A block dropped next to another goes before or after it, even next to a container that would take it', ()=>{
  const root=tree(),node={id:'new',kind:'text',textKey:'Hi'};
  assert.deepEqual(locate(insertNode(root,'v',node,{before:true}),'s').node.children.map(c=>c.id),['new','v']);
  assert.equal(locate(insertNode(root,'s',node),'new').parent.id,'s','into a section');
  assert.deepEqual(insertNode(root,'s',node,{beside:true,before:true}).children.map(c=>c.id),['new','s','list'],'before the section, beside it');
  assert.equal(canPlace(root,{id:'e',kind:'value',source:{kind:'each',capabilityId:'value',outputId:'value.final'}},'s'),false,'a row value needs a list');
  assert.deepEqual(moveInto(root,'list','s',{beside:true,before:true}).children.map(c=>c.id),['list','s']);
  assert.equal(canMoveInto(root,'s','v',{beside:true}),false,'not next to its own child');
});

test('The preview as one person leaves out blocks not for them and the GM-only − / +', async()=>{
  const {previewView}=await import('../src/configurator/sheet-layout-model.mjs');
  const pool={objectKind:'definition',objectId:'hp',capabilityId:'pool',slotId:'points',outputId:'pool.current'};
  const root={id:'root',kind:'section',labelKey:'',columns:1,children:[
    {id:'gauge',kind:'value',source:{kind:'output',reference:pool},display:'gauge',write:{operation:'adjust',by:'gm'},seenBy:['player','gm']},
    {id:'words',kind:'value',source:{kind:'output',reference:pool},display:'description',seenBy:['observer']}]};
  const ruleset={definitions:[{id:'hp',nameKey:'HP'}],definitionTypes:[]};
  const ids=viewer=>previewView(root,ruleset,{viewer}).root.children.map(n=>`${n.id}${n.write?'+':''}`);
  assert.deepEqual(ids(null),['gauge+','words']);
  assert.deepEqual(ids('gm'),['gauge+']);
  assert.deepEqual(ids('player'),['gauge']);
  assert.deepEqual(ids('observer'),['words']);
});

test('labels may show a Font Awesome icon, its text, or both', ()=>{
  const ruleset={definitions:[],actions:[{id:'attack',nameKey:'Attack'}]};
  const root=prepareLayout({id:'root',kind:'tabs',children:[{id:'main',kind:'tab',labelKey:'Main',icon:'fa-user',children:[
    {id:'hit',kind:'action',actionRef:'attack',icon:'fa-regular fa-hand-fist',labelShow:'icon'},
    {id:'stats',kind:'section',labelKey:'Stats',icon:'fa-solid fa-dice-d20',labelShow:'text',children:[]}]}]});
  assert.equal(root.children[0].icon,'fa-solid fa-user','fa-solid when no style is named');
  assert.throws(()=>prepareLayout({id:'root',kind:'grid',children:[{id:'a',kind:'action',actionRef:'attack',icon:'heart'}]}),/Font Awesome/);
  assert.throws(()=>prepareLayout({id:'root',kind:'grid',children:[{id:'a',kind:'action',actionRef:'attack',labelShow:'big'}]}),/labelShow/);
  assert.throws(()=>prepareLayout({id:'root',kind:'grid',children:[{id:'t',kind:'text',textKey:'x',icon:'fa-heart'}]}),/unsupported field: icon/);
  const html=renderLayoutPreviewHTML(previewView(root,ruleset));
  assert.match(html,/<i class="fa-solid fa-user rta-sheet-icon" aria-hidden="true"><\/i><span>Main<\/span>/,'icon and text');
  assert.match(html,/title="Attack"[^>]*><i class="fa-regular fa-hand-fist rta-sheet-icon" aria-hidden="true"><\/i><span class="rta-sheet-visually-hidden">Attack<\/span>/,'the icon alone keeps its text for screen readers and as the tooltip');
  assert.match(html,/<h3 class="rta-sheet-section__title">Stats<\/h3>/,'text only');
  const props=renderLayoutPropertiesHTML(root.children[0].children[0],{actions:[],defaultLabel:()=>'',parentColumns:1,spanChoices:()=>[]});
  assert.match(props,/data-layout-prop="icon"[^>]*value="fa-regular fa-hand-fist"/);
  assert.match(props,/<option value="icon" selected>/);
});

test('a progression block: offered per Progression System, never in a list, previewed with sample purchases', ()=>{
  const r={...ruleset,definitions:[...ruleset.definitions,{id:'xp',nameKey:'XP',definitionTypeId:'empty',capabilities:['value']}],
    progressionSystems:[{id:'career',nameKey:'Career',advancements:[{id:'skills',labelKey:'Skill advance',definitionTypeId:'skill',definitionIds:[],currencyRef:{objectKind:'definition',objectId:'xp',capabilityId:'value',outputId:'value.base'}}],milestones:[{id:'l2',labelKey:'Level 2'},{id:'l3',labelKey:'Level 3'}]}]};
  const fields=paletteGroups(r).find(g=>g.id==='fields').items;
  assert.deepEqual(fields.filter(i=>i.kind==='progression').map(i=>[i.label,i.spec.progressionSystemRef]),[['Career','career']]);
  assert.equal(paletteGroups(r,{target:'item'}).find(g=>g.id==='fields').items.some(i=>i.kind==='progression'),false,'not on an Item sheet');
  const root=tree(),node=paletteNode({kind:'progression',progressionSystemRef:'career'},root,r);
  assert.deepEqual(node,{id:'progression-1',kind:'progression',progressionSystemRef:'career'});
  assert.equal(canPlace(root,node,'list'),false,'never once per row');
  const next=insertNode(root,'s',node);
  const view=previewView(next,r).root.children[0].children.find(n=>n.kind==='progression');
  assert.deepEqual(view.advancements[0].rows.map(row=>[row.label,row.cost,row.reason??null]),[['Climb',10,null],['Swim',10,'maximum']]);
  assert.deepEqual(view.milestones.map(m=>m.state),['reached','ahead']);
  const html=renderLayoutPreviewHTML(previewView(next,r));
  assert.match(html,/data-layout-node="progression-1"/);
  assert.doesNotMatch(html,/<button/,'the editor draws marks, not buttons');
  const observer=previewView(next,r,{viewer:'observer'}).root.children[0].children.find(n=>n.kind==='progression');
  assert.deepEqual([observer.advancements[0].rows[0].buy,observer.apply],[false,false]);
});

test('a Content Type or Definition Type not offered in the sheet editor leaves the palette; blocks already placed keep working', async()=>{
  const {prepareContentType}=await import('../src/configurator/rule-contracts.mjs');
  assert.equal('sheetPalette' in prepareContentType({id:'a',nameKey:'A',sheetPalette:true}),false,'offered is the default: stored only when not');
  assert.equal(prepareContentType({id:'a',nameKey:'A',sheetPalette:false}).sheetPalette,false);
  assert.throws(()=>prepareContentType({id:'a',nameKey:'A',sheetPalette:'no'}),/sheetPalette must be true or false/);
  const r={...ruleset,definitionTypes:[{id:'skill',nameKey:'Skills',sheetPalette:false}],contentTypes:[{id:'origin',nameKey:'Origin',storageKind:'item',fields:{lore:{name:'Lore',valueType:'string'}}},{id:'npc',nameKey:'NPC',storageKind:'item',sheetPalette:false,fields:{threat:{name:'Threat',valueType:'number'}}}]};
  const groups=paletteGroups(r,{target:'actor'});
  assert.equal(groups.some(g=>g.id==='families'),false,'the family is gone');
  assert.deepEqual(groups.find(g=>g.id==='held').items.map(i=>i.label),['Origin']);
  assert.deepEqual(paletteGroups(r,{target:'item'}).find(g=>g.id==='content-fields').items.map(i=>i.label),['Lore'],'an Item sheet for every type offers the fields of the offered ones');
  assert.deepEqual(paletteGroups(r,{target:'item',contentTypeIds:['npc']}).find(g=>g.id==='content-fields').items.map(i=>i.label),['Threat'],'a sheet that names its type keeps its fields');
  // A Definition Type keeps the choice the same way.
  const {createConfiguratorAPI}=await import('../src/configurator/configurator-api.mjs');
  const {emptyStorageSnapshot}=await import('../src/configurator/configurator-storage.mjs');
  const api=await createConfiguratorAPI({value:emptyStorageSnapshot(),async load(){return structuredClone(this.value);},async save(v){this.value=structuredClone(v);}});
  const v=(await api.createRuleset({id:'g',nameKey:'Game',version:'1'})).versionId;
  const type={id:'skill',key:'skill',nameKey:'Skills',allowedCapabilities:[],defaultCapabilities:[],requiredCapabilities:[],fields:{}};
  assert.equal((await api.registerDefinitionType(v,{...type,sheetPalette:false})).sheetPalette,false);
  assert.equal('sheetPalette' in await api.updateDefinitionType(v,'skill',{sheetPalette:true}),false);
  // A list of that family placed before still shows its rows.
  const view=previewView(tree(),r).root.children.find(n=>n.kind==='repeater');
  assert.deepEqual(view.rows.map(row=>row.label),['Climb','Swim']);
});

test('name, portrait and token blocks: the Document itself, placed anywhere but in a list; token only on an Actor sheet', async()=>{
  const {prepareSheetDefinition}=await import('../src/configurator/rule-contracts.mjs');
  const leaf=node=>prepareLayout({id:'root',kind:'grid',columns:1,children:[node]}).children[0];
  assert.deepEqual(leaf({id:'n',kind:'name',style:{size:'huge',align:'center'}}),{id:'n',kind:'name',style:{size:'huge',align:'center'}});
  assert.deepEqual(leaf({id:'p',kind:'portrait',shape:'circle',height:'large',fit:'contain'}),{id:'p',kind:'portrait',fit:'contain',height:'large',shape:'circle'});
  assert.deepEqual(leaf({id:'t',kind:'token',updatePlaced:true}),{id:'t',kind:'token',updatePlaced:true});
  assert.deepEqual(leaf({id:'t',kind:'token',updatePlaced:false}),{id:'t',kind:'token'});
  assert.throws(()=>leaf({id:'p',kind:'portrait',src:'a.png'}),/unsupported field: src/);
  assert.throws(()=>prepareLayout({id:'root',kind:'repeater',query:{definitionTypeId:'skill'},children:[{id:'n',kind:'name'}]}),/never once per row/);
  const sheet=(target,root,extra={})=>prepareSheetDefinition({id:'s',nameKey:'S',target,root,...extra});
  assert.equal(sheet('actor',{id:'root',kind:'grid',children:[]}).header,'standard');
  assert.equal(sheet('actor',{id:'root',kind:'grid',children:[]},{header:'none'}).header,'none');
  assert.throws(()=>sheet('actor',{id:'root',kind:'grid',children:[]},{header:'big'}),/header must be standard or none/);
  assert.throws(()=>sheet('item',{id:'root',kind:'grid',children:[{id:'t',kind:'token'}]}),/token image is only on Actor sheets/);
  assert.equal(sheet('item',{id:'root',kind:'grid',children:[{id:'n',kind:'name'},{id:'p',kind:'portrait'}]}).root.children.length,2);
  // The palette offers them; a new portrait is framed as one, a token as a small circle.
  assert.deepEqual(paletteGroups(ruleset).find(g=>g.id==='document').items.map(i=>i.kind),['name','portrait','token']);
  assert.deepEqual(paletteGroups(ruleset,{target:'item'}).find(g=>g.id==='document').items.map(i=>i.kind),['name','portrait']);
  const root=tree();
  assert.deepEqual(paletteNode({kind:'portrait'},root,ruleset),{id:'portrait-1',kind:'portrait',shape:'portrait'});
  assert.deepEqual(paletteNode({kind:'token'},root,ruleset),{id:'token-1',kind:'token',shape:'circle',height:'small'});
  assert.equal(paletteNode({kind:'token'},root,ruleset,{target:'item'}),null);
  assert.equal(paletteNode({kind:'name'},root,ruleset,{parentId:'list'}),null,'not once per row');
  assert.equal(canPlace(root,{id:'x',kind:'name'},'list'),false);
  assert.equal(canPlace(root,{id:'x',kind:'name'},'s'),true);
  // The editor previews samples, the standard header when the sheet has it, and the settings of each block.
  const next=insertNode(insertNode(insertNode(root,'s',{id:'n',kind:'name'}),'s',{id:'p',kind:'portrait',shape:'portrait'}),'s',{id:'t',kind:'token',updatePlaced:true});
  const html=renderLayoutPreviewHTML(previewView(next,ruleset));
  assert.match(html,/<header class="rta-sheet__header"><div class="rta-sheet__portrait"><span class="rta-sheet__image rta-sheet__image--sample">/);
  assert.doesNotMatch(renderLayoutPreviewHTML(previewView(next,ruleset,{header:'none'})),/rta-sheet__header/);
  assert.match(html,/<div class="rta-sheet-name" data-layout-node="n"><span class="rta-sheet-name__text">RTA.SheetEditor.SampleName<\/span><\/div>/);
  assert.match(html,/class="rta-sheet-image rta-sheet-picture rta-sheet-image--portrait rta-sheet-image--sample"[^>]*data-layout-node="p"><img src="icons\/svg\/mystery-man.svg" alt="RTA.SheetEditor.Kind.portrait"/);
  assert.doesNotMatch(html,/data-sheet-edit-image|data-sheet-name/,'the editor never changes the Document');
  const ctx={columnChoices:()=>[],spanChoices:()=>[],shapes:[],fits:[],heights:[],parentColumns:1,isRoot:false};
  assert.match(renderLayoutPropertiesHTML({id:'t',kind:'token',updatePlaced:true},ctx),/data-layout-prop="updatePlaced" checked/);
  assert.doesNotMatch(renderLayoutPropertiesHTML({id:'p',kind:'portrait'},ctx),/updatePlaced|data-layout-prop="src"/);
});

test('description blocks start on a Definition that has a scale, and a family with scales is offered as a list of its words',()=>{
  const ruleset={definitionTypes:[{id:'trait',nameKey:'Traits'},{id:'skill',nameKey:'Skills'}],
    definitions:[{id:'luck',definitionTypeId:'trait',capabilities:['value']},{id:'might',definitionTypeId:'trait',capabilities:['value'],scaleRef:'words'},{id:'climb',definitionTypeId:'skill',capabilities:['value']}],
    scales:[{id:'words',nameKey:'Words',basis:'value',rows:[{id:'r1',min:null,max:null,labelKey:'Strong'}]}]};
  const groups=paletteGroups(ruleset,{target:'actor'});
  const fields=groups.find(g=>g.id==='fields').items, families=groups.find(g=>g.id==='families').items;
  const description=fields.find(item=>item.kind==='description');
  assert.ok(description);
  const root={id:'root',kind:'section',children:[]};
  const node=paletteNode(description.spec,root,ruleset);
  assert.equal(node.display,'description');
  assert.equal(node.source.reference.objectId,'might','not luck, which has no scale');
  const lists=families.filter(item=>item.spec.definitionTypeId==='trait');
  assert.deepEqual(lists.map(item=>item.spec.display??null),[null,'description']);
  assert.equal(lists[1].suffixKey,'RTA.SheetEditor.Palette.Descriptions');
  assert.equal(families.filter(item=>item.spec.definitionTypeId==='skill').length,1,'no scale, no list of words');
  const list=paletteNode(lists[1].spec,root,ruleset);
  assert.deepEqual(list.children.map(child=>[child.source.kind,child.display]),[['each','description']]);
  assert.equal(paletteGroups({...ruleset,scales:[]},{target:'actor'}).find(g=>g.id==='fields').items.some(item=>item.kind==='description'),false);
});
