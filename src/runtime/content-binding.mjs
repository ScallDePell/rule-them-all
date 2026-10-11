import {copyJSON} from '../configurator/configurator-schema.mjs';

/** The same initial Definition values for Content acquisition and Creation:
 * the config.initial of the template's grant relation to that Definition. */
export function initialForDefinition(template,definitionId){
  const relation=(template.relations??[]).find(entry=>entry?.operation==='grant'&&entry.targetRef?.objectKind==='definition'&&entry.targetRef.objectId===definitionId);
  const initial=relation?.config?.initial;
  return initial&&typeof initial==='object'&&!Array.isArray(initial)?copyJSON(initial):{};
}
