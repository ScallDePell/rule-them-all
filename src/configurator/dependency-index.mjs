import {copyJSON,isRecord} from './configurator-schema.mjs';
import {collectCrossFamilyRelations} from './relation-contract.mjs';

/* Dependency strength (CP-31): `required` blocks deleting the target;
   `optional` means the consumer contract accepts the reference being absent,
   so the target may go once the caller explicitly clears that reference;
   `metadata` (tags, categories) blocks like required. */
export const DEPENDENCY_STRENGTHS=Object.freeze(['required','optional','metadata']);
const pushRef=(edges,consumerRef,targetRef,kind,path,strength='required')=>{
  if(!targetRef?.objectKind||!targetRef?.objectId)return;
  edges.push({consumerRef:copyJSON(consumerRef),targetRef:copyJSON(targetRef),kind,path,strength});
};
const scanAst=(node,cb,path='expression')=>{
  if(Array.isArray(node))return node.forEach((v,i)=>scanAst(v,cb,`${path}[${i}]`));
  if(!isRecord(node))return;
  if(node.type==='reference'&&isRecord(node.reference))cb(node.reference,path);
  if(node.type==='parameter'&&node.id)cb({objectKind:'parameter',objectId:node.id},path);
  if(node.type==='formula'&&node.id)cb({objectKind:'formula',objectId:node.id},path);
  if(node.type==='contentAggregate'&&node.contentTypeId)cb({objectKind:'contentType',objectId:node.contentTypeId},path);
  for(const [k,v] of Object.entries(node))if(k!=='reference')scanAst(v,cb,`${path}.${k}`);
};
export class DependencyIndex{
  #edges=[];
  constructor(ruleset={}){
    for(const [i,f] of (ruleset.formulas??[]).entries())scanAst(f.expression,(r,p)=>pushRef(this.#edges,{objectKind:'formula',objectId:f.id},r,'formula',`formulas[${i}].${p}`));
    for(const [i,b] of (ruleset.formulaBindings??[]).entries()){
      pushRef(this.#edges,{objectKind:'formulaBinding',objectId:b.id},{objectKind:'formula',objectId:b.formulaRef},'bindingFormula',`formulaBindings[${i}].formulaRef`);
      pushRef(this.#edges,{objectKind:'formulaBinding',objectId:b.id},b.targetRef,'bindingTarget',`formulaBindings[${i}].targetRef`);
    }
    for(const [i,c] of (ruleset.conditions??[]).entries())scanAst(c.expression,(r,p)=>pushRef(this.#edges,{objectKind:'condition',objectId:c.id},r,'condition',`conditions[${i}].${p}`));
    for(const [i,type] of (ruleset.contentTypes??[]).entries())if(type.availabilityConditionRef)pushRef(this.#edges,{objectKind:'contentType',objectId:type.id},{objectKind:'condition',objectId:type.availabilityConditionRef},'contentAvailability',`contentTypes[${i}].availabilityConditionRef`);
    for(const [i,o] of (ruleset.outcomes??[]).entries())if(o.conditionRef)pushRef(this.#edges,{objectKind:'outcome',objectId:o.id},{objectKind:'condition',objectId:o.conditionRef},'outcomeCondition',`outcomes[${i}].conditionRef`);
    for(const [i,t] of (ruleset.tests??[]).entries()){
      pushRef(this.#edges,{objectKind:'test',objectId:t.id},{objectKind:'roll',objectId:t.rollRef},'testRoll',`tests[${i}].rollRef`);
      if(t.bonusFormulaRef)pushRef(this.#edges,{objectKind:'test',objectId:t.id},{objectKind:'formula',objectId:t.bonusFormulaRef},'testBonus',`tests[${i}].bonusFormulaRef`,'optional');
      if(t.targetFormulaRef)pushRef(this.#edges,{objectKind:'test',objectId:t.id},{objectKind:'formula',objectId:t.targetFormulaRef},'testTarget',`tests[${i}].targetFormulaRef`,'optional');
      if(t.totalFormulaRef)pushRef(this.#edges,{objectKind:'test',objectId:t.id},{objectKind:'formula',objectId:t.totalFormulaRef},'testTotal',`tests[${i}].totalFormulaRef`);
      if(t.marginFormulaRef)pushRef(this.#edges,{objectKind:'test',objectId:t.id},{objectKind:'formula',objectId:t.marginFormulaRef},'testMargin',`tests[${i}].marginFormulaRef`,'optional');
      for(const [j,input] of (t.inputBindings??[]).entries()){
        if(input?.source?.formulaRef)pushRef(this.#edges,{objectKind:'test',objectId:t.id},{objectKind:'formula',objectId:input.source.formulaRef},'testInput',`tests[${i}].inputBindings[${j}].source.formulaRef`);
        if(isRecord(input?.source?.reference))pushRef(this.#edges,{objectKind:'test',objectId:t.id},input.source.reference,'testInput',`tests[${i}].inputBindings[${j}].source.reference`);
      }
      for(const [j,id] of (t.outcomeRefs??[]).entries())pushRef(this.#edges,{objectKind:'test',objectId:t.id},{objectKind:'outcome',objectId:id},'testOutcome',`tests[${i}].outcomeRefs[${j}]`);
      if(t.fallbackOutcomeRef)pushRef(this.#edges,{objectKind:'test',objectId:t.id},{objectKind:'outcome',objectId:t.fallbackOutcomeRef},'testFallback',`tests[${i}].fallbackOutcomeRef`,'optional');
    }
    for(const [i,e] of (ruleset.effects??[]).entries()){
      pushRef(this.#edges,{objectKind:'effect',objectId:e.id},e.targetRef,'effectTarget',`effects[${i}].targetRef`);
      if(e.operand?.kind==='parameter')pushRef(this.#edges,{objectKind:'effect',objectId:e.id},{objectKind:'parameter',objectId:e.operand.id},'effectOperand',`effects[${i}].operand`);
      if(e.operand?.kind==='formula')pushRef(this.#edges,{objectKind:'effect',objectId:e.id},{objectKind:'formula',objectId:e.operand.id},'effectOperand',`effects[${i}].operand`);
      if(e.operand?.kind==='reference')pushRef(this.#edges,{objectKind:'effect',objectId:e.id},e.operand.reference,'effectOperand',`effects[${i}].operand.reference`);
      if(e.operand?.kind==='roll'){pushRef(this.#edges,{objectKind:'effect',objectId:e.id},{objectKind:'roll',objectId:e.operand.rollRef},'effectOperand',`effects[${i}].operand.rollRef`);
        for(const key of ['multiplierFormulaRef','bonusFormulaRef'])if(e.operand[key])pushRef(this.#edges,{objectKind:'effect',objectId:e.id},{objectKind:'formula',objectId:e.operand[key]},'effectOperand',`effects[${i}].operand.${key}`);}
    }
    for(const [i,a] of (ruleset.actions??[]).entries()){
      if(a.testRef)pushRef(this.#edges,{objectKind:'action',objectId:a.id},{objectKind:'test',objectId:a.testRef},'actionTest',`actions[${i}].testRef`);
      for(const [j,id] of (a.conditionRefs??[]).entries())pushRef(this.#edges,{objectKind:'action',objectId:a.id},{objectKind:'condition',objectId:id},'actionCondition',`actions[${i}].conditionRefs[${j}]`);
      for(const k of ['costEffectRefs','effectRefs'])for(const [j,id] of (a[k]??[]).entries())pushRef(this.#edges,{objectKind:'action',objectId:a.id},{objectKind:'effect',objectId:id},k,`actions[${i}].${k}[${j}]`);
      for(const [j,id] of (a.eventTypeRefs??[]).entries())pushRef(this.#edges,{objectKind:'action',objectId:a.id},{objectKind:'eventType',objectId:id},'actionEvent',`actions[${i}].eventTypeRefs[${j}]`);
      for(const [j,application] of (a.stateApplications??[]).entries()){
        pushRef(this.#edges,{objectKind:'action',objectId:a.id},{objectKind:'definition',objectId:application?.definitionId},'actionState',`actions[${i}].stateApplications[${j}].definitionId`);
        if(application?.durationRef)pushRef(this.#edges,{objectKind:'action',objectId:a.id},{objectKind:'duration',objectId:application.durationRef},'actionDuration',`actions[${i}].stateApplications[${j}].durationRef`);
        for(const [k,id] of (application?.modifierRefs??[]).entries())pushRef(this.#edges,{objectKind:'action',objectId:a.id},{objectKind:'modifier',objectId:id},'actionModifier',`actions[${i}].stateApplications[${j}].modifierRefs[${k}]`);
      }
      for(const [j,removal] of (a.stateRemovals??[]).entries())pushRef(this.#edges,{objectKind:'action',objectId:a.id},{objectKind:'definition',objectId:removal?.definitionId},'actionState',`actions[${i}].stateRemovals[${j}].definitionId`);
      for(const [j,application] of (a.modifierApplications??[]).entries()){
        pushRef(this.#edges,{objectKind:'action',objectId:a.id},{objectKind:'modifier',objectId:application?.modifierRef},'actionModifier',`actions[${i}].modifierApplications[${j}].modifierRef`);
        if(application?.durationRef)pushRef(this.#edges,{objectKind:'action',objectId:a.id},{objectKind:'duration',objectId:application.durationRef},'actionDuration',`actions[${i}].modifierApplications[${j}].durationRef`);
      }
      for(const [j,acquisition] of (a.acquisitions??[]).entries())pushRef(this.#edges,{objectKind:'action',objectId:a.id},{objectKind:'definition',objectId:acquisition?.definitionId},'actionAcquisition',`actions[${i}].acquisitions[${j}].definitionId`);
    }
    for(const [i,t] of (ruleset.triggers??[]).entries()){
      pushRef(this.#edges,{objectKind:'trigger',objectId:t.id},{objectKind:'eventType',objectId:t.eventTypeId},'triggerEvent',`triggers[${i}].eventTypeId`);
      for(const [j,id] of (t.conditionRefs??[]).entries())pushRef(this.#edges,{objectKind:'trigger',objectId:t.id},{objectKind:'condition',objectId:id},'triggerCondition',`triggers[${i}].conditionRefs[${j}]`);
      for(const [j,id] of (t.actionRefs??[]).entries())pushRef(this.#edges,{objectKind:'trigger',objectId:t.id},{objectKind:'action',objectId:id},'triggerAction',`triggers[${i}].actionRefs[${j}]`);
    }

    for(const [i,m] of (ruleset.modifiers??[]).entries()){
      pushRef(this.#edges,{objectKind:'modifier',objectId:m.id},m.targetRef,'modifierTarget',`modifiers[${i}].targetRef`);
      for(const [j,id] of (m.conditionRefs??[]).entries())pushRef(this.#edges,{objectKind:'modifier',objectId:m.id},{objectKind:'condition',objectId:id},'modifierCondition',`modifiers[${i}].conditionRefs[${j}]`);
      if(m.valueSource?.kind==='parameter')pushRef(this.#edges,{objectKind:'modifier',objectId:m.id},{objectKind:'parameter',objectId:m.valueSource.id},'modifierValue',`modifiers[${i}].valueSource`);
      if(m.valueSource?.kind==='formula')pushRef(this.#edges,{objectKind:'modifier',objectId:m.id},{objectKind:'formula',objectId:m.valueSource.id},'modifierValue',`modifiers[${i}].valueSource`);
      if(m.valueSource?.kind==='reference')pushRef(this.#edges,{objectKind:'modifier',objectId:m.id},m.valueSource.reference,'modifierValue',`modifiers[${i}].valueSource.reference`);
    }
    for(const [i,d] of (ruleset.durations??[]).entries()){
      if(d.eventTypeRef)pushRef(this.#edges,{objectKind:'duration',objectId:d.id},{objectKind:'eventType',objectId:d.eventTypeRef},'durationEvent',`durations[${i}].eventTypeRef`);
      if(d.conditionRef)pushRef(this.#edges,{objectKind:'duration',objectId:d.id},{objectKind:'condition',objectId:d.conditionRef},'durationCondition',`durations[${i}].conditionRef`);
    }
    // PermissionPolicy (CP-11): a scope naming one object and a rule Condition are required.
    for(const [i,policy] of (ruleset.permissionPolicies??[]).entries()){
      const consumer={objectKind:'permissionPolicy',objectId:policy.id};
      if(policy.scope?.objectKind&&policy.scope.objectKind!=='ruleset'&&policy.scope.objectId)pushRef(this.#edges,consumer,{objectKind:policy.scope.objectKind,objectId:policy.scope.objectId},'permissionScope',`permissionPolicies[${i}].scope`);
      for(const [j,rule] of (policy.rules??[]).entries())if(rule?.conditionRef)pushRef(this.#edges,consumer,{objectKind:'condition',objectId:rule.conditionRef},'permissionCondition',`permissionPolicies[${i}].rules[${j}].conditionRef`);
    }
    for(const [i,sheet] of (ruleset.sheetDefinitions??[]).entries())for(const [j,c] of (sheet.layout?.components??[]).entries())if(c.source?.objectKind&&c.source?.objectId)pushRef(this.#edges,{objectKind:'sheetDefinition',objectId:sheet.id},c.source,'sheetSource',`sheetDefinitions[${i}].layout.components[${j}].source`);
    for(const [i,system] of (ruleset.creationSystems??[]).entries())for(const [j,step] of (system?.steps??[]).entries()){
      for(const key of ['minFormulaRef','maxFormulaRef','perTargetMaxFormulaRef'])if(step?.[key])pushRef(this.#edges,{objectKind:'creationSystem',objectId:system.id},{objectKind:'formula',objectId:step[key]},'creationFormula',`creationSystems[${i}].steps[${j}].${key}`);
      if(step?.optionConditionRef)pushRef(this.#edges,{objectKind:'creationSystem',objectId:system.id},{objectKind:'condition',objectId:step.optionConditionRef},'creationCondition',`creationSystems[${i}].steps[${j}].optionConditionRef`);
    }
    const tagCollections=['definitions','parameters','formulas','formulaBindings','conditions','rolls','outcomes','tests','effects','actions','eventTypes','triggers','contentTypes','contentTemplates','modifiers','durations','creationSystems','progressionSystems','sheetDefinitions'];
    for(const collection of tagCollections)for(const [i,entry] of (ruleset[collection]??[]).entries())for(const [j,id] of (entry.tags??[]).entries())pushRef(this.#edges,{objectKind:collection.replace(/s$/,''),objectId:entry.id},{objectKind:'tag',objectId:id},'tag',`${collection}[${i}].tags[${j}]`,'metadata');
    // Category catalog (§47): consumers store catalog ids; a used Category cannot be deleted.
    for(const collection of ['definitions','contentTemplates'])for(const [i,entry] of (ruleset[collection]??[]).entries())for(const [j,id] of (entry.categories??[]).entries())pushRef(this.#edges,{objectKind:collection==='definitions'?'definition':'contentTemplate',objectId:entry.id},{objectKind:'category',objectId:id},'category',`${collection}[${i}].categories[${j}]`,'metadata');
    // Capability slots (CP-26/27): bound Formulas and allowed ContentTypes are dependencies.
    for(const [i,definition] of (ruleset.definitions??[]).entries()){
      const consumer={objectKind:'definition',objectId:definition.id};
      for(const [j,slot] of (definition.slots?.pool??[]).entries())for(const bound of ['minimum','maximum','initial'])if(slot?.[bound]?.formulaRef)pushRef(this.#edges,consumer,{objectKind:'formula',objectId:slot[bound].formulaRef},'poolBound',`definitions[${i}].slots.pool[${j}].${bound}.formulaRef`);
      for(const [j,slot] of (definition.slots?.collection??[]).entries()){
        if(slot?.capacityFormulaRef)pushRef(this.#edges,consumer,{objectKind:'formula',objectId:slot.capacityFormulaRef},'collectionCapacity',`definitions[${i}].slots.collection[${j}].capacityFormulaRef`);
        if(slot?.entryMode!=='value')for(const [k,kind] of (slot?.allowedKinds??[]).entries())pushRef(this.#edges,consumer,{objectKind:'contentType',objectId:kind},'collectionKind',`definitions[${i}].slots.collection[${j}].allowedKinds[${k}]`);
      }
    }
    const contentTypesById=new Map((ruleset.contentTypes??[]).map(type=>[type.id,type]));
    for(const [i,t] of (ruleset.contentTemplates??[]).entries()){
      if(t.contentTypeId)pushRef(this.#edges,{objectKind:'contentTemplate',objectId:t.id},{objectKind:'contentType',objectId:t.contentTypeId},'templateContentType',`contentTemplates[${i}].contentTypeId`);
      if(t.acquisitionActionRef)pushRef(this.#edges,{objectKind:'contentTemplate',objectId:t.id},{objectKind:'action',objectId:t.acquisitionActionRef},'templateAcquisitionAction',`contentTemplates[${i}].acquisitionActionRef`);
      const type=contentTypesById.get(t.contentTypeId);
      for(const [fieldId,field] of Object.entries(type?.fields??{})){
        if(field?.valueType!=="reference"||!Object.hasOwn(t.data??{},fieldId))continue;
        const values=field.cardinality==="many"?(t.data?.[fieldId]??[]):[t.data?.[fieldId]];
        for(const [j,ref] of values.entries())if(isRecord(ref))pushRef(this.#edges,{objectKind:'contentTemplate',objectId:t.id},ref,'contentFieldReference',`contentTemplates[${i}].data.${fieldId}${field.cardinality==="many"?`[${j}]`:""}`);
      }
    }
    const existing=new Set(this.#edges.map(e=>`${e.consumerRef.objectKind}|${e.consumerRef.objectId}|${e.targetRef.objectKind}|${e.targetRef.objectId}|${e.path}`));
    for(const edge of collectCrossFamilyRelations(ruleset)){
      const key=`${edge.consumerRef.objectKind}|${edge.consumerRef.objectId}|${edge.targetRef.objectKind}|${edge.targetRef.objectId}|${edge.path}`;
      if(!existing.has(key)){existing.add(key);this.#edges.push(edge);}
    }
  }
  list(){return copyJSON(this.#edges);}
  getConsumers(objectId,objectKind){return copyJSON(this.#edges.filter(e=>e.targetRef.objectId===objectId&&(!objectKind||e.targetRef.objectKind===objectKind)));}
}
