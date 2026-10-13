import {MODULE_ID} from "../core/module-contract.mjs";
import {RuntimeTransactionError} from "./runtime-transaction.mjs";

/** Runtime writes a player may ask the GM client to perform (CP-11): Foundry runs no module
 * code on the server, so a Document the player does not own is written by the active GM. */
export const RELAYED_METHODS=Object.freeze(["writeSheetValue","instantiateDefinition","removeDefinitionState","setDefinitionState","addCollectionEntry","removeCollectionEntry","transferCollectionEntry","initializeContainer","rebindContainer","executeAction","rerollAction","chooseActions","advance","applyMilestones","compensate","acquire","setContentField","releaseContent","removeStateInstance","expireStates"]);
export const RELAY_ERRORS=Object.freeze({noGM:"RUNTIME_GM_UNAVAILABLE",timeout:"RUNTIME_RELAY_TIMEOUT",method:"RUNTIME_RELAY_METHOD"});

/** GM side: replay the call with the rules checked for the requesting user, never for the GM. */
export async function serveRuntimeRelay(engine,{method,args,userId}){
  if(!RELAYED_METHODS.includes(method))throw new RuntimeTransactionError(RELAY_ERRORS.method,`Runtime method cannot be relayed: ${method}.`,{method});
  if(typeof userId!=="string"||!userId)throw new Error("Runtime relay request requires the requesting user id.");
  return engine.forUser(userId)[method](...(Array.isArray(args)?args:[]));
}

const errorPayload=error=>({message:error?.message??String(error),code:error?.code??null});
const errorFrom=payload=>Object.assign(new Error(payload?.message??"Runtime relay failed."),{code:payload?.code??null});

/** Module socket transport. Messages are broadcast; only the active GM answers a request,
 * and only the requester resolves the matching response. */
export class FoundrySocketRelay{
  #pending=new Map();
  constructor({socket=globalThis.game?.socket,users=globalThis.game?.users,user=()=>globalThis.game?.user,timeout=15000,channel=`module.${MODULE_ID}`}={}){this.socket=socket;this.users=users;this.user=user;this.timeout=timeout;this.channel=channel;}
  listen(serve){
    this.socket.on(this.channel,async message=>{
      if(message?.type==="response"){if(message.to!==this.user()?.id)return;const pending=this.#pending.get(message.id);if(!pending)return;this.#pending.delete(message.id);clearTimeout(pending.timer);return message.ok?pending.resolve(message.result):pending.reject(errorFrom(message.error));}
      if(message?.type!=="request"||!this.users?.activeGM?.isSelf)return;
      let response;
      try{response={ok:true,result:await serve(message)};}catch(error){response={ok:false,error:errorPayload(error)};}
      this.socket.emit(this.channel,{type:"response",id:message.id,to:message.userId,...response});
    });
  }
  request(method,args){
    if(!this.users?.activeGM)return Promise.reject(new RuntimeTransactionError(RELAY_ERRORS.noGM,"This change needs a connected GM.",{method}));
    const id=globalThis.crypto?.randomUUID?.()??`${Date.now()}-${Math.random().toString(36).slice(2)}`;
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{this.#pending.delete(id);reject(new RuntimeTransactionError(RELAY_ERRORS.timeout,"The GM client did not answer.",{method}));},this.timeout);
      this.#pending.set(id,{resolve,reject,timer});
      this.socket.emit(this.channel,{type:"request",id,userId:this.user()?.id,method,args});
    });
  }
}
