import {SYSTEM_EVENT_PREFIX} from './system-events.mjs';
import {copyJSON, isRecord} from './configurator-schema.mjs';
import {valueTypeRegistry, validateTypedValue} from './value-type-registry.mjs';
import {prepareFieldMap} from './field-output-contracts.mjs';
import {assertSafeRollFormula} from './roll-grammar.mjs';
import {need} from './diagnostics.mjs';
import {preparePermissionRules} from './permission-contract.mjs';
import {validateFormulaAst, effectOperationRegistry} from './operation-registries.mjs';

const nonempty=v=>typeof v==='string'&&v.trim().length>0;
const arr=(v,label)=>{if(!Array.isArray(v))throw new Error(`${label} must be an array.`);return v;};
const bool=(v,label)=>{if(typeof v!=='boolean')throw new Error(`${label} must be boolean.`);return v;};
/* id and types are structural; nameKey and the references an object needs to run
   are completeness requirements (need): a draft may lack them, publish may not.
   Pass {incomplete:[]} to collect them instead of throwing. */
const identity=(x,label,options)=>{if(!nonempty(x.id))throw new Error(`${label} requires id.`);need(nonempty(x.nameKey),`${label} requires nameKey.`,options);};

export function prepareParameter(data,options={}){
  const x={descriptionKey:'',enabled:true,order:0,tags:[],valueType:'number',value:0,scope:'ruleset',...copyJSON(data)};
  identity(x,'Parameter',options);
  if(!valueTypeRegistry.has(x.valueType))throw new Error(`Unknown Parameter valueType: ${x.valueType}.`);
  const check=validateTypedValue(x.valueType,'one',false,x.value); if(!check.valid)throw new Error(`Invalid Parameter value: ${check.message}`);
  bool(x.enabled,'Parameter.enabled'); arr(x.tags,'Parameter.tags'); return x;
}

export function prepareFormula(data,options={}){
  const x={descriptionKey:'',enabled:true,order:0,tags:[],resultType:'number',expression:{type:'literal',value:0},...copyJSON(data)};
  identity(x,'Formula',options);
  if(!valueTypeRegistry.has(x.resultType))throw new Error(`Unknown Formula resultType: ${x.resultType}.`);
  validateFormulaAst(x.expression,'Formula.expression'); bool(x.enabled,'Formula.enabled'); arr(x.tags,'Formula.tags'); return x;
}

export function prepareFormulaBinding(data,options={}){
  const x={descriptionKey:'',enabled:true,order:0,tags:[],formulaRef:'',targetRef:null,...copyJSON(data)};
  // A derived output is the same rule on every Actor, whatever role reads it.
  if(Object.hasOwn(x,'targetRole'))throw new Error('Unsupported FormulaBinding field: targetRole.');
  identity(x,'FormulaBinding',options);need(nonempty(x.formulaRef),'FormulaBinding requires formulaRef.',options);
  if(x.targetRef!==null&&(!isRecord(x.targetRef)||x.targetRef.objectKind!=='definition'))throw new Error('FormulaBinding.targetRef must target a Definition output.');
  need(isRecord(x.targetRef)&&nonempty(x.targetRef.objectId)&&nonempty(x.targetRef.capabilityId)&&nonempty(x.targetRef.outputId),'FormulaBinding.targetRef must target a Definition output.',options);
  bool(x.enabled,'FormulaBinding.enabled');arr(x.tags,'FormulaBinding.tags');return x;
}
export function prepareCondition(data,options={}){
  const x={descriptionKey:'',enabled:true,order:0,tags:[],expression:{type:'literal',value:true},...copyJSON(data)};
  identity(x,'Condition',options);
  validateFormulaAst(x.expression,'Condition.expression'); bool(x.enabled,'Condition.enabled'); arr(x.tags,'Condition.tags'); return x;
}

export function prepareRoll(data,options={}){
  const x={descriptionKey:'',enabled:true,order:0,tags:[],formula:'',data:{},...copyJSON(data)};
  identity(x,'Roll',options);
  if(need(nonempty(x.formula),'Roll.formula is required.',options))assertSafeRollFormula(x.formula);
  if(!isRecord(x.data))throw new Error('Roll.data must be an object.');
  bool(x.enabled,'Roll.enabled');arr(x.tags,'Roll.tags');return x;
}
export function prepareOutcome(data,options={}){
  const x={descriptionKey:'',enabled:true,order:0,tags:[],resultKey:'outcome',conditionRef:null,labelKey:'',...copyJSON(data)};
  identity(x,'Outcome',options);need(nonempty(x.resultKey),'Outcome requires resultKey.',options);
  if(x.conditionRef!==null&&!nonempty(x.conditionRef))throw new Error('Outcome.conditionRef must be null or a Condition id.');
  // A Test orders its Outcomes; an Outcome carries no priority of its own.
  if(Object.hasOwn(x,'priority'))throw new Error('Unsupported Outcome field: priority.');
  bool(x.enabled,'Outcome.enabled');arr(x.tags,'Outcome.tags');return x;
}
/** InputBinding (CP-29): a typed value the Test reads before rolling, exposed as test.inputs.<id>.
 * source is exactly one of {literal}, {formulaRef} or {reference}. */
export const INPUT_SOURCE_KINDS=Object.freeze(['literal','formulaRef','reference']);
export function prepareInputBinding(data,options={},label='InputBinding'){
  if(!isRecord(data))throw new Error(`${label} must be an object.`);
  const x={valueType:'number',required:true,...copyJSON(data)};
  for(const key of Object.keys(x))if(!['id','source','valueType','required','defaultValue'].includes(key))throw new Error(`${label} contains unsupported field: ${key}.`);
  if(!nonempty(x.id)||!/^[A-Za-z][A-Za-z0-9_]*$/.test(x.id))throw new Error(`${label}.id must start with a letter and use letters, digits or _.`);
  if(!valueTypeRegistry.has(x.valueType))throw new Error(`${label}.valueType is unknown: ${x.valueType}.`);
  bool(x.required,`${label}.required`);
  if(!isRecord(x.source))throw new Error(`${label}.source must be {literal}, {formulaRef} or {reference}.`);
  const kinds=INPUT_SOURCE_KINDS.filter(kind=>Object.hasOwn(x.source,kind));
  if(kinds.length!==1||Object.keys(x.source).length!==1)throw new Error(`${label}.source must hold exactly one of literal, formulaRef or reference.`);
  if(kinds[0]==='literal'){const check=validateTypedValue(x.valueType,'one',false,x.source.literal);if(!check.valid)throw new Error(`${label}.source.literal: ${check.message}`);}
  if(kinds[0]==='formulaRef')need(nonempty(x.source.formulaRef),`${label} requires a Formula.`,options);
  if(kinds[0]==='reference')need(isRecord(x.source.reference)&&nonempty(x.source.reference.objectId),`${label} requires a Reference.`,options);
  if(x.defaultValue!==undefined){const check=validateTypedValue(x.valueType,'one',false,x.defaultValue);if(!check.valid)throw new Error(`${label}.defaultValue: ${check.message}`);}
  return x;
}
/** TestDefinition (CP-29). A Test may run without a Roll; it then needs a total Formula.
 * total = totalFormulaRef ?? roll total + bonus; margin = marginFormulaRef ?? total - target. */
export function prepareTest(data,options={}){
  const x={descriptionKey:'',enabled:true,order:0,tags:[],rollRef:null,inputBindings:[],bonusFormulaRef:null,totalFormulaRef:null,targetFormulaRef:null,targetValue:null,opposedTestRef:null,marginFormulaRef:null,outcomeRefs:[],fallbackOutcomeRef:null,...copyJSON(data)};
  identity(x,'Test',options);
  if(x.rollRef==='')x.rollRef=null;
  for(const key of ['rollRef','bonusFormulaRef','totalFormulaRef','targetFormulaRef','marginFormulaRef','fallbackOutcomeRef'])if(x[key]!==null&&!nonempty(x[key]))throw new Error(`Test.${key} must be null or an id.`);
  need(x.rollRef!==null||x.totalFormulaRef!==null,'Test requires a Roll or a total Formula.',options);
  if(x.targetValue!==null&&(!Number.isFinite(Number(x.targetValue))))throw new Error('Test.targetValue must be null or numeric.');
  // opposedTestRef: the target role makes that Test, and its total is this Test's target.
  if(x.opposedTestRef==='')x.opposedTestRef=null;
  if(x.opposedTestRef!==null){if(!nonempty(x.opposedTestRef))throw new Error('Test.opposedTestRef must be null or a Test id.');if(x.opposedTestRef===x.id)throw new Error('A Test cannot oppose itself.');if(x.targetFormulaRef!==null||x.targetValue!==null)throw new Error('An opposed Test takes its target from the opposed Test only.');}
  arr(x.inputBindings,'Test.inputBindings');
  const ids=new Set();
  x.inputBindings=x.inputBindings.map((binding,i)=>{const prepared=prepareInputBinding(binding,options,`Test.inputBindings[${i}]`);if(ids.has(prepared.id))throw new Error(`Duplicate Test input: ${prepared.id}.`);ids.add(prepared.id);return prepared;});
  arr(x.outcomeRefs,'Test.outcomeRefs');
  bool(x.enabled,'Test.enabled');arr(x.tags,'Test.tags');return x;
}

export function prepareEffect(data,options={}){
  const x={descriptionKey:'',enabled:true,order:0,tags:[],targetRef:null,targetRole:'target',operation:'set',operand:{kind:'literal',value:0},...copyJSON(data)};
  identity(x,'Effect',options);
  if(!ROLE_NAME.test(String(x.targetRole)))throw new Error('Effect.targetRole must be a role name.');
  if(x.targetRef!==null&&!isRecord(x.targetRef))throw new Error('Effect.targetRef must be a logical Reference.');
  need(isRecord(x.targetRef)&&nonempty(x.targetRef.objectKind)&&nonempty(x.targetRef.objectId),'Effect.targetRef must be a logical Reference.',options);
  need(nonempty(x.operation),'Effect.operation is required.',options);
  if(nonempty(x.operation)&&!effectOperationRegistry.has(x.operation))throw new Error(`Unknown Effect operation: ${x.operation}.`);
  if(!isRecord(x.operand)||!['literal','parameter','formula','reference','roll'].includes(x.operand.kind))throw new Error('Effect.operand must select literal, parameter, formula, reference or roll.');
  // A roll operand: the Roll's total (its dice multiplied by a Formula, for a critical hit) plus a bonus Formula.
  if(x.operand.kind==='roll'){need(nonempty(x.operand.rollRef),'Effect roll operand requires a Roll.',options);
    for(const key of ['multiplierFormulaRef','bonusFormulaRef'])if(x.operand[key]!==undefined&&x.operand[key]!==null&&typeof x.operand[key]!=='string')throw new Error(`Effect.operand.${key} must be a Formula id.`);}
  bool(x.enabled,'Effect.enabled'); arr(x.tags,'Effect.tags'); return x;
}
const ROLE_NAME=/^[A-Za-z][A-Za-z0-9_-]*$/;
/** Acquisition: the Action instantiates absent DefinitionStates on a role's container. */
function prepareActionAcquisition(data,index){
  if(!isRecord(data)||!nonempty(data.definitionId))throw new Error(`Action.acquisitions[${index}] requires definitionId.`);
  const x={targetRole:'self',initial:{},...copyJSON(data)};
  if(!ROLE_NAME.test(String(x.targetRole)))throw new Error(`Action.acquisitions[${index}].targetRole must be a role name.`);
  if(!isRecord(x.initial))throw new Error(`Action.acquisitions[${index}].initial must be an object.`);
  return x;
}
/** How a state applied again on a container behaves: renew the duration, add a stack,
 * add a separate StateInstance, or do nothing. */
export const STATE_STACKING=Object.freeze(['refresh','stack','separate','ignore']);
function prepareStateApplication(data,index){
  if(!isRecord(data)||!nonempty(data.definitionId))throw new Error(`Action.stateApplications[${index}] requires definitionId.`);
  const x={targetRole:'target',durationRef:null,stacking:'refresh',stacks:1,severity:null,modifierRefs:[],...copyJSON(data)};
  if(!ROLE_NAME.test(String(x.targetRole)))throw new Error(`Action.stateApplications[${index}].targetRole must be a role name.`);
  if(!(x.durationRef===null||nonempty(x.durationRef)))throw new Error(`Action.stateApplications[${index}].durationRef must be a Duration id or null.`);
  if(!STATE_STACKING.includes(x.stacking))throw new Error(`Action.stateApplications[${index}].stacking must be one of ${STATE_STACKING.join(', ')}.`);
  if(!Number.isSafeInteger(x.stacks)||x.stacks<1)throw new Error(`Action.stateApplications[${index}].stacks must be a positive integer.`);
  if(!(x.severity===null||Number.isFinite(x.severity)))throw new Error(`Action.stateApplications[${index}].severity must be a number or null.`);
  arr(x.modifierRefs,`Action.stateApplications[${index}].modifierRefs`);
  return x;
}
function prepareStateRemoval(data,index){
  if(!isRecord(data)||!nonempty(data.definitionId))throw new Error(`Action.stateRemovals[${index}] requires definitionId.`);
  const x={targetRole:'target',...copyJSON(data)};
  if(!ROLE_NAME.test(String(x.targetRole)))throw new Error(`Action.stateRemovals[${index}].targetRole must be a role name.`);
  return x;
}
function prepareModifierApplication(data,index){
  if(!isRecord(data)||!nonempty(data.modifierRef))throw new Error(`Action.modifierApplications[${index}] requires modifierRef.`);
  const x={targetRole:'target',durationRef:null,...copyJSON(data)};
  if(!ROLE_NAME.test(String(x.targetRole)))throw new Error(`Action.modifierApplications[${index}].targetRole must be a role name.`);
  if(!(x.durationRef===null||nonempty(x.durationRef)))throw new Error(`Action.modifierApplications[${index}].durationRef must be a Duration id or null.`);
  return x;
}
export function prepareAction(data,options={}){
  const x={descriptionKey:'',enabled:true,order:0,tags:[],conditionRefs:[],costEffectRefs:[],acquisitions:[],stateRemovals:[],stateApplications:[],modifierApplications:[],effectRefs:[],testRef:null,outcomeMappings:[],eventTypeRefs:[],...copyJSON(data)};
  identity(x,'Action',options);
  // An Action acquires when it lists acquisitions; no separate purpose is stored.
  if(Object.hasOwn(x,'purpose'))throw new Error('Unsupported Action field: purpose.');
  for(const k of ['conditionRefs','costEffectRefs','acquisitions','stateRemovals','stateApplications','modifierApplications','effectRefs','outcomeMappings','eventTypeRefs'])arr(x[k],`Action.${k}`);
  x.acquisitions=x.acquisitions.map(prepareActionAcquisition);
  x.stateRemovals=x.stateRemovals.map(prepareStateRemoval);x.stateApplications=x.stateApplications.map(prepareStateApplication);x.modifierApplications=x.modifierApplications.map(prepareModifierApplication);
  if(new Set(x.acquisitions.map(a=>`${a.targetRole}/${a.definitionId}`)).size!==x.acquisitions.length)throw new Error('Action.acquisitions lists a Definition twice for the same role.');
  bool(x.enabled,'Action.enabled'); return x;
}
export function preparePermissionPolicy(data,options={}){
  const x={descriptionKey:'',enabled:true,order:0,scope:{objectKind:'ruleset'},rules:[],defaultEffect:'DENY',...copyJSON(data)};
  identity(x,'PermissionPolicy',options);
  if(!isRecord(x.scope)||!nonempty(x.scope.objectKind))throw new Error('PermissionPolicy.scope requires objectKind.');
  if(!['ALLOW','DENY'].includes(x.defaultEffect))throw new Error('PermissionPolicy.defaultEffect must be ALLOW or DENY.');
  if(x.scope.objectKind!=='ruleset'&&!(x.scope.objectId===undefined||x.scope.objectId===null||nonempty(x.scope.objectId)))throw new Error('PermissionPolicy.scope.objectId must be an id or null.');
  x.rules=preparePermissionRules(x.rules); bool(x.enabled,'PermissionPolicy.enabled'); return x;
}
export function prepareTag(data,options={}){
  const x={descriptionKey:'',order:0,color:null,...copyJSON(data)};
  identity(x,'Tag',options);
  if(!(x.color===null||nonempty(x.color)))throw new Error('Tag.color must be null or a non-empty string.');
  return x;
}
/** CatalogEntry (§47): a GM-managed Category; consumers store only its id. */
export function prepareCategory(data,options={}){
  const x={descriptionKey:'',order:0,...copyJSON(data)};
  identity(x,'Category',options);
  if(typeof x.descriptionKey!=='string')throw new Error('Category.descriptionKey must be a string.');
  if(!Number.isSafeInteger(x.order))throw new Error('Category.order must be a safe integer.');
  for(const key of Object.keys(x))if(!['id','nameKey','descriptionKey','order','relations'].includes(key))throw new Error(`Unsupported Category field: ${key}.`);
  return x;
}
export function prepareEventType(data,options={}){
  const x={descriptionKey:'',enabled:true,order:0,tags:[],payloadFields:{},roles:[],...copyJSON(data)};
  identity(x,'EventType',options);
  if(String(x.id).startsWith(SYSTEM_EVENT_PREFIX))throw new Error(`EventType ids starting with ${SYSTEM_EVENT_PREFIX} are kept for the module's own events.`);
  if(!isRecord(x.payloadFields))throw new Error('EventType.payloadFields must be an object.');
  arr(x.roles,'EventType.roles'); arr(x.tags,'EventType.tags'); bool(x.enabled,'EventType.enabled'); return x;
}
export function prepareTrigger(data,options={}){
  const x={descriptionKey:'',enabled:true,order:0,tags:[],eventTypeId:'',eventFilter:null,conditionRefs:[],actionRefs:[],...copyJSON(data)};
  identity(x,'Trigger',options);need(nonempty(x.eventTypeId),'Trigger requires eventTypeId.',options);
  if(x.eventFilter!==null&&!isRecord(x.eventFilter))throw new Error('Trigger.eventFilter must be an object or null.');
  arr(x.conditionRefs,'Trigger.conditionRefs');arr(x.actionRefs,'Trigger.actionRefs');arr(x.tags,'Trigger.tags');bool(x.enabled,'Trigger.enabled');return x;
}

export function prepareContentType(data,options={}){
  const x={descriptionKey:'',image:'',color:null,enabled:true,order:0,tags:[],storageKind:'item',documentSubtype:'',runtimeMode:'unique',fields:{},availabilityConditionRef:null,...copyJSON(data)};
  identity(x,'ContentType',options);
  // availabilityConditionRef: a Condition read with the Content as current Content; while false, its Actions cannot be used.
  if(x.availabilityConditionRef==='')x.availabilityConditionRef=null;
  if(x.availabilityConditionRef!==null&&!nonempty(x.availabilityConditionRef))throw new Error('ContentType.availabilityConditionRef must be null or a Condition id.');
  if(typeof x.image!=='string')throw new Error('ContentType.image must be a string.');
  if(!(x.color===null||nonempty(x.color)))throw new Error('ContentType.color must be null or a non-empty string.');
  if(!['actor','item'].includes(x.storageKind))throw new Error('ContentType.storageKind must be actor or item.');
  if(typeof x.documentSubtype!=='string')throw new Error('ContentType.documentSubtype must be a string.');
  if(!['unique','stackable'].includes(x.runtimeMode))throw new Error('ContentType.runtimeMode must be unique or stackable.');
  x.fields=prepareFieldMap(x.fields??{});
  bool(x.enabled,'ContentType.enabled');arr(x.tags,'ContentType.tags');return x;
}

export function prepareContentTemplate(data,options={}){
  const x={descriptionKey:'',image:'',data:{},enabled:true,order:0,tags:[],contentTypeId:'generic',acquisitionActionRef:null,choiceGroups:[],categories:[],capabilities:[],runtimeMode:null,...copyJSON(data)};
  for(const k of ['definitionBindings','actionBindings','initialStateRules'])if(Object.hasOwn(x,k))throw new Error(`Unsupported ContentTemplate field: ${k}.`);
  identity(x,'ContentTemplate',options);need(nonempty(x.contentTypeId),'ContentTemplate requires contentTypeId.',options);
  if(!(x.acquisitionActionRef===null||nonempty(x.acquisitionActionRef)))throw new Error('ContentTemplate.acquisitionActionRef must be an Action id or null.');
  if(typeof x.image!=='string')throw new Error('ContentTemplate.image must be a string.');
  if(!isRecord(x.data))throw new Error('ContentTemplate.data must be an object.');
  // null: the template follows its Content Type.
  if(![null,'unique','stackable'].includes(x.runtimeMode))throw new Error('ContentTemplate.runtimeMode must be null, unique or stackable.');
  for(const k of ['choiceGroups','categories','capabilities','tags'])arr(x[k],`ContentTemplate.${k}`);
  const groupIds=new Set();
  x.choiceGroups=x.choiceGroups.map((group,index)=>{
    if(!isRecord(group)||!nonempty(group.id))throw new Error(`ContentTemplate.choiceGroups[${index}] requires id.`);
    need(nonempty(group.name),`ContentTemplate.choiceGroups[${index}] requires name.`,options);
    if(groupIds.has(group.id))throw new Error(`Duplicate acquisition group ID: ${group.id}.`);
    groupIds.add(group.id);
    const next={min:1,max:1,options:[],...copyJSON(group)};
    if(!Number.isInteger(next.min)||!Number.isInteger(next.max)||next.min<0||next.max<next.min)throw new Error(`ContentTemplate.choiceGroups[${index}] has invalid min/max.`);
    arr(next.options,`ContentTemplate.choiceGroups[${index}].options`);
    const optionIds=new Set();
    next.options=next.options.map((option,optionIndex)=>{
      if(!isRecord(option)||!nonempty(option.id))throw new Error(`ContentTemplate.choiceGroups[${index}].options[${optionIndex}] is invalid.`);
      if(optionIds.has(option.id))throw new Error(`Duplicate acquisition option ID: ${group.id}/${option.id}.`);
      optionIds.add(option.id);
      for(const k of ['kind','definitionId','actionId','initial'])if(Object.hasOwn(option,k))throw new Error(`Unsupported ContentTemplate choice option field: ${k}.`);
      if(!isRecord(option.targetRef)||!nonempty(option.targetRef.objectKind)||!nonempty(option.targetRef.objectId)||!['link','unlock','grant'].includes(option.operation))
        throw new Error(`ContentTemplate.choiceGroups[${index}].options[${optionIndex}] requires a typed target and operation.`);
      return copyJSON(option);
    });
    need(next.max<=next.options.length,`ContentTemplate.choiceGroups[${index}].max exceeds available options.`,options);
    return next;
  });
  bool(x.enabled,'ContentTemplate.enabled');return x;
}


/** Modifier operations: min caps the value (at most), max floors it (at least). */
export const MODIFIER_OPERATIONS=Object.freeze(['add','subtract','multiply','set','min','max']);
export const STACKING_MODES=Object.freeze(['stack','highest','lowest','replace','unique']);

function prepareNamedGeneric(data,label,defaults={},options={}){
  const x={descriptionKey:'',enabled:true,order:0,tags:[],...copyJSON(defaults),...copyJSON(data)};
  identity(x,label,options);
  bool(x.enabled,`${label}.enabled`);arr(x.tags,`${label}.tags`);return x;
}
export function prepareModifier(data,options={}){
  const x=prepareNamedGeneric(data,'Modifier',{targetRef:null,operation:'add',valueSource:{kind:'literal',value:0},conditionRefs:[],stacking:{mode:'stack',group:''},priority:0},options);
  if(x.targetRef!==null&&!isRecord(x.targetRef))throw new Error('Modifier.targetRef must be a logical Reference.');
  need(isRecord(x.targetRef)&&nonempty(x.targetRef.objectKind)&&nonempty(x.targetRef.objectId),'Modifier.targetRef must be a logical Reference.',options);
  if(!MODIFIER_OPERATIONS.includes(x.operation))throw new Error('Modifier.operation is unsupported.');
  if(!isRecord(x.valueSource)||!['literal','parameter','formula','reference'].includes(x.valueSource.kind))throw new Error('Modifier.valueSource is invalid.');
  arr(x.conditionRefs,'Modifier.conditionRefs');if(!isRecord(x.stacking)||!STACKING_MODES.includes(x.stacking.mode))throw new Error('Modifier.stacking.mode is invalid.');
  if(!Number.isSafeInteger(x.priority))throw new Error('Modifier.priority must be a safe integer.');return x;
}
/** Duration modes (CP-08). absoluteTime ends at a world time, in seconds, read through the time adapter. */
export const DURATION_MODES=Object.freeze(['instant','fixed','untilEvent','whileCondition','untilRemoved','absoluteTime']);
/** Fixed Duration units; a round or a turn lasts the world's round time. */
export const DURATION_UNITS=Object.freeze(['second','minute','hour','day','round','turn']);
export function prepareDuration(data,options={}){
  const x=prepareNamedGeneric(data,'Duration',{mode:'untilRemoved',amount:null,unit:null,eventTypeRef:null,conditionRef:null,at:null},options);
  if(!DURATION_MODES.includes(x.mode))throw new Error(`Duration.mode is invalid: ${x.mode}. Expected one of ${DURATION_MODES.join(', ')}.`);
  if(x.mode==='fixed'&&x.amount!==null&&(!Number.isFinite(Number(x.amount))||Number(x.amount)<0))throw new Error('Fixed Duration requires a non-negative amount.');
  if(x.mode==='fixed')need(x.amount!==null&&nonempty(x.unit),'Fixed Duration requires amount and unit.',options);
  if(x.unit!==null&&!DURATION_UNITS.includes(x.unit))throw new Error(`Duration.unit must be one of ${DURATION_UNITS.join(', ')}.`);
  if(x.mode==='untilEvent')need(nonempty(x.eventTypeRef),'untilEvent Duration requires eventTypeRef.',options);
  if(x.mode==='whileCondition')need(nonempty(x.conditionRef),'whileCondition Duration requires conditionRef.',options);
  if(x.at!==null&&!(typeof x.at==='number'&&Number.isFinite(x.at)&&x.at>=0))throw new Error('Duration.at must be a non-negative world time in seconds.');
  if(x.mode==='absoluteTime')need(x.at!==null,'absoluteTime Duration requires at.',options);return x;
}
export function prepareCreationSystem(data,options={}){
  const x=prepareNamedGeneric(data,'CreationSystem',{steps:[]},options);arr(x.steps,'CreationSystem.steps');x.steps=x.steps.map((step,i)=>{if(!isRecord(step)||!nonempty(step.id))throw new Error(`CreationSystem.steps[${i}] requires id.`);need(nonempty(step.name),`CreationSystem.steps[${i}] requires name.`,options);const n={kind:'choice',required:true,options:[],min:0,max:1,...copyJSON(step)};if(!['choice','allocation','content','review'].includes(n.kind))throw new Error(`CreationSystem.steps[${i}].kind is invalid.`);arr(n.options,`CreationSystem.steps[${i}].options`);
    // Computed bounds and option filter (Formulas and a Condition over the earlier steps); allocation: points per Definition.
    for(const key of ['minFormulaRef','maxFormulaRef','perTargetMaxFormulaRef','optionConditionRef'])if(n[key]===null||n[key]==='')delete n[key];else if(n[key]!==undefined&&!nonempty(n[key]))throw new Error(`CreationSystem.steps[${i}].${key} must be an id.`);
    if(n.perTargetMax===null||n.perTargetMax==='')delete n.perTargetMax;else if(n.perTargetMax!==undefined&&!(Number.isSafeInteger(n.perTargetMax)&&n.perTargetMax>=0))throw new Error(`CreationSystem.steps[${i}].perTargetMax must be a whole number of 0 or more.`);
    return n;});return x;
}
export function prepareProgressionSystem(data,options={}){
  const x=prepareNamedGeneric(data,'ProgressionSystem',{tracks:[]},options);arr(x.tracks,'ProgressionSystem.tracks');x.tracks=x.tracks.map((track,i)=>{if(!isRecord(track)||!nonempty(track.id))throw new Error(`ProgressionSystem.tracks[${i}] requires id.`);need(nonempty(track.name),`ProgressionSystem.tracks[${i}] requires name.`,options);return {mode:'threshold',thresholds:[],...copyJSON(track)};});return x;
}
export function prepareSheetDefinition(data,options={}){
  const x=prepareNamedGeneric(data,'SheetDefinition',{viewType:'actor',renderer:'foundry',layout:{direction:'column',components:[]}},options);
  if(!['actor','item','content','runtime'].includes(x.viewType))throw new Error('SheetDefinition.viewType is invalid.');if(x.renderer!=='foundry')throw new Error('SheetDefinition.renderer must be foundry.');
  if(!isRecord(x.layout)||!['column','grid'].includes(x.layout.direction)||!Array.isArray(x.layout.components))throw new Error('SheetDefinition.layout is invalid.');
  const kinds=new Set(['section','text','field','repeater','actions','content','spacer']);
  x.layout.components=x.layout.components.map((component,i)=>{if(!isRecord(component)||!nonempty(component.id)||!kinds.has(component.kind))throw new Error(`SheetDefinition.layout.components[${i}] is invalid.`);return {label:'',source:null,editable:false,width:'full',...copyJSON(component)};});return x;
}

export const PREPARERS={parameters:prepareParameter,formulas:prepareFormula,formulaBindings:prepareFormulaBinding,conditions:prepareCondition,rolls:prepareRoll,outcomes:prepareOutcome,tests:prepareTest,effects:prepareEffect,actions:prepareAction,permissionPolicies:preparePermissionPolicy,eventTypes:prepareEventType,triggers:prepareTrigger,contentTypes:prepareContentType,contentTemplates:prepareContentTemplate,modifiers:prepareModifier,durations:prepareDuration,creationSystems:prepareCreationSystem,progressionSystems:prepareProgressionSystem,sheetDefinitions:prepareSheetDefinition,categories:prepareCategory,tags:prepareTag};
