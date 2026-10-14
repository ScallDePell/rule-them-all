import {parseRefToken} from './reference-token.mjs';
import {normalizeRelation} from './generic-relations.mjs';

/** Content Template UI -> portable acquisition contract.
 * Updates only fields that the visible form edits; unexposed stored properties
 * are preserved. Do not replace the persisted aggregate with UI defaults.
 */
/** An option granting a value Definition can add a bonus to its value.base (config.add, summed over every grant).
 * Without a bonus field (another kind of target) the stored config is kept as is. */
function optionConfig(config,field,operation){
  if(!field)return config;
  const {add:{'value.base':_old,...otherAdds}={},...rest}=config,text=String(field.value??'').trim(),bonus=Number(text);
  if(text&&!Number.isFinite(bonus))throw new Error('The bonus of an acquisition choice must be a number.');
  const add={...otherAdds,...(operation==='grant'&&text&&bonus!==0?{'value.base':bonus}:{})};
  return Object.keys(add).length?{...rest,add}:rest;
}

export function collectTemplateAcquisitions({current={},choiceRows=[],uid}={}){
  const previousGroups=new Map((current.choiceGroups??[]).map(group=>[group.id,group]));
  const choiceGroups=[...choiceRows].map(row=>{
    const id=String(row.dataset?.choiceGroup??uid?.('choice')??'').trim();
    if(!id)throw new Error('Acquisition choice requires an id.');
    const previous=previousGroups.get(id)??{};
    const name=String(row.querySelector('[data-choice-prop="name"]')?.value??'').trim();
    const min=Number(row.querySelector('[data-choice-prop="min"]')?.value??1);
    const max=Number(row.querySelector('[data-choice-prop="max"]')?.value??1);
    const operation=String(row.querySelector('[data-choice-prop="operation"]')?.value??'grant');
    const preserveOptionOperations=Boolean(row.dataset?.choiceInitialOperation) && row.dataset.choiceInitialOperation===operation;
    const oldOptions=new Map((previous.options??[]).map(option=>[`${option.targetRef?.objectKind}:${option.targetRef?.objectId}`,option]));
    const options=[];
    for(const input of row.querySelectorAll('[name="choiceTargetRef"]:checked')){
      const targetRef=parseRefToken(input.value);
      if(!targetRef.objectKind||!targetRef.objectId)throw new Error(`Acquisition choice ${id} has an invalid reference.`);
      const key=`${targetRef.objectKind}:${targetRef.objectId}`;
      const previousOption=oldOptions.get(key)??{};
      const optionOperation=preserveOptionOperations&&['link','unlock','grant'].includes(previousOption.operation)?previousOption.operation:operation;
      const option=normalizeRelation({...previousOption,id:previousOption.id??`option-${targetRef.objectKind}-${targetRef.objectId}`,
        operation:optionOperation,targetRef,config:optionConfig(previousOption.config??{},[...row.querySelectorAll('[data-choice-bonus]')].find(field=>field.dataset?.choiceBonus===input.value),optionOperation)});
      options.push(option);
    }
    return {...previous,id,name,min,max,options};
  });
  return {choiceGroups};
}
