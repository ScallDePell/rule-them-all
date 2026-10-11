/** RTA architecture gate. Run: node qa/architecture-audit.mjs --strict [--json]
 * Deliberately checks CONTRACTS rather than cosmetic code complexity.
 */
import {readFileSync,readdirSync,existsSync} from 'node:fs';
import {resolve,relative,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const scan=(dir)=>readdirSync(dir,{withFileTypes:true}).flatMap(ent=>ent.isDirectory()?scan(join(dir,ent.name)):[join(dir,ent.name)]);
const norm=(p)=>relative(root,p).replaceAll('\\','/');
const data=(p)=>readFileSync(p,'utf8');
const srcFiles=scan(join(root,'src')).filter(p=>p.endsWith('.mjs'));
const viewFiles=[...scan(join(root,'templates')),...scan(join(root,'styles'))].filter(p=>/\.(?:hbs|css)$/.test(p));
const files=[...srcFiles,...viewFiles,join(root,'rule-them-all.mjs')];
const violations=[];const notes=[];
const add=(type,file,detail)=>violations.push({type,file:norm(file),detail});
const forbiddenLegacy=/rwf-/i;
for(const file of files){
 const content=data(file),name=norm(file);
 if(name!=='src/core/module-contract.mjs'&&forbiddenLegacy.test(content))add('legacy-ui-namespace',file,'rwf-* token outside compatibility contract');
 if(name!=='src/core/module-contract.mjs'&&/\b(?:const|let|var)\s+MODULE_ID\s*=/.test(content))add('duplicated-module-id',file,'MODULE_ID must be imported from src/core/module-contract.mjs');
 if(/\[\s*["']character["']\s*,\s*["'](?:pc|npc)["']/.test(content))add('hardcoded-system-actor-types',file,'Actor subtypes belong to the active Game System');
 if(/\b(?:game\.system\.id|game\.system\?\.id)\s*===?\s*["'](?:rwf|real-world-fantasy)["']/i.test(content))add('game-specific-branch',file,'RTA must not specialize for the RWF Game System');
 if(file.endsWith('.mjs')){
  // Static imports/exports are resolvable; bare specifiers are delegated to Node/Foundry.
  const imports=[...content.matchAll(/\b(?:from\s*|import\s*)["'](\.[^"']+)["']/g)];
  for(const match of imports){const raw=match[1],target=resolve(dirname(file),raw);if(!existsSync(target)&&!existsSync(target+'.mjs')&&!existsSync(join(target,'index.mjs')))add('broken-relative-import',file,raw);}
 }
}
const contract=data(join(root,'src/core/module-contract.mjs'));
if(/RULESET_PACKAGE_FORMATS = Object\.freeze\(\[[^\]]*rwf/.test(contract)||/["']rwf[A-Z]/.test(contract))add('rwf-identifiers',join(root,'src/core/module-contract.mjs'),'RTA writes only RTA package formats and ruleThemAll* hooks');
for(const locale of ['fr','en']){
 const file=join(root,'lang',locale+'.json');const dict=JSON.parse(data(file));
 if('RWF' in dict)add('game-specific-locales',file,'RWF root localization leaks into the generic module');
 if(dict.TYPES?.Actor)add('host-document-types',file,'RTA may not declare Actor types owned by a Foundry Game System');
 for(const key of ['CreationSource','DynamicUI','FamilyColor'])if(!dict.RTA?.[key])add('missing-locales',file,`RTA.${key} missing`);
}
// Display-time styles must use the module namespace; historical docs/changelogs are excluded.
const stylesheets=JSON.parse(data(join(root,'module.json'))).styles;
const css=stylesheets.map(rel=>data(join(root,rel))).join('\n');
if(!css.includes('.rta-'))add('missing-rta-components',join(root,'module.json'),'canonical component selectors missing');
const entry=data(join(root,'src/configurator/configurator-entry-editor.mjs'));
if(!entry.includes('entry-operations.mjs'))add('routing-not-centralized',join(root,'src/configurator/configurator-entry-editor.mjs'),'entry dispatch must use the operations registry');
for(const rel of ['src/ui/entry-editor-markup.mjs','src/ui/picker-markup.mjs','src/core/system-document-types.mjs','src/runtime/runtime-lab-fixtures.mjs','RTA-ARCHITECTURE-CANONIQUE.md']){
 if(!existsSync(join(root,rel)))add('missing-architecture-contract',join(root,rel),'expected architectural boundary missing');
}
// These are indicators for review, NOT enforced claims of full architectural cleanliness.
const sizes=srcFiles.map(file=>({file:norm(file),lines:data(file).split('\n').length})).sort((a,b)=>b.lines-a.lines);
if(sizes[0].lines>500)notes.push(`Largest production module remains ${sizes[0].file} (${sizes[0].lines} lines): further decomposition recommended.`);
const out={status:violations.length?'FAIL':'PASS',scanned:{productionModules:srcFiles.length,viewAssets:viewFiles.length},violations,notes,largestModules:sizes.slice(0,5)};
if(process.argv.includes('--json'))console.log(JSON.stringify(out,null,2));
else{
 console.log(`RTA architecture audit: ${out.status} | ${srcFiles.length} modules | ${viewFiles.length} templates/styles | ${violations.length} violation(s)`);
 for(const v of violations)console.error(` - ${v.type} (${v.file}): ${v.detail}`);
 for(const n of notes)console.log(` NOTE: ${n}`);
}
if(process.argv.includes('--strict')&&violations.length)process.exitCode=1;
