/** Common logical relations for every Ruleset collection.
 * A link is metadata; an unlock is an entitlement; an award is an executable
 * operation ONLY when a Runtime handler exists. These are never synonyms.
 * All targets are schema-derived stable Ruleset IDs, not Foundry document IDs.
 */
import {COLLECTION_FIELDS,copyJSON,isRecord} from './configurator-schema.mjs';
import {COLLECTION_TO_KIND} from './relation-contract.mjs';
import {refToken,parseRefToken} from './reference-token.mjs';

export const RELATION_OPERATIONS=Object.freeze(['link','unlock','grant']);
const KIND_TO_COLLECTION=Object.freeze(Object.fromEntries(Object.entries(COLLECTION_TO_KIND).map(([collection,kind])=>[kind,collection])));
const supported=new Set(RELATION_OPERATIONS);
const str=value=>typeof value==='string'&&value.trim().length>0;
export function relationCatalog(ruleset={}, {exclude=null}={}){
  const out=[];
  for(const collection of COLLECTION_FIELDS){
    const objectKind=COLLECTION_TO_KIND[collection];
    for(const entry of ruleset[collection]??[]){
      if(!str(entry?.id))continue;
      if(exclude?.objectKind===objectKind&&exclude?.objectId===entry.id)continue;
      out.push({objectKind,objectId:entry.id,collection,label:`${entry.nameKey??entry.key??entry.id}`,family:objectKind,entry});
    }
  }
  return out;
}
export function normalizeRelation(value,{known=null}={}){
  if(!isRecord(value)||!str(value.id)||!supported.has(value.operation))throw new Error('Relation requires id and a supported operation.');
  const target=value.targetRef;
  if(!isRecord(target)||!str(target.objectKind)||!str(target.objectId))throw new Error(`Relation ${value.id} requires a typed target reference.`);
  if(known&&!(known.get(target.objectKind)?.has(target.objectId)))throw new Error(`Relation ${value.id} references a missing target: ${target.objectKind}/${target.objectId}.`);
  if(value.config!==undefined&&!isRecord(value.config))throw new Error(`Relation ${value.id} config must be an object.`);
  return {...copyJSON(value),targetRef:copyJSON(target),config:copyJSON(value.config??{})};
}
export function normalizeRelations(relations,{ruleset=null}={}){
  if(!Array.isArray(relations))throw new Error('Relations must be an array.');
  const known=ruleset?new Map(COLLECTION_FIELDS.map(collection=>[
    COLLECTION_TO_KIND[collection],new Set((ruleset[collection]??[]).map(x=>x?.id))
  ])):null;
  const ids=new Set();
  return relations.map(value=>{
    const relation=normalizeRelation(value,{known});
    if(ids.has(relation.id))throw new Error(`Duplicate relation ID: ${relation.id}.`);
    ids.add(relation.id);
    return relation;
  });
}
/** Persistent model is preserved, including extension configuration. */
export function collectRelationRows(rows,existing=[]){
  const original=new Map((existing??[]).map(x=>[x.id,x]));
  const updated=[];
  for(const row of rows){
    const id=String(row.dataset?.relationId??'').trim();
    const operation=String(row.querySelector('[data-relation-operation]')?.value??'').trim();
    const token=String(row.querySelector('[data-relation-target]')?.value??'').trim();
    const targetRef=parseRefToken(token);
    const stored=original.get(id)??{};
    const source=row.querySelector('[data-relation-config]');
    let config=stored.config??{};
    if(source){const text=String(source.value??'').trim();config=text?JSON.parse(text):{};}
    updated.push(normalizeRelation({...stored,id,operation,targetRef,config}));
  }
  return normalizeRelations(updated);
}
export function relationRowModel(relation,catalog,optionColors=()=>[],language='en'){
  const targetToken=refToken(relation.targetRef??{});
  return {id:relation.id,operation:relation.operation,configJson:JSON.stringify(relation.config??{},null,2),
    operationChoices:RELATION_OPERATIONS.map(id=>({id,selected:id===relation.operation,isLink:id==='link',isUnlock:id==='unlock',colors:'#666666'})),
    targetChoices:[{token:'',label:'—',colors:'#666666',selected:!relation.targetRef?.objectId},...catalog.map(target=>({
      token:refToken(target),label:`${target.objectKind} · ${target.label}`,
      selected:refToken(target)===targetToken,colors:optionColors(target.objectKind,target.entry)
    }))]};
}

/** Resolve stored relationships from ANY Ruleset family without switching on
 * Definition/Content/Action. Resolution reads the current Ruleset snapshot and
 * never implies ownership or execution. */
export function resolveRulesetRelations(ruleset,sourceRef,{operation=null}={}){
  const collection=KIND_TO_COLLECTION[sourceRef?.objectKind];
  if(!collection||!str(sourceRef?.objectId))throw new Error('Source must be a typed Ruleset reference.');
  const source=(ruleset?.[collection]??[]).find(entry=>entry?.id===sourceRef.objectId);
  if(!source)throw new Error(`Unknown relation source: ${sourceRef.objectKind}/${sourceRef.objectId}.`);
  const typed=normalizeRelations(source.relations??[],{ruleset});
  return typed.filter(relation=>operation===null||relation.operation===operation).map(relation=>{
    const targetCollection=KIND_TO_COLLECTION[relation.targetRef.objectKind];
    const target=(ruleset[targetCollection]??[]).find(entry=>entry?.id===relation.targetRef.objectId);
    if(!target)throw new Error(`Missing relation target: ${relation.targetRef.objectKind}/${relation.targetRef.objectId}.`);
    return {relation,sourceRef:copyJSON(sourceRef),targetCollection,target:copyJSON(target)};
  });
}
