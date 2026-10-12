import {effectOperationRegistry} from "./operation-registries.mjs";
import {collectFormulaExpression,collectConditionExpression} from "./entry-expression-serialization.mjs";
import {collectCreationSteps} from "./creation-step-serialization.mjs";
import {collectEntryData} from "./entry-data-collector.mjs";
import {constraintRowModel,presentationRowModel} from "./declarative-editor.mjs";
import {CONSTRAINT_KINDS} from "./declarative-contracts.mjs";
import {assertPersistedRelations} from "./relation-persistence.mjs";
import {buildFieldRow,buildNewFieldRow,buildEventFieldRow,buildDefinitionFieldModel} from "./entry-field-models.mjs";
import {buildRuleReferenceChoices} from "./entry-reference-catalog.mjs";
import {buildSlotFormContext,syncValueSource,syncEntryMode} from "./slot-form.mjs";
import {wireOrderedLists} from "../ui/ordered-list.mjs";
import {modifierFormContext,durationFormContext} from "./modifier-duration-form.mjs";
import {permissionFormContext} from "./permission-form.mjs";
import {triggerFilterContext} from "./trigger-filter-form.mjs";
import {SYSTEM_EVENT_TYPES} from "./system-events.mjs";
import {outcomeMappingContext} from "./action-outcome-form.mjs";
import {capabilityRole,capabilityRoleFlags,capabilityLabel} from "./capability-type-registry.mjs";
import {availableDocumentTypes} from "../core/system-document-types.mjs";

import {pickerSummary,missingTargetLabel,editorDisplayTitle} from "../ui/editor-display-text.mjs";
import {refToken,parseRefToken} from "./reference-token.mjs";
import {simpleFormulaModel,simpleConditionModel,CONSTANT_OPERATORS} from "./entry-expression-model.mjs";
import {buildFieldReferenceChoices} from "./field-reference-choices.mjs";
import {createEntrySeed} from "./entry-seed.mjs";
import {ENTRY_OPERATIONS} from "./entry-operations.mjs";
import {renderPickerOptions,renderChoiceListBody,renderCreationCheckboxPicker} from "../ui/picker-markup.mjs";
import {renderSelectOptions,renderCreationKindsOptions} from "../ui/select-option-markup.mjs";
export {renderPickerOptions,renderChoiceListBody} from "../ui/picker-markup.mjs";
import {renderChoiceGroupHTML,renderRuleOperandHTML,renderCreationStepHTML} from "../ui/entry-editor-markup.mjs";
import {renderDeclarativeConstraintRow} from "../ui/declarative-editor-markup.mjs";
import {escapeHTML as escape} from "../ui/html-utils.mjs";
import {renderNewEventFieldInnerHTML,renderNewSheetComponentHTML} from "../ui/entry-editor-markup.mjs";
import {RULESET_SECTIONS,rulesetColor,sectionColor,mayOverrideSection,sectionForCollection,objectColor} from "./ruleset-colors.mjs";
import {RTA_NEUTRAL_COLOR} from "../ui/theme-tokens.mjs";
import {MODULE_ID} from "../core/module-contract.mjs";
import {createSelectColorResolver,referenceKindTitle,selectColorsAttribute} from "../ui/select-option-presentation.mjs";
import {confirmRTA} from "./foundry-dialogs.mjs";
import {describeDeletion,rulesetObjectName} from "./deletion-view.mjs";
import {entryHelp} from "./entry-help.mjs";
import {RTASelect} from "../ui/rta-select.mjs";
import {relationCatalog,relationRowModel,collectRelationRows} from "./generic-relations.mjs";
import {renderRelationRow} from "../ui/relation-editor-markup.mjs";
import {ConfiguratorWindow} from "./configurator-window.mjs";
import {formatEditorValue} from "./editor-value.mjs";
import {getCreationSources, getCreationSourceDescriptor} from "./creation-source-catalog.mjs";
import {diagnosticFocusTargets,saveErrorFocusPath} from "./diagnostic-focus.mjs";
import {buildTestInputContext,syncTestInputSource} from "./test-input-form.mjs";
import {rollVariantContext,actionInputContext,tableRowContext} from "./rule-cards-form.mjs";
import {syncCard} from "./card-form.mjs";


const uid=prefix=>`${prefix}-${crypto.randomUUID?.()??Math.random().toString(36).slice(2)}`;
const fieldUid=()=>`field-${crypto.randomUUID?.()??Math.random().toString(36).slice(2)}`;
/** Families whose relations the runtime reads: Content Template grants and Definition relationCount. */
const RELATION_KINDS=Object.freeze(["definition","contentTemplate"]);
const copy=value=>value===undefined?undefined:JSON.parse(JSON.stringify(value));
const json=(value,fallback)=>{const text=String(value??"").trim();return text?JSON.parse(text):fallback;};
const checked=form=>name=>form.querySelector(`[name="${CSS.escape(name)}"]`)?.checked===true;
const uiText=(key,fallback)=>{const i18n=globalThis.game?.i18n;const translated=i18n?.localize?.(`RTA.DynamicUI.${key}`);return translated&&translated!==`RTA.DynamicUI.${key}`?translated:fallback;};
const selection=(items,selected=[])=>{const set=new Set(selected??[]);return items.map(item=>({...item,selected:set.has(item.id)}));};
export class ConfiguratorEntryEditor extends ConfiguratorWindow {
  static DEFAULT_OPTIONS={window:{title:"Rule Them'All Entry",resizable:true},position:{width:760,height:760}};
  static PARTS={content:{template:`modules/${MODULE_ID}/templates/configurator/entry-editor.hbs`,scrollable:["[data-entry-scroll]"]}};
  static MINIMUM={width:560,height:440};

  #api; #optionColors=()=>[]; #renderCatalog=null; #versionId; #kind; #id; #definitionTypeId; #contentTypeId; #baseline; #error=""; #dirty=false; #onSaved; #focusPath=null;
  constructor({api,versionId,kind,id=null,definitionTypeId=null,contentTypeId=null,focusPath=null,onSaved=()=>{}},options={}){
    super(options);this.#focusPath=focusPath;this.#api=api;this.#versionId=versionId;this.#kind=kind;this.#id=id;this.#definitionTypeId=definitionTypeId;this.#contentTypeId=contentTypeId;this.#onSaved=onSaved;
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
      language:globalThis.game?.i18n?.lang??'en'
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
      language:globalThis.game?.i18n?.lang??'en',mutableOnly
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
      fieldItems:Object.values(cap.fields??{}),outputItems:Object.values(cap.outputs??{}),hasContract:Object.keys(cap.fields??{}).length>0||Object.keys(cap.outputs??{}).length>0
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
    const lists={listParameters:"parameters",listFormulas:"formulas",listFormulaBindings:"formulaBindings",listConditions:"conditions",listRolls:"rolls",listOutcomes:"outcomes",listTests:"tests",listEffects:"effects",listActions:"actions",listEventTypes:"eventTypes",listContentTypes:"contentTypes",listDefinitions:"definitions",listCategories:"categories",listTags:"tags",listModifiers:"modifiers",listDurations:"durations",listTables:"tables"};
    const list=method=>(this.#kind==="ruleset" && !this.#id)?[]:this.#renderList(lists[method],method);
    const parameters=list("listParameters"), formulas=list("listFormulas"), formulaBindings=list("listFormulaBindings"), conditions=list("listConditions"), rolls=list("listRolls"), outcomes=list("listOutcomes"), tests=list("listTests"), effects=list("listEffects"), actions=list("listActions"), eventTypes=list("listEventTypes"), contentTypes=list("listContentTypes"), definitions=list("listDefinitions"), categories=list("listCategories"), tags=list("listTags");
    const conditionChoices=selection(conditions.map(x=>({id:x.id,label:x.nameKey,...withColors("condition",x)})),data.conditionRefs);
    const rollChoices=[{id:"",label:uiText("NoRoll","No Roll: deterministic Test"),selected:!data.rollRef},...rolls.map(x=>({id:x.id,label:x.nameKey,...withColors("roll",x),selected:x.id===data.rollRef}))];
    const optionalFormula=(selected,emptyKey,emptyLabel)=>[{id:"",label:uiText(emptyKey,emptyLabel),selected:!selected},...formulas.map(x=>({id:x.id,label:x.nameKey,...withColors("formula",x),selected:x.id===selected}))];
    const totalFormulaChoices=optionalFormula(data.totalFormulaRef,"TotalFromRoll","Roll + bonus"),marginFormulaChoices=optionalFormula(data.marginFormulaRef,"MarginFromTotal","Total − target");
    // A Test checks its Outcomes in list order: chosen ones first, in that order, then the others (hidden).
    const outcomeById=new Map(outcomes.map(x=>[x.id,x])),chosenOutcomes=(data.outcomeRefs??[]).filter(id=>outcomeById.has(id));
    const outcomeRows=[...chosenOutcomes.map(id=>outcomeById.get(id)),...outcomes.filter(x=>!chosenOutcomes.includes(x.id))].map(x=>({id:x.id,label:x.nameKey,...withColors("outcome",x),selected:chosenOutcomes.includes(x.id)}));
    const testChoices=tests.map(x=>({id:x.id,label:x.nameKey,...withColors("test",x),selected:x.id===data.testRef}));
    const availabilityChoices=[{id:"",label:uiText("AlwaysAvailable","Always available"),colors:selectColorsAttribute([RTA_NEUTRAL_COLOR]),selected:!data.availabilityConditionRef},...conditions.map(x=>({id:x.id,label:x.nameKey,...withColors("condition",x),selected:x.id===data.availabilityConditionRef}))];
    const outcomeConditionChoices=[{id:"",label:"Always / fallback",selected:!data.conditionRef},...conditions.map(x=>({id:x.id,label:x.nameKey,selected:x.id===data.conditionRef}))];
    const bonusFormulaChoices=[{id:"",label:"None",selected:!data.bonusFormulaRef},...formulas.map(x=>({id:x.id,label:x.nameKey,...withColors("formula",x),selected:x.id===data.bonusFormulaRef}))];
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
    const appliedStateChoices=stateDefinitions.map(x=>({id:x.id,label:x.nameKey,...withColors("definition",x),selected:(data.stateApplications??[]).some(a=>a?.definitionId===x.id)}));
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
      id:refToken(x),label:`${referenceKindTitle(x.objectKind,globalThis.game?.i18n?.lang==='fr')} · ${x.label}`,
      colors:selectColorsAttribute(this.#optionColors(x.objectKind,x.entry)),
      objectKind:x.objectKind,objectId:x.objectId
    }));
    const choiceGroupRows=(data.choiceGroups??[]).map(group=>{
      const currentRefs=new Set((group.options??[]).map(option=>refToken(option.targetRef??{})));
      const operation=group.options?.[0]?.operation??'grant';
      return {...group,operation,isGrant:operation==='grant',isUnlock:operation==='unlock',isLink:operation==='link',
        targetOptions:relationTargetChoices.map(option=>({...option,selected:currentRefs.has(option.id)}))};
    });
    const referenceChoices=this.#referenceChoices(),mutableReferenceChoices=this.#referenceChoices({mutableOnly:true});
    // An Effect's operand and a Modifier's value source share one editor.
    const operandSource=this.#kind==="modifier"?data.valueSource:data.operand,needsOperand=this.#kind!=="effect"||effectOperationRegistry.get(data.operation??"set")?.operand!==false;
    const targetToken=refToken(data.targetRef??{}),operandKind=operandSource?.kind??"literal",operandRefToken=operandKind==="reference"?refToken(operandSource?.reference??{}):"";
    const referenceTargetToken=refToken(data);
    const bindingTargetToken=refToken(data.targetRef??{});
    const bindingFormulaChoices=formulas.map(x=>({id:x.id,label:x.nameKey,...withColors("formula",x),selected:x.id===data.formulaRef}));
    const formulaModel=simpleFormulaModel(data.expression??{type:"literal",value:0},{parameters,formulas,references:referenceChoices,withColors});
    const conditionModel=simpleConditionModel(data.expression??{type:"literal",value:true},{parameters,formulas,references:referenceChoices,withColors});
    const relationTargets=relationCatalog(this.#renderCatalog??{}, {exclude:{objectKind:this.#kind,objectId:data.id}});
    const relationRows=(data.relations??[]).map(relation=>relationRowModel(relation,relationTargets,(kind,entry)=>selectColorsAttribute(this.#optionColors(kind,entry))));
    const tagChoices=selection(tags.map(x=>({id:x.id,label:x.nameKey,...withColors("tag",x)})),data.tags);
    const tagSummary=pickerSummary(tagChoices);
    // Stored ids that no longer resolve stay visible so the GM can remove them.
    const categoryIds=new Set(categories.map(x=>x.id));
    const categoryChoices=selection([...categories.map(x=>({id:x.id,label:x.nameKey,...withColors("category",x)})),...(data.categories??[]).filter(id=>!categoryIds.has(id)).map(id=>({id,label:id,colors:RTA_NEUTRAL_COLOR}))],data.categories);
    const categorySummary=pickerSummary(categoryChoices);
    const eventFieldRows=this.#kind==="eventType"?Object.entries(data.payloadFields??{}).map(([id,field])=>buildEventFieldRow(id,field,this.#api.listValueTypes())):[];
    const roleChoices=["self","source","target","subject","owner"].map(id=>({id,label:id,selected:(data.roles??[]).includes(id)}));
    // An Effect acts on the target unless told otherwise; a binding reads its own container.
    const role=data.targetRole||(this.#kind==="effect"?"target":"self"),roleSelf=role==="self",roleSource=role==="source",roleTarget=role==="target",roleSubject=role==="subject",roleOwner=role==="owner";
    const conditionSummary=pickerSummary(conditionChoices),costEffectSummary=pickerSummary(effectChoices,"costSelected"),effectSummary=pickerSummary(effectChoices,"effectSelected"),actionSummary=pickerSummary(actionChoices);
    const sheetComponentRows=this.#kind==="sheetDefinition"?(data.layout?.components??[]).map((c,index)=>({...c,index,sourceToken:c.source?refToken(c.source):"",sourceChoices:[{token:"",label:"— none —"},...referenceChoices].map(x=>({...x,selected:x.token===(c.source?refToken(c.source):"")})),isSection:c.kind==="section",isText:c.kind==="text",isField:c.kind==="field",isRepeater:c.kind==="repeater",isActions:c.kind==="actions",isContent:c.kind==="content",isSpacer:c.kind==="spacer",isHalf:c.width==="half",isFull:c.width!=="half"})):[];
    Object.assign(context,{error:this.#error,kind:this.#kind,creating,readOnly:isValidated,deletion:creating?{blocked:false,reason:""}:this.#deletionView(),help:entryHelp(this.#kind,{definitionType:type}),data,type,fieldContract,fieldRows,newFieldRow,capabilityChoices,colorSectionChoices,rulesetMainColor:rulesetColor(data),allowTypeColor,inheritedTypeColor,hasCustomColor:!!data.color,valueTypes:this.#api.listValueTypes().map(v=>({...v,selected:v.id===(data.valueType??data.resultType)})),
      documentActorTypes:availableDocumentTypes("Actor").map(id=>({id,selected:data.storageKind==="actor"&&data.documentSubtype===id})),documentItemTypes:availableDocumentTypes("Item").map(id=>({id,selected:data.storageKind!=="actor"&&data.documentSubtype===id})),
      hasForcedCapabilities,hasOptionalCapabilities,conditionChoices,acquiredDefinitionChoices,acquisitionActionChoices,appliedStateChoices,removedStateChoices,appliedModifierChoices,stateDurationChoices,rollChoices,outcomeRows,fallbackOutcomeChoices,testChoices,bindingFormulaChoices,tagChoices,tagSummary,categoryChoices,categorySummary,eventFieldRows,roleChoices,contentTypeChoices,relationRows,hasRelations:RELATION_KINDS.includes(this.#kind),roleSelf,roleSource,roleTarget,roleSubject,roleOwner,outcomeConditionChoices,bonusFormulaChoices,targetSourceChoices,fixedTarget,showTestCalculation,effectChoices,actionChoices,eventTypeChoices,choiceGroupRows,conditionSummary,costEffectSummary,effectSummary,actionSummary,formulaModel,conditionModel,conditionOperands:[conditionModel.left,conditionModel.right],sheetComponentRows,sheetViewActor:data.viewType==="actor"||!data.viewType,sheetViewItem:data.viewType==="item",sheetViewContent:data.viewType==="content",sheetViewRuntime:data.viewType==="runtime",
      referenceChoices:referenceChoices.map(x=>({...x,selected:x.token===referenceTargetToken})),
      bindingTargetChoices:referenceChoices.filter(x=>parseRefToken(x.token).capabilityId).map(x=>({...x,selected:x.token===bindingTargetToken})),
      effectTargetChoices:mutableReferenceChoices.map(x=>({...x,selected:x.token===targetToken})),
      parameterChoices:parameters.map(x=>({id:x.id,label:x.nameKey,...withColors("parameter",x),selected:operandKind==="parameter"&&operandSource?.id===x.id})),formulaChoices:formulas.map(x=>({id:x.id,label:x.nameKey,...withColors("formula",x),selected:operandKind==="formula"&&operandSource?.id===x.id})),
      operandReferenceChoices:referenceChoices.map(x=>({...x,selected:x.token===operandRefToken})),operandKind,isOperandLiteral:operandKind==="literal",isOperandParameter:operandKind==="parameter",isOperandFormula:operandKind==="formula",isOperandReference:operandKind==="reference",isOperandRoll:operandKind==="roll",operandAllowsRoll:this.#kind==="effect",showOperand:Object.fromEntries(["literal","parameter","formula","reference","roll"].map(kind=>[kind,operandKind===kind&&needsOperand])),
      operandRollChoices:rolls.map(x=>({id:x.id,label:x.nameKey,...withColors("roll",x),selected:x.id===operandSource?.rollRef})),operandRollMultiplierChoices:[{id:"",label:uiText("NoMultiplier","×1"),selected:!operandSource?.multiplierFormulaRef},...formulas.map(x=>({id:x.id,label:x.nameKey,...withColors("formula",x),selected:x.id===operandSource?.multiplierFormulaRef}))],operandRollBonusChoices:[{id:"",label:uiText("NoBonus","No bonus"),selected:!operandSource?.bonusFormulaRef},...formulas.map(x=>({id:x.id,label:x.nameKey,...withColors("formula",x),selected:x.id===operandSource?.bonusFormulaRef}))],operandRollFactorChoices:[{id:"",label:uiText("NoFactor","×1"),selected:!operandSource?.factorFormulaRef},...formulas.map(x=>({id:x.id,label:x.nameKey,...withColors("formula",x),selected:x.id===operandSource?.factorFormulaRef}))],operandRollMinimum:Number.isFinite(operandSource?.minimum)?String(operandSource.minimum):"",operandLiteral:operandKind==="literal"?formatEditorValue("number","one",operandSource?.value??0):"",
      isRuleset:this.#kind==="ruleset",isDefinitionType:this.#kind==="definitionType",isDefinition:this.#kind==="definition",
      isParameter:this.#kind==="parameter",isFormula:this.#kind==="formula",isFormulaBinding:this.#kind==="formulaBinding",isCondition:this.#kind==="condition",isRoll:this.#kind==="roll",isOutcome:this.#kind==="outcome",isTest:this.#kind==="test",isEffect:this.#kind==="effect",isAction:this.#kind==="action",isTable:this.#kind==="table",
      isPermissionPolicy:this.#kind==="permissionPolicy",isSheetDefinition:this.#kind==="sheetDefinition",isTag:this.#kind==="tag",isCategory:this.#kind==="category",
      slots:this.#kind==="definition"?buildSlotFormContext({definition:data,permittedCapabilities:capabilityChoices.filter(cap=>cap.permitted).map(cap=>cap.id),formulas,contentTypes,valueTypes:this.#api.listValueTypes(),colorsOf:(kind,entry)=>withColors(kind,entry).colors,neutral:selectColorsAttribute([RTA_NEUTRAL_COLOR])}):null,testInputs:this.#kind==="test"?buildTestInputContext({inputs:data.inputBindings??[],formulas:formulas.map(x=>({id:x.id,label:x.nameKey,...withColors("formula",x)})),references:this.#referenceChoices(),neutral:selectColorsAttribute([RTA_NEUTRAL_COLOR])}):null,totalFormulaChoices,marginFormulaChoices,isEventType:this.#kind==="eventType",isTrigger:this.#kind==="trigger",isContentType:this.#kind==="contentType",availabilityChoices,isContentTemplate:this.#kind==="contentTemplate",
      isCreationSystem:this.#kind==="creationSystem",creationStepRows:this.#kind==="creationSystem"?(data.steps??[]).map(step=>({html:this.#creationStepHTML(step)})):[],isGeneric:this.#kind==="progressionSystem",isModifier:this.#kind==="modifier",isDuration:this.#kind==="duration",
      ...(this.#kind==="modifier"?modifierFormContext(data,{valueTargetChoices:referenceChoices.filter(x=>parseRefToken(x.token).capabilityId==="value").map(x=>({...x,selected:x.token===targetToken}))}):{}),
      ...(this.#kind==="duration"?durationFormContext(data,{eventTypes,conditions,withColors}):{}),
      ...(this.#kind==="roll"?rollVariantContext(data,{conditions,withColors}):{}),
      ...(this.#kind==="action"?actionInputContext(data,{definitionTypes:selectableDefinitionTypes,withColors,neutral:selectColorsAttribute([RTA_NEUTRAL_COLOR])}):{}),
      ...(this.#kind==="table"?{...tableRowContext(data,{actions,withColors}),tableRollChoices:rolls.map(x=>({id:x.id,label:x.nameKey,...withColors("roll",x),selected:x.id===data.rollRef})),tableBonusChoices:optionalFormula(data.bonusFormulaRef,"NoBonus","No bonus")}:{}),
      ...(this.#kind==="trigger"?{triggerActingChoices:["self","target"].map(id=>({id,labelKey:`RTA.Trigger.Acting.${id}`,colors:selectColorsAttribute([RTA_NEUTRAL_COLOR]),selected:id===(data.actingRole??"self")})),triggerModeChoices:["automatic","offer"].map(id=>({id,labelKey:`RTA.Trigger.Modes.${id}`,colors:selectColorsAttribute([RTA_NEUTRAL_COLOR]),selected:id===(data.mode??"automatic")}))}:{}),
      ...(this.#kind==="action"?(()=>{const raise=(data.acquisitions??[]).find(a=>a?.ifAbsent);return {acquisitionRaises:Boolean(raise),acquisitionRaise:String(raise?.add?.["value.base"]??1),acquisitionRepeatChoices:["refuse","raise"].map(id=>({id,labelKey:`RTA.Template.AcquisitionRepeats.${id}`,colors:selectColorsAttribute([RTA_NEUTRAL_COLOR]),selected:id===(raise?"raise":"refuse")}))};})():{}),
      ...(this.#kind==="action"?{isReroll:Boolean(data.reroll),rerollKeepDice:data.reroll?.keepDice===true,rerollActionChoices:actions.filter(x=>x.id!==data.id).map(x=>({id:x.id,label:x.nameKey,...withColors("action",x),selected:(data.reroll?.actionRefs??[]).includes(x.id)})),targetingChoices:["one","each","shared"].map(id=>({id,labelKey:`RTA.Action.Targeting.${id}`,colors:selectColorsAttribute([RTA_NEUTRAL_COLOR]),selected:id===(data.targeting??"one")})),tableChoices:[{id:"",label:uiText("NoTable","No Table"),selected:!data.tableRef},...list("listTables").map(x=>({id:x.id,label:x.nameKey,...withColors("table",x),selected:x.id===data.tableRef}))]}:{}),
      ...(this.#kind==="effect"?{targetDefinitionFormulaChoices:optionalFormula(data.targetDefinitionFormulaRef,"FixedTargetDefinition","The target above")}:{}),
      ...(this.#kind==="action"?outcomeMappingContext(data,{tests,outcomes,effects,actions:actions.filter(x=>x.id!==data.id),withColors}):{}),
      ...(this.#kind==="trigger"?{...triggerFilterContext(data,{eventTypes:[...eventTypes,...systemEvents]}),triggerEventChoices}:{}),
      ...(this.#kind==="permissionPolicy"?permissionFormContext(data,{definitions,actions,conditions,withColors}):{}),dirty:this.#dirty,canPersist:!isValidated&&this.#dirty,
      constraintRows:(data.constraints??[]).filter(rule=>CONSTRAINT_KINDS.includes(rule?.kind)).map(rule=>{
        const model=constraintRowModel(rule);
        const names=[...new Set([...Object.keys(data.fields??{}),'relations',model.field])].filter(Boolean);
        model.fields=names.map(id=>({id,colors:RTA_NEUTRAL_COLOR,selected:id===model.field}));
        return model;
      }),
      constraintFieldOptions:[...new Set([...Object.keys(data.fields??{}),'relations'])].map(id=>({id,colors:RTA_NEUTRAL_COLOR})),
      presentationRows:presentationRowModel(this.#kind==="definition"?data.presentationProfile:data.presentation),
      imagePreview:data.image||"icons/svg/mystery-man.svg",
      dataJson:JSON.stringify(data.data??{},null,2),genericJson:JSON.stringify(data,null,2),
      expressionJson:JSON.stringify(data.expression??{type:"literal",value:0},null,2),
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
    form.addEventListener("input",event=>{mark();const row=event.target.closest?.("[data-definition-field]");if(row&&!row.dataset.required){const use=row.querySelector("[data-field-present]");if(use&&!use.checked){use.checked=true;}}if(event.target.matches?.("[data-picker-filter]"))this.#filterPicker(event.target);});
    form.addEventListener("change",event=>{if(event.target.matches?.("[data-step-source-family]")&&event.target.checked){const group=event.target.closest("[data-step-prop=sourceCollection]");for(const other of group?.querySelectorAll("[data-step-source-family]")??[])if(other!==event.target)other.checked=false;}this.#syncCreationSource(event.target);this.#syncCreationKind(event.target);mark();if(event.target.matches?.("[data-presentation-override]")){const row=event.target.closest("[data-presentation-key]");const control=row?.querySelector(".rta-declarative-presentation__value");if(control)control.hidden=!event.target.checked;}this.#syncFieldRow(event.target);this.#syncModeRows(event.target);this.#syncOperandEditor(event.target);this.#syncRuleOperandEditor(event.target);this.#syncPickerSummary(event.target);this.#syncStorageKind(event.target);if(event.target.matches?.("[data-color-override-toggle]")){const input=event.target.closest("[data-color-override-editor]")?.querySelector("[data-custom-color-input]");if(input)input.disabled=!event.target.checked;}});
    form.addEventListener("change",event=>{const card=event.target.closest?.("[data-card]");if(card)syncCard(card);if(event.target.matches?.("[data-source-kind]"))syncValueSource(event.target);if(event.target.matches?.('[data-input-prop="sourceKind"]'))syncTestInputSource(event.target);if(event.target.matches?.('[data-slot-prop="entryMode"]'))syncEntryMode(event.target);});
    form.addEventListener("submit",event=>{event.preventDefault();this.#save(false);});
    // Section counters follow rows added or removed by script (§46).
    const counters=[...form.querySelectorAll("[data-live-count]")];
    if(counters.length){const sync=()=>{for(const counter of counters){const scope=counter.closest("details")??form;const count=String(scope.querySelectorAll(counter.dataset.liveCount).length);if(counter.textContent!==count)counter.textContent=count;}};sync();this._rtaCountObserver?.disconnect();this._rtaCountObserver=new MutationObserver(sync);this._rtaCountObserver.observe(form,{childList:true,subtree:true});}
    for(const button of this.element.querySelectorAll("[data-action]"))button.addEventListener("click",event=>this.#action(event));
    if(this.#focusPath!==null){const path=this.#focusPath;this.#focusPath=null;requestAnimationFrame(()=>this.#focusDiagnostic(path));}
  }

  /** Bring the control a diagnostic points to into view and highlight it briefly. */
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

  #syncRuleOperandEditor(target){
    if(!target?.matches?.("[data-rule-operand-kind]"))return;
    const row=target.closest("[data-rule-operand]");
    for(const editor of row?.querySelectorAll("[data-rule-operand-editor]")??[])editor.hidden=editor.dataset.ruleOperandEditor!==target.value;
  }

  /** Effect value rows follow the value source, and disappear for operations without operand (toggle). */
  #syncOperandEditor(target){
    if(target?.name==="conditionOperator"){const operands=this.element.querySelector("[data-condition-builder] .rta-rule-operands");if(operands)operands.hidden=CONSTANT_OPERATORS.includes(target.value);return;}
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
  #creationCheckboxList({property,items,selected=[],single=false,emptyMessage="No entries available."}){
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
    const value={id:uid("step"),name:"",kind:"choice",min:1,max:1,...copy(step)};
    const kinds=renderCreationKindsOptions(["choice","content","allocation","review"],value.kind);
    // Bounds may be Formulas over the earlier steps; options may be filtered by a Condition.
    const pick=(collection,method,kind,selected,noneLabel)=>renderSelectOptions([{id:"",label:noneLabel,colors:RTA_NEUTRAL_COLOR},...this.#renderList(collection,method).map(entry=>({id:entry.id,label:entry.nameKey||entry.id,colors:selectColorsAttribute(this.#optionColors(kind,entry))}))],{selectedValue:selected??"",colorize:true});
    const computed={min:pick("formulas","listFormulas","formula",value.minFormulaRef,uiText("FixedValue","Fixed value")),max:pick("formulas","listFormulas","formula",value.maxFormulaRef,uiText("FixedValue","Fixed value")),
      perTarget:pick("formulas","listFormulas","formula",value.perTargetMaxFormulaRef,uiText("FixedValue","Fixed value")),condition:pick("conditions","listConditions","condition",value.optionConditionRef,uiText("EveryOption","Every option")),
      // A random draw: optional (the player may change it) or final; its weight field or Roll.
      draw:renderSelectOptions([["","DrawNo","Chosen by the player"],["optional","DrawOptional","Drawn, can be changed"],["locked","DrawLocked","Drawn, final"]].map(([id,key,fallback])=>({id,label:uiText(key,fallback),colors:RTA_NEUTRAL_COLOR})),{selectedValue:value.draw?(value.draw.locked?"locked":"optional"):"",colorize:true}),
      drawRoll:pick("rolls","listRolls","roll",value.draw?.rollRef,"—")};
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
    if(!target?.matches?.('[data-step-prop="kind"], [data-step-prop="draw"]'))return;
    const step=target.closest("[data-creation-step]"),kind=step?.querySelector('[data-step-prop="kind"]')?.value,drawn=Boolean(step?.querySelector('[data-step-prop="draw"]')?.value);
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
    const steps=collectCreationSteps(this.element.querySelectorAll('[data-creation-step]'),{sources:this.#creationSources(),uid});
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
      collectFormulaExpression:fallback=>collectFormulaExpression(this.element.querySelector("[data-formula-builder]"),fallback),
      collectConditionExpression:fallback=>collectConditionExpression(this.element.querySelector("[data-condition-builder]"),fallback),
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
      id:refToken(x),label:`${referenceKindTitle(x.objectKind,globalThis.game?.i18n?.lang==='fr')} · ${x.label}`,
      colors:selectColorsAttribute(this.#optionColors(x.objectKind,x.entry))
    }));
    const choices=renderChoiceListBody(options,{name:'choiceTargetRef',placeholder:uiText('SearchRelations','Search Ruleset objects…'),emptyMessage:uiText('NoChoiceTargets','No selectable Ruleset entries for this choice.')});
    return renderChoiceGroupHTML({id,choices});
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
    const id=fieldUid(),row=document.createElement("article");row.className="rta-field-editor";row.dataset.eventFieldRow="";row.dataset.eventFieldId=id;
    const options=renderSelectOptions(this.#api.listValueTypes(),{labelKey:"id"});
    row.innerHTML=renderNewEventFieldInnerHTML(id,options);
    return row;
  }

  #ruleOperandHTML(index){
    const parameters=renderSelectOptions(this.#api.listParameters(this.#versionId).map(x=>({...x,colors:selectColorsAttribute(this.#optionColors("parameter",x))})),{labelKey:"nameKey",colorize:true});
    const formulas=renderSelectOptions(this.#api.listFormulas(this.#versionId).map(x=>({...x,colors:selectColorsAttribute(this.#optionColors("formula",x))})),{labelKey:"nameKey",colorize:true});
    const references=renderSelectOptions(this.#referenceChoices(),{valueKey:"token",colorize:true});
    return renderRuleOperandHTML({index,parameters,formulas,references});
  }

  #renumberRuleOperands(list){
    for(const [index,row] of [...(list?.querySelectorAll(':scope > [data-rule-operand]')??[])].entries()){
      const label=row.querySelector(':scope > .rta-rule-operand__label');
      if(label)label.textContent=`Operand ${index+1}`;
    }
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
    if(action==="addSheetComponent"){
      const list=this.element.querySelector("[data-sheet-components]");if(!list)return;const id=uid("component"),choices=renderSelectOptions([{token:"",label:"— none —"},...this.#referenceChoices()],{valueKey:"token",colorize:true});
      list.insertAdjacentHTML("beforeend",renderNewSheetComponentHTML(id,choices));for(const b of list.lastElementChild.querySelectorAll("[data-action]"))b.addEventListener("click",e=>this.#action(e));this.#dirty=true;this.#syncFooter();return;
    }
    if(action==="addCreationStep"){
      const list=this.element.querySelector("[data-creation-steps]");if(!list)return;
      list.insertAdjacentHTML("beforeend",this.#creationStepHTML());
      for(const button of list.lastElementChild.querySelectorAll("[data-action]"))button.addEventListener("click",event=>this.#action(event));
      this.#dirty=true;this.#syncFooter();return;
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
        const duplicate={...advanced,...(sourceCollection?{source:{...(advanced.source??{}),collection:sourceCollection,objectIds:sourceIds}}:{}),id:uid("step"),name:`${row.querySelector('[data-step-prop="name"]')?.value??"Step"} (copy)`,kind:row.querySelector('[data-step-prop="kind"]')?.value,min:Number(row.querySelector('[data-step-prop="min"]')?.value??0),max:Number(row.querySelector('[data-step-prop="max"]')?.value??1)};
        row.insertAdjacentHTML("afterend",this.#creationStepHTML(duplicate));
        for(const button of row.nextElementSibling.querySelectorAll("[data-action]"))button.addEventListener("click",event=>this.#action(event));
      }
      this.#dirty=true;this.#syncFooter();return;
    }
    if(action==="removeSheetComponent"){event.currentTarget.closest("[data-sheet-component]")?.remove();this.#dirty=true;this.#syncFooter();return;}
    if(action==="sheetUp"||action==="sheetDown"){const row=event.currentTarget.closest("[data-sheet-component]");if(!row)return;const sibling=action==="sheetUp"?row.previousElementSibling:row.nextElementSibling;if(sibling){if(action==="sheetUp")row.parentElement.insertBefore(row,sibling);else row.parentElement.insertBefore(sibling,row);this.#dirty=true;this.#syncFooter();}return;}
    if(action==="addDeclarativeConstraint"){const list=this.element.querySelector("[data-declarative-constraints]");if(list){const row=document.createElement("div");row.className="rta-declarative-constraint";row.dataset.declarativeConstraint="";row.innerHTML=renderDeclarativeConstraintRow({fields:[...(this.element.querySelector("template[data-constraint-field-options]")?.content.querySelectorAll("option")??[])].map(option=>({id:option.value,colors:option.dataset.rtaColors??RTA_NEUTRAL_COLOR})),labels:{field:game?.i18n?.localize?.("RTA.Declarative.Field")??"Field",rule:game?.i18n?.localize?.("RTA.Declarative.Rule")??"Rule",value:game?.i18n?.localize?.("RTA.Declarative.Value")??"Value",remove:game?.i18n?.localize?.("RTA.Declarative.DeleteConstraint")??"Remove constraint"}});list.append(row);RTASelect.enhance(this.element);row.querySelector("[data-action]").addEventListener("click",event=>this.#action(event));this.#dirty=true;this.#syncFooter();}return;}
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
    if(action==="addSlot"){const capability=event.currentTarget.dataset.slotCapability,list=this.element.querySelector(`[data-slot-list="${capability}"]`),template=this.element.querySelector(`[data-slot-template="${capability}"]`);if(list&&template){list.append(template.content.cloneNode(true));for(const button of list.lastElementChild?.querySelectorAll("[data-action]")??[])button.addEventListener("click",event=>this.#action(event));this.#dirty=true;this.#syncFooter();}return;}
    if(action==="addTestInput"){const list=this.element.querySelector("[data-test-input-list]"),template=this.element.querySelector("[data-test-input-template]");if(list&&template){list.append(template.content.cloneNode(true));for(const button of list.lastElementChild?.querySelectorAll("[data-action]")??[])button.addEventListener("click",event=>this.#action(event));this.#dirty=true;this.#syncFooter();}return;}
    if(action==="addCard"){const name=event.currentTarget.dataset.cardList,list=this.element.querySelector(`[data-card-list-body="${name}"]`),template=this.element.querySelector(`[data-card-template="${name}"]`);if(list&&template){list.append(template.content.cloneNode(true));for(const button of list.lastElementChild?.querySelectorAll("[data-action]")??[])button.addEventListener("click",event=>this.#action(event));this.#dirty=true;this.#syncFooter();}return;}
    if(action==="removeCard"){event.currentTarget.closest("[data-card]")?.remove();this.#dirty=true;this.#syncFooter();return;}
    if(action==="removeTestInput"){event.currentTarget.closest("[data-test-input]")?.remove();this.#dirty=true;this.#syncFooter();return;}
    if(action==="removeSlot"){event.currentTarget.closest("[data-slot-card]")?.remove();this.#dirty=true;this.#syncFooter();return;}
    if(action==="removeChoiceGroup"){event.currentTarget.closest("[data-choice-group]")?.remove();this.#dirty=true;this.#syncFooter();return;}
    if(action==="addFormulaOperand"){
      const list=this.element.querySelector("[data-formula-operands]");if(list){list.insertAdjacentHTML("beforeend",this.#ruleOperandHTML(list.querySelectorAll("[data-rule-operand]").length));list.lastElementChild?.querySelector('[data-action="removeRuleOperand"]')?.addEventListener("click",event=>this.#action(event));this.#renumberRuleOperands(list);this.#dirty=true;this.#syncFooter();}return;
    }
    if(action==="removeRuleOperand"){
      const row=event.currentTarget.closest("[data-rule-operand]"),list=row?.parentElement;if(list?.querySelectorAll("[data-rule-operand]").length>1){row.remove();this.#renumberRuleOperands(list);this.#dirty=true;this.#syncFooter();}return;
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
  async #deleteEntry(){
    const remove=ENTRY_OPERATIONS[this.#kind].delete;
    try{return await this.#api[remove](this.#versionId,this.#id);}
    catch(error){
      if(error?.code!=="OPTIONAL_REFERENCES")throw error;
      const list=(error.consumers??[]).map(edge=>`${edge.consumerRef.objectKind} ${edge.consumerRef.objectId}`).join(", ");
      if(!await confirmRTA("RTA.UI.ClearOptionalReferences",{list}))return false;
      return this.#api[remove](this.#versionId,this.#id,{clearOptionalReferences:true});
    }
  }
  /** Delete is disabled ahead of time when the Core would refuse it (§46). */
  #deletionView(){
    const i18n=globalThis.game?.i18n,format=(key,data)=>{const text=i18n?.format?.(key,data);return text&&text!==key?text:`${key} ${Object.values(data).join(", ")}`.trim();};
    // Deleting the active version stays possible from the Ruleset list, which deactivates it first.
    if(this.#kind==="ruleset")return {blocked:false,reason:""};
    const ruleset=this.#api.getRuleset(this.#versionId),fr=i18n?.lang==="fr";
    return describeDeletion(this.#api.getDeletionStatus(this.#versionId,this.#id,this.#kind),{format,nameOf:(kind,id)=>`${referenceKindTitle(kind,fr)} · ${rulesetObjectName(ruleset,kind,id)}`});
  }
}
