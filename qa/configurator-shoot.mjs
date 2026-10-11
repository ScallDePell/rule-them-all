// Capture PNG + styles calculés de chaque HTML rendu, à 620/900/1250 px.
// RTA_CHROMIUM : chemin de Chromium (défaut /usr/bin/chromium).
import {chromium} from 'playwright-core';import {readdirSync,writeFileSync} from 'node:fs';import {join} from 'node:path';
const [dir]=process.argv.slice(2);const b=await chromium.launch({executablePath:process.env.RTA_CHROMIUM??'/usr/bin/chromium',args:['--no-sandbox','--allow-file-access-from-files']});
let errors=0;
const dump=()=>[...document.querySelectorAll('body *')].map((el,i)=>{const s=getComputedStyle(el);const o={};for(const k of s)o[k]=s.getPropertyValue(k);return [i+':'+el.tagName+'.'+[...el.classList].join('.'),o]});
for(const f of readdirSync(dir).filter(f=>f.endsWith('.html')))for(const w of [620,900,1250]){
  const p=await b.newPage({viewport:{width:w,height:860}});p.on('pageerror',e=>{errors++;console.error(f,e.message)});
  await p.goto('file://'+join(dir,f));await p.evaluate(()=>document.fonts.ready);await p.waitForTimeout(150);const base=f.replace('.html',`-${w}`);
  await p.screenshot({path:join(dir,base+'.png'),fullPage:true});
  writeFileSync(join(dir,base+'.styles.json'),JSON.stringify(await p.evaluate(dump)));await p.close();}
await b.close();console.log('shots done, page errors',errors);
