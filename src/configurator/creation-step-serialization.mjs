/** Creation System form -> portable steps. No Foundry or Ruleset storage access. */
import {readableId,freeId} from './identity.mjs';
const json=(value,fallback)=>{const text=String(value??'').trim();return text?JSON.parse(text):fallback;};
export function collectCreationSteps(rows,{sources=[]}={}){
  const choices=new Map(sources.map(source=>[source.id,source]));
  // A saved step keeps its id; a new one takes the id typed for it, else one made from its name.
  const taken=new Set([...rows].map(row=>json(row.dataset?.original,{}).id).filter(Boolean));
  const steps=[...rows].map(row=>{
    const original=json(row.dataset?.original,{});
    const name=String(row.querySelector('[data-step-prop="name"]')?.value??'').trim();
    const min=Number(row.querySelector('[data-step-prop="min"]')?.value??0),max=Number(row.querySelector('[data-step-prop="max"]')?.value??1);
    if(!name)throw new Error('Every creation step needs a name.');
    if(!Number.isInteger(min)||!Number.isInteger(max)||min<0||max<min)throw new Error(`Invalid minimum/maximum for step ${name}.`);
    const family=row.querySelector('[data-step-source-family]:checked')?.value??'';
    const objectIds=[...row.querySelectorAll('[data-step-prop="sourceObjects"] [data-step-source-object]:checked')].map(input=>input.value);
    let id=original.id;
    if(!id){
      const typed=String(row.querySelector('[data-step-prop="id"]')?.value??'').trim();
      if(typed&&readableId(typed)!==typed)throw new Error(`Invalid step identifier ${typed}: use lower-case letters, digits and dashes (${readableId(typed)||'step'}).`);
      if(typed&&taken.has(typed))throw new Error(`The step identifier ${typed} is already used.`);
      id=typed||freeId(readableId(name)||'step',taken);taken.add(id);
    }
    const next={...original,id,name,kind:row.querySelector('[data-step-prop="kind"]')?.value??'choice',required:min>0,min,max};
    // Optional computed values: an empty select or field keeps none.
    for(const key of ['minFormulaRef','maxFormulaRef','perTargetMaxFormulaRef','optionConditionRef','conditionRef','costFormulaRef','rollRef']){const id=String(row.querySelector(`[data-step-prop="${key}"]`)?.value??'').trim();if(id)next[key]=id;else delete next[key];}
    const perTarget=String(row.querySelector('[data-step-prop="perTargetMax"]')?.value??'').trim();
    if(perTarget===''||next.kind!=='allocation')delete next.perTargetMax;else{const value=Number(perTarget);if(!Number.isInteger(value)||value<0)throw new Error(`Invalid points per target for step ${name}.`);next.perTargetMax=value;}
    if(next.kind!=='allocation'){delete next.perTargetMaxFormulaRef;delete next.costFormulaRef;}
    if(next.kind!=='roll')delete next.rollRef;
    // A roll step is thrown once and has no bounds.
    if(next.kind==='roll'){next.min=1;next.max=1;next.required=true;}
    // Repeat: this step closes a block of its last N steps, played term after term.
    const repeatSteps=String(row.querySelector('[data-step-prop="repeatSteps"]')?.value??'').trim();
    if(!repeatSteps)delete next.repeat;
    else{
      const steps=Number(repeatSteps),maxText=String(row.querySelector('[data-step-prop="repeatMax"]')?.value??'').trim(),max=maxText===''?null:Number(maxText);
      if(!Number.isInteger(steps)||steps<1)throw new Error(`Invalid number of repeated steps for step ${name}.`);
      if(max!==null&&(!Number.isInteger(max)||max<1))throw new Error(`Invalid number of terms for step ${name}.`);
      next.repeat={steps,max,continueConditionRef:String(row.querySelector('[data-step-prop="repeatContinueConditionRef"]')?.value??'').trim()||null};
    }
    if(!['choice','content'].includes(next.kind))delete next.optionConditionRef;
    // Random draw: none, optional or final; options weighted by a data field, or an allocation rolled per Definition.
    const draw=String(row.querySelector('[data-step-prop="draw"]')?.value??'');
    if(!draw||['review','roll'].includes(next.kind))delete next.draw;
    else{
      const weightField=String(row.querySelector('[data-step-prop="drawWeightField"]')?.value??'').trim(),rollRef=String(row.querySelector('[data-step-prop="drawRollRef"]')?.value??'').trim();
      next.draw={locked:draw==='locked',...(next.kind!=='allocation'&&weightField?{weightField}:{}),...(next.kind==='allocation'&&rollRef?{rollRef}:{})};
    }
    // A contentChoices step lists the content steps whose choices it asks, and nothing else.
    if(next.kind==='contentChoices'){
      const stepIds=[...row.querySelectorAll('[data-step-prop="coveredSteps"] [data-step-source-object]:checked')].map(input=>input.value);
      for(const key of ['minFormulaRef','maxFormulaRef','optionConditionRef'])delete next[key];
      return {...next,min:0,max:0,required:false,source:{stepIds}};
    }
    if(family){
      const source=choices.get(family);
      if(!source)throw new Error(`Unknown Ruleset source: ${family}`);
      const validIds=new Set(source.items.map(item=>item.id));
      for(const id of objectIds)if(!validIds.has(id))throw new Error(`Missing Ruleset object: ${family}/${id}`);
      next.source={...(original.source??{}),collection:family,objectIds};
    }else delete next.source;
    return next;
  });
  if(new Set(steps.map(step=>step.id)).size!==steps.length)throw new Error('Creation step IDs must be unique.');
  return steps;
}
