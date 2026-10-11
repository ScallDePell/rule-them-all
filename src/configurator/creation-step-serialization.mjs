/** Creation System form -> portable steps. No Foundry or Ruleset storage access. */
const json=(value,fallback)=>{const text=String(value??'').trim();return text?JSON.parse(text):fallback;};
export function collectCreationSteps(rows,{sources=[],uid}={}){
  const choices=new Map(sources.map(source=>[source.id,source]));
  const steps=[...rows].map(row=>{
    const original=json(row.querySelector('[data-step-prop="advanced"]')?.value,{});
    if(!original||typeof original!=='object'||Array.isArray(original))throw new Error('Advanced step data must be a JSON object.');
    const name=String(row.querySelector('[data-step-prop="name"]')?.value??'').trim();
    const min=Number(row.querySelector('[data-step-prop="min"]')?.value??0),max=Number(row.querySelector('[data-step-prop="max"]')?.value??1);
    if(!name)throw new Error('Every creation step needs a name.');
    if(!Number.isInteger(min)||!Number.isInteger(max)||min<0||max<min)throw new Error(`Invalid minimum/maximum for step ${name}.`);
    const family=row.querySelector('[data-step-source-family]:checked')?.value??'';
    const objectIds=[...row.querySelectorAll('[data-step-prop="sourceObjects"] [data-step-source-object]:checked')].map(input=>input.value);
    const next={...original,id:original.id||uid('step'),name,kind:row.querySelector('[data-step-prop="kind"]')?.value??'choice',required:row.querySelector('[data-step-prop="required"]')?.checked===true,min,max};
    if(family){
      const source=choices.get(family);
      if(!source)throw new Error(`Unknown Ruleset source: ${family}`);
      const validIds=new Set(source.items.map(item=>item.id));
      for(const id of objectIds)if(!validIds.has(id))throw new Error(`Missing Ruleset object: ${family}/${id}`);
      next.source={...(original.source??{}),collection:family,objectIds};
    }else if(original.source?.collection){
      next.source=original.source; // Never silently delete a legacy/unknown source.
    }else delete next.source;
    return next;
  });
  if(new Set(steps.map(step=>step.id)).size!==steps.length)throw new Error('Creation step IDs must be unique.');
  return steps;
}
