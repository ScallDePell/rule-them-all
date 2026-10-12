import {copyJSON} from "../configurator/configurator-schema.mjs";
import {createRuntimeState,normalizeRuntimeContainerRef,prepareRuntimeState} from "./runtime-contracts.mjs";

const key=ref=>{const n=normalizeRuntimeContainerRef(ref);return n.uuid??`${n.kind}:${n.id}`;};
export class MemoryRuntimeAdapter{
  /** Tests act as the GM unless they switch currentUserId; ownership is keyed "container|user". */
  constructor(){this.states=new Map();this.ledgers=new Map();this.users=new Map([["gm",{role:"gamemaster",isGM:true}]]);this.ownership=new Map();this.currentUserId="gm";}
  async subject(ref,userId=this.currentUserId){const user=this.users.get(userId);if(!user)throw new Error(`User not found: ${userId}.`);return {userId,role:user.role,isGM:Boolean(user.isGM),ownership:user.isGM?"owner":ref?this.ownership.get(`${key(ref)}|${userId}`)??"none":"none"};}
  async load(ref,{rulesetVersionId=""}={}){const k=key(ref);return prepareRuntimeState(this.states.get(k)??createRuntimeState({rulesetVersionId}),{rulesetVersionId});}
  async loadLedger(ref){return copyJSON(this.ledgers.get(key(ref))??[]);}
  /** One container write: state and ledger together (a Document update in Foundry). */
  async write(ref,{state,ledger}){const k=key(ref);this.states.set(k,copyJSON(state));this.ledgers.set(k,copyJSON(ledger));return copyJSON(state);}
  /** Token positions for tests: key -> {x, y, disposition}; distance is straight-line. */
  async distance(a,b){const p=this.positions?.get(key(a)),q=this.positions?.get(key(b));return p&&q?Math.hypot(p.x-q.x,p.y-q.y):NaN;}
  async nearby(ref,within,side="any"){const me=this.positions?.get(key(ref));if(!me)return NaN;let n=0;for(const [k,p] of this.positions)if(k!==key(ref)&&Math.hypot(p.x-me.x,p.y-me.y)<=within&&(side==="any"||(side==="ally")===(p.disposition===me.disposition)))n++;return n;}
  /** The combat in progress ({kind: "combat", id}), set by tests. */
  activeCombat(){return this.combat??null;}
  /** World clock for Durations, in seconds; tests move it by hand. */
  worldTime(){return this.clock??0;}
  roundSeconds(){return 6;}
  async listContainers(){return [...this.states.keys()].map(k=>k.includes(":")&&!k.includes(".")?{kind:k.slice(0,k.indexOf(":")),id:k.slice(k.indexOf(":")+1)}:{uuid:k});}
  async canWrite(ref){const subject=await this.subject(ref);return subject.isGM||subject.ownership==="owner";}
  async reset(ref){this.states.delete(key(ref));this.ledgers.delete(key(ref));}
  async roll(formula,data={}){const n=Number(String(formula??"").trim());if(Number.isFinite(n))return {formula:String(formula),result:String(n),total:n,natural:n};throw new Error("MemoryRuntimeAdapter only supports a numeric literal roll expression in tests.");}
  async describe(ref){const n=normalizeRuntimeContainerRef(ref);return {ref:n,name:n.uuid??`${n.kind}:${n.id}`};}
}
