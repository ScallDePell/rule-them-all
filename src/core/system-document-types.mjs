/** Resolve Foundry document subtypes from the ACTIVE Game System.
 * No game-specific identifiers (character/npc/content/etc.) are inferred by RTA.
 * A unique advertised subtype may be inferred. Ambiguous choices require an explicit mapping.
 */
export function availableDocumentTypes(documentName,{system=globalThis.game?.system,config=globalThis.CONFIG}={}) {
  const declared=system?.documentTypes?.[documentName];
  const types=Array.isArray(declared)?declared
    :declared&&typeof declared==="object"?Object.keys(declared)
    :Object.keys(config?.[documentName]?.dataModels??{});
  return [...new Set(types.filter(type=>typeof type==="string"&&type.trim().length))];
}

/** The Game System's own word for a subtype (CONFIG.<Document>.typeLabels), or the subtype itself. */
export function documentTypeLabel(documentName,type,{config=globalThis.CONFIG,i18n=globalThis.game?.i18n}={}) {
  const key=config?.[documentName]?.typeLabels?.[type];
  return key?(i18n?.localize?.(key)??key):type;
}

export function resolveDocumentType(documentName,{requestedType=null,system=globalThis.game?.system,config=globalThis.CONFIG}={}) {
  const types=availableDocumentTypes(documentName,{system,config});
  if(requestedType!==null&&requestedType!==undefined&&requestedType!=="") {
    if(!types.includes(requestedType))throw new Error(`Unsupported ${documentName} document type: ${requestedType}. Available: ${types.join(", ")||"none"}.`);
    return requestedType;
  }
  if(!types.length)throw new Error(`The active Game System exposes no ${documentName} document type.`);
  if(types.length===1)return types[0];
  throw new Error(`Select a subtype for ${documentName} documents in Rule Them'All: ${types.join(", ")}.`);
}

/** Where the ACTIVE Game System keeps a document's description, or null when it has none.
 * Read from the subtype's DataModel (`description` string or `description.value`), else from template.json. */
export function descriptionPath(documentName,type,{config=globalThis.CONFIG,model=globalThis.game?.model}={}) {
  const field=config?.[documentName]?.dataModels?.[type]?.schema?.fields?.description;
  if(field)return field.fields?.value?"system.description.value":field.fields?null:"system.description";
  const legacy=model?.[documentName]?.[type]?.description;
  if(typeof legacy==="string")return "system.description";
  return legacy&&typeof legacy==="object"&&typeof legacy.value==="string"?"system.description.value":null;
}
