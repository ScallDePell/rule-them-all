import {effectOperationRegistry} from "./operation-registries.mjs";
import {collectCreationSteps} from "./creation-step-serialization.mjs";
import {collectEntryData} from "./entry-data-collector.mjs";
import {constraintRowModel,presentationRowModel} from "./declarative-editor.mjs";
import {CONSTRAINT_KINDS} from "./declarative-contracts.mjs";
import {assertPersistedRelations} from "./relation-persistence.mjs";
import {buildFieldRow,buildNewFieldRow,buildEventFieldRow,buildDefinitionFieldModel,valueTypeChoices,valueTypeLabel} from "./entry-field-models.mjs";
import {localizedText} from "../ui/ui-localization.mjs";
import {buildRuleReferenceChoices} from "./entry-reference-catalog.mjs";
import {buildSlotFormContext,syncValueSource,syncEntryMode,valueBoundsContext} from "./slot-form.mjs";
import {wireOrderedLists} from "../ui/ordered-list.mjs";
import {modifierFormContext,durationFormContext} from "./modifier-duration-form.mjs";
import {permissionFormContext} from "./permission-form.mjs";
import {triggerFilterContext} from "./trigger-filter-form.mjs";
import {SYSTEM_EVENT_TYPES} from "./system-events.mjs";
import {outcomeMappingContext} from "./action-outcome-form.mjs";
import {eventPayloadContext} from "./action-event-payload-form.mjs";
import {capabilityRole,capabilityRoleFlags,capabilityLabel} from "./capability-type-registry.mjs";
import {availableDocumentTypes,documentTypeLabel} from "../core/system-document-types.mjs";

import {pickerSummary,missingTargetLabel,editorDisplayTitle} from "../ui/editor-display-text.mjs";
import {refToken,parseRefToken} from "./reference-token.mjs";
import {expressionBuilderModel,blockView,slotView,reshapeBlock,editorOperations,blockShape,contextPathSuggestions} from "./entry-expression-model.mjs";
import {readSlotForm,readBlockForm,collectExpression} from "./entry-expression-serialization.mjs";
import {renderExpressionBuilderHTML,renderExpressionBlockHTML,renderExpressionSlotHTML} from "../ui/expression-builder-markup.mjs";
import {buildFieldReferenceChoices} from "./field-reference-choices.mjs";
import {createEntrySeed} from "./entry-seed.mjs";
import {ENTRY_OPERATIONS} from "./entry-operations.mjs";
import {renderPickerOptions,renderChoiceListBody,renderCreationCheckboxPicker} from "../ui/picker-markup.mjs";
import {renderSelectOptions,renderCreationKindsOptions} from "../ui/select-option-markup.mjs";
export {renderPickerOptions,renderChoiceListBody} from "../ui/picker-markup.mjs";
import {renderChoiceGroupHTML,renderCreationStepHTML} from "../ui/entry-editor-markup.mjs";
import {renderDeclarativeConstraintRow} from "../ui/declarative-editor-markup.mjs";
import {escapeHTML as escape} from "../ui/html-utils.mjs";
import {renderNewEventFieldInnerHTML} from "../ui/entry-editor-markup.mjs";
import {RULESET_SECTIONS,rulesetColor,sectionColor,mayOverrideSection,sectionForCollection,objectColor} from "./ruleset-colors.mjs";
import {RTA_NEUTRAL_COLOR} from "../ui/theme-tokens.mjs";
import {MODULE_ID} from "../core/module-contract.mjs";
import {createSelectColorResolver,referenceKindTitle,selectColorsAttribute} from "../ui/select-option-presentation.mjs";
import {confirmRTA} from "./foundry-dialogs.mjs";
import {entryDeletionView,deleteRulesetEntry} from "./entry-deletion.mjs";
import {entryHelp} from "./entry-help.mjs";
import {RTASelect} from "../ui/rta-select.mjs";
import {relationCatalog,relationRowModel,collectRelationRows} from "./generic-relations.mjs";
import {renderRelationRow} from "../ui/relation-editor-markup.mjs";
import {ConfiguratorWindow} from "./configurator-window.mjs";
import {formatEditorValue} from "./editor-value.mjs";
import {getCreationSources, getCreationSourceDescriptor} from "./creation-source-catalog.mjs";
import {diagnosticFocusTargets,saveErrorFocusPath} from "./diagnostic-focus.mjs";
import {buildTestInputContext,syncTestInputSource} from "./test-input-form.mjs";
import {dieContext,syncDieFaceCounts} from "./die-form.mjs";
import {CREATION_STEP_KINDS,SHEET_HEADERS,SHEET_TARGETS,STATE_STACKING} from "./rule-contracts.mjs";
import {SheetLayoutController} from "./sheet-layout-controller.mjs";
import {rollVariantContext,extraRollContext,actionInputContext,tableRowContext,scaleRowContext,progressionContext} from "./rule-cards-form.mjs";
import {syncCard} from "./card-form.mjs";
import {moduleLanguage} from "../core/module-language.mjs";


const uid=prefix=>`${prefix}-${crypto.randomUUID?.()??Math.random().toString(36).slice(2)}`;
const fieldUid=()=>`field-${crypto.randomUUID?.()??Math.random().toString(36).slice(2)}`;
/** Families whose relations the runtime reads: Content Template grants and Definition relationCount. */
const RELATION_KINDS=Object.freeze(["definition","contentTemplate"]);
const copy=value=>value===undefined?undefined:JSON.parse(JSON.stringify(value));
const json=(value,fallback)=>{const text=String(value??"").trim();return text?JSON.parse(text):fallback;};
const checked=form=>name=>form.querySelector(`[name="${CSS.escape(name)}"]`)?.checked===true;
const uiText=(key,fallback)=>{const i18n=globalThis.game?.i18n;const translated=i18n?.localize?.(`RTA.DynamicUI.${key}`);return translated&&translated!==`RTA.DynamicUI.${key}`?translated:fallback;};
// A constraint field in words: its name, or "Relations".
const constraintFieldLabel=(data,id)=>id==="relations"?localizedText("RTA.Declarative.Relations","Relations"):data.fields?.[id]?.name||id;
// A capability contract row, with its value type and cardinality in words.
const contractRow=item=>({...item,valueTypeLabel:valueTypeLabel(item.valueType),cardinalityLabel:localizedText(item.cardinality==="many"?"RTA.Template.Many":"RTA.Template.One",item.cardinality??"one")});
const selection=(items,selected=[])=>{const set=new Set(selected??[]);return items.map(item=>({...item,selected:set.has(item.id)}));};
export class ConfiguratorEntryEditor extends ConfiguratorWindow {
  static DEFAULT_OPTIONS={window:{title:"Rule Them'All Entry",resizable:true},position:{width:760,height:760}};
  static PARTS={content:{template:`modules/${MODULE_ID}/templates/configurator/entry-editor.hbs`,scrollable:["[data-entry-scroll]","[data-entry-scroll-tools]","[data-entry-scroll-layers]"]}};
  static MINIMUM={width:560,height:440};

  #api; #optionColors=()=>[]; #renderCatalog=null; #versionId; #kind; #id; #definitionTypeId; #contentTypeId; #baseline; #error=""; #dirty=false; #onSaved; #focusPath=null;
  constructor({api,versionId,kind,id=null,definitionTypeId=null,contentTypeId=null,focusPath=null,onSaved=()=>{}},options={}){
    super(kind==="sheetDefinition"?{position:{width:1320,height:860},...options}:options);this.#focusPath=focusPath;this.#api=api;this.#versionId=versionId;this.#kind=kind;this.#id=id;this.#definitionTypeId=definitionTypeId;this.#contentTypeId=contentTypeId;this.#onSaved=onSaved;
  }

  #read(){
    if(this.#kind==="ruleset") return this.#id?this.#api.getRuleset(this.#versionId):null;
    const meta=ENTRY_OPERATIONS[this.#kind]; return this.#id?this.#api[meta.get](this.#versionId,this.#id):null;
  }

  // A render already holds a detached copy of the full Ruleset. Reusing it
  // avoids copying the whole aggregate for each catalog/option lookup.
  // Outside _prepareContext(), always consult the current API (no stale data).
  #renderList(collection,method){
    // A new Ruleset has no version or catalogs until its first save.
    if(this.#kind==="ruleset"&&!this.#id)return [];
    return this.#renderCatalog ? (this.#renderCatalog[collection]??[]) : this.#api[method](this.#versionId);
  }
  #renderGet(collection,id,method){
    if(this.#kind==="ruleset"&&!this.#id)return undefined;
    return this.#renderCatalog ? (this.#renderCatalog[collection]??[]).find(entry=>entry.id===id) : this.#api[method](this.#versionId,id);
  }

  #editorFieldModel(id,field,data,creating,source="type"){
    const hasValue=Object.hasOwn(data,id),hasDefault=Object.hasOwn(field,'defaultValue');
    const shown=hasValue?data[id]:(field.required&&hasDefault?field.defaultValue:undefined);
    const referenceChoices=buildFieldReferenceChoices(field,shown,{
      listCollection:collection=>this.#renderCatalog?.[collection]
        ??this.#api.getRuleset(this.#versionId)?.[collection]??[],
      findDefinitionType:id=>this.#renderGet('definitionTypes',id,'getDefinitionType'),
      optionColors:(kind,entry)=>this.#optionColors(kind,entry),
      language:moduleLanguage()
    });
    return buildDefinitionFieldModel(id,field,data,creating,source,{referenceChoices});
  }

  #referenceChoices({mutableOnly=false}={}){
    if(this.#kind==='ruleset'&&!this.#id)return [];
    return buildRuleReferenceChoices({
      definitions:this.#renderList('definitions','listDefinitions'),
      parameters:mutableOnly?[]:this.#renderList('parameters','listParameters'),
      formulas:mutableOnly?[]:this.#renderList('formulas','listFormulas'),
      findCapability:id=>this.#api.getCapabilityType(id),
      optionColors:(kind,entry)=>this.#optionColors(kind,entry),
      language:moduleLanguage(),mutableOnly
    });
  }

  async _prepareContext(options){
    const context=await super._prepareContext(options),record=this.#api.getRulesetVersion(this.#versionId),existing=this.#read();
    this.#renderCatalog=record?.workingDraft??null;
    try {
    if(this.#baseline===undefined)this.#baseline=copy(existing);
    const creating=!existing,data=copy(existing)??this.#freshSeed();
    const isValidated=record?.status==="validated";
    const colorContext=record?.workingDraft??{};
    const selectableDefinitionTypes=this.#renderList("definitionTypes","listDefinitionTypes");
    this.#optionColors=createSelectColorResolver({definitionTypes:selectableDefinitionTypes,contentTypes:this.#renderList("contentTypes","listContentTypes"),familyColors:colorContext.familyColors??{},ruleset:colorContext});
    const withColors=(kind,entry)=>({colors:selectColorsAttribute(this.#optionColors(kind,entry))});
    const capabilityTypes=this.#api.listCapabilityTypes();
    let type=null,fieldContract=[];
    if(this.#kind==="definition"){
      type=this.#renderGet("definitionTypes",data.definitionTypeId,"getDefinitionType");
      const direct=Object.entries(type?.fields??{}).map(([id,field])=>this.#editorFieldModel(id,field,data.data??{},creating,"type"));
      const injected=[];
      for(const capId of data.capabilities??[]){const cap=this.#api.getCapabilityType(capId);for(const [id,field] of Object.entries(cap?.fields??{}))injected.push(this.#editorFieldModel(id,field,data.data??{},creating,capId));}
      fieldContract=[...direct,...injected];
    }
    if(this.#kind==="contentTemplate"){
      type=this.#renderGet("contentTypes",data.contentTypeId,"getContentType");
      fieldContract=Object.entries(type?.fields??{}).map(([id,field])=>this.#editorFieldModel(id,field,data.data??{},creating,"contentType"));
    }
    const capabilityChoices=capabilityTypes.map(cap=>({
      ...cap,label:capabilityLabel(cap.id),...capabilityRoleFlags(capabilityRole(data,cap.id)),
      selected:(data.capabilities??[]).includes(cap.id),permitted:!type||(type.allowedCapabilities??[]).includes(cap.id),forced:!!type&&(type.requiredCapabilities??[]).includes(cap.id),
      fieldItems:Object.values(cap.fields??{}).map(contractRow),outputItems:Object.values(cap.outputs??{}).map(contractRow),hasContract:Object.keys(cap.fields??{}).length>0||Object.keys(cap.outputs??{}).length>0
    }));
    const hasForcedCapabilities=capabilityChoices.some(cap=>cap.permitted&&cap.forced);
    const hasOptionalCapabilities=capabilityChoices.some(cap=>cap.permitted&&!cap.forced);
    const colorSectionChoices=RULESET_SECTIONS.map(section=>({id:section.id,title:globalThis.game?.i18n?.localize?.(section.titleKey)??section.id,color:sectionColor(data,section.id),allowOverrides:mayOverrideSection(data,section.id),hasSubsections:section.collections.length>0}));
    const typeCollection=this.#kind==='definitionType'?'definitionTypes':this.#kind==='contentType'?'contentTypes':this.#kind==='tag'?'tags':null;
    const allowTypeColor=!!typeCollection && mayOverrideSection(colorContext,sectionForCollection(typeCollection));
    const inheritedTypeColor=typeCollection?objectColor(colorContext,typeCollection,null):RTA_NEUTRAL_COLOR;
    const fieldKinds=["definitionType","contentType"].includes(this.#kind),fieldDefinitionTypes=fieldKinds?selectableDefinitionTypes.map(type=>({...type,colors:selectColorsAttribute(this.#optionColors("definitionType",type))})):[];
    const fieldRows=fieldKinds?Object.entries(data.fields??{}).map(([id,field])=>buildFieldRow(id,field,this.#api.listValueTypes(),fieldDefinitionTypes)):[];
    const newFieldRow=fieldKinds?buildNewFieldRow(this.#api.listValueTypes(),fieldDefinitionTypes):null;
    const lists={listParameters:"parameters",listFormulas:"formulas",listFormulaBindings:"formulaBindings",listConditions:"conditions",listRolls:"rolls",listOutcomes:"outcomes",listTests:"tests",listEffects:"effects",listActions:"actions",listEventTypes:"eventTypes",listContentTypes:"contentTypes",listContentTemplates:"contentTemplates",listDefinitions:"definitions",listCategories:"categories",listTags:"tags",listModifiers:"modifiers",listDurations:"durations",listDice:"dice",listTables:"tables",listScales:"scales"};
    const list=method=>(this.#kind==="ruleset" && !this.#id)?[]:this.#renderList(lists[method],method);
    const parameters=list("listParameters"), formulas=list("listFormulas"), formulaBindings=list("listFormulaBindings"), conditions=list("listConditions"), rolls=list("listRolls"), outcomes=list("listOutcomes"), tests=list("listTests"), effects=list("listEffects"), actions=list("listActions"), eventTypes=list("listEventTypes"), contentTypes=list("listContentTypes"), definitions=list("listDefinitions"), categories=list("listCategories"), tags=list("listTags");
    const conditionChoices=selection(conditions.map(x=>({id:x.id,label:x.nameKey,...withColors("condition",x)})),data.conditionRefs);
    const rollChoices=[{id:"",label:uiText("NoRoll","No Roll: deterministic Test"),selected:!data.rollRef},...rolls.map(x=>({id:x.id,label:x.nameKey,...withColors("roll",x),selected:x.id===data.rollRef}))];
    const optionalFormula=(selected,emptyKey,emptyLabel)=>[{id:"",label:uiText(emptyKey,emptyLabel),selected:!selected},...formulas.map(x=>({id:x.id,label:x.nameKey,...withColors("formula",x),selected:x.id===selected}))];
    // A Definition's description scale, or its type's: what a sheet shows instead of the number.
    const scaleChoices=["definition","definitionType"].includes(this.#kind)?[{id:"",label:this.#kind==="definition"?uiText("ScaleOfType","That of its type"):uiText("NoScale","None"),colors:selectColorsAttribute([RTA_NEUTRAL_COLOR]),selected:!data.scaleRef},...list("listScales").map(x=>({id:x.id,label:x.nameKey,...withColors("scale",x),selected:x.id===data.scaleRef}))]:[];
    const totalFormulaChoices=optionalFormula(data.totalFormulaRef,"TotalFromRoll","Roll + bonus"),marginFormulaChoices=optionalFormula(data.marginFormulaRef,"MarginFromTotal","Total − target");
    // A Test checks its Outcomes in list order: chosen ones first, in that order, then the others (hidden).
    const outcomeById=new Map(outcomes.map(x=>[x.id,x])),chosenOutcomes=(data.outcomeRefs??[]).filter(id=>outcomeById.has(id));
    const outcomeRows=[...chosenOutcomes.map(id=>outcomeById.get(id)),...outcomes.filter(x=>!chosenOutcomes.includes(x.id))].map(x=>({id:x.id,label:x.nameKey,...withColors("outcome",x),selected:chosenOutcomes.includes(x.id)}));
    const testChoices=tests.map(x=>({id:x.id,label:x.nameKey,...withColors("test",x),selected:x.id===data.testRef}));
    const initiative=this.#kind==="ruleset"?data.initiative??null:null;
    // One list for the initiative roll: the Ruleset's Tests, then its Tables (a draw, like a card deck).
    const initiativeSourceChoices=this.#kind==="ruleset"?[...tests.map(x=>({id:`test:${x.id}`,label:x.nameKey,...withColors("test",x),selected:x.id===initiative?.testRef})),...list("listTables").map(x=>({id:`table:${x.id}`,label:x.nameKey,...withColors("table",x),selected:x.id===initiative?.tableRef}))]:[];
    const initiativeTieBreakChoices=this.#kind==="ruleset"?formulas.map(x=>({id:x.id,label:x.nameKey,...withColors("formula",x),selected:x.id===initiative?.tieBreakFormulaRef})):[];
    const availabilityChoices=[{id:"",label:uiText("AlwaysAvailable","Always available"),colors:selectColorsAttribute([RTA_NEUTRAL_COLOR]),selected:!data.availabilityConditionRef},...conditions.map(x=>({id:x.id,label:x.nameKey,...withColors("condition",x),selected:x.id===data.availabilityConditionRef}))];
    const outcomeConditionChoices=[{id:"",label:uiText("AlwaysFallback","Always (fallback result)"),selected:!data.conditionRef},...conditions.map(x=>({id:x.id,label:x.nameKey,selected:x.id===data.conditionRef}))];
    const bonusFormulaChoices=[{id:"",label:uiText("NoBonus","No bonus"),selected:!data.bonusFormulaRef},...formulas.map(x=>({id:x.id,label:x.nameKey,...withColors("formula",x),selected:x.id===data.bonusFormulaRef}))];
    const fallbackOutcomeChoices=[{id:"",label:uiText("NoFallbackOutcome","No fallback: fail explicitly"),selected:!data.fallbackOutcomeRef},...outcomes.map(x=>({id:x.id,label:x.nameKey,...withColors("outcome",x),selected:x.id===data.fallbackOutcomeRef}))];
    // One "Target" control: none, a fixed value, or a Formula.
    const fixedTarget=!data.targetFormulaRef&&!data.opposedTestRef&&data.targetValue!==null&&data.targetValue!==undefined;
    const targetSourceChoices=[{id:"",label:uiText("NoTarget","No target"),selected:!data.targetFormulaRef&&!fixedTarget},{id:"__fixed",label:uiText("FixedValue","Fixed value"),selected:fixedTarget},...formulas.map(x=>({id:x.id,label:x.nameKey,...withColors("formula",x),selected:x.id===data.targetFormulaRef})),
      // Opposed: the target is the total the target role makes on another Test (a dodge against an attack).
      ...tests.filter(x=>x.id!==data.id&&!x.opposedTestRef).map(x=>({id:`__opposed:${x.id}`,label:uiText("OpposedBy","Opposed by {test}").replace("{test}",x.nameKey),...withColors("test",x),selected:x.id===data.opposedTestRef}))];
    const showTestCalculation=Boolean(data.bonusFormulaRef||data.totalFormulaRef||data.marginFormulaRef);
    const effectChoices=effects.map(x=>({id:x.id,label:x.nameKey,...withColors("effect",x),costSelected:(data.costEffectRefs??[]).includes(x.id),effectSelected:(data.effectRefs??[]).includes(x.id)}));
    const actionChoices=selection(actions.map(x=>({id:x.id,label:x.nameKey,...withColors("action",x)})),data.actionRefs);
    // CP-16: the Definitions an Action acquires; a Content's acquisition Action.
    const acquiredDefinitionChoices=definitions.map(x=>({id:x.id,label:x.nameKey,...withColors("definition",x),selected:(data.acquisitions??[]).some(a=>a?.definitionId===x.id)}));
    // CP-28: states an Action applies or removes, Modifiers it makes persistent, and how long they last.
    const actionKind=this.#kind==="action",stateDefinitions=actionKind?definitions.filter(x=>(x.capabilities??[]).includes("state")):[],modifiers=actionKind?list("listModifiers"):[],durations=actionKind?list("listDurations"):[];
    // Each applied state says what happens when the target already has it, and how many stacks it adds.
    const appliedStateChoices=stateDefinitions.map(x=>{const applied=(data.stateApplications??[]).find(a=>a?.definitionId===x.id);return {id:x.id,label:x.nameKey,...withColors("definition",x),selected:Boolean(applied),stacks:applied?.stacks??1,
      stackingChoices:STATE_STACKING.map(id=>({id,labelKey:`RTA.Action.StateStacking.${id}`,colors:selectColorsAttribute([RTA_NEUTRAL_COLOR]),selected:id===(applied?.stacking??"refresh")}))};});
    const removedStateChoices=stateDefinitions.map(x=>({id:x.id,label:x.nameKey,...withColors("definition",x),selected:(data.stateRemovals??[]).some(a=>a?.definitionId===x.id)}));
    const appliedModifierChoices=modifiers.map(x=>({id:x.id,label:x.nameKey,...withColors("modifier",x),selected:(data.modifierApplications??[]).some(a=>a?.modifierRef===x.id)}));
    const appliedDurationRef=[...(data.stateApplications??[]),...(data.modifierApplications??[])].find(a=>a?.durationRef)?.durationRef??null;
    const stateDurationChoices=[{id:"",label:uiText("UntilRemoved","Until removed"),selected:!appliedDurationRef},...durations.map(x=>({id:x.id,label:x.nameKey,...withColors("duration",x),selected:x.id===appliedDurationRef}))];
    const acquisitionActionChoices=[{id:"",label:uiText("NoAcquisitionAction","No Action: grant directly"),selected:!data.acquisitionActionRef},...actions.map(x=>({id:x.id,label:x.nameKey,...withColors("action",x),selected:x.id===data.acquisitionActionRef}))];
    const eventTypeChoices=eventTypes.map(x=>({id:x.id,label:x.nameKey,...withColors("eventType",x),selected:x.id===data.eventTypeId,actionSelected:(data.eventTypeRefs??[]).includes(x.id)}));
    // A Trigger can also listen to the module's own events (combat, world clock); an Action cannot emit them.
    const systemEvents=SYSTEM_EVENT_TYPES.map(x=>({...x,nameKey:globalThis.game?.i18n?.localize?.(x.nameKey)??x.nameKey})),triggerEventChoices=[...eventTypeChoices,...systemEvents.map(x=>({id:x.id,label:x.nameKey,colors:selectColorsAttribute([RTA_NEUTRAL_COLOR]),selected:x.id===data.eventTypeId}))];
    const contentTypeChoices=contentTypes.map(x=>({id:x.id,label:x.nameKey,...withColors("contentType",x),selected:x.id===data.contentTypeId}));
    const relationTargetChoices=relationCatalog(this.#renderCatalog??{}).map(x=>({
      id:refToken(x),label:`${referenceKindTitle(x.objectKind,moduleLanguage().startsWith('fr'))} · ${x.label}`,
      colors:selectColorsAttribute(this.#optionColors(x.objectKind,x.entry)),
      objectKind:x.objectKind,objectId:x.objectId,valued:x.objectKind==="definition"&&(x.entry?.capabilities??[]).includes("value")
    }));
    // A granted value Definition can come with a bonus to its value (config.add["value.base"]).
    const choiceGroupRows=(data.choiceGroups??[]).map(group=>{
      const currentOptions=new Map((group.options??[]).map(option=>[refToken(option.targetRef??{}),option]));
      const operation=group.options?.[0]?.operation??'grant';
      const bonusRows=relationTargetChoices.filter(option=>option.valued).map(option=>({...option,selected:currentOptions.has(option.id),bonus:currentOptions.get(option.id)?.config?.add?.["value.base"]??""}));
      return {...group,operation,isGrant:operation==='grant',isUnlock:operation==='unlock',isLink:operation==='link',bonusRows,showBonuses:operation==='grant'&&bonusRows.some(row=>row.selected),
        targetOptions:relationTargetChoices.map(option=>({...option,selected:currentOptions.has(option.id)}))};
    });
    const referenceChoices=this.#referenceChoices(),mutableReferenceChoices=this.#referenceChoices({mutableOnly:true});
    // An Effect's operand and a Modifier's value source share one editor.
    const operandSource=this.#kind==="modifier"?data.valueSource:data.operand,needsOperand=this.#kind!=="effect"||effectOperationRegistry.get(data.operation??"set")?.operand!==false;
    const targetToken=refToken(data.targetRef??{}),operandKind=operandSource?.kind??"literal",operandRefToken=operandKind==="reference"?refToken(operandSource?.reference??{}):"";
    const referenceTargetToken=refToken(data);
    const bindingTargetToken=refToken(data.targetRef??{});
    const bindingFormulaChoices=formulas.map(x=>({id:x.id,label:x.nameKey,...withColors("formula",x),selected:x.id===data.formulaRef}));
    const neutralColors=selectColorsAttribute([RTA_NEUTRAL_COLOR]);
    const expression=data.expression??{type:"literal",value:this.#kind==="condition"?true:0};
    const expressionBuilder=["formula","condition"].includes(this.#kind)?this.#expressionBuilder(expression):null;
    const relationTargets=relationCatalog(this.#renderCatalog??{}, {exclude:{objectKind:this.#kind,objectId:data.id}});
    const relationRows=(data.relations??[]).map(relation=>relationRowModel(relation,relationTargets,(kind,entry)=>selectColorsAttribute(this.#optionColors(kind,entry))));
    const tagChoices=selection(tags.map(x=>({id:x.id,label:x.nameKey,...withColors("tag",x)})),data.tags);
    const tagSummary=pickerSummary(tagChoices);
    // Stored ids that no longer resolve stay visible so the GM can remove them.
    const categoryIds=new Set(categories.map(x=>x.id));
    const categoryChoices=selection([...categories.map(x=>({id:x.id,label:x.nameKey,...withColors("category",x)})),...(data.categories??[]).filter(id=>!categoryIds.has(id)).map(id=>({id,label:id,colors:RTA_NEUTRAL_COLOR}))],data.categories);
    const categorySummary=pickerSummary(categoryChoices);
    const eventFieldRows=this.#kind==="eventType"?Object.entries(data.payloadFields??{}).map(([id,field])=>buildEventFieldRow(id,field,this.#api.listValueTypes())):[];
    // An Effect acts on the target unless told otherwise; a binding reads its own container.
    const role=data.targetRole||(this.#kind==="effect"?"target":"self"),roleSelf=role==="self",roleSource=role==="source",roleTarget=role==="target",roleSubject=role==="subject",roleOwner=role==="owner",roleWorld=role==="world",roleCombat=role==="combat";
    const conditionSummary=pickerSummary(conditionChoices),costEffectSummary=pickerSummary(effectChoices,"costSelected"),effectSummary=pickerSummary(effectChoices,"effectSelected"),actionSummary=pickerSummary(actionChoices);
    Object.assign(context,{error:this.#error,kind:this.#kind,creating,readOnly:isValidated,deletion:creating?{blocked:false,reason:""}:this.#deletionView(),help:entryHelp(this.#kind,{definitionType:type}),data,type,fieldContract,fieldRows,newFieldRow,capabilityChoices,colorSectionChoices,rulesetMainColor:rulesetColor(data),allowTypeColor,inheritedTypeColor,hasCustomColor:!!data.color,valueTypes:valueTypeChoices(this.#api.listValueTypes().map(v=>v.id),data.valueType??data.resultType),
      documentActorTypes:availableDocumentTypes("Actor").map(id=>({id,label:documentTypeLabel("Actor",id),selected:data.storageKind==="actor"&&data.documentSubtype===id})),documentItemTypes:availableDocumentTypes("Item").map(id=>({id,label:documentTypeLabel("Item",id),selected:data.storageKind!=="actor"&&data.documentSubtype===id})),
      hasForcedCapabilities,hasOptionalCapabilities,conditionChoices,acquiredDefinitionChoices,acquisitionActionChoices,appliedStateChoices,hasAppliedStates:appliedStateChoices.some(x=>x.selected),removedStateChoices,appliedModifierChoices,stateDurationChoices,rollChoices,outcomeRows,fallbackOutcomeChoices,testChoices,bindingFormulaChoices,tagChoices,tagSummary,categoryChoices,categorySummary,eventFieldRows,contentTypeChoices,relationRows,hasRelations:RELATION_KINDS.includes(this.#kind),roleSelf,roleSource,roleTarget,roleSubject,roleOwner,roleWorld,roleCombat,outcomeConditionChoices,bonusFormulaChoices,targetSourceChoices,fixedTarget,showTestCalculation,effectChoices,actionChoices,eventTypeChoices,choiceGroupRows,conditionSummary,costEffectSummary,effectSummary,actionSummary,expressionBuilder,...(this.#kind==="sheetDefinition"?(()=>{const choices=selection(this.#renderList("contentTypes","listContentTypes").map(x=>({id:x.id,label:x.nameKey,...withColors("contentType",x)})),data.contentTypeIds??[]);return {sheetIsItem:data.target==="item",sheetContentTypeChoices:choices,sheetContentTypeSummary:pickerSummary(choices),sheetLayoutJSON:JSON.stringify(data.root??null),sheetThemeJSON:JSON.stringify(data.theme??null)};})():{}),sheetTargetChoices:SHEET_TARGETS.map(id=>({id,labelKey:`RTA.Sheet.Target${id[0].toUpperCase()}${id.slice(1)}`,colors:selectColorsAttribute([RTA_NEUTRAL_COLOR]),selected:(data.target??"actor")===id})),
      referenceChoices:referenceChoices.map(x=>({...x,selected:x.token===referenceTargetToken})),
      bindingTargetChoices:referenceChoices.filter(x=>parseRefToken(x.token).capabilityId).map(x=>({...x,selected:x.token===bindingTargetToken})),
      effectTargetChoices:mutableReferenceChoices.map(x=>({...x,selected:x.token===targetToken})),
      parameterChoices:parameters.map(x=>({id:x.id,label:x.nameKey,...withColors("parameter",x),selected:operandKind==="parameter"&&operandSource?.id===x.id})),formulaChoices:formulas.map(x=>({id:x.id,label:x.nameKey,...withColors("formula",x),selected:operandKind==="formula"&&operandSource?.id===x.id})),
      operandReferenceChoices:referenceChoices.map(x=>({...x,selected:x.token===operandRefToken})),operandKind,isOperandLiteral:operandKind==="literal",isOperandParameter:operandKind==="parameter",isOperandFormula:operandKind==="formula",isOperandReference:operandKind==="reference",isOperandRoll:operandKind==="roll",operandAllowsRoll:this.#kind==="effect",showOperand:Object.fromEntries(["literal","parameter","formula","reference","roll"].map(kind=>[kind,operandKind===kind&&needsOperand])),
      operandRollChoices:rolls.map(x=>({id:x.id,label:x.nameKey,...withColors("roll",x),selected:x.id===operandSource?.rollRef})),operandRollMultiplierChoices:[{id:"",label:uiText("NoMultiplier","×1"),selected:!operandSource?.multiplierFormulaRef},...formulas.map(x=>({id:x.id,label:x.nameKey,...withColors("formula",x),selected:x.id===operandSource?.multiplierFormulaRef}))],operandRollBonusChoices:[{id:"",label:uiText("NoBonus","No bonus"),selected:!operandSource?.bonusFormulaRef},...formulas.map(x=>({id:x.id,label:x.nameKey,...withColors("formula",x),selected:x.id===operandSource?.bonusFormulaRef}))],operandRollFactorChoices:[{id:"",label:uiText("NoFactor","×1"),selected:!operandSource?.factorFormulaRef},...formulas.map(x=>({id:x.id,label:x.nameKey,...withColors("formula",x),selected:x.id===operandSource?.factorFormulaRef}))],operandRollMinimum:Number.isFinite(operandSource?.minimum)?String(operandSource.minimum):"",operandLiteral:operandKind==="literal"?formatEditorValue("number","one",operandSource?.value??0):"",
      isRuleset:this.#kind==="ruleset",initiativeSourceChoices,initiativeTieBreakChoices,initiativeEachRound:initiative?.eachRound===true,initiativeBySide:initiative?.bySide===true,initiativePassStep:initiative?.passes?.step??"",initiativePassThreshold:initiative?.passes?.threshold??"",initiativeChosen:Boolean(initiative?.testRef||initiative?.tableRef),
      ...(this.#kind==="ruleset"?Object.fromEntries(["world","combat"].map(holder=>[`shared${holder[0].toUpperCase()}${holder.slice(1)}Choices`,definitions.map(x=>({id:x.id,label:x.nameKey,...withColors("definition",x),selected:(data.sharedDefinitions?.[holder]??[]).includes(x.id)}))])):{}),isDefinitionType:this.#kind==="definitionType",isDefinition:this.#kind==="definition",
      isParameter:this.#kind==="parameter",isFormula:this.#kind==="formula",isFormulaBinding:this.#kind==="formulaBinding",isCondition:this.#kind==="condition",isRoll:this.#kind==="roll",isOutcome:this.#kind==="outcome",isTest:this.#kind==="test",isEffect:this.#kind==="effect",isAction:this.#kind==="action",isTable:this.#kind==="table",isScale:this.#kind==="scale",scaleChoices,isDie:this.#kind==="die",
      isPermissionPolicy:this.#kind==="permissionPolicy",isSheetDefinition:this.#kind==="sheetDefinition",isTag:this.#kind==="tag",isCategory:this.#kind==="category",
      sheetPaletteOffered:data.sheetPalette!==false,
      sheetHeaderChoices:SHEET_HEADERS.map(id=>({id,labelKey:`RTA.Sheet.Header.${id}`,colors:selectColorsAttribute([RTA_NEUTRAL_COLOR]),selected:(data.header??"standard")===id})),
      valueBounds:this.#kind==="definitionType"||this.#kind==="definition"&&capabilityChoices.some(cap=>cap.id==="value"&&cap.permitted)?valueBoundsContext(data,{formulas,ofType:this.#kind==="definitionType",colorsOf:(kind,entry)=>withColors(kind,entry).colors,neutral:selectColorsAttribute([RTA_NEUTRAL_COLOR])}):null,
      slots:this.#kind==="definition"?buildSlotFormContext({definition:data,permittedCapabilities:capabilityChoices.filter(cap=>cap.permitted).map(cap=>cap.id),formulas,contentTypes,valueTypes:this.#api.listValueTypes(),colorsOf:(kind,entry)=>withColors(kind,entry).colors,neutral:selectColorsAttribute([RTA_NEUTRAL_COLOR])}):null,testInputs:this.#kind==="test"?buildTestInputContext({inputs:data.inputBindings??[],formulas:formulas.map(x=>({id:x.id,label:x.nameKey,...withColors("formula",x)})),references:this.#referenceChoices(),neutral:selectColorsAttribute([RTA_NEUTRAL_COLOR])}):null,totalFormulaChoices,marginFormulaChoices,isEventType:this.#kind==="eventType",isTrigger:this.#kind==="trigger",isContentType:this.#kind==="contentType",availabilityChoices,isContentTemplate:this.#kind==="contentTemplate",
      isCreationSystem:this.#kind==="creationSystem",creationStepRows:this.#kind==="creationSystem"?(data.steps??[]).map(step=>({html:this.#creationStepHTML(step)})):[],isGeneric:false,isProgressionSystem:this.#kind==="progressionSystem",isModifier:this.#kind==="modifier",isDuration:this.#kind==="duration",
      ...(this.#kind==="modifier"?modifierFormContext(data,{valueTargetChoices:referenceChoices.filter(x=>parseRefToken(x.token).capabilityId==="value").map(x=>({...x,selected:x.token===targetToken}))}):{}),
      ...(this.#kind==="duration"?durationFormContext(data,{eventTypes,conditions,withColors}):{}),
      ...(this.#kind==="roll"?rollVariantContext(data,{conditions,withColors}):{}),
      ...(this.#kind==="test"?extraRollContext(data,{conditions,rolls,withColors,neutral:selectColorsAttribute([RTA_NEUTRAL_COLOR])}):{}),
      ...(this.#kind==="action"?actionInputContext(data,{definitionTypes:selectableDefinitionTypes,withColors,neutral:selectColorsAttribute([RTA_NEUTRAL_COLOR])}):{}),
      ...(this.#kind==="progressionSystem"?progressionContext(data,{definitionTypes:selectableDefinitionTypes,definitions,formulas,conditions,actions,withColors,currencies:mutableReferenceChoices.filter(choice=>["pool.current","value.base"].includes(parseRefToken(choice.token).outputId))}):{}),
      ...(this.#kind==="die"?dieContext(data):{}),
      ...(this.#kind==="scale"?{...scaleRowContext(data),scaleBasisChoices:["value","percent"].map(id=>({id,labelKey:`RTA.Scale.Basis.${id}`,colors:neutralColors,selected:id===(data.basis??"value")}))}:{}),
      ...(this.#kind==="table"?{...tableRowContext(data,{actions,withColors}),tableRollChoices:rolls.map(x=>({id:x.id,label:x.nameKey,...withColors("roll",x),selected:x.id===data.rollRef})),tableBonusChoices:optionalFormula(data.bonusFormulaRef,"NoBonus","No bonus")}:{}),
      ...(this.#kind==="trigger"?{triggerHolderChoices:["actor","combat","world"].map(id=>({id,labelKey:`RTA.Trigger.Holders.${id}`,colors:selectColorsAttribute([RTA_NEUTRAL_COLOR]),selected:id===(data.holder??"actor")})),triggerActingChoices:["self","target"].map(id=>({id,labelKey:`RTA.Trigger.Acting.${id}`,colors:selectColorsAttribute([RTA_NEUTRAL_COLOR]),selected:id===(data.actingRole??"self")})),triggerModeChoices:["automatic","offer"].map(id=>({id,labelKey:`RTA.Trigger.Modes.${id}`,colors:selectColorsAttribute([RTA_NEUTRAL_COLOR]),selected:id===(data.mode??"automatic")}))}:{}),
      ...(this.#kind==="action"?(()=>{const raise=(data.acquisitions??[]).find(a=>a?.ifAbsent);return {acquisitionFormulaChoices:optionalFormula((data.acquisitions??[]).find(a=>a?.definitionFormulaRef)?.definitionFormulaRef,"NoChosenDefinition","No Definition"),acquisitionRaises:Boolean(raise),acquisitionRaise:String(raise?.add?.["value.base"]??1),acquisitionRepeatChoices:["refuse","raise"].map(id=>({id,labelKey:`RTA.Template.AcquisitionRepeats.${id}`,colors:selectColorsAttribute([RTA_NEUTRAL_COLOR]),selected:id===(raise?"raise":"refuse")}))};})():{}),
      ...(this.#kind==="action"?(()=>{
        // Reference collections that can hold Actors: where group members and linked roles are found.
        const collections=definitions.flatMap(d=>(d.slots?.collection??[]).filter(slot=>slot.entryMode==="reference").map(slot=>({id:`${d.id}/${slot.id}`,label:`${d.nameKey} › ${slot.id}`,...withColors("definition",d)})));
        const from=data.group?.helpersFrom,link=data.roleLinks?.[0];
        return {hasGroup:Boolean(data.group||link),groupChosen:Boolean(data.group),groupIncludeSelf:data.group?.includeSelf!==false,groupTestChoices:tests.map(x=>({id:x.id,label:x.nameKey,...withColors("test",x),selected:x.id===data.group?.testRef})),
          groupMemberChoices:collections.map(x=>({...x,selected:from?x.id===`${from.definitionId}/${from.slotId}`:false})),linkChosen:Boolean(link),linkRole:link?.role??"",linkFromChoices:collections.map(x=>({...x,selected:link?x.id===`${link.definitionId}/${link.slotId}`:false}))};
      })():{}),
      ...(this.#kind==="effect"?{linkedRoleChoices:[...new Set(list("listActions").flatMap(x=>(x.roleLinks??[]).map(l=>l.role)).filter(role=>!["self","source","target","subject","owner","world","combat"].includes(role)))].map(id=>({id,colors:selectColorsAttribute([RTA_NEUTRAL_COLOR]),selected:id===data.targetRole}))}:{}),
      ...(this.#kind==="action"?{forEachChosen:Boolean(data.forEach),forEachTypeChoices:selectableDefinitionTypes.map(x=>({id:x.id,label:x.nameKey,...withColors("definitionType",x),selected:x.id===data.forEach?.definitionTypeId})),forEachConditionChoices:conditions.map(x=>({id:x.id,label:x.nameKey,...withColors("condition",x),selected:x.id===data.forEach?.conditionRef})),isReroll:Boolean(data.reroll),rerollKeepDice:data.reroll?.keepDice===true,rerollSomeDice:Boolean(data.reroll?.dice),rerollDice:data.reroll?.dice??{},rerollCompareChoices:["","eq","neq","gt","gte","lt","lte"].map(id=>({id,labelKey:id?`RTA.Compare.${id}`:"RTA.Reroll.AnyValue",colors:selectColorsAttribute([RTA_NEUTRAL_COLOR]),selected:id===(data.reroll?.dice?.compare??"")})),rerollReplaceChoices:formulas.map(x=>({id:x.id,label:x.nameKey,...withColors("formula",x),selected:x.id===data.reroll?.dice?.replaceFormulaRef})),rerollActionChoices:actions.filter(x=>x.id!==data.id).map(x=>({id:x.id,label:x.nameKey,...withColors("action",x),selected:(data.reroll?.actionRefs??[]).includes(x.id)})),turnOrderChosen:Boolean(data.turnOrder),turnOrderNeedsFormula:["set","add"].includes(data.turnOrder?.move),turnOrderChoices:["","now","last","set","add"].map(id=>({id,labelKey:`RTA.Action.TurnOrder.${id||"none"}`,colors:selectColorsAttribute([RTA_NEUTRAL_COLOR]),selected:id===(data.turnOrder?.move??"")})),turnOrderRoleChoices:["self","target"].map(id=>({id,labelKey:`RTA.Template.${id==="self"?"Self":"Target"}`,colors:selectColorsAttribute([RTA_NEUTRAL_COLOR]),selected:id===(data.turnOrder?.role??"self")})),turnOrderFormulaChoices:formulas.map(x=>({id:x.id,label:x.nameKey,...withColors("formula",x),selected:x.id===data.turnOrder?.formulaRef})),targetingChoices:["one","each","shared"].map(id=>({id,labelKey:`RTA.Action.Targeting.${id}`,colors:selectColorsAttribute([RTA_NEUTRAL_COLOR]),selected:id===(data.targeting??"one")})),tableChoices:[{id:"",label:uiText("NoTable","No Table"),selected:!data.tableRef},...list("listTables").map(x=>({id:x.id,label:x.nameKey,...withColors("table",x),selected:x.id===data.tableRef}))]}:{}),
      ...(this.#kind==="effect"?{targetDefinitionFormulaChoices:optionalFormula(data.targetDefinitionFormulaRef,"FixedTargetDefinition","The target above")}:{}),
      ...(this.#kind==="action"?outcomeMappingContext(data,{tests,outcomes,effects,actions:actions.filter(x=>x.id!==data.id),withColors}):{}),
      ...(this.#kind==="action"?eventPayloadContext(data,{eventTypes,formulas,withColors}):{}),
      ...(this.#kind==="trigger"?{...triggerFilterContext(data,{eventTypes:[...eventTypes,...systemEvents],outcomeKeyLabel:globalThis.game?.i18n?.localize?.("RTA.Trigger.OutcomeKeyField")??"Outcome key"}),triggerEventChoices}:{}),
      ...(this.#kind==="permissionPolicy"?permissionFormContext(data,{definitionTypes:selectableDefinitionTypes,definitions,contentTypes,contentTemplates:list("listContentTemplates"),actions,conditions,withColors}):{}),dirty:this.#dirty,canPersist:!isValidated&&this.#dirty,
      constraintRows:(data.constraints??[]).filter(rule=>CONSTRAINT_KINDS.includes(rule?.kind)).map(rule=>{
        const model=constraintRowModel(rule);
        const names=[...new Set([...Object.keys(data.fields??{}),'relations',model.field])].filter(Boolean);
        model.fields=names.map(id=>({id,label:constraintFieldLabel(data,id),colors:RTA_NEUTRAL_COLOR,selected:id===model.field}));
        return model;
      }),
      constraintFieldOptions:[...new Set([...Object.keys(data.fields??{}),'relations'])].map(id=>({id,label:constraintFieldLabel(data,id),colors:RTA_NEUTRAL_COLOR})),
      presentationRows:presentationRowModel(this.#kind==="definition"?data.presentationProfile:data.presentation),
      imagePreview:data.image||"icons/svg/mystery-man.svg",
      dataJson:JSON.stringify(data.data??{},null,2),genericJson:JSON.stringify(data,null,2),
      expressionJson:JSON.stringify(expression,null,2),
      rollDataJson:JSON.stringify(data.data??{},null,2),rolesText:(data.roles??[]).join("\n"),tagsText:(data.tags??[]).join("\n"),capabilitiesText:(data.capabilities??[]).join("\n"),
      isAllow:data.defaultEffect==="ALLOW",isDeny:data.defaultEffect!=="ALLOW",isStackable:data.runtimeMode==="stackable",isUnique:data.runtimeMode!=="stackable",inheritsRuntimeMode:!data.runtimeMode,templateUnique:data.runtimeMode==="unique",inheritedRuntimeModeKey:type?.runtimeMode==="stackable"?"RTA.Template.Stackable":"RTA.Template.Unique",isStorageItem:data.storageKind!=="actor",isStorageActor:data.storageKind==="actor",effectOperationChoices:effectOperationRegistry.list().map(id=>({id,labelKey:effectOperationRegistry.get(id).labelKey,operand:effectOperationRegistry.get(id).operand,colors:selectColorsAttribute([RTA_NEUTRAL_COLOR]),selected:id===(data.operation??"set")})),effectNeedsOperand:needsOperand, title:editorDisplayTitle(creating,creating?this.#kind:(data.nameKey??data.key??data.id))});
    return context;
    } finally { this.#renderCatalog=null; }
  }

  #freshSeed(){
    return createEntrySeed(this.#kind,{
      uid,definitionTypeId:this.#definitionTypeId,contentTypeId:this.#contentTypeId,
      getDefinitionType:id=>this.#api.getDefinitionType(this.#versionId,id),
      listContentTypes:()=>this.#api.listContentTypes(this.#versionId)
    });
  }

  async _onRender(context,options){
    await super._onRender(context,options);
    const form=this.element?.querySelector("[data-entry-form]");
    if(!form)return;
    const mark=()=>{if(!this.#dirty){this.#dirty=true;this.#syncFooter();}};
    wireOrderedLists(this.element,{onChange:mark});
    form.addEventListener("input",event=>{mark();if(event.target.closest?.("[data-expr-root]"))this.#syncExpressionJson();if(event.target.closest?.('[data-card="dieCounter"]'))syncDieFaceCounts(this.element);const row=event.target.closest?.("[data-definition-field]");if(row&&!row.dataset.required){const use=row.querySelector("[data-field-present]");if(use&&!use.checked){use.checked=true;}}if(event.target.matches?.("[data-picker-filter]"))this.#filterPicker(event.target);});
    form.addEventListener("change",event=>{if(event.target.matches?.("[data-step-source-family]")&&event.target.checked){const group=event.target.closest("[data-step-prop=sourceCollection]");for(const other of group?.querySelectorAll("[data-step-source-family]")??[])if(other!==event.target)other.checked=false;}this.#syncCreationSource(event.target);this.#syncCreationKind(event.target);mark();if(event.target.matches?.("[data-presentation-override]")){const row=event.target.closest("[data-presentation-key]");const control=row?.querySelector(".rta-declarative-presentation__value");if(control)control.hidden=!event.target.checked;}this.#syncFieldRow(event.target);this.#syncModeRows(event.target);this.#syncOperandEditor(event.target);this.#syncExpressionBuilder(event.target);if(event.target.closest?.("[data-expr-root]"))this.#syncExpressionJson();this.#syncDiceRead(event.target);this.#syncPickerSummary(event.target);this.#syncStorageKind(event.target);if(event.target.matches?.("[data-color-override-toggle]")){const input=event.target.closest("[data-color-override-editor]")?.querySelector("[data-custom-color-input]");if(input)input.disabled=!event.target.checked;}});
    form.addEventListener("change",event=>{const card=event.target.closest?.("[data-card]");if(card)syncCard(card);if(event.target.matches?.("[data-source-kind]"))syncValueSource(event.target);if(event.target.matches?.('[data-input-prop="sourceKind"]'))syncTestInputSource(event.target);if(event.target.matches?.('[data-slot-prop="entryMode"]'))syncEntryMode(event.target);// Tie-break, reroll and sides only matter once an initiative roll is chosen.
      if(event.target.matches?.("[data-mapping-choice]")){const mapping=event.target.closest("[data-outcome-mapping]"),row=mapping?.querySelector("[data-mapping-choice-count-row]");if(row)row.hidden=!mapping.querySelector("[data-mapping-choice]:checked");}
      // A choice option's bonus field shows once a granted value Definition is chosen.
      if(event.target.matches?.('[name="choiceTargetRef"],[data-choice-prop="operation"]')){const group=event.target.closest("[data-choice-group]"),grant=group?.querySelector('[data-choice-prop="operation"]')?.value==="grant";let shown=false;
        for(const row of group?.querySelectorAll("[data-choice-bonus-row]")??[]){row.hidden=![...group.querySelectorAll('[name="choiceTargetRef"]:checked')].some(input=>input.value===row.dataset.choiceBonusRow);shown||=!row.hidden;}
        const bonuses=group?.querySelector("[data-choice-bonuses]");if(bonuses)bonuses.hidden=!(grant&&shown);}
      if(event.target.matches?.('[name="stateApplicationIds"]')){for(const row of form.querySelectorAll(`[data-state-stacking="${CSS.escape(event.target.value)}"]`))row.hidden=!event.target.checked;const list=form.querySelector("[data-state-stacking-list]");if(list)list.hidden=!form.querySelector('[name="stateApplicationIds"]:checked');}
      if(event.target.matches?.('[name="groupTestRef"]'))for(const row of form.querySelectorAll("[data-group-only]"))row.hidden=!event.target.value;
      if(event.target.matches?.('[name="linkFrom"]'))for(const row of form.querySelectorAll("[data-link-only]"))row.hidden=!event.target.value;
      if(event.target.matches?.('[name="turnOrderMove"]')){for(const row of form.querySelectorAll("[data-turn-order-only]"))row.hidden=!event.target.value;for(const row of form.querySelectorAll("[data-turn-order-formula]"))row.hidden=!["set","add"].includes(event.target.value);}
      if(event.target.matches?.('[name="forEachType"]'))for(const row of form.querySelectorAll("[data-for-each-only]"))row.hidden=!event.target.value;
      if(event.target.matches?.('[name="rerollDiceMode"]'))for(const row of form.querySelectorAll("[data-reroll-dice-only]"))row.hidden=event.target.value!=="some";
      if(event.target.matches?.('[name="sheetTarget"]'))for(const row of form.querySelectorAll("[data-sheet-item-only]"))row.hidden=event.target.value!=="item";
      if(event.target.matches?.('[name="initiativeSource"]'))for(const row of form.querySelectorAll("[data-initiative-only]"))row.hidden=!event.target.value;});
    form.addEventListener("submit",event=>{event.preventDefault();this.#save(false);});
    // Section counters follow rows added or removed by script (§46).
    const counters=[...form.querySelectorAll("[data-live-count]")];
    if(counters.length){const sync=()=>{for(const counter of counters){const scope=counter.closest("details")??form;const count=String(scope.querySelectorAll(counter.dataset.liveCount).length);if(counter.textContent!==count)counter.textContent=count;}};sync();this._rtaCountObserver?.disconnect();this._rtaCountObserver=new MutationObserver(sync);this._rtaCountObserver.observe(form,{childList:true,subtree:true});}
    for(const button of this.element.querySelectorAll("[data-action]"))button.addEventListener("click",event=>this.#action(event));
    const layout=this.element.querySelector("[data-sheet-layout-editor]");
    if(layout)this._rtaSheetLayout=new SheetLayoutController(layout,{ruleset:this.#api.getRulesetVersion(this.#versionId)?.workingDraft??this.#api.getRuleset(this.#versionId),colors:(kind,entry)=>this.#optionColors(kind,entry),form,readOnly:context.readOnly,store:context.readOnly?null:this.#sheetTemplateStore()});
    if(this.#focusPath!==null){const path=this.#focusPath;this.#focusPath=null;requestAnimationFrame(()=>this.#focusDiagnostic(path));}
  }

  /** Bring the control a diagnostic points to into view and highlight it briefly. */
  /** The Ruleset's block templates, written at once (they are the Ruleset's, not this sheet's): the sheet editor saves,
   *  renames, deletes and imports them. */
  #sheetTemplateStore(){
    const v=this.#versionId,api=this.#api;
    return {ruleset:()=>api.getRulesetVersion(v)?.workingDraft??api.getRuleset(v),createTemplate:data=>api.createSheetTemplate(v,data),updateTemplate:(id,patch)=>api.updateSheetTemplate(v,id,patch),deleteTemplate:id=>api.deleteSheetTemplate(v,id)};
  }

  #focusDiagnostic(path){
    const visible=node=>!node.closest("[hidden]");
    for(const {selector,index} of diagnosticFocusTargets(this.#kind,path)){
      const node=[...this.element.querySelectorAll(selector)].filter(visible)[index];
      if(!node)continue;
      const box=node.closest(".rta-form-row, [data-definition-field], [data-rule-operand], [data-slot-card]")??node.closest(".rta-select")??node;
      for(let details=box.closest("details");details;details=details.parentElement?.closest("details"))details.open=true;
      box.scrollIntoView({block:"center",behavior:"smooth"});
      box.classList.remove("rta-diagnostic-focus");void box.offsetWidth;box.classList.add("rta-diagnostic-focus");
      setTimeout(()=>box.classList.remove("rta-diagnostic-focus"),4000);
      (node.matches("input:not([type=hidden]), textarea")?node:box.querySelector(".rta-select__trigger, input:not([type=hidden]), textarea"))?.focus({preventScroll:true});
      return;
    }
  }

  #syncStorageKind(target){
    if(target?.name!=="storageKind")return;
    for(const row of this.element.querySelectorAll("[data-document-subtype-storage]"))
      row.hidden=row.dataset.documentSubtypeStorage!==target.value;
  }

  #filterPicker(input){
    const query=String(input.value??"").trim().toLowerCase(),picker=input.closest("[data-picker]");
    for(const option of picker?.querySelectorAll("[data-picker-option]")??[]){const label=String(option.dataset.pickerLabel??option.textContent??"").toLowerCase();option.hidden=!!query&&!label.includes(query);}
  }

  #syncPickerSummary(target){
    const picker=target?.closest?.("[data-picker]");if(!picker||target.type!=="checkbox")return;
    const labels=[...picker.querySelectorAll('[data-picker-option] input[type="checkbox"]:checked')].map(input=>input.closest("[data-picker-option]")?.dataset.pickerLabel??"").filter(Boolean);
    const summary=picker.matches(".rta-select")?null:picker.querySelector("[data-picker-summary]");if(summary)summary.textContent=pickerSummary(labels.map(label=>({label,selected:true})));
  }

  /** A slot follows its kind: choosing Calculation draws its block, with the former operand as its first one;
   * a new operation of a block keeps the operands it can. */
  #syncExpressionBuilder(target){
    if(target?.matches?.("[data-rule-operand-kind]")){
      const row=target.closest("[data-rule-operand]"),block=row?.querySelector(":scope > [data-expr-block]"),before=row?.dataset.kind||"literal";
      if(target.value==="expression"&&!block){const sources=this.#expressionSources(),editor=this.#kind;
        const form={kind:"expression",...reshapeBlock(editorOperations(editor,false)[0],before==="expression"||before==="none"?[]:[readSlotForm(row,before)])};
        this.#replaceExpressionPart(row,renderExpressionSlotHTML(slotView(form,{label:{key:"",fallback:row.querySelector(":scope > .rta-rule-operand__label")?.textContent??""},path:row.dataset.exprPath,optional:Boolean(row.querySelector('[data-rule-operand-kind] option[value="none"]')),removable:Boolean(row.querySelector(':scope > .rta-rule-operand__controls > [data-action="removeRuleOperand"]')),editor},sources),{contextListId:sources.contextListId}));return;}
      for(const editor of row?.querySelectorAll(":scope > .rta-rule-operand__controls > [data-rule-operand-editor]")??[])editor.hidden=editor.dataset.ruleOperandEditor!==target.value;
      if(block)block.hidden=target.value!=="expression";
      row.dataset.kind=target.value;
    }
    if(target?.matches?.("[data-expr-operation]")){const block=this.#operationBlock(target);if(block)this.#renderExpressionBlock(block,form=>reshapeBlock(target.value,form.children,form.rows));}
  }
  /** The block an operation select drives: the root block, or the nested block of its slot. */
  #operationBlock(select){
    const root=select.closest("[data-expr-root]"),row=select.closest("[data-rule-operand]");
    return row&&root?.contains(row)?row.querySelector(":scope > [data-expr-block]"):root?.querySelector(":scope > [data-expr-block]");
  }
  /** Redraw a block from its current form state, changed by edit (an operand added, an operation changed). */
  #renderExpressionBlock(block,edit){
    const root=block.parentElement?.matches("[data-expr-root]"),row=root?null:block.closest("[data-rule-operand]");
    const select=root?block.parentElement.querySelector(":scope > .rta-form-row [data-expr-operation]"):row.querySelector(":scope > .rta-rule-operand__controls [data-expr-operation]");
    const form=edit({operation:String(select?.value??""),...readBlockForm(block)}),sources=this.#expressionSources();
    this.#replaceExpressionPart(block,renderExpressionBlockHTML(blockView(form,{path:row?.dataset.exprPath??"",editor:this.#kind,root},sources),{contextListId:sources.contextListId,root}));
  }
  /** Swap a slot or block for new markup, wire its buttons, and mark the entry changed. */
  #replaceExpressionPart(node,html){
    const template=document.createElement("template");template.innerHTML=html;const fresh=template.content.firstElementChild;
    node.replaceWith(fresh);for(const button of fresh.querySelectorAll("[data-action]"))button.addEventListener("click",event=>this.#action(event));
    this.#dirty=true;this.#syncFooter();this.#syncExpressionJson();
  }
  /** The read-only technical JSON follows the visual builder. */
  #syncExpressionJson(){
    const builder=this.element?.querySelector("[data-formula-builder], [data-condition-builder]"),json=this.element?.querySelector('[name="expressionJson"]');
    if(!builder||!json||builder.dataset.supported!=="true")return;
    try{json.value=JSON.stringify(collectExpression(builder,null),null,2);}catch{/* a number being typed: keep the last valid JSON */}
  }
  #expressionBuilder(expression){
    const sources=this.#expressionSources(),model=expressionBuilderModel(expression,this.#kind,sources);
    return {supported:model.supported,html:renderExpressionBuilderHTML(model,sources)};
  }
  /** Choices of every operand: Parameters, Formulas, References, dice counters, roles linked by Actions, context paths. */
  #expressionSources(){
    const withColors=(kind,entry)=>({colors:selectColorsAttribute(this.#optionColors(kind,entry))}),actions=this.#renderList("actions","listActions");
    const ruleset=this.#renderCatalog??this.#api.getRulesetVersion(this.#versionId)?.workingDraft??this.#api.getRuleset(this.#versionId)??{};
    return {parameters:this.#renderList("parameters","listParameters"),formulas:this.#renderList("formulas","listFormulas"),references:this.#referenceChoices(),withColors,
      counters:this.#diceCounters(),neutral:selectColorsAttribute([RTA_NEUTRAL_COLOR]),roles:[...new Set(actions.flatMap(x=>(x.roleLinks??[]).map(l=>l.role)))],
      contextListId:`${this.id??"rta-entry"}-context-paths`,contextPaths:contextPathSuggestions(ruleset)};
  }
  /** Dice read by counter take a counter; any other reading may compare the faces. */
  #syncDiceRead(target){
    if(!target?.matches?.('[data-rule-operand-editor="dice"] [data-operand-part="read"]'))return;
    const editor=target.closest("[data-rule-operand-editor]"),counter=target.value==="counter";
    for(const part of editor.querySelectorAll("[data-dice-compare-only]"))part.hidden=counter;
    for(const part of editor.querySelectorAll("[data-dice-counter-only]"))part.hidden=!counter;
  }

  /** Effect value rows follow the value source, and disappear for operations without operand (toggle). */
  #syncOperandEditor(target){
    if(!["operandKind","operation"].includes(target?.name))return;
    const kind=this.element.querySelector('[name="operandKind"]')?.value,operation=this.element.querySelector('[name="operation"]');
    const needsOperand=operation?.selectedOptions?.[0]?.dataset.operand!=="false";
    const kindRow=this.element.querySelector('[name="operandKind"]')?.closest(".form-group");if(kindRow)kindRow.hidden=!needsOperand;
    for(const node of this.element.querySelectorAll("[data-operand-editor]"))node.hidden=!needsOperand||node.dataset.operandEditor!==kind;
  }

  #creationSources(){
    return getCreationSources(this.#api,this.#versionId,this.#renderCatalog,(kind,entry)=>selectColorsAttribute(this.#optionColors(kind,entry)));
  }

  // Shared visible checkbox-list renderer for Ruleset-backed creation choices.
  // Both collection and object pickers use the same canonical rta-picker__body structure.
  #creationCheckboxList({property,items,selected=[],single=false,emptyMessage=uiText("NoEntries","No entries available.")}){
    return renderCreationCheckboxPicker({property,items,selected,single,emptyMessage});
  }

  #creationSourcePicker(family,selected=[]){
    const source=this.#creationSources().find(x=>x.id===family);
    const emptyMessage=!family?uiText("SelectSource","Select a Ruleset source above."):source?uiText("NoSourceItems","No entries available in the selected Ruleset source."):uiText("MissingSource","The saved source collection is not available.");
    // Retain broken references visibly so an edit cannot silently erase them.
    // The serializer will reject them until the user repairs the selection.
    const items=[...(source?.items??[])];
    const known=new Set(items.map(item=>item.id));
    for(const id of selected)if(!known.has(id))items.push({id,label:missingTargetLabel(family,id),colors:RTA_NEUTRAL_COLOR});
    return this.#creationCheckboxList({property:"sourceObjects",items,selected,emptyMessage});
  }

  #creationStepHTML(step={}){
    const value={name:"",kind:"choice",min:1,max:1,...copy(step)};
    const kinds=renderCreationKindsOptions(CREATION_STEP_KINDS,value.kind);
    // Bounds may be Formulas over the earlier steps; options may be filtered by a Condition.
    const pick=(collection,method,kind,selected,noneLabel)=>renderSelectOptions([{id:"",label:noneLabel,colors:RTA_NEUTRAL_COLOR},...this.#renderList(collection,method).map(entry=>({id:entry.id,label:entry.nameKey||entry.id,colors:selectColorsAttribute(this.#optionColors(kind,entry))}))],{selectedValue:selected??"",colorize:true});
    const computed={min:pick("formulas","listFormulas","formula",value.minFormulaRef,uiText("FixedValue","Fixed value")),max:pick("formulas","listFormulas","formula",value.maxFormulaRef,uiText("FixedValue","Fixed value")),
      perTarget:pick("formulas","listFormulas","formula",value.perTargetMaxFormulaRef,uiText("FixedValue","Fixed value")),condition:pick("conditions","listConditions","condition",value.optionConditionRef,uiText("EveryOption","Every option")),
      // A random draw: optional (the player may change it) or final; its weight field or Roll.
      draw:renderSelectOptions([["","DrawNo","Chosen by the player"],["optional","DrawOptional","Drawn, can be changed"],["locked","DrawLocked","Drawn, final"]].map(([id,key,fallback])=>({id,label:uiText(key,fallback),colors:RTA_NEUTRAL_COLOR})),{selectedValue:value.draw?(value.draw.locked?"locked":"optional"):"",colorize:true}),
      drawRoll:pick("rolls","listRolls","roll",value.draw?.rollRef,"—"),
      // Applies when a Condition holds; a roll step's Roll; an allocation's cost per point; another term while a Condition holds.
      when:pick("conditions","listConditions","condition",value.conditionRef,uiText("Always","Always")),roll:pick("rolls","listRolls","roll",value.rollRef,"—"),
      cost:pick("formulas","listFormulas","formula",value.costFormulaRef,uiText("OnePerPoint","1 per point")),repeatWhile:pick("conditions","listConditions","condition",value.repeat?.continueConditionRef,uiText("Always","Always"))};
    const source=value.source??{};
    const sourceFamily=String(source.collection??"");
    const selectedIds=Array.isArray(source.objectIds)?source.objectIds:[];
    const families=this.#creationSources();
    const sourceFamilies=this.#creationCheckboxList({property:"sourceCollection",items:families,selected:sourceFamily?[sourceFamily]:[],single:true});
    const sourcePicker=this.#creationSourcePicker(sourceFamily,selectedIds);
    return renderCreationStepHTML({value,kinds,computed,sourceFamilies,sourcePicker,sourceDescriptor:getCreationSourceDescriptor(sourceFamily),uiText});
  }

  /** Rows that only make sense for some step kinds follow the kind select. */
  #syncCreationKind(target){
    if(!target?.matches?.('[data-step-prop="kind"], [data-step-prop="draw"], [data-step-prop="repeatSteps"]'))return;
    const step=target.closest("[data-creation-step]");
    for(const row of step?.querySelectorAll("[data-step-repeat-only]")??[])row.hidden=!step.querySelector('[data-step-prop="repeatSteps"]')?.value;
    const kind=step?.querySelector('[data-step-prop="kind"]')?.value,drawn=Boolean(step?.querySelector('[data-step-prop="draw"]')?.value);
    // Draw settings show only once the step is drawn.
    for(const row of step?.querySelectorAll("[data-step-kind-only]")??[])row.hidden=!row.dataset.stepKindOnly.split(" ").includes(kind)||(row.dataset.stepDrawOnly!==undefined&&!drawn);
  }
  #syncCreationSource(target){
    if(!target?.matches?.("[data-step-source-family]"))return;
    const row=target.closest("[data-creation-step]");
    const picker=row?.querySelector('[data-step-prop="sourceObjects"]');
    if(!picker)return;
    const replacement=this.#creationSourcePicker(target.checked?target.value:"");
    const holder=document.createElement("div");holder.innerHTML=replacement;
    const next=holder.firstElementChild;
    picker.replaceWith(next);
    const descriptor=getCreationSourceDescriptor(target.checked?target.value:"");
    const label=row.querySelector("[data-step-source-label]");
    if(label)label.textContent=descriptor.allowedLabel;
    const hint=row.querySelector("[data-step-source-hint]");
    if(hint)hint.textContent=descriptor.help;
  }

  #collectCreation(){
    const form=this.element.querySelector('[data-entry-form]'),fd=new FormData(form),current=this.#read()??this.#freshSeed();
    const steps=collectCreationSteps(this.element.querySelectorAll('[data-creation-step]'),{sources:this.#creationSources()});
    return {...current,nameKey:String(fd.get('nameKey')??'').trim(),descriptionKey:String(fd.get('descriptionKey')??''),enabled:form.querySelector('[name="enabled"]')?.checked===true,steps};
  }

  #checkedIds(name){
    return [...this.element.querySelectorAll(`[name="${name}"]:checked`)].map(input=>input.value);
  }

  /** Modifier stacking group and Duration fields follow the selected mode. */
  #syncModeRows(target){
    if(target?.name==="stackingMode")this.element.querySelector("[data-stacking-group]")?.toggleAttribute("hidden",target.value==="stack");
    // A Trigger filter offers only the payload fields of the selected Event Type.
    if(target?.name==="eventTypeId")for(const select of this.element.querySelectorAll("[data-filter-field]")){
      for(const option of select.options)if(option.value)option.disabled=option.dataset.eventType!==target.value;
      if(select.selectedOptions[0]?.disabled)select.value="";
      select.dispatchEvent(new Event("change",{bubbles:true}));
    }
    // A Derived output is named "Formula → Output" until the user types a name of their own.
    if(this.#kind==="formulaBinding"&&["formulaRef","targetRef"].includes(target?.name)){
      const name=this.element.querySelector('[name="nameKey"]'),label=field=>this.element.querySelector(`[name="${field}"]`)?.selectedOptions?.[0]?.textContent?.trim()??"";
      if(name&&(!name.value.trim()||name.value===name.dataset.autoName)&&label("formulaRef")&&label("targetRef")){name.value=name.dataset.autoName=`${label("formulaRef")} → ${label("targetRef")}`;}
    }
    // An Action shows what happens on each Outcome of the Test it runs.
    if(target?.name==="testRef"){
      let shown=false;for(const group of this.element.querySelectorAll("[data-outcome-mapping-group]")){group.hidden=group.dataset.outcomeMappingGroup!==target.value;shown||=!group.hidden;}
      this.element.querySelector("[data-outcome-mappings]")?.toggleAttribute("hidden",!shown);
    }
    // An Action fills the payload fields of the events it emits.
    if(target?.name==="eventTypeRefs"){
      let shown=false;for(const group of this.element.querySelectorAll("[data-event-payload-group]")){if(group.dataset.eventPayloadGroup===target.value)group.hidden=!target.checked;shown||=!group.hidden;}
      this.element.querySelector("[data-event-payloads]")?.toggleAttribute("hidden",!shown);
    }
    if(target?.matches?.("[data-event-payload-source]"))target.closest("[data-event-payload-field]")?.querySelector("[data-event-payload-fixed]")?.toggleAttribute("hidden",target.value!=="__fixed");
    if(target?.matches?.('[name="acquisitionRepeat"]'))this.element.querySelector("[data-acquisition-raise]")?.toggleAttribute("hidden",target.value!=="raise");
    if(target?.matches?.("[data-mapping-mode]")){const row=target.closest("[data-outcome-mapping]");row?.querySelector("[data-mapping-effects]")?.toggleAttribute("hidden",target.value!=="effects");row?.querySelector("[data-mapping-actions]")?.toggleAttribute("hidden",target.value==="block");}
    if(target?.name==="targetSource")this.element.querySelector("[data-target-fixed]")?.toggleAttribute("hidden",target.value!=="__fixed");
    if(target?.name==="durationMode")for(const row of this.element.querySelectorAll("[data-duration-mode]"))row.hidden=row.dataset.durationMode!==target.value;
  }

  /** A field row shows numeric bounds or the reference target only for the value type that uses them. */
  #syncFieldRow(target){
    const row=target?.closest?.("[data-field-definition-row]");if(!row)return;
    const prop=name=>row.querySelector(`[data-field-prop="${name}"]`)?.value;
    const valueType=prop("valueType");
    row.querySelector("[data-field-numeric]")?.toggleAttribute("hidden",!["integer","number"].includes(valueType));
    row.querySelector("[data-field-reference]")?.toggleAttribute("hidden",valueType!=="reference");
    row.querySelector("[data-field-definition-type]")?.toggleAttribute("hidden",prop("referenceTargetKind")!=="definition");
  }

  #syncFooter(){
    const root=this.element;if(!root)return;
    root.querySelector('[data-footer-action="close"]')?.toggleAttribute("hidden",this.#dirty);
    root.querySelector('[data-footer-action="cancel"]')?.toggleAttribute("hidden",!this.#dirty);
    for(const button of root.querySelectorAll("[data-persist]"))button.disabled=!this.#dirty;
  }

  #collect(){
    const form=this.element.querySelector('[data-entry-form]');
    const current=this.#read()??this.#freshSeed();
    const data=collectEntryData(this.#kind,{
      fd:new FormData(form),current,
      bool:checked(form),checkedIds:name=>this.#checkedIds(name),
      queryOne:selector=>this.element.querySelector(selector),
      queryAll:selector=>this.element.querySelectorAll(selector),
      capabilityTypes:this.#api.listCapabilityTypes(),
      collectFormulaExpression:fallback=>collectExpression(this.element.querySelector("[data-formula-builder]"),fallback),
      collectConditionExpression:fallback=>collectExpression(this.element.querySelector("[data-condition-builder]"),fallback),
      collectCreation:()=>this.#collectCreation(),uid,fieldUid
    });
    // Relations are edited only where the runtime reads them (grants, relationCount).
    if(RELATION_KINDS.includes(this.#kind))data.relations=collectRelationRows(
      this.element.querySelectorAll('[data-relation-row]'),current.relations??[]);
    return data;
  }

  #choiceGroupHTML(){
    const id=uid('choice'),ruleset=this.#api.getRuleset(this.#versionId);
    const options=relationCatalog(ruleset).map(x=>({
      id:refToken(x),label:`${referenceKindTitle(x.objectKind,moduleLanguage().startsWith('fr'))} · ${x.label}`,
      colors:selectColorsAttribute(this.#optionColors(x.objectKind,x.entry)),valued:x.objectKind==="definition"&&(x.entry?.capabilities??[]).includes("value")
    }));
    const choices=renderChoiceListBody(options,{name:'choiceTargetRef',placeholder:uiText('SearchRelations','Search Ruleset objects…'),emptyMessage:uiText('NoChoiceTargets','No selectable Ruleset entries for this choice.')});
    return renderChoiceGroupHTML({id,choices,bonuses:options.filter(x=>x.valued)});
  }

  #newFieldRow(){
    const template=this.element.querySelector("[data-field-row-template]");
    const row=template.content.firstElementChild.cloneNode(true),id=fieldUid();
    row.dataset.fieldId=id;row.querySelector('[data-field-prop="id"]').value=id;
    return row;
  }

  async #save(close){
    let data=null;
    try{
      data=this.#collect();
      let savedResult;
      if(this.#kind==="ruleset"){
        if(this.#id){await this.#api.updateRuleset(this.#versionId,data);savedResult={versionId:this.#versionId};}
        else {const record=await this.#api.createRuleset(data);this.#versionId=record.versionId;this.#id=record.versionId;savedResult={versionId:record.versionId};}
      }else{
        const meta=ENTRY_OPERATIONS[this.#kind];
        if(this.#id){
          if(this.#kind==="definitionType"||this.#kind==="contentType"){
            const isContent=this.#kind==="contentType",current=isContent?this.#api.getContentType(this.#versionId,this.#id):this.#api.getDefinitionType(this.#versionId,this.#id);
            const removed=Object.keys(current?.fields??{}).filter(fieldId=>!Object.hasOwn(data.fields??{},fieldId));
            if(removed.length){
              const affected=isContent?this.#api.listContentTemplates(this.#versionId).filter(entry=>entry.contentTypeId===this.#id&&removed.some(fieldId=>Object.hasOwn(entry.data??{},fieldId))):this.#api.listDefinitions(this.#versionId).filter(entry=>entry.definitionTypeId===this.#id&&removed.some(fieldId=>Object.hasOwn(entry.data??{},fieldId)));
              if(affected.length){
                const names=removed.map(fieldId=>current.fields?.[fieldId]?.name||fieldId).join(", "),label=isContent?"Content Template":"Definition";
                if(!await confirmRTA("RTA.UI.RemoveFields",{names,count:affected.length,kind:label}))return;
              }
            }
          }
          // The user confirmed above; the Core still refuses an unconfirmed data loss.
          const updated=await this.#api[meta.update](this.#versionId,this.#id,data,{pruneRemovedFields:true});savedResult={id:updated.id};
        }
        else {const created=await this.#api[meta.create](this.#versionId,data);this.#id=created.id;savedResult={id:created.id};}
      }
      // Storage acknowledged the write. Re-read the saved entry and refuse
      // silent success if any selected Ruleset relationship disappeared.
      if(this.#kind!=="ruleset")assertPersistedRelations(this.#kind,data,this.#read());
      this.#baseline=copy(this.#read());this.#dirty=false;this.#error="";await this.#onSaved(savedResult);if(close)return this.close();return this.render(false);
    }catch(error){
      this.#error=error?.message??String(error);
      // Open the section holding the first problem and focus its field (§46).
      const path=saveErrorFocusPath(error,{kind:this.#kind,id:this.#kind==="ruleset"?null:(this.#id??data?.id??null)});
      if(path!==null)this.#focusPath=path;
      return this.render(false);
    }
  }


  #newEventFieldRow(){
    // No id yet: the field takes one from its name when the Event Type is saved.
    const row=document.createElement("article");row.className="rta-field-editor";row.dataset.eventFieldRow="";row.dataset.eventFieldId="";
    const options=renderSelectOptions(valueTypeChoices(this.#api.listValueTypes().map(type=>type.id),"string"),{selectedValue:"string"});
    row.innerHTML=renderNewEventFieldInnerHTML(options);
    return row;
  }

  #diceCounters(){
    const seen=new Map();
    for(const die of this.#renderList("dice","listDice"))for(const counter of die.counters??[])if(!seen.has(counter.id))seen.set(counter.id,{id:counter.id,label:counter.labelKey||counter.id});
    return [...seen.values()];
  }
  async #action(event){
    const action=event.currentTarget.dataset.action;
    if(action==="addRelation"){
      const list=this.element.querySelector('[data-relation-list]');if(!list)return;
      const ruleset=this.#api.getRuleset(this.#versionId);
      const catalog=relationCatalog(ruleset,{exclude:{objectKind:this.#kind,objectId:this.#id}});
      const model=relationRowModel({id:uid('relation'),operation:'link',targetRef:{}},catalog,
        (kind,entry)=>selectColorsAttribute(this.#optionColors(kind,entry)));
      list.insertAdjacentHTML('beforeend',renderRelationRow(model));
      list.lastElementChild?.querySelector('[data-action="removeRelation"]')?.addEventListener('click',e=>this.#action(e));
      RTASelect.enhance(this.element);
      this.#dirty=true;this.#syncFooter();return;
    }
    if(action==="removeRelation"){
      event.currentTarget.closest('[data-relation-row]')?.remove();
      this.#dirty=true;this.#syncFooter();return;
    }
    if(action==="addCreationStep"){
      const list=this.element.querySelector("[data-creation-steps]");if(!list)return;
      list.insertAdjacentHTML("beforeend",this.#creationStepHTML());
      for(const button of list.lastElementChild.querySelectorAll("[data-action]"))button.addEventListener("click",event=>this.#action(event));
      this.#dirty=true;this.#syncFooter();return;
    }
    if(action==="copyStepId"){
      const id=event.currentTarget.dataset.stepId;
      await (game.clipboard?.copyPlainText?.(id)??navigator.clipboard?.writeText?.(id));
      ui.notifications?.info?.(uiText("StepIdCopied","Identifier copied: {id}").replace("{id}",id));return;
    }
    if(["removeStep","duplicateStep","stepUp","stepDown"].includes(action)){
      const row=event.currentTarget.closest("[data-creation-step]");if(!row)return;
      if(action==="removeStep")row.remove();
      if(action==="stepUp"&&row.previousElementSibling)row.parentElement.insertBefore(row,row.previousElementSibling);
      if(action==="stepDown"&&row.nextElementSibling)row.parentElement.insertBefore(row.nextElementSibling,row);
      if(action==="duplicateStep"){
        const advanced=json(row.dataset.original,{});
        const sourceCollection=row.querySelector('[data-step-source-family]:checked')?.value??"";
        const sourceIds=[...row.querySelectorAll('[data-step-prop="sourceObjects"] [data-step-source-object]:checked')].map(input=>input.value);
        const duplicate={...advanced,...(sourceCollection?{source:{...(advanced.source??{}),collection:sourceCollection,objectIds:sourceIds}}:{}),id:undefined,name:game.i18n.format("RTA.UI.CopyOf",{name:row.querySelector('[data-step-prop="name"]')?.value??""}),kind:row.querySelector('[data-step-prop="kind"]')?.value,min:Number(row.querySelector('[data-step-prop="min"]')?.value??0),max:Number(row.querySelector('[data-step-prop="max"]')?.value??1)};
        row.insertAdjacentHTML("afterend",this.#creationStepHTML(duplicate));
        for(const button of row.nextElementSibling.querySelectorAll("[data-action]"))button.addEventListener("click",event=>this.#action(event));
      }
      this.#dirty=true;this.#syncFooter();return;
    }
    if(action==="addDeclarativeConstraint"){const list=this.element.querySelector("[data-declarative-constraints]");if(list){const row=document.createElement("div");row.className="rta-declarative-constraint";row.dataset.declarativeConstraint="";row.innerHTML=renderDeclarativeConstraintRow({fields:[...(this.element.querySelector("template[data-constraint-field-options]")?.content.querySelectorAll("option")??[])].map(option=>({id:option.value,label:option.textContent,colors:option.dataset.rtaColors??RTA_NEUTRAL_COLOR})),labels:{field:game?.i18n?.localize?.("RTA.Declarative.Field")??"Field",rule:game?.i18n?.localize?.("RTA.Declarative.Rule")??"Rule",value:game?.i18n?.localize?.("RTA.Declarative.Value")??"Value",remove:game?.i18n?.localize?.("RTA.Declarative.DeleteConstraint")??"Remove constraint"}});list.append(row);RTASelect.enhance(this.element);row.querySelector("[data-action]").addEventListener("click",event=>this.#action(event));this.#dirty=true;this.#syncFooter();}return;}
    if(action==="removeDeclarativeConstraint"){event.currentTarget.closest("[data-declarative-constraint]")?.remove();this.#dirty=true;this.#syncFooter();return;}
    if(action==="addField"){
      const list=this.element.querySelector("[data-field-definition-list]");if(list){const row=this.#newFieldRow();row.querySelector('[data-action="removeField"]')?.addEventListener("click",event=>this.#action(event));list.append(row);this.#dirty=true;this.#syncFooter();}return;
    }
    if(action==="addTriggerFilter"){
      const list=this.element.querySelector("[data-trigger-filter-list]"),row=this.element.querySelector("[data-trigger-filter-template]")?.content.firstElementChild.cloneNode(true);
      if(list&&row){row.querySelector('[data-action="removeTriggerFilter"]')?.addEventListener("click",event=>this.#action(event));list.append(row);this.#dirty=true;this.#syncFooter();}
      return;
    }
    if(action==="removeTriggerFilter"){event.currentTarget.closest("[data-trigger-filter-row]")?.remove();this.#dirty=true;this.#syncFooter();return;}
    if(action==="addPermissionRule"){
      const list=this.element.querySelector("[data-permission-rule-list]"),row=this.element.querySelector("[data-permission-rule-template]")?.content.firstElementChild.cloneNode(true);
      if(list&&row){row.dataset.ruleId=uid("rule");list.querySelector(":scope > .rta-config-entry__empty")?.remove();row.querySelector('[data-action="removePermissionRule"]')?.addEventListener("click",event=>this.#action(event));list.append(row);this.#dirty=true;this.#syncFooter();}
      return;
    }
    if(action==="removePermissionRule"){event.currentTarget.closest("[data-permission-rule]")?.remove();this.#dirty=true;this.#syncFooter();return;}
    if(action==="removeField"){
      event.currentTarget.closest("[data-field-definition-row]")?.remove();this.#dirty=true;this.#syncFooter();return;
    }
    if(action==="addEventField"){const list=this.element.querySelector("[data-event-field-list]");if(list){const row=this.#newEventFieldRow();row.querySelector('[data-action="removeEventField"]')?.addEventListener("click",event=>this.#action(event));list.append(row);this.#dirty=true;this.#syncFooter();}return;}
    if(action==="removeEventField"){event.currentTarget.closest("[data-event-field-row]")?.remove();this.#dirty=true;this.#syncFooter();return;}
    if(action==="addChoiceGroup"){const list=this.element.querySelector("[data-choice-group-list]");if(list){list.insertAdjacentHTML("beforeend",this.#choiceGroupHTML());for(const button of list.lastElementChild?.querySelectorAll("[data-action]")??[])button.addEventListener("click",event=>this.#action(event));this.#dirty=true;this.#syncFooter();}return;}
    if(action==="addSlot"){const capability=event.currentTarget.dataset.slotCapability,list=this.element.querySelector(`[data-slot-list="${capability}"]`),template=this.element.querySelector(`[data-slot-template="${capability}"]`);if(list&&template){list.append(template.content.cloneNode(true));for(const button of list.lastElementChild?.querySelectorAll("[data-action]")??[])button.addEventListener("click",event=>this.#action(event));if(name==="dieCounter")syncDieFaceCounts(this.element);this.#dirty=true;this.#syncFooter();}return;}
    if(action==="addTestInput"){const list=this.element.querySelector("[data-test-input-list]"),template=this.element.querySelector("[data-test-input-template]");if(list&&template){list.append(template.content.cloneNode(true));for(const button of list.lastElementChild?.querySelectorAll("[data-action]")??[])button.addEventListener("click",event=>this.#action(event));this.#dirty=true;this.#syncFooter();}return;}
    if(action==="addCard"){const name=event.currentTarget.dataset.cardList,list=this.element.querySelector(`[data-card-list-body="${name}"]`),template=this.element.querySelector(`[data-card-template="${name}"]`);if(list&&template){list.append(template.content.cloneNode(true));for(const button of list.lastElementChild?.querySelectorAll("[data-action]")??[])button.addEventListener("click",event=>this.#action(event));if(name==="dieCounter")syncDieFaceCounts(this.element);this.#dirty=true;this.#syncFooter();}return;}
    if(action==="removeCard"){const removed=event.currentTarget.closest("[data-card]");removed?.remove();if(removed?.dataset.card==="dieCounter")syncDieFaceCounts(this.element);this.#dirty=true;this.#syncFooter();return;}
    if(action==="removeTestInput"){event.currentTarget.closest("[data-test-input]")?.remove();this.#dirty=true;this.#syncFooter();return;}
    if(action==="removeSlot"){event.currentTarget.closest("[data-slot-card]")?.remove();this.#dirty=true;this.#syncFooter();return;}
    if(action==="removeChoiceGroup"){event.currentTarget.closest("[data-choice-group]")?.remove();this.#dirty=true;this.#syncFooter();return;}
    // Formula and Condition blocks: operands and table rows are added or removed through the block's form state.
    if(["addRuleOperand","removeRuleOperand","addExprRow","removeExprRow"].includes(action)){
      const button=event.currentTarget,block=button.closest("[data-expr-block]"),slot=button.closest("[data-rule-operand]"),row=button.closest("[data-expr-row]");if(!block?.isConnected)return;
      const at=list=>list.indexOf(action==="removeRuleOperand"?slot:row);
      this.#renderExpressionBlock(block,form=>{
        if(action==="addRuleOperand")return {...form,children:[...form.children,{kind:"literal",value:"0"}]};
        if(action==="addExprRow")return {...form,rows:[...form.rows,blockShape(form.operation)==="range"?{min:"",max:"",value:"0"}:{key:"",value:"0"}]};
        if(action==="removeRuleOperand"){const i=at([...block.querySelectorAll(":scope > [data-rule-operand]")]);return form.children.length>1?{...form,children:form.children.filter((_,j)=>j!==i)}:form;}
        const i=at([...block.querySelectorAll(":scope > [data-expr-rows] > [data-expr-row]")]);return form.rows.length>1?{...form,rows:form.rows.filter((_,j)=>j!==i)}:form;
      });return;
    }
    if(action==="chooseImage"){
      const input=this.element.querySelector('[name="image"]'),current=String(input?.value??"");
      const Picker=globalThis.FilePicker?.implementation??globalThis.FilePicker;if(!Picker)throw new Error("Foundry FilePicker is unavailable.");
      const picker=new Picker({type:"image",current,callback:path=>{if(input){input.value=path;this.#dirty=true;this.#syncFooter();const preview=this.element.querySelector("[data-image-preview]");if(preview)preview.src=path||"icons/svg/mystery-man.svg";}}});
      return picker.browse?.();
    }
    if(action==="removeImage"){const input=this.element.querySelector('[name="image"]');if(input){input.value="";this.#dirty=true;this.#syncFooter();const preview=this.element.querySelector("[data-image-preview]");if(preview)preview.src="icons/svg/mystery-man.svg";}return;}
    if(action==="saveQuit")return this.#save(true);
    if(action==="close")return this.close();
    if(action==="cancel"){if(this.#dirty&&!await confirmRTA("RTA.UI.DiscardChanges"))return;return this.close();}
    if(action==="delete"){
      if(!this.#id||!await confirmRTA("RTA.UI.DeleteEntry"))return;
      try{if(this.#kind==="ruleset")await this.#api.deleteRulesetVersion(this.#versionId);else if(await this.#deleteEntry()===false)return;await this.#onSaved();return this.close();}
      catch(error){this.#error=error?.message??String(error);return this.render(false);}
    }
  }
  /** CP-31: optional references to the entry are cleared only after the GM confirms which ones. */
  #deleteEntry(){return deleteRulesetEntry(this.#api,this.#versionId,this.#kind,this.#id,confirmRTA);}
  /** Delete is disabled ahead of time when the Core would refuse it (§46). */
  #deletionView(){
    // Deleting the active version stays possible from the Ruleset list, which deactivates it first.
    if(this.#kind==="ruleset")return {blocked:false,reason:""};
    return entryDeletionView(this.#api,this.#versionId,this.#kind,this.#id);
  }

}
