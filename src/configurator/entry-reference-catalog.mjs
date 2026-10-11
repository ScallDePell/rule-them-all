/** Ruleset reference choices for Formula, Condition and Effect builders.
 * UI colors are injected from the Ruleset resolver. No Foundry access.
 */
import {refToken} from './reference-token.mjs';
import {SLOT_CAPABILITIES} from './capability-slots.mjs';
import {referenceKindTitle,selectColorsAttribute} from '../ui/select-option-presentation.mjs';

export function buildRuleReferenceChoices({definitions=[],parameters=[],formulas=[],findCapability=()=>null,optionColors=()=>[],language='en',mutableOnly=false}={}){
  const choices=[],fr=String(language).startsWith('fr');
  for(const definition of definitions){
    if(!mutableOnly)choices.push({token:refToken({objectKind:'definition',objectId:definition.id}),label:`${definition.nameKey} · ${referenceKindTitle('definition',fr)}`,colors:selectColorsAttribute(optionColors('definition',definition))});
    for(const capId of definition.capabilities??[]){
      const cap=findCapability(capId);
      // A slotted capability (pool, collection) exposes its outputs once per configured slot.
      const slots=SLOT_CAPABILITIES.includes(capId)?(definition.slots?.[capId]??[]).map(slot=>slot.id):[null];
      for(const slotId of slots)for(const output of Object.values(cap?.outputs??{})){
        if(mutableOnly&&!output.mutable)continue;
        const reference={objectKind:'definition',objectId:definition.id,capabilityId:capId,...(slotId?{slotId}:{}),outputId:output.id};
        choices.push({token:refToken(reference),label:`${definition.nameKey} · ${slotId?`${capId} ${slotId}`:capId} · ${output.id}`,colors:selectColorsAttribute(optionColors('definition',definition)),valueType:output.valueType,mutable:output.mutable});
      }
    }
  }
  if(!mutableOnly){
    for(const parameter of parameters)choices.push({token:refToken({objectKind:'parameter',objectId:parameter.id}),label:`${parameter.nameKey} · ${referenceKindTitle('parameter',fr)}`,colors:selectColorsAttribute(optionColors('parameter',parameter)),valueType:parameter.valueType});
    for(const formula of formulas)choices.push({token:refToken({objectKind:'formula',objectId:formula.id}),label:`${formula.nameKey} · ${referenceKindTitle('formula',fr)}`,colors:selectColorsAttribute(optionColors('formula',formula)),valueType:formula.resultType});
  }
  return choices;
}
