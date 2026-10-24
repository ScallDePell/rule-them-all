import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync,readdirSync} from "node:fs";
import {fileURLToPath} from "node:url";
import path from "node:path";
import {availableDocumentTypes,resolveDocumentType} from "../src/core/system-document-types.mjs";
import {MODULE_ID,RULESET_PACKAGE_FORMAT,RUNTIME_HOOKS} from "../src/core/module-contract.mjs";
import {FoundryRuntimeAdapter} from "../src/runtime/foundry-runtime-adapter.mjs";
import {FoundryContentBridge} from "../src/runtime/foundry-content-bridge.mjs";
import {exportRulesetData,readRulesetPayload} from "../src/configurator/configurator-serialization.mjs";
import {createConfiguratorAPI} from "../src/configurator/configurator-api.mjs";
import {emptyStorageSnapshot} from "../src/configurator/configurator-storage.mjs";
import {buildRuntimeLabDemoProfile} from "../src/runtime/runtime-demo-profile.mjs";
import {getCreationSourceDescriptor,getCreationSources} from "../src/configurator/creation-source-catalog.mjs";
import {renderNewEventFieldInnerHTML} from "../src/ui/entry-editor-markup.mjs";

const base=path.resolve(fileURLToPath(new URL("..",import.meta.url)));
function read(rel){return readFileSync(path.join(base,rel),"utf8");}
function walk(dir){return readdirSync(dir,{withFileTypes:true}).flatMap(d=>d.isDirectory()?walk(path.join(dir,d.name)):[path.join(dir,d.name)]);}

const systemA={documentTypes:{Actor:["pilot","mech"],Item:["relic","augment"]}};
const systemB={documentTypes:{Actor:{avatar:{},creature:{}},Item:{spell:{},gear:{}}}};

test("the active Game System, not RTA, owns document subtypes",()=>{
 assert.deepEqual(availableDocumentTypes("Actor",{system:systemA}),["pilot","mech"]);
 assert.deepEqual(availableDocumentTypes("Item",{system:systemB}),["spell","gear"]);
 assert.throws(()=>resolveDocumentType("Actor",{system:systemA}),/Select a subtype for Actor documents/);
 assert.equal(resolveDocumentType("Actor",{system:systemA,requestedType:"pilot"}),"pilot");
 assert.equal(resolveDocumentType("Actor",{system:systemB,requestedType:"creature"}),"creature");
 assert.throws(()=>resolveDocumentType("Item",{system:systemB}),/Select a subtype for Item documents/);
 // A Game System without subtypes: Foundry's "base" type, which Foundry lists in game.documentTypes.
 const bare={documentTypes:{}},foundryTypes={Actor:["base"],Item:["base"]};
 assert.deepEqual(availableDocumentTypes("Actor",{system:bare,config:{},documentTypes:foundryTypes}),["base"]);
 assert.equal(resolveDocumentType("Item",{system:{},config:{},documentTypes:foundryTypes}),"base");
 assert.deepEqual(availableDocumentTypes("Actor",{system:systemA,documentTypes:{Actor:["base","pilot","mech"]}}),["pilot","mech"]);
 assert.throws(()=>resolveDocumentType("Actor",{system:bare,config:{},documentTypes:{}}),/exposes no Actor document type/);
 assert.equal(resolveDocumentType("Item",{system:{documentTypes:{Item:["single"]}}}),"single");
 assert.throws(()=>resolveDocumentType("Actor",{system:systemA,requestedType:"npc"}),/Unsupported Actor document type/);
 assert.throws(()=>resolveDocumentType("Actor",{system:{documentTypes:{Actor:[]}}}),/no Actor document type/);
 assert.deepEqual(availableDocumentTypes("Actor",{system:{},config:{Actor:{dataModels:{robot:{},person:{}}}}}),["robot","person"]);
});

test("Runtime Lab creates source/target with system-defined subtypes and keeps deprecated aliases",async()=>{
 const priorGame=globalThis.game,priorActor=globalThis.Actor;
 const actors=[];
 globalThis.game={system:systemA,actors:{find:fn=>actors.find(fn)}};
 globalThis.Actor={create:async data=>{const actor={...data,id:String(actors.length),uuid:`Actor.${actors.length}`,getFlag:(scope,key)=>data.flags?.[scope]?.[key]};actors.push(actor);return actor;}};
 try{
  const adapter=new FoundryRuntimeAdapter();
  await assert.rejects(()=>adapter.createTestActors(),/Select a subtype for Actor documents/);
  const normal=await adapter.createTestActors({sourceType:"pilot",targetType:"pilot"});
  assert.equal(normal.source.type,"pilot");assert.equal(normal.target.type,"pilot");
  assert.deepEqual(Object.keys(normal).sort(),["source","target"]);
  assert.equal((await adapter.createTestActors({sourceType:"pilot",targetType:"pilot"})).source.uuid,normal.source.uuid);
  assert.equal(actors.length,2);
  await assert.rejects(()=>adapter.createTestActors({sourceType:"mech",targetType:"pilot"}),/already has type/);
  await assert.rejects(()=>adapter.createTestActors({sourceType:"npc",targetType:"pilot"}),/Unsupported Actor document type/);
 }finally{globalThis.game=priorGame;globalThis.Actor=priorActor;}
});

test("content type documentation follows an unrelated Game System without a built-in npc assumption",()=>{
 const before=globalThis.game,oldActor=globalThis.Actor,oldItem=globalThis.Item;
 globalThis.game={system:systemB};globalThis.Actor={};globalThis.Item={};
 try{
  const bridge=new FoundryContentBridge({},{},{hooks:null});
  assert.equal(bridge.documentData("v1",{id:"x",nameKey:"X"},{id:"c",storageKind:"actor",documentSubtype:"avatar"}).type,"avatar");
  assert.equal(bridge.documentData("v1",{id:"y",nameKey:"Y"},{id:"d",storageKind:"item",documentSubtype:"spell"}).type,"spell");
  assert.throws(()=>bridge.documentData("v1",{id:"y",nameKey:"Y"},{id:"d",storageKind:"item"}),/Select a subtype for Item documents/);
 }finally{globalThis.game=before;globalThis.Actor=oldActor;globalThis.Item=oldItem;}
});

test("RTA exports and reads only rta-ruleset packages",async()=>{
 class MemoryStorage{constructor(){this.value=emptyStorageSnapshot();this.listeners=new Set();}async load(){return structuredClone(this.value)}async save(v){this.value=structuredClone(v)}subscribe(fn){this.listeners.add(fn);return()=>this.listeners.delete(fn)}}
 const api=await createConfiguratorAPI(new MemoryStorage());
 const record=await api.createRuleset({id:"alien-setting",nameKey:"Alien World",version:"1"});
 const value=api.getRulesetVersion(record.versionId);
 const modern=exportRulesetData(value),old={...modern,format:"rwf-ruleset"};
 assert.equal(modern.format,RULESET_PACKAGE_FORMAT);
 assert.throws(()=>exportRulesetData(value,{format:"rwf-ruleset"}),/Unsupported/);
 assert.throws(()=>readRulesetPayload(old));
 assert.throws(()=>exportRulesetData(value,{format:"unknown"}),/Unsupported/);
 assert.throws(()=>readRulesetPayload({...old,format:"unknown"}),/Unsupported/);
 assert.equal(MODULE_ID,"rule-them-all");
 assert.deepEqual(RUNTIME_HOOKS,{testResolved:"ruleThemAllTestResolved",event:"ruleThemAllEvent",actionExecuted:"ruleThemAllActionExecuted",ledgerEntry:"ruleThemAllLedgerEntry",reactionOffered:"ruleThemAllReactionOffered",choiceOffered:"ruleThemAllChoiceOffered"});
});

test("Runtime Lab numeric presets are isolated, injectable TEST DATA rather than game rules",()=>{
 const ruleset={definitions:[{id:"alpha",capabilities:["value","pool","state"],slots:{pool:[{id:"hp"}]}},{id:"beta",capabilities:["value"]},{id:"disabled",enabled:false,capabilities:["value"]}]};
 const presets={source:{valueSequence:[7,9],poolMaximum:42},target:{valueSequence:[5],poolMaximum:8}};
 const result=buildRuntimeLabDemoProfile(ruleset,"source",{presets});
 assert.deepEqual(result,{alpha:{base:7,pools:{hp:42},active:false},beta:{base:9}});
 assert.throws(()=>buildRuntimeLabDemoProfile(ruleset,"pj",{presets}),/No Runtime Lab sample preset/);
 assert.throws(()=>buildRuntimeLabDemoProfile(ruleset,"source",{presets:{source:{valueSequence:[],poolMaximum:0}}}),/Invalid Runtime Lab sample/);
 const engine=read("src/runtime/runtime-engine.mjs");
 assert.doesNotMatch(engine,/RUNTIME_LAB_SAMPLE_PRESETS|runtime-lab-fixtures/);
});

test("Creation System sources localize via FR/EN while retaining stable collection IDs",()=>{
 const before=globalThis.game;
 globalThis.game={i18n:{lang:"fr",localize:key=>key==="RTA.CreationSource.definitions.Label"?"Définitions":key}};
 try{
  assert.equal(getCreationSourceDescriptor("definitions").label,"Définitions");
  const fake={getRuleset:()=>({definitions:[{id:"mystic",nameKey:"Mystic"}],contentTypes:[]})};
  const choices=getCreationSources(fake,"v1");
  assert.equal(choices.length,1);assert.equal(choices[0].id,"definitions");assert.equal(choices[0].label,"Définitions");assert.equal(choices[0].items[0].id,"mystic");
 }finally{globalThis.game=before;}
});

test("dynamic editor markup lives in pure generators and preserves data-* contracts",()=>{
 const event=renderNewEventFieldInnerHTML('<option>boolean</option>');
 assert.match(event,/data-event-field-prop="name"/);assert.match(event,/data-action="removeEventField"/);
 assert.doesNotMatch(read("src/ui/entry-editor-markup.mjs"),/globalThis\.game|game\.settings|fromUuid|this\.#api/);
});

test("architecture gate: no system-owned Actor type localizations, no game-specific subtype preferences",()=>{
 for(const locale of ["en","fr"]){
  const dict=JSON.parse(read(`lang/${locale}.json`));
  assert.equal(dict.TYPES,undefined);assert.equal(dict.RWF,undefined);
  assert.ok(dict.RTA?.CreationSource?.definitions?.Label);
 }
 const prod=walk(path.join(base,"src")).filter(f=>f.endsWith(".mjs"));
 for(const file of prod){const source=readFileSync(file,"utf8");
  if(!file.endsWith("module-contract.mjs"))assert.doesNotMatch(source,/const MODULE_ID\s*=\s*["']rule-them-all["']/,file);
  assert.doesNotMatch(source,/\[\s*["']character["']\s*,\s*["'](?:pc|npc)["']/,file);
 }
});

// The architectural rules must be enforceable by CI, not just described in prose.
test("canonical architecture file is checked in and architecture gate passes",async()=>{
 const {spawnSync}=await import("node:child_process");
 const doc=read("docs/architecture.md");
 for(const required of ["Foundry v14","rta-ruleset","storageVersion: 3","RTA Select","Known limits and technical debt"])
  assert.ok(doc.includes(required),`Missing architecture contract: ${required}`);
 const proc=spawnSync(process.execPath,["qa/architecture-audit.mjs","--strict","--json"],{cwd:base,encoding:"utf8"});
 assert.equal(proc.status,0,proc.stderr||proc.stdout);
 const result=JSON.parse(proc.stdout);
 assert.equal(result.status,"PASS");
 assert.equal(result.violations.length,0);
 assert.ok(result.scanned.productionModules>=35);
});

test("no legacy RWF hooks, formats or CSS classes remain",()=>{
 const files=[...walk(path.join(base,"src")),...walk(path.join(base,"templates")),...walk(path.join(base,"styles"))].filter(f=>/\.(?:mjs|hbs|css)$/.test(f));
 for(const file of files)assert.doesNotMatch(readFileSync(file,"utf8"),/rwf-/i,file);
});
