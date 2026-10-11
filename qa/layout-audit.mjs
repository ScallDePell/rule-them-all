// Audit de géométrie : alignement des contrôles et espacements entre blocs.
// Usage : node qa/layout-audit.mjs <dossier de HTML rendus> [largeur=900] [--json]
// Prérequis : npm i --no-save playwright-core ; RTA_CHROMIUM = chemin de Chromium.
import {chromium} from 'playwright-core';
import {readdirSync} from 'node:fs';
import {join} from 'node:path';

const [dir,widthArg='900',...flags]=process.argv.slice(2);
const width=Number(widthArg);
const browser=await chromium.launch({executablePath:process.env.RTA_CHROMIUM??'/usr/bin/chromium',args:['--no-sandbox']});
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
  return {align,gaps,boxes};
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
for(const r of report)for(const a of r.align)console.log(r.file,a.kind,a.delta,a.control??'',a.label,'|',a.path);
