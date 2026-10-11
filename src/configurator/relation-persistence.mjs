/** A successful API save must not silently discard a relation, its operation,
 * its parameters, or the meaning of any acquisition choice. */
import {COLLECTION_TO_KIND} from './relation-contract.mjs';
import {DependencyIndex} from './dependency-index.mjs';

const KIND_TO_COLLECTION=Object.freeze(Object.fromEntries(Object.entries(COLLECTION_TO_KIND).map(([collection,kind])=>[kind,collection])));
function signatures(kind,entry){
 const collection=KIND_TO_COLLECTION[kind];
 if(!collection)throw new Error(`Unsupported relation source kind: ${kind}`);
 return new DependencyIndex({[collection]:[entry]}).list()
   .map(edge=>`${edge.path}\u0000${edge.targetRef.objectKind}\u0000${edge.targetRef.objectId}`).sort();
}
function typedOperations(entry){
 const rels=(entry?.relations??[])
   .map(r=>JSON.stringify({id:r.id,operation:r.operation,targetRef:r.targetRef,config:r.config??{}})).sort();
 const choices=(entry?.choiceGroups??[]).map(group=>({
   id:group.id,min:group.min,max:group.max,
   options:(group.options??[]).map(o=>JSON.stringify({
     id:o.id,operation:o.operation??null,targetRef:o.targetRef??null,config:o.config??null
   })).sort()
 })).sort((a,b)=>String(a.id).localeCompare(String(b.id)));
 return JSON.stringify({rels,choices});
}
export function assertPersistedRelations(kind,submitted,persisted){
 if(!persisted)throw new Error(`Saved ${kind} was not available for readback.`);
 if(typedOperations(submitted)!==typedOperations(persisted)){
   const error=new Error(`Saved ${kind} changed or lost a relation operation, target, parameter or acquisition choice.`);
   error.code='RELATION_PERSISTENCE_MISMATCH';
   throw error;
 }
 const expected=signatures(kind,submitted);
 const actual=new Set(signatures(kind,persisted));
 const missing=expected.filter(relation=>!actual.has(relation));
 if(missing.length){
  const error=new Error(`Saved ${kind} lost ${missing.length} relation(s) after persistence. Please do not continue editing this Ruleset.`);
  error.code='RELATION_PERSISTENCE_MISMATCH';
  error.missingRelations=missing;
  throw error;
 }
 return true;
}
