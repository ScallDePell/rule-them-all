import {copyJSON} from '../configurator/configurator-schema.mjs';

/** The same initial Definition values for Content acquisition and Creation. */
export function initialForDefinition(template,definitionId){
  const binding=(template.definitionBindings??[]).find(entry=>entry?.definitionId===definitionId);
  if(binding?.initial && typeof binding.initial==='object' && !Array.isArray(binding.initial) && Object.keys(binding.initial).length)
    return copyJSON(binding.initial);
  // Read-only support for older initialStateRules content contracts.
  const legacy=(template.initialStateRules??[]).find(rule=>rule?.definitionId===definitionId);
  if(legacy?.initial && typeof legacy.initial==='object' && !Array.isArray(legacy.initial))return copyJSON(legacy.initial);
  if(legacy?.values && typeof legacy.values==='object' && !Array.isArray(legacy.values))return copyJSON(legacy.values);
  return binding?.initial && typeof binding.initial==='object' && !Array.isArray(binding.initial)?copyJSON(binding.initial):{};
}
