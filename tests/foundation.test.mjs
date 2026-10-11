import test from "node:test";
import assert from "node:assert/strict";
import {createRulesetData, ENGINE_CONTRACT_VERSION} from "../src/configurator/configurator-schema.mjs";
import {validateRuleset} from "../src/configurator/configurator-validation.mjs";
import {createConfiguratorAPI} from "../src/configurator/configurator-api.mjs";
import {emptyStorageSnapshot} from "../src/configurator/configurator-storage.mjs";

class MemoryStorage { constructor(){this.value=emptyStorageSnapshot();this.listeners=new Set();} async load(){return structuredClone(this.value);} async save(v){this.value=structuredClone(v);for(const f of this.listeners)f(this.value);} subscribe(f){this.listeners.add(f);return()=>this.listeners.delete(f);} }
const base=()=>({id:"rules",nameKey:"Rules",version:"1.0.0"});

test("new Ruleset is business-empty and uses contract 3",()=>{const r=createRulesetData(base());assert.equal(r.engineContractVersion,ENGINE_CONTRACT_VERSION);assert.deepEqual(r.definitionTypes,[]);assert.deepEqual(r.definitions,[]);assert.equal(validateRuleset(r).valid,true);assert.equal("resources" in r,false);assert.equal("pools" in r,false);assert.equal("relations" in r,false);});

test("DefinitionType and Definition are generic",async()=>{const api=await createConfiguratorAPI(new MemoryStorage());const record=await api.createRuleset(base());const v=record.versionId;await api.registerDefinitionType(v,{id:"cyberware",key:"cyberware",nameKey:"Cyberware",descriptionKey:"",color:null,order:0,allowedCapabilities:[],defaultCapabilities:[],requiredCapabilities:[],fields:{},constraints:[]});await api.createDefinition(v,{id:"optic",key:"optic",definitionTypeId:"cyberware",nameKey:"Optic",descriptionKey:"",data:{},categories:[],capabilities:[],enabled:true,order:0,tags:[]});assert.equal(api.listDefinitions(v)[0].definitionTypeId,"cyberware");assert.equal(api.listDefinitionTypes(v)[0].id,"cyberware");});

test("legacy storageVersion 2 is refused",async()=>{const s=new MemoryStorage();s.value.storageVersion=2;await assert.rejects(()=>createConfiguratorAPI(s),/Unsupported configurator storageVersion/);});

test("DefinitionType cannot be deleted while used",async()=>{const api=await createConfiguratorAPI(new MemoryStorage());const v=(await api.createRuleset(base())).versionId;await api.registerDefinitionType(v,{id:"x",key:"x",nameKey:"X",descriptionKey:"",color:null,order:0,allowedCapabilities:[],defaultCapabilities:[],requiredCapabilities:[],fields:{},constraints:[]});await api.createDefinition(v,{id:"d",key:"d",definitionTypeId:"x",nameKey:"D",descriptionKey:"",data:{},categories:[],capabilities:[],enabled:true,order:0,tags:[]});await assert.rejects(()=>api.deleteDefinitionType(v,"x"),e=>e.code==="REFERENTIAL_INTEGRITY");});

test("legacy specialized APIs are absent",async()=>{const api=await createConfiguratorAPI(new MemoryStorage());for(const name of ["createCharacteristic","createSkill","createResource","createPool","createRelation","createCapability"])assert.equal(api[name],undefined,name);});

test("publication then activation uses a published snapshot",async()=>{const api=await createConfiguratorAPI(new MemoryStorage());const v=(await api.createRuleset(base())).versionId;await assert.rejects(()=>api.setActiveVersionId(v),e=>e.code==="VERSION_NOT_ACTIVABLE");await api.publishRuleset(v);await api.setActiveVersionId(v);assert.equal(api.getActiveVersionId(),v);assert.ok(api.getPublishedRuleset(v));});

test("References are not a Ruleset family",async()=>{const api=await createConfiguratorAPI(new MemoryStorage());const v=(await api.createRuleset(base())).versionId;assert.equal(api.createReference,undefined);assert.equal(Object.hasOwn(api.getRuleset(v),"references"),false);});

test("storage hydration adds newly introduced empty collections to current contract snapshots",async()=>{
  const s=new MemoryStorage();
  const api0=await createConfiguratorAPI(s);
  const v=(await api0.createRuleset(base())).versionId;
  await api0.publishRuleset(v);
  const snapshot=structuredClone(s.value);
  for(const family of snapshot.rulesetFamilies) for(const record of family.versions){
    for(const key of ["rolls","outcomes","tests"]){
      delete record.workingDraft[key];
      if(record.publishedSnapshot) delete record.publishedSnapshot[key];
    }
  }
  s.value=snapshot;
  const api=await createConfiguratorAPI(s);
  const hydrated=api.getRuleset(v);
  assert.deepEqual(hydrated.rolls,[]);
  assert.deepEqual(hydrated.outcomes,[]);
  assert.deepEqual(hydrated.tests,[]);
});

test('v0.6.1 adopts existing free-form tag ids into the first-class Tag catalog and protects deletion',async()=>{
  const storage=new MemoryStorage();
  const api=await createConfiguratorAPI(storage);
  const v=(await api.createRuleset({id:'tag-rules',nameKey:'Tags',version:'1'})).versionId;
  await api.createTag(v,{id:'combat',nameKey:'Combat',descriptionKey:'',enabled:true,order:10,color:null});
  await api.createParameter(v,{id:'p',nameKey:'P',descriptionKey:'',enabled:true,order:10,tags:['combat'],valueType:'number',value:1,scope:'ruleset'});
  await assert.rejects(()=>api.deleteTag(v,'combat'),/referential integrity|cannot delete|used/i);
});
