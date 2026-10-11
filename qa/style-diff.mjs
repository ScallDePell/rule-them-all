// node qa/style-diff.mjs <avant> <après> : compare les styles calculés (hors variables --*) et les PNG.
import {readdirSync,readFileSync,existsSync} from 'node:fs';import {join} from 'node:path';
const [a,b]=process.argv.slice(2);let diffs=0,files=0,png=0;const summary=new Map();
for(const f of readdirSync(a).filter(f=>f.endsWith('.styles.json'))){
  files++;const A=JSON.parse(readFileSync(join(a,f)));const B=JSON.parse(readFileSync(join(b,f)));
  if(A.length!==B.length){console.log(f,'element count',A.length,B.length);diffs++;continue;}
  A.forEach(([key,sa],i)=>{const [kb,sb]=B[i];for(const k of new Set([...Object.keys(sa),...Object.keys(sb)]))if(!k.startsWith('--')&&sa[k]!==sb[k]){diffs++;const id=`${key.replace(/^\d+:/,'')} ${k}: ${sa[k]} -> ${sb[k]}`;summary.set(id,(summary.get(id)??0)+1);}});
}
for(const f of readdirSync(a).filter(f=>f.endsWith('.png')))if(!existsSync(join(b,f))||!readFileSync(join(a,f)).equals(readFileSync(join(b,f))))png++;
console.log(`style files ${files}, property diffs ${diffs}, differing PNGs ${png}`);
for(const [k,n] of [...summary].sort((x,y)=>y[1]-x[1]).slice(0,40))console.log(n,k);
