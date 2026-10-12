import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareLayout} from '../src/configurator/layout-contract.mjs';
import {newNode, previewView, updateNode} from '../src/configurator/sheet-layout-model.mjs';
import {sheetStyle} from '../src/ui/sheet-style.mjs';
import {renderSheetHTML, renderLayoutPreviewHTML} from '../src/ui/sheet-markup.mjs';

const tree=(style,kind='section')=>({id:'root',kind:'grid',children:[kind==='section'?{id:'s',kind,labelKey:'S',columns:1,children:[],style}:{id:'s',kind,textKey:'',style}]});

test('a style is a closed choice: tones or own colors, opacity, font, size, emphasis, alignment, margins, labels', ()=>{
  const ok=prepareLayout(tree({color:'accent',background:'#224466',opacity:60,border:'none',image:'worlds/my world/parchment (1).webp',font:'Modesto Condensed',size:'large',bold:true,italic:true,align:'center',padding:'tight',gap:'block'}));
  assert.equal(ok.children[0].style.image,'worlds/my world/parchment (1).webp');
  assert.equal(prepareLayout(tree({bold:false,italic:null})).children[0].style,undefined,'nothing set: no style kept');
  for(const [style,message,kind] of [[{color:'red'},/tone or a #rrggbb/],[{color:'none'},/tone or a #rrggbb/],[{opacity:101},/0 to 100/],[{opacity:.5},/0 to 100/],
    [{image:'a"b'},/file path/],[{font:'x;}body{'},/font name/],[{size:'giant'},/small, normal/],[{align:'justify'},/start, center, end/],
    [{padding:'2px'},/none, tight/],[{label:'top'},/on a value/],[{gap:'row'},/only on containers/,'text'],[{css:'color:red'},/unsupported field: css/]])
    assert.throws(()=>prepareLayout(tree(style,kind)),message,JSON.stringify(style));
  assert.throws(()=>prepareLayout({id:'root',kind:'grid',children:[{id:'i',kind:'image',src:'x<y'}]}),/src must be a file path/);
  assert.throws(()=>prepareLayout({id:'root',kind:'grid',children:[{id:'i',kind:'image',src:'',fit:'stretch'}]}),/fit must be/);
});

test('a style is written with the module tokens; an own color fades with its opacity; a section opacity alone fades its usual background', ()=>{
  assert.deepEqual(sheetStyle({kind:'section',style:{color:'accent',background:'#224466',opacity:60,size:'large',gap:'tight',font:'Amiri'}}),
    {classes:['rta-sheet-colored','rta-sheet-fonted'],css:['color: var(--rta-color-accent-warm)','background-color: color-mix(in srgb, #224466 60%, transparent)','font-family: "Amiri", var(--font-body)','font-size: var(--rta-type-heading)'],gap:'var(--rta-gap-tight)'});
  assert.deepEqual(sheetStyle({kind:'section',style:{opacity:30}}).css,['background-color: color-mix(in srgb, var(--rta-color-surface-option-light) 30%, transparent)']);
  assert.deepEqual(sheetStyle({kind:'value',style:{background:'none',border:'danger',label:'top',align:'end',padding:'none'}}),
    {classes:['rta-sheet-align-end','rta-sheet-value--label-top'],css:['background: none','border: var(--rta-frame-border) solid var(--rta-color-danger)','border-radius: var(--rta-radius-panel)','text-align: end','padding: 0'],gap:null});
});

test('played sheet and editor canvas show the same style; an image block without its picture shows only in the editor', ()=>{
  const view={sheetId:'s',root:{id:'root',kind:'grid',columns:2,style:{gap:'block'},children:[
    {id:'sec',kind:'section',label:'Stats',columns:1,span:2,style:{background:'dark',opacity:50,italic:true},children:[{id:'v',kind:'value',label:'Str',value:3,valueType:'number',write:null,style:{label:'hidden'}}]},
    {id:'pic',kind:'image',src:'banner.webp',fit:'contain',height:'small',style:{opacity:80}}]}};
  const html=renderSheetHTML(view,{name:'Hero'});
  assert.match(html,/<div class="rta-sheet-grid" style="--rta-sheet-columns: 2; gap: var\(--rta-gap-block\)">/);
  assert.match(html,/<section class="rta-sheet-section" style="--rta-sheet-span: 2; background-color: color-mix\(in srgb, var\(--rta-color-inverse-text\) 50%, transparent\); font-style: italic">/);
  assert.match(html,/class="rta-sheet-value rta-sheet-value--label-hidden"/);
  assert.match(html,/<div class="rta-sheet-image" style="--rta-sheet-image-height: 4rem; --rta-sheet-image-fit: contain; opacity: 0.8"><img src="banner.webp" alt=""><\/div>/);
  const ruleset={definitions:[],contentTypes:[],contentTemplates:[]};
  let root=prepareLayout({id:'root',kind:'grid',children:[]});
  const image=newNode('image',root,ruleset);
  root=updateNode(root,'root',{style:{background:'#101010'}});
  root=prepareLayout({...root,children:[image]});
  assert.match(renderLayoutPreviewHTML(previewView(root,ruleset),{t:k=>k}),/rta-sheet-image rta-sheet-image--empty[^>]*data-layout-node="image-1"><i class="fa-solid fa-image"><\/i> RTA.SheetEditor.NoImage/);
  assert.doesNotMatch(renderSheetHTML({sheetId:'s',root:{id:'root',kind:'grid',children:[{id:'i',kind:'image',src:''}]}}),/rta-sheet-image/);
  assert.match(renderLayoutPreviewHTML(previewView(root,ruleset),{t:k=>k}),/style="--rta-sheet-columns: 1; background-color: #101010"/);
});
