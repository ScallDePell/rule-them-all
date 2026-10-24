import {RUNTIME_HOOKS} from "../core/module-contract.mjs";
import {copyJSON} from "../configurator/configurator-schema.mjs";
import {validateTypedValue} from "../configurator/value-type-registry.mjs";
import {CONSTRAINT_KINDS,evaluateConstraints} from "../configurator/declarative-contracts.mjs";
import {capabilityTypeRegistry} from "../configurator/capability-type-registry.mjs";
import {createDefinitionState,normalizeRuntimeContainerRef,resolveRuntimeRuleset} from "./runtime-contracts.mjs";
import {RuntimeEvaluator} from "./runtime-evaluator.mjs";
import {RuntimeTransaction,RuntimeTransactionError,TRANSACTION_ERRORS,applyLedgerChanges} from "./runtime-transaction.mjs";
import {resolvePermission} from "./permission-policy.mjs";
import {applyModifierStack,createModifierState,createStateInstance,durationEnded,hasDurations,removeModifierStates,removeStateInstance,startDuration} from "./runtime-states.mjs";
import {toRuntimeReference,resolveContainer} from "./runtime-reference.mjs";
import {effectOperationRegistry} from "../configurator/operation-registries.mjs";
import {assertSafeRollFormula,multiplyDice,resolveRollData} from "../configurator/roll-grammar.mjs";
import {findSlot, slotInitialKey} from "../configurator/capability-slots.mjs";
import {systemEventType} from "../configurator/system-events.mjs";
import {rerollSomeDice} from "./dice-results.mjs";
import {writeSheetValue} from "./sheet-writes.mjs";
import {LAYOUT_NOTE_LENGTH as NOTE_LENGTH} from "../configurator/layout-contract.mjs";
import {SLOT_CAPABILITIES,requireSlot,poolSlotState,collectionSlotState,boundPoolValue,initialSlotStates,prepareCollectionEntry,assertCollectionRoom,assertCollectionMinimum} from "./capability-slot-runtime.mjs";

const clone=v=>copyJSON(v);
/** A use that is only previewed or refused: its result without the staged states and the live context (an
 * undefined value is no JSON, so it could not be copied into the event of a Trigger that ran it). */
/** adapter -> the module event in progress on its containers, which the next one waits for. */
const systemEvents=new WeakMap();
const withoutStaging=({staged:_staged,context:_context,...result})=>result;
const roleRef=(context,role)=>context?.roles?.[role]??null;
/** The dice of one Action use, carried by its context under a symbol (never cloned nor stored):
 * {log: [{formula, roll}], keep: Map formula -> [roll]}. A replay that keeps the dice takes back a logged roll of the same formula. */
const DICE=Symbol("rta.dice");
/** The roles seen from the other side: the target acts on the former self (a reaction). */
/** The context of what follows a Test: its variables (variables.test, with the Outcome). */
const withTestResult=(context,testResult)=>testResult?{...context,variables:{...(context.variables??{}),...testResult.variables,test:{...testResult.variables.test,outcome:testResult.outcome}}}:context;
// Each Effect of an Action use is read by the next ones under variables.effects.<id> (before, after, operand): the damage dealt heals the attacker, the ammunition loaded leaves the reserve.
const withEffectResult=(context,change)=>change?.effectId?{...context,variables:{...(context.variables??{}),effects:{...(context.variables?.effects??{}),[change.effectId]:{before:clone(change.before??null),after:clone(change.after??null),operand:clone(change.operand??null)}}}}:context;
const swapRoles=context=>{const self=roleRef(context,"self"),target=roleRef(context,"target");return {...context,roles:{...(context.roles??{}),self:target,source:target,target:self,subject:self},defaultRole:"self"};};
/** A context as it can be kept and replayed later: no event, cause or dice. */
const plainContext=context=>clone(Object.fromEntries(Object.entries(context).filter(([key])=>key!=="event"&&key!=="cause")));
const enabled=(entry)=>entry&&entry.enabled!==false;
const byOrder=(entries)=>[...(entries??[])].sort((a,b)=>(a.order??0)-(b.order??0));
/** A value base moved from current to next within its bounds; a base already past a bound may move back but not further.
 * current null: a new base, held within both bounds. */
const boundValue=(current,next,{minimum,maximum})=>{
  let value=Number(next);
  if(maximum!==null&&value>maximum&&(current===null||value>current))value=current===null?maximum:Math.max(maximum,Number(current));
  if(minimum!==null&&value<minimum&&(current===null||value<current))value=current===null?minimum:Math.min(minimum,Number(current));
  return value;
};
/** The containers every use can reach besides the Actors: the world, and the combat in progress. */
export const WORLD_CONTAINER=Object.freeze({kind:"world",id:"world"});
const holderOf=ref=>ref?.kind==="world"?"world":ref?.kind==="combat"?"combat":"actor";
const appliedByActions=new WeakMap();
/** A Modifier that no Action applies is passive: it changes value.final wherever its Conditions are true.
 * A Modifier an Action applies only lives as the ModifierStates that Action creates. */
function passiveModifiers(ruleset,reference){
  if(!appliedByActions.has(ruleset))appliedByActions.set(ruleset,new Set((ruleset.actions??[]).flatMap(action=>[...(action.modifierApplications??[]).map(row=>row?.modifierRef),...(action.stateApplications??[]).flatMap(row=>row?.modifierRefs??[])])));
  const applied=appliedByActions.get(ruleset);
  return (ruleset.modifiers??[]).filter(modifier=>{if(!enabled(modifier)||applied.has(modifier.id))return false;const t=modifier.targetRef??{};return t.objectKind===reference.objectKind&&t.objectId===reference.objectId&&(t.capabilityId??"value")==="value"&&(t.outputId??"value.final")==="value.final";});
}
const stackRow=m=>({id:m.id,operation:m.operation,value:Number(m.operand??0),priority:Number(m.priority??0),stacking:m.stackingPolicy});
const activeStates=ds=>(ds?.modifiers??[]).filter(m=>m?.active!==false&&(m.targetRef?.outputId??"value.final")==="value.final");
/** Before instantiation, validate the source definition's configured contract.
 * Unknown legacy rules remain inert and reported by configurator validation. */
function assertDefinitionContract(ruleset,definition){
  const type=ruleset.definitionTypes?.find(item=>item.id===definition.definitionTypeId);
  if(!type)throw new Error(`DefinitionType unavailable for ${definition.id}.`);
  const constraints=(type.constraints??[]).filter(rule=>CONSTRAINT_KINDS.includes(rule?.kind));
  const failures=evaluateConstraints(constraints,{...definition.data,relations:definition.relations??[]});
  if(failures.length)throw new Error(`Definition contract failed for ${definition.id}: ${failures.map(e=>e.message).join('; ')}`);
}


export class RuntimeEngine{
  #creating;
  /** userId: the user the rules are checked for (null = the adapter's current user). */
  constructor({configurator,adapter,hooks=globalThis.Hooks,rulesetSource="published",userId=null,creating=new Set()}={}){if(!configurator)throw new Error("RuntimeEngine requires configurator API.");if(!adapter)throw new Error("RuntimeEngine requires a runtime adapter.");this.configurator=configurator;this.adapter=adapter;this.hooks=hooks;this.rulesetSource=rulesetSource;this.userId=userId;this.#creating=creating;}
  ruleset(versionId){return resolveRuntimeRuleset(this.configurator,versionId,{source:this.rulesetSource});}
  /** Same engine, checking the rules for another user (the GM serving a player's request). */
  forUser(userId){return new RuntimeEngine({configurator:this.configurator,adapter:this.adapter,hooks:this.hooks,rulesetSource:this.rulesetSource,userId,creating:this.#creating});}
  /** The world and current combat roles, unless the caller set them. */
  #shared(context={}){
    const roles=context.roles??{};if(roles.world&&(roles.combat||!this.adapter.activeCombat))return context;
    const combat=roles.combat??this.adapter.activeCombat?.()??null;
    return {...context,roles:{...roles,world:roles.world??WORLD_CONTAINER,...(combat?{combat}:{})}};
  }
  /** Instantiate the world's shared Definitions, and a combat's when one is given ({kind: "combat", id}). */
  async initializeShared(versionId,{combat=null}={}){
    const shared=this.ruleset(versionId).sharedDefinitions??{},out={};
    for(const [holder,ref] of [["world",WORLD_CONTAINER],["combat",combat]]){
      const ids=shared[holder]??[];if(!ref||!ids.length)continue;
      const state=await this.adapter.load(ref);if(state.rulesetVersionId&&state.rulesetVersionId!==versionId)continue;
      out[holder]=(await this.initializeContainer(versionId,ref,{definitionIds:ids})).created;
    }
    return out;
  }
  #subject(ref){return this.adapter.subject(ref?normalizeRuntimeContainerRef(ref):null,this.userId??undefined);}
  /** Who this engine's user is for an Actor's sheet: "gm", "player" (an owner) or "observer" (anyone else). */
  async viewer(ref){const subject=await this.#subject(ref);return subject?.isGM?"gm":subject?.ownership==="owner"?"player":"observer";}
  /** CP-11 decision for one operation on one Ruleset object, for this engine's user on a container. */
  async authorize(versionId,operation,target,containerRef=null,context=null,{asOwner=false}={}){
    const seen=await this.#subject(containerRef),evaluator=this.evaluator(versionId);
    // An allowed Action reaches its other containers (its target) as if this user owned them: ownership no longer
    // stops it, the Ruleset's Permissions on what it writes still do.
    const subject=asOwner&&seen&&!seen.isGM?{...seen,ownership:"owner"}:seen;
    const conditionContext=context??(containerRef?{roles:{self:normalizeRuntimeContainerRef(containerRef)},defaultRole:"self"}:{});
    // A Definition is also in its definitionType's scope, a Content Template in its contentType's.
    const ruleset=this.ruleset(versionId),typeId=target?.objectKind==="definition"?ruleset.definitions?.find(x=>x.id===target.objectId)?.definitionTypeId:target?.objectKind==="contentTemplate"?ruleset.contentTemplates?.find(x=>x.id===target.objectId)?.contentTypeId:null;
    const typed=typeId?{...target,typeRef:{objectKind:target.objectKind==="definition"?"definitionType":"contentType",objectId:typeId}}:target;
    return resolvePermission(ruleset.permissionPolicies,{operation,target:typed,subject,condition:id=>evaluator.condition(id,conditionContext)});
  }
  async #require(versionId,operation,target,containerRef,context=null,options={}){
    const decision=await this.authorize(versionId,operation,target,containerRef,context,options);
    if(!decision.allowed)throw new RuntimeTransactionError(TRANSACTION_ERRORS.forbidden,decision.messageKey?globalThis.game?.i18n?.localize?.(decision.messageKey)??decision.messageKey:`Permission denied: ${operation} ${target.objectKind} ${target.objectId}.`,{operation,target,decision});
    return decision;
  }
  /** Only the DefinitionStates this user may read are returned (CP-11: never sent, then hidden). */
  async getContainerState(ref,{rulesetVersionId=""}={}){
    const n=normalizeRuntimeContainerRef(ref),state=await this.adapter.load(n,{rulesetVersionId});
    if(!state.rulesetVersionId||!this.#hasRuleset(state.rulesetVersionId))return state;
    const readable=new Map();
    const canRead=async definitionId=>{if(!readable.has(definitionId))readable.set(definitionId,(await this.authorize(state.rulesetVersionId,"read",{objectKind:"definition",objectId:definitionId},n)).allowed);return readable.get(definitionId);};
    for(const definitionId of Object.keys(state.definitionStates))if(!await canRead(definitionId))delete state.definitionStates[definitionId];
    const instances=[];for(const instance of state.stateInstances)if(await canRead(instance.definitionId))instances.push(instance);
    state.stateInstances=instances;
    return state;
  }
  #hasRuleset(versionId){try{this.ruleset(versionId);return true;}catch{return false;}}
  /** Containers being built by a Creation System: the creation's own rules bound what it writes, so the Ruleset's
     write Permissions (meant for play, such as "only the GM changes characteristics") do not apply to it.
     The values' bounds hold for the character built, not along the way: an age penalty taken before the free points
     is not lost to the minimum, so the bonuses and penalties of the steps add up first and are bounded once at the end. */
  async duringCreation(ref,build){
    const container=normalizeRuntimeContainerRef(ref),key=this.#refKey(container);
    this.#creating.add(key);
    try{const result=await build();await this.#settleCreationBounds(container);return result;}finally{this.#creating.delete(key);}
  }
  /** Every value base of a container just built, held within its bounds. */
  async #settleCreationBounds(ref){
    const versionId=(await this.adapter.load(ref))?.rulesetVersionId;
    if(!versionId||!this.#hasRuleset(versionId))return;
    const tx=this.transaction(versionId,"creation.bounds",{summary:{}}),state=await tx.load(ref);let changed=false;
    for(const [definitionId,ds] of Object.entries(state.definitionStates??{})){
      const value=ds?.capabilityStates?.value;if(!value)continue;
      const base=Number(value.base??0),bounded=boundValue(null,base,await this.#stagedValueBounds(versionId,ref,state,definitionId));
      if(bounded!==base){value.base=bounded;changed=true;}
    }
    if(changed)await this.#commit(tx);
  }
  /** Every persistent runtime write goes through one transaction (CP-08, CP-18). */
  transaction(versionId,kind,{transactionId=null,summary=null,corrects=null,actor=null}={}){
    const target=change=>change.scope==="note"?{objectKind:"sheetNote",objectId:change.id}:change.scope==="content"?{objectKind:"contentTemplate",objectId:(change.after??change.before)?.templateId}:{objectKind:"definition",objectId:change.scope==="definition"?change.id:(change.after??change.before)?.definitionId};
    const authorize=async(ref,changes)=>{const key=this.#refKey(normalizeRuntimeContainerRef(ref));if(this.#creating.has(key))return;const asOwner=Boolean(actor)&&key!==this.#refKey(normalizeRuntimeContainerRef(actor));for(const change of changes)await this.#require(versionId,"write",target(change),ref,null,{asOwner});};
    const prepare=(ref,state)=>this.#followMaxima(versionId,ref,state);
    return new RuntimeTransaction(this.adapter,{kind,rulesetVersionId:versionId,transactionId,summary,corrects,authorize,prepare,...(this.userId?{userId:this.userId}:{})});
  }
  /** Ledger entries of a container, keeping only the changes this user may read. */
  async getLedger(containerRef){
    const ref=normalizeRuntimeContainerRef(containerRef),ledger=await this.adapter.loadLedger(ref),out=[];
    for(const entry of ledger){
      if(!this.#hasRuleset(entry.rulesetVersionId)){out.push(entry);continue;}
      const changes=[];for(const change of entry.changes){const definitionId=change.scope==="definition"?change.id:(change.after??change.before)?.definitionId;if(!definitionId||(await this.authorize(entry.rulesetVersionId,"read",{objectKind:"definition",objectId:definitionId},ref)).allowed)changes.push(change);}
      out.push({...entry,changes});
    }
    return out;
  }
  /** Containers a call may write: where this client needs the GM when Foundry refuses the update. */
  writeTargets(method,args){
    const [versionId]=args;
    if(method==="executeAction"&&args[2]!==undefined)args=[args[0],args[1],this.#shared(args[2]),...args.slice(3)];
    if(method==="transferCollectionEntry")return [args[1]?.from?.containerRef,args[1]?.to?.containerRef].filter(Boolean).map(normalizeRuntimeContainerRef);
    if(method==="acquire"){const ref=normalizeRuntimeContainerRef(args[1]),{actionId=null,context={}}=args[2]??{};return actionId?[ref,...this.writeTargets("executeAction",[versionId,actionId,{...context,roles:{...(context.roles??{}),self:ref,source:ref}}])]:[ref];}
    if(method==="rerollAction"){const [,rerollId,original={},context={}]=args,refs=[...this.writeTargets("executeAction",[versionId,original.actionId,original.context??{}]),...this.writeTargets("executeAction",[versionId,rerollId,context])];return [...new Map(refs.map(ref=>[this.#refKey(ref),ref])).values()];}
    if(method==="chooseActions"){const [,offer={},ids=[]]=args,refs=ids.flatMap(id=>this.writeTargets("executeAction",[versionId,id,offer.context??{}]));return [...new Map(refs.map(ref=>[this.#refKey(ref),ref])).values()];}
    if(method==="runChatAction"){const [,offer,index,options={}]=args;try{const {button,context}=this.#chatContext(versionId,offer,index,options.as);return this.writeTargets("executeAction",[versionId,button.actionRef,context]);}catch{return [];}}
    if(method==="advance"||method==="applyMilestones")return [normalizeRuntimeContainerRef(args[2])];
    if(method!=="executeAction")return [normalizeRuntimeContainerRef(args[1])];
    const ruleset=this.ruleset(versionId),context=args[2]??{},roles=new Set(),seen=new Set();let turnOrder=false;
    const visit=actionId=>{
      if(seen.has(actionId))return;seen.add(actionId);
      const action=ruleset.actions?.find(x=>x.id===actionId);if(!action)return;
      // Follow-ups write in the same transaction: an Outcome's Actions and every row of the Action's Table.
      for(const mapping of action.outcomeMappings??[])(mapping?.actionRefs??[]).forEach(visit);
      if(action.tableRef)for(const row of ruleset.tables?.find(x=>x.id===action.tableRef)?.rows??[])(row.actionRefs??[]).forEach(visit);
      const effectIds=[...(action.costEffectRefs??[]),...(action.effectRefs??[]),...(action.outcomeMappings??[]).flatMap(m=>m?.effectRefs??[])];
      for(const id of effectIds){const effect=ruleset.effects?.find(x=>x.id===id);if(effect)roles.add(effect.targetContentField?context.content?.role??"self":effect.targetRole??"target");}
      if(action.turnOrder)turnOrder=true;
      for(const entry of [...(action.stateRemovals??[]),...(action.stateApplications??[]),...(action.modifierApplications??[]),...(action.acquisitions??[])])roles.add(entry.targetRole??"target");
      for(const eventTypeId of action.eventTypeRefs??[])for(const trigger of ruleset.triggers??[])if(trigger.eventTypeId===eventTypeId)(trigger.actionRefs??[]).forEach(visit);
    };
    visit(args[1]);
    const refs=[...roles].map(role=>roleRef(context,role));
    // Moving a combatant writes the combat, which only the GM may update.
    if(turnOrder)refs.push(this.adapter.activeCombat?.());
    if(roles.has("target")&&Array.isArray(context.targets))refs.push(...context.targets);
    const unique=new Map(refs.filter(Boolean).map(normalizeRuntimeContainerRef).map(ref=>[this.#refKey(ref),ref]));
    return [...unique.values()];
  }
  async needsGM(method,args){
    // Roles found through a collection (a pilot's vehicle) are written too: resolve them first.
    if(method==="executeAction"){const ruleset=this.ruleset(args[0]),action=ruleset.actions?.find(x=>x.id===args[1]);if(action?.roleLinks?.length)args=[args[0],args[1],await this.#linkedRoles(args[0],ruleset,action,this.#shared(args[2]??{}),new Map()),...args.slice(3)];}
    for(const ref of this.writeTargets(method,args))if(!await this.adapter.canWrite(ref))return true;return false;
  }
  async #commit(tx){const committed=await tx.commit();if(!committed.duplicate)for(const entry of committed.entries)this.hooks?.callAll?.(RUNTIME_HOOKS.ledgerEntry,clone(entry));return committed;}
  async instantiateDefinition(versionId,containerRef,definitionId,{initial={},transactionId=null}={}){
    const ruleset=this.ruleset(versionId),definition=ruleset.definitions?.find(x=>x.id===definitionId&&x.enabled!==false);if(!definition)throw new Error(`Definition unavailable: ${definitionId}.`);
    assertDefinitionContract(ruleset,definition);
    const tx=this.transaction(versionId,"instantiate",{transactionId,summary:{definitionId}}),ref=normalizeRuntimeContainerRef(containerRef),state=await tx.load(ref);
    if(state.rulesetVersionId&&state.rulesetVersionId!==versionId)throw new Error(`Runtime container is bound to another Ruleset version: ${state.rulesetVersionId}.`);
    if(state.definitionStates[definitionId])throw new Error(`Definition is already instantiated: ${definitionId}.`);
    await this.#acquireInto(versionId,ruleset,ref,state,{definitionId,initial});
    await this.#commit(tx);return clone(state.definitionStates[definitionId]);
  }
  async removeDefinitionState(versionId,containerRef,definitionId,{transactionId=null}={}){const tx=this.transaction(versionId,"remove",{transactionId,summary:{definitionId}}),state=await tx.load(containerRef);if(!state.definitionStates[definitionId])return false;delete state.definitionStates[definitionId];await this.#commit(tx);return true;}
  /** Evaluate starting pool values (explicit initial, else the slot's initial, else maximum, else minimum, else 0). */
  async #newDefinitionState(versionId,definition,ref,state,initial={}){
    const context={roles:{self:ref},defaultRole:"self"},evaluator=this.evaluator(versionId,new Map([[this.#refKey(ref),state]])),resolved={pool:{}};
    for(const slot of definition.slots?.pool??[]){
      const bounds=await this.#poolBounds(slot,context,evaluator),given=initial[slotInitialKey("pool",slot.id,"current")];
      const start=given!==undefined?given:slot.initial?await this.#valueSource(slot.initial,context,evaluator):bounds.maximum??bounds.minimum??0;
      resolved.pool[slot.id]=boundPoolValue(slot,start,bounds,`${definition.id}/${slot.id}`);
    }
    const ds=createDefinitionState(definition,{initial,slotStates:initialSlotStates(definition,initial,resolved)});
    if(ds.capabilityStates.value)ds.capabilityStates.value.base=boundValue(null,ds.capabilityStates.value.base,await this.#valueBounds(this.ruleset(versionId),definition,context,evaluator));
    for(const slot of definition.slots?.pool??[]){const bounds=await this.#poolBounds(slot,context,evaluator);if(bounds.maximum!==null)poolSlotState(ds,slot.id).lastMaximum=bounds.maximum;}
    return ds;
  }
  /** A pool whose maximum changed since it was last written follows it (slot.maximumPolicy):
   * keepMissing moves current by the same amount, keepCurrent leaves it; both then respect the bounds. */
  async #followMaxima(versionId,ref,state){
    if(state.rulesetVersionId!==versionId)return;
    const ruleset=this.ruleset(versionId),context={roles:{self:ref},defaultRole:"self"};let evaluator=null;
    for(const ds of Object.values(state.definitionStates??{})){
      const definition=ruleset.definitions?.find(x=>x.id===ds.definitionId);
      for(const slot of definition?.slots?.pool??[]){
        const pool=ds.capabilityStates?.pool?.[slot.id];if(!pool||!slot.maximum)continue;
        evaluator??=this.evaluator(versionId,new Map([[this.#refKey(ref),state]]));
        const bounds=await this.#poolBounds(slot,context,evaluator);if(bounds.maximum===null||bounds.maximum===pool.lastMaximum)continue;
        let current=Number(pool.current);
        if((slot.maximumPolicy??"keepMissing")==="keepMissing"&&Number.isFinite(pool.lastMaximum))current+=bounds.maximum-pool.lastMaximum;
        if(slot.overflowPolicy!=="allow"&&current>bounds.maximum)current=bounds.maximum;
        if(slot.underflowPolicy!=="allow"&&bounds.minimum!==null&&current<bounds.minimum)current=bounds.minimum;
        pool.current=current;pool.lastMaximum=bounds.maximum;
      }
    }
  }
  async #valueSource(source,context,evaluator){if(!source)return null;if(Object.hasOwn(source,"literal"))return Number(source.literal);return Number(await evaluator.formula(source.formulaRef,context));}
  /** The bounds of a value's base: each one its Definition's, else its type's; a Formula that gives nothing sets no bound. */
  async #valueBounds(ruleset,definition,context,evaluator){
    const type=ruleset.definitionTypes?.find(t=>t.id===definition.definitionTypeId),own=definition.valueBounds??{},typed=type?.valueBounds??{};
    const bounds={minimum:own.minimum??typed.minimum,maximum:own.maximum??typed.maximum};
    const bound=async source=>{if(!source)return null;const raw=Object.hasOwn(source,"literal")?source.literal:await evaluator.formula(source.formulaRef,context);const n=raw===null||raw===undefined||raw===""?NaN:Number(raw);return Number.isFinite(n)?n:null;};
    return {minimum:await bound(bounds?.minimum),maximum:await bound(bounds?.maximum)};
  }
  /** Bounds of the value base of one Definition held by a container (minimum and maximum, null when none). */
  async valueBounds(versionId,containerRef,definitionId,{staged=null}={}){
    const ruleset=this.ruleset(versionId),definition=ruleset.definitions?.find(x=>x.id===definitionId);if(!definition)throw new Error(`Definition not found: ${definitionId}.`);
    const ref=normalizeRuntimeContainerRef(containerRef),key=this.#refKey(ref),map=new Map(staged??[]);if(!map.has(key))map.set(key,await this.adapter.load(ref,{rulesetVersionId:versionId}));
    return this.#valueBounds(ruleset,definition,{roles:{self:ref},defaultRole:"self"},this.evaluator(versionId,map));
  }
  /** The bounds of a value base written on a staged container state. */
  async #stagedValueBounds(versionId,ref,state,definitionId){
    const ruleset=this.ruleset(versionId),definition=ruleset.definitions?.find(x=>x.id===definitionId);if(!definition)return {minimum:null,maximum:null};
    return this.#valueBounds(ruleset,definition,{roles:{self:ref},defaultRole:"self"},this.evaluator(versionId,new Map([[this.#refKey(ref),state]])));
  }
  async #poolBounds(slot,context,evaluator){return {minimum:await this.#valueSource(slot.minimum,context,evaluator),maximum:await this.#valueSource(slot.maximum,context,evaluator)};}
  /** Load one slot of an instantiated Definition on a container. */
  async #slotTarget(tx,versionId,containerRef,definitionId,capabilityId,slotId){
    const ruleset=this.ruleset(versionId),definition=ruleset.definitions?.find(x=>x.id===definitionId&&x.enabled!==false);if(!definition)throw new Error(`Definition unavailable: ${definitionId}.`);
    const slot=findSlot(definition,capabilityId,slotId);if(!slot)throw new Error(`Slot not found: ${definitionId}/${capabilityId}/${slotId}.`);
    const ref=normalizeRuntimeContainerRef(containerRef),state=await tx.load(ref);
    const ds=state.definitionStates?.[definitionId];if(!ds)throw new Error(`Definition is not instantiated on RuntimeContainer: ${definitionId}.`);
    return {definition,slot,ref,state,ds};
  }
  async #collectionCapacity(versionId,slot,ref,state){if(!slot.capacityFormulaRef)return null;return Number(await this.evaluator(versionId,new Map([[this.#refKey(ref),state]])).formula(slot.capacityFormulaRef,{roles:{self:ref},defaultRole:"self"}));}
  /** CP-27: add an entry to a collection slot (no implicit creation of runtime entities). */
  async addCollectionEntry(versionId,containerRef,definitionId,slotId,entry,{transactionId=null}={}){
    const tx=this.transaction(versionId,"collection.add",{transactionId,summary:{definitionId,slotId}}),{slot,ref,state,ds}=await this.#slotTarget(tx,versionId,containerRef,definitionId,"collection",slotId),entries=collectionSlotState(ds,slotId).entries;
    assertCollectionRoom(slot,entries,await this.#collectionCapacity(versionId,slot,ref,state));
    const next=prepareCollectionEntry(slot,entry,entries);entries.push(next);await this.#commit(tx);return clone(next);
  }
  /** Remove only the entry; an owned or referenced entity is never destroyed here. */
  async removeCollectionEntry(versionId,containerRef,definitionId,slotId,entryId,{transactionId=null}={}){
    const tx=this.transaction(versionId,"collection.remove",{transactionId,summary:{definitionId,slotId,entryId}}),{slot,ds}=await this.#slotTarget(tx,versionId,containerRef,definitionId,"collection",slotId),entries=collectionSlotState(ds,slotId).entries;
    const index=entries.findIndex(entry=>entry.id===entryId);if(index<0)throw new Error(`Collection entry not found: ${entryId}.`);
    assertCollectionMinimum(slot,entries.length-1);const [removed]=entries.splice(index,1);await this.#commit(tx);return clone(removed);
  }
  /** Move an owned entry to another owned collection: ownership changes, nothing is cloned. */
  async transferCollectionEntry(versionId,{from,to,entryId,transactionId=null}){
    const tx=this.transaction(versionId,"collection.transfer",{transactionId,summary:{entryId,from:{definitionId:from.definitionId,slotId:from.slotId},to:{definitionId:to.definitionId,slotId:to.slotId}}});
    const source=await this.#slotTarget(tx,versionId,from.containerRef,from.definitionId,"collection",from.slotId);
    if(source.slot.entryMode!=="owned")throw new Error(`Only owned collection entries can be transferred (${source.slot.id} is ${source.slot.entryMode}).`);
    // The transaction loads each container once, so both slots of one container share a state.
    const target=await this.#slotTarget(tx,versionId,to.containerRef,to.definitionId,"collection",to.slotId);
    if(target.slot.entryMode!=="owned")throw new Error(`Transfer target ${target.slot.id} must be an owned collection.`);
    const fromEntries=collectionSlotState(source.ds,from.slotId).entries,toEntries=collectionSlotState(target.ds,to.slotId).entries;
    const index=fromEntries.findIndex(entry=>entry.id===entryId);if(index<0)throw new Error(`Collection entry not found: ${entryId}.`);
    if(fromEntries===toEntries)return clone(fromEntries[index]);
    assertCollectionMinimum(source.slot,fromEntries.length-1);
    assertCollectionRoom(target.slot,toEntries,await this.#collectionCapacity(versionId,target.slot,target.ref,target.state));
    const moved=prepareCollectionEntry(target.slot,fromEntries[index],toEntries);
    fromEntries.splice(index,1);toEntries.push(moved);
    await this.#commit(tx);return clone(moved);
  }
  async setDefinitionState(versionId,containerRef,definitionId,{base,active,pools,transactionId=null}={}){
    const ruleset=this.ruleset(versionId),definition=ruleset.definitions?.find(x=>x.id===definitionId&&x.enabled!==false);if(!definition)throw new Error(`Definition unavailable: ${definitionId}.`);
    const tx=this.transaction(versionId,"set",{transactionId,summary:{definitionId}}),ref=normalizeRuntimeContainerRef(containerRef),state=await tx.load(ref);
    const ds=state.definitionStates?.[definitionId];if(!ds)throw new Error(`Definition is not instantiated on RuntimeContainer: ${definitionId}.`);
    if(ds.capabilityStates?.value&&base!==undefined){const value=ds.capabilityStates.value;value.base=boundValue(value.base,Number(base),await this.#stagedValueBounds(versionId,ref,state,definitionId));}
    if(pools!==undefined){const context={roles:{self:ref},defaultRole:"self"},evaluator=this.evaluator(versionId,new Map([[this.#refKey(ref),state]]));
      for(const [slotId,current] of Object.entries(pools)){const slot=findSlot(definition,"pool",slotId);if(!slot)throw new Error(`Slot not found: ${definitionId}/pool/${slotId}.`);poolSlotState(ds,slotId).current=boundPoolValue(slot,current,await this.#poolBounds(slot,context,evaluator),`${definitionId}/${slotId}`);}}
    if(ds.capabilityStates?.state&&active!==undefined)ds.capabilityStates.state.active=Boolean(active);
    await this.#commit(tx);return clone(ds);
  }

  async #stateForRole(versionId,context,role){const ref=roleRef(context,role);if(!ref)throw new Error(`EvaluationContext role is missing: ${role}.`);return {ref:normalizeRuntimeContainerRef(ref),state:await this.adapter.load(ref,{rulesetVersionId:versionId})};}
  #outputContract(ruleset,reference){const def=ruleset.definitions?.find(x=>x.id===reference.objectId);if(!def)throw new Error(`Definition not found: ${reference.objectId}.`);if(reference.objectKind!=="definition")throw new Error(`Runtime Reference must target a Definition output, got ${reference.objectKind}.`);if(!reference.capabilityId||!reference.outputId)throw new Error("Runtime Reference requires capabilityId and outputId.");if(!(def.capabilities??[]).includes(reference.capabilityId))throw new Error(`Definition ${def.id} does not have capability ${reference.capabilityId}.`);const cap=capabilityTypeRegistry.get(reference.capabilityId);const output=cap?.outputs?.[reference.outputId];if(!output)throw new Error(`Output not found: ${reference.capabilityId}/${reference.outputId}.`);const slot=SLOT_CAPABILITIES.includes(reference.capabilityId)?requireSlot(def,reference):null;return {definition:def,output,slot};}
  #readOutput(ruleset,containerState,reference,passiveRows=[]){const {definition,output}=this.#outputContract(ruleset,reference);const cap=reference.capabilityId;
    // A state Definition is active through its own DefinitionState or through active StateInstances (CP-28).
    if(cap==="state"){const instances=containerState.stateInstances.filter(instance=>instance.definitionId===definition.id&&instance.active!==false);if(reference.outputId==="state.stacks")return instances.reduce((sum,instance)=>sum+Number(instance.stacks??1),0);if(reference.outputId==="state.active")return Boolean(containerState.definitionStates?.[definition.id]?.capabilityStates?.state?.active)||instances.length>0;}
    const ds=containerState.definitionStates?.[definition.id];if(!ds)throw new Error(`Definition is not instantiated on RuntimeContainer: ${definition.id}.`);
    if(cap==="value"){const base=Number(ds.capabilityStates?.value?.base??0);if(reference.outputId==="value.base")return base;if(reference.outputId==="value.final")return applyModifierStack(base,[...activeStates(ds).map(stackRow),...passiveRows]).value;}
    if(cap==="pool"&&reference.outputId==="pool.current")return Number(poolSlotState(ds,reference.slotId).current);
    if(cap==="pool")throw new Error(`Pool bounds are derived; resolve ${reference.outputId} through resolveReference.`);
    if(cap==="collection"&&reference.outputId==="collection.count")return collectionSlotState(ds,reference.slotId).entries.length;
    const source=output.source?.split(".")??[];let value=ds.capabilityStates?.[cap];for(const part of source.slice(1))value=value?.[part];return clone(value);
  }
  /** Read (or prepare a write of) a RuntimeReference {container, reference}; a bare logical Reference is read on `role`, else on the context's default role. */
  async resolveReference(versionId,target,context,{forWrite=false,role=null,staged=null,skipBinding=false}={}){const ruleset=this.ruleset(versionId);context=this.#shared(context??{});const runtime=toRuntimeReference(target,role??context?.defaultRole??"self"),reference=runtime.reference;const resolved=resolveContainer(runtime,context);context=resolved.context;const selectedRole=resolved.role,n=resolved.containerRef;const state=staged?.get(this.#refKey(n))??await this.adapter.load(n,{rulesetVersionId:versionId});const binding=(ruleset.formulaBindings??[]).find(b=>enabled(b)&&b.targetRef?.objectKind===reference.objectKind&&b.targetRef?.objectId===reference.objectId&&b.targetRef?.capabilityId===reference.capabilityId&&b.targetRef?.outputId===reference.outputId&&(b.targetRef?.slotId??null)===(reference.slotId??null));if(forWrite){const {output}=this.#outputContract(ruleset,reference);if(binding)throw new Error(`Output is derived and read-only: ${reference.outputId}.`);if(!output.mutable)throw new Error(`Output is not mutable: ${reference.outputId}.`);return {containerRef:n,state,reference,output};}const finalValue=reference.capabilityId==="value"&&reference.outputId==="value.final";
    const passiveRows=finalValue?await this.#passiveRows(versionId,ruleset,reference,{...context,defaultRole:selectedRole},staged):[];
    if(binding&&!skipBinding){const derivedContext={...context,defaultRole:selectedRole},value=await this.evaluator(versionId,staged).formula(binding.formulaRef,derivedContext);if(!finalValue)return value;
      // A derived value.final takes the same ModifierStates and passive Modifiers as a stored one.
      return applyModifierStack(Number(value),[...activeStates(state.definitionStates?.[reference.objectId]).map(stackRow),...passiveRows]).value;}
    if(reference.capabilityId==="pool"&&reference.outputId!=="pool.current"){const {slot}=this.#outputContract(ruleset,reference);const bounds=await this.#poolBounds(slot,{...context,defaultRole:selectedRole},this.evaluator(versionId,staged));return reference.outputId==="pool.minimum"?bounds.minimum:bounds.maximum;}
    return this.#readOutput(ruleset,state,reference,passiveRows);}
  /** Stack rows of the passive Modifiers on a value.final whose Conditions are true for the read role. */
  async #passiveRows(versionId,ruleset,reference,context,staged){
    const modifiers=passiveModifiers(ruleset,reference);if(!modifiers.length)return [];
    const evaluator=this.evaluator(versionId,staged);evaluator.__staged=staged;const rows=[];
    for(const modifier of modifiers){
      let active=true;for(const id of modifier.conditionRefs??[])if(!await evaluator.condition(id,context)){active=false;break;}
      if(!active)continue;
      const source=modifier.valueSource,value=source.kind==="literal"?source.value:source.kind==="parameter"?evaluator.parameter(source.id):source.kind==="formula"?await evaluator.formula(source.id,context):await this.resolveReference(versionId,source.reference,context,{staged});
      rows.push({id:modifier.id,operation:modifier.operation,value:Number(value),priority:Number(modifier.priority??0),stacking:modifier.stacking});
    }
    return rows;
  }
  #refKey(ref){return ref.uuid??`${ref.kind}:${ref.id}`;}
  evaluator(versionId,staged=null){const ruleset=this.ruleset(versionId);return new RuntimeEvaluator({ruleset,resolveReference:(reference,context,opts)=>this.resolveReference(versionId,reference,context,{...opts,staged}),
    listContents:async(context,container)=>this.#contents(versionId,context,container??context?.defaultRole??"self",staged),
    currentContent:async context=>{if(!context?.content?.key)return null;return (await this.#contents(versionId,context,context.content.role??"self",staged)).find(row=>row.key===context.content.key)??null;},
    space:{distance:(context,from,to)=>this.#spatial("distance",context,[from,to]),nearby:(context,role,within,side)=>this.#spatial("nearby",context,[role],within,side)}});}
  /** Distances come from the adapter (Foundry: the tokens of the viewed scene). */
  async #spatial(kind,context,roles,...rest){
    const refs=roles.map(role=>{const ref=roleRef(context,role);if(!ref)throw new Error(`EvaluationContext role is missing: ${role}.`);return normalizeRuntimeContainerRef(ref);});
    if(typeof this.adapter[kind]!=="function")throw new Error("This runtime has no scene to measure distances on.");
    const value=Number(await this.adapter[kind](...refs,...rest));if(!Number.isFinite(value))throw new Error(`No ${kind} between these Actors: are their tokens on the scene?`);return value;
  }
  /** A role's owned Contents, each with its template data overlaid by its instance fields. */
  async #contents(versionId,context,role,staged){
    const target=roleRef(context,role);if(!target)throw new Error(`EvaluationContext role is missing: ${role}.`);
    const ref=normalizeRuntimeContainerRef(target),state=staged?.get(this.#refKey(ref))??await this.adapter.load(ref,{rulesetVersionId:versionId});
    const templates=new Map((this.ruleset(versionId).contentTemplates??[]).map(template=>[template.id,template]));
    return Object.entries(state.contents??{}).map(([key,content])=>({key,templateId:content.templateId,contentTypeId:content.contentTypeId,fields:{...clone(templates.get(content.templateId)?.data??{}),...clone(content.fields??{})}}));
  }
  /** The Contents a container owns, with their merged fields and whether their Content Type's availability Condition holds (a latent power the mind has not reached yet). */
  async listOwnedContents(versionId,containerRef,context={}){
    const ruleset=this.ruleset(versionId),types=new Map((ruleset.contentTypes??[]).map(type=>[type.id,type]));
    const scope={...context,roles:{...(context.roles??{}),self:containerRef}},rows=await this.#contents(versionId,scope,"self");
    for(const row of rows){const conditionId=types.get(row.contentTypeId)?.availabilityConditionRef;row.available=!conditionId||Boolean(await this.evaluateCondition(versionId,conditionId,{...scope,content:{key:row.key,role:"self"}}));}
    return rows;
  }
  /** Set one instance field of an owned Content (equipped, ammunition...), checked against its Content Type. */
  async setContentField(versionId,containerRef,key,fieldId,value,{transactionId=null}={}){
    const ruleset=this.ruleset(versionId),tx=this.transaction(versionId,"content.field",{transactionId,summary:{key,fieldId}}),state=await tx.load(containerRef);
    const content=state.contents?.[key];if(!content)throw new Error(`Owned Content not found: ${key}.`);
    const field=ruleset.contentTypes?.find(type=>type.id===content.contentTypeId)?.fields?.[fieldId];if(!field)throw new Error(`Content Type ${content.contentTypeId} has no field ${fieldId}.`);
    const check=validateTypedValue(field.valueType,field.cardinality??"one",field.nullable===true,value);if(!check.valid)throw new Error(`Content field ${fieldId}: ${check.message}`);
    (content.fields??={})[fieldId]=clone(value);await this.#commit(tx);return clone(content);
  }
  /** The text of a sheet's notes block on a container (its node id), written like any other runtime value:
   * one transaction, the write Permission of the whole Ruleset (or Foundry ownership), the GM relay. Empty text removes it. */
  async setNote(versionId,containerRef,noteId,text,{transactionId=null}={}){
    if(typeof noteId!=="string"||!noteId)throw new Error("A note needs the id of its sheet block.");
    if(typeof text!=="string")throw new Error("A note is text.");
    if(text.length>NOTE_LENGTH)throw new Error(`A note holds at most ${NOTE_LENGTH} characters.`);
    const tx=this.transaction(versionId,"note",{transactionId,summary:{noteId}}),state=await tx.load(containerRef);
    state.notes??={};if(text)state.notes[noteId]=text;else delete state.notes[noteId];
    await this.#commit(tx);return text;
  }
  /** Forget an owned Content (its Item was removed). Definitions it granted are released by the caller. */
  async releaseContent(versionId,containerRef,key,{transactionId=null}={}){
    const tx=this.transaction(versionId,"content.release",{transactionId,summary:{key}}),state=await tx.load(containerRef);
    if(!state.contents?.[key])return false;delete state.contents[key];await this.#commit(tx);return true;
  }
  async evaluateFormula(versionId,formulaId,context={}){return await this.evaluator(versionId).formula(formulaId,this.#shared(context));}
  async evaluateCondition(versionId,conditionId,context={}){return await this.evaluator(versionId).condition(conditionId,this.#shared(context));}
  async resolveModifiers(versionId,targetRef,baseValue,context={}){
    const ruleset=this.ruleset(versionId),evaluator=this.evaluator(versionId),applicable=[];
    for(const modifier of ruleset.modifiers??[]){if(!enabled(modifier))continue;const t=modifier.targetRef??{};if(t.objectKind!==targetRef.objectKind||t.objectId!==targetRef.objectId||String(t.capabilityId??'')!==String(targetRef.capabilityId??'')||String(t.outputId??'')!==String(targetRef.outputId??''))continue;let ok=true;for(const id of modifier.conditionRefs??[])if(!await evaluator.condition(id,context)){ok=false;break;}if(!ok)continue;let value;if(modifier.valueSource.kind==='literal')value=modifier.valueSource.value;else if(modifier.valueSource.kind==='parameter')value=evaluator.parameter(modifier.valueSource.id);else if(modifier.valueSource.kind==='formula')value=await evaluator.formula(modifier.valueSource.id,context);else value=await this.resolveReference(versionId,modifier.valueSource.reference,context);applicable.push({modifier,value:Number(value)});}
    const {value,applied}=applyModifierStack(baseValue,applicable.map(row=>({id:row.modifier.id,operation:row.modifier.operation,value:row.value,priority:row.modifier.priority??0,stacking:row.modifier.stacking})));return{base:Number(baseValue),value,applied};
  }
  /** A replay takes back the logged roll of the same formula; a partial reroll (dice.some) throws again only the matching dice. */
  async #throw(versionId,formula,data,context){
    const dice=context?.[DICE],kept=dice?.keep?.get(formula);let roll=kept?.length?kept.shift():null;const replayed=Boolean(roll);
    if(roll&&dice.some){const {filter,replaceWith}=dice.some;if((roll.dice??[]).length)roll=await rerollSomeDice(roll,filter,{replaceWith,next:async faces=>Number((await this.roll(`1d${faces}`)).total)});}
    roll??=await this.roll(formula,data,{versionId});
    // A kept or partly rethrown roll is not the Foundry Roll thrown before: the chat shows only the dice thrown now.
    if(replayed)delete (roll=clone(roll)).foundryRoll;
    dice?.log.push({formula,roll:clone(roll)});return roll;
  }
  /** versionId: the Ruleset whose dice (2dp) the formula may throw; the adapter makes them known to Foundry first. */
  async roll(formula,data={},{versionId=null}={}){assertSafeRollFormula(formula);if(typeof this.adapter.roll!=="function")throw new Error("Runtime adapter does not provide Foundry Roll support.");
    const ruleset=versionId?this.ruleset(versionId):null,dice=(ruleset?.dice??[]).filter(enabled);return this.adapter.roll(formula,data,dice.length?{dice,rulesetKey:ruleset.id}:{});}
  /** Test (CP-29): inputs, optional Roll, total, target, margin, then the first true Outcome in the Test's order.
   * Each step sees the previous ones under variables.test (inputs, roll, rollTotal, natural, bonus, total, target, margin). */
  /** staged: an Action's states before its commit, so the Test sees what the Action already changed (a reaction's Modifier). */
  async executeTest(versionId,testId,context={},{staged=null}={}){
    const evaluator=this.evaluator(versionId,staged);context=this.#shared(context);
    const ruleset=this.ruleset(versionId),test=ruleset.tests?.find(x=>x.id===testId&&enabled(x));if(!test)throw new Error(`Test unavailable: ${testId}.`);
    const scope={...context,variables:{...(context.variables??{})}};
    const state={id:test.id,inputs:{},roll:null,rollTotal:0,natural:null,bonus:0,total:0,target:null,margin:null};
    const sync=()=>{scope.variables.test={...state,inputs:{...state.inputs}};if(state.roll)scope.variables.roll={...state.roll};};
    sync();
    for(const input of test.inputBindings??[]){state.inputs[input.id]=await this.#testInput(versionId,test,input,scope,evaluator,staged);sync();}
    if(test.rollRef){
      const rollDef=ruleset.rolls?.find(x=>x.id===test.rollRef&&enabled(x));if(!rollDef)throw new Error(`Roll unavailable: ${test.rollRef}.`);
      const {formula,data}=await this.#rollFormula(rollDef,scope,evaluator,{test:clone(state.inputs)});
      const roll=await this.#throw(versionId,resolveRollData(formula,data),data,scope);
      const natural=Number.isFinite(Number(roll.natural))?Number(roll.natural):Number(roll.total);
      state.roll={formula:String(roll.formula??formula),total:Number(roll.total),natural,result:String(roll.result??roll.total??""),dice:clone(roll.dice??[])};
      state.rollTotal=Number(roll.total);state.natural=natural;state.total=Number(roll.total);sync();
      // Extra rolls: each whose Condition holds now adds to or takes from the roll total.
      for(const extra of test.extraRolls??[]){
        if(!await evaluator.condition(extra.conditionRef,scope))continue;
        const extraDef=ruleset.rolls?.find(x=>x.id===extra.rollRef&&enabled(x));if(!extraDef)throw new Error(`Roll unavailable: ${extra.rollRef}.`);
        const built=await this.#rollFormula(extraDef,scope,evaluator,{test:clone(state.inputs)}),thrown=await this.#throw(versionId,resolveRollData(built.formula,built.data),built.data,scope);
        const amount=(extra.operation==="subtract"?-1:1)*Number(thrown.total);
        state.rollTotal+=amount;state.total=state.rollTotal;(state.roll.extra??=[]).push({rollId:extra.rollRef,total:Number(thrown.total),operation:extra.operation});
        state.roll.result=`${state.roll.result} ${extra.operation==="subtract"?"−":"+"} ${thrown.total}`;sync();
      }
    }
    const number=async(formulaId,label)=>{const value=Number(await evaluator.formula(formulaId,scope));if(!Number.isFinite(value))throw new Error(`Test ${test.id} ${label} is not a number.`);return value;};
    if(test.bonusFormulaRef){state.bonus=await number(test.bonusFormulaRef,"bonus");state.total=state.rollTotal+state.bonus;sync();}
    if(test.totalFormulaRef){state.total=await number(test.totalFormulaRef,"total");sync();}
    // Opposed Test: the target role makes the other Test as its self, against this Test's self; its total is the target.
    if(test.opposedTestRef){
      const opposing=ruleset.tests?.find(x=>x.id===test.opposedTestRef&&enabled(x));if(!opposing)throw new Error(`Test unavailable: ${test.opposedTestRef}.`);
      if(opposing.opposedTestRef)throw new Error(`Test ${opposing.id} is itself opposed and cannot answer ${test.id}.`);
      const opponent=roleRef(context,"target");if(!opponent)throw new Error(`Opposed Test ${test.id} needs a target.`);
      const roles={...(context.roles??{}),self:opponent,source:opponent,target:roleRef(context,"self")};
      const {content:_attackerContent,...opponentContext}=context,answer=await this.executeTest(versionId,opposing.id,{...opponentContext,roles,variables:{...(context.variables??{})}},{staged});
      state.opposed={testId:opposing.id,total:answer.total,natural:answer.roll?.natural??null,outcome:answer.outcome?.resultKey??null};state.target=answer.total;sync();
    }
    else state.target=test.targetFormulaRef?await number(test.targetFormulaRef,"target"):(test.targetValue===null||test.targetValue===undefined?null:Number(test.targetValue));sync();
    state.margin=test.marginFormulaRef?await number(test.marginFormulaRef,"margin"):(state.target===null?null:state.total-state.target);sync();
    // CP-29: the Test's own Outcome order; the first true Outcome wins, then the explicit
    // fallback. With Outcomes configured and no match, the Test fails explicitly.
    const candidates=(test.outcomeRefs??[]).map(id=>ruleset.outcomes?.find(x=>x.id===id&&enabled(x))).filter(Boolean);
    let outcome=null;
    for(const candidate of candidates){if(!candidate.conditionRef||await evaluator.condition(candidate.conditionRef,scope)){outcome=candidate;break;}}
    if(!outcome&&test.fallbackOutcomeRef){outcome=ruleset.outcomes?.find(x=>x.id===test.fallbackOutcomeRef&&enabled(x))??null;if(!outcome)throw new Error(`Fallback Outcome unavailable: ${test.fallbackOutcomeRef}.`);}
    if(!outcome&&candidates.length)throw new Error(`Test ${test.id} matched no Outcome and has no fallback Outcome.`);
    const variables={...(state.roll?{roll:{...state.roll}}:{}),test:{...state,inputs:{...state.inputs}}};
    const result={testId:test.id,inputs:copyJSON(state.inputs),roll:state.roll?{...state.roll}:null,bonus:state.bonus,total:state.total,target:state.target,margin:state.margin,...(state.opposed?{opposed:{...state.opposed}}:{}),outcome:outcome?{id:String(outcome.id),resultKey:String(outcome.resultKey),nameKey:String(outcome.nameKey),labelKey:String(outcome.labelKey||outcome.nameKey)}:null,variables,context:{variables}};
    this.hooks?.callAll?.(RUNTIME_HOOKS.testResolved,result,{roles:{...(context.roles??{})},defaultRole:context.defaultRole??"self",userContext:{...(context.userContext??{})}});return result;
  }
  async #testInput(versionId,test,input,scope,evaluator,staged){
    let value;
    if(Object.hasOwn(input.source,"literal"))value=copyJSON(input.source.literal);
    else if(input.source.formulaRef)value=await evaluator.formula(input.source.formulaRef,scope);
    else if(input.source.reference)value=await this.resolveReference(versionId,input.source.reference,scope,{staged});
    if(value===undefined||value===null){
      if(input.defaultValue!==undefined)return copyJSON(input.defaultValue);
      if(input.required)throw new Error(`Test ${test.id} input ${input.id} has no value.`);
      return null;
    }
    const check=validateTypedValue(input.valueType,"one",false,value);
    if(!check.valid)throw new Error(`Test ${test.id} input ${input.id}: ${check.message}`);
    return value;
  }
  /** Move a container onto another Ruleset version (its own deleted or replaced): what that version still defines
   * (Definitions, states, held Contents) keeps its values, the rest is dropped. Returns what was dropped. */
  async rebindContainer(versionId,containerRef,{transactionId=null}={}){
    const ruleset=this.ruleset(versionId),ref=normalizeRuntimeContainerRef(containerRef);
    const tx=this.transaction(versionId,"rebind",{transactionId}),state=await tx.load(ref),from=state.rulesetVersionId;
    if(from===versionId)return {from,to:versionId,dropped:[]};
    const defined=new Set((ruleset.definitions??[]).map(d=>d.id)),templates=new Set((ruleset.contentTemplates??[]).map(t=>t.id)),dropped=[];
    for(const id of Object.keys(state.definitionStates))if(!defined.has(id)){delete state.definitionStates[id];dropped.push({objectKind:"definition",objectId:id});}
    state.stateInstances=state.stateInstances.filter(instance=>defined.has(instance.definitionId)||!dropped.push({objectKind:"state",objectId:instance.definitionId}));
    for(const [key,content] of Object.entries(state.contents??{}))if(!templates.has(content.templateId)){delete state.contents[key];dropped.push({objectKind:"contentTemplate",objectId:content.templateId});}
    state.rulesetVersionId=versionId;
    await this.#commit(tx);return {from,to:versionId,dropped};
  }
  async initializeContainer(versionId,containerRef,{definitionIds=null,initialByDefinition={},transactionId=null}={}){
    const ruleset=this.ruleset(versionId),wanted=definitionIds?new Set(definitionIds):null,ref=normalizeRuntimeContainerRef(containerRef);
    const tx=this.transaction(versionId,"initialize",{transactionId}),state=await tx.load(ref);
    if(state.rulesetVersionId&&state.rulesetVersionId!==versionId)throw new Error(`Runtime container is bound to another Ruleset version: ${state.rulesetVersionId}.`);
    state.rulesetVersionId=versionId;let created=0;
    // Pools last: their bounds may be Formulas over the container's other Definitions.
    const ordered=[...(ruleset.definitions??[])].sort((a,b)=>Number(Boolean(a.slots?.pool?.length))-Number(Boolean(b.slots?.pool?.length)));
    for(const definition of ordered){if(definition.enabled===false||wanted&&!wanted.has(definition.id)||state.definitionStates[definition.id])continue;assertDefinitionContract(ruleset,definition);state.definitionStates[definition.id]=await this.#newDefinitionState(versionId,definition,ref,state,initialByDefinition?.[definition.id]??{});created++;}
    if(created)await this.#commit(tx);return {created,state:clone(state)};
  }
  /** CP-16 acquisition: the Content's Definition grants (only the absent ones) and, when given,
   * the acquisition Action's Conditions, Costs and Effects commit as one transaction. */
  async acquire(versionId,containerRef,{actionId=null,definitionBindings=[],content=null,context={},transactionId=null,summary=null}={}){
    const ref=normalizeRuntimeContainerRef(containerRef),grants=definitionBindings.map(binding=>({definitionId:binding.definitionId,initial:binding.initial??{},add:binding.add??{},targetRole:"self",ifAbsent:true}));
    if(actionId){
      const roles={...(context.roles??{}),self:ref,source:ref};
      const result=await this.executeAction(versionId,actionId,{...context,roles,defaultRole:context.defaultRole??"self"},{acquisitions:grants,content,transactionId});
      return {allowed:result.allowed,reason:result.reason??null,acquiredDefinitionIds:result.acquired??[],transactionId:result.transactionId??null,ledgerEntryIds:result.ledgerEntryIds??[],duplicate:Boolean(result.duplicate),action:{...result,staged:undefined}};
    }
    const ruleset=this.ruleset(versionId),tx=this.transaction(versionId,"acquisition",{transactionId,summary}),state=await tx.load(ref),acquired=[];
    for(const grant of grants)if(await this.#acquireInto(versionId,ruleset,ref,state,grant))acquired.push(grant.definitionId);
    if(content)this.#addContent(versionId,state,content);
    const committed=await this.#commit(tx);
    return {allowed:true,reason:null,acquiredDefinitionIds:committed.duplicate?committed.entries.flatMap(entry=>entry.changes.filter(change=>change.before===null).map(change=>change.id)):acquired,transactionId:committed.transactionId,ledgerEntryIds:committed.entries.map(entry=>entry.id),duplicate:committed.duplicate,action:null};
  }
  /** A correction is a new compensating entry: the ledger is never rewritten. It applies only
   * when the container still holds what the entry wrote; otherwise the later history wins. */
  async compensate(versionId,containerRef,entryId,{transactionId=null}={}){
    const ref=normalizeRuntimeContainerRef(containerRef),ledger=await this.adapter.loadLedger(ref),entry=ledger.find(item=>item.id===entryId);
    if(!entry)throw new RuntimeTransactionError(TRANSACTION_ERRORS.compensation,`Ledger entry not found: ${entryId}.`,{entryId});
    if(ledger.some(item=>item.corrects===entryId))throw new RuntimeTransactionError(TRANSACTION_ERRORS.compensation,`Ledger entry is already compensated: ${entryId}.`,{entryId});
    const tx=this.transaction(versionId,"compensation",{transactionId,corrects:entryId,summary:{entryId,kind:entry.kind}}),state=await tx.load(ref);
    const current=applyLedgerChanges(clone(state),entry.changes,"after");
    if(JSON.stringify(current)!==JSON.stringify(state))throw new RuntimeTransactionError(TRANSACTION_ERRORS.compensation,`Runtime container changed after ledger entry ${entryId}; compensate the later entries first.`,{entryId});
    applyLedgerChanges(state,entry.changes,"before");
    const committed=await this.#commit(tx);return committed.entries[0]??null;
  }
  async emitEvent(versionId,eventTypeId,payload={},context={},options={}){
    const ruleset=this.ruleset(versionId),eventType=ruleset.eventTypes?.find(x=>x.id===eventTypeId&&enabled(x))??systemEventType(eventTypeId);if(!eventType)throw new Error(`EventType unavailable: ${eventTypeId}.`);
    const depth=Number(options.depth??0);if(depth>20)throw new Error("Rule Them'All event chain depth exceeded.");
    const event={id:globalThis.crypto?.randomUUID?.()??`evt-${Date.now()}-${Math.random().toString(36).slice(2)}`,eventTypeId,rulesetVersionId:versionId,occurredAt:Date.now(),payload:clone(payload),chainId:options.chainId??null,parentEventId:options.parentEventId??null,depth};event.chainId??=event.id;
    const eventContext={...this.#shared(context),event};const triggered=[],holder=holderOf(roleRef(context,"self"));
    // Triggers of one event run in the order the configurator shows (drag to reorder), not in storage order.
    for(const trigger of byOrder(ruleset.triggers)){if(!enabled(trigger)||trigger.eventTypeId!==eventTypeId||(trigger.holder??"actor")!==holder)continue;if(!this.#eventFilterMatches(trigger.eventFilter,event,eventContext))continue;await this.#runTrigger(versionId,ruleset,trigger,eventContext,depth,triggered);}
    // untilEvent Durations end on the containers the event concerns.
    const expired=[];for(const ref of new Map(Object.values(context.roles??{}).filter(Boolean).map(ref=>{const n=normalizeRuntimeContainerRef(ref);return [this.#refKey(n),n];})).values()){const state=await this.adapter.load(ref);if(state.rulesetVersionId===versionId&&hasDurations(state)){const result=await this.expireStates(versionId,ref,{eventTypeId});if(result.stateInstanceIds.length||result.modifierStateIds.length)expired.push({ref,...result});}}
    this.hooks?.callAll?.(RUNTIME_HOOKS.event,event,clone(triggered));return {event,triggered,expired};
  }
  /** A Trigger's Actions, run by the role it names: automatically, or offered to that role (hook reactionOffered,
   * the offer listing the Actions and their context). A reroll Action replays the use that caused the event. */
  async #runTrigger(versionId,ruleset,trigger,eventContext,depth,triggered){
    const context=trigger.actingRole==="target"?swapRoles(eventContext):eventContext,cause=eventContext.cause??null;
    // Its Conditions read the acting role as self (the defender's own Thorns).
    for(const conditionId of trigger.conditionRefs??[])if(!await this.evaluateCondition(versionId,conditionId,context))return;
    if(trigger.mode==="offer"){
      const offer={triggerId:trigger.id,rulesetVersionId:versionId,eventTypeId:trigger.eventTypeId,actionIds:[...(trigger.actionRefs??[])],actor:roleRef(context,"self"),context:plainContext(context),cause:clone(cause)};
      this.hooks?.callAll?.(RUNTIME_HOOKS.reactionOffered,clone(offer));triggered.push({triggerId:trigger.id,actions:[],offer});return;
    }
    const actions=[];
    for(const actionId of trigger.actionRefs??[]){
      const action=ruleset.actions?.find(x=>x.id===actionId);
      actions.push(action?.reroll&&cause?await this.rerollAction(versionId,actionId,cause,context,{triggered:true,eventDepth:depth}):await this.executeAction(versionId,actionId,context,{eventDepth:depth,triggered:true}));
    }
    triggered.push({triggerId:trigger.id,actions});
  }
  /** A module event (combat, world clock) on each container concerned, under its own Ruleset; containers whose Ruleset has no Trigger for it are skipped. */
  emitSystemEvent(eventTypeId,payload,refs){
    if(!systemEventType(eventTypeId))return Promise.reject(new Error(`Not a module event: ${eventTypeId}.`));
    // Module events run one after the other, whoever emits them (the combat hooks, another module): two at once
    // would read the same container and the second write would be refused as a conflict.
    const run=(systemEvents.get(this.adapter)??Promise.resolve()).then(()=>this.#emitSystemEventNow(eventTypeId,payload,refs));
    systemEvents.set(this.adapter,run.catch(()=>{}));
    return run;
  }
  async #emitSystemEventNow(eventTypeId,payload,refs){
    const results=[];
    for(const ref of refs){
      const state=await this.adapter.load(ref),versionId=state.rulesetVersionId;
      if(!versionId||!this.#hasRuleset(versionId)||!(this.ruleset(versionId).triggers??[]).some(trigger=>enabled(trigger)&&trigger.eventTypeId===eventTypeId))continue;
      // One container in error (a Trigger that fails for it) does not stop the event for the others.
      try{results.push({ref,...await this.emitEvent(versionId,eventTypeId,payload,{roles:{self:ref,...(ref.kind==="combat"?{combat:ref}:{})}})});}
      catch(error){console.error(`Rule Them'All | ${eventTypeId} failed for`,ref,error);results.push({ref,error:error?.message??String(error)});}
    }
    return results;
  }
  #eventFilterMatches(filter,event,context){if(!filter)return true;const matches=filter.payloadMatches??{};for(const [key,value] of Object.entries(matches))if(event.payload?.[key]!==value)return false;return true;}
  /** The formula a Roll throws in a context: its first variant whose Condition is true, else its own.
   * Its @data: the Roll's data, the Content used (@content.<field>, a weapon's damage dice),
   * the Action's inputs (@input.<id>) and whatever the caller adds (a Test's inputs as @test.<id>). */
  async #rollFormula(rollDef,context,evaluator,extra={}){
    let formula=rollDef.formula;
    for(const variant of rollDef.variants??[])if(await evaluator.condition(variant.conditionRef,context)){formula=variant.formula;break;}
    const content=await evaluator.currentContent(context);
    return {formula,data:{...clone(rollDef.data??{}),...(content?{content:content.fields}:{}),input:clone(context?.variables?.input??{}),...(context?.variables?.group?{group:{count:context.variables.group.count,best:context.variables.group.best,worst:context.variables.group.worst,sum:context.variables.group.sum,outcomes:clone(context.variables.group.outcomes)}}:{}),...extra}};
  }
  /** Roll operand: the Roll's dice (multiplied by a Formula, e.g. 2 on a critical hit) plus a bonus Formula,
   * then a factor Formula rounded down (half for a resistance), never below the minimum. */
  /** shared: {cache,key}; the dice thrown under that key are reused, while bonus and factor stay per target. */
  async #rollOperand(versionId,operand,context,evaluator,shared=null){
    const ruleset=this.ruleset(versionId),rollDef=ruleset.rolls?.find(x=>x.id===operand.rollRef&&enabled(x));if(!rollDef)throw new Error(`Roll unavailable: ${operand.rollRef}.`);
    const multiplier=operand.multiplierFormulaRef?Number(await evaluator.formula(operand.multiplierFormulaRef,context)):1;
    const bonus=operand.bonusFormulaRef?Number(await evaluator.formula(operand.bonusFormulaRef,context)):0;
    if(!Number.isFinite(bonus))throw new Error(`Roll bonus of ${operand.rollRef} is not a number.`);
    const factor=operand.factorFormulaRef?Number(await evaluator.formula(operand.factorFormulaRef,context)):1;
    if(!Number.isFinite(factor))throw new Error(`Roll factor of ${operand.rollRef} is not a number.`);
    const {formula,data}=await this.#rollFormula(rollDef,context,evaluator);
    let roll=shared?.cache.get(shared.key);
    if(!roll){roll=await this.#throw(versionId,multiplyDice(resolveRollData(formula,data),multiplier),data,context);shared?.cache.set(shared.key,roll);}
    let value=Number(roll.total)+bonus;if(factor!==1)value=Math.floor(value*factor);
    return {value:Number.isFinite(operand.minimum)?Math.max(operand.minimum,value):value,roll:{formula:String(roll.formula??formula),total:Number(roll.total),result:String(roll.result??roll.total??""),bonus,...(factor!==1?{factor}:{})}};
  }
  async #operand(versionId,operand,context,evaluator){if(operand.kind==="literal")return clone(operand.value);if(operand.kind==="parameter")return evaluator.parameter(operand.id);if(operand.kind==="formula")return await evaluator.formula(operand.id,context);if(operand.kind==="reference")return await this.resolveReference(versionId,operand.reference,context,{staged:evaluator.__staged});throw new Error(`Unsupported Effect operand: ${operand.kind}.`);}
  /** pool: {slot, bounds} of a pool written; bounds: those of a value base written. */
  #writeOutput(state,reference,operation,operand,pool=null,bounds=null){const ds=state.definitionStates?.[reference.objectId];if(!ds)throw new Error(`Definition is not instantiated on RuntimeContainer: ${reference.objectId}.`);const cap=reference.capabilityId,id=reference.outputId;let current;
    if(cap==="value"&&id==="value.base")current=Number(ds.capabilityStates.value.base??0);
    else if(cap==="pool"&&id==="pool.current")current=Number(poolSlotState(ds,reference.slotId).current);
    else if(cap==="state"&&id==="state.active")current=Boolean(ds.capabilityStates.state.active);
    else throw new Error(`Mutable runtime output not implemented: ${cap}/${id}.`);
    const op=effectOperationRegistry.get(operation);if(!op)throw new Error(`Unsupported Effect operation: ${operation}.`);let next=op.apply(clone(current),operand);
    if(cap==="pool"){next=boundPoolValue(pool.slot,next,pool.bounds,`${reference.objectId}/${pool.slot.id}`);poolSlotState(ds,reference.slotId).current=next;}
    else if(cap==="value"){next=boundValue(current,Number(next),bounds??{minimum:null,maximum:null});ds.capabilityStates.value.base=next;}else ds.capabilityStates.state.active=Boolean(next);return clone(next);
  }
  /** dice: a Map shared by the targets of one Action use, so each Effect rolls its dice once for all of them. */
  async previewEffect(versionId,effectId,context={},staged=new Map(),dice=null){
    const ruleset=this.ruleset(versionId),effect=ruleset.effects?.find(x=>x.id===effectId&&enabled(x));if(!effect)throw new Error(`Effect unavailable: ${effectId}.`);
    const evaluator=this.evaluator(versionId,staged);evaluator.__staged=staged;const role=effect.targetRole??"target";
    if(effect.targetContentField)return this.#previewContentFieldEffect(versionId,ruleset,effect,context,staged,evaluator,dice);
    // A Formula may name the Definition written (the slot level chosen); the target keeps its capability, output and slot.
    let targetRef=effect.targetRef;
    if(effect.targetDefinitionFormulaRef){const chosen=await evaluator.formula(effect.targetDefinitionFormulaRef,{...context,defaultRole:role}),id=typeof chosen==="string"?chosen:chosen?.objectId;if(!id)throw new Error(`Effect ${effect.id}: its Formula names no Definition.`);targetRef={...effect.targetRef,objectId:id};}
    const target=await this.resolveReference(versionId,targetRef,{...context,defaultRole:role},{forWrite:true,role,staged});const key=this.#refKey(target.containerRef);if(!staged.has(key))staged.set(key,clone(target.state));const state=staged.get(key);let rolled=null,operand;if(effect.operand?.kind==="roll"){rolled=await this.#rollOperand(versionId,effect.operand,context,evaluator,dice?{cache:dice,key:effect.id}:null);operand=rolled.value;}else operand=await this.#operand(versionId,effect.operand,context,evaluator);const before=this.#readOutput(ruleset,state,targetRef);let pool=null;if(targetRef.capabilityId==="pool"){const {slot}=this.#outputContract(ruleset,targetRef);pool={slot,bounds:await this.#poolBounds(slot,{...context,defaultRole:role},evaluator)};}const bounds=targetRef.capabilityId==="value"?await this.#stagedValueBounds(versionId,target.containerRef,state,targetRef.objectId):null;const after=this.#writeOutput(state,targetRef,effect.operation,operand,pool,bounds);return {effectId,before,after,operand,...(rolled?{roll:rolled.roll}:{}),containerRef:target.containerRef};
  }
  /** An Effect on a number field of the Content used (a weapon's ammunition), on the container that owns it. */
  async #previewContentFieldEffect(versionId,ruleset,effect,context,staged,evaluator,dice){
    const used=context?.content;if(!used?.key)throw new Error(`Effect ${effect.id} writes a field of the Content used, and no Content is used.`);
    const {ref,state}=await this.#stagedState(versionId,context,used.role??"self",staged),content=state.contents?.[used.key];if(!content)throw new Error(`Owned Content not found: ${used.key}.`);
    const fieldId=effect.targetContentField,field=ruleset.contentTypes?.find(type=>type.id===content.contentTypeId)?.fields?.[fieldId];
    if(!field||!["integer","number"].includes(field.valueType))throw new Error(`Effect ${effect.id}: Content Type ${content.contentTypeId} has no number field ${fieldId}.`);
    let rolled=null,operand;if(effect.operand?.kind==="roll"){rolled=await this.#rollOperand(versionId,effect.operand,context,evaluator,dice?{cache:dice,key:effect.id}:null);operand=rolled.value;}else operand=await this.#operand(versionId,effect.operand,context,evaluator);
    const template=ruleset.contentTemplates?.find(x=>x.id===content.templateId),before=Number(content.fields?.[fieldId]??template?.data?.[fieldId]??0);
    const op=effectOperationRegistry.get(effect.operation);if(!op)throw new Error(`Unsupported Effect operation: ${effect.operation}.`);
    let after=Number(op.apply(before,operand));if(!Number.isFinite(after))throw new Error(`Effect ${effect.id}: the field ${fieldId} would not be a number.`);if(field.valueType==="integer")after=Math.trunc(after);
    (content.fields??={})[fieldId]=after;
    return {effectId:effect.id,before,after,operand,...(rolled?{roll:rolled.roll}:{}),containerRef:ref,contentKey:used.key,fieldId};
  }
  /** Instantiate one acquired Definition in a container state (CP-16). Returns the new
   * DefinitionState, null when an `ifAbsent` grant is already there, or "present". */
  async #acquireInto(versionId,ruleset,ref,state,acquisition){
    const definition=ruleset.definitions?.find(x=>x.id===acquisition.definitionId&&enabled(x));if(!definition)throw new Error(`Definition unavailable: ${acquisition.definitionId}.`);
    if(state.rulesetVersionId&&state.rulesetVersionId!==versionId)throw new Error(`Runtime container is bound to another Ruleset version: ${state.rulesetVersionId}.`);
    if(state.definitionStates[definition.id]){if(!acquisition.ifAbsent)return "present";await this.#addToState(versionId,ref,state,definition,acquisition.add);return null;}
    assertDefinitionContract(ruleset,definition);
    state.rulesetVersionId=versionId;state.definitionStates[definition.id]=await this.#newDefinitionState(versionId,definition,ref,state,acquisition.initial??{});
    await this.#addToState(versionId,ref,state,definition,acquisition.add);
    return state.definitionStates[definition.id];
  }
  /** A grant's config.add raises the base value, whether the Definition was there or not. */
  async #addToState(versionId,ref,state,definition,add){
    const ds=state.definitionStates[definition.id];
    for(const [key,amount] of Object.entries(add??{})){
      if(key!=="value.base"||!ds.capabilityStates?.value)throw new Error(`Acquisition can only add to value.base of a value Definition: ${definition.id} ${key}.`);
      const value=Number(amount);if(!Number.isFinite(value))throw new Error(`Acquisition add for ${definition.id} is not a number.`);
      const current=Number(ds.capabilityStates.value.base??0);
      // A character being created is bounded once it is built (duringCreation).
      ds.capabilityStates.value.base=this.#creating.has(this.#refKey(normalizeRuntimeContainerRef(ref)))?current+value:boundValue(current,current+value,await this.#stagedValueBounds(versionId,ref,state,definition.id));
    }
  }
  /** content: {key, templateId, contentTypeId}; the same key acquired twice keeps its instance fields. */
  #addContent(versionId,state,content){
    if(!content?.key||!content.templateId)throw new Error("An owned Content needs a key and a templateId.");
    state.rulesetVersionId||=versionId;state.contents??={};
    state.contents[content.key]??={templateId:content.templateId,contentTypeId:content.contentTypeId??null,fields:{}};
  }
  async #stagedState(versionId,context,role,staged){
    const target=roleRef(context,role);if(!target)throw new Error(`EvaluationContext role is missing: ${role}.`);
    const ref=normalizeRuntimeContainerRef(target),key=this.#refKey(ref);
    if(!staged.has(key))staged.set(key,await this.adapter.load(ref,{rulesetVersionId:versionId}));
    return {ref,state:staged.get(key)};
  }
  #duration(ruleset,durationRef){if(!durationRef)return null;const duration=ruleset.durations?.find(x=>x.id===durationRef&&enabled(x));if(!duration)throw new Error(`Duration unavailable: ${durationRef}.`);return startDuration(duration,{worldTime:this.adapter.worldTime(),roundSeconds:this.adapter.roundSeconds()});}
  async #modifierState(versionId,ruleset,modifierRef,context,evaluator,state,{sourceRef,durationState}){
    const modifier=ruleset.modifiers?.find(x=>x.id===modifierRef&&enabled(x));if(!modifier)throw new Error(`Modifier unavailable: ${modifierRef}.`);
    if(modifier.targetRef?.capabilityId!=="value")throw new Error(`Modifier ${modifier.id} must target a value output to be applied persistently.`);
    for(const id of modifier.conditionRefs??[])if(!await evaluator.condition(id,context))return null;
    const source=modifier.valueSource,operand=source.kind==="literal"?source.value:source.kind==="parameter"?evaluator.parameter(source.id):source.kind==="formula"?await evaluator.formula(source.id,context):await this.resolveReference(versionId,source.reference,context,{staged:evaluator.__staged});
    const ds=state.definitionStates[modifier.targetRef.objectId];if(!ds)throw new Error(`Definition is not instantiated on RuntimeContainer: ${modifier.targetRef.objectId}.`);
    const created=createModifierState(modifier,{operand,sourceRef,durationState});(ds.modifiers??=[]).push(created);return created;
  }
  /** CP-28 Action steps after acquisitions: remove states, apply states (with the ModifierStates
   * they own), then apply standalone ModifierStates. Each row joins the Action's changes. */
  async #stageStates(versionId,ruleset,action,context,staged,evaluator,changes){
    const sourceRef={kind:"action",id:action.id};
    // A row may name its state by a Formula (definitionFormulaRef); an empty result skips the row.
    const chosen=async row=>{if(!row.definitionFormulaRef)return row;const value=await evaluator.formula(row.definitionFormulaRef,context),definitionId=typeof value==="string"?value:value?.objectId;return definitionId?{...row,definitionId}:null;};
    for(const listed of action.stateRemovals??[]){
      const removal=await chosen(listed);if(!removal)continue;
      const {ref,state}=await this.#stagedState(versionId,context,removal.targetRole,staged);
      for(const instance of state.stateInstances.filter(x=>x.definitionId===removal.definitionId))changes.push({stateRemoved:removeStateInstance(state,instance.id).id,definitionId:removal.definitionId,containerRef:ref});
    }
    for(const listed of action.stateApplications??[]){
      const application=await chosen(listed);if(!application)continue;
      const definition=ruleset.definitions?.find(x=>x.id===application.definitionId&&enabled(x));if(!definition)throw new Error(`Definition unavailable: ${application.definitionId}.`);
      const {ref,state}=await this.#stagedState(versionId,context,application.targetRole,staged),durationState=this.#duration(ruleset,application.durationRef);
      const existing=state.stateInstances.find(x=>x.definitionId===definition.id&&x.active!==false);
      if(existing&&application.stacking==="ignore")continue;
      if(existing&&["refresh","stack"].includes(application.stacking)){
        if(application.stacking==="stack")existing.stacks+=application.stacks;
        existing.durationState=durationState;
        for(const modifier of Object.values(state.definitionStates).flatMap(ds=>ds.modifiers??[]))if(modifier.sourceRef?.kind==="stateInstance"&&modifier.sourceRef.id===existing.id)modifier.durationState=durationState;
        changes.push({stateApplied:existing.id,definitionId:definition.id,containerRef:ref});continue;
      }
      state.rulesetVersionId||=versionId;
      const instance=createStateInstance({definitionId:definition.id,sourceRef,durationState,stacks:application.stacks,severity:application.severity,worldTime:this.adapter.worldTime()});
      const targetContext={...context,defaultRole:application.targetRole};
      for(const modifierRef of application.modifierRefs??[]){const created=await this.#modifierState(versionId,ruleset,modifierRef,targetContext,evaluator,state,{sourceRef:{kind:"stateInstance",id:instance.id},durationState});if(created)instance.modifierIds.push(created.id);}
      state.stateInstances.push(instance);changes.push({stateApplied:instance.id,definitionId:definition.id,containerRef:ref});
    }
    for(const application of action.modifierApplications??[]){
      const {ref,state}=await this.#stagedState(versionId,context,application.targetRole,staged);
      const created=await this.#modifierState(versionId,ruleset,application.modifierRef,{...context,defaultRole:application.targetRole},evaluator,state,{sourceRef,durationState:this.#duration(ruleset,application.durationRef)});
      if(created)changes.push({modifierApplied:created.id,modifierId:application.modifierRef,containerRef:ref});
    }
  }
  /** Remove one StateInstance (and the ModifierStates it owns) from a container. */
  async removeStateInstance(versionId,containerRef,instanceId,{transactionId=null}={}){
    const tx=this.transaction(versionId,"state.remove",{transactionId,summary:{instanceId}}),state=await tx.load(containerRef);
    const removed=removeStateInstance(state,instanceId);if(!removed)return null;await this.#commit(tx);return clone(removed);
  }
  /** End the StateInstances and ModifierStates of a container whose Duration is over:
   * world time reached, the awaited event happened, or a whileCondition turned false. */
  async expireStates(versionId,containerRef,{worldTime=this.adapter.worldTime(),eventTypeId=null,transactionId=null}={}){
    const ref=normalizeRuntimeContainerRef(containerRef),tx=this.transaction(versionId,"expire",{transactionId,summary:{worldTime,eventTypeId}}),state=await tx.load(ref);
    const context={roles:{self:ref},defaultRole:"self"},evaluator=this.evaluator(versionId,new Map([[this.#refKey(ref),state]]));
    const ended=async durationState=>durationEnded(durationState,{worldTime,eventTypeId})||durationState?.mode==="whileCondition"&&!await evaluator.condition(durationState.conditionRef,context);
    const instances=[];for(const instance of [...state.stateInstances])if(await ended(instance.durationState))instances.push(removeStateInstance(state,instance.id).id);
    const endedModifiers=new Set();for(const ds of Object.values(state.definitionStates))for(const modifier of ds.modifiers??[])if(await ended(modifier.durationState))endedModifiers.add(modifier.id);
    const modifiers=removeModifierStates(state,modifier=>endedModifiers.has(modifier.id)).map(modifier=>modifier.id);
    if(instances.length||modifiers.length)await this.#commit(tx);
    return {stateInstanceIds:instances,modifierStateIds:modifiers};
  }
  /** GM clock: expire states on every container that has timed states (Foundry updateWorldTime). */
  async expireAll({worldTime=this.adapter.worldTime(),eventTypeId=null}={}){
    const results=[];
    for(const ref of await this.adapter.listContainers()){
      const state=await this.adapter.load(ref);
      if(!state.rulesetVersionId||!hasDurations(state)||!this.#hasRuleset(state.rulesetVersionId))continue;
      const result=await this.expireStates(state.rulesetVersionId,ref,{worldTime,eventTypeId});
      if(result.stateInstanceIds.length||result.modifierStateIds.length)results.push({ref,...result});
    }
    return results;
  }
  /** The inputs an Action asks for when it is used, with their allowed values: listed options, or the
   * Definitions of the input's type, as its from says (auto: those the self role holds, when it holds some). */
  async describeActionInputs(versionId,actionId,context={}){
    const ruleset=this.ruleset(versionId),action=ruleset.actions?.find(x=>x.id===actionId&&enabled(x));if(!action)throw new Error(`Action unavailable: ${actionId}.`);
    const self=roleRef(context,"self"),held=self?new Set(Object.keys((await this.adapter.load(self,{rulesetVersionId:versionId})).definitionStates??{})):new Set();
    return (action.inputs??[]).map(input=>{
      let options=clone(input.options??[]);
      if(input.valueType==="reference"){const ofType=(ruleset.definitions??[]).filter(d=>enabled(d)&&d.definitionTypeId===input.definitionTypeId),owned=ofType.filter(d=>held.has(d.id)),from=input.from??"auto";options=(from==="all"?ofType:from==="held"?owned:from==="unheld"?ofType.filter(d=>!held.has(d.id)):owned.length?owned:ofType).map(d=>({value:d.id,labelKey:d.nameKey}));}
      return {id:input.id,labelKey:input.labelKey||input.id,valueType:input.valueType,required:input.required!==false,...(input.defaultValue!==undefined?{defaultValue:clone(input.defaultValue)}:{}),options};
    });
  }
  /** The Action's inputs, checked and completed by their defaults, under variables.input. */
  #actionInputs(ruleset,action,context){
    if(!(action.inputs??[]).length)return context;
    const given=context.variables?.input??{},values={...clone(given)};
    for(const input of action.inputs){
      let value=given[input.id];
      if(value===undefined||value===null||value==="")value=input.defaultValue;
      if(value===undefined){if(input.required)throw new Error(`Action ${action.id} needs a value for ${input.labelKey||input.id}.`);delete values[input.id];continue;}
      if(input.valueType==="reference"){
        const id=typeof value==="string"?value:value?.objectId,definition=ruleset.definitions?.find(d=>d.id===id&&enabled(d));
        if(!definition||definition.definitionTypeId!==input.definitionTypeId)throw new Error(`Action ${action.id}: ${input.labelKey||input.id} must be a Definition of type ${input.definitionTypeId}.`);
        value={objectKind:"definition",objectId:id};
      }else{
        const check=validateTypedValue(input.valueType,"one",false,value);if(!check.valid)throw new Error(`Action ${action.id}: ${input.labelKey||input.id}: ${check.message}`);
        if(input.options?.length&&!input.options.some(option=>option.value===value))throw new Error(`Action ${action.id}: ${JSON.stringify(value)} is not a choice of ${input.labelKey||input.id}.`);
      }
      values[input.id]=value;
    }
    return {...context,variables:{...(context.variables??{}),input:values}};
  }
  /** Roll on a Table: its Roll (variants and @data as for any Roll) plus its bonus Formula, and the row reached. */
  async rollTable(versionId,tableId,context={},evaluator=this.evaluator(versionId)){
    const ruleset=this.ruleset(versionId),table=ruleset.tables?.find(x=>x.id===tableId&&enabled(x));if(!table)throw new Error(`Table unavailable: ${tableId}.`);
    const rollDef=ruleset.rolls?.find(x=>x.id===table.rollRef&&enabled(x));if(!rollDef)throw new Error(`Roll unavailable: ${table.rollRef}.`);
    const {formula,data}=await this.#rollFormula(rollDef,context,evaluator),roll=await this.#throw(versionId,resolveRollData(formula,data),data,context);
    const bonus=table.bonusFormulaRef?Number(await evaluator.formula(table.bonusFormulaRef,context)):0;if(!Number.isFinite(bonus))throw new Error(`Table ${table.id} bonus is not a number.`);
    const total=Number(roll.total)+bonus,row=(table.rows??[]).find(r=>(r.min===null||total>=r.min)&&(r.max===null||total<=r.max))??null;
    return {tableId:table.id,total,roll:{formula:String(roll.formula??formula),total:Number(roll.total),result:String(roll.result??roll.total??""),bonus},row:row?{id:row.id,labelKey:row.labelKey,actionRefs:[...(row.actionRefs??[])]}:null};
  }
  /** previewAction options.acquisitions: extra grants run with the Action's own (a Content's bindings).
   * staged/depth: a follow-up Action (an Outcome's or a Table row's) previews into its parent's staged states.
   * An Action whose targeting is "each" or "shared" runs its Test, Effects, Table and follow-ups once per
   * context.targets entry (costs, acquisitions and Conditions once); "shared" rolls Effect dice once for all. */
  async previewAction(versionId,actionId,context={},{acquisitions=[],content=null,staged:shared=null,depth=0}={}){
    const ruleset=this.ruleset(versionId),action=ruleset.actions?.find(x=>x.id===actionId&&enabled(x));if(!action)throw new Error(`Action unavailable: ${actionId}.`);const staged=shared??new Map(),evaluator=this.evaluator(versionId,staged);evaluator.__staged=staged;context=this.#shared(context);
    context=this.#actionInputs(ruleset,action,context);
    context=await this.#linkedRoles(versionId,ruleset,action,context,staged);
    const many=["each","shared"].includes(action.targeting),targets=many?(Array.isArray(context.targets)?context.targets:[roleRef(context,"target")]).filter(Boolean):null;
    if(many&&!targets.length)throw new Error(`Action ${action.id} needs at least one target.`);
    if(many)context={...context,roles:{...(context.roles??{}),target:targets[0]}};
    for(const conditionId of action.conditionRefs??[])if(!await evaluator.condition(conditionId,context))return {actionId,allowed:false,reason:"condition",conditionId,changes:[]};
    const changes=[];for(const effectId of action.costEffectRefs??[]){const change=await this.previewEffect(versionId,effectId,context,staged);changes.push(change);context=withEffectResult(context,change);}
    if(action.group)context=await this.#groupTest(versionId,ruleset,action,context,staged);
    // Acquisitions come before the Effects, which may then target the new DefinitionStates.
    const acquired=[];
    for(const listed of [...(action.acquisitions??[]),...acquisitions]){
      const role=listed.targetRole??"self",target=roleRef(context,role);if(!target)throw new Error(`EvaluationContext role is missing: ${role}.`);
      let acquisition=listed;
      if(listed.definitionFormulaRef){const chosen=await evaluator.formula(listed.definitionFormulaRef,context),definitionId=typeof chosen==="string"?chosen:chosen?.objectId;if(!definitionId)throw new Error(`Action ${action.id}: the Formula ${listed.definitionFormulaRef} names no Definition to acquire.`);acquisition={...listed,definitionId};}
      const ref=normalizeRuntimeContainerRef(target),key=this.#refKey(ref);
      if(!staged.has(key))staged.set(key,await this.adapter.load(ref,{rulesetVersionId:versionId}));
      const created=await this.#acquireInto(versionId,ruleset,ref,staged.get(key),acquisition);
      if(created==="present")return {actionId,allowed:false,reason:"acquired",definitionId:acquisition.definitionId,changes:[]};
      if(created){changes.push({acquisition:acquisition.definitionId,before:null,after:clone(created),containerRef:ref});acquired.push(acquisition.definitionId);}
      else if(Object.keys(acquisition.add??{}).length)changes.push({acquisitionAdd:acquisition.definitionId,add:clone(acquisition.add),containerRef:ref});
    }
    if(content){const {ref,state}=await this.#stagedState(versionId,context,"self",staged);this.#addContent(versionId,state,content);changes.push({content:content.key,templateId:content.templateId,containerRef:ref});}
    if(action.forEach){
      // Each Definition of the type the role holds, in Ruleset order, that the Condition accepts.
      const {state}=await this.#stagedState(versionId,context,action.forEach.role,staged),runs=[],choices=[];
      for(const definition of ruleset.definitions??[]){
        if(!enabled(definition)||definition.definitionTypeId!==action.forEach.definitionTypeId||!state.definitionStates[definition.id])continue;
        const itemContext={...context,variables:{...(context.variables??{}),each:{definitionId:definition.id,definition:{objectKind:"definition",objectId:definition.id}}}};
        if(action.forEach.conditionRef&&!await evaluator.condition(action.forEach.conditionRef,itemContext))continue;
        const run=await this.#previewOnTarget(versionId,ruleset,action,itemContext,staged,evaluator,changes,acquired,depth);
        runs.push({definitionId:definition.id,allowed:run.allowed,reason:run.reason??null,testResult:run.testResult,tableResult:run.tableResult??null,followUps:run.followUps??[],context:itemContext});
        if(run.choice)choices.push(run.choice);
      }
      return {actionId,allowed:true,testResult:null,tableResult:null,followUps:[],each:runs,choices,changes,acquired,staged,context};
    }
    if(!many){
      const run=await this.#previewOnTarget(versionId,ruleset,action,context,staged,evaluator,changes,acquired,depth);
      if(!run.allowed)return {actionId,allowed:false,reason:run.reason,testResult:run.testResult,changes:[]};
      return {actionId,allowed:true,testResult:run.testResult,tableResult:run.tableResult,followUps:run.followUps,choices:run.choice?[run.choice]:[],changes,acquired,staged,context};
    }
    if(action.targeting==="shared")evaluator.__dice=new Map();
    const runs=[],choices=[];
    for(const target of targets){
      const targetContext={...context,roles:{...context.roles,target}};
      const run=await this.#previewOnTarget(versionId,ruleset,action,targetContext,staged,evaluator,changes,acquired,depth);
      runs.push({target:normalizeRuntimeContainerRef(target),allowed:run.allowed,reason:run.reason??null,testResult:run.testResult,tableResult:run.tableResult??null,followUps:run.followUps??[],context:targetContext});
      if(run.choice)choices.push(run.choice);
    }
    return {actionId,allowed:true,testResult:null,tableResult:null,followUps:[],targets:runs,choices,changes,acquired,staged,context};
  }
  /** The entries of a reference collection slot on a role's container, as container refs (the crew of a vehicle). */
  async #collectionRefs(versionId,ruleset,context,role,definitionId,slotId,staged){
    const definition=ruleset.definitions?.find(x=>x.id===definitionId);if(!definition||!findSlot(definition,"collection",slotId))throw new Error(`Collection slot not found: ${definitionId}/${slotId}.`);
    const {state}=await this.#stagedState(versionId,context,role,staged);
    return collectionSlotState(state.definitionStates?.[definitionId]??{capabilityStates:{}},slotId).entries.filter(entry=>entry.entityRef).map(entry=>normalizeRuntimeContainerRef(entry.entityRef));
  }
  /** Roles the caller did not give, found through a collection of references (the pilot's vehicle). */
  async #linkedRoles(versionId,ruleset,action,context,staged){
    for(const link of action.roleLinks??[]){
      if(roleRef(context,link.role))continue;
      const [first]=await this.#collectionRefs(versionId,ruleset,context,link.fromRole,link.definitionId,link.slotId,staged);
      if(!first)throw new Error(`Action ${action.id}: nothing in ${link.definitionId}/${link.slotId} to act as ${link.role}.`);
      context={...context,roles:{...(context.roles??{}),[link.role]:first}};
    }
    return context;
  }
  /** Group Test: each helper makes the group Test as its self (the Action's self among them unless includeSelf is false);
   * variables.group then holds count, totals, best, worst, sum and outcomes {resultKey: count}, and Rolls read @group. */
  async #groupTest(versionId,ruleset,action,context,staged){
    const group=action.group,self=roleRef(context,"self");
    let helpers=group.helpersFrom?await this.#collectionRefs(versionId,ruleset,context,group.helpersFrom.role,group.helpersFrom.definitionId,group.helpersFrom.slotId,staged):(context.helpers??[]).map(normalizeRuntimeContainerRef);
    if(group.includeSelf&&self)helpers=[normalizeRuntimeContainerRef(self),...helpers.filter(ref=>this.#refKey(ref)!==this.#refKey(normalizeRuntimeContainerRef(self)))];
    const members=[];
    for(const helper of helpers){const result=await this.executeTest(versionId,group.testRef,{...context,roles:{...(context.roles??{}),self:helper,source:helper,leader:self}},{staged});members.push({ref:helper,total:result.total,outcome:result.outcome?.resultKey??null});}
    // Every Outcome of the group Test is counted, 0 included, so a Formula can read any of them.
    const test=ruleset.tests?.find(x=>x.id===group.testRef),totals=members.map(member=>Number(member.total)).filter(Number.isFinite),outcomes={};
    for(const id of [...(test?.outcomeRefs??[]),...(test?.fallbackOutcomeRef?[test.fallbackOutcomeRef]:[])]){const outcome=ruleset.outcomes?.find(x=>x.id===id);if(outcome)outcomes[outcome.resultKey]=0;}
    for(const member of members)if(member.outcome)outcomes[member.outcome]=(outcomes[member.outcome]??0)+1;
    const variables={count:members.length,totals,best:totals.length?Math.max(...totals):0,worst:totals.length?Math.min(...totals):0,sum:totals.reduce((a,b)=>a+b,0),outcomes,members};
    return {...context,variables:{...(context.variables??{}),group:variables}};
  }
  /** One target's part of an Action: Test and its Outcome, states and Modifiers, Effects, Table, follow-ups.
   * An Outcome that stops the Action leaves this target unchanged. */
  async #previewOnTarget(versionId,ruleset,action,context,staged,evaluator,changes,acquired,depth){
    let testResult=null,effectRefs=[...(action.effectRefs??[])],next=[],choice=null;
    if(action.testRef){testResult=await this.executeTest(versionId,action.testRef,context,{staged});const mapping=(action.outcomeMappings??[]).find(m=>m?.outcomeId===testResult.outcome?.id||m?.resultKey===testResult.outcome?.resultKey);if(mapping){if(Array.isArray(mapping.effectRefs))effectRefs=mapping.effectRefs;if(mapping.block===true)return {allowed:false,reason:"outcome",testResult};next=[...(mapping.actionRefs??[])];choice=mapping.choice??null;}}
    await this.#stageStates(versionId,ruleset,action,context,staged,evaluator,changes);
    // Effects read the Test under variables.test (total, margin, natural, outcome), e.g. damage that grows with the margin.
    let effectContext=withTestResult(context,testResult);
    for(const effectId of effectRefs){const change=await this.previewEffect(versionId,effectId,effectContext,staged,evaluator.__dice);changes.push(change);effectContext=withEffectResult(effectContext,change);}
    // A turn order change is no container write: it lists who moves and how, and the commit hands it to the combat tracker.
    if(action.turnOrder){const ref=roleRef(effectContext,action.turnOrder.role);if(!ref)throw new Error(`EvaluationContext role is missing: ${action.turnOrder.role}.`);
      const value=action.turnOrder.formulaRef?Number(await evaluator.formula(action.turnOrder.formulaRef,effectContext)):null;if(value!==null&&!Number.isFinite(value))throw new Error(`Action ${action.id}: the turn order Formula is not a number.`);
      changes.push({turnOrder:{move:action.turnOrder.move,value},turnRef:normalizeRuntimeContainerRef(ref)});}
    // Then the Table, whose row adds its Actions to the Outcome's: each follow-up previews on a copy of the
    // staged states, kept only when it is allowed (a follow-up refused by its Conditions changes nothing).
    let tableResult=null,followContext=effectContext;
    if(action.tableRef){tableResult=await this.rollTable(versionId,action.tableRef,effectContext,evaluator);next.push(...(tableResult.row?.actionRefs??[]));followContext={...effectContext,variables:{...(effectContext.variables??{}),table:{tableId:tableResult.tableId,total:tableResult.total,rowId:tableResult.row?.id??null}}};}
    if(next.length&&depth>=10)throw new Error("Rule Them'All follow-up Action depth exceeded.");
    const followUps=[];
    for(const followId of next){
      const copy=new Map([...staged].map(([key,state])=>[key,clone(state)])),sub=await this.previewAction(versionId,followId,followContext,{staged:copy,depth:depth+1});
      followUps.push({actionId:followId,allowed:sub.allowed,reason:sub.reason??null,testResult:sub.testResult??null,tableResult:sub.tableResult??null,followUps:sub.followUps??[],targets:sub.targets,context:sub.context??null});
      if(!sub.allowed)continue;
      for(const [key,state] of copy)staged.set(key,state);
      changes.push(...sub.changes);acquired.push(...sub.acquired);
    }
    // A choice is offered once the use is committed, with the context its Actions will run in (the Test result included).
    return {allowed:true,testResult,tableResult,followUps,...(choice?{choice:{count:choice.count,actionIds:[...choice.actionRefs],context:followContext}}:{})};
  }
  /** triggered: run by a Trigger, so no user chose it and only write permissions apply. */
  async executeAction(versionId,actionId,context={},{preview=false,eventDepth=0,transactionId=null,triggered=false,acquisitions=[],content=null}={}){
    context=this.#shared(context);
    if(!triggered)await this.#require(versionId,"execute",{objectKind:"action",objectId:actionId},roleRef(context,"self")??roleRef(context,context.defaultRole??"self"),context);
    context={...context,[DICE]:{log:[],keep:null}};
    const plan=await this.previewAction(versionId,actionId,context,{acquisitions,content});if(preview||!plan.allowed)return withoutStaging(plan);
    const dice=context[DICE].log;context=plan.context;
    // Staged states were read once by the preview: the commit expects their revision unchanged.
    const tx=this.transaction(versionId,"action",{transactionId,actor:roleRef(context,"self")??roleRef(context,context.defaultRole??"self"),summary:{actionId,outcomeKey:plan.testResult?.outcome?.resultKey??null}});
    for(const [key,state] of plan.staged){const change=plan.changes.find(x=>x.containerRef&&this.#refKey(x.containerRef)===key);if(change)tx.stage(change.containerRef,state);}
    const committed=await this.#commit(tx);
    const strip=list=>list.map(({context:_context,followUps:inner=[],targets,...rest})=>({...rest,followUps:strip(inner),...(targets?{targets:strip(targets)}:{})})),followUps=strip(plan.followUps);
    // use: what a reroll or a reaction needs to undo and replay this use, the dice thrown included.
    const use={actionId,transactionId:committed.transactionId,context:plainContext(context),dice:clone(dice),rerollCount:0};
    const choices=(plan.choices??[]).map(choice=>({actionId,count:choice.count,actionIds:choice.actionIds,context:plainContext(choice.context),cause:clone(use)}));
    const result={actionId,allowed:true,testResult:plan.testResult??null,tableResult:plan.tableResult??null,followUps,...(plan.targets?{targets:strip(plan.targets)}:{}),...(plan.each?{each:strip(plan.each)}:{}),choices,changes:plan.changes,acquired:plan.acquired,committed:true,duplicate:committed.duplicate,transactionId:committed.transactionId,ledgerEntryIds:committed.entries.map(entry=>entry.id),use,events:[],...this.#chatOffer(versionId,actionId,context,plan.testResult)};
    if(committed.duplicate)return result;
    if(this.adapter.activeCombat?.()&&this.adapter.changeTurnOrder)for(const change of plan.changes)if(change.turnOrder)await this.adapter.changeTurnOrder(change.turnRef,change.turnOrder);
    for(const offer of choices)this.hooks?.callAll?.(RUNTIME_HOOKS.choiceOffered,clone(offer));
    this.hooks?.callAll?.(RUNTIME_HOOKS.actionExecuted,clone(result),context);
    await this.#emitActionEvents(versionId,{actionId,testResult:plan.testResult,context:{...context,cause:use},followUps:plan.followUps,targets:plan.targets??plan.each},eventDepth,result.events);return result;
  }
  /** The buttons an Action's chat card offers (Action.chatActions): what a button needs to run its Action later. previous:
   * the result the follow-up reads (variables.previous: total, margin, target, outcome, roll, natural). */
  #chatOffer(versionId,actionId,context,testResult){
    const action=this.ruleset(versionId).actions?.find(x=>x.id===actionId);if(!action?.chatActions?.length)return {};
    const previous={total:testResult?.total??null,margin:testResult?.margin??null,target:testResult?.target??null,outcome:testResult?.outcome?.resultKey??null,roll:testResult?.roll?.total??null,natural:testResult?.roll?.natural??null};
    return {chatOffer:{rulesetVersionId:versionId,actionId,context:plainContext(context),previous,buttons:action.chatActions.map(({actionRef,who},index)=>({index,actionId:actionRef,who}))}};
  }
  /** The context a chat button runs its Action in. who "target": the target answers (it is self, the user of the first
   * Action its target); as names which target, one of the first Action's. Otherwise the first Action's roles. */
  #chatContext(versionId,offer,index,as){
    const action=this.ruleset(versionId).actions?.find(x=>x.id===offer?.actionId),button=action?.chatActions?.[index];
    if(!button)throw new Error("This chat button is not one of the Action's.");
    const context=clone(offer.context??{}),variables={...(context.variables??{}),previous:clone(offer.previous??{})};
    if(button.who!=="target")return {button,context:{...context,variables}};
    const targets=[context.roles?.target,...(context.targets??[])].filter(Boolean).map(normalizeRuntimeContainerRef),chosen=as?normalizeRuntimeContainerRef(as):null;
    if(!chosen||!targets.some(ref=>this.#refKey(ref)===this.#refKey(chosen)))throw new Error("Only a target of the Action can answer it.");
    const user=context.roles?.self??null;
    return {button,context:{roles:{self:chosen,source:chosen,owner:chosen,...(user?{target:user}:{})},defaultRole:"self",variables:{previous:variables.previous},...(context.userContext?{userContext:context.userContext}:{})}};
  }
  /** A chat card's button (see #chatOffer): who may press it is checked, then its Action runs in its own transaction. */
  async runChatAction(versionId,offer,index,{as=null,transactionId=null}={}){
    const {button,context}=this.#chatContext(versionId,offer,index,as);
    const subject=await this.#subject(button.who==="gm"?null:context.roles?.self??null);
    if(!subject?.isGM&&(button.who==="gm"||subject?.ownership!=="owner"))throw new Error(button.who==="gm"?"Only the GM can use this button.":"You do not own the character this button acts for.");
    return this.executeAction(versionId,button.actionRef,context,{transactionId});
  }
  /** The player's pick on a choice an Action offered (executeAction result.choices): count distinct Actions among
   * those offered, run in order in the offer's context, each one its own transaction. */
  async chooseActions(versionId,offer,actionIds,{transactionId=null}={}){
    const action=this.ruleset(versionId).actions?.find(x=>x.id===offer?.actionId);
    const offered=new Set((action?.outcomeMappings??[]).flatMap(mapping=>mapping?.choice?.actionRefs??[]));
    if(!Array.isArray(actionIds)||new Set(actionIds).size!==actionIds.length)throw new Error("Choose each Action once.");
    if(actionIds.length!==offer.count)throw new Error(`Choose ${offer.count} Action(s), not ${actionIds.length}.`);
    for(const id of actionIds)if(!offer.actionIds.includes(id)||!offered.has(id))throw new Error(`${id} is not one of the choices offered.`);
    const results=[];
    for(const [index,id] of actionIds.entries())results.push(await this.executeAction(versionId,id,{...clone(offer.context),cause:clone(offer.cause)},{transactionId:transactionId?`${transactionId}-${index}`:null}));
    return results;
  }
  /** Reroll: undo one use of an Action and replay it with new dice, in one transaction with the reroll Action's
   * own costs. original: {actionId, transactionId, context, rerollCount?} as the first use returned them.
   * The replay and the reroll Action read variables.reroll.count (1 for the first reroll), so a Condition can
   * cap the rerolls; a use already rerolled is refused, its reroll can be rerolled in turn. */
  async rerollAction(versionId,rerollActionId,original={},context={},{transactionId=null,triggered=false,eventDepth=0}={}){
    const ruleset=this.ruleset(versionId),reroll=ruleset.actions?.find(x=>x.id===rerollActionId&&enabled(x));
    if(!reroll?.reroll)throw new Error(`Not a reroll Action: ${rerollActionId}.`);
    const {actionId,transactionId:originalId}=original,originalContext=this.#shared(original.context??{});context=this.#shared(context);
    const action=ruleset.actions?.find(x=>x.id===actionId&&enabled(x));if(!action)throw new Error(`Action unavailable: ${actionId}.`);
    if(!originalId)throw new Error("A reroll needs the transaction of the use it replaces.");
    if(reroll.reroll.actionRefs.length?!reroll.reroll.actionRefs.includes(actionId):!action.testRef)throw new Error(`${rerollActionId} cannot reroll ${actionId}.`);
    if(!triggered)await this.#require(versionId,"execute",{objectKind:"action",objectId:rerollActionId},roleRef(context,"self"),context);
    if(!triggered)await this.#require(versionId,"execute",{objectKind:"action",objectId:actionId},roleRef(originalContext,"self"),originalContext);
    // Undo the first use on every container it wrote, provided nothing changed them since. Of a reroll,
    // only its replay is undone: the use it replaced stays undone and its costs stay paid.
    const staged=new Map(),refs=new Map();let count=Number(original.rerollCount??0)+1;
    for(const ref of this.writeTargets("rerollAction",[versionId,rerollActionId,original,context])){
      const key=this.#refKey(ref),ledger=await this.adapter.loadLedger(ref);
      if(ledger.some(entry=>entry.corrects===originalId))throw new RuntimeTransactionError(TRANSACTION_ERRORS.compensation,`This use of ${actionId} was already rerolled.`,{transactionId:originalId});
      const entries=ledger.filter(entry=>entry.transactionId===originalId&&(entry.part??"action")==="action");if(!entries.length)continue;
      const state=await this.adapter.load(ref,{rulesetVersionId:versionId});
      for(const entry of entries.reverse()){
        if(JSON.stringify(applyLedgerChanges(clone(state),entry.changes,"after"))!==JSON.stringify(state))throw new RuntimeTransactionError(TRANSACTION_ERRORS.compensation,`Runtime container changed after the use of ${actionId}; it can no longer be rerolled.`,{transactionId:originalId});
        applyLedgerChanges(state,entry.changes,"before");count=Math.max(count,Number(entry.summary?.rerollCount??0)+1);
      }
      staged.set(key,state);refs.set(key,ref);
    }
    const snapshot=()=>new Map([...staged].map(([key,state])=>[key,clone(state)])),undone=snapshot();
    const rerollContext={...context,variables:{...(context.variables??{}),reroll:{count,actionId}}};
    const paid=await this.previewAction(versionId,rerollActionId,rerollContext,{staged});
    if(!paid.allowed)return withoutStaging(paid);
    const afterCost=snapshot();
    // keepDice: the replay takes back the dice of the use it replaces (a reaction that changes the target, not the roll).
    // dice: the replay takes back the same rolls with only the matching dice thrown again, or set to a Formula's value.
    const keep=new Map(),partial=reroll.reroll.dice;if(reroll.reroll.keepDice||partial)for(const {formula,roll} of original.dice??[])keep.set(formula,[...(keep.get(formula)??[]),roll]);
    const replaceWith=partial?.replaceFormulaRef?Number(await this.evaluateFormula(versionId,partial.replaceFormulaRef,paid.context)):null;
    if(replaceWith!==null&&!Number.isFinite(replaceWith))throw new Error(`${rerollActionId}: the value given to the dice is not a number.`);
    // The replay sees the reroll Action's own inputs (the Luck points spent) under variables.reroll.input.
    const replayContext={...originalContext,variables:{...(originalContext.variables??{}),reroll:{count,actionId,rerollActionId,input:clone(paid.context?.variables?.input??{})}},[DICE]:{log:[],keep,...(partial?{some:{filter:{group:partial.group,compare:partial.compare,value:partial.value},replaceWith}}:{})}};
    const plan=await this.previewAction(versionId,actionId,replayContext,{staged});
    if(!plan.allowed)return withoutStaging(plan);
    for(const change of [...paid.changes,...plan.changes])if(change.containerRef)refs.set(this.#refKey(change.containerRef),normalizeRuntimeContainerRef(change.containerRef));
    const tx=this.transaction(versionId,"reroll",{transactionId,corrects:originalId,actor:roleRef(originalContext,"self"),summary:{actionId,rerollActionId,rerollOf:originalId,rerollCount:count,outcomeKey:plan.testResult?.outcome?.resultKey??null}});
    // One ledger entry per part: the undone use, the reroll's costs, the replay (the part a later reroll undoes).
    for(const [key,ref] of refs)if(staged.has(key)){
      const steps=[["undo",undone],["cost",afterCost]].filter(([,states])=>states.has(key)).map(([part,states])=>({part,state:states.get(key)}));
      const state=staged.get(key);tx.stage(ref,state,(steps[0]?.state??state).runtimeRevision,{steps,part:"action"});
    }
    const committed=await this.#commit(tx);
    const strip=list=>list.map(({context:_context,followUps:inner=[],targets,...rest})=>({...rest,followUps:strip(inner),...(targets?{targets:strip(targets)}:{})}));
    const use={actionId,transactionId:committed.transactionId,context:clone(originalContext),dice:clone(replayContext[DICE].log),rerollCount:count};
    const result={actionId,rerollActionId,allowed:true,rerollCount:count,use,testResult:plan.testResult??null,tableResult:plan.tableResult??null,followUps:strip(plan.followUps),...(plan.targets?{targets:strip(plan.targets)}:{}),changes:[...paid.changes,...plan.changes],committed:true,duplicate:committed.duplicate,transactionId:committed.transactionId,ledgerEntryIds:committed.entries.map(entry=>entry.id),events:[]};
    if(committed.duplicate)return result;
    this.hooks?.callAll?.(RUNTIME_HOOKS.actionExecuted,clone(result),replayContext);
    await this.#emitActionEvents(versionId,{actionId:rerollActionId,testResult:paid.testResult,context:paid.context,followUps:paid.followUps,targets:paid.targets},eventDepth,result.events);
    await this.#emitActionEvents(versionId,{actionId,testResult:plan.testResult,context:{...plan.context,cause:use},followUps:plan.followUps,targets:plan.targets??plan.each},eventDepth,result.events);
    return result;
  }
  /** Initiative of one container under its Ruleset: the initiative Test total, or a row drawn from the initiative
   * Table among those not drawn yet this round (drawn: their ids; a deck of cards), whose Actions then run for the
   * container (a joker's bonus). The tie-break Formula adds hundredths (Dexterity 14 makes 17 into 17.14). null without initiative. */
  /** A value changed on a sheet (CP-30 WriteIntent): see sheet-writes.mjs. */
  async writeSheetValue(versionId,containerRef,intent){return writeSheetValue(this,versionId,containerRef,intent);}
  async rollInitiative(versionId,containerRef,{drawn=[]}={}){
    const ruleset=this.ruleset(versionId),initiative=ruleset.initiative;if(!initiative?.testRef&&!initiative?.tableRef)return null;
    const ref=normalizeRuntimeContainerRef(containerRef),context=this.#shared({roles:{self:ref,source:ref},defaultRole:"self"});
    let total,testResult=null,row=null;
    if(initiative.testRef){testResult=await this.executeTest(versionId,initiative.testRef,context);total=Number(testResult.total);}
    else{
      const table=ruleset.tables?.find(x=>x.id===initiative.tableRef&&enabled(x));if(!table)throw new Error(`Table unavailable: ${initiative.tableRef}.`);
      const left=(table.rows??[]).filter(r=>!drawn.includes(r.id));if(!left.length)throw new Error(`Every row of ${table.id} is drawn this round.`);
      row=left[Math.max(0,Math.min(left.length-1,Number((await this.roll(`1d${left.length}`)).total)-1))];
      total=Number(row.max??row.min??0);
      for(const actionId of row.actionRefs??[])await this.executeAction(versionId,actionId,context,{triggered:true});
    }
    const tieBreak=initiative.tieBreakFormulaRef?Number(await this.evaluateFormula(versionId,initiative.tieBreakFormulaRef,context)):0;
    if(!Number.isFinite(total)||!Number.isFinite(tieBreak))throw new Error("Initiative is not a number.");
    return {initiative:Math.round((total+tieBreak/100)*100)/100,eachRound:initiative.eachRound===true,bySide:initiative.bySide===true,testResult,...(row?{rowId:row.id,labelKey:row.labelKey}:{})};
  }
  /** A Progression System seen from one Actor: per advancement, the Definitions it can raise there with
   * their value, next cost and whether it is allowed now; per milestone, whether it is reached or applied. */
  async describeProgression(versionId,systemId,containerRef){
    const ruleset=this.ruleset(versionId),system=this.#progression(ruleset,systemId),ref=normalizeRuntimeContainerRef(containerRef);
    const state=await this.adapter.load(ref,{rulesetVersionId:versionId}),staged=new Map([[this.#refKey(ref),state]]),evaluator=this.evaluator(versionId,staged),context={roles:{self:ref},defaultRole:"self"};
    const advancements=[];
    for(const advancement of system.advancements??[]){
      const targets=[];
      for(const definitionId of this.#advanceTargets(ruleset,advancement,state)){const quote=await this.#advanceQuote(versionId,ruleset,advancement,definitionId,state,context,evaluator,staged);targets.push({definitionId,...quote});}
      advancements.push({id:advancement.id,labelKey:advancement.labelKey||advancement.id,targets});
    }
    const milestones=[];
    for(const milestone of system.milestones??[]){
      const applied=state.milestones.includes(`${system.id}/${milestone.id}`);
      milestones.push({id:milestone.id,labelKey:milestone.labelKey||milestone.id,applied,reached:applied||await evaluator.condition(milestone.conditionRef,context),inputs:milestone.actionRef?await this.describeActionInputs(versionId,milestone.actionRef,context):[]});
    }
    return {progressionSystemId:system.id,advancements,milestones};
  }
  /** Buy one advancement on one Definition: the currency pays the cost Formula, value.base rises by step, in one transaction. */
  async advance(versionId,systemId,containerRef,advancementId,definitionId,{transactionId=null}={}){
    const ruleset=this.ruleset(versionId),system=this.#progression(ruleset,systemId),advancement=system.advancements?.find(x=>x.id===advancementId);
    if(!advancement)throw new Error(`Advancement unavailable: ${advancementId}.`);
    const ref=normalizeRuntimeContainerRef(containerRef),tx=this.transaction(versionId,"advance",{transactionId,summary:{progressionSystemId:system.id,advancementId,definitionId}}),state=await tx.load(ref);
    if(!this.#advanceTargets(ruleset,advancement,state).includes(definitionId))throw new Error(`${advancement.labelKey||advancement.id} cannot raise ${definitionId} here.`);
    const staged=new Map([[this.#refKey(ref),state]]),evaluator=this.evaluator(versionId,staged),context={roles:{self:ref},defaultRole:"self"};
    const quote=await this.#advanceQuote(versionId,ruleset,advancement,definitionId,state,context,evaluator,staged);
    if(!quote.allowed)return {allowed:false,reason:quote.reason,...quote};
    const currency=advancement.currencyRef;let pool=null;
    if(currency.capabilityId==="pool"){const {slot}=this.#outputContract(ruleset,currency);pool={slot,bounds:await this.#poolBounds(slot,context,evaluator)};}
    this.#writeOutput(state,currency,"subtract",quote.cost,pool,currency.capabilityId==="value"?await this.#stagedValueBounds(versionId,ref,state,currency.objectId):null);
    state.definitionStates[definitionId].capabilityStates.value.base=quote.next;
    const committed=await this.#commit(tx);
    return {allowed:true,definitionId,before:quote.current,after:quote.next,cost:quote.cost,transactionId:committed.transactionId,ledgerEntryIds:committed.entries.map(entry=>entry.id)};
  }
  /** Apply every milestone reached and not yet applied, in order: its Definitions, then its Action
   * (inputs: choices[milestoneId]), all in one transaction. A milestone whose Action is refused stops there. */
  async applyMilestones(versionId,systemId,containerRef,{choices={},transactionId=null}={}){
    const ruleset=this.ruleset(versionId),system=this.#progression(ruleset,systemId),ref=normalizeRuntimeContainerRef(containerRef),key=this.#refKey(ref);
    const staged=new Map([[key,await this.adapter.load(ref,{rulesetVersionId:versionId})]]),evaluator=this.evaluator(versionId,staged),context={roles:{self:ref,source:ref},defaultRole:"self"};
    const applied=[],changes=[];let stopped=null;
    for(const milestone of system.milestones??[]){
      const mark=`${system.id}/${milestone.id}`,state=staged.get(key);
      if(state.milestones.includes(mark)||!await evaluator.condition(milestone.conditionRef,context))continue;
      const copy=new Map([...staged].map(([k,s])=>[k,clone(s)]));
      // A state the milestone grants is held from then on (a class feature): it starts active.
      for(const definitionId of milestone.definitionIds??[]){const granted=ruleset.definitions?.find(d=>d.id===definitionId),initial=(granted?.capabilities??[]).includes("state")?{"state.active":true}:{};const created=await this.#acquireInto(versionId,ruleset,ref,copy.get(key),{definitionId,initial,ifAbsent:true});if(created)changes.push({acquisition:definitionId,containerRef:ref});}
      if(milestone.actionRef){
        const plan=await this.previewAction(versionId,milestone.actionRef,{...context,variables:{input:clone(choices[milestone.id]??{})}},{staged:copy});
        if(!plan.allowed){stopped={milestoneId:milestone.id,reason:plan.reason,conditionId:plan.conditionId??null};break;}
        changes.push(...plan.changes);
      }
      copy.get(key).milestones.push(mark);
      for(const [k,s] of copy)staged.set(k,s);applied.push(milestone.id);
    }
    if(!applied.length)return {applied,stopped,changes:[]};
    const tx=this.transaction(versionId,"milestones",{transactionId,summary:{progressionSystemId:system.id,milestoneIds:applied}});
    const refs=new Map([[key,ref],...changes.filter(change=>change.containerRef).map(change=>[this.#refKey(change.containerRef),normalizeRuntimeContainerRef(change.containerRef)])]);
    for(const [k,r] of refs)if(staged.has(k))tx.stage(r,staged.get(k));
    const committed=await this.#commit(tx);
    return {applied,stopped,changes,transactionId:committed.transactionId,ledgerEntryIds:committed.entries.map(entry=>entry.id)};
  }
  #progression(ruleset,systemId){const system=ruleset.progressionSystems?.find(x=>x.id===systemId&&enabled(x));if(!system)throw new Error(`Progression System unavailable: ${systemId}.`);return system;}
  /** The Definitions an advancement can raise on this container: those listed or of its type, held, with a value. */
  #advanceTargets(ruleset,advancement,state){
    return (ruleset.definitions??[]).filter(definition=>enabled(definition)&&(advancement.definitionIds.includes(definition.id)||definition.definitionTypeId===advancement.definitionTypeId)&&state.definitionStates[definition.id]?.capabilityStates?.value).map(definition=>definition.id);
  }
  async #advanceQuote(versionId,ruleset,advancement,definitionId,state,context,evaluator,staged){
    const current=Number(state.definitionStates[definitionId].capabilityStates.value.base??0),next=current+advancement.step;
    const scope={...context,variables:{advance:{definitionId,definition:{objectKind:"definition",objectId:definitionId},current,next}}};
    const cost=Number(await evaluator.formula(advancement.costFormulaRef,scope));if(!Number.isFinite(cost)||cost<0)throw new Error(`${advancement.labelKey||advancement.id}: the cost is not a number of 0 or more.`);
    const own=advancement.maximumFormulaRef?Number(await evaluator.formula(advancement.maximumFormulaRef,scope)):null,bound=(await this.#valueBounds(ruleset,ruleset.definitions.find(x=>x.id===definitionId),context,evaluator)).maximum;
    // The advancement's own maximum and the value's maximum both stop it; a value already above its maximum cannot rise further.
    const maximum=own!==null&&bound!==null?Math.min(own,Math.max(bound,current)):own??(bound===null?null:Math.max(bound,current));
    const funds=Number(await this.resolveReference(versionId,advancement.currencyRef,context,{staged}));
    const reason=maximum!==null&&next>maximum?"maximum":advancement.conditionRef&&!await evaluator.condition(advancement.conditionRef,scope)?"condition":funds<cost?"cost":null;
    return {current,next,cost,maximum,funds,allowed:!reason,reason};
  }
  /** The payload fields the Action gives an event it emits: each declared field the Action sets, from a Formula
   * (computed in the Action's context, after its Effects) or a fixed value. */
  async #eventPayload(versionId,action,eventTypeId,context){
    const fields=this.ruleset(versionId).eventTypes?.find(x=>x.id===eventTypeId)?.payloadFields??{},values=action.eventPayloads?.[eventTypeId]??{},payload={};
    for(const fieldId of Object.keys(fields)){const source=values[fieldId];if(!source)continue;payload[fieldId]=Object.hasOwn(source,"literal")?clone(source.literal):await this.evaluateFormula(versionId,source.formulaRef,context);}
    return payload;
  }
  /** After the commit: the events of the Action, then those of each follow-up that ran, each with its own context.
   * An Action on several targets emits its events once per target its Outcome let through. */
  async #emitActionEvents(versionId,{actionId,testResult,context,followUps=[],targets=null},eventDepth,out){
    const cause=context?.cause??null,withCause=entry=>({...entry,context:{...(entry.context??{}),cause}});
    if(targets){for(const run of targets)if(run.allowed)await this.#emitActionEvents(versionId,withCause({actionId,...run}),eventDepth,out);return;}
    const action=this.ruleset(versionId).actions?.find(x=>x.id===actionId);
    for(const eventTypeId of action?.eventTypeRefs??[]){const payload={...await this.#eventPayload(versionId,action,eventTypeId,withTestResult(context,testResult)),actionId,outcomeKey:testResult?.outcome?.resultKey??null};const emitted=await this.emitEvent(versionId,eventTypeId,payload,context,{depth:eventDepth+1});out.push({eventTypeId,actionId,triggered:emitted.triggered});}
    for(const follow of followUps)if(follow.allowed)await this.#emitActionEvents(versionId,withCause(follow),eventDepth,out);
  }
}
