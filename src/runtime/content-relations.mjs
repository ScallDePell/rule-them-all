/** Generic Content acquisition semantics:
 * link -> reference-only association;
 * unlock -> selectable/available reference, not owned;
 * grant -> owned logical entitlement, for EVERY Ruleset family.
 * Optional handlers add actual side effects (Definition state, Action use).
 * Other families have NO implicit side effects, but their ownership is queryable.
 */
import {normalizeRelations} from '../configurator/generic-relations.mjs';
import {copyJSON} from '../configurator/configurator-schema.mjs';

/** Handler outputs are intentionally constrained to the existing documented
 * Runtime primitives. New game behavior needs a separately tested executor. */
export class ContentGrantHandlers {
  #handlers=new Map();
  constructor(){
    this.register('definition',(relation,plan)=>{
      plan.definitionBindings.push({definitionId:relation.targetRef.objectId,initial:copyJSON(relation.config?.initial??{})});
    });
    this.register('action',(relation,plan)=>{
      plan.actionIds.push(relation.targetRef.objectId);
    });
  }
  register(objectKind,prepare){
    if(typeof objectKind!=='string'||!objectKind.trim()||typeof prepare!=='function')throw new TypeError('Grant handler requires an objectKind and prepare function.');
    if(this.#handlers.has(objectKind))throw new Error(`Grant handler already registered: ${objectKind}.`);
    this.#handlers.set(objectKind,prepare);
  }
  registeredKinds(){return [...this.#handlers.keys()];}
  prepare(ruleset,relations){
    const normalized=normalizeRelations(relations??[],{ruleset});
    const plan={definitionBindings:[],actionIds:[],linkedRefs:[],unlockedRefs:[],grantedRefs:[]};
    for(const relation of normalized){
      const ref=copyJSON(relation.targetRef);
      if(relation.operation==='link'){plan.linkedRefs.push(ref);continue;}
      if(relation.operation==='unlock'){plan.unlockedRefs.push(ref);continue;}
      const handler=this.#handlers.get(ref.objectKind);
      // Generic grant always persists the entitlement. A registered Runtime
      // handler may additionally implement a concrete behavior for this kind.
      if(handler)handler(relation,plan);
      plan.grantedRefs.push(ref);
    }
    return plan;
  }
}
export function listAcquisitionReferences(records,versionId,field){
  const seen=new Set(),out=[];
  for(const record of Object.values(records??{})){
    if(!record||record.versionId!==versionId)continue;
    for(const ref of record[field]??[]){
      const key=JSON.stringify([ref?.objectKind,ref?.objectId]);
      if(!ref?.objectKind||!ref?.objectId||seen.has(key))continue;
      seen.add(key);out.push(copyJSON(ref));
    }
  }
  return out;
}
