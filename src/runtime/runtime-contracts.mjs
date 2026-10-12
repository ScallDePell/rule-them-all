import {copyJSON, isRecord} from "../configurator/configurator-schema.mjs";

// 2: pool and collection states are keyed by capability slot (CP-26/27).
export const RUNTIME_SCHEMA_VERSION = 2;

export function createRuntimeState({rulesetVersionId=""}={}) {
  return {schemaVersion:RUNTIME_SCHEMA_VERSION,rulesetVersionId,runtimeRevision:0,definitionStates:{},stateInstances:[],contents:{}};
}

export function prepareRuntimeState(data,{rulesetVersionId=""}={}) {
  const state=isRecord(data)?copyJSON(data):createRuntimeState({rulesetVersionId});
  if(state.schemaVersion!==RUNTIME_SCHEMA_VERSION) throw new Error(`Unsupported runtime schemaVersion: ${state.schemaVersion}.`);
  if(typeof state.rulesetVersionId!=="string") throw new Error("Runtime rulesetVersionId must be a string.");
  if(!Number.isSafeInteger(state.runtimeRevision)||state.runtimeRevision<0) throw new Error("runtimeRevision must be a non-negative safe integer.");
  if(!isRecord(state.definitionStates)) throw new Error("definitionStates must be an object.");
  if(!Array.isArray(state.stateInstances)) throw new Error("stateInstances must be an array.");
  // Owned Contents: acquisition key -> {templateId, contentTypeId, fields} (instance values over the template's data).
  state.contents??={};
  if(!isRecord(state.contents)) throw new Error("contents must be an object.");
  // Progression milestones already applied: "<progressionSystemId>/<milestoneId>".
  state.milestones??=[];
  if(!Array.isArray(state.milestones)) throw new Error("milestones must be an array.");
  return state;
}

/** slotStates: per-slot pool/collection states, already evaluated by the engine. */
export function createDefinitionState(definition,{initial={},slotStates={}}={}) {
  const capabilityStates={};
  const caps=new Set(definition.capabilities??[]);
  if(caps.has("value")) capabilityStates.value={base:Number(initial["value.base"]??0)};
  if(caps.has("pool")) capabilityStates.pool=copyJSON(slotStates.pool??{});
  if(caps.has("collection")) capabilityStates.collection=copyJSON(slotStates.collection??{});
  if(caps.has("state")) capabilityStates.state={active:Boolean(initial["state.active"]??false)};
  return {definitionId:definition.id,fields:{},capabilityStates,modifiers:[]};
}

export function normalizeRuntimeContainerRef(ref) {
  if(typeof ref==="string"&&ref.trim()) return {uuid:ref.trim()};
  if(!isRecord(ref)) throw new TypeError("RuntimeContainerRef must be an object or UUID string.");
  if(typeof ref.uuid==="string"&&ref.uuid.trim()) return {uuid:ref.uuid.trim()};
  if(typeof ref.kind!=="string"||!ref.kind.trim()||typeof ref.id!=="string"||!ref.id.trim()) throw new Error("RuntimeContainerRef requires uuid or kind/id.");
  return {kind:ref.kind.trim(),id:ref.id.trim()};
}

/** Gameplay only ever reads the published snapshot of a
 * RulesetVersion. The "draft" source is an explicit GM sandbox (Runtime Lab)
 * that previews the working copy; it is never used by the content bridge. */
export const RULESET_SOURCES=Object.freeze(["published","draft"]);
export function resolveRuntimeRuleset(configurator,versionId,{source="published"}={}){
  if(!RULESET_SOURCES.includes(source))throw new Error(`Unknown runtime Ruleset source: ${source}.`);
  // Frozen and shared: callers copy what they change.
  if(configurator.getRuntimeRuleset){const ruleset=configurator.getRuntimeRuleset(versionId,source);if(ruleset)return ruleset;}
  const record=configurator.getRulesetVersion?.(versionId);
  if(!record)throw new Error(`Ruleset version not found: ${versionId}.`);
  const ruleset=source==="draft"?record.workingDraft:record.publishedSnapshot;
  if(!ruleset)throw new Error(source==="draft"?`Ruleset version has no working draft: ${versionId}.`:`Ruleset version is not published: ${versionId}.`);
  return ruleset;
}
