/** Creation System form -> portable steps. No Foundry or Ruleset storage access. */
const json=(value,fallback)=>{const text=String(value??'').trim();return text?JSON.parse(text):fallback;};
export function collectCreationSteps(rows,{sources=[],uid}={}){
  const choices=new Map(sources.map(source=>[source.id,source]));
  const steps=[...rows].map(row=>{
    const original=json(row.dataset?.original,{});
    const name=String(row.querySelector('[data-step-prop="name"]')?.value??'').trim();
    const min=Number(row.querySelector('[data-step-prop="min"]')?.value??0),max=Number(row.querySelector('[data-step-prop="max"]')?.value??1);
    if(!name)throw new Error('Every creation step needs a name.');
    if(!Number.isInteger(min)||!Number.isInteger(max)||min<0||max<min)throw new Error(`Invalid minimum/maximum for step ${name}.`);
    const family=row.querySelector('[data-step-source-family]:checked')?.value??'';
    const objectIds=[...row.querySelectorAll('[data-step-prop="sourceObjects"] [data-step-source-object]:checked')].map(input=>input.value);
    const next={...original,id:original.id||uid('step'),name,kind:row.querySelector('[data-step-prop="kind"]')?.value??'choice',required:min>0,min,max};
    // Optional computed values: an empty select or field keeps none.
    for(const key of ['minFormulaRef','maxFormulaRef','perTargetMaxFormulaRef','optionConditionRef']){const id=String(row.querySelector(`[data-step-prop="${key}"]`)?.value??'').trim();if(id)next[key]=id;else delete next[key];}
    const perTarget=String(row.querySelector('[data-step-prop="perTargetMax"]')?.value??'').trim();
    if(perTarget===''||next.kind!=='allocation')delete next.perTargetMax;else{const value=Number(perTarget);if(!Number.isInteger(value)||value<0)throw new Error(`Invalid points per target for step ${name}.`);next.perTargetMax=value;}
    if(next.kind!=='allocation')delete next.perTargetMaxFormulaRef;
    if(!['choice','content'].includes(next.kind))delete next.optionConditionRef;
    // Random draw: none, optional or final; options weighted by a data field, or an allocation rolled per Definition.
    const draw=String(row.querySelector('[data-step-prop="draw"]')?.value??'');
    if(!draw||next.kind==='review')delete next.draw;
    else{
      const weightField=String(row.querySelector('[data-step-prop="drawWeightField"]')?.value??'').trim(),rollRef=String(row.querySelector('[data-step-prop="drawRollRef"]')?.value??'').trim();
      next.draw={locked:draw==='locked',...(next.kind!=='allocation'&&weightField?{weightField}:{}),...(next.kind==='allocation'&&rollRef?{rollRef}:{})};
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
