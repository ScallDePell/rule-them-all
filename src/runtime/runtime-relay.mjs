import {MODULE_ID} from "../core/module-contract.mjs";
import {RuntimeTransactionError} from "./runtime-transaction.mjs";

/** Runtime writes a player may ask the GM client to perform (CP-11): Foundry runs no module
 * code on the server, so a Document the player does not own is written by the active GM. */
export const RELAYED_METHODS=Object.freeze(["runChatAction","writeSheetValue","instantiateDefinition","removeDefinitionState","setDefinitionState","addCollectionEntry","removeCollectionEntry","transferCollectionEntry","initializeContainer","rebindContainer","executeAction","rerollAction","chooseActions","advance","applyMilestones","compensate","acquire","setContentField","releaseContent","removeStateInstance","expireStates","emitEvent"]);
export const RELAY_ERRORS=Object.freeze({noGM:"RUNTIME_GM_UNAVAILABLE",timeout:"RUNTIME_RELAY_TIMEOUT",method:"RUNTIME_RELAY_METHOD"});

/** engine -> the last relayed call it served, which the next one waits for. */
const served=new WeakMap();

/** GM side: replay the call with the rules checked for the requesting user, never for the GM. Calls from several
 * players are served one after the other, so two players striking the same Actor both count. */
export function serveRuntimeRelay(engine,{method,args,userId}){
  if(!RELAYED_METHODS.includes(method))return Promise.reject(new RuntimeTransactionError(RELAY_ERRORS.method,`Runtime method cannot be relayed: ${method}.`,{method}));
  if(typeof userId!=="string"||!userId)return Promise.reject(new Error("Runtime relay request requires the requesting user id."));
  const run=(served.get(engine)??Promise.resolve()).then(()=>engine.forUser(userId)[method](...(Array.isArray(args)?args:[])));
  served.set(engine,run.catch(()=>{}));
  return run;
}

const errorPayload=error=>({message:error?.message??String(error),code:error?.code??null});
const errorFrom=payload=>Object.assign(new Error(payload?.message??"Runtime relay failed."),{code:payload?.code??null});
const REQUESTS="relay",ANSWERS="relayAnswer";
const REQUEST_ID=/^[A-Za-z0-9_-]{1,80}$/;
/** Requests and answers are stored as JSON text: Foundry expands dotted keys inside an update, which would change a
 * value whose keys hold dots (Document uuids). */
const parsed=text=>{try{const value=typeof text==="string"?JSON.parse(text):null;return value&&typeof value==="object"?value:null;}catch{return null;}};
const entriesOf=(changed,key)=>Object.entries(changed?.flags?.[MODULE_ID]?.[key]??{}).filter(([id,text])=>typeof text==="string"&&REQUEST_ID.test(id));
/** An update that removes flags.rule-them-all.<key>.<id>: ForcedDeletion since Foundry v14 (the "-=id" syntax is deprecated there). */
function removal(key,id){
  const ForcedDeletion=globalThis.foundry?.data?.operators?.ForcedDeletion;
  return ForcedDeletion?[`flags.${MODULE_ID}.${key}.${id}`,new ForcedDeletion()]:[`flags.${MODULE_ID}.${key}.-=${id}`,null];
}

/** Transport between a player's client and the active GM's, through the requester's User document only.
 *
 * Foundry does not say who sent a module socket message, so neither a request nor an answer travels on the socket.
 * The requester writes the request in their own User document (flags.rule-them-all.relay.<id>): Foundry's server lets
 * only that user (or a GM) write it, and names the author in the updateUser hook. The GM serves a request only when
 * that author is the User it was written in, and never for a GM; any other request is removed unserved. The GM
 * writes the answer in the same User document (flags.rule-them-all.relayAnswer.<id>), and the requester takes it only
 * when the updateUser author is a GM, then removes both. */
export class FoundryUserRelay{
  #pending=new Map();
  constructor({users=globalThis.game?.users,user=()=>globalThis.game?.user,hooks=globalThis.Hooks,timeout=15000}={}){this.users=users;this.user=user;this.hooks=hooks;this.timeout=timeout;}
  listen(serve){
    this.hooks.on("updateUser",(user,changed,_options,authorId)=>{
      if(user?.id===this.user()?.id)for(const [id,text] of entriesOf(changed,ANSWERS))this.#answer(id,text,authorId);
      if(this.users?.activeGM?.isSelf)for(const [id,text] of entriesOf(changed,REQUESTS))this.#serve(serve,user,authorId,id,text);
    });
  }
  #answer(id,text,authorId){
    // An answer counts only when a GM wrote it: another player can write nothing in this User document.
    const pending=this.#pending.get(id),answer=parsed(text);
    if(!pending||!answer||!this.users?.get?.(authorId)?.isGM)return;
    this.#pending.delete(id);clearTimeout(pending.timer);
    return answer.ok?pending.resolve(answer.result):pending.reject(errorFrom(answer.error));
  }
  async #serve(serve,user,authorId,id,text){
    const request=parsed(text);
    // Only the user themself writes a request, and a GM never needs one: anything else is removed, unserved.
    if(!request||authorId!==user.id||user.isGM||!user.active)return Promise.resolve(user.update(Object.fromEntries([removal(REQUESTS,id)]))).catch(()=>{});
    let answer;
    try{answer={ok:true,result:await serve({method:request.method,args:request.args,userId:user.id})};}
    catch(error){answer={ok:false,error:errorPayload(error)};}
    await Promise.resolve(user.update({[`flags.${MODULE_ID}.${ANSWERS}.${id}`]:JSON.stringify(answer)})).catch(error=>console.error("Rule Them'All | Relay answer",error));
  }
  request(method,args){
    const user=this.user();
    if(!this.users?.activeGM)return Promise.reject(new RuntimeTransactionError(RELAY_ERRORS.noGM,"This change needs a connected GM.",{method}));
    const id=globalThis.crypto?.randomUUID?.()??`${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const forget=()=>Promise.resolve(user.update(Object.fromEntries([removal(REQUESTS,id),removal(ANSWERS,id)]))).catch(()=>{});
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{this.#pending.delete(id);reject(new RuntimeTransactionError(RELAY_ERRORS.timeout,"The GM client did not answer.",{method}));},this.timeout);
      this.#pending.set(id,{resolve,reject,timer});
      Promise.resolve(user.update({[`flags.${MODULE_ID}.${REQUESTS}.${id}`]:JSON.stringify({method,args})})).catch(error=>{clearTimeout(timer);this.#pending.delete(id);reject(error);});
    }).finally(forget);
  }
}
