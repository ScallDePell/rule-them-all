// Audit de géométrie : alignement des contrôles et espacements entre blocs.
// Usage : node qa/layout-audit.mjs <dossier de HTML rendus> [largeur=900] [--json]
// Prérequis : npm i --no-save playwright-core ; RTA_CHROMIUM = chemin de Chromium.
import {chromium} from 'playwright-core';
import {readdirSync} from 'node:fs';
import {join} from 'node:path';

const [dir,widthArg='900',...flags]=process.argv.slice(2);
const width=Number(widthArg);
const browser=await chromium.launch({executablePath:process.env.RTA_CHROMIUM??'/usr/bin/chromium',args:['--no-sandbox','--allow-file-access-from-files']});
const report=[];

const AUDIT=()=>{
  const visible=el=>{const r=el.getBoundingClientRect();const s=getComputedStyle(el);return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'&&!el.closest('[hidden]')&&!el.parentElement?.closest('details:not([open])>:not(summary), details:not([open])>:not(summary) *')&&!(el.parentElement?.matches('details:not([open])')&&el.tagName!=='SUMMARY');};
  const path=el=>{const out=[];for(let n=el;n&&n!==document.body&&out.length<4;n=n.parentElement)out.unshift(n.tagName.toLowerCase()+[...n.classList].filter(c=>c.startsWith('rta-')||c==='form-group').map(c=>'.'+c).join(''));return out.join(' > ');};
  const round=v=>Math.round(v*10)/10;
  // Left edge of the first visual control inside a form row's control column.
  const controlLeft=row=>{
    const kids=[...row.children].filter(visible);
    if(kids.length<2)return null;
    const col=kids[1];
    if(col.getBoundingClientRect().top>=kids[0].getBoundingClientRect().bottom-1)return null; // stacked (compact) row
    const leaf=[...col.querySelectorAll('input:not([type=hidden]),select,textarea,button,.rta-select__trigger,label')].find(visible)??col;
    return {col:round(col.getBoundingClientRect().left),leaf:round(leaf.getBoundingClientRect().left),tag:leaf.tagName.toLowerCase()+(leaf.type?'['+leaf.type+']':'')};
  };
  const align=[];
  // One control column per window: every form row of an editor must start its control at the same x.
  for(const section of document.querySelectorAll('.rta-config-entry, .rta-configurator')){
    const rows=[...section.querySelectorAll('.rta-form-row')].filter(visible).filter(row=>!row.closest('.rta-select__panel')).map(row=>({row,c:controlLeft(row)})).filter(x=>x.c);
    if(rows.length<2)continue;
    const counts=new Map();for(const {c} of rows)counts.set(c.col,(counts.get(c.col)??0)+1);
    const column=[...counts].sort((a,b)=>b[1]-a[1])[0][0];
    for(const {row,c} of rows){
      if(Math.abs(c.col-column)>1)align.push({kind:'column',delta:round(c.col-column),label:row.firstElementChild?.textContent.trim().slice(0,30),path:path(row)});
      else if(Math.abs(c.leaf-c.col)>1)align.push({kind:'inset',delta:round(c.leaf-c.col),control:c.tag,label:row.firstElementChild?.textContent.trim().slice(0,30),path:path(row)});
    }
  }
  // Every labelled control, whatever its markup (.rta-form-row, <label> wrapping
  // its input, field-editor grids...), must start on the window's control column.
  const CONTROLS='input:not([type=hidden]):not([type=radio]),select:not(.rta-select__native),textarea,.rta-select__trigger';
  const labelTextRect=(owner,control)=>{
    const range=document.createRange();let rect=null;
    const walker=document.createTreeWalker(owner,NodeFilter.SHOW_TEXT,{acceptNode:n=>n.textContent.trim()&&!control.contains(n)&&!n.parentElement.closest('.rta-select, select, option, button, small.rta-hint')?NodeFilter.FILTER_ACCEPT:NodeFilter.FILTER_REJECT});
    for(let n=walker.nextNode();n;n=walker.nextNode()){if(!visible(n.parentElement))continue;range.selectNodeContents(n);const r=range.getBoundingClientRect();if(r.width&&(!rect||r.left<rect.left))rect=r;}
    return rect;
  };
  for(const section of document.querySelectorAll('.rta-config-entry')){
    const rows=[];
    for(const control of section.querySelectorAll(CONTROLS)){
      if(!visible(control)||control.closest('.rta-select__panel, table, .rta-picker__body, .rta-choice-list, .rta-binding-card__title, .rta-config-entry__check-group'))continue;
      if(control.matches('.rta-select__trigger')===false&&control.closest('.rta-select'))continue;
      const owner=control.closest('label, .rta-form-row, .form-group');if(!owner)continue;
      if([...owner.querySelectorAll(CONTROLS)].find(visible)!==control)continue; // the row's first control carries the column
      const text=labelTextRect(owner,control),c=control.getBoundingClientRect();
      if(!text||text.right>c.left+1||text.bottom<c.top||text.top>c.bottom)continue; // stacked or unlabelled
      rows.push({control,left:round(c.left),label:owner.textContent.trim().slice(0,30)});
    }
    if(rows.length<2)continue;
    const counts=new Map();for(const r of rows)counts.set(r.left,(counts.get(r.left)??0)+1);
    const column=[...counts].sort((a,b)=>b[1]-a[1])[0][0];
    for(const r of rows)if(Math.abs(r.left-column)>1)align.push({kind:'control',delta:round(r.left-column),control:r.control.tagName.toLowerCase(),label:r.label,path:path(r.control.parentElement)});
  }
  // Frame interior: a bordered frame keeps --rta-frame-pad between its border and
  // its last in-flow child, and on both inline sides.
  const frames=[];
  for(const frame of document.querySelectorAll('.rta-config-entry :is(fieldset, details[open], .rta-rule-builder, .rta-binding-card, .rta-section-color-config)')){
    if(!visible(frame))continue;
    const s=getComputedStyle(frame);if(parseFloat(s.borderBottomWidth)<1||parseFloat(s.borderLeftWidth)<1)continue;
    const kids=[...frame.children].filter(el=>visible(el)&&getComputedStyle(el).position!=='absolute'&&el.tagName!=='LEGEND');
    if(!kids.length)continue;
    const f=frame.getBoundingClientRect(),last=kids.at(-1).getBoundingClientRect();
    const bottom=round(f.bottom-parseFloat(s.borderBottomWidth)-last.bottom);
    const content=kids.filter(k=>k.tagName!=='SUMMARY'),left=content.length?round(Math.min(...content.map(k=>k.getBoundingClientRect().left))-f.left-parseFloat(s.borderLeftWidth)):null;
    frames.push({bottom,left,path:path(frame)});
  }
  // Vertical gaps between consecutive visible block siblings.
  const gaps=[];
  for(const parent of document.querySelectorAll('.rta-config-entry *, .rta-configurator *')){
    const kids=[...parent.children].filter(el=>visible(el)&&!['inline','inline-block','contents'].includes(getComputedStyle(el).display)&&getComputedStyle(el).position!=='absolute');
    for(let i=1;i<kids.length;i++){
      const a=kids[i-1].getBoundingClientRect(),b=kids[i].getBoundingClientRect();
      if(b.top<a.bottom-1||Math.abs(a.left-b.left)>2)continue; // only stacked siblings
      gaps.push({gap:round(b.top-a.bottom),between:path(kids[i-1]).split(' > ').pop()+' | '+path(kids[i]).split(' > ').pop(),parent:path(parent)});
    }
  }
  // Foundry draws checkboxes with ::before/::after icons sized --checkbox-size:
  // the input box must have exactly that size or the icon layers drift apart.
  const boxes=[];
  for(const box of document.querySelectorAll('input[type=checkbox]')){
    if(!visible(box))continue;
    const r=box.getBoundingClientRect(),icon=parseFloat(getComputedStyle(box,'::before').width);
    if(Math.abs(r.width-icon)>0.5||Math.abs(r.height-icon)>0.5)boxes.push({box:round(r.width)+'x'+round(r.height),icon,path:path(box.parentElement)});
  }
  return {align,gaps,boxes,frames};
};

for(const file of readdirSync(dir).filter(f=>f.endsWith('.html')).sort()){
  const page=await browser.newPage({viewport:{width,height:900}});
  await page.goto('file://'+join(dir,file));await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(150);
  report.push({file,...await page.evaluate(AUDIT)});await page.close();
}
await browser.close();
if(flags.includes('--json')){console.log(JSON.stringify(report));process.exit(0);}
const hist=new Map();for(const r of report)for(const g of r.gaps)hist.set(g.gap,(hist.get(g.gap)??0)+1);
console.log('Vertical gaps (px: count):',[...hist].sort((a,b)=>b[1]-a[1]).map(([g,n])=>`${g}:${n}`).join(' '));
const boxCount=new Map();for(const r of report)for(const b of r.boxes){const k=`${b.box} vs ${b.icon} | ${b.path}`;boxCount.set(k,(boxCount.get(k)??0)+1);}
for(const [k,n] of boxCount)console.log('checkbox',n,k);
const fb=new Map();for(const r of report)for(const f of r.frames){const k=`bottom ${f.bottom} left ${f.left} | ${f.path}`;fb.set(k,(fb.get(k)??0)+1);}
for(const [k,n] of [...fb].sort())if(!/bottom 12 left 12 /.test(k))console.log('frame',n,k);
for(const r of report)for(const a of r.align)console.log(r.file,a.kind,a.delta,a.control??'',a.label,'|',a.path);
