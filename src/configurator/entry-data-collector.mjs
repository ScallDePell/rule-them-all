/** The one form -> Ruleset entry serializer. Pure w.r.t Foundry/game state.
 * The controller injects a snapshot of form values and DOM query interfaces.
 * A full Ruleset never needs to be cloned by this module.
 */
import {collectModifier,collectDuration} from './modifier-duration-form.mjs';
import {parseScopeToken,collectPermissionRules} from './permission-form.mjs';
import {collectTriggerFilter} from './trigger-filter-form.mjs';
import {collectOutcomeMappings} from './action-outcome-form.mjs';
import {readConstraintRows,readPresentationRows} from './declarative-editor.mjs';
import {parseEditorValue} from './editor-value.mjs';
import {parseRefToken} from './reference-token.mjs';
import {collectFieldDefinitions,collectEventPayloadFields,collectDefinitionData} from './entry-field-serialization.mjs';
import {RULESET_SECTIONS,DEFAULT_RULESET_COLOR} from './ruleset-colors.mjs';
import {collectTemplateAcquisitions} from './content-template-form.mjs';
import {collectDefinitionSlots} from './slot-form.mjs';
import {collectTestInputs} from './test-input-form.mjs';
const slug=value=>String(value??"").trim().toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");
const json=(value,fallback)=>{const text=String(value??"").trim();return text?JSON.parse(text):fallback;};
const fieldPresent=(fd,key)=>typeof fd.has==="function"?fd.has(key):fd.get(key)!==undefined&&fd.get(key)!==null;
const lines=value=>String(value??"").split(/\r?\n/).map(x=>x.trim()).filter(Boolean);

/** A Test target is none, a fixed value or a Formula, chosen in one select. */
function readTestTarget(fd){
  const source=String(fd.get("targetSource")??"").trim(),fixed=String(fd.get("targetValue")??"").trim();
  if(source==="__fixed")return{targetFormulaRef:null,targetValue:fixed===""?null:Number(fixed)};
  return{targetFormulaRef:source||null,targetValue:null};
}

/** The shared operand editor: a literal, a Parameter, a Formula or a Reference. */
function readOperand(fd,queryOne){
  const kind=String(fd.get("operandKind")??"literal");
  if(kind==="literal")return{kind,value:Number(fd.get("operandLiteral")??0)};
  if(kind==="parameter"||kind==="formula")return{kind,id:String(queryOne(`[data-operand-editor="${kind}"] select`)?.value??"")};
  return{kind:"reference",reference:parseRefToken(fd.get("operandReference"))};
}

export function collectEntryData(kind,{fd,current,bool,checkedIds,queryOne,queryAll,capabilityTypes=[],
  collectFormulaExpression,collectConditionExpression,collectCreation,uid,fieldUid}={}){
  if(!fd||!current||!bool||!checkedIds||!queryOne||!queryAll||!uid||!fieldUid)throw new TypeError('Incomplete editor serialization dependencies.');

    if(kind==="ruleset"){
      const name=String(fd.get("nameKey")??"").trim(),id=current.id||slug(name)||uid("ruleset");
      const sectionColors={...current.sectionColors},sectionColorOverrides={...current.sectionColorOverrides};
      for(const section of RULESET_SECTIONS){
        const color=String(fd.get(`sectionColor:${section.id}`)??DEFAULT_RULESET_COLOR).trim();
        if(color===DEFAULT_RULESET_COLOR)delete sectionColors[section.id];else sectionColors[section.id]=color;
        sectionColorOverrides[section.id]=bool(`sectionOverride:${section.id}`);
      }
      const color=String(fd.get('rulesetColor')??DEFAULT_RULESET_COLOR).trim();
      return{id,nameKey:name,descriptionKey:String(fd.get("descriptionKey")??""),version:String(fd.get("version")??"1.0.0").trim(),color:color===DEFAULT_RULESET_COLOR?null:color,sectionColors,sectionColorOverrides,familyColors:{...current.familyColors}};
    }
    if(kind==="definitionType"){
      const name=String(fd.get("nameKey")??"").trim(),key=current.key||slug(name)||uid("type");
      const allowed=[],defaults=[],required=[];for(const cap of capabilityTypes){const role=String(fd.get(`capability:${cap.id}`)??"off");if(role==="off")continue;allowed.push(cap.id);if(role==="default")defaults.push(cap.id);if(role==="required")required.push(cap.id);}
      return{...current,key,nameKey:name,descriptionKey:String(fd.get("descriptionKey")??""),color:fieldPresent(fd,"customColorEnabled")?(fieldPresent(fd,"color")?String(fd.get("color")??"").trim()||null:current.color??null):fieldPresent(fd,"customColorPermission")?null:current.color??null,allowedCapabilities:allowed,defaultCapabilities:defaults,requiredCapabilities:required,fields:collectFieldDefinitions(queryAll("[data-field-definition-row]"),{makeId:fieldUid}),constraints:readConstraintRows(queryAll("[data-declarative-constraint]")),presentation:readPresentationRows(queryAll("[data-presentation-key]"))};
    }
    if(kind==="definition"){
      const name=String(fd.get("nameKey")??"").trim(),key=current.key||slug(name)||uid("definition"),capabilities=[];
      for(const cap of capabilityTypes)if(bool(`cap:${cap.id}`))capabilities.push(cap.id);
      return{...current,key,nameKey:name,descriptionKey:String(fd.get("descriptionKey")??""),enabled:bool("enabled"),capabilities,data:collectDefinitionData(queryAll("[data-definition-field]")),slots:collectDefinitionSlots(queryAll,current),categories:checkedIds("categories"),tags:checkedIds("tags"),presentationProfile:readPresentationRows(queryAll("[data-presentation-key]"))};
    }
    if(kind==="parameter"){const vt=String(fd.get("valueType")??"number"),value=parseEditorValue(vt,"one",false,fd.get("value")??"");return{...current,nameKey:String(fd.get("nameKey")??"").trim(),descriptionKey:String(fd.get("descriptionKey")??""),enabled:bool("enabled"),valueType:vt,value,scope:"ruleset",tags:checkedIds("tags")};}
    if(kind==="formula"){const fallback=json(fd.get("expressionJson"),{type:"literal",value:0});return{...current,nameKey:String(fd.get("nameKey")??"").trim(),descriptionKey:String(fd.get("descriptionKey")??""),enabled:bool("enabled"),resultType:String(fd.get("resultType")??"number"),expression:collectFormulaExpression(fallback),tags:checkedIds("tags")};}
    if(kind==="formulaBinding")return{...current,nameKey:String(fd.get("nameKey")??"").trim(),descriptionKey:String(fd.get("descriptionKey")??""),enabled:bool("enabled"),formulaRef:String(fd.get("formulaRef")??"").trim(),targetRef:parseRefToken(fd.get("targetRef")),targetRole:String(fd.get("targetRole")??"self").trim()||"self",tags:checkedIds("tags")};
    if(kind==="condition"){const fallback=json(fd.get("expressionJson"),{type:"literal",value:true});return{...current,nameKey:String(fd.get("nameKey")??"").trim(),descriptionKey:String(fd.get("descriptionKey")??""),enabled:bool("enabled"),expression:collectConditionExpression(fallback),tags:checkedIds("tags")};}
    if(kind==="roll")return{...current,nameKey:String(fd.get("nameKey")??"").trim(),descriptionKey:String(fd.get("descriptionKey")??""),enabled:bool("enabled"),formula:String(fd.get("rollFormula")??"").trim(),data:json(fd.get("rollDataJson"),{}),tags:checkedIds("tags")};
    if(kind==="outcome")return{...current,nameKey:String(fd.get("nameKey")??"").trim(),descriptionKey:String(fd.get("descriptionKey")??""),enabled:bool("enabled"),resultKey:String(fd.get("resultKey")??"outcome").trim(),conditionRef:String(fd.get("conditionRef")??"").trim()||null,tags:checkedIds("tags")};
    if(kind==="test")return{...current,nameKey:String(fd.get("nameKey")??"").trim(),descriptionKey:String(fd.get("descriptionKey")??""),enabled:bool("enabled"),rollRef:String(fd.get("rollRef")??"").trim()||null,inputBindings:collectTestInputs(queryAll),bonusFormulaRef:String(fd.get("bonusFormulaRef")??"").trim()||null,totalFormulaRef:String(fd.get("totalFormulaRef")??"").trim()||null,marginFormulaRef:String(fd.get("marginFormulaRef")??"").trim()||null,...readTestTarget(fd),outcomeRefs:[...(queryOne('[data-ordered-list="outcomeRefs"]')?.querySelectorAll("[data-ordered-item]:not([hidden])")??[])].map(row=>row.dataset.orderedItem),fallbackOutcomeRef:String(fd.get("fallbackOutcomeRef")??"").trim()||null,tags:checkedIds("tags")};
    if(kind==="effect"){const operand=readOperand(fd,queryOne);return{...current,nameKey:String(fd.get("nameKey")??"").trim(),descriptionKey:String(fd.get("descriptionKey")??""),enabled:bool("enabled"),targetRef:parseRefToken(fd.get("targetRef")),targetRole:String(fd.get("targetRole")??"target").trim()||"target",operation:String(fd.get("operation")??"set").trim(),operand,tags:checkedIds("tags")};}
    if(kind==="action")return{...current,nameKey:String(fd.get("nameKey")??"").trim(),descriptionKey:String(fd.get("descriptionKey")??""),enabled:bool("enabled"),conditionRefs:checkedIds("conditionRefs"),costEffectRefs:checkedIds("costEffectRefs"),effectRefs:checkedIds("effectRefs"),tags:checkedIds("tags"),outcomeMappings:collectOutcomeMappings(queryAll("[data-outcome-mapping-group]:not([hidden]) [data-outcome-mapping]")),eventTypeRefs:checkedIds("eventTypeRefs"),testRef:String(fd.get("testRef")??"").trim()||null,
      // Keep the role and initial values of Definitions still acquired; new ones go to "self".
      acquisitions:checkedIds("acquisitionDefinitionIds").map(definitionId=>(current.acquisitions??[]).find(a=>a?.definitionId===definitionId)??{definitionId,targetRole:"self",initial:{}}),
      // The editor sets one Duration for every state and Modifier the Action applies.
      stateRemovals:checkedIds("stateRemovalIds").map(definitionId=>(current.stateRemovals??[]).find(a=>a?.definitionId===definitionId)??{definitionId,targetRole:"target"}),
      stateApplications:checkedIds("stateApplicationIds").map(definitionId=>({...((current.stateApplications??[]).find(a=>a?.definitionId===definitionId)??{definitionId,targetRole:"target"}),durationRef:String(fd.get("stateDurationRef")??"").trim()||null})),
      modifierApplications:checkedIds("modifierApplicationIds").map(modifierRef=>({...((current.modifierApplications??[]).find(a=>a?.modifierRef===modifierRef)??{modifierRef,targetRole:"target"}),durationRef:String(fd.get("stateDurationRef")??"").trim()||null}))};
    if(kind==="permissionPolicy")return{...current,nameKey:String(fd.get("nameKey")??"").trim(),descriptionKey:String(fd.get("descriptionKey")??""),enabled:bool("enabled"),scope:parseScopeToken(fd.get("permissionScope")),rules:collectPermissionRules(queryAll("[data-permission-rule]")),defaultEffect:String(fd.get("defaultEffect")??"DENY")};
    if(kind==="eventType")return{...current,nameKey:String(fd.get("nameKey")??"").trim(),descriptionKey:String(fd.get("descriptionKey")??""),enabled:bool("enabled"),payloadFields:collectEventPayloadFields(queryAll("[data-event-field-row]"),{makeId:fieldUid}),roles:checkedIds("roles"),tags:checkedIds("tags")};
    if(kind==="trigger")return{...current,nameKey:String(fd.get("nameKey")??"").trim(),descriptionKey:String(fd.get("descriptionKey")??""),enabled:bool("enabled"),eventTypeId:String(fd.get("eventTypeId")??"").trim(),eventFilter:collectTriggerFilter(queryAll("[data-trigger-filter-row]")),conditionRefs:checkedIds("conditionRefs"),actionRefs:checkedIds("actionRefs"),tags:checkedIds("tags")};
    if(kind==="contentType")return{...current,nameKey:String(fd.get("nameKey")??"").trim(),descriptionKey:String(fd.get("descriptionKey")??""),image:String(fd.get("image")??"").trim(),color:fieldPresent(fd,"customColorEnabled")?(fieldPresent(fd,"color")?String(fd.get("color")??"").trim()||null:current.color??null):fieldPresent(fd,"customColorPermission")?null:current.color??null,enabled:bool("enabled"),storageKind:String(fd.get("storageKind")??"item"),documentSubtype:String(fd.get(String(fd.get("storageKind"))==="actor"?"documentSubtypeActor":"documentSubtypeItem")??"").trim(),runtimeMode:String(fd.get("runtimeMode")??"unique"),fields:collectFieldDefinitions(queryAll("[data-field-definition-row]"),{makeId:fieldUid}),tags:checkedIds("tags")};
    if(kind==="contentTemplate"){
      const relations=collectTemplateAcquisitions({current,
        definitionRows:queryAll('[data-definition-binding]'),
        choiceRows:queryAll('[data-choice-group]'),
        actionIds:checkedIds('templateActionRefs'),uid});
      return{...current,nameKey:String(fd.get('nameKey')??'').trim(),descriptionKey:String(fd.get('descriptionKey')??''),image:String(fd.get('image')??'').trim(),data:collectDefinitionData(queryAll('[data-definition-field]')),enabled:bool('enabled'),contentTypeId:String(fd.get('contentTypeId')??current.contentTypeId??'').trim(),runtimeMode:String(fd.get('runtimeMode')??'')||null,acquisitionActionRef:fd.get('acquisitionActionRef')!==null?String(fd.get('acquisitionActionRef')??'').trim()||null:current.acquisitionActionRef??null,...relations,categories:checkedIds('categories'),tags:checkedIds('tags')};
    }
    if(kind==="category")return{...current,nameKey:String(fd.get("nameKey")??"").trim(),descriptionKey:String(fd.get("descriptionKey")??"")};
    if(kind==="tag")return{...current,nameKey:String(fd.get("nameKey")??"").trim(),descriptionKey:String(fd.get("descriptionKey")??""),color:fieldPresent(fd,"customColorEnabled")?(String(fd.get("color")??"").trim()||current.color||null):fieldPresent(fd,"customColorPermission")?null:current.color??null};
    if(kind==="sheetDefinition"){
      const components=[...queryAll("[data-sheet-component]")].map(row=>{const sourceToken=String(row.querySelector('[data-sheet-prop="source"]')?.value??"");return{id:row.dataset.componentId||uid("component"),kind:String(row.querySelector('[data-sheet-prop="kind"]')?.value??"text"),label:String(row.querySelector('[data-sheet-prop="label"]')?.value??""),source:sourceToken?parseRefToken(sourceToken):null,editable:row.querySelector('[data-sheet-prop="editable"]')?.checked===true,width:String(row.querySelector('[data-sheet-prop="width"]')?.value??"full")};});
      return{...current,nameKey:String(fd.get("nameKey")??"").trim(),descriptionKey:String(fd.get("descriptionKey")??""),enabled:bool("enabled"),viewType:String(fd.get("viewType")??"actor"),renderer:"foundry",layout:{direction:String(fd.get("layoutDirection")??"column"),components}};
    }
    if(kind==="creationSystem")return collectCreation();
    if(kind==="modifier")return collectModifier(fd,current,{bool,checkedIds,operand:readOperand(fd,queryOne)});
    if(kind==="duration")return collectDuration(fd,current,{bool,checkedIds});
    if(kind==="progressionSystem"){const parsed=json(fd.get("genericJson"),current);return{...parsed,id:current.id};}
    const payload=json(fd.get("genericJson"),{}); if(!payload.id)payload.id=current.id; return payload;
}
