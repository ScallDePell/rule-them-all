import {copyJSON} from '../configurator/configurator-schema.mjs';
import {resolveAcquisitionChoices} from './acquisition-choices.mjs';
import {initialForDefinition} from './content-binding.mjs';

const SUPPORTED=new Set(['definitions','contentTemplates']);

/** Pure, strict preflight of a configured Creation System.
 * A Definition Type is a schema, not an instantiated Definition. Therefore
 * selecting a type, a Roll or a Formula cannot silently create an Actor state.
 * Unsupported step contracts fail BEFORE any document or flag is changed.
 */
export function planCreationSystem(ruleset,creationSystemId,answers={}){
  const analysis=analyzeCreationSystem(ruleset,creationSystemId,answers);
  const failed=analysis.steps.find(step=>step.errors.length);
  if(failed)throw new Error(failed.errors[0]);
  const {steps:_steps,complete:_complete,...plan}=analysis;return plan;
}

/** CP-15 CreationContext projection: every step is checked on its own, so an answer made
 * invalid by an upstream change stays stored and is reported on its step, never dropped. */
export function analyzeCreationSystem(ruleset,creationSystemId,answers={}){
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
  const report=[];
  for(const step of steps){
    const errors=[],mark=operations.length;
    try{analyzeStep(step);}catch(error){errors.push(error.message);operations.length=mark;delete selectionSummary[step.id];}
    report.push({id:step.id,name:step.name,kind:step.kind,answered:Object.hasOwn(answers,step.id),errors});
  }
  return {creationSystemId:system.id,selectedByStep:selectionSummary,operations,initialByDefinition,steps:report,complete:report.every(step=>!step.errors.length)};
  function analyzeStep(step){
    const answer=answers[step.id]??{},selected=Array.isArray(answer)?answer:answer?.selectedIds??[];
    if(!Array.isArray(selected))throw new Error(`Creation step ${step.id} requires selectedIds[].`);
    if(new Set(selected).size!==selected.length)throw new Error(`Duplicate selection in Creation step: ${step.id}.`);
    if(step.kind==='review'){
      if(selected.length)throw new Error(`Review step ${step.id} cannot acquire objects.`);
      selectionSummary[step.id]=[];return;
    }
    if(step.kind==='allocation')throw new Error(`Creation allocation step ${step.id} needs an explicit allocation contract; no Actor has been changed.`);
    if(!['choice','content'].includes(step.kind))throw new Error(`Unsupported Creation step kind: ${step.kind}.`);
    const source=step.source??{},collection=source.collection;
    if(!SUPPORTED.has(collection))throw new Error(`Creation step ${step.id}: ${collection||'missing source'} requires an explicit runtime mapping; no Actor has been changed.`);
    if(step.kind==='content'&&collection!=='contentTemplates')throw new Error(`Content step ${step.id} must select contentTemplates.`);
    if(!Array.isArray(source.objectIds))throw new Error(`Creation step ${step.id} requires an allowed Ruleset object list.`);
    const permitted=new Set(source.objectIds),registered=new Map((ruleset[collection]??[]).filter(o=>o.enabled!==false).map(o=>[o.id,o]));
    const min=Math.max(Number(step.min??0),step.required===true?1:0),max=Number(step.max??1);
    if(!Number.isInteger(min)||!Number.isInteger(max)||max<min)throw new Error(`Invalid Creation step cardinality: ${step.id}.`);
    if(selected.length<min||selected.length>max)throw new Error(`Creation step ${step.id} requires ${min} to ${max} selection(s).`);
    const templateChoices=Array.isArray(answer)?{}:answer?.contentChoices??{};
    for(const id of selected){
      if(typeof id!=='string'||!permitted.has(id)||!registered.has(id))throw new Error(`Creation step ${step.id} cannot select ${collection}/${id}.`);
      if(collection==='definitions')operations.push({kind:'definition',stepId:step.id,definitionId:id});
      else{
        const choices=copyJSON(templateChoices[id]??{});
        const template=registered.get(id);
        const resolved=resolveAcquisitionChoices(template,choices); // preflight all choices
        for(const binding of template.definitionBindings??[])setInitial(binding.definitionId,initialForDefinition(template,binding.definitionId));
        for(const option of resolved)if(option.kind==='definition')setInitial(option.definitionId,option.initial??{});
        operations.push({kind:'content',stepId:step.id,templateId:id,selections:choices});
      }
    }
    selectionSummary[step.id]=copyJSON(selected);
  }
}
