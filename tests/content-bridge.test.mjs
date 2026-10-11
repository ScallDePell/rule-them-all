import test from "node:test";
import assert from "node:assert/strict";
import {packNameFor,templateFlags,FoundryContentBridge} from "../src/runtime/foundry-content-bridge.mjs";

test("content bridge creates deterministic Foundry pack names",()=>{
  assert.equal(packNameFor("version-1234567890abcdef",{id:"Métier / Parcours"}),"rta-1234567890ab-metier-parcours");
});

test("Item-backed Content Types use the host system Item subtype",()=>{
  const bridge=new FoundryContentBridge({},{},{hooks:null,documentTypeResolver:()=>"content"});
  const data=bridge.documentData("version-1",{id:"knife",nameKey:"Knife"},{id:"weapon",storageKind:"item",runtimeMode:"unique"});
  assert.equal(data.type,"content");
});

test("content template flags preserve portable provenance",()=>{
  const flags=templateFlags("version-1",{id:"doctor",runtimeMode:"unique",definitionBindings:[{definitionId:"medicine"}],actionBindings:[],initialStateRules:[],categories:["career"],capabilities:[],tags:["modern"]},{id:"career",runtimeMode:"unique"});
  assert.equal(flags.templateId,"doctor");assert.deepEqual(flags.definitionBindings,[{definitionId:"medicine"}]);assert.equal(flags.versionId,"version-1");
});

test("acquisition instantiates only missing Definitions and records provenance",async()=>{
  const flags={};
  const actor={uuid:"Actor.A",documentName:"Actor",getFlag:(_s,k)=>flags[k],setFlag:async(_s,k,v)=>{flags[k]=v;}};
  const ruleset={contentTypes:[{id:"career",enabled:true,runtimeMode:"unique"}],contentTemplates:[{id:"doctor",contentTypeId:"career",enabled:true,runtimeMode:"unique",definitionBindings:[{definitionId:"medicine"},{definitionId:"science"}],actionBindings:[{actionId:"heal"}],initialStateRules:[]}]};
  const runtime={adapter:{resolveDocument:async()=>actor},getContainerState:async()=>({definitionStates:{medicine:{}}}),instantiateDefinition:async(_v,_a,id)=>{flags.created??=[];flags.created.push(id);},removeDefinitionState:async()=>{}};
  const configurator={getRulesetVersion:()=>({workingDraft:ruleset})};
  const bridge=new FoundryContentBridge(configurator,runtime,{hooks:null});
  const result=await bridge.acquireTemplate("v1",actor.uuid,"doctor",{sourceItemId:"item1"});
  assert.deepEqual(flags.created,["science"]);assert.deepEqual(result.createdDefinitionIds,["science"]);assert.deepEqual(result.actionIds,["heal"]);assert.equal(flags.contentAcquisitions.item1.templateId,"doctor");
});

test("acquisition uses initial values declared directly on DefinitionBindings",async()=>{
  const flags={};
  const actor={uuid:"Actor.B",documentName:"Actor",getFlag:(_s,k)=>flags[k],setFlag:async(_s,k,v)=>{flags[k]=v;}};
  const ruleset={contentTypes:[{id:"career",enabled:true,runtimeMode:"unique"}],contentTemplates:[{id:"doctor",contentTypeId:"career",enabled:true,runtimeMode:"unique",definitionBindings:[{definitionId:"medicine",initial:{"value.base":2}}],actionBindings:[]}]};
  const calls=[];
  const runtime={adapter:{resolveDocument:async()=>actor},getContainerState:async()=>({definitionStates:{}}),instantiateDefinition:async(_v,_a,id,o)=>calls.push({id,o}),removeDefinitionState:async()=>{}};
  const bridge=new FoundryContentBridge({getRulesetVersion:()=>({workingDraft:ruleset})},runtime,{hooks:null});
  await bridge.acquireTemplate("v1",actor.uuid,"doctor",{sourceItemId:"item2"});
  assert.deepEqual(calls,[{id:"medicine",o:{initial:{"value.base":2}}}]);
});

test("content synchronization deletes only stale Rule Them'All-managed documents",async()=>{
  const deleted=[],updated=[];
  const managed={id:"old",getFlag:()=>({managed:true,versionId:"v1",contentTypeId:"weapon",templateId:"old-weapon"}),update:async d=>updated.push(d),delete:async()=>deleted.push("old")};
  const external={id:"external",getFlag:()=>null,update:async()=>{},delete:async()=>deleted.push("external")};
  const pack={collection:"world.rta-v1-weapon",documentName:"Item",locked:false,getDocuments:async()=>[managed,external]};
  const ruleset={contentTypes:[{id:"weapon",nameKey:"Weapons",storageKind:"item",enabled:true}],contentTemplates:[]};
  const bridge=new FoundryContentBridge({getRulesetVersion:()=>({workingDraft:ruleset})},{},{hooks:null,documentTypeResolver:()=>"content"});
  bridge.ensurePack=async()=>pack;
  const result=await bridge.syncContentType("v1","weapon");
  assert.deepEqual(deleted,["old"]);assert.equal(result.deleted,1);
});

test("acquisition choices validate cardinality and grant selected Definitions and Actions",async()=>{
  const flags={};
  const actor={uuid:"Actor.C",documentName:"Actor",getFlag:(_s,k)=>flags[k],setFlag:async(_s,k,v)=>{flags[k]=v;}};
  const ruleset={definitions:[{id:"medicine",enabled:true},{id:"science",enabled:true}],contentTypes:[{id:"career",enabled:true,runtimeMode:"unique"}],contentTemplates:[{id:"doctor",contentTypeId:"career",enabled:true,runtimeMode:"unique",definitionBindings:[],actionBindings:[],choiceGroups:[{id:"skills",name:"Choose one skill",min:1,max:1,options:[{id:"med",kind:"definition",definitionId:"medicine"},{id:"sci",kind:"definition",definitionId:"science"}]},{id:"actions",name:"Choose one action",min:1,max:1,options:[{id:"heal",kind:"action",actionId:"heal"}]}]}]};
  const calls=[];
  const runtime={adapter:{resolveDocument:async()=>actor},getContainerState:async()=>({definitionStates:{}}),instantiateDefinition:async(_v,_a,id)=>calls.push(id),removeDefinitionState:async()=>{}};
  const bridge=new FoundryContentBridge({getRulesetVersion:()=>({workingDraft:ruleset})},runtime,{hooks:null});
  await assert.rejects(()=>bridge.acquireTemplate("v1",actor.uuid,"doctor",{sourceItemId:"x",selections:{skills:[],actions:["heal"]}}),/requires 1 selection/);
  const result=await bridge.acquireTemplate("v1",actor.uuid,"doctor",{sourceItemId:"x",selections:{skills:["med"],actions:["heal"]}});
  assert.deepEqual(calls,["medicine"]);assert.deepEqual(result.actionIds,["heal"]);assert.equal(result.selectedOptions.length,2);
});
