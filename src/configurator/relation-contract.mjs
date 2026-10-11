/** Portable, cross-family Ruleset relations missed by individual business registries.
 * These edges are used by both deletion protection and aggregate validation.
 * IDs always refer to entries in this Ruleset, never Foundry document IDs.
 */
import {COLLECTION_FIELDS,isRecord} from './configurator-schema.mjs';

export const COLLECTION_TO_KIND=Object.freeze(Object.fromEntries(COLLECTION_FIELDS.map(collection=>[
  collection,collection.endsWith('ies')?`${collection.slice(0,-3)}y`:collection.endsWith('s')?collection.slice(0,-1):collection
])));

const add=(edges,consumer,target,kind,path)=>{
  if(typeof target?.objectKind!=='string'||!target.objectKind.trim()||typeof target?.objectId!=='string'||!target.objectId.trim())return;
  edges.push({consumerRef:{objectKind:consumer.objectKind,objectId:consumer.objectId},targetRef:{...target},kind,path,strength:'required'});
};

/** Searches only explicit logical-reference records, not arbitrary id/name strings. */
function visitRefs(value,path,consumer,edges,seen){
  if(Array.isArray(value))return value.forEach((part,i)=>visitRefs(part,`${path}[${i}]`,consumer,edges,seen));
  if(!isRecord(value))return;
  if(typeof value.objectKind==='string'&&typeof value.objectId==='string'&&value.objectId.trim()){
    const key=`${path}|${value.objectKind}|${value.objectId}`;
    if(!seen.has(key)){seen.add(key);add(edges,consumer,value,'logicalReference',path);}
    // The reference itself is atomic. Extra keys describe capability/output slots.
    return;
  }
  for(const [field,part] of Object.entries(value))visitRefs(part,`${path}.${field}`,consumer,edges,seen);
}

export function collectCrossFamilyRelations(ruleset={}){
  const edges=[];
  for(const collection of COLLECTION_FIELDS){
    const entries=ruleset[collection];if(!Array.isArray(entries))continue;
    for(const [index,entry] of entries.entries()){
      if(!isRecord(entry)||typeof entry.id!=='string'||!entry.id.trim())continue;
      const consumer={objectKind:COLLECTION_TO_KIND[collection],objectId:entry.id};
      const root=`${collection}[${index}]`;
      // DefinitionType belongs to the same Ruleset and must not be deleted when
      // a configured Definition still requires it.
      if(collection==='definitions'&&entry.definitionTypeId){
        add(edges,consumer,{objectKind:'definitionType',objectId:entry.definitionTypeId},'definitionType',`${root}.definitionTypeId`);
      }
      if(collection==='creationSystems'){
        for(const [i,step] of (entry.steps??[]).entries()){
          const source=step?.source;
          if(!isRecord(source)||!source.collection)continue;
          const objectKind=COLLECTION_TO_KIND[source.collection];
          // Unknown collections are not silently mapped to a fictitious kind;
          // schema validation reports the unsupported collection separately.
          if(!objectKind)continue;
          for(const [j,id] of (source.objectIds??[]).entries()){
            add(edges,consumer,{objectKind,objectId:id},'creationSource',`${root}.steps[${i}].source.objectIds[${j}]`);
          }
        }
      }
      // A typed logical reference can be nested in Definition/Content data,
      // progression tracks, policies or future generic extension fields.
      // This is independent of their concrete editor or JSON serialization.
      const seen=new Set();
      for(const [key,value] of Object.entries(entry)){
        if(key==='id'||key==='source'&&collection==='creationSystems')continue;
        visitRefs(value,`${root}.${key}`,consumer,edges,seen);
      }
    }
  }
  return edges;
}
