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
  assert.deepEqual(groups.map(group=>group.id),['layout','fields','families','held']);
  assert.deepEqual(groups[1].items.map(item=>item.kind),['value','gauge','dots','action','contents']);
  assert.deepEqual(groups[2].items.map(item=>[item.kind,item.label]),[['repeater','Skills']],'one item per family, never each Definition');
  assert.deepEqual(groups[3].items[0].spec,{kind:'value',source:{kind:'content',contentTypeId:'origin'}});
  const root=tree(),list=paletteNode(groups[2].items[0].spec,root,ruleset);
  assert.deepEqual(list.query,{definitionTypeId:'skill'});
  assert.equal(canPlace(root,list,'root'),true,'a new list goes on the sheet with its row value');
  assert.equal(canPlace(root,list,'list'),true,'and next to another list');assert.equal(list.children[0].source.kind,'each','a new list shows each row\'s value');
  const gauge=paletteNode({kind:'value',display:'gauge'},root,ruleset,{parentId:'s'});
  assert.equal(gauge.display,'gauge');assert.equal(gauge.source.reference.outputId,'pool.current','a gauge starts on a pool');
  assert.equal(locate(root,gauge.id),null,'a fresh id');
  assert.deepEqual(paletteGroups(ruleset,{target:'item'}).map(group=>group.id),['layout','fields','content-fields']);
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
  const html=renderLayoutPreviewHTML(previewView(prepareLayout({id:'root',kind:'grid',columns:1,children:[{id:'d',kind:'value',source:{kind:'formula',formulaRef:'f'},display:'dots'},{id:'g',kind:'value',source:{kind:'formula',formulaRef:'f'},display:'gauge'},{id:'i',kind:'image',src:'a.png',shape:'circle'}]}),ruleset),{t:key=>key});
  assert.equal((html.match(/rta-sheet-dot rta-sheet-dot--on/g)??[]).length,3,'3 of 5 dots in the preview');
  assert.match(html,/rta-sheet-gauge__fill" style="inline-size: 50%"/);assert.match(html,/rta-sheet-image--circle/);
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
