import {resolveDocumentType} from "../core/system-document-types.mjs";
import {MODULE_ID} from "../core/module-contract.mjs";
import {copyJSON} from "../configurator/configurator-schema.mjs";
import {createRuntimeState,normalizeRuntimeContainerRef,prepareRuntimeState} from "./runtime-contracts.mjs";
import {OWNERSHIP_LEVELS,PERMISSION_ROLES} from "../configurator/permission-contract.mjs";


const FLAG_KEY="runtimeState";
const LEDGER_KEY="runtimeLedger";
/** Foundry v14 forced replacement of an object value inside an update. */
const replaced=value=>{const operator=globalThis.foundry?.data?.operators?.ForcedReplacement;if(typeof operator?.create!=="function")throw new Error("Foundry ForcedReplacement operator is unavailable.");return operator.create(value);};

export class FoundryRuntimeAdapter{
  async resolveDocument(ref){
    const n=normalizeRuntimeContainerRef(ref);
    if(n.uuid){const doc=await globalThis.fromUuid?.(n.uuid);if(!doc)throw new Error(`Foundry Document not found: ${n.uuid}.`);return doc;}
    const collection=n.kind==="actor"?game.actors:n.kind==="item"?game.items:null;
    const doc=collection?.get?.(n.id);if(!doc)throw new Error(`Foundry ${n.kind} not found: ${n.id}.`);return doc;
  }
  async load(ref,{rulesetVersionId=""}={}){const doc=await this.resolveDocument(ref);const stored=doc.getFlag?.(MODULE_ID,FLAG_KEY);return prepareRuntimeState(stored??createRuntimeState({rulesetVersionId}),{rulesetVersionId});}
  /** Physical permission of this client: Foundry only lets a Document owner (or a GM) update it. */
  async canWrite(ref,user=game.user){const doc=await this.resolveDocument(ref);if(typeof doc.canUserModify==="function")return doc.canUserModify(user,"update");if(typeof doc.testUserPermission==="function"&&globalThis.CONST?.DOCUMENT_OWNERSHIP_LEVELS)return doc.testUserPermission(user,CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER);return Boolean(user?.isGM);}
  /** PermissionPolicy subject (CP-11): Foundry role and ownership of a user on the container. */
  async subject(ref,userId=game.user?.id){
    const user=game.users?.get?.(userId);if(!user)throw new Error(`Foundry User not found: ${userId}.`);
    const doc=ref?await this.resolveDocument(ref):null,level=Number(doc?.getUserLevel?.(user)??(user.isGM?3:0));
    return {userId:user.id,role:PERMISSION_ROLES[Math.min(Math.max(Number(user.role)-1,0),PERMISSION_ROLES.length-1)],isGM:Boolean(user.isGM),ownership:OWNERSHIP_LEVELS[Math.min(Math.max(level,0),OWNERSHIP_LEVELS.length-1)]};
  }
  worldTime(){return Number(game.time?.worldTime??0);}
  roundSeconds(){return Number(CONFIG.time?.roundTime??6);}
  /** World Actors, their Items and world Items that hold runtime data. */
  async listContainers(){return [...(game.actors??[]).flatMap(actor=>[actor,...(actor.items??[])]),...(game.items??[])].filter(doc=>doc.getFlag?.(MODULE_ID,FLAG_KEY)).map(doc=>({uuid:doc.uuid}));}
  async loadLedger(ref){const doc=await this.resolveDocument(ref);const stored=doc.getFlag?.(MODULE_ID,LEDGER_KEY);return Array.isArray(stored)?copyJSON(stored):[];}
  /** One Document update carries the state and its ledger, so each container is written atomically.
   * The state replaces the stored object: a merge would keep removed DefinitionStates. */
  async write(ref,{state,ledger}){
    const doc=await this.resolveDocument(ref);if(!await this.canWrite(ref))throw new Error(`User cannot update Foundry Document ${doc.name??doc.id}.`);
    await doc.update({[`flags.${MODULE_ID}.${FLAG_KEY}`]:replaced(copyJSON(state)),[`flags.${MODULE_ID}.${LEDGER_KEY}`]:copyJSON(ledger)});
    return copyJSON(state);
  }
  /** Remove a container's runtime data (e.g. stale or unreadable state); the next initialization starts fresh. */
  async reset(ref){const doc=await this.resolveDocument(ref);if(!await this.canWrite(ref))throw new Error(`User cannot update Foundry Document ${doc.name??doc.id}.`);await doc.unsetFlag?.(MODULE_ID,FLAG_KEY);await doc.unsetFlag?.(MODULE_ID,LEDGER_KEY);}
  async describe(ref){const doc=await this.resolveDocument(ref);return {ref:normalizeRuntimeContainerRef(ref),uuid:doc.uuid,id:doc.id,name:doc.name,documentName:doc.documentName,type:doc.type};}


  async createTestActors({sourceType=null,targetType=null}={}){
    const ActorClass=globalThis.Actor;if(!ActorClass?.create)throw new Error("Foundry Actor.create API is unavailable.");
    const selectedSourceType=resolveDocumentType("Actor",{requestedType:sourceType});
    const selectedTargetType=resolveDocumentType("Actor",{requestedType:targetType});
    const ensure=async(name,type,role)=>{
      let actor=game.actors?.find?.(a=>a.getFlag?.(MODULE_ID,"runtimeTestActorRole")===role);
      if(actor){
        if(((role==="source"&&sourceType)||(role==="target"&&targetType))&&actor.type!==type)
          throw new Error(`Runtime Lab test Actor ${actor.name} already has type ${actor.type}, requested ${type}.`);
        return actor;
      }
      actor=await ActorClass.create({name,type,flags:{[MODULE_ID]:{runtimeTestActor:true,runtimeTestActorRole:role}}});
      return actor;
    };
    const source=await ensure("Rule Them'All - Source Test",selectedSourceType,"source");
    const target=await ensure("Rule Them'All - Target Test",selectedTargetType,"target");
    const describe=actor=>({uuid:actor.uuid,id:actor.id,name:actor.name,type:actor.type});
    return {source:describe(source),target:describe(target)};
  }

  async roll(formula,data={}){
    const RollClass=globalThis.Roll??globalThis.foundry?.dice?.Roll;
    if(!RollClass)throw new Error("Foundry Roll API is unavailable.");
    const roll=new RollClass(String(formula??""),copyJSON(data??{}));
    await roll.evaluate();
    const first=roll.dice?.[0]?.results?.find?.(r=>r.active!==false)?.result;
    return {formula:String(roll.formula??formula??""),result:String(roll.result??roll.total??""),total:Number(roll.total),natural:Number.isFinite(Number(first))?Number(first):null};
  }
  async createStateEffect(ref,{name,definitionId,stateInstanceId,disabled=false,duration=null}={}){
    const doc=await this.resolveDocument(ref);
    if(typeof doc.createEmbeddedDocuments!=="function")return null;
    try{
      const [effect]=await doc.createEmbeddedDocuments("ActiveEffect",[{name:name||definitionId||"Rule State",disabled,changes:[],duration:duration??{},flags:{[MODULE_ID]:{stateInstanceId,definitionId}}}]);
      return effect?.uuid??effect?.id??null;
    }catch{return null;}
  }
}
