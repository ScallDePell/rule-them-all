import {copyJSON,isRecord} from '../configurator/configurator-schema.mjs';
import {resolveAcquisitionChoices} from './acquisition-choices.mjs';
import {initialForDefinition} from './content-binding.mjs';
import {CREATION_SOURCE_COLLECTIONS} from '../configurator/creation-source-catalog.mjs';
import {RuntimeEvaluator} from './runtime-evaluator.mjs';

const SUPPORTED=new Set(CREATION_SOURCE_COLLECTIONS);

/** Pure, strict preflight of a configured Creation System.
 * A Definition Type is a schema, not an instantiated Definition. Therefore
 * selecting a type, a Roll or a Formula cannot silently create an Actor state.
 * Unsupported step contracts fail BEFORE any document or flag is changed.
 */
export async function planCreationSystem(ruleset,creationSystemId,answers={}){
  const analysis=await analyzeCreationSystem(ruleset,creationSystemId,answers);
  const failed=analysis.steps.find(step=>step.errors.length);
  if(failed)throw new Error(failed.errors[0]);
  const {steps:_steps,complete:_complete,...plan}=analysis;return plan;
}

/** CP-15 CreationContext projection: every step is checked on its own, so an answer made
 * invalid by an upstream change stays stored and is reported on its step, never dropped.
 * Step bounds, per-target maxima and option Conditions may be Formulas over the earlier steps:
 * variables.creation.<stepId> = {ids, count, fields} (fields: the first selected Content's data),
 * and variables.option = {id, fields} for an option being checked. */
export async function analyzeCreationSystem(ruleset,creationSystemId,answers={}){
  const system=(ruleset.creationSystems??[]).find(entry=>entry.id===creationSystemId&&entry.enabled!==false);
  if(!system)throw new Error(`Creation System unavailable: ${creationSystemId}.`);
  if(!answers || typeof answers!=='object'||Array.isArray(answers))throw new TypeError('Creation answers must be an object.');
  const steps=system.steps??[],stepIds=new Set(steps.map(s=>s.id));
  for(const id of Object.keys(answers))if(!stepIds.has(id))throw new Error(`Unknown Creation System step: ${id}.`);
  const operations=[],selectionSummary={},initialByDefinition={};
  const setInitial=(definitionId,initial)=>{
    if(!initial||!Object.keys(initial).length)return;
    if(Object.hasOwn(initialByDefinition,definitionId)&&JSON.stringify(initialByDefinition[definitionId])!==JSON.stringify(initial))
      throw new Error(`Conflicting initial values for Definition ${definitionId} across selected content.`);
    initialByDefinition[definitionId]=copyJSON(initial);
  };
  const report=[],creation={},bounds={},candidates={};
  const evaluator=new RuntimeEvaluator({ruleset,resolveReference:()=>{throw new Error("A creation Formula cannot read an Actor: use the earlier steps (variables.creation).");}});
  const context=extra=>({roles:{},variables:{creation,...extra}});
  const number=async(formulaRef,fallback,label,extra={})=>{if(!formulaRef)return fallback;const value=Number(await evaluator.formula(formulaRef,context(extra)));if(!Number.isFinite(value))throw new Error(`${label} is not a number.`);return value;};
  for(const step of steps){
    const errors=[],mark=operations.length;
    try{await analyzeStep(step);}catch(error){errors.push(error.message);operations.length=mark;delete selectionSummary[step.id];}
    report.push({id:step.id,name:step.name,kind:step.kind,answered:Object.hasOwn(answers,step.id),errors});
  }
  return {creationSystemId:system.id,selectedByStep:selectionSummary,operations,initialByDefinition,steps:report,complete:report.every(step=>!step.errors.length),bounds,options:candidates};
  async function analyzeStep(step){
    const answer=answers[step.id]??{},selected=Array.isArray(answer)?answer:answer?.selectedIds??[];
    const min=Math.max(await number(step.minFormulaRef,Number(step.min??0),`Creation step ${step.id} minimum`),step.required===true&&!step.minFormulaRef?1:0),max=await number(step.maxFormulaRef,Number(step.max??1),`Creation step ${step.id} maximum`);
    if(!Number.isInteger(min)||!Number.isInteger(max)||max<min)throw new Error(`Invalid Creation step cardinality: ${step.id} (${min} to ${max}).`);
    bounds[step.id]={min,max};
    if(step.kind==='allocation')return analyzeAllocation(step,answer,min,max);
    if(!Array.isArray(selected))throw new Error(`Creation step ${step.id} requires selectedIds[].`);
    if(new Set(selected).size!==selected.length)throw new Error(`Duplicate selection in Creation step: ${step.id}.`);
    if(step.kind==='review'){
      if(selected.length)throw new Error(`Review step ${step.id} cannot acquire objects.`);
      selectionSummary[step.id]=[];return;
    }
    if(!['choice','content'].includes(step.kind))throw new Error(`Unsupported Creation step kind: ${step.kind}.`);
    const source=step.source??{},collection=source.collection;
    if(!SUPPORTED.has(collection))throw new Error(`Creation step ${step.id}: ${collection||'missing source'} requires an explicit runtime mapping; no Actor has been changed.`);
    if(step.kind==='content'&&collection!=='contentTemplates')throw new Error(`Content step ${step.id} must select contentTemplates.`);
    if(!Array.isArray(source.objectIds))throw new Error(`Creation step ${step.id} requires an allowed Ruleset object list.`);
    const permitted=new Set(source.objectIds),registered=new Map((ruleset[collection]??[]).filter(o=>o.enabled!==false).map(o=>[o.id,o]));
    // The options this step offers with the earlier answers: what a random draw picks from.
    candidates[step.id]=[];
    for(const id of source.objectIds)if(registered.has(id)&&(!step.optionConditionRef||await evaluator.condition(step.optionConditionRef,context({option:{id,fields:copyJSON(registered.get(id).data??{})}}))))candidates[step.id].push({id,fields:copyJSON(registered.get(id).data??{})});
    if(selected.length<min||selected.length>max)throw new Error(`Creation step ${step.id} requires ${min} to ${max} selection(s).`);
    const templateChoices=Array.isArray(answer)?{}:answer?.contentChoices??{};
    for(const id of selected){
      if(typeof id!=='string'||!permitted.has(id)||!registered.has(id))throw new Error(`Creation step ${step.id} cannot select ${collection}/${id}.`);
      if(step.optionConditionRef&&!await evaluator.condition(step.optionConditionRef,context({option:{id,fields:copyJSON(registered.get(id).data??{})}})))throw new Error(`Creation step ${step.id}: ${id} is not available with the earlier choices.`);
      if(collection==='definitions')operations.push({kind:'definition',stepId:step.id,definitionId:id});
      else{
        const choices=copyJSON(templateChoices[id]??{});
        const template=registered.get(id);
        const resolved=resolveAcquisitionChoices(template,choices); // preflight all choices
        for(const relation of template.relations??[])if(relation?.operation==='grant'&&relation.targetRef?.objectKind==='definition')setInitial(relation.targetRef.objectId,initialForDefinition(template,relation.targetRef.objectId));
        for(const option of resolved)if(option.operation==='grant'&&option.targetRef?.objectKind==='definition')setInitial(option.targetRef.objectId,option.config?.initial??{});
        operations.push({kind:'content',stepId:step.id,templateId:id,selections:choices});
      }
    }
    selectionSummary[step.id]=copyJSON(selected);
    creation[step.id]={ids:copyJSON(selected),count:selected.length,fields:copyJSON(registered.get(selected[0])?.data??{})};
  }
  /** Allocation: points spread over the step's Definitions, between min and max in total,
   * at most perTargetMax on each; they add to value.base after every Content is acquired. */
  async function analyzeAllocation(step,answer,min,max){
    const source=step.source??{};
    if(source.collection!=='definitions'||!Array.isArray(source.objectIds))throw new Error(`Allocation step ${step.id} must list Definitions.`);
    const allocations=isRecord(answer?.allocations)?answer.allocations:{},permitted=new Set(source.objectIds);
    const perTarget=await number(step.perTargetMaxFormulaRef,step.perTargetMax??null,`Creation step ${step.id} maximum per target`);
    let total=0;
    for(const [definitionId,points] of Object.entries(allocations)){
      if(!permitted.has(definitionId)||!(ruleset.definitions??[]).some(d=>d.id===definitionId&&d.enabled!==false))throw new Error(`Allocation step ${step.id} cannot raise ${definitionId}.`);
      if(!Number.isInteger(points)||points<0)throw new Error(`Allocation step ${step.id}: points for ${definitionId} must be a whole number of 0 or more.`);
      if(!answer?.drawn&&perTarget!==null&&points>perTarget)throw new Error(`Allocation step ${step.id}: at most ${perTarget} point(s) on ${definitionId}.`);
      total+=points;
    }
    // A drawn allocation keeps what the dice gave; only its targets are checked.
    if(!answer?.drawn&&(total<min||total>max))throw new Error(min===max?`Allocation step ${step.id} requires exactly ${min} point(s), not ${total}.`:`Allocation step ${step.id} requires ${min} to ${max} point(s), not ${total}.`);
    const spent=Object.fromEntries(Object.entries(allocations).filter(([,points])=>points>0));
    operations.push({kind:'allocation',stepId:step.id,allocations:copyJSON(spent)});
    selectionSummary[step.id]=Object.keys(spent);
    creation[step.id]={ids:Object.keys(spent),count:total,fields:{},allocations:copyJSON(spent)};
  }
}

/** A random answer for one step, from the options its earlier answers leave (CP-15 draw).
 * choice/content: as many options as the step's minimum (at least one), each drawn with the weight
 * of its draw.weightField data field (evenly without one), never twice; allocation: the step's Roll
 * thrown once per Definition. random() is in [0, 1); roll(formula) resolves to {total, result}. */
export async function drawCreationStep(ruleset,creationSystemId,answers,stepId,{random=Math.random,roll}={}){
  const system=(ruleset.creationSystems??[]).find(entry=>entry.id===creationSystemId&&entry.enabled!==false),step=system?.steps?.find(entry=>entry.id===stepId);
  if(!step)throw new Error(`Unknown Creation System step: ${stepId}.`);
  if(!step.draw)throw new Error(`Creation step ${step.id} is not drawn at random.`);
  const {[stepId]:_current,...others}=answers,analysis=await analyzeCreationSystem(ruleset,creationSystemId,others);
  if(step.kind==='allocation'){
    const rollDef=(ruleset.rolls??[]).find(entry=>entry.id===step.draw.rollRef&&entry.enabled!==false);if(!rollDef)throw new Error(`Roll unavailable: ${step.draw.rollRef}.`);
    const allocations={},rolls=[];
    for(const definitionId of step.source?.objectIds??[]){const result=await roll(rollDef.formula);allocations[definitionId]=Math.max(0,Math.trunc(Number(result.total)));rolls.push({definitionId,formula:rollDef.formula,total:Number(result.total),result:String(result.result??result.total)});}
    return {answer:{allocations,drawn:true},rolls};
  }
  const pool=[...(analysis.options[step.id]??[])],{min=1,max=1}=analysis.bounds[step.id]??{},count=Math.min(Math.max(min,1),max,pool.length);
  const weight=option=>{if(!step.draw.weightField)return 1;const value=Number(option.fields?.[step.draw.weightField]);return Number.isFinite(value)&&value>0?value:0;};
  const selectedIds=[],rolls=[];
  while(selectedIds.length<count){
    const total=pool.reduce((sum,option)=>sum+weight(option),0);if(total<=0)break;
    let pick=random()*total,index=0;
    for(;index<pool.length-1;index++){pick-=weight(pool[index]);if(pick<0)break;}
    rolls.push({id:pool[index].id,weight:weight(pool[index]),of:total});selectedIds.push(pool[index].id);pool.splice(index,1);
  }
  if(selectedIds.length<Math.min(min,1))throw new Error(`Creation step ${step.id} has no option to draw.`);
  return {answer:{selectedIds,drawn:true},rolls};
}
