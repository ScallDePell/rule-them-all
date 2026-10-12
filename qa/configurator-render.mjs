// Rend 13 vues du configurateur en HTML statique (Handlebars réel + API réelle).
// Prérequis hors dépôt : npm i --no-save handlebars playwright-core
// Usage: node qa/configurator-render.mjs <repoRoot> <outDir>
import {readFileSync,writeFileSync,mkdirSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import Handlebars from 'handlebars';
const [root,out]=process.argv.slice(2);mkdirSync(out,{recursive:true});
const en=JSON.parse(readFileSync(join(root,'lang/en.json'),'utf8'));
const lookup=key=>key.split('.').reduce((o,k)=>o?.[k],en)??key;
class ApplicationV2{async _prepareContext(){return {}} render(){}}
globalThis.foundry={applications:{api:{ApplicationV2,HandlebarsApplicationMixin:B=>B,DialogV2:class{}}}};
const settings=new Map();
globalThis.game={i18n:{lang:'en',localize:lookup,format:(k,d)=>lookup(k).replace(/\{(\w+)\}/g,(_,n)=>d?.[n]??'')},settings:{get:(m,k)=>settings.get(k),set:async(m,k,v)=>settings.set(k,v),register(){}},
  system:{documentTypes:{Actor:['hero','foe'],Item:['gear','power']}},actors:{contents:[]},user:{isGM:true}};
const imp=rel=>import(pathToFileURL(join(root,rel)).href);
const {createConfiguratorAPI}=await imp('src/configurator/configurator-api.mjs');
const {emptyStorageSnapshot}=await imp('src/configurator/configurator-storage.mjs');
class Storage{snapshot=emptyStorageSnapshot();async load(){return structuredClone(this.snapshot)}async save(d){this.snapshot=structuredClone(d)}}
const storage=new Storage(),api=await createConfiguratorAPI(storage);
globalThis.game.ruleThemAll={configurator:api};
const v=(await api.createRuleset({id:'qa',nameKey:'QA Ruleset',descriptionKey:'Fixture used for visual regression only.',version:'1.0.0'})).versionId;
await api.createRuleset({id:'qa2',nameKey:'Second Ruleset',version:'2.0.0'});
await api.createTag(v,{id:'tag-a',nameKey:'Tag Alpha',color:'#3a7bd5'});
await api.createTag(v,{id:'tag-b',nameKey:'Tag Beta'});
await api.createCategory(v,{id:'cat-core',nameKey:'Core'});
await api.createCategory(v,{id:'cat-extra',nameKey:'Extra'});
await api.registerDefinitionType(v,{id:'stat',key:'stat',nameKey:'Stat',color:'#b8572e',allowedCapabilities:['value','pool','collection'],defaultCapabilities:['value','pool'],requiredCapabilities:['value'],fields:{abbreviation:{id:'abbreviation',name:'Abbreviation',valueType:'string',cardinality:'one',required:true,defaultValue:'STR'}},constraints:[{kind:'required',field:'abbreviation'}]});
await api.registerDefinitionType(v,{id:'skill',key:'skill',nameKey:'Skill',allowedCapabilities:['value'],defaultCapabilities:['value'],requiredCapabilities:[],fields:{}});
for(const [i,n] of ['Vigor','Focus','Grace','Wits','Resolve'].entries())await api.createDefinition(v,{id:'d'+i,key:'d'+i,nameKey:n,descriptionKey:'A sample definition with a description long enough to wrap on narrow tiles.',definitionTypeId:'stat',capabilities:i?['value']:['value','pool','collection'],...(i?{}:{slots:{pool:[{id:'hp',minimum:{literal:0},maximum:{literal:10},overflowPolicy:'reject'}],collection:[{id:'notes',entryMode:'value',allowedKinds:['string'],maximumEntries:5}]}}),tags:i%2?['tag-a']:['tag-b'],categories:i%2?['cat-core']:['cat-extra'],data:{}});
await api.createDefinition(v,{id:'s1',key:'s1',nameKey:'Climb',definitionTypeId:'skill',capabilities:['value'],data:{}});
await api.createContentType(v,{id:'gear',nameKey:'Gear',storageKind:'item',documentSubtype:'gear',runtimeMode:'unique'});
await api.createContentTemplate(v,{id:'rope',nameKey:'Rope',contentTypeId:'gear'});
await api.createParameter(v,{id:'p1',nameKey:'Base',valueType:'number',value:2});
await api.createFormula(v,{id:'f1',nameKey:'Total',resultType:'number',expression:{type:'add',args:[{type:'literal',value:1},{type:'parameter',id:'p1'}]}});
await api.createCondition(v,{id:'c1',nameKey:'Is ready',expression:{type:'literal',value:true}});
await api.createAction(v,{id:'a1',nameKey:'Strike',conditionRefs:['c1'],costEffectRefs:[],effectRefs:[]});
await api.createModifier(v,{id:'m1',nameKey:'Blessed',targetRef:{objectKind:'definition',objectId:'d0',capabilityId:'value',outputId:'value.final'},operation:'add',valueSource:{kind:'literal',value:2},conditionRefs:['c1'],stacking:{mode:'highest',group:'blessing'}});
await api.createDuration(v,{id:'du1',nameKey:'Three rounds',mode:'fixed',amount:3,unit:'round'});
await api.createEventType(v,{id:'ev1',nameKey:'Damage taken',payloadFields:{amount:{name:'Amount',valueType:'number',required:true,nullable:false},kind:{name:'Kind',valueType:'string',required:false,nullable:false}}});
await api.createTrigger(v,{id:'tr1',nameKey:'On heavy fire damage',eventTypeId:'ev1',eventFilter:{payloadMatches:{kind:'fire'}},conditionRefs:[],actionRefs:['a1']});
await api.createPermissionPolicy(v,{id:'pp1',nameKey:'Players act',scope:{objectKind:'action',objectId:null},defaultEffect:'DENY',rules:[{id:'r1',effect:'ALLOW',operations:['execute'],roles:['player'],minimumOwnership:'owner',priority:0,messageKey:''}]});
await api.createRoll(v,{id:'r1',nameKey:'d20',formula:'1d20',data:{}});
for(const [id,nameKey] of [['o-crit','Critical'],['o-hit','Hit'],['o-miss','Miss']])await api.createOutcome(v,{id,nameKey,resultKey:id,conditionRef:'c1'});
await api.createTest(v,{id:'t1',nameKey:'Attack',rollRef:'r1',targetValue:12,outcomeRefs:['o-crit','o-hit'],fallbackOutcomeRef:'o-miss'});
await api.createTable(v,{id:'tb1',nameKey:'Critical hits',rollRef:'r1',rows:[{id:'low',labelKey:'Scratch',min:null,max:10,actionRefs:['a1']},{id:'high',labelKey:'Severed limb',min:11,max:null,actionRefs:[]}]});
await api.createAction(v,{id:'a2',nameKey:'Swing',testRef:'t1',conditionRefs:[],costEffectRefs:[],effectRefs:[],tableRef:'tb1',outcomeMappings:[{outcomeId:'o-miss',block:true},{outcomeId:'o-crit',actionRefs:['a1']}]});
// Harness-only copy exposing the private view state.
const src=readFileSync(join(root,'src/configurator/configurator-app.mjs'),'utf8')
  .replace('#view = "general";','#view = globalThis.__qa.view;').replace('#displayMode = "tiles";','#displayMode = globalThis.__qa.mode;').replace('#selected = "";','#selected = globalThis.__qa.selected;');
const tmp=join(root,'src/configurator/.qa-configurator-app.mjs');writeFileSync(tmp,src);
let ConfiguratorApp;try{({ConfiguratorApp}=await import(pathToFileURL(tmp).href));}finally{rmSync(tmp);}
Handlebars.registerHelper('localize',(k,o)=>{const t=lookup(String(k));return o?.hash&&Object.keys(o.hash).length?t.replace(/\{(\w+)\}/g,(_,n)=>o.hash[n]??''):t;});
const tpl=Handlebars.compile(readFileSync(join(root,'templates/configurator/configurator.hbs'),'utf8'));
const foundryCss=process.env.RTA_FOUNDRY_CSS?readFileSync(process.env.RTA_FOUNDRY_CSS,'utf8')+'\n':'';
const css=foundryCss+JSON.parse(readFileSync(join(root,'module.json'),'utf8')).styles.map(p=>readFileSync(join(root,p),'utf8')).join('\n');
const views=[['rulesets','',''],['general',v,'general'],['definitionTypes',v,'definitionTypes'],['definitions-tiles',v,'definitions:stat'],['definitions-lines',v,'definitions:stat','lines'],
 ['contentTypes',v,'contentTypes'],['content',v,'content:gear'],['formulas',v,'formulas'],['actions',v,'actions'],['tags',v,'tags'],['categories',v,'categories'],['dependencies',v,'dependencies'],['runtimeLab',v,'runtimeLab'],['sheets',v,'sheetDefinitions']];
for(const [name,selected,view,mode='tiles'] of views){
  globalThis.__qa={selected,view:view||'general',mode};
  const app=new ConfiguratorApp();const ctx=await app._prepareContext({});
  const html=`<!doctype html><html lang="en"><meta charset="utf-8"><style>${css}\nbody{margin:0;font-family:sans-serif;font-size:14px}#rta-configurator{position:relative;width:100%;max-width:none;box-sizing:border-box;height:860px;display:flex;flex-direction:column}</style><body class="theme-dark"><div id="rta-configurator" class="application theme-dark"><div class="window-content" style="display:flex;flex-direction:column;min-height:0;overflow:hidden;height:100%">${tpl(ctx)}</div></div></body></html>`;
  writeFileSync(join(out,name+'.html'),html);
}
console.log('rendered',views.length);

// Entry editors: existing entries where the fixture has one, blank editors otherwise.
const {ConfiguratorEntryEditor}=await imp('src/configurator/configurator-entry-editor.mjs');
const editorTpl=Handlebars.compile(readFileSync(join(root,'templates/configurator/entry-editor.hbs'),'utf8'));
const selectUrl=pathToFileURL(join(root,'src/ui/rta-select.mjs')).href;
const editors=[['ruleset',v],['definitionType','stat'],['definition','d0'],['contentType','gear'],['contentTemplate','rope'],['parameter','p1'],['formula','f1'],['condition','c1'],['action','a2'],['tag','tag-a'],['category','cat-core'],['test','t1'],['modifier','m1'],['duration','du1'],['table','tb1'],['trigger','tr1'],['permissionPolicy','pp1'],['eventType','ev1'],
 ...['formulaBinding','roll','outcome','effect','sheetDefinition','creationSystem','progressionSystem'].map(kind=>[kind,null])];
for(const [kind,id] of editors){
  const editor=new ConfiguratorEntryEditor({api,versionId:v,kind,id,definitionTypeId:kind==='definition'?'stat':null,contentTypeId:kind==='contentTemplate'?'gear':null});
  const ctx=await editor._prepareContext({});
  const html=`<!doctype html><html lang="en"><meta charset="utf-8"><style>${css}\nbody{margin:0;font-family:sans-serif;font-size:14px}.application{position:relative;width:100%;max-width:none;box-sizing:border-box}</style><body class="theme-dark"><div class="application theme-dark"><section class="window-content">${editorTpl(ctx)}</section></div><script type="module">for(const d of document.querySelectorAll('details'))d.open=true;import('${selectUrl}').then(({RTASelect})=>RTASelect.enhance(document.body));</script></body></html>`;
  writeFileSync(join(out,'editor-'+kind+'.html'),html);
}
console.log('rendered editors',editors.length);
// Fixture for qa/dynamic-markup-audit.mjs, which replays the editors' own scripts in a browser.
writeFileSync(join(out,'fixture.json'),JSON.stringify({versionId:v,snapshot:storage.snapshot,editors:editors.map(([kind,id])=>({kind,id,definitionTypeId:kind==='definition'?'stat':null,contentTypeId:kind==='contentTemplate'?'gear':null}))}));
