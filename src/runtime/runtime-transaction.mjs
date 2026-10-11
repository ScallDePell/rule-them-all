import {copyJSON} from "../configurator/configurator-schema.mjs";
import {normalizeRuntimeContainerRef} from "./runtime-contracts.mjs";

/** Ledger entries kept per container; older ones are evicted (retention, not edition). */
export const LEDGER_LIMIT=200;
export const TRANSACTION_ERRORS=Object.freeze({conflict:"RUNTIME_CONFLICT",forbidden:"RUNTIME_FORBIDDEN",needsGM:"RUNTIME_NEEDS_GM",failed:"TRANSACTION_FAILED",compensation:"COMPENSATION_REFUSED"});

export class RuntimeTransactionError extends Error{
  constructor(code,message,details={}){super(message,details.cause?{cause:details.cause}:undefined);this.name="RuntimeTransactionError";this.code=code;this.details=details;}
}

const containerKey=ref=>ref.uuid??`${ref.kind}:${ref.id}`;
const newId=prefix=>`${prefix}-${globalThis.crypto?.randomUUID?.()??`${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
const same=(a,b)=>JSON.stringify(a??null)===JSON.stringify(b??null);

/** Business changes between two RuntimeStates: one row per DefinitionState and StateInstance. */
export function diffRuntimeStates(before,after){
  const changes=[];
  for(const id of new Set([...Object.keys(before?.definitionStates??{}),...Object.keys(after?.definitionStates??{})])){
    const from=before?.definitionStates?.[id]??null,to=after?.definitionStates?.[id]??null;
    if(!same(from,to))changes.push({scope:"definition",id,before:copyJSON(from),after:copyJSON(to)});
  }
  const instances=list=>new Map((list??[]).map(instance=>[instance.id,instance]));
  const from=instances(before?.stateInstances),to=instances(after?.stateInstances);
  for(const id of new Set([...from.keys(),...to.keys()]))
    if(!same(from.get(id),to.get(id)))changes.push({scope:"stateInstance",id,before:copyJSON(from.get(id)??null),after:copyJSON(to.get(id)??null)});
  return changes;
}

/** Put the `before` (or `after`) side of ledger changes back into a RuntimeState. */
export function applyLedgerChanges(state,changes,side="before"){
  for(const change of changes){
    const value=copyJSON(change[side]);
    if(change.scope==="definition"){if(value===null)delete state.definitionStates[change.id];else state.definitionStates[change.id]=value;continue;}
    const index=state.stateInstances.findIndex(instance=>instance.id===change.id);
    if(value===null){if(index>=0)state.stateInstances.splice(index,1);}
    else if(index>=0)state.stateInstances[index]=value;else state.stateInstances.push(value);
  }
  return state;
}

/** CP-08 transaction: PREPARE (load/stage) -> VALIDATE (revisions, permissions) -> COMMIT -> ledger.
 * Foundry has no multi-document ACID: each container is written in one Document update
 * (state + ledger), and a failed write compensates the containers already written. */
export class RuntimeTransaction{
  #adapter;#authorize;#staged=new Map();
  /** authorize(ref, changes) throws when the business permission (CP-11) refuses a change. */
  constructor(adapter,{kind,rulesetVersionId,transactionId=null,summary=null,corrects=null,userId=globalThis.game?.user?.id??null,authorize=null}={}){
    if(!kind)throw new Error("RuntimeTransaction requires a kind.");
    this.#adapter=adapter;this.kind=String(kind);this.rulesetVersionId=String(rulesetVersionId??"");
    this.id=transactionId?String(transactionId):newId("tx");this.summary=summary;this.corrects=corrects;this.userId=userId;this.#authorize=authorize;
  }
  /** Working copy of a container; the revision read here is the one the commit expects. */
  async load(containerRef){
    const ref=normalizeRuntimeContainerRef(containerRef),key=containerKey(ref);
    if(!this.#staged.has(key)){const state=await this.#adapter.load(ref,{rulesetVersionId:this.rulesetVersionId});this.#staged.set(key,{ref,state,expected:state.runtimeRevision});}
    return this.#staged.get(key).state;
  }
  /** Stage a state prepared elsewhere (an Action preview) against the revision it was read at. */
  stage(containerRef,state,expectedRevision=state.runtimeRevision){
    const ref=normalizeRuntimeContainerRef(containerRef);this.#staged.set(containerKey(ref),{ref,state,expected:expectedRevision});return state;
  }
  get containers(){return [...this.#staged.values()].map(entry=>copyJSON(entry.ref));}
  async commit(){
    const adapter=this.#adapter,writes=[];
    for(const {ref,state,expected} of this.#staged.values()){
      const current=await adapter.load(ref,{rulesetVersionId:this.rulesetVersionId}),ledger=await adapter.loadLedger(ref);
      const done=ledger.filter(entry=>entry.transactionId===this.id);
      if(done.length)return {transactionId:this.id,duplicate:true,entries:copyJSON(done)};
      if(current.runtimeRevision!==expected)throw new RuntimeTransactionError(TRANSACTION_ERRORS.conflict,`Runtime container changed since it was read (revision ${current.runtimeRevision}, expected ${expected}).`,{ref,expected,actual:current.runtimeRevision});
      const changes=diffRuntimeStates(current,state);
      if(!changes.length&&current.rulesetVersionId===state.rulesetVersionId)continue;
      await this.#authorize?.(ref,changes);
      // Allowed by the rules but not by Foundry: only the GM client can write this Document.
      if(!await adapter.canWrite(ref))throw new RuntimeTransactionError(TRANSACTION_ERRORS.needsGM,"Runtime target can only be written by the GM client.",{ref});
      const next={...copyJSON(state),runtimeRevision:current.runtimeRevision+1};
      const entry={id:newId("ledger"),transactionId:this.id,kind:this.kind,rulesetVersionId:this.rulesetVersionId,at:Date.now(),worldTime:globalThis.game?.time?.worldTime??null,userId:this.userId,summary:copyJSON(this.summary),revision:next.runtimeRevision,changes,corrects:this.corrects};
      writes.push({ref,previous:current,previousLedger:ledger,next,ledger:[...ledger,entry].slice(-LEDGER_LIMIT),entry});
    }
    const written=[];
    try{for(const write of writes){await adapter.write(write.ref,{state:write.next,ledger:write.ledger});written.push(write);}}
    catch(cause){
      // Compensation: put the previous content back, with a newer revision so stale writers still conflict.
      const failures=[];
      for(const write of written.reverse()){
        try{await adapter.write(write.ref,{state:{...copyJSON(write.previous),runtimeRevision:write.next.runtimeRevision+1},ledger:write.previousLedger});}
        catch(failure){failures.push({ref:write.ref,message:failure?.message??String(failure)});}
      }
      throw new RuntimeTransactionError(TRANSACTION_ERRORS.failed,`Runtime transaction failed: ${cause?.message??cause}`,{cause,compensated:!failures.length,compensationFailures:failures});
    }
    for(const write of writes)this.stage(write.ref,write.next,write.next.runtimeRevision);
    return {transactionId:this.id,duplicate:false,entries:writes.map(write=>copyJSON(write.entry))};
  }
}
