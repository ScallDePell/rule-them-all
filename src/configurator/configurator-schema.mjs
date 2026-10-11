// Clean Rule Them'All portable aggregate. No legacy business families are part of Core.
export const ENGINE_CONTRACT_VERSION = 3;
export const COLLECTION_FIELDS = Object.freeze([
  "definitionTypes", "definitions", "parameters", "formulas", "formulaBindings", "conditions", "rolls", "outcomes", "tests", "effects", "actions",
  "permissionPolicies", "eventTypes", "triggers", "contentTypes", "contentTemplates", "modifiers", "restrictions", "durations", "creationSystems", "progressionSystems", "sheetDefinitions", "tags", "references"
]);
export const RULESET_FIELDS = Object.freeze([
  "id", "nameKey", "descriptionKey", "version", "revision", "engineContractVersion", "status", "color", "sectionColors", "sectionColorOverrides", "familyColors", ...COLLECTION_FIELDS
]);

export function isRecord(value) {
  return value !== null && typeof value === "object" && [Object.prototype, null].includes(Object.getPrototypeOf(value));
}

export function copyJSON(value, ancestors = new Set()) {
  if (value === null || ["string", "boolean"].includes(typeof value)) return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (!Array.isArray(value) && !isRecord(value)) throw new TypeError("Expected plain JSON data.");
  if (ancestors.has(value)) throw new TypeError("Circular JSON data.");
  ancestors.add(value);
  const result = Array.isArray(value) ? [] : {};
  const keys = Reflect.ownKeys(value).filter(key => !(Array.isArray(value) && key === "length"));
  if (Array.isArray(value) && keys.length !== value.length) throw new TypeError("Expected a dense JSON array.");
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (typeof key !== "string" || !descriptor.enumerable || !("value" in descriptor)) throw new TypeError("Expected enumerable JSON properties without accessors.");
    if (Array.isArray(value) && !/^(0|[1-9]\d*)$/.test(key)) throw new TypeError("Unexpected array property.");
    Object.defineProperty(result, key, {value: copyJSON(descriptor.value, ancestors), enumerable: true, writable: true, configurable: true});
  }
  ancestors.delete(value);
  return result;
}


export function normalizeRulesetCollections(data) {
  if (!isRecord(data)) throw new TypeError("Ruleset data must be an object.");
  const result = copyJSON(data);
  for (const key of COLLECTION_FIELDS) {
    if (!Object.hasOwn(result, key)) result[key] = [];
  }
  // Tags became a first-class Ruleset catalog in 0.6.1. Existing 0.6.x data used
  // the same stable strings directly on entries, so adopt those strings once as
  // catalog identities instead of invalidating the current World.
  const knownTags=new Set((result.tags??[]).map(tag=>tag?.id).filter(Boolean));
  const referenced=[];
  for(const collection of COLLECTION_FIELDS){
    if(collection==="tags")continue;
    for(const entry of result[collection]??[])for(const id of entry?.tags??[])if(typeof id==="string"&&id.trim()&&!knownTags.has(id)){knownTags.add(id);referenced.push(id);}
  }
  for(const [index,id] of referenced.entries())result.tags.push({id,nameKey:id,descriptionKey:"",enabled:true,order:(result.tags.length+index+1)*10,color:null});
  // ContentTypeDefinition became first-class in 0.7.0. Adopt legacy template
  // contentTypeId strings as neutral catalog entries so current Worlds remain editable.
  const knownContentTypes=new Set((result.contentTypes??[]).map(entry=>entry?.id).filter(Boolean));
  for(const template of result.contentTemplates??[]){
    const id=template?.contentTypeId;
    if(typeof id!=="string"||!id.trim()||knownContentTypes.has(id))continue;
    knownContentTypes.add(id);
    result.contentTypes.push({id,nameKey:id,descriptionKey:"",image:"",color:null,enabled:true,order:(result.contentTypes.length+1)*10,storageKind:"item",documentSubtype:"",runtimeMode:"unique",fields:{},tags:[]});
  }
  return result;
}

export function createRulesetData(data) {
  if (!isRecord(data)) throw new TypeError("Ruleset data must be an object.");
  const input = copyJSON(data);
  const collections = Object.fromEntries(COLLECTION_FIELDS.map(key => [key, []]));
  return {descriptionKey: "", engineContractVersion: ENGINE_CONTRACT_VERSION, color:null, sectionColors:{}, sectionColorOverrides:{}, familyColors: {}, ...collections, ...input, revision: 0, status: "draft"};
}
