import test from "node:test";
import assert from "node:assert/strict";

// Foundry rendering invokes _prepareContext for every editor kind, even when
// the operand editor is not visible. A populated parameter/formula catalog
// used to cause ReferenceError: withColors is not defined.
globalThis.foundry ??= {applications:{api:{ApplicationV2:class {async _prepareContext(){return {}}},HandlebarsApplicationMixin:Base=>Base}}};
const {ConfiguratorEntryEditor}=await import("../src/configurator/configurator-entry-editor.mjs");
const {createConfiguratorAPI}=await import("../src/configurator/configurator-api.mjs");
const {emptyStorageSnapshot}=await import("../src/configurator/configurator-storage.mjs");
class Store {
  constructor(){this.snapshot=emptyStorageSnapshot();}
  async load(){return structuredClone(this.snapshot);}
  async save(value){this.snapshot=structuredClone(value);}
}

test("all editor contexts render operands with populated catalogs without undefined color helper",async()=>{
  const api=await createConfiguratorAPI(new Store());
  const {versionId}=await api.createRuleset({id:"operand-regression",nameKey:"Ruleset",version:"1.0.0",familyColors:{parameters:"#ac391a",formulas:"#395abc"},sectionColorOverrides:{rules:true}});
  await api.createParameter(versionId,{id:"base",nameKey:"Base",valueType:"number",value:5,scope:"ruleset",enabled:true,order:10,tags:[]});
  await api.createFormula(versionId,{id:"computed",nameKey:"Computed",resultType:"number",expression:{type:"parameter",id:"base"},enabled:true,order:10,tags:[]});
  await api.createCondition(versionId,{id:"condition",nameKey:"Condition",expression:{type:"gt",left:{type:"formula",id:"computed"},right:{type:"parameter",id:"base"}},enabled:true,order:10,tags:[]});
  const kinds=[{kind:"parameter",id:"base"},{kind:"formula",id:"computed"},{kind:"condition",id:"condition"},{kind:"formula"},{kind:"condition"}];
  for(const options of kinds){
    const context=await new ConfiguratorEntryEditor({api,versionId,...options})._prepareContext({});
    assert.equal(context.formulaModel.operands[0].parameterChoices[0].label,"Base");
    assert.equal(context.formulaModel.operands[0].parameterChoices[0].colors,"#ac391a");
    assert.equal(context.formulaModel.operands[0].formulaChoices[0].colors,"#395abc");
    assert.equal(context.conditionModel.left.parameterChoices[0].colors,"#ac391a");
    assert.equal(context.conditionModel.right.formulaChoices[0].colors,"#395abc");
  }
});

test("every editor kind prepares an empty draft with populated parameter/formula catalogs",async()=>{
  const api=await createConfiguratorAPI(new Store());
  const {versionId}=await api.createRuleset({id:"all-editor-kinds",nameKey:"Ruleset",version:"1.0.0"});
  await api.createParameter(versionId,{id:"p",nameKey:"Parameter",valueType:"number",value:1,scope:"ruleset",enabled:true,order:1,tags:[]});
  await api.createFormula(versionId,{id:"f",nameKey:"Formula",resultType:"number",expression:{type:"parameter",id:"p"},enabled:true,order:1,tags:[]});
  const kinds=["ruleset","definitionType","definition","parameter","formula","formulaBinding","condition","roll","outcome","test","effect","action","permissionPolicy","eventType","trigger","contentType","contentTemplate","tag","reference","modifier","restriction","duration","creationSystem","progressionSystem","sheetDefinition"];
  for(const kind of kinds){
    const context=await new ConfiguratorEntryEditor({api,versionId,kind})._prepareContext({});
    assert.ok(context.formulaModel,`formula model missing for ${kind}`);
    assert.ok(context.conditionModel,`condition model missing for ${kind}`);
    if(kind!=="ruleset")assert.equal(context.formulaModel.operands[0].parameterChoices[0].label,"Parameter",kind);
  }
});
