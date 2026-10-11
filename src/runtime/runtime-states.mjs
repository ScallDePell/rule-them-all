import {copyJSON} from "../configurator/configurator-schema.mjs";

/** CP-28 runtime states: StateInstance (an addressable condition on a container) and
 * ModifierState (a persistent change of a value, kept in the target DefinitionState). */

const newId=prefix=>`${prefix}-${globalThis.crypto?.randomUUID?.()??`${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
const UNIT_SECONDS={second:1,minute:60,hour:3600,day:86400};

/** Snapshot of a Duration when a state starts; expiresAt is a world time in seconds. */
export function startDuration(duration,{worldTime=0,roundSeconds=6}={}){
  if(!duration)return null;
  const state={durationId:duration.id,mode:duration.mode,startedAt:worldTime,expiresAt:null,eventTypeRef:duration.eventTypeRef??null,conditionRef:duration.conditionRef??null};
  if(duration.mode==="fixed"){
    const unit=["round","turn"].includes(duration.unit)?roundSeconds:UNIT_SECONDS[duration.unit];
    if(!Number.isFinite(unit))throw new Error(`Duration ${duration.id} has no usable unit: ${duration.unit}.`);
    state.expiresAt=worldTime+Number(duration.amount)*unit;
  }
  if(duration.mode==="absoluteTime")state.expiresAt=Number(duration.at);
  return state;
}

/** Whether a duration is over: time passed, its event happened, or (checked by the caller) its Condition is false. */
export function durationEnded(durationState,{worldTime=null,eventTypeId=null}={}){
  if(!durationState)return false;
  if(durationState.mode==="instant")return true;
  if(durationState.expiresAt!==null&&worldTime!==null&&worldTime>=durationState.expiresAt)return true;
  return durationState.mode==="untilEvent"&&eventTypeId!==null&&eventTypeId===durationState.eventTypeRef;
}

export function createStateInstance({definitionId,sourceRef=null,durationState=null,stacks=1,severity=null,worldTime=0,metadata={}}){
  return {id:newId("state"),definitionId,sourceRef:copyJSON(sourceRef),appliedAt:worldTime,durationState:copyJSON(durationState),stacks,severity,active:true,modifierIds:[],metadata:copyJSON(metadata)};
}

/** A persistent ModifierState from a Ruleset Modifier, with its operand evaluated now. */
export function createModifierState(modifier,{operand,sourceRef=null,durationState=null}){
  return {id:newId("modifier"),modifierId:modifier.id,sourceRef:copyJSON(sourceRef),targetRef:copyJSON(modifier.targetRef),operation:modifier.operation,operand:Number(operand),stackingPolicy:copyJSON(modifier.stacking??{mode:"stack",group:""}),priority:Number(modifier.priority??0),durationState:copyJSON(durationState),active:true,metadata:{}};
}

/** Modifier stacking shared by Ruleset Modifiers and ModifierStates: `stack` rows all apply;
 * other modes keep one row per group (replace: highest priority, highest/lowest: value).
 * The kept rows apply by ascending priority. rows: {id, operation, value, priority, stacking}. */
export function applyModifierStack(base,rows){
  const grouped=new Map(),selected=[];
  for(const row of rows){
    const mode=row.stacking?.mode??"stack",group=row.stacking?.group||row.id;
    if(mode==="stack"){selected.push(row);continue;}
    const prior=grouped.get(group);
    if(!prior||mode==="replace"&&row.priority>=prior.priority||mode==="highest"&&row.value>prior.value||mode==="lowest"&&row.value<prior.value)grouped.set(group,row);
  }
  selected.push(...grouped.values());selected.sort((a,b)=>(a.priority??0)-(b.priority??0));
  let value=Number(base);
  for(const row of selected){const n=Number(row.value),op=row.operation;if(op==="add")value+=n;else if(op==="subtract")value-=n;else if(op==="multiply")value*=n;else if(op==="set")value=n;else if(op==="min")value=Math.min(value,n);else if(op==="max")value=Math.max(value,n);}
  return {value,applied:selected.map(row=>row.id)};
}

/** Remove a StateInstance and the ModifierStates it owns (explicit ownership, not a cascade). */
export function removeStateInstance(state,instanceId){
  const index=state.stateInstances.findIndex(instance=>instance.id===instanceId);if(index<0)return null;
  const [removed]=state.stateInstances.splice(index,1);
  removeModifierStates(state,modifier=>modifier.sourceRef?.kind==="stateInstance"&&modifier.sourceRef.id===removed.id);
  return removed;
}
export function removeModifierStates(state,predicate){
  const removed=[];
  for(const ds of Object.values(state.definitionStates)){const keep=[];for(const modifier of ds.modifiers??[])(predicate(modifier)?removed:keep).push(modifier);ds.modifiers=keep;}
  return removed;
}
export function hasDurations(state){
  return state.stateInstances.some(instance=>instance.durationState)||Object.values(state.definitionStates).some(ds=>(ds.modifiers??[]).some(modifier=>modifier.durationState));
}
