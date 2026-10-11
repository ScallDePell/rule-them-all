import {resolveDocumentType} from "../core/system-document-types.mjs";
import {MODULE_ID} from "../core/module-contract.mjs";
import {copyJSON} from "../configurator/configurator-schema.mjs";
import {createRuntimeState,normalizeRuntimeContainerRef,prepareRuntimeState} from "./runtime-contracts.mjs";


const FLAG_KEY="runtimeState";

export class FoundryRuntimeAdapter{
  async resolveDocument(ref){
    const n=normalizeRuntimeContainerRef(ref);
    if(n.uuid){const doc=await globalThis.fromUuid?.(n.uuid);if(!doc)throw new Error(`Foundry Document not found: ${n.uuid}.`);return doc;}
    const collection=n.kind==="actor"?game.actors:n.kind==="item"?game.items:null;
    const doc=collection?.get?.(n.id);if(!doc)throw new Error(`Foundry ${n.kind} not found: ${n.id}.`);return doc;
  }
  async load(ref,{rulesetVersionId=""}={}){const doc=await this.resolveDocument(ref);const stored=doc.getFlag?.(MODULE_ID,FLAG_KEY);return prepareRuntimeState(stored??createRuntimeState({rulesetVersionId}),{rulesetVersionId});}
  async canWrite(ref,user=game.user){const doc=await this.resolveDocument(ref);if(typeof doc.canUserModify==="function")return doc.canUserModify(user,"update");if(typeof doc.testUserPermission==="function"&&globalThis.CONST?.DOCUMENT_OWNERSHIP_LEVELS)return doc.testUserPermission(user,CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER);return Boolean(user?.isGM);}
  async save(ref,state){const doc=await this.resolveDocument(ref);if(!await this.canWrite(ref))throw new Error(`User cannot update Foundry Document ${doc.name??doc.id}.`);await doc.setFlag(MODULE_ID,FLAG_KEY,copyJSON(state));return copyJSON(state);}
  async saveMany(entries){
    // Foundry-first: use native Document updates. If all operations can be represented as a batch,
    // later adapters may use foundry.documents.modifyBatch without changing the Core contract.
    const out=[];for(const entry of entries)out.push(await this.save(entry.ref,entry.state));return out;
  }
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
