import {copyJSON, isRecord} from './configurator-schema.mjs';
import {valueTypeRegistry, validateTypedValue} from './value-type-registry.mjs';
import {prepareFieldMap} from './field-output-contracts.mjs';

const nonempty=v=>typeof v==='string'&&v.trim().length>0;
const arr=(v,label)=>{if(!Array.isArray(v))throw new Error(`${label} must be an array.`);return v;};
const bool=(v,label)=>{if(typeof v!=='boolean')throw new Error(`${label} must be boolean.`);return v;};

export function prepareParameter(data){
  const x={descriptionKey:'',enabled:true,order:0,tags:[],valueType:'number',nullable:false,value:0,scope:'ruleset',...copyJSON(data)};
  if(!nonempty(x.id)||!nonempty(x.nameKey))throw new Error('Parameter requires id and nameKey.');
  if(!valueTypeRegistry.has(x.valueType))throw new Error(`Unknown Parameter valueType: ${x.valueType}.`);
  const check=validateTypedValue(x.valueType,'one',x.nullable,x.value); if(!check.valid)throw new Error(`Invalid Parameter value: ${check.message}`);
  bool(x.enabled,'Parameter.enabled'); arr(x.tags,'Parameter.tags'); return x;
}

function validateAstNode(node,label='expression'){
  if(!isRecord(node)||!nonempty(node.type))throw new Error(`${label} must be an AST node with a type.`);
  const allowed=['literal','reference','parameter','formula','context','add','subtract','multiply','divide','min','max','round','floor','ceil','clamp','eq','neq','gt','gte','lt','lte','and','or','not','if','lookup','rangeLookup','sum','average'];
  if(!allowed.includes(node.type))throw new Error(`${label} contains unsupported node type: ${node.type}.`);
  for(const [k,v] of Object.entries(node)){
    if(k==='type')continue;
    if(isRecord(v)&&nonempty(v.type))validateAstNode(v,`${label}.${k}`);
    if(Array.isArray(v))v.forEach((n,i)=>{if(isRecord(n)&&nonempty(n.type))validateAstNode(n,`${label}.${k}[${i}]`);});
  }
}

export function prepareFormula(data){
  const x={descriptionKey:'',enabled:true,order:0,tags:[],resultType:'number',expression:{type:'literal',value:0},...copyJSON(data)};
  if(!nonempty(x.id)||!nonempty(x.nameKey))throw new Error('Formula requires id and nameKey.');
  if(!valueTypeRegistry.has(x.resultType))throw new Error(`Unknown Formula resultType: ${x.resultType}.`);
  validateAstNode(x.expression,'Formula.expression'); bool(x.enabled,'Formula.enabled'); arr(x.tags,'Formula.tags'); return x;
}

export function prepareFormulaBinding(data){
  const x={descriptionKey:'',enabled:true,order:0,tags:[],formulaRef:'',targetRef:null,targetRole:'self',...copyJSON(data)};
  if(!nonempty(x.id)||!nonempty(x.nameKey)||!nonempty(x.formulaRef))throw new Error('FormulaBinding requires id, nameKey and formulaRef.');
  if(!isRecord(x.targetRef)||x.targetRef.objectKind!=='definition'||!nonempty(x.targetRef.objectId)||!nonempty(x.targetRef.capabilityId)||!nonempty(x.targetRef.outputId))throw new Error('FormulaBinding.targetRef must target a Definition output.');
  if(!nonempty(x.targetRole))throw new Error('FormulaBinding.targetRole is required.');
  bool(x.enabled,'FormulaBinding.enabled');arr(x.tags,'FormulaBinding.tags');return x;
}
export function prepareCondition(data){
  const x={descriptionKey:'',enabled:true,order:0,tags:[],expression:{type:'literal',value:true},...copyJSON(data)};
  if(!nonempty(x.id)||!nonempty(x.nameKey))throw new Error('Condition requires id and nameKey.');
  validateAstNode(x.expression,'Condition.expression'); bool(x.enabled,'Condition.enabled'); arr(x.tags,'Condition.tags'); return x;
}

export function prepareRoll(data){
  const x={descriptionKey:'',enabled:true,order:0,tags:[],formula:'',data:{},...copyJSON(data)};
  if(!nonempty(x.id)||!nonempty(x.nameKey))throw new Error('Roll requires id and nameKey.');
  if(!nonempty(x.formula))throw new Error('Roll.formula is required.');
  if(!isRecord(x.data))throw new Error('Roll.data must be an object.');
  bool(x.enabled,'Roll.enabled');arr(x.tags,'Roll.tags');return x;
}
export function prepareOutcome(data){
  const x={descriptionKey:'',enabled:true,order:0,tags:[],resultKey:'outcome',priority:0,conditionRef:null,labelKey:'',...copyJSON(data)};
  if(!nonempty(x.id)||!nonempty(x.nameKey)||!nonempty(x.resultKey))throw new Error('Outcome requires id, nameKey and resultKey.');
  if(x.conditionRef!==null&&!nonempty(x.conditionRef))throw new Error('Outcome.conditionRef must be null or a Condition id.');
  if(!Number.isSafeInteger(x.priority))throw new Error('Outcome.priority must be a safe integer.');
  bool(x.enabled,'Outcome.enabled');arr(x.tags,'Outcome.tags');return x;
}
export function prepareTest(data){
  const x={descriptionKey:'',enabled:true,order:0,tags:[],rollRef:'',bonusFormulaRef:null,targetFormulaRef:null,targetValue:null,outcomeRefs:[],...copyJSON(data)};
  if(!nonempty(x.id)||!nonempty(x.nameKey)||!nonempty(x.rollRef))throw new Error('Test requires id, nameKey and rollRef.');
  if(x.bonusFormulaRef!==null&&!nonempty(x.bonusFormulaRef))throw new Error('Test.bonusFormulaRef must be null or a Formula id.');
  if(x.targetFormulaRef!==null&&!nonempty(x.targetFormulaRef))throw new Error('Test.targetFormulaRef must be null or a Formula id.');
  if(x.targetValue!==null&&(!Number.isFinite(Number(x.targetValue))))throw new Error('Test.targetValue must be null or numeric.');
  arr(x.outcomeRefs,'Test.outcomeRefs');bool(x.enabled,'Test.enabled');arr(x.tags,'Test.tags');return x;
}

export function prepareEffect(data){
  const x={descriptionKey:'',enabled:true,order:0,tags:[],targetRef:null,operation:'set',operand:{kind:'literal',value:0},...copyJSON(data)};
  if(!nonempty(x.id)||!nonempty(x.nameKey))throw new Error('Effect requires id and nameKey.');
  if(!isRecord(x.targetRef)||!nonempty(x.targetRef.objectKind)||!nonempty(x.targetRef.objectId))throw new Error('Effect.targetRef must be a logical Reference.');
  if(!nonempty(x.operation))throw new Error('Effect.operation is required.');
  if(!isRecord(x.operand)||!['literal','parameter','formula','reference'].includes(x.operand.kind))throw new Error('Effect.operand must select literal, parameter, formula or reference.');
  bool(x.enabled,'Effect.enabled'); arr(x.tags,'Effect.tags'); return x;
}
export function prepareAction(data){
  const x={descriptionKey:'',enabled:true,order:0,tags:[],conditionRefs:[],costEffectRefs:[],effectRefs:[],testRef:null,outcomeMappings:[],eventTypeRefs:[],...copyJSON(data)};
  if(!nonempty(x.id)||!nonempty(x.nameKey))throw new Error('Action requires id and nameKey.');
  for(const k of ['conditionRefs','costEffectRefs','effectRefs','outcomeMappings','eventTypeRefs'])arr(x[k],`Action.${k}`); bool(x.enabled,'Action.enabled'); return x;
}
export function preparePermissionPolicy(data){
  const x={descriptionKey:'',enabled:true,order:0,scope:{objectKind:'ruleset'},rules:[],defaultEffect:'DENY',...copyJSON(data)};
  if(!nonempty(x.id)||!nonempty(x.nameKey))throw new Error('PermissionPolicy requires id and nameKey.');
  if(!isRecord(x.scope)||!nonempty(x.scope.objectKind))throw new Error('PermissionPolicy.scope requires objectKind.');
  if(!['ALLOW','DENY'].includes(x.defaultEffect))throw new Error('PermissionPolicy.defaultEffect must be ALLOW or DENY.');
  arr(x.rules,'PermissionPolicy.rules'); bool(x.enabled,'PermissionPolicy.enabled'); return x;
}
export function prepareTag(data){
  const x={descriptionKey:'',enabled:true,order:0,color:null,...copyJSON(data)};
  if(!nonempty(x.id)||!nonempty(x.nameKey))throw new Error('Tag requires id and nameKey.');
  if(!(x.color===null||nonempty(x.color)))throw new Error('Tag.color must be null or a non-empty string.');
  bool(x.enabled,'Tag.enabled');return x;
}
export function prepareEventType(data){
  const x={descriptionKey:'',enabled:true,order:0,tags:[],payloadFields:{},roles:[],...copyJSON(data)};
  if(!nonempty(x.id)||!nonempty(x.nameKey))throw new Error('EventType requires id and nameKey.');
  if(!isRecord(x.payloadFields))throw new Error('EventType.payloadFields must be an object.');
  arr(x.roles,'EventType.roles'); arr(x.tags,'EventType.tags'); bool(x.enabled,'EventType.enabled'); return x;
}
export function prepareTrigger(data){
  const x={descriptionKey:'',enabled:true,order:0,tags:[],eventTypeId:'',eventFilter:null,conditionRefs:[],actionRefs:[],...copyJSON(data)};
  if(!nonempty(x.id)||!nonempty(x.nameKey)||!nonempty(x.eventTypeId))throw new Error('Trigger requires id, nameKey and eventTypeId.');
  if(x.eventFilter!==null&&!isRecord(x.eventFilter))throw new Error('Trigger.eventFilter must be an object or null.');
  arr(x.conditionRefs,'Trigger.conditionRefs');arr(x.actionRefs,'Trigger.actionRefs');arr(x.tags,'Trigger.tags');bool(x.enabled,'Trigger.enabled');return x;
}

export function prepareContentType(data){
  const x={descriptionKey:'',image:'',color:null,enabled:true,order:0,tags:[],storageKind:'item',documentSubtype:'',runtimeMode:'unique',fields:{},...copyJSON(data)};
  if(!nonempty(x.id)||!nonempty(x.nameKey))throw new Error('ContentType requires id and nameKey.');
  if(typeof x.image!=='string')throw new Error('ContentType.image must be a string.');
  if(!(x.color===null||nonempty(x.color)))throw new Error('ContentType.color must be null or a non-empty string.');
  if(!['actor','item'].includes(x.storageKind))throw new Error('ContentType.storageKind must be actor or item.');
  if(typeof x.documentSubtype!=='string')throw new Error('ContentType.documentSubtype must be a string.');
  if(!['unique','stackable'].includes(x.runtimeMode))throw new Error('ContentType.runtimeMode must be unique or stackable.');
  x.fields=prepareFieldMap(x.fields??{});
  bool(x.enabled,'ContentType.enabled');arr(x.tags,'ContentType.tags');return x;
}

export function prepareContentTemplate(data){
  const x={descriptionKey:'',image:'',data:{},enabled:true,order:0,tags:[],contentTypeId:'generic',definitionBindings:[],actionBindings:[],choiceGroups:[],initialStateRules:[],categories:[],capabilities:[],runtimeMode:'unique',...copyJSON(data)};
  if(!nonempty(x.id)||!nonempty(x.nameKey)||!nonempty(x.contentTypeId))throw new Error('ContentTemplate requires id, nameKey and contentTypeId.');
  if(typeof x.image!=='string')throw new Error('ContentTemplate.image must be a string.');
  if(!isRecord(x.data))throw new Error('ContentTemplate.data must be an object.');
  if(!['unique','stackable'].includes(x.runtimeMode))throw new Error('ContentTemplate.runtimeMode must be unique or stackable.');
  for(const k of ['definitionBindings','actionBindings','choiceGroups','initialStateRules','categories','capabilities','tags'])arr(x[k],`ContentTemplate.${k}`);
  x.definitionBindings=x.definitionBindings.map((binding,index)=>{
    if(!isRecord(binding)||!nonempty(binding.definitionId))throw new Error(`ContentTemplate.definitionBindings[${index}] requires definitionId.`);
    const next={id:`definition-${binding.definitionId}`,initial:{},...copyJSON(binding)};
    if(!isRecord(next.initial))throw new Error(`ContentTemplate.definitionBindings[${index}].initial must be an object.`);
    return next;
  });
  x.actionBindings=x.actionBindings.map((binding,index)=>{if(!isRecord(binding)||!nonempty(binding.actionId))throw new Error(`ContentTemplate.actionBindings[${index}] requires actionId.`);return {id:`action-${binding.actionId}`,...copyJSON(binding)};});
  const groupIds=new Set();
  x.choiceGroups=x.choiceGroups.map((group,index)=>{
    if(!isRecord(group)||!nonempty(group.id)||!nonempty(group.name))throw new Error(`ContentTemplate.choiceGroups[${index}] requires id and name.`);
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
      if(option.targetRef){
        if(!nonempty(option.targetRef.objectKind)||!nonempty(option.targetRef.objectId)||!['link','unlock','grant'].includes(option.operation))
          throw new Error(`ContentTemplate.choiceGroups[${index}].options[${optionIndex}] requires a typed target and operation.`);
        return copyJSON(option);
      }
      if(!['definition','action'].includes(option.kind))throw new Error(`ContentTemplate.choiceGroups[${index}].options[${optionIndex}] is invalid.`);
      if(option.kind==='definition'&&!nonempty(option.definitionId))throw new Error(`ContentTemplate.choiceGroups[${index}].options[${optionIndex}] requires definitionId.`);
      if(option.kind==='action'&&!nonempty(option.actionId))throw new Error(`ContentTemplate.choiceGroups[${index}].options[${optionIndex}] requires actionId.`);
      return copyJSON(option);
    });
    if(next.max>next.options.length)throw new Error(`ContentTemplate.choiceGroups[${index}].max exceeds available options.`);
    return next;
  });
  bool(x.enabled,'ContentTemplate.enabled');return x;
}


function prepareNamedGeneric(data,label,defaults={}){
  const x={descriptionKey:'',enabled:true,order:0,tags:[],...copyJSON(defaults),...copyJSON(data)};
  if(!nonempty(x.id)||!nonempty(x.nameKey))throw new Error(`${label} requires id and nameKey.`);
  bool(x.enabled,`${label}.enabled`);arr(x.tags,`${label}.tags`);return x;
}
export function prepareModifier(data){
  const x=prepareNamedGeneric(data,'Modifier',{targetRef:null,operation:'add',valueSource:{kind:'literal',value:0},conditionRefs:[],stacking:{mode:'stack',group:''},priority:0});
  if(!isRecord(x.targetRef)||!nonempty(x.targetRef.objectKind)||!nonempty(x.targetRef.objectId))throw new Error('Modifier.targetRef must be a logical Reference.');
  if(!['add','subtract','multiply','set','min','max'].includes(x.operation))throw new Error('Modifier.operation is unsupported.');
  if(!isRecord(x.valueSource)||!['literal','parameter','formula','reference'].includes(x.valueSource.kind))throw new Error('Modifier.valueSource is invalid.');
  arr(x.conditionRefs,'Modifier.conditionRefs');if(!isRecord(x.stacking)||!['stack','highest','lowest','replace','unique'].includes(x.stacking.mode))throw new Error('Modifier.stacking.mode is invalid.');
  if(!Number.isSafeInteger(x.priority))throw new Error('Modifier.priority must be a safe integer.');return x;
}
export function prepareRestriction(data){
  const x=prepareNamedGeneric(data,'Restriction',{operationKinds:[],conditionRefs:[],effect:'deny',priority:0,messageKey:''});
  arr(x.operationKinds,'Restriction.operationKinds');arr(x.conditionRefs,'Restriction.conditionRefs');if(!['allow','deny'].includes(x.effect))throw new Error('Restriction.effect must be allow or deny.');if(!Number.isSafeInteger(x.priority))throw new Error('Restriction.priority must be a safe integer.');return x;
}
export function prepareDuration(data){
  const x=prepareNamedGeneric(data,'Duration',{mode:'persistent',amount:null,unit:null,eventTypeRef:null,conditionRef:null});
  if(!['instant','fixed','untilEvent','whileCondition','persistent'].includes(x.mode))throw new Error('Duration.mode is invalid.');
  if(x.mode==='fixed'&&(!Number.isFinite(Number(x.amount))||Number(x.amount)<0||!nonempty(x.unit)))throw new Error('Fixed Duration requires non-negative amount and unit.');
  if(x.mode==='untilEvent'&&!nonempty(x.eventTypeRef))throw new Error('untilEvent Duration requires eventTypeRef.');if(x.mode==='whileCondition'&&!nonempty(x.conditionRef))throw new Error('whileCondition Duration requires conditionRef.');return x;
}
export function prepareCreationSystem(data){
  const x=prepareNamedGeneric(data,'CreationSystem',{steps:[]});arr(x.steps,'CreationSystem.steps');x.steps=x.steps.map((step,i)=>{if(!isRecord(step)||!nonempty(step.id)||!nonempty(step.name))throw new Error(`CreationSystem.steps[${i}] requires id and name.`);const n={kind:'choice',required:true,options:[],min:0,max:1,...copyJSON(step)};if(!['choice','allocation','content','review'].includes(n.kind))throw new Error(`CreationSystem.steps[${i}].kind is invalid.`);arr(n.options,`CreationSystem.steps[${i}].options`);return n;});return x;
}
export function prepareProgressionSystem(data){
  const x=prepareNamedGeneric(data,'ProgressionSystem',{tracks:[]});arr(x.tracks,'ProgressionSystem.tracks');x.tracks=x.tracks.map((track,i)=>{if(!isRecord(track)||!nonempty(track.id)||!nonempty(track.name))throw new Error(`ProgressionSystem.tracks[${i}] requires id and name.`);return {mode:'threshold',thresholds:[],...copyJSON(track)};});return x;
}
export function prepareSheetDefinition(data){
  const x=prepareNamedGeneric(data,'SheetDefinition',{viewType:'actor',renderer:'foundry',layout:{direction:'column',components:[]}});
  if(!['actor','item','content','runtime'].includes(x.viewType))throw new Error('SheetDefinition.viewType is invalid.');if(x.renderer!=='foundry')throw new Error('SheetDefinition.renderer must be foundry.');
  if(!isRecord(x.layout)||!['column','grid'].includes(x.layout.direction)||!Array.isArray(x.layout.components))throw new Error('SheetDefinition.layout is invalid.');
  const kinds=new Set(['section','text','field','repeater','actions','content','spacer']);
  x.layout.components=x.layout.components.map((component,i)=>{if(!isRecord(component)||!nonempty(component.id)||!kinds.has(component.kind))throw new Error(`SheetDefinition.layout.components[${i}] is invalid.`);return {label:'',source:null,editable:false,width:'full',...copyJSON(component)};});return x;
}

export const PREPARERS={parameters:prepareParameter,formulas:prepareFormula,formulaBindings:prepareFormulaBinding,conditions:prepareCondition,rolls:prepareRoll,outcomes:prepareOutcome,tests:prepareTest,effects:prepareEffect,actions:prepareAction,permissionPolicies:preparePermissionPolicy,eventTypes:prepareEventType,triggers:prepareTrigger,contentTypes:prepareContentType,contentTemplates:prepareContentTemplate,modifiers:prepareModifier,restrictions:prepareRestriction,durations:prepareDuration,creationSystems:prepareCreationSystem,progressionSystems:prepareProgressionSystem,sheetDefinitions:prepareSheetDefinition,tags:prepareTag};
