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
await api.registerDefinitionType(v,{id:'stat',key:'stat',nameKey:'Stat',color:'#b8572e',allowedCapabilities:['value','pool','collection'],defaultCapabilities:['value','pool'],requiredCapabilities:['value'],valueBounds:{minimum:{literal:0},maximum:{literal:5}},fields:{abbreviation:{id:'abbreviation',name:'Abbreviation',valueType:'string',cardinality:'one',required:true,defaultValue:'STR'}},constraints:[{kind:'required',field:'abbreviation'}]});
await api.registerDefinitionType(v,{id:'skill',key:'skill',nameKey:'Skill',allowedCapabilities:['value','state'],defaultCapabilities:['value'],requiredCapabilities:[],fields:{}});
for(const [i,n] of ['Vigor','Focus','Grace','Wits','Resolve'].entries())await api.createDefinition(v,{id:'d'+i,key:'d'+i,nameKey:n,descriptionKey:'A sample definition with a description long enough to wrap on narrow tiles.',definitionTypeId:'stat',capabilities:i?['value']:['value','pool','collection'],...(i?{}:{slots:{pool:[{id:'hp',minimum:{literal:0},maximum:{literal:10},overflowPolicy:'reject'}],collection:[{id:'notes',entryMode:'value',allowedKinds:['string'],maximumEntries:5}]}}),tags:i%2?['tag-a']:['tag-b'],categories:i%2?['cat-core']:['cat-extra'],data:{}});
await api.createDefinition(v,{id:'s1',key:'s1',nameKey:'Climb',definitionTypeId:'skill',capabilities:['value'],data:{}});
await api.createContentType(v,{id:'gear',nameKey:'Gear',storageKind:'item',documentSubtype:'gear',runtimeMode:'unique'});
await api.createDefinition(v,{id:'s2',key:'s2',nameKey:'Tired',definitionTypeId:'skill',capabilities:['value','state'],data:{}});
await api.createContentTemplate(v,{id:'rope',nameKey:'Rope',contentTypeId:'gear',choiceGroups:[{id:'cg1',name:'Rope skill',min:1,max:1,options:[{id:'o1',operation:'grant',targetRef:{objectKind:'definition',objectId:'s1'},config:{add:{'value.base':1}}}]}]});
await api.createParameter(v,{id:'p1',nameKey:'Base',valueType:'number',value:2});
await api.createFormula(v,{id:'f1',nameKey:'Total',resultType:'number',expression:{type:'add',args:[{type:'literal',value:1},{type:'parameter',id:'p1'}]}});
await api.createCondition(v,{id:'c1',nameKey:'Is ready',expression:{type:'literal',value:true}});
await api.createAction(v,{id:'a1',nameKey:'Strike',conditionRefs:['c1'],costEffectRefs:[],effectRefs:[]});
await api.createModifier(v,{id:'m1',nameKey:'Blessed',targetRef:{objectKind:'definition',objectId:'d0',capabilityId:'value',outputId:'value.final'},operation:'add',valueSource:{kind:'literal',value:2},conditionRefs:['c1'],stacking:{mode:'highest',group:'blessing'}});
await api.createDuration(v,{id:'du1',nameKey:'Three rounds',mode:'fixed',amount:3,unit:'round'});
await api.createEventType(v,{id:'ev1',nameKey:'Damage taken',payloadFields:{amount:{name:'Amount',valueType:'number',required:true,nullable:false},kind:{name:'Kind',valueType:'string',required:false,nullable:false}}});
await api.createTrigger(v,{id:'tr1',nameKey:'On heavy fire damage',eventTypeId:'ev1',actingRole:'target',mode:'offer',eventFilter:{payloadMatches:{kind:'fire'}},conditionRefs:[],actionRefs:['a1']});
await api.createPermissionPolicy(v,{id:'pp1',nameKey:'Players act',scope:{objectKind:'definitionType',objectId:'stat'},defaultEffect:'DENY',rules:[{id:'r1',effect:'ALLOW',operations:['execute'],roles:['player'],minimumOwnership:'owner',priority:0,messageKey:''}]});
await api.createRoll(v,{id:'r1',nameKey:'d20',formula:'1d20',data:{}});
for(const [id,nameKey] of [['o-crit','Critical'],['o-hit','Hit'],['o-miss','Miss']])await api.createOutcome(v,{id,nameKey,resultKey:id,conditionRef:'c1'});
await api.createTest(v,{id:'t1',nameKey:'Attack',rollRef:'r1',targetValue:12,outcomeRefs:['o-crit','o-hit'],fallbackOutcomeRef:'o-miss'});
await api.createProgressionSystem(v,{id:'ps1',nameKey:'Career',advancements:[{id:'adv',labelKey:'Skill advance',definitionTypeId:'skill',currencyRef:{objectKind:'definition',objectId:'d0',capabilityId:'value',outputId:'value.base'},costFormulaRef:'f1'}],milestones:[{id:'l2',labelKey:'Level 2',conditionRef:'c1',definitionIds:['s1'],actionRef:'a1'}]});
await api.createDie(v,{id:'dz1',nameKey:'Ability',denomination:'a',counters:[{id:'success',labelKey:'Success'},{id:'advantage',labelKey:'Advantage'}],faces:[{labelKey:'Blank'},{labelKey:'Success',counts:{success:1}},{labelKey:'Advantage',value:2,counts:{advantage:1}}]});
await api.createFormula(v,{id:'f-dice',nameKey:'Hunger tens',resultType:'number',expression:{type:'add',args:[{type:'dice',read:'count',group:'hunger',compare:'eq',value:{type:'literal',value:10}},{type:'dice',read:'counter',counter:'success'},{type:'distance',from:'self',to:'target'},{type:'floor',value:{type:'divide',args:[{type:'subtract',args:[{type:'reference',reference:{objectKind:'definition',objectId:'d1',capabilityId:'value',outputId:'value.final'},container:'target'},{type:'literal',value:10}]},{type:'literal',value:2}]}},{type:'rangeLookup',value:{type:'context',path:'variables.test.total'},ranges:[{max:5,value:0},{min:6,max:9,value:1},{min:10,value:2}],default:{type:'literal',value:0}}]}});
await api.createCondition(v,{id:'c-near',nameKey:'Flanked',expression:{type:'or',args:[{type:'gte',left:{type:'nearby',of:'target',within:{type:'literal',value:2},side:'enemy'},right:{type:'context',path:'variables.test.total'}},{type:'if',condition:{type:'lt',left:{type:'reference',reference:{objectKind:'definition',objectId:'d1',capabilityId:'value',outputId:'value.final'}},right:{type:'literal',value:50}},then:{type:'gte',left:{type:'context',path:'variables.test.natural'},right:{type:'literal',value:96}},else:{type:'eq',left:{type:'context',path:'variables.test.natural'},right:{type:'literal',value:100}}}]}});
await api.createScale(v,{id:'sc1',nameKey:'Health words',basis:'percent',rows:[{id:'full',labelKey:'Seems in great shape',min:100,max:null},{id:'hurt',labelKey:'Hurt',min:1,max:99.99},{id:'down',labelKey:'Down',min:null,max:0}]});
await api.createTable(v,{id:'tb1',nameKey:'Critical hits',rollRef:'r1',rows:[{id:'low',labelKey:'Scratch',min:null,max:10,actionRefs:['a1']},{id:'high',labelKey:'Severed limb',min:11,max:null,actionRefs:[]}]});
await api.createAction(v,{id:'a2',nameKey:'Swing',testRef:'t1',conditionRefs:[],costEffectRefs:[],effectRefs:[],tableRef:'tb1',targeting:'shared',stateApplications:[{definitionId:'s2',stacking:'stack',stacks:2}],reroll:{actionRefs:['a1']},outcomeMappings:[{outcomeId:'o-miss',block:true},{outcomeId:'o-crit',actionRefs:['a1']}],eventTypeRefs:['ev1'],eventPayloads:{ev1:{amount:{formulaRef:'f1'},kind:{literal:'fire'}}}});
await api.createSheetDefinition(v,{id:'sh1',nameKey:'Character sheet',target:'actor',root:{id:'root',kind:'tabs',children:[{id:'main',kind:'tab',labelKey:'Character',children:[{id:'top',kind:'grid',columns:2,children:[
  {id:'stats',kind:'section',labelKey:'Stats',columns:1,children:[{id:'stat-list',kind:'repeater',query:{definitionTypeId:'stat'},columns:1,children:[{id:'stat-value',kind:'value',source:{kind:'each',capabilityId:'value',outputId:'value.final'},write:{operation:'set'}}]}]},
  {id:'derived',kind:'section',labelKey:'Derived',columns:1,children:[{id:'total',kind:'value',source:{kind:'formula',formulaRef:'f1'}},{id:'strike',kind:'action',actionRef:'a1'}]}]}]},
  {id:'skills-tab',kind:'tab',labelKey:'Skills',children:[{id:'skill-list',kind:'repeater',query:{definitionTypeId:'skill'},columns:2,children:[]}]}]}});
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
const editors=[['ruleset',v],['definitionType','stat'],['definition','d0'],['contentType','gear'],['contentTemplate','rope'],['parameter','p1'],['formula','f1'],['condition','c1'],['action','a2'],['tag','tag-a'],['category','cat-core'],['test','t1'],['modifier','m1'],['duration','du1'],['die','dz1'],['formula','f-dice'],['condition','c-near'],['table','tb1'],['scale','sc1'],['progressionSystem','ps1'],['trigger','tr1'],['permissionPolicy','pp1'],['eventType','ev1'],
 ['sheetDefinition','sh1'],...['formulaBinding','roll','outcome','effect','creationSystem'].map(kind=>[kind,null])];
for(const [kind,id] of editors){
  const editor=new ConfiguratorEntryEditor({api,versionId:v,kind,id,definitionTypeId:kind==='definition'?'stat':null,contentTypeId:kind==='contentTemplate'?'gear':null});
  const ctx=await editor._prepareContext({});
  const html=`<!doctype html><html lang="en"><meta charset="utf-8"><style>${css}\nbody{margin:0;font-family:sans-serif;font-size:14px}.application{position:relative;width:100%;max-width:none;box-sizing:border-box}</style><body class="theme-dark"><div class="application theme-dark"><section class="window-content">${editorTpl(ctx)}</section></div><script type="module">for(const d of document.querySelectorAll('details'))d.open=true;import('${selectUrl}').then(({RTASelect})=>RTASelect.enhance(document.body));</script></body></html>`;
  writeFileSync(join(out,'editor-'+kind+'.html'),html);
}
console.log('rendered editors',editors.length);
// Fixture for qa/dynamic-markup-audit.mjs, which replays the editors' own scripts in a browser.
writeFileSync(join(out,'fixture.json'),JSON.stringify({versionId:v,snapshot:storage.snapshot,editors:editors.map(([kind,id])=>({kind,id,definitionTypeId:kind==='definition'?'stat':null,contentTypeId:kind==='contentTemplate'?'gear':null}))}));
