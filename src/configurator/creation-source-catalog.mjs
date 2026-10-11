/**
 * A Creation System selects sources from the ACTUAL Ruleset document, not
 * from a separately maintained list of editor families or API method names.
 * The structural collection-to-kind contract is shared with the reference
 * resolver; it is not a list of permitted game concepts or Runtime effects.
 */
import {isRecord} from './configurator-schema.mjs';
import {COLLECTION_TO_KIND} from './relation-contract.mjs';

const localize=(key,fallback)=>{
  const i18n=globalThis.game?.i18n;
  if(!i18n?.localize)return fallback;
  if(typeof i18n.has==='function'&&!i18n.has(key))return fallback;
  const translated=i18n.localize(key);
  return translated&&translated!==key?translated:fallback;
};
const title=id=>String(id).replace(/([a-z])([A-Z])/g,'$1 $2').replace(/^./,s=>s.toUpperCase());
const EMPTY={allowedLabel:'Allowed entries',help:'Select a Ruleset source above. Nothing is created in the game world from this configuration alone.'};

/** Every schema-recognized array present on this Ruleset is a selectable
 * collection, including empty collections. No content-type or game-family
 * names are enumerated here. No provider method is guessed from a plural. */
export function listCreationSourceCollections(ruleset){
  if(!isRecord(ruleset))throw new TypeError('A Ruleset document is required for creation source discovery.');
  return Object.entries(ruleset).filter(([id,entries])=>
    Object.hasOwn(COLLECTION_TO_KIND,id)&&Array.isArray(entries)
  ).map(([id,entries])=>({id,objectKind:COLLECTION_TO_KIND[id],entries}));
}

export function getCreationSourceDescriptor(id){
  if(!id)return {
    allowedLabel:localize('RTA.CreationSource.Empty.Allowed',EMPTY.allowedLabel),
    help:localize('RTA.CreationSource.Empty.Help',EMPTY.help)
  };
  const fallback=title(id);
  return {
    id,
    label:localize(`RTA.CreationSource.${id}.Label`,localize(`RTA.FamilyColor.${id}`,fallback)),
    allowedLabel:localize(`RTA.CreationSource.${id}.Allowed`,`Allowed ${fallback}`),
    help:localize(`RTA.CreationSource.${id}.Help`,'Choose existing entries from this Ruleset collection. No Runtime effect is implied.')
  };
}

/** The snapshot supplied during render is authoritative: there is no extra
 * storage fetch for each collection, and no static list of API calls. */
export function getCreationSources(api,versionId,ruleset=null,optionColors=null){
  const current=ruleset??api?.getRuleset?.(versionId);
  return listCreationSourceCollections(current).map(({id,objectKind,entries})=>({
    id,
    label:getCreationSourceDescriptor(id).label,
    items:entries.map(entry=>({
      id:entry.id,label:entry.nameKey??entry.name??entry.key??entry.id,
      ...(optionColors?{colors:optionColors(objectKind,entry)}:{})
    }))
  }));
}
