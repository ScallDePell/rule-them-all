import {copyJSON} from "../configurator/configurator-schema.mjs";
import {createRuntimeState,normalizeRuntimeContainerRef,prepareRuntimeState} from "./runtime-contracts.mjs";

const key=ref=>{const n=normalizeRuntimeContainerRef(ref);return n.uuid??`${n.kind}:${n.id}`;};
export class MemoryRuntimeAdapter{
  constructor(){this.states=new Map();this.ledgers=new Map();}
  async load(ref,{rulesetVersionId=""}={}){const k=key(ref);return prepareRuntimeState(this.states.get(k)??createRuntimeState({rulesetVersionId}),{rulesetVersionId});}
  async loadLedger(ref){return copyJSON(this.ledgers.get(key(ref))??[]);}
  /** One container write: state and ledger together (a Document update in Foundry). */
  async write(ref,{state,ledger}){const k=key(ref);this.states.set(k,copyJSON(state));this.ledgers.set(k,copyJSON(ledger));return copyJSON(state);}
  async canWrite(){return true;}
  async reset(ref){this.states.delete(key(ref));this.ledgers.delete(key(ref));}
  async roll(formula,data={}){const n=Number(String(formula??"").trim());if(Number.isFinite(n))return {formula:String(formula),result:String(n),total:n,natural:n};throw new Error("MemoryRuntimeAdapter only supports a numeric literal roll expression in tests.");}
  async describe(ref){const n=normalizeRuntimeContainerRef(ref);return {ref:n,name:n.uuid??`${n.kind}:${n.id}`};}
}
