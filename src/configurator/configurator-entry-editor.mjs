import {collectFormulaExpression,collectConditionExpression} from "./entry-expression-serialization.mjs";
import {collectCreationSteps} from "./creation-step-serialization.mjs";
import {collectEntryData} from "./entry-data-collector.mjs";
import {constraintRowModel,presentationRowModel} from "./declarative-editor.mjs";
import {CONSTRAINT_KINDS} from "./declarative-contracts.mjs";
import {assertPersistedRelations} from "./relation-persistence.mjs";
import {buildFieldRow,buildEventFieldRow,buildDefinitionFieldModel} from "./entry-field-models.mjs";
import {buildRuleReferenceChoices} from "./entry-reference-catalog.mjs";
import {availableDocumentTypes} from "../core/system-document-types.mjs";

import {pickerSummary,missingTargetLabel,editorDisplayTitle} from "../ui/editor-display-text.mjs";
import {refToken,parseRefToken} from "./reference-token.mjs";
import {simpleFormulaModel,simpleConditionModel} from "./entry-expression-model.mjs";
import {buildFieldReferenceChoices} from "./field-reference-choices.mjs";
import {createEntrySeed} from "./entry-seed.mjs";
import {ENTRY_OPERATIONS} from "./entry-operations.mjs";
import {renderPickerOptions,renderChoiceListBody,renderCreationCheckboxPicker} from "../ui/picker-markup.mjs";
import {renderSelectOptions,renderCreationKindsOptions} from "../ui/select-option-markup.mjs";
export {renderPickerOptions,renderChoiceListBody} from "../ui/picker-markup.mjs";
import {renderChoiceGroupHTML,renderRuleOperandHTML,renderCreationStepHTML} from "../ui/entry-editor-markup.mjs";
import {renderDeclarativeConstraintRow} from "../ui/declarative-editor-markup.mjs";
import {escapeHTML as escape} from "../ui/html-utils.mjs";
import {renderNewFieldInnerHTML,renderNewEventFieldInnerHTML,renderNewSheetComponentHTML} from "../ui/entry-editor-markup.mjs";
import {RULESET_SECTIONS,rulesetColor,sectionColor,mayOverrideSection,sectionForCollection,objectColor} from "./ruleset-colors.mjs";
import {RTA_NEUTRAL_COLOR} from "../ui/theme-tokens.mjs";
import {MODULE_ID} from "../core/module-contract.mjs";
import {createSelectColorResolver,referenceKindTitle,selectColorsAttribute} from "../ui/select-option-presentation.mjs";
import {confirmRTA} from "./foundry-dialogs.mjs";
import {RTASelect} from "../ui/rta-select.mjs";
import {relationCatalog,relationRowModel,collectRelationRows} from "./generic-relations.mjs";
import {renderRelationRow} from "../ui/relation-editor-markup.mjs";
import {ConfiguratorWindow} from "./configurator-window.mjs";
import {formatEditorValue} from "./editor-value.mjs";
import {getCreationSources, getCreationSourceDescriptor} from "./creation-source-catalog.mjs";


const uid=prefix=>`${prefix}-${crypto.randomUUID?.()??Math.random().toString(36).slice(2)}`;
const fieldUid=()=>`field-${crypto.randomUUID?.()??Math.random().toString(36).slice(2)}`;
const copy=value=>value===undefined?undefined:JSON.parse(JSON.stringify(value));
const json=(value,fallback)=>{const text=String(value??"").trim();return text?JSON.parse(text):fallback;};
const checked=form=>name=>form.querySelector(`[name="${CSS.escape(name)}"]`)?.checked===true;
const uiText=(key,fallback)=>{const i18n=globalThis.game?.i18n;const translated=i18n?.localize?.(`RTA.DynamicUI.${key}`);return translated&&translated!==`RTA.DynamicUI.${key}`?translated:fallback;};
const selection=(items,selected=[])=>{const set=new Set(selected??[]);return items.map(item=>({...item,selected:set.has(item.id)}));};
export class ConfiguratorEntryEditor extends ConfiguratorWindow {
  static DEFAULT_OPTIONS={window:{title:"Rule Them'All Entry",resizable:true},position:{width:760,height:760}};
  static PARTS={content:{template:`modules/${MODULE_ID}/templates/configurator/entry-editor.hbs`,scrollable:["[data-entry-scroll]"]}};
  static MINIMUM={width:560,height:440};

  #api; #optionColors=()=>[]; #renderCatalog=null; #versionId; #kind; #id; #definitionTypeId; #contentTypeId; #baseline; #error=""; #dirty=false; #onSaved;
  constructor({api,versionId,kind,id=null,definitionTypeId=null,contentTypeId=null,onSaved=()=>{}},options={}){
    super(options);this.#api=api;this.#versionId=versionId;this.#kind=kind;this.#id=id;this.#definitionTypeId=definitionTypeId;this.#contentTypeId=contentTypeId;this.#onSaved=onSaved;
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
    const selected=id=>Array.isArray(data?.[id])?data[id]:[];
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
      ...cap,allowed:selected("allowedCapabilities").includes(cap.id),default:selected("defaultCapabilities").includes(cap.id),required:selected("requiredCapabilities").includes(cap.id),
      selected:(data.capabilities??[]).includes(cap.id),permitted:!type||(type.allowedCapabilities??[]).includes(cap.id),forced:!!type&&(type.requiredCapabilities??[]).includes(cap.id),
      fieldItems:Object.values(cap.fields??{}),outputItems:Object.values(cap.outputs??{}),hasContract:Object.keys(cap.fields??{}).length>0||Object.keys(cap.outputs??{}).length>0
    }));
    const hasForcedCapabilities=capabilityChoices.some(cap=>cap.permitted&&cap.forced);
    const hasOptionalCapabilities=capabilityChoices.some(cap=>cap.permitted&&!cap.forced);
    const colorSectionChoices=RULESET_SECTIONS.map(section=>({id:section.id,title:globalThis.game?.i18n?.localize?.(section.titleKey)??section.id,color:sectionColor(data,section.id),allowOverrides:mayOverrideSection(data,section.id)}));
    const typeCollection=this.#kind==='definitionType'?'definitionTypes':this.#kind==='contentType'?'contentTypes':this.#kind==='tag'?'tags':null;
    const allowTypeColor=!!typeCollection && mayOverrideSection(colorContext,sectionForCollection(typeCollection));
    const inheritedTypeColor=typeCollection?objectColor(colorContext,typeCollection,null):RTA_NEUTRAL_COLOR;
    const fieldRows=["definitionType","contentType"].includes(this.#kind)?Object.entries(data.fields??{}).map(([id,field])=>buildFieldRow(id,field,this.#api.listValueTypes())):[];
    const lists={listParameters:"parameters",listFormulas:"formulas",listFormulaBindings:"formulaBindings",listConditions:"conditions",listRolls:"rolls",listOutcomes:"outcomes",listTests:"tests",listEffects:"effects",listActions:"actions",listEventTypes:"eventTypes",listContentTypes:"contentTypes",listDefinitions:"definitions",listTags:"tags"};
    const list=method=>(this.#kind==="ruleset" && !this.#id)?[]:this.#renderList(lists[method],method);
    const parameters=list("listParameters"), formulas=list("listFormulas"), formulaBindings=list("listFormulaBindings"), conditions=list("listConditions"), rolls=list("listRolls"), outcomes=list("listOutcomes"), tests=list("listTests"), effects=list("listEffects"), actions=list("listActions"), eventTypes=list("listEventTypes"), contentTypes=list("listContentTypes"), definitions=list("listDefinitions"), tags=list("listTags");
    const conditionChoices=selection(conditions.map(x=>({id:x.id,label:x.nameKey,...withColors("condition",x)})),data.conditionRefs);
    const rollChoices=rolls.map(x=>({id:x.id,label:x.nameKey,...withColors("roll",x),selected:x.id===data.rollRef}));
    const outcomeChoices=selection(outcomes.map(x=>({id:x.id,label:x.nameKey,...withColors("outcome",x)})),data.outcomeRefs);
    const testChoices=tests.map(x=>({id:x.id,label:x.nameKey,...withColors("test",x),selected:x.id===data.testRef}));
    const outcomeConditionChoices=[{id:"",label:"Always / fallback",selected:!data.conditionRef},...conditions.map(x=>({id:x.id,label:x.nameKey,selected:x.id===data.conditionRef}))];
    const bonusFormulaChoices=[{id:"",label:"None",selected:!data.bonusFormulaRef},...formulas.map(x=>({id:x.id,label:x.nameKey,...withColors("formula",x),selected:x.id===data.bonusFormulaRef}))];
    const targetFormulaChoices=[{id:"",label:"Fixed target",selected:!data.targetFormulaRef},...formulas.map(x=>({id:x.id,label:x.nameKey,...withColors("formula",x),selected:x.id===data.targetFormulaRef}))];
    const effectChoices=effects.map(x=>({id:x.id,label:x.nameKey,...withColors("effect",x),costSelected:(data.costEffectRefs??[]).includes(x.id),effectSelected:(data.effectRefs??[]).includes(x.id)}));
    const actionChoices=selection(actions.map(x=>({id:x.id,label:x.nameKey,...withColors("action",x)})),data.actionRefs);
    const eventTypeChoices=eventTypes.map(x=>({id:x.id,label:x.nameKey,...withColors("eventType",x),selected:x.id===data.eventTypeId,actionSelected:(data.eventTypeRefs??[]).includes(x.id)}));
    const contentTypeChoices=contentTypes.map(x=>({id:x.id,label:x.nameKey,...withColors("contentType",x),selected:x.id===data.contentTypeId}));
    const definitionChoices=definitions.map(x=>({id:x.id,label:x.nameKey,...withColors("definition",x),selected:(data.definitionBindings??[]).some(b=>b?.definitionId===x.id)}));
    const definitionBindingRows=definitions.map(definition=>{
      const binding=(data.definitionBindings??[]).find(b=>b?.definitionId===definition.id)??{}, legacy=(data.initialStateRules??[]).find(r=>r?.definitionId===definition.id)??{}, initial=binding.initial??legacy.initial??legacy.values??{};
      const caps=new Set(definition.capabilities??[]);
      return {id:definition.id,label:definition.nameKey,colors:selectColorsAttribute(this.#optionColors("definition",definition)),selected:Boolean((data.definitionBindings??[]).some(b=>b?.definitionId===definition.id)),hasValue:caps.has("value"),hasPool:caps.has("pool"),hasState:caps.has("state"),valueBase:initial["value.base"]??"",poolCurrent:initial["pool.current"]??"",poolMinimum:initial["pool.minimum"]??"",poolMaximum:initial["pool.maximum"]??"",stateActive:initial["state.active"]===true};
    });
    const templateActionChoices=actions.map(x=>({id:x.id,label:x.nameKey,...withColors("action",x),selected:(data.actionBindings??[]).some(b=>b?.actionId===x.id)}));
    const relationTargetChoices=relationCatalog(this.#renderCatalog??{}).map(x=>({
      id:refToken(x),label:`${referenceKindTitle(x.objectKind,globalThis.game?.i18n?.lang==='fr')} · ${x.label}`,
      colors:selectColorsAttribute(this.#optionColors(x.objectKind,x.entry)),
      objectKind:x.objectKind,objectId:x.objectId
    }));
    const choiceGroupRows=(data.choiceGroups??[]).map(group=>{
      const currentRefs=new Set((group.options??[]).map(option=>refToken(option.targetRef??(
        option.kind==='definition'?{objectKind:'definition',objectId:option.definitionId}:
        option.kind==='action'?{objectKind:'action',objectId:option.actionId}:{}
      ))));
      const operation=group.options?.[0]?.operation??'grant';
      return {...group,operation,isGrant:operation==='grant',isUnlock:operation==='unlock',isLink:operation==='link',
        targetOptions:relationTargetChoices.map(option=>({...option,selected:currentRefs.has(option.id)}))};
    });
    const referenceChoices=this.#referenceChoices(),mutableReferenceChoices=this.#referenceChoices({mutableOnly:true});
    const targetToken=refToken(data.targetRef??{}),operandKind=data.operand?.kind??"literal",operandRefToken=operandKind==="reference"?refToken(data.operand?.reference??{}):"";
    const referenceTargetToken=refToken(data);
    const bindingTargetToken=refToken(data.targetRef??{});
    const bindingFormulaChoices=formulas.map(x=>({id:x.id,label:x.nameKey,...withColors("formula",x),selected:x.id===data.formulaRef}));
    const formulaModel=simpleFormulaModel(data.expression??{type:"literal",value:0},{parameters,formulas,references:referenceChoices,withColors});
    const conditionModel=simpleConditionModel(data.expression??{type:"literal",value:true},{parameters,formulas,references:referenceChoices,withColors});
    const relationTargets=relationCatalog(this.#renderCatalog??{}, {exclude:{objectKind:this.#kind,objectId:data.id}});
    const relationRows=(data.relations??[]).map(relation=>relationRowModel(relation,relationTargets,(kind,entry)=>selectColorsAttribute(this.#optionColors(kind,entry))));
    const contentCapabilityChoices=selection(capabilityTypes.map(x=>({id:x.id,label:x.name??x.id})),data.capabilities);
    const contentCapabilitySummary=pickerSummary(contentCapabilityChoices);
    const tagChoices=selection(tags.map(x=>({id:x.id,label:x.nameKey,...withColors("tag",x)})),data.tags);
    const tagSummary=pickerSummary(tagChoices);
    const eventFieldRows=this.#kind==="eventType"?Object.entries(data.payloadFields??{}).map(([id,field])=>buildEventFieldRow(id,field,this.#api.listValueTypes())):[];
    const roleChoices=["self","source","target","subject","owner"].map(id=>({id,label:id,selected:(data.roles??[]).includes(id)}));
    const roleSelf=data.targetRole==="self"||!data.targetRole, roleSource=data.targetRole==="source", roleTarget=data.targetRole==="target", roleSubject=data.targetRole==="subject", roleOwner=data.targetRole==="owner";
    const conditionSummary=pickerSummary(conditionChoices),costEffectSummary=pickerSummary(effectChoices,"costSelected"),effectSummary=pickerSummary(effectChoices,"effectSelected"),actionSummary=pickerSummary(actionChoices),definitionSummary=pickerSummary(definitionChoices),templateActionSummary=pickerSummary(templateActionChoices);
    const sheetComponentRows=this.#kind==="sheetDefinition"?(data.layout?.components??[]).map((c,index)=>({...c,index,sourceToken:c.source?refToken(c.source):"",sourceChoices:[{token:"",label:"— none —"},...referenceChoices].map(x=>({...x,selected:x.token===(c.source?refToken(c.source):"")})),isSection:c.kind==="section",isText:c.kind==="text",isField:c.kind==="field",isRepeater:c.kind==="repeater",isActions:c.kind==="actions",isContent:c.kind==="content",isSpacer:c.kind==="spacer",isHalf:c.width==="half",isFull:c.width!=="half"})):[];
    Object.assign(context,{error:this.#error,kind:this.#kind,creating,readOnly:isValidated,data,type,fieldContract,fieldRows,capabilityChoices,colorSectionChoices,rulesetMainColor:rulesetColor(data),allowTypeColor,inheritedTypeColor,hasCustomColor:!!data.color,valueTypes:this.#api.listValueTypes().map(v=>({...v,selected:v.id===(data.valueType??data.resultType)})),
      documentActorTypes:availableDocumentTypes("Actor").map(id=>({id,selected:data.storageKind==="actor"&&data.documentSubtype===id})),documentItemTypes:availableDocumentTypes("Item").map(id=>({id,selected:data.storageKind!=="actor"&&data.documentSubtype===id})),
      hasForcedCapabilities,hasOptionalCapabilities,conditionChoices,rollChoices,outcomeChoices,testChoices,bindingFormulaChoices,tagChoices,tagSummary,eventFieldRows,roleChoices,contentTypeChoices,contentCapabilityChoices,contentCapabilitySummary,relationRows,roleSelf,roleSource,roleTarget,roleSubject,roleOwner,outcomeConditionChoices,bonusFormulaChoices,targetFormulaChoices,effectChoices,actionChoices,eventTypeChoices,definitionChoices,definitionBindingRows,templateActionChoices,choiceGroupRows,hasLegacyAcquisitions:!!((data.definitionBindings??[]).length||(data.actionBindings??[]).length),conditionSummary,costEffectSummary,effectSummary,actionSummary,definitionSummary,templateActionSummary,formulaModel,conditionModel,conditionOperands:[conditionModel.left,conditionModel.right],sheetComponentRows,sheetViewActor:data.viewType==="actor"||!data.viewType,sheetViewItem:data.viewType==="item",sheetViewContent:data.viewType==="content",sheetViewRuntime:data.viewType==="runtime",
      referenceChoices:referenceChoices.map(x=>({...x,selected:x.token===referenceTargetToken})),
      bindingTargetChoices:referenceChoices.filter(x=>parseRefToken(x.token).capabilityId).map(x=>({...x,selected:x.token===bindingTargetToken})),
      effectTargetChoices:mutableReferenceChoices.map(x=>({...x,selected:x.token===targetToken})),
      parameterChoices:parameters.map(x=>({id:x.id,label:x.nameKey,...withColors("parameter",x),selected:operandKind==="parameter"&&data.operand?.id===x.id})),formulaChoices:formulas.map(x=>({id:x.id,label:x.nameKey,...withColors("formula",x),selected:operandKind==="formula"&&data.operand?.id===x.id})),
      operandReferenceChoices:referenceChoices.map(x=>({...x,selected:x.token===operandRefToken})),operandKind,isOperandLiteral:operandKind==="literal",isOperandParameter:operandKind==="parameter",isOperandFormula:operandKind==="formula",isOperandReference:operandKind==="reference",operandLiteral:operandKind==="literal"?formatEditorValue("number","one",data.operand?.value??0):"",
      isRuleset:this.#kind==="ruleset",isDefinitionType:this.#kind==="definitionType",isDefinition:this.#kind==="definition",isReference:this.#kind==="reference",
      isParameter:this.#kind==="parameter",isFormula:this.#kind==="formula",isFormulaBinding:this.#kind==="formulaBinding",isCondition:this.#kind==="condition",isRoll:this.#kind==="roll",isOutcome:this.#kind==="outcome",isTest:this.#kind==="test",isEffect:this.#kind==="effect",isAction:this.#kind==="action",
      isPermissionPolicy:this.#kind==="permissionPolicy",isSheetDefinition:this.#kind==="sheetDefinition",isTag:this.#kind==="tag",isEventType:this.#kind==="eventType",isTrigger:this.#kind==="trigger",isContentType:this.#kind==="contentType",isContentTemplate:this.#kind==="contentTemplate",
      isCreationSystem:this.#kind==="creationSystem",creationStepRows:this.#kind==="creationSystem"?(data.steps??[]).map(step=>({html:this.#creationStepHTML(step)})):[],isGeneric:["modifier","restriction","duration","progressionSystem"].includes(this.#kind),dirty:this.#dirty,canPersist:!isValidated&&this.#dirty,
      constraintRows:(data.constraints??[]).filter(rule=>CONSTRAINT_KINDS.includes(rule?.kind)).map(rule=>{
        const model=constraintRowModel(rule);
        const names=[...new Set([...Object.keys(data.fields??{}),'relations',model.field])].filter(Boolean);
        model.fields=names.map(id=>({id,colors:RTA_NEUTRAL_COLOR,selected:id===model.field}));
        return model;
      }),
      constraintFieldOptions:[...new Set([...Object.keys(data.fields??{}),'relations'])].map(id=>({id,colors:RTA_NEUTRAL_COLOR})),
      presentationRows:presentationRowModel(this.#kind==="definition"?data.presentationProfile:data.presentation),
      imagePreview:data.image||"icons/svg/mystery-man.svg",constraintsJson:JSON.stringify(data.constraints??[],null,2),presentationJson:JSON.stringify(data.presentation??null,null,2),
      dataJson:JSON.stringify(data.data??{},null,2),profileJson:JSON.stringify(data.presentationProfile??null,null,2),genericJson:JSON.stringify(data,null,2),
      expressionJson:JSON.stringify(data.expression??{type:"literal",value:0},null,2),scopeJson:JSON.stringify(data.scope??{objectKind:"ruleset"},null,2),rulesJson:JSON.stringify(data.rules??[],null,2),payloadFieldsJson:JSON.stringify(data.payloadFields??{},null,2),eventFilterJson:JSON.stringify(data.eventFilter??null,null,2),
      rollDataJson:JSON.stringify(data.data??{},null,2),initialStateRulesJson:JSON.stringify(data.initialStateRules??[],null,2),rolesText:(data.roles??[]).join("\n"),tagsText:(data.tags??[]).join("\n"),categoriesText:(data.categories??[]).join("\n"),capabilitiesText:(data.capabilities??[]).join("\n"),
      isAllow:data.defaultEffect==="ALLOW",isDeny:data.defaultEffect!=="ALLOW",isStackable:data.runtimeMode==="stackable",isUnique:data.runtimeMode!=="stackable",isStorageItem:data.storageKind!=="actor",isStorageActor:data.storageKind==="actor",opSet:data.operation==="set",opAdd:data.operation==="add",opSubtract:data.operation==="subtract",opMultiply:data.operation==="multiply", title:editorDisplayTitle(creating,creating?this.#kind:(data.nameKey??data.key??data.id))});
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
    form.addEventListener("input",event=>{mark();const row=event.target.closest?.("[data-definition-field]");if(row&&!row.dataset.required){const use=row.querySelector("[data-field-present]");if(use&&!use.checked){use.checked=true;}}if(event.target.matches?.("[data-picker-filter]"))this.#filterPicker(event.target);});
    form.addEventListener("change",event=>{if(event.target.matches?.("[data-step-source-family]")&&event.target.checked){const group=event.target.closest("[data-step-prop=sourceCollection]");for(const other of group?.querySelectorAll("[data-step-source-family]")??[])if(other!==event.target)other.checked=false;}this.#syncCreationSource(event.target);mark();if(event.target.matches?.("[data-presentation-override]")){const row=event.target.closest("[data-presentation-key]");const control=row?.querySelector(".rta-declarative-presentation__value");if(control)control.hidden=!event.target.checked;}this.#syncCapabilityCheckboxes(event.target);this.#syncOperandEditor(event.target);this.#syncRuleOperandEditor(event.target);this.#syncPickerSummary(event.target);this.#syncStorageKind(event.target);if(event.target.matches?.("[data-color-override-toggle]")){const input=event.target.closest("[data-color-override-editor]")?.querySelector("[data-custom-color-input]");if(input)input.disabled=!event.target.checked;}});
    form.addEventListener("submit",event=>{event.preventDefault();this.#save(false);});
    for(const button of this.element.querySelectorAll("[data-action]"))button.addEventListener("click",event=>this.#action(event));
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

  #syncOperandEditor(target){
    if(target?.name!=="operandKind")return;
    const kind=target.value;
    for(const node of this.element.querySelectorAll("[data-operand-editor]"))node.hidden=node.dataset.operandEditor!==kind;
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
    const value={id:uid("step"),name:"",kind:"choice",required:true,options:[],min:0,max:1,...copy(step)};
    const kinds=renderCreationKindsOptions(["choice","allocation","content","review"],value.kind);
    const source=value.source??{};
    const sourceFamily=String(source.collection??"");
    const selectedIds=Array.isArray(source.objectIds)?source.objectIds:[];
    const families=this.#creationSources();
    const sourceFamilies=this.#creationCheckboxList({property:"sourceCollection",items:families,selected:sourceFamily?[sourceFamily]:[],single:true});
    const sourcePicker=this.#creationSourcePicker(sourceFamily,selectedIds);
    return renderCreationStepHTML({value,kinds,sourceFamilies,sourcePicker,sourceDescriptor:getCreationSourceDescriptor(sourceFamily),uiText});
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
    return {...current,nameKey:String(fd.get('nameKey')??'').trim(),descriptionKey:String(fd.get('descriptionKey')??''),enabled:form.querySelector('[name="enabled"]')?.checked===true,order:Number(fd.get('order')??0),steps};
  }

  #checkedIds(name){
    return [...this.element.querySelectorAll(`[name="${name}"]:checked`)].map(input=>input.value);
  }

  #syncCapabilityCheckboxes(target){
    const name=target?.name??"";if(!name.includes(":"))return;
    const [role,id]=name.split(":");if(!["allowed","default","required"].includes(role))return;
    const form=this.element.querySelector("[data-entry-form]");
    const allowed=form.querySelector(`[name="allowed:${CSS.escape(id)}"]`),def=form.querySelector(`[name="default:${CSS.escape(id)}"]`),req=form.querySelector(`[name="required:${CSS.escape(id)}"]`);
    if((role==="default"||role==="required")&&target.checked&&allowed)allowed.checked=true;
    if(role==="allowed"&&!target.checked){if(def)def.checked=false;if(req)req.checked=false;}
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
    // All editor families use one relation serializer. This runs AFTER the
    // legacy form collector so generic JSON cannot erase relations accidentally.
    if(this.#kind!=="ruleset")data.relations=collectRelationRows(
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
    const id=fieldUid(),row=document.createElement("article");row.className="rta-field-editor";row.dataset.fieldDefinitionRow="";row.dataset.fieldId=id;
    const options=renderSelectOptions(this.#api.listValueTypes(),{labelKey:"id"});
    row.innerHTML=renderNewFieldInnerHTML(id,options);
    return row;
  }

  async #save(close){
    try{
      const data=this.#collect();
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
          const updated=await this.#api[meta.update](this.#versionId,this.#id,data);savedResult={id:updated.id};
        }
        else {const created=await this.#api[meta.create](this.#versionId,data);this.#id=created.id;savedResult={id:created.id};}
      }
      // Storage acknowledged the write. Re-read the saved entry and refuse
      // silent success if any selected Ruleset relationship disappeared.
      if(this.#kind!=="ruleset")assertPersistedRelations(this.#kind,data,this.#read());
      this.#baseline=copy(this.#read());this.#dirty=false;this.#error="";await this.#onSaved(savedResult);if(close)return this.close();return this.render(false);
    }catch(error){this.#error=error?.message??String(error);return this.render(false);}
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
        const advanced=json(row.querySelector('[data-step-prop="advanced"]')?.value,{});
        const sourceCollection=row.querySelector('[data-step-source-family]:checked')?.value??"";
        const sourceIds=[...row.querySelectorAll('[data-step-prop="sourceObjects"] [data-step-source-object]:checked')].map(input=>input.value);
        const duplicate={...advanced,...(sourceCollection?{source:{...(advanced.source??{}),collection:sourceCollection,objectIds:sourceIds}}:{}),id:uid("step"),name:`${row.querySelector('[data-step-prop="name"]')?.value??"Step"} (copy)`,kind:row.querySelector('[data-step-prop="kind"]')?.value,required:row.querySelector('[data-step-prop="required"]')?.checked===true,min:Number(row.querySelector('[data-step-prop="min"]')?.value??0),max:Number(row.querySelector('[data-step-prop="max"]')?.value??1)};
        row.insertAdjacentHTML("afterend",this.#creationStepHTML(duplicate));
        for(const button of row.nextElementSibling.querySelectorAll("[data-action]"))button.addEventListener("click",event=>this.#action(event));
      }
      this.#dirty=true;this.#syncFooter();return;
    }
    if(action==="removeSheetComponent"){event.currentTarget.closest("[data-sheet-component]")?.remove();this.#dirty=true;this.#syncFooter();return;}
    if(action==="sheetUp"||action==="sheetDown"){const row=event.currentTarget.closest("[data-sheet-component]");if(!row)return;const sibling=action==="sheetUp"?row.previousElementSibling:row.nextElementSibling;if(sibling){if(action==="sheetUp")row.parentElement.insertBefore(row,sibling);else row.parentElement.insertBefore(sibling,row);this.#dirty=true;this.#syncFooter();}return;}
    if(action==="addDeclarativeConstraint"){const list=this.element.querySelector("[data-declarative-constraints]");if(list){const row=document.createElement("div");row.className="rta-declarative-constraint";row.dataset.declarativeConstraint="";row.innerHTML=renderDeclarativeConstraintRow({fields:[...this.element.querySelectorAll("[data-constraint-field-options] option")].map(option=>({id:option.value,colors:option.dataset.rtaColors??RTA_NEUTRAL_COLOR})),labels:{field:game?.i18n?.localize?.("RTA.Declarative.Field")??"Field",rule:game?.i18n?.localize?.("RTA.Declarative.Rule")??"Rule",value:game?.i18n?.localize?.("RTA.Declarative.Value")??"Value",remove:game?.i18n?.localize?.("RTA.Declarative.DeleteConstraint")??"Remove constraint"}});list.append(row);RTASelect.enhance(this.element);row.querySelector("[data-action]").addEventListener("click",event=>this.#action(event));this.#dirty=true;this.#syncFooter();}return;}
    if(action==="removeDeclarativeConstraint"){event.currentTarget.closest("[data-declarative-constraint]")?.remove();this.#dirty=true;this.#syncFooter();return;}
    if(action==="addField"){
      const list=this.element.querySelector("[data-field-definition-list]");if(list){const row=this.#newFieldRow();row.querySelector('[data-action="removeField"]')?.addEventListener("click",event=>this.#action(event));list.append(row);this.#dirty=true;this.#syncFooter();}return;
    }
    if(action==="removeField"){
      event.currentTarget.closest("[data-field-definition-row]")?.remove();this.#dirty=true;this.#syncFooter();return;
    }
    if(action==="addEventField"){const list=this.element.querySelector("[data-event-field-list]");if(list){const row=this.#newEventFieldRow();row.querySelector('[data-action="removeEventField"]')?.addEventListener("click",event=>this.#action(event));list.append(row);this.#dirty=true;this.#syncFooter();}return;}
    if(action==="removeEventField"){event.currentTarget.closest("[data-event-field-row]")?.remove();this.#dirty=true;this.#syncFooter();return;}
    if(action==="addChoiceGroup"){const list=this.element.querySelector("[data-choice-group-list]");if(list){list.insertAdjacentHTML("beforeend",this.#choiceGroupHTML());for(const button of list.lastElementChild?.querySelectorAll("[data-action]")??[])button.addEventListener("click",event=>this.#action(event));this.#dirty=true;this.#syncFooter();}return;}
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
      try{if(this.#kind==="ruleset")await this.#api.deleteRulesetVersion(this.#versionId);else await this.#api[ENTRY_OPERATIONS[this.#kind].delete](this.#versionId,this.#id);await this.#onSaved();return this.close();}
      catch(error){this.#error=error?.message??String(error);return this.render(false);}
    }
  }
}
