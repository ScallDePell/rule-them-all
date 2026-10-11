import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {createRulesetData} from "../src/configurator/configurator-schema.mjs";
import {validateRulesetSchema} from "../src/configurator/configurator-validation.mjs";
import {readCssBundle} from './helpers/css-bundle.mjs';

const root=path.resolve(new URL("..",import.meta.url).pathname);

test("Ruleset family colors are presentation-only configuration with neutral fallback",()=>{
  const ruleset=createRulesetData({id:"r",nameKey:"R",version:"1.0.0",familyColors:{formulas:"#123456"}});
  assert.equal(validateRulesetSchema(ruleset).valid,true);
  assert.deepEqual(ruleset.familyColors,{formulas:"#123456"});
  ruleset.familyColors.unknown="#ffffff";
  assert.equal(validateRulesetSchema(ruleset).valid,false);
});

test("Rule Them'All restored shell keeps workspace, cards and entry footer",()=>{
  const main=fs.readFileSync(path.join(root,"templates/configurator/configurator.hbs"),"utf8");
  const editor=fs.readFileSync(path.join(root,"templates/configurator/entry-editor.hbs"),"utf8");
  const css=readCssBundle();
  assert.match(main,/rta-configurator__workspace/);
  assert.match(main,/rta-config-card-grid/);
  assert.match(main,/data-action="navigate"/);
  assert.match(editor,/RTA\.Template\.SaveQuit/);
  assert.match(editor,/data-footer-action="cancel"/);
  assert.match(editor,/RTA\.Colors\.Sections/);
  assert.match(editor,/data-field-definition-list/);
  assert.match(editor,/data-definition-field/);
  assert.match(editor,/rta-capability-contracts/);
  assert.match(css,/\.rta-field-editor/);
  assert.match(css,/\.rta-configurator__sidebar/);
  assert.match(css,/\.rta-config-card-grid/);
  assert.match(css,/\.rta-config-entry__footer-actions/);
});

test("v0.2.4 field ergonomics and drag ordering remain in the restored shell", async () => {
  const editor=fs.readFileSync(path.join(root,"templates/configurator/entry-editor.hbs"),"utf8");
  const app=fs.readFileSync(path.join(root,"templates/configurator/configurator.hbs"),"utf8");
  const css=readCssBundle();
  assert.match(editor, /data-field-prop="name"/);
  assert.match(editor, /data-field-prop="min"/);
  assert.match(editor, /data-field-prop="max"/);
  assert.match(editor, /data-field-prop="step"/);
  assert.match(editor, /rta-field-editor__details/);
  assert.match(app, /data-orderable-card/);
  assert.match(app, /lifecycle\.canMutate/);
  assert.match(css, /single-line Ruleset header/);
});

test("v0.3.1 keeps rule-family editors and removes ID entry from normal relationships",()=>{
  const html=fs.readFileSync(path.join(root,"templates/configurator/entry-editor.hbs"),"utf8");
  for(const token of ["isParameter","isFormula","isCondition","isEffect","isAction","isPermissionPolicy","isEventType","isTrigger","isContentTemplate"]) assert.match(html,new RegExp(token));
  assert.doesNotMatch(html,/one ID per line/i);
  assert.doesNotMatch(html,/Event Type ID/);
  assert.doesNotMatch(html,/Object ID/);
  assert.match(html,/name="conditionRefs" value="{{id}}"/);
  assert.match(html,/name="effectRefs" value="{{id}}"/);
  assert.match(html,/name="eventTypeId" required/);
  assert.match(html,/name="targetRef" required/);
  assert.match(html,/RTA\.Template\.AdvancedRawAst/);
  assert.match(html,/RTA\.Template\.AdvancedTechnical/);
});

test("v0.3.2 keeps compact Definition fields and adds collapsible relationship pickers",()=>{
  const html=fs.readFileSync(path.join(root,"templates/configurator/entry-editor.hbs"),"utf8");
  const css=readCssBundle();
  assert.match(html,/class="form-group rta-definition-field"/);
  assert.match(html,/<label>{{label}}<\/label>/);
  assert.doesNotMatch(html,/rta-definition-field__heading/);
  assert.match(css,/v0\.3\.1 No IDs UI/);
  assert.match(css,/v0\.3\.2/);
  assert.match(html,/data-picker-summary/);
  assert.match(html,/data-picker-filter/);
  assert.match(html,/data-formula-builder/);
  assert.match(html,/data-condition-builder/);
  assert.match(css,/\.rta-rule-builder/);
});


test('v0.4.1 exposes a Foundry-first Runtime Lab without replacing Actor or Roll infrastructure',()=>{const app=fs.readFileSync(new URL('../src/configurator/configurator-app.mjs',import.meta.url),'utf8');const tpl=fs.readFileSync(new URL('../templates/configurator/configurator.hbs',import.meta.url),'utf8');assert.match(app,/runtimeLab/);assert.match(tpl,/RTA\.Template\.GuidedSandboxPrepareActorsSetValuesChooseOneRuleRunItReadTheResult/);assert.match(tpl,/runtimePreviewAction/);assert.match(tpl,/runtimeRoll/);});

test('v0.5.0 exposes Test Roll Outcome editors and Runtime Lab test Actors',()=>{
 const app=fs.readFileSync(path.join(root,'src/configurator/configurator-app.mjs'),'utf8'),tpl=fs.readFileSync(path.join(root,'templates/configurator/configurator.hbs'),'utf8'),entry=fs.readFileSync(path.join(root,'templates/configurator/entry-editor.hbs'),'utf8');
 assert.match(app,/kind:"roll"/);assert.match(app,/kind:"outcome"/);assert.match(app,/kind:"test"/);
 assert.match(tpl,/runtimeCreateActors/);assert.match(tpl,/runtimeTest/);assert.match(entry,/isRoll/);assert.match(entry,/isOutcome/);assert.match(entry,/isTest/);
});

test('v0.5.4 Runtime Lab initializes both context Actors and allows deleting validated active versions',()=>{
  const app=fs.readFileSync(path.join(root,'src/configurator/configurator-app.mjs'),'utf8');
  const tpl=fs.readFileSync(path.join(root,'templates/configurator/configurator.hbs'),'utf8');
  assert.match(app,/new Set\(\[this\.#runtimeSelection\.source,this\.#runtimeSelection\.target\]/);
  assert.match(tpl,/RTA\.Template\.InitializeBothActors/);
  assert.match(app,/Deactivate and delete it\?/);
  assert.match(app,/await api\.setActiveVersionId\(null\)/);
  assert.match(app,/canDelete:true/);
});


test('v0.5.5 Runtime Lab is guided and supports direct runtime value editing',()=>{
 const app=fs.readFileSync(path.join(root,'src/configurator/configurator-app.mjs'),'utf8'),tpl=fs.readFileSync(path.join(root,'templates/configurator/configurator.hbs'),'utf8'),engine=fs.readFileSync(path.join(root,'src/runtime/runtime-engine.mjs'),'utf8');
 assert.match(tpl,/RTA\.Template\.PrepareTheTestActors/);assert.match(tpl,/RTA\.Template\.SetTheValuesYouWantToTest/);assert.match(tpl,/RTA\.Template\.ChooseWhatYouWantToTest/);assert.match(tpl,/RTA\.Template\.ReadTheResult/);
 assert.match(tpl,/runtimeUpdateState/);assert.match(app,/setDefinitionState/);assert.match(engine,/async setDefinitionState/);
});

test('v0.6.1 Derived Outputs open in the standard editor and Events/Tags use visual editors',()=>{
 const app=fs.readFileSync(path.join(root,'src/configurator/configurator-app.mjs'),'utf8');
 const editorJs=fs.readFileSync(path.join(root,'src/configurator/configurator-entry-editor.mjs'),'utf8');
 const html=fs.readFileSync(path.join(root,'templates/configurator/entry-editor.hbs'),'utf8');
 assert.match(editorJs,/ENTRY_OPERATIONS\[this\.#kind\]/);
 const ops=fs.readFileSync(path.join(root,"src/configurator/entry-operations.mjs"),"utf8");
 assert.match(ops,/formulaBinding:\{get:"getFormulaBinding"/);
 assert.match(html,/\{\{#if isFormulaBinding\}\}/);
 assert.match(html,/data-event-field-list/);
 assert.match(html,/name="roles" value="\{\{id\}\}"/);
 assert.doesNotMatch(html,/textarea name="payloadFieldsJson"/);
 assert.doesNotMatch(html,/textarea name="tags"/);
 assert.match(app,/kind:"tag"/);
 assert.match(html,/\{\{#if isTag\}\}/);
 assert.match(html,/name="tags" value="\{\{id\}\}"/);
});


test('v0.7.3 Content mirrors Definition UX with dynamic families, fields, color and Foundry images',()=>{
 const editor=fs.readFileSync(new URL('../templates/configurator/entry-editor.hbs',import.meta.url),'utf8');
 const app=fs.readFileSync(new URL('../src/configurator/configurator-app.mjs',import.meta.url),'utf8');
 assert.match(app,/view:`content:\$\{type.id\}`/);
 assert.match(app,/this.#view.startsWith\("content:"\)/);
 assert.match(editor,/data-action="chooseImage"/);
 assert.match(editor,/name="color" type="color"/);
 assert.match(editor,/data-field-definition-list/);
 assert.match(editor,/name="contentTypeId" type="hidden"/);
 assert.match(editor,/name="templateCapabilities"/);
 assert.match(editor,/RTA\.Template\.ReferenceTarget/);
});

test("v0.7.2 Content Types and Templates expose Foundry library synchronization", async()=>{
  const app=fs.readFileSync(new URL("../src/configurator/configurator-app.mjs",import.meta.url),"utf8");
  const tpl=fs.readFileSync(new URL("../templates/configurator/configurator.hbs",import.meta.url),"utf8");
  const manifest=JSON.parse(fs.readFileSync(new URL("../module.json",import.meta.url),"utf8"));
  assert.match(app,/syncContentLibraries/);
  assert.match(tpl,/RTA\.Template\.SyncFoundryLibraries/);
  assert.match(app,/isContentLibraries/);
  assert.equal(manifest.documentTypes,undefined);
});

test("v0.8.0 Content bindings expose visual Definition initial values instead of raw initial-state JSON",()=>{
  const template=fs.readFileSync(new URL("../templates/configurator/entry-editor.hbs",import.meta.url),"utf8"), editor=fs.readFileSync(new URL("../src/configurator/configurator-entry-editor.mjs",import.meta.url),"utf8"), serializer=fs.readFileSync(new URL("../src/configurator/entry-data-collector.mjs",import.meta.url),"utf8");
  assert.match(template,/RTA\.Template\.DefinitionsGranted/);assert.match(template,/data-binding-slot="value\.base"/);assert.match(template,/data-binding-slot="pool\.maximum"/);assert.doesNotMatch(template,/initialStateRulesJson/);
  assert.match(editor,/definitionBindingRows/);assert.match(serializer,/collectTemplateAcquisitions/);
});

test("v0.8.1 Content Templates expose guided acquisition choice groups without technical IDs",()=>{
  const editor=fs.readFileSync(new URL("../templates/configurator/entry-editor.hbs",import.meta.url),"utf8");
  assert.match(editor,/RTA\.Template\.AcquisitionChoices/);assert.match(editor,/data-choice-group-list/);assert.match(editor,/choiceTargetRef/);assert.match(editor,/data-choice-prop="operation"/);assert.match(editor,/RTA\.Template\.AddChoice/);
});
