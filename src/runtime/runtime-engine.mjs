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
import {SLOT_CAPABILITIES,requireSlot,poolSlotState,collectionSlotState,boundPoolValue,initialSlotStates,prepareCollectionEntry,assertCollectionRoom,assertCollectionMinimum} from "./capability-slot-runtime.mjs";

const clone=v=>copyJSON(v);
const roleRef=(context,role)=>context?.roles?.[role]??null;
const enabled=(entry)=>entry&&entry.enabled!==false;
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
  /** userId: the user the rules are checked for (null = the adapter's current user). */
  constructor({configurator,adapter,hooks=globalThis.Hooks,rulesetSource="published",userId=null}={}){if(!configurator)throw new Error("RuntimeEngine requires configurator API.");if(!adapter)throw new Error("RuntimeEngine requires a runtime adapter.");this.configurator=configurator;this.adapter=adapter;this.hooks=hooks;this.rulesetSource=rulesetSource;this.userId=userId;}
  ruleset(versionId){return resolveRuntimeRuleset(this.configurator,versionId,{source:this.rulesetSource});}
  /** Same engine, checking the rules for another user (the GM serving a player's request). */
  forUser(userId){return new RuntimeEngine({configurator:this.configurator,adapter:this.adapter,hooks:this.hooks,rulesetSource:this.rulesetSource,userId});}
  #subject(ref){return this.adapter.subject(ref?normalizeRuntimeContainerRef(ref):null,this.userId??undefined);}
  /** CP-11 decision for one operation on one Ruleset object, for this engine's user on a container. */
  async authorize(versionId,operation,target,containerRef=null,context=null){
    const subject=await this.#subject(containerRef),evaluator=this.evaluator(versionId);
    const conditionContext=context??(containerRef?{roles:{self:normalizeRuntimeContainerRef(containerRef)},defaultRole:"self"}:{});
    return resolvePermission(this.ruleset(versionId).permissionPolicies,{operation,target,subject,condition:id=>evaluator.condition(id,conditionContext)});
  }
  async #require(versionId,operation,target,containerRef,context=null){
    const decision=await this.authorize(versionId,operation,target,containerRef,context);
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
  /** Every persistent runtime write goes through one transaction (CP-08, CP-18). */
  transaction(versionId,kind,{transactionId=null,summary=null,corrects=null}={}){
    const target=change=>change.scope==="content"?{objectKind:"contentTemplate",objectId:(change.after??change.before)?.templateId}:{objectKind:"definition",objectId:change.scope==="definition"?change.id:(change.after??change.before)?.definitionId};
    const authorize=async(ref,changes)=>{for(const change of changes)await this.#require(versionId,"write",target(change),ref);};
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
    if(method==="transferCollectionEntry")return [args[1]?.from?.containerRef,args[1]?.to?.containerRef].filter(Boolean).map(normalizeRuntimeContainerRef);
    if(method==="acquire"){const ref=normalizeRuntimeContainerRef(args[1]),{actionId=null,context={}}=args[2]??{};return actionId?[ref,...this.writeTargets("executeAction",[versionId,actionId,{...context,roles:{...(context.roles??{}),self:ref,source:ref}}])]:[ref];}
    if(method!=="executeAction")return [normalizeRuntimeContainerRef(args[1])];
    const ruleset=this.ruleset(versionId),context=args[2]??{},roles=new Set(),seen=new Set();
    const visit=actionId=>{
      if(seen.has(actionId))return;seen.add(actionId);
      const action=ruleset.actions?.find(x=>x.id===actionId);if(!action)return;
      // Follow-ups write in the same transaction: an Outcome's Actions and every row of the Action's Table.
      for(const mapping of action.outcomeMappings??[])(mapping?.actionRefs??[]).forEach(visit);
      if(action.tableRef)for(const row of ruleset.tables?.find(x=>x.id===action.tableRef)?.rows??[])(row.actionRefs??[]).forEach(visit);
      const effectIds=[...(action.costEffectRefs??[]),...(action.effectRefs??[]),...(action.outcomeMappings??[]).flatMap(m=>m?.effectRefs??[])];
      for(const id of effectIds){const effect=ruleset.effects?.find(x=>x.id===id);if(effect)roles.add(effect.targetRole??"target");}
      for(const eventTypeId of action.eventTypeRefs??[])for(const trigger of ruleset.triggers??[])if(trigger.eventTypeId===eventTypeId)(trigger.actionRefs??[]).forEach(visit);
    };
    visit(args[1]);
    return [...roles].map(role=>roleRef(context,role)).filter(Boolean).map(normalizeRuntimeContainerRef);
  }
  async needsGM(method,args){for(const ref of this.writeTargets(method,args))if(!await this.adapter.canWrite(ref))return true;return false;}
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
    if(ds.capabilityStates?.value&&base!==undefined)ds.capabilityStates.value.base=Number(base);
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
  async resolveReference(versionId,target,context,{forWrite=false,role=null,staged=null,skipBinding=false}={}){const ruleset=this.ruleset(versionId);const runtime=toRuntimeReference(target,role??context?.defaultRole??"self"),reference=runtime.reference;const resolved=resolveContainer(runtime,context);context=resolved.context;const selectedRole=resolved.role,n=resolved.containerRef;const state=staged?.get(this.#refKey(n))??await this.adapter.load(n,{rulesetVersionId:versionId});const binding=(ruleset.formulaBindings??[]).find(b=>enabled(b)&&b.targetRef?.objectKind===reference.objectKind&&b.targetRef?.objectId===reference.objectId&&b.targetRef?.capabilityId===reference.capabilityId&&b.targetRef?.outputId===reference.outputId&&(b.targetRef?.slotId??null)===(reference.slotId??null));if(forWrite){const {output}=this.#outputContract(ruleset,reference);if(binding)throw new Error(`Output is derived and read-only: ${reference.outputId}.`);if(!output.mutable)throw new Error(`Output is not mutable: ${reference.outputId}.`);return {containerRef:n,state,reference,output};}const finalValue=reference.capabilityId==="value"&&reference.outputId==="value.final";
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
    currentContent:async context=>{if(!context?.content?.key)return null;return (await this.#contents(versionId,context,context.content.role??"self",staged)).find(row=>row.key===context.content.key)??null;}});}
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
  /** Forget an owned Content (its Item was removed). Definitions it granted are released by the caller. */
  async releaseContent(versionId,containerRef,key,{transactionId=null}={}){
    const tx=this.transaction(versionId,"content.release",{transactionId,summary:{key}}),state=await tx.load(containerRef);
    if(!state.contents?.[key])return false;delete state.contents[key];await this.#commit(tx);return true;
  }
  async evaluateFormula(versionId,formulaId,context={}){return await this.evaluator(versionId).formula(formulaId,context);}
  async evaluateCondition(versionId,conditionId,context={}){return await this.evaluator(versionId).condition(conditionId,context);}
  async resolveModifiers(versionId,targetRef,baseValue,context={}){
    const ruleset=this.ruleset(versionId),evaluator=this.evaluator(versionId),applicable=[];
    for(const modifier of ruleset.modifiers??[]){if(!enabled(modifier))continue;const t=modifier.targetRef??{};if(t.objectKind!==targetRef.objectKind||t.objectId!==targetRef.objectId||String(t.capabilityId??'')!==String(targetRef.capabilityId??'')||String(t.outputId??'')!==String(targetRef.outputId??''))continue;let ok=true;for(const id of modifier.conditionRefs??[])if(!await evaluator.condition(id,context)){ok=false;break;}if(!ok)continue;let value;if(modifier.valueSource.kind==='literal')value=modifier.valueSource.value;else if(modifier.valueSource.kind==='parameter')value=evaluator.parameter(modifier.valueSource.id);else if(modifier.valueSource.kind==='formula')value=await evaluator.formula(modifier.valueSource.id,context);else value=await this.resolveReference(versionId,modifier.valueSource.reference,context);applicable.push({modifier,value:Number(value)});}
    const {value,applied}=applyModifierStack(baseValue,applicable.map(row=>({id:row.modifier.id,operation:row.modifier.operation,value:row.value,priority:row.modifier.priority??0,stacking:row.modifier.stacking})));return{base:Number(baseValue),value,applied};
  }
  async roll(formula,data={}){assertSafeRollFormula(formula);if(typeof this.adapter.roll!=="function")throw new Error("Runtime adapter does not provide Foundry Roll support.");return this.adapter.roll(formula,data);}
  /** Test (CP-29): inputs, optional Roll, total, target, margin, then the first true Outcome in the Test's order.
   * Each step sees the previous ones under variables.test (inputs, roll, rollTotal, natural, bonus, total, target, margin). */
  async executeTest(versionId,testId,context={}){
    const ruleset=this.ruleset(versionId),test=ruleset.tests?.find(x=>x.id===testId&&enabled(x));if(!test)throw new Error(`Test unavailable: ${testId}.`);
    const scope={...context,variables:{...(context.variables??{})}};
    const state={id:test.id,inputs:{},roll:null,rollTotal:0,natural:null,bonus:0,total:0,target:null,margin:null};
    const sync=()=>{scope.variables.test={...state,inputs:{...state.inputs}};if(state.roll)scope.variables.roll={...state.roll};};
    sync();
    for(const input of test.inputBindings??[]){state.inputs[input.id]=await this.#testInput(versionId,test,input,scope);sync();}
    if(test.rollRef){
      const rollDef=ruleset.rolls?.find(x=>x.id===test.rollRef&&enabled(x));if(!rollDef)throw new Error(`Roll unavailable: ${test.rollRef}.`);
      const {formula,data}=await this.#rollFormula(rollDef,scope,this.evaluator(versionId),{test:clone(state.inputs)});
      const roll=await this.roll(resolveRollData(formula,data),data);
      const natural=Number.isFinite(Number(roll.natural))?Number(roll.natural):Number(roll.total);
      state.roll={formula:String(roll.formula??formula),total:Number(roll.total),natural,result:String(roll.result??roll.total??"")};
      state.rollTotal=Number(roll.total);state.natural=natural;state.total=Number(roll.total);sync();
    }
    const number=async(formulaId,label)=>{const value=Number(await this.evaluateFormula(versionId,formulaId,scope));if(!Number.isFinite(value))throw new Error(`Test ${test.id} ${label} is not a number.`);return value;};
    if(test.bonusFormulaRef){state.bonus=await number(test.bonusFormulaRef,"bonus");state.total=state.rollTotal+state.bonus;sync();}
    if(test.totalFormulaRef){state.total=await number(test.totalFormulaRef,"total");sync();}
    // Opposed Test: the target role makes the other Test as its self, against this Test's self; its total is the target.
    if(test.opposedTestRef){
      const opposing=ruleset.tests?.find(x=>x.id===test.opposedTestRef&&enabled(x));if(!opposing)throw new Error(`Test unavailable: ${test.opposedTestRef}.`);
      if(opposing.opposedTestRef)throw new Error(`Test ${opposing.id} is itself opposed and cannot answer ${test.id}.`);
      const opponent=roleRef(context,"target");if(!opponent)throw new Error(`Opposed Test ${test.id} needs a target.`);
      const roles={...(context.roles??{}),self:opponent,source:opponent,target:roleRef(context,"self")};
      const {content:_attackerContent,...opponentContext}=context,answer=await this.executeTest(versionId,opposing.id,{...opponentContext,roles,variables:{...(context.variables??{})}});
      state.opposed={testId:opposing.id,total:answer.total,natural:answer.roll?.natural??null,outcome:answer.outcome?.resultKey??null};state.target=answer.total;sync();
    }
    else state.target=test.targetFormulaRef?await number(test.targetFormulaRef,"target"):(test.targetValue===null||test.targetValue===undefined?null:Number(test.targetValue));sync();
    state.margin=test.marginFormulaRef?await number(test.marginFormulaRef,"margin"):(state.target===null?null:state.total-state.target);sync();
    // CP-29: the Test's own Outcome order; the first true Outcome wins, then the explicit
    // fallback. With Outcomes configured and no match, the Test fails explicitly.
    const candidates=(test.outcomeRefs??[]).map(id=>ruleset.outcomes?.find(x=>x.id===id&&enabled(x))).filter(Boolean);
    let outcome=null;
    for(const candidate of candidates){if(!candidate.conditionRef||await this.evaluateCondition(versionId,candidate.conditionRef,scope)){outcome=candidate;break;}}
    if(!outcome&&test.fallbackOutcomeRef){outcome=ruleset.outcomes?.find(x=>x.id===test.fallbackOutcomeRef&&enabled(x))??null;if(!outcome)throw new Error(`Fallback Outcome unavailable: ${test.fallbackOutcomeRef}.`);}
    if(!outcome&&candidates.length)throw new Error(`Test ${test.id} matched no Outcome and has no fallback Outcome.`);
    const variables={...(state.roll?{roll:{...state.roll}}:{}),test:{...state,inputs:{...state.inputs}}};
    const result={testId:test.id,inputs:copyJSON(state.inputs),roll:state.roll?{...state.roll}:null,bonus:state.bonus,total:state.total,target:state.target,margin:state.margin,...(state.opposed?{opposed:{...state.opposed}}:{}),outcome:outcome?{id:String(outcome.id),resultKey:String(outcome.resultKey),nameKey:String(outcome.nameKey),labelKey:String(outcome.labelKey||outcome.nameKey)}:null,variables,context:{variables}};
    this.hooks?.callAll?.(RUNTIME_HOOKS.testResolved,result,{roles:{...(context.roles??{})},defaultRole:context.defaultRole??"self",userContext:{...(context.userContext??{})}});return result;
  }
  async #testInput(versionId,test,input,scope){
    let value;
    if(Object.hasOwn(input.source,"literal"))value=copyJSON(input.source.literal);
    else if(input.source.formulaRef)value=await this.evaluateFormula(versionId,input.source.formulaRef,scope);
    else if(input.source.reference)value=await this.resolveReference(versionId,input.source.reference,scope);
    if(value===undefined||value===null){
      if(input.defaultValue!==undefined)return copyJSON(input.defaultValue);
      if(input.required)throw new Error(`Test ${test.id} input ${input.id} has no value.`);
      return null;
    }
    const check=validateTypedValue(input.valueType,"one",false,value);
    if(!check.valid)throw new Error(`Test ${test.id} input ${input.id}: ${check.message}`);
    return value;
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
    const eventContext={...context,event};const triggered=[];
    for(const trigger of ruleset.triggers??[]){if(!enabled(trigger)||trigger.eventTypeId!==eventTypeId)continue;if(!this.#eventFilterMatches(trigger.eventFilter,event,eventContext))continue;let ok=true;for(const conditionId of trigger.conditionRefs??[])if(!await this.evaluateCondition(versionId,conditionId,eventContext)){ok=false;break;}if(!ok)continue;const actions=[];for(const actionId of trigger.actionRefs??[]){actions.push(await this.executeAction(versionId,actionId,eventContext,{eventDepth:depth,triggered:true}));}triggered.push({triggerId:trigger.id,actions});}
    // untilEvent Durations end on the containers the event concerns.
    const expired=[];for(const ref of new Map(Object.values(context.roles??{}).filter(Boolean).map(ref=>{const n=normalizeRuntimeContainerRef(ref);return [this.#refKey(n),n];})).values()){const state=await this.adapter.load(ref);if(state.rulesetVersionId===versionId&&hasDurations(state)){const result=await this.expireStates(versionId,ref,{eventTypeId});if(result.stateInstanceIds.length||result.modifierStateIds.length)expired.push({ref,...result});}}
    this.hooks?.callAll?.(RUNTIME_HOOKS.event,event,clone(triggered));return {event,triggered,expired};
  }
  /** A module event (combat, world clock) on each container concerned, under its own Ruleset; containers whose Ruleset has no Trigger for it are skipped. */
  async emitSystemEvent(eventTypeId,payload,refs){
    if(!systemEventType(eventTypeId))throw new Error(`Not a module event: ${eventTypeId}.`);
    const results=[];
    for(const ref of refs){
      const state=await this.adapter.load(ref),versionId=state.rulesetVersionId;
      if(!versionId||!this.#hasRuleset(versionId)||!(this.ruleset(versionId).triggers??[]).some(trigger=>enabled(trigger)&&trigger.eventTypeId===eventTypeId))continue;
      results.push({ref,...await this.emitEvent(versionId,eventTypeId,payload,{roles:{self:ref}})});
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
    return {formula,data:{...clone(rollDef.data??{}),...(content?{content:content.fields}:{}),input:clone(context?.variables?.input??{}),...extra}};
  }
  /** Roll operand: the Roll's dice (multiplied by a Formula, e.g. 2 on a critical hit) plus a bonus Formula,
   * then a factor Formula rounded down (half for a resistance), never below the minimum. */
  async #rollOperand(versionId,operand,context,evaluator){
    const ruleset=this.ruleset(versionId),rollDef=ruleset.rolls?.find(x=>x.id===operand.rollRef&&enabled(x));if(!rollDef)throw new Error(`Roll unavailable: ${operand.rollRef}.`);
    const multiplier=operand.multiplierFormulaRef?Number(await evaluator.formula(operand.multiplierFormulaRef,context)):1;
    const bonus=operand.bonusFormulaRef?Number(await evaluator.formula(operand.bonusFormulaRef,context)):0;
    if(!Number.isFinite(bonus))throw new Error(`Roll bonus of ${operand.rollRef} is not a number.`);
    const factor=operand.factorFormulaRef?Number(await evaluator.formula(operand.factorFormulaRef,context)):1;
    if(!Number.isFinite(factor))throw new Error(`Roll factor of ${operand.rollRef} is not a number.`);
    const {formula,data}=await this.#rollFormula(rollDef,context,evaluator);
    const roll=await this.roll(multiplyDice(resolveRollData(formula,data),multiplier),data);
    let value=Number(roll.total)+bonus;if(factor!==1)value=Math.floor(value*factor);
    return {value:Number.isFinite(operand.minimum)?Math.max(operand.minimum,value):value,roll:{formula:String(roll.formula??formula),total:Number(roll.total),result:String(roll.result??roll.total??""),bonus,...(factor!==1?{factor}:{})}};
  }
  async #operand(versionId,operand,context,evaluator){if(operand.kind==="literal")return clone(operand.value);if(operand.kind==="parameter")return evaluator.parameter(operand.id);if(operand.kind==="formula")return await evaluator.formula(operand.id,context);if(operand.kind==="reference")return await this.resolveReference(versionId,operand.reference,context,{staged:evaluator.__staged});throw new Error(`Unsupported Effect operand: ${operand.kind}.`);}
  #writeOutput(state,reference,operation,operand,pool=null){const ds=state.definitionStates?.[reference.objectId];if(!ds)throw new Error(`Definition is not instantiated on RuntimeContainer: ${reference.objectId}.`);const cap=reference.capabilityId,id=reference.outputId;let current;
    if(cap==="value"&&id==="value.base")current=Number(ds.capabilityStates.value.base??0);
    else if(cap==="pool"&&id==="pool.current")current=Number(poolSlotState(ds,reference.slotId).current);
    else if(cap==="state"&&id==="state.active")current=Boolean(ds.capabilityStates.state.active);
    else throw new Error(`Mutable runtime output not implemented: ${cap}/${id}.`);
    const op=effectOperationRegistry.get(operation);if(!op)throw new Error(`Unsupported Effect operation: ${operation}.`);let next=op.apply(clone(current),operand);
    if(cap==="pool"){next=boundPoolValue(pool.slot,next,pool.bounds,`${reference.objectId}/${pool.slot.id}`);poolSlotState(ds,reference.slotId).current=next;}
    else if(cap==="value")ds.capabilityStates.value.base=Number(next);else ds.capabilityStates.state.active=Boolean(next);return clone(next);
  }
  async previewEffect(versionId,effectId,context={},staged=new Map()){
    const ruleset=this.ruleset(versionId),effect=ruleset.effects?.find(x=>x.id===effectId&&enabled(x));if(!effect)throw new Error(`Effect unavailable: ${effectId}.`);
    const evaluator=this.evaluator(versionId,staged);evaluator.__staged=staged;const role=effect.targetRole??"target";
    // A Formula may name the Definition written (the slot level chosen); the target keeps its capability, output and slot.
    let targetRef=effect.targetRef;
    if(effect.targetDefinitionFormulaRef){const chosen=await evaluator.formula(effect.targetDefinitionFormulaRef,{...context,defaultRole:role}),id=typeof chosen==="string"?chosen:chosen?.objectId;if(!id)throw new Error(`Effect ${effect.id}: its Formula names no Definition.`);targetRef={...effect.targetRef,objectId:id};}
    const target=await this.resolveReference(versionId,targetRef,{...context,defaultRole:role},{forWrite:true,role,staged});const key=this.#refKey(target.containerRef);if(!staged.has(key))staged.set(key,clone(target.state));const state=staged.get(key);let rolled=null,operand;if(effect.operand?.kind==="roll"){rolled=await this.#rollOperand(versionId,effect.operand,context,evaluator);operand=rolled.value;}else operand=await this.#operand(versionId,effect.operand,context,evaluator);const before=this.#readOutput(ruleset,state,targetRef);let pool=null;if(targetRef.capabilityId==="pool"){const {slot}=this.#outputContract(ruleset,targetRef);pool={slot,bounds:await this.#poolBounds(slot,{...context,defaultRole:role},evaluator)};}const after=this.#writeOutput(state,targetRef,effect.operation,operand,pool);return {effectId,before,after,operand,...(rolled?{roll:rolled.roll}:{}),containerRef:target.containerRef};
  }
  /** Instantiate one acquired Definition in a container state (CP-16). Returns the new
   * DefinitionState, null when an `ifAbsent` grant is already there, or "present". */
  async #acquireInto(versionId,ruleset,ref,state,acquisition){
    const definition=ruleset.definitions?.find(x=>x.id===acquisition.definitionId&&enabled(x));if(!definition)throw new Error(`Definition unavailable: ${acquisition.definitionId}.`);
    if(state.rulesetVersionId&&state.rulesetVersionId!==versionId)throw new Error(`Runtime container is bound to another Ruleset version: ${state.rulesetVersionId}.`);
    if(state.definitionStates[definition.id]){if(!acquisition.ifAbsent)return "present";this.#addToState(definition,state.definitionStates[definition.id],acquisition.add);return null;}
    assertDefinitionContract(ruleset,definition);
    state.rulesetVersionId=versionId;state.definitionStates[definition.id]=await this.#newDefinitionState(versionId,definition,ref,state,acquisition.initial??{});
    this.#addToState(definition,state.definitionStates[definition.id],acquisition.add);
    return state.definitionStates[definition.id];
  }
  /** A grant's config.add raises the base value, whether the Definition was there or not. */
  #addToState(definition,ds,add){
    for(const [key,amount] of Object.entries(add??{})){
      if(key!=="value.base"||!ds.capabilityStates?.value)throw new Error(`Acquisition can only add to value.base of a value Definition: ${definition.id} ${key}.`);
      const value=Number(amount);if(!Number.isFinite(value))throw new Error(`Acquisition add for ${definition.id} is not a number.`);
      ds.capabilityStates.value.base=Number(ds.capabilityStates.value.base??0)+value;
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
    for(const removal of action.stateRemovals??[]){
      const {ref,state}=await this.#stagedState(versionId,context,removal.targetRole,staged);
      for(const instance of state.stateInstances.filter(x=>x.definitionId===removal.definitionId))changes.push({stateRemoved:removeStateInstance(state,instance.id).id,definitionId:removal.definitionId,containerRef:ref});
    }
    for(const application of action.stateApplications??[]){
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
   * Definitions of the input's type (those the self role holds, when it holds some). */
  async describeActionInputs(versionId,actionId,context={}){
    const ruleset=this.ruleset(versionId),action=ruleset.actions?.find(x=>x.id===actionId&&enabled(x));if(!action)throw new Error(`Action unavailable: ${actionId}.`);
    const self=roleRef(context,"self"),held=self?new Set(Object.keys((await this.adapter.load(self,{rulesetVersionId:versionId})).definitionStates??{})):new Set();
    return (action.inputs??[]).map(input=>{
      let options=clone(input.options??[]);
      if(input.valueType==="reference"){const ofType=(ruleset.definitions??[]).filter(d=>enabled(d)&&d.definitionTypeId===input.definitionTypeId),owned=ofType.filter(d=>held.has(d.id));options=(owned.length?owned:ofType).map(d=>({value:d.id,labelKey:d.nameKey}));}
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
    const {formula,data}=await this.#rollFormula(rollDef,context,evaluator),roll=await this.roll(resolveRollData(formula,data),data);
    const bonus=table.bonusFormulaRef?Number(await evaluator.formula(table.bonusFormulaRef,context)):0;if(!Number.isFinite(bonus))throw new Error(`Table ${table.id} bonus is not a number.`);
    const total=Number(roll.total)+bonus,row=(table.rows??[]).find(r=>(r.min===null||total>=r.min)&&(r.max===null||total<=r.max))??null;
    return {tableId:table.id,total,roll:{formula:String(roll.formula??formula),total:Number(roll.total),result:String(roll.result??roll.total??""),bonus},row:row?{id:row.id,labelKey:row.labelKey,actionRefs:[...(row.actionRefs??[])]}:null};
  }
  /** previewAction options.acquisitions: extra grants run with the Action's own (a Content's bindings).
   * staged/depth: a follow-up Action (an Outcome's or a Table row's) previews into its parent's staged states. */
  async previewAction(versionId,actionId,context={},{acquisitions=[],content=null,staged:shared=null,depth=0}={}){
    const ruleset=this.ruleset(versionId),action=ruleset.actions?.find(x=>x.id===actionId&&enabled(x));if(!action)throw new Error(`Action unavailable: ${actionId}.`);const staged=shared??new Map(),evaluator=this.evaluator(versionId,staged);evaluator.__staged=staged;
    context=this.#actionInputs(ruleset,action,context);
    for(const conditionId of action.conditionRefs??[])if(!await evaluator.condition(conditionId,context))return {actionId,allowed:false,reason:"condition",conditionId,changes:[]};
    const changes=[];for(const effectId of action.costEffectRefs??[])changes.push(await this.previewEffect(versionId,effectId,context,staged));
    let testResult=null,effectRefs=[...(action.effectRefs??[])],next=[];
    if(action.testRef){testResult=await this.executeTest(versionId,action.testRef,context);const mapping=(action.outcomeMappings??[]).find(m=>m?.outcomeId===testResult.outcome?.id||m?.resultKey===testResult.outcome?.resultKey);if(mapping){if(Array.isArray(mapping.effectRefs))effectRefs=mapping.effectRefs;if(mapping.block===true)return {actionId,allowed:false,reason:"outcome",testResult,changes:[]};next=[...(mapping.actionRefs??[])];}}
    // Acquisitions come before the Effects, which may then target the new DefinitionStates.
    const acquired=[];
    for(const acquisition of [...(action.acquisitions??[]),...acquisitions]){
      const role=acquisition.targetRole??"self",target=roleRef(context,role);if(!target)throw new Error(`EvaluationContext role is missing: ${role}.`);
      const ref=normalizeRuntimeContainerRef(target),key=this.#refKey(ref);
      if(!staged.has(key))staged.set(key,await this.adapter.load(ref,{rulesetVersionId:versionId}));
      const created=await this.#acquireInto(versionId,ruleset,ref,staged.get(key),acquisition);
      if(created==="present")return {actionId,allowed:false,reason:"acquired",definitionId:acquisition.definitionId,testResult,changes:[]};
      if(created){changes.push({acquisition:acquisition.definitionId,before:null,after:clone(created),containerRef:ref});acquired.push(acquisition.definitionId);}
      else if(Object.keys(acquisition.add??{}).length)changes.push({acquisitionAdd:acquisition.definitionId,add:clone(acquisition.add),containerRef:ref});
    }
    if(content){const {ref,state}=await this.#stagedState(versionId,context,"self",staged);this.#addContent(versionId,state,content);changes.push({content:content.key,templateId:content.templateId,containerRef:ref});}
    await this.#stageStates(versionId,ruleset,action,context,staged,evaluator,changes);
    // Effects read the Test under variables.test (total, margin, natural, outcome), e.g. damage that grows with the margin.
    const effectContext=testResult?{...context,variables:{...(context.variables??{}),...testResult.variables,test:{...testResult.variables.test,outcome:testResult.outcome}}}:context;
    for(const effectId of effectRefs)changes.push(await this.previewEffect(versionId,effectId,effectContext,staged));
    // Then the Table, whose row adds its Actions to the Outcome's: each follow-up previews on a copy of the
    // staged states, kept only when it is allowed (a follow-up refused by its Conditions changes nothing).
    let tableResult=null,followContext=effectContext;
    if(action.tableRef){tableResult=await this.rollTable(versionId,action.tableRef,effectContext,evaluator);next.push(...(tableResult.row?.actionRefs??[]));followContext={...effectContext,variables:{...(effectContext.variables??{}),table:{tableId:tableResult.tableId,total:tableResult.total,rowId:tableResult.row?.id??null}}};}
    if(next.length&&depth>=10)throw new Error("Rule Them'All follow-up Action depth exceeded.");
    const followUps=[];
    for(const followId of next){
      const copy=new Map([...staged].map(([key,state])=>[key,clone(state)])),sub=await this.previewAction(versionId,followId,followContext,{staged:copy,depth:depth+1});
      followUps.push({actionId:followId,allowed:sub.allowed,reason:sub.reason??null,testResult:sub.testResult??null,tableResult:sub.tableResult??null,followUps:sub.followUps??[],context:sub.context??null});
      if(!sub.allowed)continue;
      for(const [key,state] of copy)staged.set(key,state);
      changes.push(...sub.changes);acquired.push(...sub.acquired);
    }
    return {actionId,allowed:true,testResult,tableResult,followUps,changes,acquired,staged,context};
  }
  /** triggered: run by a Trigger, so no user chose it and only write permissions apply. */
  async executeAction(versionId,actionId,context={},{preview=false,eventDepth=0,transactionId=null,triggered=false,acquisitions=[],content=null}={}){
    if(!triggered)await this.#require(versionId,"execute",{objectKind:"action",objectId:actionId},roleRef(context,"self")??roleRef(context,context.defaultRole??"self"),context);
    const plan=await this.previewAction(versionId,actionId,context,{acquisitions,content});if(preview||!plan.allowed)return {...plan,staged:undefined,context:undefined};
    context=plan.context;
    // Staged states were read once by the preview: the commit expects their revision unchanged.
    const tx=this.transaction(versionId,"action",{transactionId,summary:{actionId,outcomeKey:plan.testResult?.outcome?.resultKey??null}});
    for(const [key,state] of plan.staged){const change=plan.changes.find(x=>this.#refKey(x.containerRef)===key);if(change)tx.stage(change.containerRef,state);}
    const committed=await this.#commit(tx);
    const strip=list=>list.map(({context:_context,followUps:inner=[],...rest})=>({...rest,followUps:strip(inner)})),followUps=strip(plan.followUps);
    const result={actionId,allowed:true,testResult:plan.testResult??null,tableResult:plan.tableResult??null,followUps,changes:plan.changes,acquired:plan.acquired,committed:true,duplicate:committed.duplicate,transactionId:committed.transactionId,ledgerEntryIds:committed.entries.map(entry=>entry.id),events:[]};
    if(committed.duplicate)return result;
    this.hooks?.callAll?.(RUNTIME_HOOKS.actionExecuted,clone(result),context);
    await this.#emitActionEvents(versionId,{actionId,testResult:plan.testResult,context,followUps:plan.followUps},eventDepth,result.events);return result;
  }
  /** After the commit: the events of the Action, then those of each follow-up that ran, each with its own context. */
  async #emitActionEvents(versionId,{actionId,testResult,context,followUps=[]},eventDepth,out){
    const action=this.ruleset(versionId).actions?.find(x=>x.id===actionId);
    for(const eventTypeId of action?.eventTypeRefs??[]){const emitted=await this.emitEvent(versionId,eventTypeId,{actionId,outcomeKey:testResult?.outcome?.resultKey??null},context,{depth:eventDepth+1});out.push({eventTypeId,actionId,triggered:emitted.triggered});}
    for(const follow of followUps)if(follow.allowed)await this.#emitActionEvents(versionId,follow,eventDepth,out);
  }
}
