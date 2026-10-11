import {fakeAcquire} from './helpers/fake-acquire.mjs';
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
  const flags=templateFlags("version-1",{id:"doctor",runtimeMode:"unique",relations:[{id:"medicine",operation:"grant",targetRef:{objectKind:"definition",objectId:"medicine"}}],categories:["career"],capabilities:[],tags:["modern"]},{id:"career",runtimeMode:"unique"});
  assert.equal(flags.templateId,"doctor");assert.deepEqual(flags.relations,[{id:"medicine",operation:"grant",targetRef:{objectKind:"definition",objectId:"medicine"}}]);assert.equal(Object.hasOwn(flags,"definitionBindings"),false);assert.equal(flags.versionId,"version-1");
});

test("acquisition instantiates only missing Definitions and records provenance",async()=>{
  const flags={};
  const actor={uuid:"Actor.A",documentName:"Actor",getFlag:(_s,k)=>flags[k],setFlag:async(_s,k,v)=>{flags[k]=v;}};
  const grant=(objectKind,objectId)=>({id:objectId,operation:"grant",targetRef:{objectKind,objectId}});
  const ruleset={definitions:[{id:"medicine",enabled:true},{id:"science",enabled:true}],actions:[{id:"heal",enabled:true}],contentTypes:[{id:"career",enabled:true,runtimeMode:"unique"}],contentTemplates:[{id:"doctor",contentTypeId:"career",enabled:true,runtimeMode:"unique",relations:[grant("definition","medicine"),grant("definition","science"),grant("action","heal")]}]};
  const runtime={acquire:fakeAcquire,adapter:{resolveDocument:async()=>actor},getContainerState:async()=>({definitionStates:{medicine:{}}}),instantiateDefinition:async(_v,_a,id)=>{flags.created??=[];flags.created.push(id);},removeDefinitionState:async()=>{}};
  const configurator={getRulesetVersion:()=>({publishedSnapshot:ruleset})};
  const bridge=new FoundryContentBridge(configurator,runtime,{hooks:null});
  const result=await bridge.acquireTemplate("v1",actor.uuid,"doctor",{sourceItemId:"item1"});
  assert.deepEqual(flags.created,["science"]);assert.deepEqual(result.createdDefinitionIds,["science"]);assert.deepEqual(result.actionIds,["heal"]);assert.equal(flags.contentAcquisitions.item1.templateId,"doctor");
});

test("acquisition uses initial values declared on grant relations",async()=>{
  const flags={};
  const actor={uuid:"Actor.B",documentName:"Actor",getFlag:(_s,k)=>flags[k],setFlag:async(_s,k,v)=>{flags[k]=v;}};
  const ruleset={definitions:[{id:"medicine",enabled:true}],contentTypes:[{id:"career",enabled:true,runtimeMode:"unique"}],contentTemplates:[{id:"doctor",contentTypeId:"career",enabled:true,runtimeMode:"unique",relations:[{id:"medicine",operation:"grant",targetRef:{objectKind:"definition",objectId:"medicine"},config:{initial:{"value.base":2}}}]}]};
  const calls=[];
  const runtime={acquire:fakeAcquire,adapter:{resolveDocument:async()=>actor},getContainerState:async()=>({definitionStates:{}}),instantiateDefinition:async(_v,_a,id,o)=>calls.push({id,o}),removeDefinitionState:async()=>{}};
  const bridge=new FoundryContentBridge({getRulesetVersion:()=>({publishedSnapshot:ruleset})},runtime,{hooks:null});
  await bridge.acquireTemplate("v1",actor.uuid,"doctor",{sourceItemId:"item2"});
  assert.deepEqual(calls,[{id:"medicine",o:{initial:{"value.base":2}}}]);
});

test("content synchronization deletes only stale Rule Them'All-managed documents",async()=>{
  const deleted=[],updated=[];
  const managed={id:"old",getFlag:()=>({managed:true,versionId:"v1",contentTypeId:"weapon",templateId:"old-weapon"}),update:async d=>updated.push(d),delete:async()=>deleted.push("old")};
  const external={id:"external",getFlag:()=>null,update:async()=>{},delete:async()=>deleted.push("external")};
  const pack={collection:"world.rta-v1-weapon",documentName:"Item",locked:false,getDocuments:async()=>[managed,external]};
  const ruleset={contentTypes:[{id:"weapon",nameKey:"Weapons",storageKind:"item",enabled:true}],contentTemplates:[]};
  const bridge=new FoundryContentBridge({getRulesetVersion:()=>({publishedSnapshot:ruleset})},{},{hooks:null,documentTypeResolver:()=>"content"});
  bridge.ensurePack=async()=>pack;
  const result=await bridge.syncContentType("v1","weapon");
  assert.deepEqual(deleted,["old"]);assert.equal(result.deleted,1);
});

test("acquisition choices validate cardinality and grant selected Definitions and Actions",async()=>{
  const flags={};
  const actor={uuid:"Actor.C",documentName:"Actor",getFlag:(_s,k)=>flags[k],setFlag:async(_s,k,v)=>{flags[k]=v;}};
  const option=(id,objectKind,objectId)=>({id,operation:"grant",targetRef:{objectKind,objectId}});
  const ruleset={definitions:[{id:"medicine",enabled:true},{id:"science",enabled:true}],actions:[{id:"heal",enabled:true}],contentTypes:[{id:"career",enabled:true,runtimeMode:"unique"}],contentTemplates:[{id:"doctor",contentTypeId:"career",enabled:true,runtimeMode:"unique",choiceGroups:[{id:"skills",name:"Choose one skill",min:1,max:1,options:[option("med","definition","medicine"),option("sci","definition","science")]},{id:"actions",name:"Choose one action",min:1,max:1,options:[option("heal","action","heal")]}]}]};
  const calls=[];
  const runtime={acquire:fakeAcquire,adapter:{resolveDocument:async()=>actor},getContainerState:async()=>({definitionStates:{}}),instantiateDefinition:async(_v,_a,id)=>calls.push(id),removeDefinitionState:async()=>{}};
  const bridge=new FoundryContentBridge({getRulesetVersion:()=>({publishedSnapshot:ruleset})},runtime,{hooks:null});
  await assert.rejects(()=>bridge.acquireTemplate("v1",actor.uuid,"doctor",{sourceItemId:"x",selections:{skills:[],actions:["heal"]}}),/requires 1 selection/);
  const result=await bridge.acquireTemplate("v1",actor.uuid,"doctor",{sourceItemId:"x",selections:{skills:["med"],actions:["heal"]}});
  assert.deepEqual(calls,["medicine"]);assert.deepEqual(result.actionIds,["heal"]);assert.equal(result.selectedOptions.length,2);
});
