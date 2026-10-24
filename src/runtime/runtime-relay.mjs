import {MODULE_ID} from "../core/module-contract.mjs";
import {RuntimeTransactionError} from "./runtime-transaction.mjs";

/** Runtime writes a player may ask the GM client to perform (CP-11): Foundry runs no module
 * code on the server, so a Document the player does not own is written by the active GM. */
export const RELAYED_METHODS=Object.freeze(["runChatAction","writeSheetValue","instantiateDefinition","removeDefinitionState","setDefinitionState","addCollectionEntry","removeCollectionEntry","transferCollectionEntry","initializeContainer","rebindContainer","executeAction","rerollAction","chooseActions","advance","applyMilestones","compensate","acquire","setContentField","releaseContent","removeStateInstance","expireStates"]);
export const RELAY_ERRORS=Object.freeze({noGM:"RUNTIME_GM_UNAVAILABLE",timeout:"RUNTIME_RELAY_TIMEOUT",method:"RUNTIME_RELAY_METHOD",sender:"RUNTIME_RELAY_SENDER"});

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
const RELAY_FLAG="relay";
const REQUEST_ID=/^[A-Za-z0-9_-]{1,80}$/;

/** Transport between a player's client and the active GM's.
 *
 * Foundry does not say who sent a module socket message, so a request on the socket could claim any user. A request
 * is therefore written in the requester's own User document (flags.rule-them-all.relay.<id>): Foundry's server lets
 * only that user (or a GM) write it, and names the author in the updateUser hook. The GM serves a request only when
 * that author is the User it was written in, and never for a GM (a GM writes without the relay). The answer comes
 * back on the module socket, to the requester only; the requester then removes its request. */
export class FoundrySocketRelay{
  #pending=new Map();
  constructor({socket=globalThis.game?.socket,users=globalThis.game?.users,user=()=>globalThis.game?.user,hooks=globalThis.Hooks,timeout=15000,channel=`module.${MODULE_ID}`}={}){this.socket=socket;this.users=users;this.user=user;this.hooks=hooks;this.timeout=timeout;this.channel=channel;}
  listen(serve){
    this.socket.on(this.channel,message=>{
      if(message?.type!=="response"||message.to!==this.user()?.id)return;
      const pending=this.#pending.get(message.id);if(!pending)return;
      this.#pending.delete(message.id);clearTimeout(pending.timer);
      return message.ok?pending.resolve(message.result):pending.reject(errorFrom(message.error));
    });
    this.hooks.on("updateUser",(user,changed,_options,authorId)=>{
      if(!this.users?.activeGM?.isSelf)return;
      const requests=changed?.flags?.[MODULE_ID]?.[RELAY_FLAG];
      if(!requests||typeof requests!=="object")return;
      for(const [id,request] of Object.entries(requests)){
        if(id.startsWith("-=")||!REQUEST_ID.test(id)||!request||typeof request!=="object")continue;
        this.#serve(serve,user,authorId,id,request);
      }
    });
  }
  async #serve(serve,user,authorId,id,{method,args}){
    let response;
    try{
      // Only the user themself wrote this request, and a GM never needs one: anything else is refused.
      if(authorId!==user.id||user.isGM||!user.active)throw new RuntimeTransactionError(RELAY_ERRORS.sender,"This change was not asked by the user it names.",{method,userId:user.id,authorId});
      response={ok:true,result:await serve({method,args,userId:user.id})};
    }catch(error){response={ok:false,error:errorPayload(error)};}
    this.socket.emit(this.channel,{type:"response",id,to:user.id,...response});
  }
  request(method,args){
    const user=this.user();
    if(!this.users?.activeGM)return Promise.reject(new RuntimeTransactionError(RELAY_ERRORS.noGM,"This change needs a connected GM.",{method}));
    const id=globalThis.crypto?.randomUUID?.()??`${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const forget=()=>Promise.resolve(user.update({[`flags.${MODULE_ID}.${RELAY_FLAG}.-=${id}`]:null})).catch(()=>{});
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{this.#pending.delete(id);reject(new RuntimeTransactionError(RELAY_ERRORS.timeout,"The GM client did not answer.",{method}));},this.timeout);
      this.#pending.set(id,{resolve,reject,timer});
      Promise.resolve(user.update({[`flags.${MODULE_ID}.${RELAY_FLAG}.${id}`]:{method,args}})).catch(error=>{clearTimeout(timer);this.#pending.delete(id);reject(error);});
    }).finally(forget);
  }
}
