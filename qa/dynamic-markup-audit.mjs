// Replays each entry editor's own scripts in a browser: binds the editor to the
// rendered page, clicks every "add…" button twice, then reports vertical gaps
// outside the 4/8/12px scale. Covers markup that only JavaScript creates.
// Usage: node qa/configurator-render.mjs <repoRoot> <dir> && node qa/dynamic-markup-audit.mjs <repoRoot> <dir> [width]
// RTA_CHROMIUM=<chromium path>; RTA_SHOTS=<dir> also saves a full-page screenshot per editor.
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {chromium} from 'playwright-core';
const [root,dir,width='760']=process.argv.slice(2);
const fixture=JSON.parse(readFileSync(join(dir,'fixture.json'),'utf8'));
const en=JSON.parse(readFileSync(join(root,'lang/en.json'),'utf8'));
const url=rel=>pathToFileURL(join(root,rel)).href;
const browser=await chromium.launch({executablePath:process.env.RTA_CHROMIUM,args:['--no-sandbox','--allow-file-access-from-files']});
let offenders=0;
for(const editor of fixture.editors){
  const page=await browser.newPage({viewport:{width:Number(width),height:900}});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(pathToFileURL(join(dir,`editor-${editor.kind}.html`)).href);
  const report=await page.evaluate(async({editor,fixture,en,urls})=>{
    const lookup=key=>key.split('.').reduce((o,k)=>o?.[k],en)??key;
    class ApplicationV2{constructor(){} async _prepareContext(){return {};} async _onRender(){} render(){} close(){} setPosition(){}}
    globalThis.foundry={applications:{api:{ApplicationV2,HandlebarsApplicationMixin:B=>B,DialogV2:class{}}}};
    globalThis.game={i18n:{lang:'en',localize:lookup,format:(k,d)=>lookup(k).replace(/\{(\w+)\}/g,(_,n)=>d?.[n]??'')},settings:{get(){},set:async()=>{},register(){}},system:{documentTypes:{Actor:['hero','foe'],Item:['gear','power']}},actors:{contents:[]},user:{isGM:true}};
    const {createConfiguratorAPI}=await import(urls.api);
    const {ConfiguratorEntryEditor}=await import(urls.editor);
    let snapshot=structuredClone(fixture.snapshot);
    const api=await createConfiguratorAPI({load:async()=>structuredClone(snapshot),save:async next=>{snapshot=structuredClone(next);}});
    const app=new ConfiguratorEntryEditor({api,versionId:fixture.versionId,...editor});
    await app._prepareContext({});
    const element=document.querySelector('.application');
    Object.defineProperty(app,'element',{value:element});
    await app._onRender({}, {});
    const adds=[...element.querySelectorAll('[data-action^="add"]')];
    for(const button of adds){button.click();await new Promise(r=>setTimeout(r,30));button.click();await new Promise(r=>setTimeout(r,30));}
    for(const d of element.querySelectorAll('details'))d.open=true;
    await new Promise(r=>setTimeout(r,100));
    const skip=['LEGEND','SUMMARY','BR','OPTION','TR','TBODY','THEAD','TD','TH'];
    const name=el=>{const parts=[];for(let n=el;n&&n!==element&&parts.length<3;n=n.parentElement)parts.unshift(n.tagName.toLowerCase()+(typeof n.className==='string'&&n.className.trim()?'.'+n.className.trim().split(/\s+/)[0]:''));return parts.join('>');};
    const found=new Set();
    for(const box of element.querySelectorAll('.rta-config-entry *')){
      if(box.closest('.rta-select__panel, .rta-select__options, .rta-choice-list, table'))continue;
      const kids=[...box.children].filter(k=>{const s=getComputedStyle(k),r=k.getBoundingClientRect();return r.height>0&&s.position!=='absolute'&&!['inline','inline-block','contents','none'].includes(s.display)&&!skip.includes(k.tagName);});
      for(let i=1;i<kids.length;i++){
        const a=kids[i-1].getBoundingClientRect(),b=kids[i].getBoundingClientRect();
        if(b.top<a.bottom-1)continue; // side by side
        const gap=Math.round(b.top-a.bottom);
        if(![4,8,12].includes(gap))found.add(`${gap}px in ${name(box)}: ${name(kids[i-1])} -> ${name(kids[i])}`);
      }
    }
    return {adds:adds.map(b=>b.dataset.action),gaps:[...found]};
  },{editor,fixture,en,urls:{api:url('src/configurator/configurator-api.mjs'),editor:url('src/configurator/configurator-entry-editor.mjs')}});
  if(process.env.RTA_SHOTS){
    // Unroll the editor's own scroll area so the whole form is captured.
    await page.addStyleTag({content:'.application,.window-content,.rta-config-entry,.rta-config-entry form,.rta-config-entry__scroll{height:auto!important;max-height:none!important;overflow:visible!important}'});
    await page.screenshot({path:join(process.env.RTA_SHOTS,`dynamic-${editor.kind}.png`),fullPage:true});
  }
  offenders+=report.gaps.length+errors.length;
  console.log(`${editor.kind}: ${report.adds.length} add action(s)${report.adds.length?` [${report.adds.join(', ')}]`:''}`);
  for(const line of [...errors.map(e=>`error: ${e}`),...report.gaps])console.log(`  ${line}`);
  await page.close();
}
await browser.close();
console.log(offenders?`${offenders} offender(s)`:'PASS');
process.exitCode=offenders?1:0;
