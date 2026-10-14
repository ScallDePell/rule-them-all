import test from 'node:test';
import assert from 'node:assert/strict';
import {clearClipboard, copyToClipboard, missingReferences, pasteBlock, pastePlace, readClipboard, styleFor, withFreshIds} from '../src/configurator/sheet-layout-clipboard.mjs';
import {locate} from '../src/configurator/sheet-layout-model.mjs';
import {prepareLayout} from '../src/configurator/layout-contract.mjs';
import {prepareSheetDefinition} from '../src/configurator/rule-contracts.mjs';
import {renderLayoutLayersHTML, renderLayoutToolbarHTML} from '../src/ui/sheet-editor-markup.mjs';
import {registerRulesetSheets} from '../src/runtime/foundry-sheets.mjs';

const ruleset={definitionTypes:[{id:'skill',nameKey:'Skills'}],definitions:[{id:'climb',nameKey:'Climb',definitionTypeId:'skill',capabilities:['value']}],
  formulas:[{id:'f',nameKey:'Defence'}],parameters:[],actions:[{id:'rest',nameKey:'Rest'}],contentTypes:[{id:'weapon',fields:{damage:{name:'Damage',valueType:'string'}}}]};
const tree=()=>prepareLayout({id:'root',kind:'grid',columns:2,children:[
  {id:'s',kind:'section',labelKey:'Main',columns:2,style:{background:'panel',bold:true},children:[{id:'v',kind:'value',span:2,source:{kind:'formula',formulaRef:'f'},style:{label:'top',color:'accent'}}]},
  {id:'list',kind:'repeater',query:{definitionTypeId:'skill'},children:[{id:'rank',kind:'value',source:{kind:'each',capabilityId:'value',outputId:'value.final'}}]}]});

test('a pasted block keeps its children and style, with new ids, into a container or right after the selection', ()=>{
  const root=tree(),section=locate(root,'s').node;
  const fresh=withFreshIds(section,root);
  assert.deepEqual([fresh.id,fresh.children[0].id],['section-1','value-1'],'ids no node of the sheet uses');
  assert.deepEqual(fresh.style,section.style);
  // Into a container that takes it, else next to the block selected.
  assert.deepEqual(pastePlace(root,fresh,'root'),{targetId:'root',beside:false});
  assert.deepEqual(pastePlace(root,fresh,'v'),{targetId:'v',beside:true});
  assert.deepEqual(pastePlace(root,fresh,'s',{after:true}),{targetId:'s',beside:true},'duplicate: right after the original');
  const pasted=pasteBlock(root,section,'v',ruleset);
  assert.equal(pasted.id,'section-1');
  assert.deepEqual(locate(pasted.root,'s').node.children.map(c=>c.id),['v','section-1']);
  assert.equal(locate(pasted.root,'value-1').node.span,2,'its children keep their width');
  const narrow=pasteBlock(root,locate(root,'v').node,'list',ruleset);
  assert.equal(locate(narrow.root,narrow.id).node.span,undefined,'a width the new place cannot hold shrinks');
  prepareLayout(pasted.root);
  const twice=pasteBlock(pasted.root,section,'root',ruleset);
  assert.equal(twice.id,'section-2','pasting again gives other ids');
  prepareLayout(twice.root);
});

test('a block naming what the Ruleset or the sheet lacks is refused, and a row value only goes in a list', ()=>{
  const root=tree();
  const foreign={id:'x',kind:'section',labelKey:'',columns:1,children:[{id:'y',kind:'value',source:{kind:'output',reference:{objectKind:'definition',objectId:'strength',capabilityId:'value',outputId:'value.final'}}},{id:'z',kind:'action',actionRef:'rest'}]};
  assert.deepEqual(pasteBlock(root,foreign,'root',ruleset),{error:'missing',missing:['strength']});
  assert.deepEqual(pasteBlock(root,{id:'a',kind:'action',actionRef:'fly'},'root',ruleset).missing,['fly']);
  assert.deepEqual(pasteBlock(root,{id:'p',kind:'value',source:{kind:'field',fieldId:'damage'}},'root',ruleset).missing,['damage'],'a Content field only on an Item sheet');
  assert.ok(pasteBlock(root,{id:'p',kind:'value',source:{kind:'field',fieldId:'damage'}},'root',ruleset,{target:'item'}).root);
  assert.deepEqual(pasteBlock(root,{id:'r',kind:'repeater',query:{definitionTypeId:'spell'},columns:1,children:[]},'root',ruleset).missing,['spell']);
  const row=locate(root,'rank').node;
  assert.deepEqual(pasteBlock(root,row,'s',ruleset),{error:'place'},'a row value stays in a list');
  assert.ok(pasteBlock(root,row,'list',ruleset).root);
  // In a list of another family, a row output its Definitions do not give is missing.
  const pools={...ruleset,definitionTypes:[...ruleset.definitionTypes,{id:'res'}],definitions:[...ruleset.definitions,{id:'hp',definitionTypeId:'res',capabilities:['pool']}]};
  const withPools=pasteBlock(root,{id:'l',kind:'repeater',query:{definitionTypeId:'res'},columns:1,children:[]},'root',pools).root;
  assert.deepEqual(missingReferences(withPools,'repeater-1',pools),[]);
  assert.deepEqual(pasteBlock(withPools,row,'repeater-1',pools).missing,['value.final']);
});

test('the clipboard is shared by the editors of the session', ()=>{
  const store=new Map();
  globalThis.sessionStorage={getItem:key=>store.get(key)??null,setItem:(key,value)=>store.set(key,value),removeItem:key=>store.delete(key)};
  clearClipboard();
  assert.equal(readClipboard(),null);
  copyToClipboard({id:'t',kind:'text',textKey:'Hi'});
  assert.deepEqual(readClipboard(),{id:'t',kind:'text',textKey:'Hi'});
  assert.ok(store.size,'kept for the session');
  globalThis.sessionStorage={getItem(){throw new Error('denied');},setItem(){throw new Error('denied');},removeItem(){throw new Error('denied');}};
  copyToClipboard({id:'u',kind:'spacer'});
  assert.deepEqual(readClipboard(),{id:'u',kind:'spacer'},'storage refused: this window keeps it');
  clearClipboard();
  delete globalThis.sessionStorage;
});

test('the style brush gives each block the part of a style its kind takes', ()=>{
  assert.deepEqual(styleFor('text',{background:'panel',bold:true,gap:'row',label:'top',fill:'danger'}),{background:'panel',bold:true});
  assert.deepEqual(styleFor('section',{background:'panel',gap:'row',label:'top'}),{background:'panel',gap:'row'});
  assert.deepEqual(styleFor('value',{label:'top',fill:'danger'}),{label:'top',fill:'danger'});
  assert.equal(styleFor('spacer',undefined),undefined);
});

test('toolbar: one row of icon buttons, then "View as"; no automatic layout. Layers: a row per block', ()=>{
  const html=renderLayoutToolbarHTML({enabled:{copy:true,paste:true},brush:true});
  assert.deepEqual([...html.matchAll(/data-layout-command="(\w+)"/g)].map(m=>m[1]),['up','down','copy','paste','duplicate','brush','remove','undo','redo']);
  assert.match(html,/<\/div><label class="rta-sheet-editor__view-as">/,'"View as" on its own row, after the buttons');
  assert.doesNotMatch(html,/auto/);
  assert.match(html,/data-layout-command="brush"[^>]*aria-pressed="true"/);
  assert.match(html,/data-layout-command="up"[^>]*disabled/);
  const layers=renderLayoutLayersHTML(tree(),{selectedId:'v',collapsed:new Set(['list']),label:node=>node.labelKey||node.id,renaming:'s'});
  assert.deepEqual([...layers.matchAll(/data-layer-node="([\w-]+)"/g)].map(m=>m[1]),['root','s','v','list'],'a folded list hides its rows');
  assert.match(layers,/data-layer-node="v" aria-selected="true"/);
  assert.match(layers,/data-layer-rename="s" value="Main"/);
  assert.doesNotMatch(layers,/data-layer-node="root"[^>]*draggable/,'the sheet itself stays');
});

test('a sheet may set the size of its window; Foundry opens it at that size', ()=>{
  const base={id:'pc',nameKey:'PC'};
  assert.deepEqual(prepareSheetDefinition({...base,window:{width:900}}).window,{width:900});
  assert.equal(prepareSheetDefinition({...base,window:{}}).window,undefined);
  assert.equal('window' in prepareSheetDefinition(base),false);
  assert.throws(()=>prepareSheetDefinition({...base,window:{width:100}}),/window.width must be a whole number of pixels from 320/);
  assert.throws(()=>prepareSheetDefinition({...base,window:{depth:3}}),/window must be/);
  class Base{}
  const classes=[];
  const sheets=registerRulesetSheets({applications:{sheets:{ActorSheetV2:Base,ItemSheetV2:Base},apps:{DocumentSheetConfig:{registerSheet:(doc,scope,cls)=>classes.push(cls),unregisterSheet(){}}}}},{Actor:'Actor',Item:'Item'});
  sheets.registerNamed({sheetDefinitions:[{id:'pc',nameKey:'PC',target:'actor',window:{width:900,height:500}},{id:'npc',nameKey:'NPC',target:'actor'}]});
  const named=Object.fromEntries(classes.filter(cls=>cls.rtaSheetId).map(cls=>[cls.rtaSheetId,cls]));
  assert.deepEqual(named.pc.DEFAULT_OPTIONS,{position:{width:900,height:500}});
  assert.deepEqual(named.npc.DEFAULT_OPTIONS,{},'otherwise the base sheet\'s size');
});
