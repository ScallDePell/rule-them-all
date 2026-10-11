import {copyJSON,isRecord} from './configurator-schema.mjs';
import {collectCrossFamilyRelations} from './relation-contract.mjs';

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
  for(const [k,v] of Object.entries(node))if(k!=='reference')scanAst(v,cb,`${path}.${k}`);
};
export class DependencyIndex{
  #edges=[];
  constructor(ruleset={}){
    for(const [i,ref] of (ruleset.references??[]).entries())pushRef(this.#edges,{objectKind:'reference',objectId:ref.id},ref,'reference',`references[${i}]`);
    for(const [i,f] of (ruleset.formulas??[]).entries())scanAst(f.expression,(r,p)=>pushRef(this.#edges,{objectKind:'formula',objectId:f.id},r,'formula',`formulas[${i}].${p}`));
    for(const [i,b] of (ruleset.formulaBindings??[]).entries()){
      pushRef(this.#edges,{objectKind:'formulaBinding',objectId:b.id},{objectKind:'formula',objectId:b.formulaRef},'bindingFormula',`formulaBindings[${i}].formulaRef`);
      pushRef(this.#edges,{objectKind:'formulaBinding',objectId:b.id},b.targetRef,'bindingTarget',`formulaBindings[${i}].targetRef`);
    }
    for(const [i,c] of (ruleset.conditions??[]).entries())scanAst(c.expression,(r,p)=>pushRef(this.#edges,{objectKind:'condition',objectId:c.id},r,'condition',`conditions[${i}].${p}`));
    for(const [i,o] of (ruleset.outcomes??[]).entries())if(o.conditionRef)pushRef(this.#edges,{objectKind:'outcome',objectId:o.id},{objectKind:'condition',objectId:o.conditionRef},'outcomeCondition',`outcomes[${i}].conditionRef`);
    for(const [i,t] of (ruleset.tests??[]).entries()){
      pushRef(this.#edges,{objectKind:'test',objectId:t.id},{objectKind:'roll',objectId:t.rollRef},'testRoll',`tests[${i}].rollRef`);
      if(t.bonusFormulaRef)pushRef(this.#edges,{objectKind:'test',objectId:t.id},{objectKind:'formula',objectId:t.bonusFormulaRef},'testBonus',`tests[${i}].bonusFormulaRef`);
      if(t.targetFormulaRef)pushRef(this.#edges,{objectKind:'test',objectId:t.id},{objectKind:'formula',objectId:t.targetFormulaRef},'testTarget',`tests[${i}].targetFormulaRef`);
      for(const [j,id] of (t.outcomeRefs??[]).entries())pushRef(this.#edges,{objectKind:'test',objectId:t.id},{objectKind:'outcome',objectId:id},'testOutcome',`tests[${i}].outcomeRefs[${j}]`);
    }
    for(const [i,e] of (ruleset.effects??[]).entries()){
      pushRef(this.#edges,{objectKind:'effect',objectId:e.id},e.targetRef,'effectTarget',`effects[${i}].targetRef`);
      if(e.operand?.kind==='parameter')pushRef(this.#edges,{objectKind:'effect',objectId:e.id},{objectKind:'parameter',objectId:e.operand.id},'effectOperand',`effects[${i}].operand`);
      if(e.operand?.kind==='formula')pushRef(this.#edges,{objectKind:'effect',objectId:e.id},{objectKind:'formula',objectId:e.operand.id},'effectOperand',`effects[${i}].operand`);
      if(e.operand?.kind==='reference')pushRef(this.#edges,{objectKind:'effect',objectId:e.id},e.operand.reference,'effectOperand',`effects[${i}].operand.reference`);
    }
    for(const [i,a] of (ruleset.actions??[]).entries()){
      if(a.testRef)pushRef(this.#edges,{objectKind:'action',objectId:a.id},{objectKind:'test',objectId:a.testRef},'actionTest',`actions[${i}].testRef`);
      for(const [j,id] of (a.conditionRefs??[]).entries())pushRef(this.#edges,{objectKind:'action',objectId:a.id},{objectKind:'condition',objectId:id},'actionCondition',`actions[${i}].conditionRefs[${j}]`);
      for(const k of ['costEffectRefs','effectRefs'])for(const [j,id] of (a[k]??[]).entries())pushRef(this.#edges,{objectKind:'action',objectId:a.id},{objectKind:'effect',objectId:id},k,`actions[${i}].${k}[${j}]`);
      for(const [j,id] of (a.eventTypeRefs??[]).entries())pushRef(this.#edges,{objectKind:'action',objectId:a.id},{objectKind:'eventType',objectId:id},'actionEvent',`actions[${i}].eventTypeRefs[${j}]`);
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
    for(const [i,r] of (ruleset.restrictions??[]).entries())for(const [j,id] of (r.conditionRefs??[]).entries())pushRef(this.#edges,{objectKind:'restriction',objectId:r.id},{objectKind:'condition',objectId:id},'restrictionCondition',`restrictions[${i}].conditionRefs[${j}]`);
    for(const [i,d] of (ruleset.durations??[]).entries()){
      if(d.eventTypeRef)pushRef(this.#edges,{objectKind:'duration',objectId:d.id},{objectKind:'eventType',objectId:d.eventTypeRef},'durationEvent',`durations[${i}].eventTypeRef`);
      if(d.conditionRef)pushRef(this.#edges,{objectKind:'duration',objectId:d.id},{objectKind:'condition',objectId:d.conditionRef},'durationCondition',`durations[${i}].conditionRef`);
    }
    for(const [i,sheet] of (ruleset.sheetDefinitions??[]).entries())for(const [j,c] of (sheet.layout?.components??[]).entries())if(c.source?.objectKind&&c.source?.objectId)pushRef(this.#edges,{objectKind:'sheetDefinition',objectId:sheet.id},c.source,'sheetSource',`sheetDefinitions[${i}].layout.components[${j}].source`);
    const tagCollections=['definitions','parameters','formulas','formulaBindings','conditions','rolls','outcomes','tests','effects','actions','eventTypes','triggers','contentTypes','contentTemplates','modifiers','restrictions','durations','creationSystems','progressionSystems','sheetDefinitions'];
    for(const collection of tagCollections)for(const [i,entry] of (ruleset[collection]??[]).entries())for(const [j,id] of (entry.tags??[]).entries())pushRef(this.#edges,{objectKind:collection.replace(/s$/,''),objectId:entry.id},{objectKind:'tag',objectId:id},'tag',`${collection}[${i}].tags[${j}]`,'metadata');
    const contentTypesById=new Map((ruleset.contentTypes??[]).map(type=>[type.id,type]));
    for(const [i,t] of (ruleset.contentTemplates??[]).entries()){
      if(t.contentTypeId)pushRef(this.#edges,{objectKind:'contentTemplate',objectId:t.id},{objectKind:'contentType',objectId:t.contentTypeId},'templateContentType',`contentTemplates[${i}].contentTypeId`);
      for(const [j,b] of (t.definitionBindings??[]).entries())if(b?.definitionId)pushRef(this.#edges,{objectKind:'contentTemplate',objectId:t.id},{objectKind:'definition',objectId:b.definitionId},'templateDefinition',`contentTemplates[${i}].definitionBindings[${j}]`);
      for(const [j,b] of (t.actionBindings??[]).entries())if(b?.actionId)pushRef(this.#edges,{objectKind:'contentTemplate',objectId:t.id},{objectKind:'action',objectId:b.actionId},'templateAction',`contentTemplates[${i}].actionBindings[${j}]`);
      for(const [g,group] of (t.choiceGroups??[]).entries())for(const [o,option] of (group.options??[]).entries()){if(option?.kind==='definition'&&option.definitionId)pushRef(this.#edges,{objectKind:'contentTemplate',objectId:t.id},{objectKind:'definition',objectId:option.definitionId},'acquisitionChoice',`contentTemplates[${i}].choiceGroups[${g}].options[${o}]`);if(option?.kind==='action'&&option.actionId)pushRef(this.#edges,{objectKind:'contentTemplate',objectId:t.id},{objectKind:'action',objectId:option.actionId},'acquisitionChoice',`contentTemplates[${i}].choiceGroups[${g}].options[${o}]`);}
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
