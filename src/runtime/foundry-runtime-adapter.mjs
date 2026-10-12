import {applyTurnChange} from "./foundry-initiative.mjs";
import {registerRulesetDice} from "./foundry-dice.mjs";
import {resolveDocumentType} from "../core/system-document-types.mjs";
import {MODULE_ID} from "../core/module-contract.mjs";
import {copyJSON} from "../configurator/configurator-schema.mjs";
import {createRuntimeState,normalizeRuntimeContainerRef,prepareRuntimeState} from "./runtime-contracts.mjs";
import {foundryDice} from "./dice-results.mjs";
import {OWNERSHIP_LEVELS,PERMISSION_ROLES} from "../configurator/permission-contract.mjs";


const FLAG_KEY="runtimeState";
const LEDGER_KEY="runtimeLedger";
/** Foundry v14 forced replacement of an object value inside an update. */
const replaced=value=>{const operator=globalThis.foundry?.data?.operators?.ForcedReplacement;if(typeof operator?.create!=="function")throw new Error("Foundry ForcedReplacement operator is unavailable.");return operator.create(value);};

const WORLD_SETTING="worldRuntime";
/** The world container: its state and ledger live in a hidden world setting that only a GM may write. */
const worldDocument=()=>({id:"world",name:game.world?.title??"World",documentName:"World",
  getFlag:(_scope,key)=>copyJSON(game.settings.get(MODULE_ID,WORLD_SETTING)?.[key]??null)??undefined,
  canUserModify:user=>Boolean(user?.isGM),getUserLevel:user=>user?.isGM?3:2,
  async writeRuntime(values){await game.settings.set(MODULE_ID,WORLD_SETTING,{...(game.settings.get(MODULE_ID,WORLD_SETTING)??{}),...copyJSON(values)});},
  async clearRuntime(){await game.settings.set(MODULE_ID,WORLD_SETTING,{});}});

export class FoundryRuntimeAdapter{
  static registerSettings(settings){settings.register(MODULE_ID,WORLD_SETTING,{scope:"world",config:false,type:Object,default:{}});}
  /** The combat in progress, as a container: its shared Definitions (an escalation die) live in its flags. */
  activeCombat(){const combat=game.combat;return combat?.started?{kind:"combat",id:combat.id}:null;}
  /** An Action moved a combatant (Action.turnOrder) in the combat in progress. */
  async changeTurnOrder(ref,change){const combat=game.combat;if(!combat?.started)return false;return applyTurnChange(combat,normalizeRuntimeContainerRef(ref).uuid,change);}
  async resolveDocument(ref){
    const n=normalizeRuntimeContainerRef(ref);
    if(n.uuid){const doc=await globalThis.fromUuid?.(n.uuid);if(!doc)throw new Error(`Foundry Document not found: ${n.uuid}.`);return doc;}
    if(n.kind==="world")return worldDocument();
    const collection=n.kind==="actor"?game.actors:n.kind==="item"?game.items:n.kind==="combat"?game.combats:null;
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
  /** The token of an Actor on the viewed scene (a linked Actor's first token, or the token itself). */
  async #token(ref){const doc=await this.resolveDocument(ref);const token=doc.documentName==="Token"?doc.object:doc.getActiveTokens?.()?.[0]??doc.token?.object;return token??null;}
  /** Distance between two Actors' tokens, in the scene's units (canvas grid measurement). */
  async distance(a,b){const [p,q]=[await this.#token(a),await this.#token(b)];if(!p||!q)return NaN;return Number(canvas.grid.measurePath([p.center,q.center]).distance);}
  /** Other tokens within a distance of an Actor's token; allies share its disposition. */
  async nearby(ref,within,side="any"){
    const me=await this.#token(ref);if(!me)return NaN;
    return (canvas.tokens?.placeables??[]).filter(t=>t!==me&&!t.document.hidden&&(side==="any"||(side==="ally")===(t.document.disposition===me.document.disposition))&&Number(canvas.grid.measurePath([me.center,t.center]).distance)<=within).length;
  }
  /** The Actors of the tokens the current user targets, for an Action on several targets (context.targets). */
  userTargets(){return [...new Set([...(game.user?.targets??[])].map(token=>token.actor?.uuid).filter(Boolean))];}
  /** World Actors, their Items and world Items that hold runtime data. */
  async listContainers(){
    const documents=[...(game.actors??[]).flatMap(actor=>[actor,...(actor.items??[])]),...(game.items??[])].filter(doc=>doc.getFlag?.(MODULE_ID,FLAG_KEY)).map(doc=>({uuid:doc.uuid}));
    const shared=[...(worldDocument().getFlag(MODULE_ID,FLAG_KEY)?[{kind:"world",id:"world"}]:[]),...[...(game.combats??[])].filter(combat=>combat.getFlag?.(MODULE_ID,FLAG_KEY)).map(combat=>({kind:"combat",id:combat.id}))];
    return [...documents,...shared];
  }
  async loadLedger(ref){const doc=await this.resolveDocument(ref);const stored=doc.getFlag?.(MODULE_ID,LEDGER_KEY);return Array.isArray(stored)?copyJSON(stored):[];}
  /** One Document update carries the state and its ledger, so each container is written atomically.
   * The state replaces the stored object: a merge would keep removed DefinitionStates. */
  async write(ref,{state,ledger}){
    const doc=await this.resolveDocument(ref);if(!await this.canWrite(ref))throw new Error(`User cannot update Foundry Document ${doc.name??doc.id}.`);
    if(doc.writeRuntime){await doc.writeRuntime({[FLAG_KEY]:state,[LEDGER_KEY]:ledger});return copyJSON(state);}
    await doc.update({[`flags.${MODULE_ID}.${FLAG_KEY}`]:replaced(copyJSON(state)),[`flags.${MODULE_ID}.${LEDGER_KEY}`]:copyJSON(ledger)});
    return copyJSON(state);
  }
  /** Remove a container's runtime data (e.g. stale or unreadable state); the next initialization starts fresh. */
  async reset(ref){const doc=await this.resolveDocument(ref);if(!await this.canWrite(ref))throw new Error(`User cannot update Foundry Document ${doc.name??doc.id}.`);if(doc.clearRuntime)return doc.clearRuntime();await doc.unsetFlag?.(MODULE_ID,FLAG_KEY);await doc.unsetFlag?.(MODULE_ID,LEDGER_KEY);}
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

  /** dice: the Ruleset's own dice the formula may throw (2dp), registered under their letters first. */
  async roll(formula,data={},{dice=[],rulesetKey="ruleset"}={}){
    const RollClass=globalThis.Roll??globalThis.foundry?.dice?.Roll;
    if(!RollClass)throw new Error("Foundry Roll API is unavailable.");
    if(dice.length)registerRulesetDice(rulesetKey,dice);
    const roll=new RollClass(String(formula??""),copyJSON(data??{}));
    await roll.evaluate();
    const first=roll.dice?.[0]?.results?.find?.(r=>r.active!==false)?.result;
    return {formula:String(roll.formula??formula??""),result:String(roll.result??roll.total??""),total:Number(roll.total),natural:Number.isFinite(Number(first))?Number(first):null,dice:foundryDice(roll)};
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
