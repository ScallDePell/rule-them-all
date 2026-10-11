import {RUNTIME_HOOKS} from "../core/module-contract.mjs";
import {copyJSON} from "../configurator/configurator-schema.mjs";
import {validateTypedValue} from "../configurator/value-type-registry.mjs";
import {CONSTRAINT_KINDS,evaluateConstraints} from "../configurator/declarative-contracts.mjs";
import {capabilityTypeRegistry} from "../configurator/capability-type-registry.mjs";
import {createDefinitionState,normalizeRuntimeContainerRef,resolveRuntimeRuleset} from "./runtime-contracts.mjs";
import {RuntimeEvaluator} from "./runtime-evaluator.mjs";
import {RuntimeTransaction,RuntimeTransactionError,TRANSACTION_ERRORS,applyLedgerChanges} from "./runtime-transaction.mjs";
import {resolvePermission} from "./permission-policy.mjs";
import {toRuntimeReference,resolveContainer} from "./runtime-reference.mjs";
import {effectOperationRegistry} from "../configurator/operation-registries.mjs";
import {assertSafeRollFormula} from "../configurator/roll-grammar.mjs";
import {findSlot, slotInitialKey} from "../configurator/capability-slots.mjs";
import {SLOT_CAPABILITIES,requireSlot,poolSlotState,collectionSlotState,boundPoolValue,initialSlotStates,prepareCollectionEntry,assertCollectionRoom,assertCollectionMinimum} from "./capability-slot-runtime.mjs";

const clone=v=>copyJSON(v);
const roleRef=(context,role)=>context?.roles?.[role]??null;
const enabled=(entry)=>entry&&entry.enabled!==false;
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
    if(!decision.allowed)throw new RuntimeTransactionError(TRANSACTION_ERRORS.forbidden,`Permission denied: ${operation} ${target.objectKind} ${target.objectId}.`,{operation,target,decision});
    return decision;
  }
  /** Only the DefinitionStates this user may read are returned (CP-11: never sent, then hidden). */
  async getContainerState(ref,{rulesetVersionId=""}={}){
    const n=normalizeRuntimeContainerRef(ref),state=await this.adapter.load(n,{rulesetVersionId});
    if(!state.rulesetVersionId||!this.#hasRuleset(state.rulesetVersionId))return state;
    for(const definitionId of Object.keys(state.definitionStates))if(!(await this.authorize(state.rulesetVersionId,"read",{objectKind:"definition",objectId:definitionId},n)).allowed)delete state.definitionStates[definitionId];
    const readable=new Set(Object.keys(state.definitionStates));
    state.stateInstances=state.stateInstances.filter(instance=>!instance.definitionId||readable.has(instance.definitionId));
    return state;
  }
  #hasRuleset(versionId){try{this.ruleset(versionId);return true;}catch{return false;}}
  /** Every persistent runtime write goes through one transaction (CP-08, CP-18). */
  transaction(versionId,kind,{transactionId=null,summary=null,corrects=null}={}){
    const authorize=async(ref,changes)=>{for(const change of changes)await this.#require(versionId,"write",{objectKind:"definition",objectId:change.scope==="definition"?change.id:(change.after??change.before)?.definitionId},ref);};
    return new RuntimeTransaction(this.adapter,{kind,rulesetVersionId:versionId,transactionId,summary,corrects,authorize,...(this.userId?{userId:this.userId}:{})});
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
    return createDefinitionState(definition,{initial,slotStates:initialSlotStates(definition,initial,resolved)});
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
  #readOutput(ruleset,containerState,reference){const {definition,output}=this.#outputContract(ruleset,reference);const ds=containerState.definitionStates?.[definition.id];if(!ds)throw new Error(`Definition is not instantiated on RuntimeContainer: ${definition.id}.`);const cap=reference.capabilityId;
    if(cap==="value"){const base=Number(ds.capabilityStates?.value?.base??0);if(reference.outputId==="value.base")return base;if(reference.outputId==="value.final"){let value=base;for(const m of ds.modifiers??[]){if(m?.active===false)continue;const operand=Number(m.operand??0);if(m.operation==="add")value+=operand;else if(m.operation==="subtract")value-=operand;else if(m.operation==="multiply")value*=operand;else if(m.operation==="set")value=operand;}return value;}}
    if(cap==="pool"&&reference.outputId==="pool.current")return Number(poolSlotState(ds,reference.slotId).current);
    if(cap==="pool")throw new Error(`Pool bounds are derived; resolve ${reference.outputId} through resolveReference.`);
    if(cap==="collection"&&reference.outputId==="collection.count")return collectionSlotState(ds,reference.slotId).entries.length;
    if(cap==="state"&&reference.outputId==="state.active")return Boolean(ds.capabilityStates?.state?.active);
    const source=output.source?.split(".")??[];let value=ds.capabilityStates?.[cap];for(const part of source.slice(1))value=value?.[part];return clone(value);
  }
  /** Read (or prepare a write of) a RuntimeReference {container, reference}; a bare logical Reference is read on `role`, else on the context's default role. */
  async resolveReference(versionId,target,context,{forWrite=false,role=null,staged=null,skipBinding=false}={}){const ruleset=this.ruleset(versionId);const runtime=toRuntimeReference(target,role??context?.defaultRole??"self"),reference=runtime.reference;const resolved=resolveContainer(runtime,context);context=resolved.context;const selectedRole=resolved.role,n=resolved.containerRef;const state=staged?.get(this.#refKey(n))??await this.adapter.load(n,{rulesetVersionId:versionId});const binding=(ruleset.formulaBindings??[]).find(b=>enabled(b)&&b.targetRef?.objectKind===reference.objectKind&&b.targetRef?.objectId===reference.objectId&&b.targetRef?.capabilityId===reference.capabilityId&&b.targetRef?.outputId===reference.outputId&&(b.targetRef?.slotId??null)===(reference.slotId??null)&&(b.targetRole??"self")===selectedRole);if(forWrite){const {output}=this.#outputContract(ruleset,reference);if(binding)throw new Error(`Output is derived and read-only: ${reference.outputId}.`);if(!output.mutable)throw new Error(`Output is not mutable: ${reference.outputId}.`);return {containerRef:n,state,reference,output};}if(binding&&!skipBinding){const derivedContext={...context,defaultRole:selectedRole};return await this.evaluator(versionId,staged).formula(binding.formulaRef,derivedContext);}
    if(reference.capabilityId==="pool"&&reference.outputId!=="pool.current"){const {slot}=this.#outputContract(ruleset,reference);const bounds=await this.#poolBounds(slot,{...context,defaultRole:selectedRole},this.evaluator(versionId,staged));return reference.outputId==="pool.minimum"?bounds.minimum:bounds.maximum;}
    return this.#readOutput(ruleset,state,reference);}
  #refKey(ref){return ref.uuid??`${ref.kind}:${ref.id}`;}
  evaluator(versionId,staged=null){const ruleset=this.ruleset(versionId);return new RuntimeEvaluator({ruleset,resolveReference:(reference,context,opts)=>this.resolveReference(versionId,reference,context,{...opts,staged})});}
  async evaluateFormula(versionId,formulaId,context={}){return await this.evaluator(versionId).formula(formulaId,context);}
  async evaluateCondition(versionId,conditionId,context={}){return await this.evaluator(versionId).condition(conditionId,context);}
  async resolveModifiers(versionId,targetRef,baseValue,context={}){
    const ruleset=this.ruleset(versionId),evaluator=this.evaluator(versionId),applicable=[];
    for(const modifier of ruleset.modifiers??[]){if(!enabled(modifier))continue;const t=modifier.targetRef??{};if(t.objectKind!==targetRef.objectKind||t.objectId!==targetRef.objectId||String(t.capabilityId??'')!==String(targetRef.capabilityId??'')||String(t.outputId??'')!==String(targetRef.outputId??''))continue;let ok=true;for(const id of modifier.conditionRefs??[])if(!await evaluator.condition(id,context)){ok=false;break;}if(!ok)continue;let value;if(modifier.valueSource.kind==='literal')value=modifier.valueSource.value;else if(modifier.valueSource.kind==='parameter')value=evaluator.parameter(modifier.valueSource.id);else if(modifier.valueSource.kind==='formula')value=await evaluator.formula(modifier.valueSource.id,context);else value=await this.resolveReference(versionId,modifier.valueSource.reference,context);applicable.push({modifier,value:Number(value)});}
    const grouped=new Map(),selected=[];for(const row of applicable){const mode=row.modifier.stacking?.mode??'stack',group=row.modifier.stacking?.group||row.modifier.id;if(mode==='stack'){selected.push(row);continue;}const prior=grouped.get(group);if(!prior||mode==='replace'&&row.modifier.priority>=prior.modifier.priority||mode==='highest'&&row.value>prior.value||mode==='lowest'&&row.value<prior.value)grouped.set(group,row);}selected.push(...grouped.values());selected.sort((a,b)=>(a.modifier.priority??0)-(b.modifier.priority??0));let value=Number(baseValue);for(const row of selected){const n=row.value,op=row.modifier.operation;if(op==='add')value+=n;else if(op==='subtract')value-=n;else if(op==='multiply')value*=n;else if(op==='set')value=n;else if(op==='min')value=Math.min(value,n);else if(op==='max')value=Math.max(value,n);}return{base:Number(baseValue),value,applied:selected.map(row=>row.modifier.id)};
  }
  async checkRestrictions(versionId,operationKind,context={}){const ruleset=this.ruleset(versionId),evaluator=this.evaluator(versionId),matches=[];for(const restriction of ruleset.restrictions??[]){if(!enabled(restriction)||restriction.operationKinds?.length&&!restriction.operationKinds.includes(operationKind))continue;let ok=true;for(const id of restriction.conditionRefs??[])if(!await evaluator.condition(id,context)){ok=false;break;}if(ok)matches.push(restriction);}matches.sort((a,b)=>(b.priority??0)-(a.priority??0));const top=matches[0]??null;return{allowed:!top||top.effect!=='deny',restrictionId:top?.id??null,messageKey:top?.messageKey??''};}
  async roll(formula,data={}){assertSafeRollFormula(formula);if(typeof this.adapter.roll!=="function")throw new Error("Runtime adapter does not provide Foundry Roll support.");return this.adapter.roll(formula,data);}
  /** Test (CP-29): inputs, optional Roll, total, target, margin, then the first true Outcome by priority.
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
      const roll=await this.roll(rollDef.formula,rollDef.data??{});
      const natural=Number.isFinite(Number(roll.natural))?Number(roll.natural):Number(roll.total);
      state.roll={formula:String(roll.formula??rollDef.formula),total:Number(roll.total),natural,result:String(roll.result??roll.total??"")};
      state.rollTotal=Number(roll.total);state.natural=natural;state.total=Number(roll.total);sync();
    }
    const number=async(formulaId,label)=>{const value=Number(await this.evaluateFormula(versionId,formulaId,scope));if(!Number.isFinite(value))throw new Error(`Test ${test.id} ${label} is not a number.`);return value;};
    if(test.bonusFormulaRef){state.bonus=await number(test.bonusFormulaRef,"bonus");state.total=state.rollTotal+state.bonus;sync();}
    if(test.totalFormulaRef){state.total=await number(test.totalFormulaRef,"total");sync();}
    state.target=test.targetFormulaRef?await number(test.targetFormulaRef,"target"):(test.targetValue===null||test.targetValue===undefined?null:Number(test.targetValue));sync();
    state.margin=test.marginFormulaRef?await number(test.marginFormulaRef,"margin"):(state.target===null?null:state.total-state.target);sync();
    // CP-29: highest priority first (list order breaks ties); the first true Outcome wins,
    // then the explicit fallback. With Outcomes configured and no match, the Test fails explicitly.
    const candidates=(test.outcomeRefs??[]).map((id,index)=>({index,outcome:ruleset.outcomes?.find(x=>x.id===id&&enabled(x))})).filter(x=>x.outcome)
      .sort((a,b)=>(b.outcome.priority??0)-(a.outcome.priority??0)||a.index-b.index).map(x=>x.outcome);
    let outcome=null;
    for(const candidate of candidates){if(!candidate.conditionRef||await this.evaluateCondition(versionId,candidate.conditionRef,scope)){outcome=candidate;break;}}
    if(!outcome&&test.fallbackOutcomeRef){outcome=ruleset.outcomes?.find(x=>x.id===test.fallbackOutcomeRef&&enabled(x))??null;if(!outcome)throw new Error(`Fallback Outcome unavailable: ${test.fallbackOutcomeRef}.`);}
    if(!outcome&&candidates.length)throw new Error(`Test ${test.id} matched no Outcome and has no fallback Outcome.`);
    const variables={...(state.roll?{roll:{...state.roll}}:{}),test:{...state,inputs:{...state.inputs}}};
    const result={testId:test.id,inputs:copyJSON(state.inputs),roll:state.roll?{...state.roll}:null,bonus:state.bonus,total:state.total,target:state.target,margin:state.margin,outcome:outcome?{id:String(outcome.id),resultKey:String(outcome.resultKey),nameKey:String(outcome.nameKey),labelKey:String(outcome.labelKey||outcome.nameKey)}:null,variables,context:{variables}};
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
  async acquire(versionId,containerRef,{actionId=null,definitionBindings=[],context={},transactionId=null,summary=null}={}){
    const ref=normalizeRuntimeContainerRef(containerRef),grants=definitionBindings.map(binding=>({definitionId:binding.definitionId,initial:binding.initial??{},targetRole:"self",ifAbsent:true}));
    if(actionId){
      const roles={...(context.roles??{}),self:ref,source:ref};
      const result=await this.executeAction(versionId,actionId,{...context,roles,defaultRole:context.defaultRole??"self"},{acquisitions:grants,transactionId});
      return {allowed:result.allowed,reason:result.reason??null,acquiredDefinitionIds:result.acquired??[],transactionId:result.transactionId??null,ledgerEntryIds:result.ledgerEntryIds??[],duplicate:Boolean(result.duplicate),action:{...result,staged:undefined}};
    }
    const ruleset=this.ruleset(versionId),tx=this.transaction(versionId,"acquisition",{transactionId,summary}),state=await tx.load(ref),acquired=[];
    for(const grant of grants)if(await this.#acquireInto(versionId,ruleset,ref,state,grant))acquired.push(grant.definitionId);
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
    const ruleset=this.ruleset(versionId),eventType=ruleset.eventTypes?.find(x=>x.id===eventTypeId&&enabled(x));if(!eventType)throw new Error(`EventType unavailable: ${eventTypeId}.`);
    const depth=Number(options.depth??0);if(depth>20)throw new Error("Rule Them'All event chain depth exceeded.");
    const event={id:globalThis.crypto?.randomUUID?.()??`evt-${Date.now()}-${Math.random().toString(36).slice(2)}`,eventTypeId,rulesetVersionId:versionId,occurredAt:Date.now(),payload:clone(payload),chainId:options.chainId??null,parentEventId:options.parentEventId??null,depth};event.chainId??=event.id;
    const eventContext={...context,event};const triggered=[];
    for(const trigger of ruleset.triggers??[]){if(!enabled(trigger)||trigger.eventTypeId!==eventTypeId)continue;if(!this.#eventFilterMatches(trigger.eventFilter,event,eventContext))continue;let ok=true;for(const conditionId of trigger.conditionRefs??[])if(!await this.evaluateCondition(versionId,conditionId,eventContext)){ok=false;break;}if(!ok)continue;const actions=[];for(const actionId of trigger.actionRefs??[]){actions.push(await this.executeAction(versionId,actionId,eventContext,{eventDepth:depth,triggered:true}));}triggered.push({triggerId:trigger.id,actions});}
    this.hooks?.callAll?.(RUNTIME_HOOKS.event,event,clone(triggered));return {event,triggered};
  }
  #eventFilterMatches(filter,event,context){if(!filter)return true;const matches=filter.payloadMatches??{};for(const [key,value] of Object.entries(matches))if(event.payload?.[key]!==value)return false;return true;}
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
    const evaluator=this.evaluator(versionId,staged);evaluator.__staged=staged;const role=effect.targetRole??"target";const target=await this.resolveReference(versionId,effect.targetRef,{...context,defaultRole:role},{forWrite:true,role,staged});const key=this.#refKey(target.containerRef);if(!staged.has(key))staged.set(key,clone(target.state));const state=staged.get(key);const operand=await this.#operand(versionId,effect.operand,context,evaluator);const before=this.#readOutput(ruleset,state,effect.targetRef);let pool=null;if(effect.targetRef.capabilityId==="pool"){const {slot}=this.#outputContract(ruleset,effect.targetRef);pool={slot,bounds:await this.#poolBounds(slot,{...context,defaultRole:role},evaluator)};}const after=this.#writeOutput(state,effect.targetRef,effect.operation,operand,pool);return {effectId,before,after,operand,containerRef:target.containerRef};
  }
  /** Instantiate one acquired Definition in a container state (CP-16). Returns the new
   * DefinitionState, null when an `ifAbsent` grant is already there, or "present". */
  async #acquireInto(versionId,ruleset,ref,state,acquisition){
    const definition=ruleset.definitions?.find(x=>x.id===acquisition.definitionId&&enabled(x));if(!definition)throw new Error(`Definition unavailable: ${acquisition.definitionId}.`);
    if(state.rulesetVersionId&&state.rulesetVersionId!==versionId)throw new Error(`Runtime container is bound to another Ruleset version: ${state.rulesetVersionId}.`);
    if(state.definitionStates[definition.id])return acquisition.ifAbsent?null:"present";
    assertDefinitionContract(ruleset,definition);
    state.rulesetVersionId=versionId;state.definitionStates[definition.id]=await this.#newDefinitionState(versionId,definition,ref,state,acquisition.initial??{});
    return state.definitionStates[definition.id];
  }
  /** previewAction options.acquisitions: extra grants run with the Action's own (a Content's bindings). */
  async previewAction(versionId,actionId,context={},{acquisitions=[]}={}){
    const ruleset=this.ruleset(versionId),action=ruleset.actions?.find(x=>x.id===actionId&&enabled(x));if(!action)throw new Error(`Action unavailable: ${actionId}.`);const staged=new Map(),evaluator=this.evaluator(versionId,staged);evaluator.__staged=staged;
    for(const conditionId of action.conditionRefs??[])if(!await evaluator.condition(conditionId,context))return {actionId,allowed:false,reason:"condition",conditionId,changes:[]};
    const changes=[];for(const effectId of action.costEffectRefs??[])changes.push(await this.previewEffect(versionId,effectId,context,staged));
    let testResult=null,effectRefs=[...(action.effectRefs??[])];
    if(action.testRef){testResult=await this.executeTest(versionId,action.testRef,context);const mapping=(action.outcomeMappings??[]).find(m=>m?.outcomeId===testResult.outcome?.id||m?.resultKey===testResult.outcome?.resultKey);if(mapping){if(Array.isArray(mapping.effectRefs))effectRefs=mapping.effectRefs;if(mapping.block===true)return {actionId,allowed:false,reason:"outcome",testResult,changes:[]};}}
    // Acquisitions come before the Effects, which may then target the new DefinitionStates.
    const acquired=[];
    for(const acquisition of [...(action.acquisitions??[]),...acquisitions]){
      const role=acquisition.targetRole??"self",target=roleRef(context,role);if(!target)throw new Error(`EvaluationContext role is missing: ${role}.`);
      const ref=normalizeRuntimeContainerRef(target),key=this.#refKey(ref);
      if(!staged.has(key))staged.set(key,await this.adapter.load(ref,{rulesetVersionId:versionId}));
      const created=await this.#acquireInto(versionId,ruleset,ref,staged.get(key),acquisition);
      if(created==="present")return {actionId,allowed:false,reason:"acquired",definitionId:acquisition.definitionId,testResult,changes:[]};
      if(created){changes.push({acquisition:acquisition.definitionId,before:null,after:clone(created),containerRef:ref});acquired.push(acquisition.definitionId);}
    }
    for(const effectId of effectRefs)changes.push(await this.previewEffect(versionId,effectId,context,staged));return {actionId,allowed:true,testResult,changes,acquired,staged};
  }
  /** triggered: run by a Trigger, so no user chose it and only write permissions apply. */
  async executeAction(versionId,actionId,context={},{preview=false,eventDepth=0,transactionId=null,triggered=false,acquisitions=[]}={}){
    if(!triggered)await this.#require(versionId,"execute",{objectKind:"action",objectId:actionId},roleRef(context,"self")??roleRef(context,context.defaultRole??"self"),context);
    const plan=await this.previewAction(versionId,actionId,context,{acquisitions});if(preview||!plan.allowed)return {...plan,staged:undefined};
    // Staged states were read once by the preview: the commit expects their revision unchanged.
    const tx=this.transaction(versionId,"action",{transactionId,summary:{actionId,outcomeKey:plan.testResult?.outcome?.resultKey??null}});
    for(const [key,state] of plan.staged){const change=plan.changes.find(x=>this.#refKey(x.containerRef)===key);if(change)tx.stage(change.containerRef,state);}
    const committed=await this.#commit(tx);
    const result={actionId,allowed:true,testResult:plan.testResult??null,changes:plan.changes,acquired:plan.acquired,committed:true,duplicate:committed.duplicate,transactionId:committed.transactionId,ledgerEntryIds:committed.entries.map(entry=>entry.id),events:[]};
    if(committed.duplicate)return result;
    this.hooks?.callAll?.(RUNTIME_HOOKS.actionExecuted,clone(result),context);
    const action=this.ruleset(versionId).actions?.find(x=>x.id===actionId);for(const eventTypeId of action?.eventTypeRefs??[]){const emitted=await this.emitEvent(versionId,eventTypeId,{actionId,outcomeKey:plan.testResult?.outcome?.resultKey??null},context,{depth:eventDepth+1});result.events.push({eventTypeId,triggered:emitted.triggered});}return result;
  }
}
