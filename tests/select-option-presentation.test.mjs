import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {canonicalSelectColor,normalizedSelectColors,selectColorsAttribute,createSelectColorResolver,referenceKindTitle,DEFAULT_SELECT_COLOR} from "../src/ui/select-option-presentation.mjs";
const file=name=>readFileSync(new URL(`../${name}`,import.meta.url),"utf8");
test("every option retains an accent: actual color or neutral default",()=>{
  assert.equal(DEFAULT_SELECT_COLOR,"#666666");
  assert.equal(canonicalSelectColor("#666666"),DEFAULT_SELECT_COLOR);
  assert.equal(canonicalSelectColor("url(javascript:evil)"),null);
  assert.deepEqual(normalizedSelectColors(["#f30","#f30","#08aafd","#666666","red",null]),["#f30","#08aafd",DEFAULT_SELECT_COLOR]);
  assert.equal(selectColorsAttribute(["#c44","#4c4"]),"#c44,#4c4");
  assert.equal(selectColorsAttribute([]),DEFAULT_SELECT_COLOR);
  assert.equal(selectColorsAttribute(""),DEFAULT_SELECT_COLOR);
  assert.deepEqual(normalizedSelectColors([null,"bad",null]),[DEFAULT_SELECT_COLOR]);
});
test("rails inherit business type/family colors, never the attached tag colors",()=>{
  const colors=createSelectColorResolver({definitionTypes:[{id:"skill",color:"#c04040"}],contentTypes:[{id:"path",color:"#3050ff"}],tags:[{id:"physical",color:"#13aabb"},{id:"advanced",color:"#99ff00"}],familyColors:{actions:"#667788"}});
  assert.deepEqual(colors("definition",{definitionTypeId:"skill",tags:["physical","advanced"],categories:["A"]}),["#c04040"]);
  assert.deepEqual(colors("contentTemplate",{contentTypeId:"path",tags:["physical"]}),["#3050ff"]);
  assert.deepEqual(colors("tag",{color:"#13aabb"}),["#13aabb"]);
  assert.deepEqual(colors("action",{tags:[]}),["#667788"]);
  assert.deepEqual(colors("definition",{categories:["unknown category"]}),[DEFAULT_SELECT_COLOR]);
  assert.deepEqual(colors("definitionType",{id:"neutral",color:null}),[DEFAULT_SELECT_COLOR]);
  assert.deepEqual(colors("tag",{color:null}),[DEFAULT_SELECT_COLOR]);
  assert.deepEqual(colors("action",{tags:["missing"]}),["#667788"]);
  assert.deepEqual(colors("definition",{definitionTypeId:"unset",tags:["physical"]}),[DEFAULT_SELECT_COLOR]);
});
test("skills and combat definitions inherit their own Definition Type, never a colored tag",()=>{
  const resolver=createSelectColorResolver({
    definitionTypes:[
      {id:"skills",nameKey:"Compétences",color:"#ed9934"},
      {id:"combat",nameKey:"Maîtrises de combat",color:"#4a8ed9"}
    ],
    contentTypes:[{id:"weapons",nameKey:"Armes",color:"#9a3b81"}],
    tags:[{id:"core",color:"#e01010"},{id:"combat",color:"#02ef02"}],
    familyColors:{actions:"#8451a3"}
  });
  assert.deepEqual(resolver("definition",{definitionTypeId:"skills",tags:["combat","core"]}),["#ed9934"]);
  assert.deepEqual(resolver("definition",{definitionTypeId:"combat",tags:["core"]}),["#4a8ed9"]);
  assert.deepEqual(resolver("contentTemplate",{contentTypeId:"weapons",tags:["combat"]}),["#9a3b81"]);
  assert.deepEqual(resolver("action",{tags:["combat"]}),["#8451a3"]);
  assert.deepEqual(resolver("definition",{definitionTypeId:"missing",tags:["core"]}),[DEFAULT_SELECT_COLOR]);
  // In a dedicated Tag selector, the Tag is the object, so its own color remains valid.
  assert.deepEqual(resolver("tag",{color:"#e01010"}),["#e01010"]);
});
test("mixed reference kinds are readable while one-kind field labels need no redundant suffix",()=>{
  assert.equal(referenceKindTitle("definition",true),"Définition");
  assert.equal(referenceKindTitle("parameter",false),"Parameter");
  const builder=file("src/configurator/field-reference-choices.mjs");
  assert.match(builder,/const mixed=kinds.length>1/);
  assert.match(builder,/const label=mixed\?`\$\{display\} · \$\{referenceKindTitle\(objectKind,fr\)\}`:display/);
  assert.match(builder,/colors:selectColorsAttribute\(optionColors\(objectKind,entry\)\)/);
  assert.match(file("src/configurator/configurator-entry-editor.mjs"),/buildFieldReferenceChoices/);
});
test("all three source adapters use one safe accent renderer; native values remain unchanged",()=>{
  const select=file("src/ui/rta-select.mjs");
  assert.match(select,/decorateOption\(option,option\.dataset\.rtaColors\)/);
  assert.match(select,/decorateOption\(line,option\.dataset\.rtaColors\)/);
  assert.match(select,/option\.dataset\.rtaColors=row\.dataset\.rtaColors/);
  assert.match(select,/line\.style\.backgroundColor=color/);
  assert.match(select,/input\.value=option\.value/);
  const template=file("templates/configurator/entry-editor.hbs");
  assert.match(template,/data-picker-label="\{\{label\}\}" data-rta-colors="\{\{colors\}\}"/);
  assert.match(template,/data-definition-binding="\{\{id\}\}" data-rta-colors="\{\{colors\}\}"/);
  assert.match(template,/<option value="\{\{token\}\}" data-rta-colors="\{\{colors\}\}"/);
});

test("real editor options use names, persisted type colors independent of tags, and untouched reference tokens",async()=>{
  globalThis.foundry??={applications:{api:{ApplicationV2:class {async _prepareContext(){return {}}},HandlebarsApplicationMixin:Base=>Base}}};
  const {ConfiguratorEntryEditor}=await import("../src/configurator/configurator-entry-editor.mjs");
  const {createConfiguratorAPI}=await import("../src/configurator/configurator-api.mjs");
  const {emptyStorageSnapshot}=await import("../src/configurator/configurator-storage.mjs");
  class Store {constructor(){this.snapshot=emptyStorageSnapshot();}async load(){return structuredClone(this.snapshot);}async save(v){this.snapshot=structuredClone(v);}}
  const api=await createConfiguratorAPI(new Store());
  const {versionId}=await api.createRuleset({id:"colors-ui",nameKey:"Règles",version:"1.0.0",familyColors:{actions:"#ddaa22"},sectionColorOverrides:{rules:true,definitions:true,advanced:true}});
  await api.registerDefinitionType(versionId,{id:"skill",key:"skill",nameKey:"Compétences",color:"#dc4039",fields:{unlocked:{id:"unlocked",name:"Compétences débloquées",valueType:"reference",cardinality:"many",referenceTarget:{objectKind:"definition"}}},allowedCapabilities:[],defaultCapabilities:[],requiredCapabilities:[]});
  await api.registerDefinitionType(versionId,{id:"ability",key:"ability",nameKey:"Caractéristiques",color:"#238bc7",fields:{},allowedCapabilities:[],defaultCapabilities:[],requiredCapabilities:[]});
  await api.createTag(versionId,{id:"nature",nameKey:"Nature",color:"#46b55e",enabled:true,order:10});
  await api.createDefinition(versionId,{id:"athletics",key:"athletics",nameKey:"Athlétisme",definitionTypeId:"skill",capabilities:[],tags:["nature"],data:{}});
  await api.createDefinition(versionId,{id:"strength",key:"strength",nameKey:"Force",definitionTypeId:"ability",capabilities:[],data:{}});
  await api.createDefinition(versionId,{id:"author",key:"author",nameKey:"Auteur",definitionTypeId:"skill",capabilities:[],data:{unlocked:[{objectKind:"definition",objectId:"athletics"}]}});
  const editor=new ConfiguratorEntryEditor({api,versionId,kind:"definition",id:"author"});
  const context=await editor._prepareContext({});
  const choices=context.fieldContract.find(f=>f.id==="unlocked").referenceChoices;
  const athletics=choices.find(x=>x.label==="Athlétisme");
  assert.ok(athletics);
  assert.equal(athletics.colors,"#dc4039");
  assert.equal(athletics.selected,true);
  assert.equal(athletics.token,"definition|athletics|||");
  assert.equal(choices.find(x=>x.label==="Force")?.colors,"#238bc7");
  assert.equal(context.tagChoices.find(x=>x.label==="Nature")?.colors,"#46b55e");
  assert.doesNotMatch(choices.map(x=>x.label).join(" / "),/· definition|\[object Object\]/i);
});

test("explicit Definition Type target narrows options without relying on RPG-specific field names",async()=>{
  globalThis.foundry??={applications:{api:{ApplicationV2:class {async _prepareContext(){return {}}},HandlebarsApplicationMixin:Base=>Base}}};
  const {ConfiguratorEntryEditor}=await import("../src/configurator/configurator-entry-editor.mjs");
  const {createConfiguratorAPI}=await import("../src/configurator/configurator-api.mjs");
  const {emptyStorageSnapshot}=await import("../src/configurator/configurator-storage.mjs");
  class Store {constructor(){this.snapshot=emptyStorageSnapshot();}async load(){return structuredClone(this.snapshot);}async save(v){this.snapshot=structuredClone(v);}}
  const api=await createConfiguratorAPI(new Store());
  const {versionId}=await api.createRuleset({id:"kind-scope",nameKey:"Règles",version:"1"});
  for(const id of ["t1","t2"])await api.registerDefinitionType(versionId,{id,key:id,nameKey:id,fields:id==="t1"?{refs:{id:"refs",name:"Any references",valueType:"reference",cardinality:"many",referenceTarget:{objectKind:"definition",definitionTypeId:"t1"}}}:{},allowedCapabilities:[],defaultCapabilities:[],requiredCapabilities:[]});
  for(const [id,type] of [["one","t1"],["two","t2"]])await api.createDefinition(versionId,{id,key:id,nameKey:id,definitionTypeId:type,capabilities:[],data:{}});
  const ctx=await new ConfiguratorEntryEditor({api,versionId,kind:"definition",id:"one"})._prepareContext({});
  assert.deepEqual(ctx.fieldContract.find(f=>f.id==="refs").referenceChoices.map(x=>x.label),["one"]);
});

test("all data-fed editor options and pickers carry a metadata color hook; world Actors legitimately do not",()=>{
  const editor=file("templates/configurator/entry-editor.hbs");
  const configurator=file("templates/configurator/configurator.hbs");
  const options=[...editor.matchAll(/\{\{#each ([^}]+)\}\}\s*<option\b([^>]*?)>/g)];
  assert.ok(options.length>=25);
  for(const [match,collection,attrs] of options){
    if(["documentActorTypes","documentItemTypes","actionPurposeChoices"].includes(collection))continue; // Host-system identifiers and fixed engine purposes have no Ruleset family color.
    assert.match(attrs,/data-rta-colors="\{\{colors\}\}"/,collection);
  }
  const labels=[...editor.matchAll(/<label\b[^>]*data-picker-option[^>]*>/g)];
  assert.ok(labels.length>=10);
  for(const [markup] of labels)assert.match(markup,/data-rta-colors="\{\{colors\}\}"/);
  for(const collection of ["runtimeTests","runtimeActions","runtimeFormulas","runtimeConditions","runtimeEvents"]){
    assert.match(configurator,new RegExp(`\\{\\{#each ${collection}\\}\\}\\<option value="\\{\\{id\\}\\}" data-rta-colors="\\{\\{colors\\}\\}"`));
  }
  const dynamic=file("src/configurator/configurator-entry-editor.mjs");
  assert.match(dynamic,/colors:selectColorsAttribute\(this\.#optionColors\(x\.objectKind,x\.entry\)\)/);
});
test("Reference Target advanced JSON constraints are retained when selecting a reference kind",()=>{
  const editor=file("src/configurator/entry-field-serialization.mjs");
  assert.match(editor,/const advancedTarget=referenceText\?json\(referenceText,null\):null/);
  assert.match(editor,/const target=\{\.\.\.\(advancedTarget\?\?\{\}\)\}/);
  assert.match(editor,/if\(referenceKind\)target\.objectKind=referenceKind/);
});
