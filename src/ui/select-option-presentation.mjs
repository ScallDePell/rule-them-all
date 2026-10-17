import {RTA_NEUTRAL_COLOR} from "./theme-tokens.mjs";
import {objectColor} from "../configurator/ruleset-colors.mjs";
import {COLLECTION_TO_KIND} from "../configurator/relation-contract.mjs";
/**
 * Select option presentation only. IDs, reference tokens and stored values
 * are not modified. Each option uses its own configured business family:
 * - Definition => Definition Type; Content Template => Content Type;
 * - other entries => the corresponding Ruleset family;
 * - a Tag option itself => the Tag's own color.
 * Tags attached to an object NEVER change that object's accent. Missing
 * colors use the #666666 fallback from RTA navigation/cards. Free-text
 * entries have no color contract in the Ruleset schema.
 */
export const DEFAULT_SELECT_COLOR=RTA_NEUTRAL_COLOR;
// Presentation and reference pickers resolve their families from the exact
// same Ruleset schema. A new family cannot silently be left uncoloured.
const KIND_COLLECTION=Object.freeze(Object.fromEntries(
  Object.entries(COLLECTION_TO_KIND).map(([collection,kind])=>[kind,collection])
));
export const canonicalSelectColor=value=>{
  const text=String(value??"").trim();
  if(!/^#[0-9a-f]{3}(?:[0-9a-f]{3})?(?:[0-9a-f]{2})?$/i.test(text))return null;
  const normal=text.toLowerCase();
  return normal;
};
export const normalizedSelectColors=values=>{
  const unique=[...new Set((Array.isArray(values)?values:String(values??"").split(",")).map(canonicalSelectColor).filter(Boolean))];
  return unique.length?unique:[DEFAULT_SELECT_COLOR];
};
export const selectColorsAttribute=values=>normalizedSelectColors(values).join(",");
export const referenceKindTitle=(kind,fr=false)=>{
  const names={definition:["Définition","Definition"],definitionType:["Type de définition","Definition type"],contentTemplate:["Contenu","Content"],contentType:["Type de contenu","Content type"],parameter:["Paramètre","Parameter"],formula:["Formule","Formula"],condition:["Condition","Condition"],roll:["Jet","Roll"],test:["Test","Test"],action:["Action","Action"]};
  return (names[kind]??[kind,kind])[fr?0:1];
};
export function createSelectColorResolver({definitionTypes=[],contentTypes=[],familyColors={},ruleset=null}={}){
  const definitionTypeById=new Map(definitionTypes.map(x=>[x.id,x]));
  const contentTypeById=new Map(contentTypes.map(x=>[x.id,x]));
  return (kind,entry)=>{
    if(!entry)return [];
    if(ruleset){
      const collection=KIND_COLLECTION[kind];
      const target=kind==='definition' ? definitionTypeById.get(entry.definitionTypeId)
        : kind==='contentTemplate' ? contentTypeById.get(entry.contentTypeId) : entry;
      const colorCollection=kind==='definition'?'definitionTypes':kind==='contentTemplate'?'contentTypes':collection;
      return normalizedSelectColors([objectColor(ruleset,colorCollection,target)]);
    }
    const colors=[];
    if(kind==="definition")colors.push(definitionTypeById.get(entry.definitionTypeId)?.color??DEFAULT_SELECT_COLOR);
    else if(kind==="contentTemplate")colors.push(contentTypeById.get(entry.contentTypeId)?.color??DEFAULT_SELECT_COLOR);
    else if(kind==="definitionType"||kind==="contentType"||kind==="tag")colors.push(entry.color??DEFAULT_SELECT_COLOR);
    else colors.push(familyColors?.[KIND_COLLECTION[kind]]??DEFAULT_SELECT_COLOR);
    return normalizedSelectColors(colors);
  };
}
