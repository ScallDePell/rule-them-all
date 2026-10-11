import {copyJSON} from "../configurator/configurator-schema.mjs";
import {createRuntimeState,normalizeRuntimeContainerRef,prepareRuntimeState} from "./runtime-contracts.mjs";

const key=ref=>{const n=normalizeRuntimeContainerRef(ref);return n.uuid??`${n.kind}:${n.id}`;};
export class MemoryRuntimeAdapter{
  constructor(){this.states=new Map();}
  async load(ref,{rulesetVersionId=""}={}){const k=key(ref);return prepareRuntimeState(this.states.get(k)??createRuntimeState({rulesetVersionId}),{rulesetVersionId});}
  async save(ref,state){this.states.set(key(ref),copyJSON(state));return copyJSON(state);}
  async saveMany(entries){for(const {ref,state} of entries)await this.save(ref,state);return entries.map(x=>copyJSON(x.state));}
  async canWrite(){return true;}
  async roll(formula,data={}){const n=Number(String(formula??"").trim());if(Number.isFinite(n))return {formula:String(formula),result:String(n),total:n,natural:n};throw new Error("MemoryRuntimeAdapter only supports a numeric literal roll expression in tests.");}
  async describe(ref){const n=normalizeRuntimeContainerRef(ref);return {ref:n,name:n.uuid??`${n.kind}:${n.id}`};}
}
