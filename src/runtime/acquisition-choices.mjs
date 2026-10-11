import {copyJSON} from '../configurator/configurator-schema.mjs';

/** Preflight every selected choice before mutating Actor runtime state. */
export function resolveAcquisitionChoices(template,selections={}){
  if(!selections || typeof selections!=='object' || Array.isArray(selections))
    throw new TypeError('Acquisition selections must be a keyed object.');
  const selected=[];
  const groups=template.choiceGroups??[];
  for(const name of Object.keys(selections))if(!groups.some(group=>group.id===name))
    throw new Error(`Unknown acquisition choice group: ${name}.`);
  for(const group of groups){
    const raw=selections[group.id]??[];
    if(!Array.isArray(raw))throw new Error(`Acquisition choices for ${group.id} must be an array.`);
    const ids=[...new Set(raw)];
    if(ids.length!==raw.length)throw new Error(`Duplicate acquisition choice in group: ${group.id}.`);
    const allowed=new Map((group.options??[]).map(option=>[option.id,option]));
    if(ids.length<group.min||ids.length>group.max)
      throw new Error(`Acquisition choice “${group.name}” requires ${group.min===group.max?group.min:`${group.min} to ${group.max}`} selection(s).`);
    for(const id of ids){
      const option=allowed.get(id);
      if(!option)throw new Error(`Invalid acquisition choice option: ${id}.`);
      selected.push({groupId:group.id,...copyJSON(option)});
    }
  }
  return selected;
}
