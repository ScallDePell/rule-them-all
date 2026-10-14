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
import {collectDefinitionSlots, collectValueBounds} from './slot-form.mjs';
import {collectTestInputs} from './test-input-form.mjs';
import {collectDie} from './die-form.mjs';
import {collectRollVariants,collectExtraRolls,collectActionInputs,collectTableRows,collectScaleRows,collectProgression} from './rule-cards-form.mjs';
/** Initiative passes from the Ruleset form: none while the step is empty or 0. */
const initiativePasses=fd=>{
  const step=Number(String(fd.get("initiativePassStep")??"").trim()||0),threshold=Number(String(fd.get("initiativePassThreshold")??"").trim()||0);
  if(!Number.isFinite(step)||step<0||!Number.isFinite(threshold))throw new Error("Initiative passes need numbers.");
  return step>0?{step,threshold}:null;
};
const slug=value=>String(value??"").trim().toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");
const json=(value,fallback)=>{const text=String(value??"").trim();return text?JSON.parse(text):fallback;};
const fieldPresent=(fd,key)=>typeof fd.has==="function"?fd.has(key):fd.get(key)!==undefined&&fd.get(key)!==null;
const lines=value=>String(value??"").split(/\r?\n/).map(x=>x.trim()).filter(Boolean);

/** A Test target is none, a fixed value, a Formula or the total of an opposed Test, chosen in one select. */
function readTestTarget(fd){
  const source=String(fd.get("targetSource")??"").trim(),fixed=String(fd.get("targetValue")??"").trim();
  if(source==="__fixed")return{targetFormulaRef:null,targetValue:fixed===""?null:Number(fixed),opposedTestRef:null};
  if(source.startsWith("__opposed:"))return{targetFormulaRef:null,targetValue:null,opposedTestRef:source.slice("__opposed:".length)};
  return{targetFormulaRef:source||null,targetValue:null,opposedTestRef:null};
}

/** The shared operand editor: a literal, a Parameter, a Formula, a Reference or (Effects) a Roll. */
function readOperand(fd,queryOne){
  const kind=String(fd.get("operandKind")??"literal");
  if(kind==="roll"){const text=name=>String(fd.get(name)??"").trim();return{kind,rollRef:text("operandRollRef"),...(text("operandRollMultiplier")?{multiplierFormulaRef:text("operandRollMultiplier")}:{}),...(text("operandRollBonus")?{bonusFormulaRef:text("operandRollBonus")}:{}),...(text("operandRollFactor")?{factorFormulaRef:text("operandRollFactor")}:{}),...(text("operandRollMinimum")!==""?{minimum:Number(text("operandRollMinimum"))}:{})};}
  if(kind==="literal")return{kind,value:Number(fd.get("operandLiteral")??0)};
  if(kind==="parameter"||kind==="formula")return{kind,id:String(queryOne(`[data-operand-editor="${kind}"] select`)?.value??"")};
  return{kind:"reference",reference:parseRefToken(fd.get("operandReference"))};
}

const slotToken=token=>{const [definitionId,slotId]=String(token??"").split("/");return definitionId&&slotId?{definitionId,slotId}:null;};
/** The group Test and where its members come from (none: the helpers given when the Action is used). */
function collectGroup(fd,current){
  const testRef=String(fd.get("groupTestRef")??"");if(!testRef)return null;
  const from=slotToken(fd.get("groupHelpersFrom"));
  return {testRef,includeSelf:fd.get("groupIncludeSelf")==="on"||fd.get("groupIncludeSelf")===true,helpersFrom:from?{role:current.group?.helpersFrom?.role??"self",...from}:null};
}
/** The editor shows the first linked role; any others are kept. */
function collectRoleLinks(fd,current){
  const rest=(current.roleLinks??[]).slice(1),from=slotToken(fd.get("linkFrom")),role=String(fd.get("linkRole")??"").trim();
  return from&&role?[{fromRole:current.roleLinks?.[0]?.fromRole??"self",role,...from},...rest]:rest;
}
/** The dice a reroll throws again: null for all of them. */
/** Action.turnOrder from the Action editor: a move, who moves, and the Formula a new initiative needs. */
function collectTurnOrder(fd){
  const move=String(fd.get("turnOrderMove")??"");if(!move)return null;
  return {move,role:String(fd.get("turnOrderRole")??"self")||"self",formulaRef:["set","add"].includes(move)?String(fd.get("turnOrderFormulaRef")??"")||null:null};
}
function collectRerollDice(fd){
  if(String(fd.get("rerollDiceMode")??"all")!=="some")return null;
  const compare=String(fd.get("rerollDiceCompare")??"")||null,value=Number(fd.get("rerollDiceValue"));
  return {group:String(fd.get("rerollDiceGroup")??"").trim()||null,compare,value:compare&&Number.isFinite(value)?value:null,replaceFormulaRef:String(fd.get("rerollDiceReplace")??"")||null};
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
      // A new Ruleset has no Test or Table yet: the initiative fields appear once it exists. "test:<id>" or "table:<id>".
      const source=fieldPresent(fd,"initiativeSource")?String(fd.get("initiativeSource")??""):"";
      const [sourceKind,sourceId]=[source.slice(0,source.indexOf(":")),source.slice(source.indexOf(":")+1)];
      const initiative=!fieldPresent(fd,"initiativeSource")?current.initiative?{...current.initiative}:null
        :!source?null:{...(sourceKind==="table"?{tableRef:sourceId}:{testRef:sourceId}),tieBreakFormulaRef:String(fd.get("initiativeTieBreakFormulaRef")??"")||null,eachRound:bool("initiativeEachRound"),bySide:bool("initiativeBySide"),passes:initiativePasses(fd)};
      // The shared lists appear once the Ruleset exists; an unticked list is empty.
      const sharedDefinitions=fieldPresent(fd,"initiativeSource")?{world:checkedIds("sharedWorld"),combat:checkedIds("sharedCombat")}:{world:[],combat:[],...current.sharedDefinitions};
      return{id,initiative,sharedDefinitions,nameKey:name,descriptionKey:String(fd.get("descriptionKey")??""),version:String(fd.get("version")??"1.0.0").trim(),color:color===DEFAULT_RULESET_COLOR?null:color,sectionColors,sectionColorOverrides,familyColors:{...current.familyColors}};
    }
    if(kind==="definitionType"){
      const name=String(fd.get("nameKey")??"").trim(),key=current.key||slug(name)||uid("type");
      const allowed=[],defaults=[],required=[];for(const cap of capabilityTypes){const role=String(fd.get(`capability:${cap.id}`)??"off");if(role==="off")continue;allowed.push(cap.id);if(role==="default")defaults.push(cap.id);if(role==="required")required.push(cap.id);}
      return{...current,key,nameKey:name,descriptionKey:String(fd.get("descriptionKey")??""),color:fieldPresent(fd,"customColorEnabled")?(fieldPresent(fd,"color")?String(fd.get("color")??"").trim()||null:current.color??null):fieldPresent(fd,"customColorPermission")?null:current.color??null,allowedCapabilities:allowed,defaultCapabilities:defaults,requiredCapabilities:required,scaleRef:String(fd.get("scaleRef")??"")||null,valueBounds:collectValueBounds({querySelector:queryOne}),fields:collectFieldDefinitions(queryAll("[data-field-definition-row]"),{makeId:fieldUid}),constraints:readConstraintRows(queryAll("[data-declarative-constraint]")),presentation:readPresentationRows(queryAll("[data-presentation-key]"))};
    }
    if(kind==="definition"){
      const name=String(fd.get("nameKey")??"").trim(),key=current.key||slug(name)||uid("definition"),capabilities=[];
      for(const cap of capabilityTypes)if(bool(`cap:${cap.id}`))capabilities.push(cap.id);
      return{...current,key,nameKey:name,descriptionKey:String(fd.get("descriptionKey")??""),enabled:bool("enabled"),capabilities,data:collectDefinitionData(queryAll("[data-definition-field]")),slots:collectDefinitionSlots(queryAll,current),categories:checkedIds("categories"),tags:checkedIds("tags"),scaleRef:String(fd.get("scaleRef")??"")||null,valueBounds:collectValueBounds({querySelector:queryOne}),presentationProfile:readPresentationRows(queryAll("[data-presentation-key]"))};
    }
    if(kind==="parameter"){const vt=String(fd.get("valueType")??"number"),value=parseEditorValue(vt,"one",false,fd.get("value")??"");return{...current,nameKey:String(fd.get("nameKey")??"").trim(),descriptionKey:String(fd.get("descriptionKey")??""),enabled:bool("enabled"),valueType:vt,value,scope:"ruleset",tags:checkedIds("tags")};}
    if(kind==="formula"){const fallback=json(fd.get("expressionJson"),{type:"literal",value:0});return{...current,nameKey:String(fd.get("nameKey")??"").trim(),descriptionKey:String(fd.get("descriptionKey")??""),enabled:bool("enabled"),resultType:String(fd.get("resultType")??"number"),expression:collectFormulaExpression(fallback),tags:checkedIds("tags")};}
    if(kind==="formulaBinding")return{...current,nameKey:String(fd.get("nameKey")??"").trim(),descriptionKey:String(fd.get("descriptionKey")??""),enabled:bool("enabled"),formulaRef:String(fd.get("formulaRef")??"").trim(),targetRef:parseRefToken(fd.get("targetRef")),tags:checkedIds("tags")};
    if(kind==="condition"){const fallback=json(fd.get("expressionJson"),{type:"literal",value:true});return{...current,nameKey:String(fd.get("nameKey")??"").trim(),descriptionKey:String(fd.get("descriptionKey")??""),enabled:bool("enabled"),expression:collectConditionExpression(fallback),tags:checkedIds("tags")};}
    if(kind==="roll")return{...current,nameKey:String(fd.get("nameKey")??"").trim(),descriptionKey:String(fd.get("descriptionKey")??""),enabled:bool("enabled"),formula:String(fd.get("rollFormula")??"").trim(),data:json(fd.get("rollDataJson"),{}),variants:collectRollVariants(queryAll),tags:checkedIds("tags")};
    if(kind==="outcome")return{...current,nameKey:String(fd.get("nameKey")??"").trim(),descriptionKey:String(fd.get("descriptionKey")??""),enabled:bool("enabled"),resultKey:String(fd.get("resultKey")??"outcome").trim(),conditionRef:String(fd.get("conditionRef")??"").trim()||null,tags:checkedIds("tags")};
    if(kind==="test")return{...current,nameKey:String(fd.get("nameKey")??"").trim(),descriptionKey:String(fd.get("descriptionKey")??""),enabled:bool("enabled"),rollRef:String(fd.get("rollRef")??"").trim()||null,inputBindings:collectTestInputs(queryAll),extraRolls:collectExtraRolls(queryAll),bonusFormulaRef:String(fd.get("bonusFormulaRef")??"").trim()||null,totalFormulaRef:String(fd.get("totalFormulaRef")??"").trim()||null,marginFormulaRef:String(fd.get("marginFormulaRef")??"").trim()||null,...readTestTarget(fd),outcomeRefs:[...(queryOne('[data-ordered-list="outcomeRefs"]')?.querySelectorAll("[data-ordered-item]:not([hidden])")??[])].map(row=>row.dataset.orderedItem),fallbackOutcomeRef:String(fd.get("fallbackOutcomeRef")??"").trim()||null,tags:checkedIds("tags")};
    if(kind==="effect"){const operand=readOperand(fd,queryOne);return{...current,nameKey:String(fd.get("nameKey")??"").trim(),descriptionKey:String(fd.get("descriptionKey")??""),enabled:bool("enabled"),targetRef:parseRefToken(fd.get("targetRef")),targetRole:String(fd.get("targetRole")??"target").trim()||"target",targetDefinitionFormulaRef:String(fd.get("targetDefinitionFormulaRef")??"").trim()||null,operation:String(fd.get("operation")??"set").trim(),operand,tags:checkedIds("tags")};}
    if(kind==="action")return{...current,nameKey:String(fd.get("nameKey")??"").trim(),descriptionKey:String(fd.get("descriptionKey")??""),enabled:bool("enabled"),inputs:collectActionInputs(queryAll),conditionRefs:checkedIds("conditionRefs"),costEffectRefs:checkedIds("costEffectRefs"),effectRefs:checkedIds("effectRefs"),tableRef:String(fd.get("tableRef")??"").trim()||null,targeting:String(fd.get("targeting")??"one")||"one",group:collectGroup(fd,current),roleLinks:collectRoleLinks(fd,current),forEach:String(fd.get("forEachType")??"")?{...(current.forEach??{}),definitionTypeId:String(fd.get("forEachType")),conditionRef:String(fd.get("forEachConditionRef")??"")||null}:null,turnOrder:collectTurnOrder(fd),reroll:bool("isReroll")?{actionRefs:checkedIds("rerollActionRefs"),keepDice:bool("rerollKeepDice"),dice:collectRerollDice(fd)}:null,tags:checkedIds("tags"),outcomeMappings:collectOutcomeMappings(queryAll("[data-outcome-mapping-group]:not([hidden]) [data-outcome-mapping]")),eventTypeRefs:checkedIds("eventTypeRefs"),testRef:String(fd.get("testRef")??"").trim()||null,
      // Keep the role and initial values of Definitions still acquired; new ones go to "self".
      // Already held: refuse the Action, or raise the Definition's value (a talent taken again gains a rank).
      // A Formula can name the Definition acquired (one chosen through an input).
      acquisitions:[...checkedIds("acquisitionDefinitionIds").map(definitionId=>({definitionId})),...(String(fd.get("acquisitionFormulaRef")??"").trim()?[{definitionFormulaRef:String(fd.get("acquisitionFormulaRef")).trim()}]:[])].map(({definitionId,definitionFormulaRef})=>{
        const {ifAbsent:_ifAbsent,add:_add,...base}=(current.acquisitions??[]).find(a=>definitionId?a?.definitionId===definitionId:a?.definitionFormulaRef===definitionFormulaRef)??(definitionId?{definitionId,targetRole:"self",initial:{}}:{definitionFormulaRef,targetRole:"self",initial:{}});
        if(String(fd.get("acquisitionRepeat")??"refuse")!=="raise")return base;
        const amount=Number(String(fd.get("acquisitionRaise")??"").trim()||1);if(!Number.isFinite(amount))throw new Error("The raise of an acquired Definition must be a number.");
        return {...base,ifAbsent:true,add:{"value.base":amount}};
      }),
      // The editor sets one Duration for every state and Modifier the Action applies.
      stateRemovals:checkedIds("stateRemovalIds").map(definitionId=>(current.stateRemovals??[]).find(a=>a?.definitionId===definitionId)??{definitionId,targetRole:"target"}),
      // Per state: what happens when the target already has it (refresh, stack, separate, ignore) and the stacks added.
      stateApplications:checkedIds("stateApplicationIds").map(definitionId=>{const kept=(current.stateApplications??[]).find(a=>a?.definitionId===definitionId)??{definitionId,targetRole:"target"};
        const stacks=Number(fd.get(`stateStacks.${definitionId}`)??kept.stacks??1);if(!Number.isSafeInteger(stacks)||stacks<1)throw new Error("The stacks an Action applies must be a whole number of at least 1.");
        return {...kept,durationRef:String(fd.get("stateDurationRef")??"").trim()||null,stacking:String(fd.get(`stateStacking.${definitionId}`)??kept.stacking??"refresh"),stacks};}),
      modifierApplications:checkedIds("modifierApplicationIds").map(modifierRef=>({...((current.modifierApplications??[]).find(a=>a?.modifierRef===modifierRef)??{modifierRef,targetRole:"target"}),durationRef:String(fd.get("stateDurationRef")??"").trim()||null}))};
    if(kind==="permissionPolicy")return{...current,nameKey:String(fd.get("nameKey")??"").trim(),descriptionKey:String(fd.get("descriptionKey")??""),enabled:bool("enabled"),scope:parseScopeToken(fd.get("permissionScope")),rules:collectPermissionRules(queryAll("[data-permission-rule]")),defaultEffect:String(fd.get("defaultEffect")??"DENY")};
    if(kind==="eventType")return{...current,nameKey:String(fd.get("nameKey")??"").trim(),descriptionKey:String(fd.get("descriptionKey")??""),enabled:bool("enabled"),payloadFields:collectEventPayloadFields(queryAll("[data-event-field-row]"),{makeId:fieldUid}),roles:checkedIds("roles"),tags:checkedIds("tags")};
    if(kind==="trigger")return{...current,nameKey:String(fd.get("nameKey")??"").trim(),descriptionKey:String(fd.get("descriptionKey")??""),enabled:bool("enabled"),eventTypeId:String(fd.get("eventTypeId")??"").trim(),eventFilter:collectTriggerFilter(queryAll("[data-trigger-filter-row]")),conditionRefs:checkedIds("conditionRefs"),actionRefs:checkedIds("actionRefs"),actingRole:String(fd.get("actingRole")??"self")||"self",holder:String(fd.get("triggerHolder")??"actor")||"actor",mode:String(fd.get("triggerMode")??"automatic")||"automatic",tags:checkedIds("tags")};
    if(kind==="contentType")return{...current,nameKey:String(fd.get("nameKey")??"").trim(),descriptionKey:String(fd.get("descriptionKey")??""),image:String(fd.get("image")??"").trim(),color:fieldPresent(fd,"customColorEnabled")?(fieldPresent(fd,"color")?String(fd.get("color")??"").trim()||null:current.color??null):fieldPresent(fd,"customColorPermission")?null:current.color??null,enabled:bool("enabled"),storageKind:String(fd.get("storageKind")??"item"),documentSubtype:String(fd.get(String(fd.get("storageKind"))==="actor"?"documentSubtypeActor":"documentSubtypeItem")??"").trim(),runtimeMode:String(fd.get("runtimeMode")??"unique"),availabilityConditionRef:String(fd.get("availabilityConditionRef")??"").trim()||null,fields:collectFieldDefinitions(queryAll("[data-field-definition-row]"),{makeId:fieldUid}),tags:checkedIds("tags")};
    if(kind==="contentTemplate"){
      const {choiceGroups}=collectTemplateAcquisitions({current,choiceRows:queryAll('[data-choice-group]'),uid});
      return{...current,nameKey:String(fd.get('nameKey')??'').trim(),descriptionKey:String(fd.get('descriptionKey')??''),image:String(fd.get('image')??'').trim(),data:collectDefinitionData(queryAll('[data-definition-field]')),enabled:bool('enabled'),contentTypeId:String(fd.get('contentTypeId')??current.contentTypeId??'').trim(),runtimeMode:['unique','stackable'].find(mode=>mode===fd.get('runtimeMode'))??null,acquisitionActionRef:fd.get('acquisitionActionRef')!==null?String(fd.get('acquisitionActionRef')??'').trim()||null:current.acquisitionActionRef??null,choiceGroups,categories:checkedIds('categories'),tags:checkedIds('tags')};
    }
    if(kind==="category")return{...current,nameKey:String(fd.get("nameKey")??"").trim(),descriptionKey:String(fd.get("descriptionKey")??"")};
    if(kind==="tag")return{...current,nameKey:String(fd.get("nameKey")??"").trim(),descriptionKey:String(fd.get("descriptionKey")??""),color:fieldPresent(fd,"customColorEnabled")?(String(fd.get("color")??"").trim()||current.color||null):fieldPresent(fd,"customColorPermission")?null:current.color??null};
    if(kind==="sheetDefinition"){const target=String(fd.get("sheetTarget")??current.target??"actor");return{...current,nameKey:String(fd.get("nameKey")??"").trim(),descriptionKey:String(fd.get("descriptionKey")??""),enabled:bool("enabled"),target,contentTypeIds:target==="item"?checkedIds("sheetContentTypes"):[],root:json(queryOne("[data-sheet-layout-value]")?.value,current.root)};}
    if(kind==="creationSystem")return collectCreation();
    if(kind==="modifier")return collectModifier(fd,current,{bool,checkedIds,operand:readOperand(fd,queryOne)});
    if(kind==="duration")return collectDuration(fd,current,{bool,checkedIds});
    if(kind==="die")return{...current,nameKey:String(fd.get("nameKey")??"").trim(),descriptionKey:String(fd.get("descriptionKey")??""),enabled:bool("enabled"),denomination:String(fd.get("denomination")??"").trim().toLowerCase(),...collectDie(queryAll),tags:checkedIds("tags")};
    if(kind==="scale")return{...current,nameKey:String(fd.get("nameKey")??"").trim(),descriptionKey:String(fd.get("descriptionKey")??""),enabled:bool("enabled"),basis:String(fd.get("scaleBasis")??"value"),rows:collectScaleRows(queryAll),tags:checkedIds("tags")};
    if(kind==="table")return{...current,nameKey:String(fd.get("nameKey")??"").trim(),descriptionKey:String(fd.get("descriptionKey")??""),enabled:bool("enabled"),rollRef:String(fd.get("tableRollRef")??"").trim()||null,bonusFormulaRef:String(fd.get("tableBonusFormulaRef")??"").trim()||null,rows:collectTableRows(queryAll),tags:checkedIds("tags")};
    if(kind==="progressionSystem")return{...current,nameKey:String(fd.get("nameKey")??"").trim(),descriptionKey:String(fd.get("descriptionKey")??""),enabled:bool("enabled"),...collectProgression(queryAll),tags:checkedIds("tags")};
    const payload=json(fd.get("genericJson"),{}); if(!payload.id)payload.id=current.id; return payload;
}
