import test from "node:test";
import assert from "node:assert/strict";
import {createConfiguratorAPI} from "../src/configurator/configurator-api.mjs";
import {emptyStorageSnapshot} from "../src/configurator/configurator-storage.mjs";
import {capabilityTypeRegistry} from "../src/configurator/capability-type-registry.mjs";
import {prepareFieldDefinition, prepareOutputDefinition} from "../src/configurator/field-output-contracts.mjs";

class MemoryStorage { constructor(){this.value=emptyStorageSnapshot();this.listeners=new Set();} async load(){return structuredClone(this.value);} async save(v){this.value=structuredClone(v);for(const f of this.listeners)f(this.value);} subscribe(f){this.listeners.add(f);return()=>this.listeners.delete(f);} }
const base=()=>({id:"rules",nameKey:"Rules",version:"1.0.0"});

function field(id,valueType,extra={}) { return {id,valueType,cardinality:"one",required:false,nullable:false,constraints:[],editable:true,...extra}; }

test("ValueTypeRegistry exposes safe built-ins and only explicit integer to number widening", async()=>{
  const api=await createConfiguratorAPI(new MemoryStorage());
  assert.deepEqual(api.listValueTypes().map(x=>x.id),["integer","number","boolean","string","reference","duration","dateTime"]);
  assert.equal(api.isValueTypeAssignable("integer","number"),true);
  assert.equal(api.isValueTypeAssignable("number","integer"),false);
  assert.equal(api.isValueTypeAssignable("string","number"),false);
});

test("FieldDefinition and OutputDefinition enforce CP-22/23 structural contracts",()=>{
  const f=prepareFieldDefinition(field("rating","integer",{required:true,defaultValue:2}));
  assert.equal(f.defaultValue,2);
  assert.throws(()=>prepareFieldDefinition(field("rating","integer",{defaultValue:2.5})),/defaultValue invalid/);
  const o=prepareOutputDefinition({id:"final",valueType:"number",cardinality:"one",nullable:false,source:"derived.final",readable:true,mutable:false,derived:true});
  assert.equal(o.derived,true);
  assert.throws(()=>prepareOutputDefinition({...o,valueType:"mystery"}),/unknown valueType/);
});

test("DefinitionType fields apply defaults, required checks and reject undeclared data",async()=>{
  const api=await createConfiguratorAPI(new MemoryStorage());
  const v=(await api.createRuleset(base())).versionId;
  await api.registerDefinitionType(v,{id:"attribute",key:"attribute",nameKey:"Attribute",descriptionKey:"",color:null,enabled:true,order:0,allowedCapabilities:[],defaultCapabilities:[],requiredCapabilities:[],fields:{
    rating:field("rating","integer",{required:true,defaultValue:1}),
    label:field("label","string",{nullable:true})
  },constraints:[]});
  const created=await api.createDefinition(v,{id:"strength",key:"strength",definitionTypeId:"attribute",nameKey:"Strength",descriptionKey:"",data:{},categories:[],enabled:true,order:0,tags:[]});
  assert.deepEqual(created.data,{rating:1});
  await assert.rejects(()=>api.createDefinition(v,{id:"bad",key:"bad",definitionTypeId:"attribute",nameKey:"Bad",descriptionKey:"",data:{rating:"1"},categories:[],enabled:true,order:0,tags:[]}),/Invalid field rating/);
  await assert.rejects(()=>api.createDefinition(v,{id:"extra",key:"extra",definitionTypeId:"attribute",nameKey:"Extra",descriptionKey:"",data:{rating:1,hidden:2},categories:[],enabled:true,order:0,tags:[]}),/undeclared field/);
});

test("DefinitionType default and required capabilities are applied without business specialization",async()=>{
  const id="testMetricCapability";
  if(!capabilityTypeRegistry.has(id)) capabilityTypeRegistry.register({id,category:"structural",fields:{metric:field("metric","number",{required:true,defaultValue:0})},outputs:{metric:{id:"metric",valueType:"number",cardinality:"one",nullable:false,source:"field.metric",readable:true,mutable:true,derived:false}}});
  const api=await createConfiguratorAPI(new MemoryStorage());
  assert.ok(api.getCapabilityType(id));
  const v=(await api.createRuleset(base())).versionId;
  await api.registerDefinitionType(v,{id:"meter",key:"meter",nameKey:"Meter",descriptionKey:"",color:null,enabled:true,order:0,allowedCapabilities:[id],defaultCapabilities:[id],requiredCapabilities:[id],fields:{},constraints:[]});
  const created=await api.createDefinition(v,{id:"m",key:"m",definitionTypeId:"meter",nameKey:"M",descriptionKey:"",data:{},categories:[],enabled:true,order:0,tags:[]});
  assert.deepEqual(created.capabilities,[id]);
  assert.deepEqual(created.data,{metric:0});
  await assert.rejects(()=>api.updateDefinition(v,"m",{capabilities:[]}),/Required capability is missing/);
});

test("Capability field collisions are rejected at DefinitionType authoring time",async()=>{
  const id="testCollisionCapability";
  if(!capabilityTypeRegistry.has(id)) capabilityTypeRegistry.register({id,category:"structural",fields:{rating:field("rating","integer")},outputs:{}});
  const api=await createConfiguratorAPI(new MemoryStorage());
  const v=(await api.createRuleset(base())).versionId;
  await assert.rejects(()=>api.registerDefinitionType(v,{id:"collision",key:"collision",nameKey:"Collision",descriptionKey:"",color:null,enabled:true,order:0,allowedCapabilities:[id],defaultCapabilities:[],requiredCapabilities:[],fields:{rating:field("rating","integer")},constraints:[]}),/FieldDefinition collision/);
});

test("numeric FieldDefinition constraints validate defaults and Definition data", async()=>{
  const api=await createConfiguratorAPI(new MemoryStorage());
  const v=(await api.createRuleset(base())).versionId;
  const score=field("score","integer",{required:true,defaultValue:1,constraints:[{kind:"min",value:0},{kind:"max",value:10},{kind:"step",value:1}]});
  await api.registerDefinitionType(v,{id:"attribute",key:"attribute",nameKey:"Attribute",descriptionKey:"",color:null,enabled:true,order:0,allowedCapabilities:[],defaultCapabilities:[],requiredCapabilities:[],fields:{score},constraints:[]});
  const created=await api.createDefinition(v,{id:"strength",key:"strength",definitionTypeId:"attribute",nameKey:"Strength",descriptionKey:"",data:{},categories:[],enabled:true,order:0,tags:[]});
  assert.equal(created.data.score,1);
  await assert.rejects(()=>api.updateDefinition(v,"strength",{data:{score:-1}}),/greater than or equal to 0/);
  await assert.rejects(()=>api.updateDefinition(v,"strength",{data:{score:11}}),/less than or equal to 10/);
  const updated=await api.updateDefinition(v,"strength",{data:{score:7}});
  assert.equal(updated.data.score,7);
});

test("numeric FieldDefinition constraints reject invalid authoring contracts",()=>{
  assert.throws(()=>prepareFieldDefinition(field("score","integer",{constraints:[{kind:"min",value:10},{kind:"max",value:1}]})),/minimum may not exceed maximum/);
  assert.throws(()=>prepareFieldDefinition(field("score","integer",{constraints:[{kind:"step",value:0}]})),/step must be greater than zero/);
  assert.throws(()=>prepareFieldDefinition(field("label","string",{constraints:[{kind:"min",value:0}]})),/only valid for numeric value types/);
  assert.throws(()=>prepareFieldDefinition(field("score","integer",{defaultValue:11,constraints:[{kind:"max",value:10}]})),/defaultValue invalid/);
});

test("removing a DefinitionType field explicitly prunes stored values from Definitions of that type", async()=>{
  const api=await createConfiguratorAPI(new MemoryStorage());
  const v=(await api.createRuleset(base())).versionId;
  const score=field("score","integer",{required:true,defaultValue:1});
  await api.registerDefinitionType(v,{id:"attribute",key:"attribute",nameKey:"Attribute",descriptionKey:"",color:null,enabled:true,order:0,allowedCapabilities:[],defaultCapabilities:[],requiredCapabilities:[],fields:{score},constraints:[]});
  await api.createDefinition(v,{id:"strength",key:"strength",definitionTypeId:"attribute",nameKey:"Strength",descriptionKey:"",data:{score:7},categories:[],enabled:true,order:0,tags:[]});
  await api.createDefinition(v,{id:"agility",key:"agility",definitionTypeId:"attribute",nameKey:"Agility",descriptionKey:"",data:{score:4},categories:[],enabled:true,order:0,tags:[]});
  await assert.rejects(()=>api.updateDefinitionType(v,"attribute",{fields:{}}),error=>error.code==="FIELD_REMOVAL_DATA_LOSS"&&error.affected.length===2);
  assert.deepEqual(api.getDefinition(v,"strength").data,{score:7},"nothing is lost without confirmation");
  const updatedType=await api.updateDefinitionType(v,"attribute",{fields:{}},{pruneRemovedFields:true});
  assert.deepEqual(updatedType.fields,{});
  assert.deepEqual(api.getDefinition(v,"strength").data,{});
  assert.deepEqual(api.getDefinition(v,"agility").data,{});
});
