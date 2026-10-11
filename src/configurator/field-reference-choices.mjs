/** Domain-independent reference option catalog.
 * The caller supplies a snapshot lookup, so one editor render does not repeatedly
 * clone the full Ruleset. This module does not know about Foundry windows or DOM.
 */
import {refToken} from './reference-token.mjs';
import {COLLECTION_TO_KIND} from './relation-contract.mjs';
import {referenceKindTitle,selectColorsAttribute} from '../ui/select-option-presentation.mjs';
import {missingTargetLabel} from '../ui/editor-display-text.mjs';

// The same Ruleset schema drives selectable field references and dependency
// resolution. New entry families are automatically available to typed fields.
const COLLECTIONS=Object.freeze(Object.fromEntries(
  Object.entries(COLLECTION_TO_KIND).map(([collection,kind])=>[kind,collection])
));
export function buildFieldReferenceChoices(field,shown,{
  listCollection,
  findDefinitionType=()=>null,
  optionColors=()=>[],
  language='en'
}={}){
  if(typeof listCollection!=='function')throw new TypeError('Reference choices require a Ruleset collection provider.');
  const kind=field?.referenceTarget?.objectKind??'';
  const kinds=COLLECTIONS[kind]?[kind]:Object.keys(COLLECTIONS);
  const mixed=kinds.length>1;
  const fr=String(language).toLowerCase().startsWith('fr');
  const values=Array.isArray(shown)?shown:shown&&typeof shown==='object'?[shown]:[];
  const selectedTokens=new Set(values.map(refToken));
  const candidates=kinds.flatMap(objectKind=>{
    const items=listCollection(COLLECTIONS[objectKind])??[];
    return items.filter(entry=>objectKind!=='definition'||!field?.referenceTarget?.definitionTypeId||entry.definitionTypeId===field.referenceTarget.definitionTypeId)
      .map(entry=>({objectKind,entry}));
  });
  const names=new Map();
  for(const {entry} of candidates){const name=String(entry.nameKey??entry.id).trim().toLocaleLowerCase();names.set(name,(names.get(name)??0)+1);}
  const choices=candidates.map(({objectKind,entry})=>{
    const token=refToken({objectKind,objectId:entry.id});
    const name=String(entry.nameKey??entry.id);
    const ambiguous=(names.get(name.trim().toLocaleLowerCase())??0)>1;
    const type=objectKind==='definition'?findDefinitionType(entry.definitionTypeId):null;
    const display=ambiguous?`${name} (${type?.nameKey??entry.id})`:name;
    const label=mixed?`${display} · ${referenceKindTitle(objectKind,fr)}`:display;
    return {token,label,colors:selectColorsAttribute(optionColors(objectKind,entry)),selected:selectedTokens.has(token)};
  });
  const known=new Set(choices.map(item=>item.token));
  for(const value of values){
    const token=refToken(value);
    if(known.has(token))continue;
    choices.push({token,label:missingTargetLabel(value.objectKind,value.objectId),selected:true});
    known.add(token);
  }
  return choices;
}
