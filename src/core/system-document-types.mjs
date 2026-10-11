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
