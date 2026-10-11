/** Ruleset reference choices for Formula, Condition and Effect builders.
 * UI colors are injected from the Ruleset resolver. No Foundry access.
 */
import {refToken} from './reference-token.mjs';
import {referenceKindTitle,selectColorsAttribute} from '../ui/select-option-presentation.mjs';

export function buildRuleReferenceChoices({definitions=[],parameters=[],formulas=[],findCapability=()=>null,optionColors=()=>[],language='en',mutableOnly=false}={}){
  const choices=[],fr=String(language).startsWith('fr');
  for(const definition of definitions){
    if(!mutableOnly)choices.push({token:refToken({objectKind:'definition',objectId:definition.id}),label:`${definition.nameKey} · ${referenceKindTitle('definition',fr)}`,colors:selectColorsAttribute(optionColors('definition',definition))});
    for(const capId of definition.capabilities??[]){
      const cap=findCapability(capId);
      for(const output of Object.values(cap?.outputs??{})){
        if(mutableOnly&&!output.mutable)continue;
        choices.push({token:refToken({objectKind:'definition',objectId:definition.id,capabilityId:capId,outputId:output.id}),label:`${definition.nameKey} · ${capId} · ${output.id}`,colors:selectColorsAttribute(optionColors('definition',definition)),valueType:output.valueType,mutable:output.mutable});
      }
    }
  }
  if(!mutableOnly){
    for(const parameter of parameters)choices.push({token:refToken({objectKind:'parameter',objectId:parameter.id}),label:`${parameter.nameKey} · ${referenceKindTitle('parameter',fr)}`,colors:selectColorsAttribute(optionColors('parameter',parameter)),valueType:parameter.valueType});
    for(const formula of formulas)choices.push({token:refToken({objectKind:'formula',objectId:formula.id}),label:`${formula.nameKey} · ${referenceKindTitle('formula',fr)}`,colors:selectColorsAttribute(optionColors('formula',formula)),valueType:formula.resultType});
  }
  return choices;
}
