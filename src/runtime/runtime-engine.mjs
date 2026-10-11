import {RUNTIME_HOOKS} from "../core/module-contract.mjs";
import {copyJSON} from "../configurator/configurator-schema.mjs";
import {CONSTRAINT_KINDS,evaluateConstraints} from "../configurator/declarative-contracts.mjs";
import {capabilityTypeRegistry} from "../configurator/capability-type-registry.mjs";
import {createDefinitionState,normalizeRuntimeContainerRef,resolveRuntimeRuleset} from "./runtime-contracts.mjs";
import {RuntimeEvaluator} from "./runtime-evaluator.mjs";
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
  constructor({configurator,adapter,hooks=globalThis.Hooks,rulesetSource="published"}={}){if(!configurator)throw new Error("RuntimeEngine requires configurator API.");if(!adapter)throw new Error("RuntimeEngine requires a runtime adapter.");this.configurator=configurator;this.adapter=adapter;this.hooks=hooks;this.rulesetSource=rulesetSource;}
  ruleset(versionId){return resolveRuntimeRuleset(this.configurator,versionId,{source:this.rulesetSource});}
  async getContainerState(ref,{rulesetVersionId=""}={}){return this.adapter.load(normalizeRuntimeContainerRef(ref),{rulesetVersionId});}
  async instantiateDefinition(versionId,containerRef,definitionId,{initial={}}={}){
    const ruleset=this.ruleset(versionId),definition=ruleset.definitions?.find(x=>x.id===definitionId&&x.enabled!==false);if(!definition)throw new Error(`Definition unavailable: ${definitionId}.`);
    assertDefinitionContract(ruleset,definition);
    const ref=normalizeRuntimeContainerRef(containerRef),state=await this.adapter.load(ref,{rulesetVersionId:versionId});
    if(state.rulesetVersionId&&state.rulesetVersionId!==versionId)throw new Error(`Runtime container is bound to another Ruleset version: ${state.rulesetVersionId}.`);
    if(state.definitionStates[definitionId])throw new Error(`Definition is already instantiated: ${definitionId}.`);
    state.rulesetVersionId=versionId;state.definitionStates[definitionId]=await this.#newDefinitionState(versionId,definition,ref,state,initial);state.runtimeRevision++;
    await this.adapter.save(ref,state);return clone(state.definitionStates[definitionId]);
  }
  async removeDefinitionState(versionId,containerRef,definitionId){const ref=normalizeRuntimeContainerRef(containerRef),state=await this.adapter.load(ref,{rulesetVersionId:versionId});if(!state.definitionStates[definitionId])return false;delete state.definitionStates[definitionId];state.runtimeRevision++;await this.adapter.save(ref,state);return true;}
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
  async #slotTarget(versionId,containerRef,definitionId,capabilityId,slotId){
    const ruleset=this.ruleset(versionId),definition=ruleset.definitions?.find(x=>x.id===definitionId&&x.enabled!==false);if(!definition)throw new Error(`Definition unavailable: ${definitionId}.`);
    const slot=findSlot(definition,capabilityId,slotId);if(!slot)throw new Error(`Slot not found: ${definitionId}/${capabilityId}/${slotId}.`);
    const ref=normalizeRuntimeContainerRef(containerRef),state=await this.adapter.load(ref,{rulesetVersionId:versionId});
    const ds=state.definitionStates?.[definitionId];if(!ds)throw new Error(`Definition is not instantiated on RuntimeContainer: ${definitionId}.`);
    return {definition,slot,ref,state,ds};
  }
  async #collectionCapacity(versionId,slot,ref,state){if(!slot.capacityFormulaRef)return null;return Number(await this.evaluator(versionId,new Map([[this.#refKey(ref),state]])).formula(slot.capacityFormulaRef,{roles:{self:ref},defaultRole:"self"}));}
  /** CP-27: add an entry to a collection slot (no implicit creation of runtime entities). */
  async addCollectionEntry(versionId,containerRef,definitionId,slotId,entry){
    const {slot,ref,state,ds}=await this.#slotTarget(versionId,containerRef,definitionId,"collection",slotId),entries=collectionSlotState(ds,slotId).entries;
    assertCollectionRoom(slot,entries,await this.#collectionCapacity(versionId,slot,ref,state));
    const next=prepareCollectionEntry(slot,entry,entries);entries.push(next);state.runtimeRevision++;await this.adapter.save(ref,state);return clone(next);
  }
  /** Remove only the entry; an owned or referenced entity is never destroyed here. */
  async removeCollectionEntry(versionId,containerRef,definitionId,slotId,entryId){
    const {slot,ref,state,ds}=await this.#slotTarget(versionId,containerRef,definitionId,"collection",slotId),entries=collectionSlotState(ds,slotId).entries;
    const index=entries.findIndex(entry=>entry.id===entryId);if(index<0)throw new Error(`Collection entry not found: ${entryId}.`);
    assertCollectionMinimum(slot,entries.length-1);const [removed]=entries.splice(index,1);state.runtimeRevision++;await this.adapter.save(ref,state);return clone(removed);
  }
  /** Move an owned entry to another owned collection: ownership changes, nothing is cloned. */
  async transferCollectionEntry(versionId,{from,to,entryId}){
    const source=await this.#slotTarget(versionId,from.containerRef,from.definitionId,"collection",from.slotId);
    if(source.slot.entryMode!=="owned")throw new Error(`Only owned collection entries can be transferred (${source.slot.id} is ${source.slot.entryMode}).`);
    const target=await this.#slotTarget(versionId,to.containerRef,to.definitionId,"collection",to.slotId);
    // Within one container both slots must live in the same loaded state.
    const same=this.#refKey(source.ref)===this.#refKey(target.ref);
    if(same){target.state=source.state;target.ds=source.state.definitionStates[to.definitionId];}
    if(target.slot.entryMode!=="owned")throw new Error(`Transfer target ${target.slot.id} must be an owned collection.`);
    const fromEntries=collectionSlotState(source.ds,from.slotId).entries,toEntries=collectionSlotState(target.ds,to.slotId).entries;
    const index=fromEntries.findIndex(entry=>entry.id===entryId);if(index<0)throw new Error(`Collection entry not found: ${entryId}.`);
    if(fromEntries===toEntries)return clone(fromEntries[index]);
    assertCollectionMinimum(source.slot,fromEntries.length-1);
    assertCollectionRoom(target.slot,toEntries,await this.#collectionCapacity(versionId,target.slot,target.ref,target.state));
    const moved=prepareCollectionEntry(target.slot,fromEntries[index],toEntries);
    fromEntries.splice(index,1);toEntries.push(moved);
    source.state.runtimeRevision++;await this.adapter.save(source.ref,source.state);
    if(!same){target.state.runtimeRevision++;await this.adapter.save(target.ref,target.state);}
    return clone(moved);
  }
  async setDefinitionState(versionId,containerRef,definitionId,{base,active,pools}={}){
    const ruleset=this.ruleset(versionId),definition=ruleset.definitions?.find(x=>x.id===definitionId&&x.enabled!==false);if(!definition)throw new Error(`Definition unavailable: ${definitionId}.`);
    const ref=normalizeRuntimeContainerRef(containerRef),state=await this.adapter.load(ref,{rulesetVersionId:versionId});
    const ds=state.definitionStates?.[definitionId];if(!ds)throw new Error(`Definition is not instantiated on RuntimeContainer: ${definitionId}.`);
    if(ds.capabilityStates?.value&&base!==undefined)ds.capabilityStates.value.base=Number(base);
    if(pools!==undefined){const context={roles:{self:ref},defaultRole:"self"},evaluator=this.evaluator(versionId,new Map([[this.#refKey(ref),state]]));
      for(const [slotId,current] of Object.entries(pools)){const slot=findSlot(definition,"pool",slotId);if(!slot)throw new Error(`Slot not found: ${definitionId}/pool/${slotId}.`);poolSlotState(ds,slotId).current=boundPoolValue(slot,current,await this.#poolBounds(slot,context,evaluator),`${definitionId}/${slotId}`);}}
    if(ds.capabilityStates?.state&&active!==undefined)ds.capabilityStates.state.active=Boolean(active);
    state.runtimeRevision++;await this.adapter.save(ref,state);return clone(ds);
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
  async resolveReference(versionId,reference,context,{forWrite=false,role=null,staged=null,skipBinding=false}={}){const ruleset=this.ruleset(versionId);const selectedRole=role??reference.containerRole??context?.defaultRole??"self";const ref=roleRef(context,selectedRole);if(!ref)throw new Error(`EvaluationContext role is missing: ${selectedRole}.`);const n=normalizeRuntimeContainerRef(ref);const state=staged?.get(this.#refKey(n))??await this.adapter.load(n,{rulesetVersionId:versionId});const binding=(ruleset.formulaBindings??[]).find(b=>enabled(b)&&b.targetRef?.objectKind===reference.objectKind&&b.targetRef?.objectId===reference.objectId&&b.targetRef?.capabilityId===reference.capabilityId&&b.targetRef?.outputId===reference.outputId&&(b.targetRef?.slotId??null)===(reference.slotId??null)&&(b.targetRole??"self")===selectedRole);if(forWrite){const {output}=this.#outputContract(ruleset,reference);if(binding)throw new Error(`Output is derived and read-only: ${reference.outputId}.`);if(!output.mutable)throw new Error(`Output is not mutable: ${reference.outputId}.`);return {containerRef:n,state,reference,output};}if(binding&&!skipBinding){const derivedContext={...context,defaultRole:selectedRole};return await this.evaluator(versionId,staged).formula(binding.formulaRef,derivedContext);}
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
  async executeTest(versionId,testId,context={}){
    const ruleset=this.ruleset(versionId),test=ruleset.tests?.find(x=>x.id===testId&&enabled(x));if(!test)throw new Error(`Test unavailable: ${testId}.`);
    const rollDef=ruleset.rolls?.find(x=>x.id===test.rollRef&&enabled(x));if(!rollDef)throw new Error(`Roll unavailable: ${test.rollRef}.`);
    const baseContext={...context,variables:{...(context.variables??{})}};
    const roll=await this.roll(rollDef.formula,rollDef.data??{});
    const natural=Number.isFinite(Number(roll.natural))?Number(roll.natural):Number(roll.total);
    baseContext.variables.roll={formula:roll.formula,total:Number(roll.total),natural,result:roll.result};
    baseContext.variables.test={id:test.id,rollTotal:Number(roll.total),natural,bonus:0,total:Number(roll.total),target:null,margin:null};
    const bonus=test.bonusFormulaRef?Number(await this.evaluateFormula(versionId,test.bonusFormulaRef,baseContext)):0;
    const total=Number(roll.total)+bonus;baseContext.variables.test.bonus=bonus;baseContext.variables.test.total=total;
    const target=test.targetFormulaRef?Number(await this.evaluateFormula(versionId,test.targetFormulaRef,baseContext)):(test.targetValue===null?null:Number(test.targetValue));
    const margin=target===null?null:total-target;
    const testContext={...baseContext,variables:{...baseContext.variables,test:{...baseContext.variables.test,target,margin}}};
    // CP-29: highest priority first (list order breaks ties); the first true Outcome wins,
    // then the explicit fallback. With Outcomes configured and no match, the Test fails explicitly.
    const candidates=(test.outcomeRefs??[]).map((id,index)=>({index,outcome:ruleset.outcomes?.find(x=>x.id===id&&enabled(x))})).filter(x=>x.outcome)
      .sort((a,b)=>(b.outcome.priority??0)-(a.outcome.priority??0)||a.index-b.index).map(x=>x.outcome);
    let outcome=null;
    for(const candidate of candidates){if(!candidate.conditionRef||await this.evaluateCondition(versionId,candidate.conditionRef,testContext)){outcome=candidate;break;}}
    if(!outcome&&test.fallbackOutcomeRef){outcome=ruleset.outcomes?.find(x=>x.id===test.fallbackOutcomeRef&&enabled(x))??null;if(!outcome)throw new Error(`Fallback Outcome unavailable: ${test.fallbackOutcomeRef}.`);}
    if(!outcome&&candidates.length)throw new Error(`Test ${test.id} matched no Outcome and has no fallback Outcome.`);
    const variables={roll:{...baseContext.variables.roll},test:{...testContext.variables.test}};
    const result={testId:test.id,roll:{formula:String(roll.formula??rollDef.formula),result:String(roll.result??roll.total??""),total:Number(roll.total),natural},bonus:Number(bonus),total:Number(total),target:target===null?null:Number(target),margin:margin===null?null:Number(margin),outcome:outcome?{id:String(outcome.id),resultKey:String(outcome.resultKey),nameKey:String(outcome.nameKey),labelKey:String(outcome.labelKey||outcome.nameKey)}:null,variables,context:{variables}};
    this.hooks?.callAll?.(RUNTIME_HOOKS.testResolved,result,{roles:{...(context.roles??{})},defaultRole:context.defaultRole??"self",userContext:{...(context.userContext??{})}});return result;
  }
  async initializeContainer(versionId,containerRef,{definitionIds=null,initialByDefinition={}}={}){
    const ruleset=this.ruleset(versionId),wanted=definitionIds?new Set(definitionIds):null,ref=normalizeRuntimeContainerRef(containerRef);
    const state=await this.adapter.load(ref,{rulesetVersionId:versionId});
    if(state.rulesetVersionId&&state.rulesetVersionId!==versionId)throw new Error(`Runtime container is bound to another Ruleset version: ${state.rulesetVersionId}.`);
    state.rulesetVersionId=versionId;let created=0;
    // Pools last: their bounds may be Formulas over the container's other Definitions.
    const ordered=[...(ruleset.definitions??[])].sort((a,b)=>Number(Boolean(a.slots?.pool?.length))-Number(Boolean(b.slots?.pool?.length)));
    for(const definition of ordered){if(definition.enabled===false||wanted&&!wanted.has(definition.id)||state.definitionStates[definition.id])continue;assertDefinitionContract(ruleset,definition);state.definitionStates[definition.id]=await this.#newDefinitionState(versionId,definition,ref,state,initialByDefinition?.[definition.id]??{});created++;}
    if(created){state.runtimeRevision++;await this.adapter.save(ref,state);}return {created,state:clone(state)};
  }
  async emitEvent(versionId,eventTypeId,payload={},context={},options={}){
    const ruleset=this.ruleset(versionId),eventType=ruleset.eventTypes?.find(x=>x.id===eventTypeId&&enabled(x));if(!eventType)throw new Error(`EventType unavailable: ${eventTypeId}.`);
    const depth=Number(options.depth??0);if(depth>20)throw new Error("Rule Them'All event chain depth exceeded.");
    const event={id:globalThis.crypto?.randomUUID?.()??`evt-${Date.now()}-${Math.random().toString(36).slice(2)}`,eventTypeId,rulesetVersionId:versionId,occurredAt:Date.now(),payload:clone(payload),chainId:options.chainId??null,parentEventId:options.parentEventId??null,depth};event.chainId??=event.id;
    const eventContext={...context,event};const triggered=[];
    for(const trigger of ruleset.triggers??[]){if(!enabled(trigger)||trigger.eventTypeId!==eventTypeId)continue;if(!this.#eventFilterMatches(trigger.eventFilter,event,eventContext))continue;let ok=true;for(const conditionId of trigger.conditionRefs??[])if(!await this.evaluateCondition(versionId,conditionId,eventContext)){ok=false;break;}if(!ok)continue;const actions=[];for(const actionId of trigger.actionRefs??[]){actions.push(await this.executeAction(versionId,actionId,eventContext));}triggered.push({triggerId:trigger.id,actions});}
    this.hooks?.callAll?.(RUNTIME_HOOKS.event,event,clone(triggered));return {event,triggered};
  }
  #eventFilterMatches(filter,event,context){if(!filter)return true;const matches=filter.payloadMatches??{};for(const [key,value] of Object.entries(matches))if(event.payload?.[key]!==value)return false;return true;}
  async #operand(versionId,operand,context,evaluator){if(operand.kind==="literal")return clone(operand.value);if(operand.kind==="parameter")return evaluator.parameter(operand.id);if(operand.kind==="formula")return await evaluator.formula(operand.id,context);if(operand.kind==="reference")return await this.resolveReference(versionId,operand.reference,context,{staged:evaluator.__staged});throw new Error(`Unsupported Effect operand: ${operand.kind}.`);}
  #writeOutput(state,reference,operation,operand,pool=null){const ds=state.definitionStates?.[reference.objectId];if(!ds)throw new Error(`Definition is not instantiated on RuntimeContainer: ${reference.objectId}.`);const cap=reference.capabilityId,id=reference.outputId;let current;
    if(cap==="value"&&id==="value.base")current=Number(ds.capabilityStates.value.base??0);
    else if(cap==="pool"&&id==="pool.current")current=Number(poolSlotState(ds,reference.slotId).current);
    else if(cap==="state"&&id==="state.active")current=Boolean(ds.capabilityStates.state.active);
    else throw new Error(`Mutable runtime output not implemented: ${cap}/${id}.`);
    let next;if(operation==="set")next=operand;else if(operation==="add")next=Number(current)+Number(operand);else if(operation==="subtract")next=Number(current)-Number(operand);else if(operation==="multiply")next=Number(current)*Number(operand);else if(operation==="toggle")next=!Boolean(current);else throw new Error(`Unsupported Effect operation: ${operation}.`);
    if(cap==="pool"){next=boundPoolValue(pool.slot,next,pool.bounds,`${reference.objectId}/${pool.slot.id}`);poolSlotState(ds,reference.slotId).current=next;}
    else if(cap==="value")ds.capabilityStates.value.base=Number(next);else ds.capabilityStates.state.active=Boolean(next);return clone(next);
  }
  async previewEffect(versionId,effectId,context={},staged=new Map()){
    const ruleset=this.ruleset(versionId),effect=ruleset.effects?.find(x=>x.id===effectId&&enabled(x));if(!effect)throw new Error(`Effect unavailable: ${effectId}.`);
    const evaluator=this.evaluator(versionId,staged);evaluator.__staged=staged;const role=effect.targetRole??"target";const target=await this.resolveReference(versionId,effect.targetRef,{...context,defaultRole:role},{forWrite:true,role,staged});const key=this.#refKey(target.containerRef);if(!staged.has(key))staged.set(key,clone(target.state));const state=staged.get(key);const operand=await this.#operand(versionId,effect.operand,context,evaluator);const before=this.#readOutput(ruleset,state,effect.targetRef);let pool=null;if(effect.targetRef.capabilityId==="pool"){const {slot}=this.#outputContract(ruleset,effect.targetRef);pool={slot,bounds:await this.#poolBounds(slot,{...context,defaultRole:role},evaluator)};}const after=this.#writeOutput(state,effect.targetRef,effect.operation,operand,pool);return {effectId,before,after,operand,containerRef:target.containerRef};
  }
  async previewAction(versionId,actionId,context={}){
    const ruleset=this.ruleset(versionId),action=ruleset.actions?.find(x=>x.id===actionId&&enabled(x));if(!action)throw new Error(`Action unavailable: ${actionId}.`);const staged=new Map(),evaluator=this.evaluator(versionId,staged);evaluator.__staged=staged;
    for(const conditionId of action.conditionRefs??[])if(!await evaluator.condition(conditionId,context))return {actionId,allowed:false,reason:"condition",conditionId,changes:[]};
    const changes=[];for(const effectId of action.costEffectRefs??[])changes.push(await this.previewEffect(versionId,effectId,context,staged));
    let testResult=null,effectRefs=[...(action.effectRefs??[])];
    if(action.testRef){testResult=await this.executeTest(versionId,action.testRef,context);const mapping=(action.outcomeMappings??[]).find(m=>m?.outcomeId===testResult.outcome?.id||m?.resultKey===testResult.outcome?.resultKey);if(mapping){if(Array.isArray(mapping.effectRefs))effectRefs=mapping.effectRefs;if(mapping.block===true)return {actionId,allowed:false,reason:"outcome",testResult,changes:[]};}}
    for(const effectId of effectRefs)changes.push(await this.previewEffect(versionId,effectId,context,staged));return {actionId,allowed:true,testResult,changes,staged};
  }
  async executeAction(versionId,actionId,context={},{preview=false,eventDepth=0}={}){
    const plan=await this.previewAction(versionId,actionId,context);if(preview||!plan.allowed)return {...plan,staged:undefined};const entries=[];for(const [key,state] of plan.staged){state.runtimeRevision++;const change=plan.changes.find(x=>this.#refKey(x.containerRef)===key);if(change)entries.push({ref:change.containerRef,state});}
    for(const {ref} of entries)if(!await this.adapter.canWrite(ref))throw new Error("Runtime target is not writable by the current user.");if(entries.length)await this.adapter.saveMany(entries);const result={actionId,allowed:true,testResult:plan.testResult??null,changes:plan.changes,committed:true,events:[]};this.hooks?.callAll?.(RUNTIME_HOOKS.actionExecuted,clone(result),context);
    const action=this.ruleset(versionId).actions?.find(x=>x.id===actionId);for(const eventTypeId of action?.eventTypeRefs??[]){const emitted=await this.emitEvent(versionId,eventTypeId,{actionId,outcomeKey:plan.testResult?.outcome?.resultKey??null},context,{depth:eventDepth+1});result.events.push({eventTypeId,triggered:emitted.triggered});}return result;
  }
}
