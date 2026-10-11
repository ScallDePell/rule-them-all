import {RUNTIME_HOOKS} from "../core/module-contract.mjs";
import {copyJSON} from "../configurator/configurator-schema.mjs";
import {CONSTRAINT_KINDS,evaluateConstraints} from "../configurator/declarative-contracts.mjs";
import {capabilityTypeRegistry} from "../configurator/capability-type-registry.mjs";
import {createDefinitionState,normalizeRuntimeContainerRef} from "./runtime-contracts.mjs";
import {RuntimeEvaluator} from "./runtime-evaluator.mjs";

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
  constructor({configurator,adapter,hooks=globalThis.Hooks}={}){if(!configurator)throw new Error("RuntimeEngine requires configurator API.");if(!adapter)throw new Error("RuntimeEngine requires a runtime adapter.");this.configurator=configurator;this.adapter=adapter;this.hooks=hooks;}
  ruleset(versionId){const record=this.configurator.getRulesetVersion?.(versionId);const ruleset=record?.publishedSnapshot??record?.workingDraft??this.configurator.getRuleset?.(versionId);if(!ruleset)throw new Error(`Ruleset version not found: ${versionId}.`);return ruleset;}
  async getContainerState(ref,{rulesetVersionId=""}={}){return this.adapter.load(normalizeRuntimeContainerRef(ref),{rulesetVersionId});}
  async instantiateDefinition(versionId,containerRef,definitionId,{initial={}}={}){
    const ruleset=this.ruleset(versionId),definition=ruleset.definitions?.find(x=>x.id===definitionId&&x.enabled!==false);if(!definition)throw new Error(`Definition unavailable: ${definitionId}.`);
    assertDefinitionContract(ruleset,definition);
    const ref=normalizeRuntimeContainerRef(containerRef),state=await this.adapter.load(ref,{rulesetVersionId:versionId});
    if(state.rulesetVersionId&&state.rulesetVersionId!==versionId)throw new Error(`Runtime container is bound to another Ruleset version: ${state.rulesetVersionId}.`);
    if(state.definitionStates[definitionId])throw new Error(`Definition is already instantiated: ${definitionId}.`);
    state.rulesetVersionId=versionId;state.definitionStates[definitionId]=createDefinitionState(definition,{initial});state.runtimeRevision++;
    await this.adapter.save(ref,state);return clone(state.definitionStates[definitionId]);
  }
  async removeDefinitionState(versionId,containerRef,definitionId){const ref=normalizeRuntimeContainerRef(containerRef),state=await this.adapter.load(ref,{rulesetVersionId:versionId});if(!state.definitionStates[definitionId])return false;delete state.definitionStates[definitionId];state.runtimeRevision++;await this.adapter.save(ref,state);return true;}
  async setDefinitionState(versionId,containerRef,definitionId,{base,current,maximum,active}={}){
    const ruleset=this.ruleset(versionId),definition=ruleset.definitions?.find(x=>x.id===definitionId&&x.enabled!==false);if(!definition)throw new Error(`Definition unavailable: ${definitionId}.`);
    const ref=normalizeRuntimeContainerRef(containerRef),state=await this.adapter.load(ref,{rulesetVersionId:versionId});
    const ds=state.definitionStates?.[definitionId];if(!ds)throw new Error(`Definition is not instantiated on RuntimeContainer: ${definitionId}.`);
    if(ds.capabilityStates?.value&&base!==undefined)ds.capabilityStates.value.base=Number(base);
    if(ds.capabilityStates?.pool){if(maximum!==undefined)ds.capabilityStates.pool.maximum=Number(maximum);if(current!==undefined)ds.capabilityStates.pool.current=Math.min(Number(ds.capabilityStates.pool.maximum??current),Math.max(Number(ds.capabilityStates.pool.minimum??0),Number(current)));}
    if(ds.capabilityStates?.state&&active!==undefined)ds.capabilityStates.state.active=Boolean(active);
    state.runtimeRevision++;await this.adapter.save(ref,state);return clone(ds);
  }

  async #stateForRole(versionId,context,role){const ref=roleRef(context,role);if(!ref)throw new Error(`EvaluationContext role is missing: ${role}.`);return {ref:normalizeRuntimeContainerRef(ref),state:await this.adapter.load(ref,{rulesetVersionId:versionId})};}
  #outputContract(ruleset,reference){const def=ruleset.definitions?.find(x=>x.id===reference.objectId);if(!def)throw new Error(`Definition not found: ${reference.objectId}.`);if(reference.objectKind!=="definition")throw new Error(`Runtime Reference must target a Definition output, got ${reference.objectKind}.`);if(!reference.capabilityId||!reference.outputId)throw new Error("Runtime Reference requires capabilityId and outputId.");if(!(def.capabilities??[]).includes(reference.capabilityId))throw new Error(`Definition ${def.id} does not have capability ${reference.capabilityId}.`);const cap=capabilityTypeRegistry.get(reference.capabilityId);const output=cap?.outputs?.[reference.outputId];if(!output)throw new Error(`Output not found: ${reference.capabilityId}/${reference.outputId}.`);return {definition:def,output};}
  #readOutput(ruleset,containerState,reference){const {definition,output}=this.#outputContract(ruleset,reference);const ds=containerState.definitionStates?.[definition.id];if(!ds)throw new Error(`Definition is not instantiated on RuntimeContainer: ${definition.id}.`);const cap=reference.capabilityId;
    if(cap==="value"){const base=Number(ds.capabilityStates?.value?.base??0);if(reference.outputId==="value.base")return base;if(reference.outputId==="value.final"){let value=base;for(const m of ds.modifiers??[]){if(m?.active===false)continue;const operand=Number(m.operand??0);if(m.operation==="add")value+=operand;else if(m.operation==="subtract")value-=operand;else if(m.operation==="multiply")value*=operand;else if(m.operation==="set")value=operand;}return value;}}
    if(cap==="pool"){const p=ds.capabilityStates?.pool??{};if(reference.outputId==="pool.current")return Number(p.current??0);if(reference.outputId==="pool.minimum")return Number(p.minimum??0);if(reference.outputId==="pool.maximum")return Number(p.maximum??0);}
    if(cap==="collection"&&reference.outputId==="collection.count")return ds.capabilityStates?.collection?.entries?.length??0;
    if(cap==="state"&&reference.outputId==="state.active")return Boolean(ds.capabilityStates?.state?.active);
    const source=output.source?.split(".")??[];let value=ds.capabilityStates?.[cap];for(const part of source.slice(1))value=value?.[part];return clone(value);
  }
  async resolveReference(versionId,reference,context,{forWrite=false,role=null,staged=null,skipBinding=false}={}){const ruleset=this.ruleset(versionId);const selectedRole=role??reference.containerRole??context?.defaultRole??"self";const ref=roleRef(context,selectedRole);if(!ref)throw new Error(`EvaluationContext role is missing: ${selectedRole}.`);const n=normalizeRuntimeContainerRef(ref);const state=staged?.get(this.#refKey(n))??await this.adapter.load(n,{rulesetVersionId:versionId});const binding=(ruleset.formulaBindings??[]).find(b=>enabled(b)&&b.targetRef?.objectKind===reference.objectKind&&b.targetRef?.objectId===reference.objectId&&b.targetRef?.capabilityId===reference.capabilityId&&b.targetRef?.outputId===reference.outputId&&(b.targetRole??"self")===selectedRole);if(forWrite){const {output}=this.#outputContract(ruleset,reference);if(binding)throw new Error(`Output is derived and read-only: ${reference.outputId}.`);if(!output.mutable)throw new Error(`Output is not mutable: ${reference.outputId}.`);return {containerRef:n,state,reference,output};}if(binding&&!skipBinding){const derivedContext={...context,defaultRole:selectedRole};return await this.evaluator(versionId,staged).formula(binding.formulaRef,derivedContext);}return this.#readOutput(ruleset,state,reference);}
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
  async roll(formula,data={}){if(typeof this.adapter.roll!=="function")throw new Error("Runtime adapter does not provide Foundry Roll support.");return this.adapter.roll(formula,data);}
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
    let outcome=null;
    for(const id of test.outcomeRefs??[]){const candidate=ruleset.outcomes?.find(x=>x.id===id&&enabled(x));if(!candidate)continue;if(!candidate.conditionRef||await this.evaluateCondition(versionId,candidate.conditionRef,testContext)){outcome=candidate;break;}}
    const variables={roll:{...baseContext.variables.roll},test:{...testContext.variables.test}};
    const result={testId:test.id,roll:{formula:String(roll.formula??rollDef.formula),result:String(roll.result??roll.total??""),total:Number(roll.total),natural},bonus:Number(bonus),total:Number(total),target:target===null?null:Number(target),margin:margin===null?null:Number(margin),outcome:outcome?{id:String(outcome.id),resultKey:String(outcome.resultKey),nameKey:String(outcome.nameKey),labelKey:String(outcome.labelKey||outcome.nameKey)}:null,variables,context:{variables}};
    this.hooks?.callAll?.(RUNTIME_HOOKS.testResolved,result,{roles:{...(context.roles??{})},defaultRole:context.defaultRole??"self",userContext:{...(context.userContext??{})}});return result;
  }
  async initializeContainer(versionId,containerRef,{definitionIds=null,initialByDefinition={}}={}){
    const ruleset=this.ruleset(versionId),wanted=definitionIds?new Set(definitionIds):null,ref=normalizeRuntimeContainerRef(containerRef);
    const state=await this.adapter.load(ref,{rulesetVersionId:versionId});
    if(state.rulesetVersionId&&state.rulesetVersionId!==versionId)throw new Error(`Runtime container is bound to another Ruleset version: ${state.rulesetVersionId}.`);
    state.rulesetVersionId=versionId;let created=0;
    for(const definition of ruleset.definitions??[]){if(definition.enabled===false||wanted&&!wanted.has(definition.id)||state.definitionStates[definition.id])continue;assertDefinitionContract(ruleset,definition);state.definitionStates[definition.id]=createDefinitionState(definition,{initial:initialByDefinition?.[definition.id]??{}});created++;}
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
  #writeOutput(state,reference,operation,operand){const ds=state.definitionStates?.[reference.objectId];if(!ds)throw new Error(`Definition is not instantiated on RuntimeContainer: ${reference.objectId}.`);const cap=reference.capabilityId,id=reference.outputId;let current;
    if(cap==="value"&&id==="value.base")current=Number(ds.capabilityStates.value.base??0);
    else if(cap==="pool"&&id==="pool.current")current=Number(ds.capabilityStates.pool.current??0);
    else if(cap==="state"&&id==="state.active")current=Boolean(ds.capabilityStates.state.active);
    else throw new Error(`Mutable runtime output not implemented: ${cap}/${id}.`);
    let next;if(operation==="set")next=operand;else if(operation==="add")next=Number(current)+Number(operand);else if(operation==="subtract")next=Number(current)-Number(operand);else if(operation==="multiply")next=Number(current)*Number(operand);else if(operation==="toggle")next=!Boolean(current);else throw new Error(`Unsupported Effect operation: ${operation}.`);
    if(cap==="pool"){const p=ds.capabilityStates.pool;const min=Number(p.minimum??0),max=Number(p.maximum??Number.POSITIVE_INFINITY);next=Math.min(max,Math.max(min,Number(next)));p.current=next;}
    else if(cap==="value")ds.capabilityStates.value.base=Number(next);else ds.capabilityStates.state.active=Boolean(next);return clone(next);
  }
  async previewEffect(versionId,effectId,context={},staged=new Map()){
    const ruleset=this.ruleset(versionId),effect=ruleset.effects?.find(x=>x.id===effectId&&enabled(x));if(!effect)throw new Error(`Effect unavailable: ${effectId}.`);
    const evaluator=this.evaluator(versionId,staged);evaluator.__staged=staged;const role=effect.targetRole??"target";const target=await this.resolveReference(versionId,effect.targetRef,{...context,defaultRole:role},{forWrite:true,role,staged});const key=this.#refKey(target.containerRef);if(!staged.has(key))staged.set(key,clone(target.state));const state=staged.get(key);const operand=await this.#operand(versionId,effect.operand,context,evaluator);const before=this.#readOutput(ruleset,state,effect.targetRef);const after=this.#writeOutput(state,effect.targetRef,effect.operation,operand);return {effectId,before,after,operand,containerRef:target.containerRef};
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
