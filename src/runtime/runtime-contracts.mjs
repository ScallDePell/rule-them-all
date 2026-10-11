import {copyJSON, isRecord} from "../configurator/configurator-schema.mjs";

export const RUNTIME_SCHEMA_VERSION = 1;

export function createRuntimeState({rulesetVersionId=""}={}) {
  return {schemaVersion:RUNTIME_SCHEMA_VERSION,rulesetVersionId,runtimeRevision:0,definitionStates:{},stateInstances:[]};
}

export function prepareRuntimeState(data,{rulesetVersionId=""}={}) {
  const state=isRecord(data)?copyJSON(data):createRuntimeState({rulesetVersionId});
  if(state.schemaVersion!==RUNTIME_SCHEMA_VERSION) throw new Error(`Unsupported runtime schemaVersion: ${state.schemaVersion}.`);
  if(typeof state.rulesetVersionId!=="string") throw new Error("Runtime rulesetVersionId must be a string.");
  if(!Number.isSafeInteger(state.runtimeRevision)||state.runtimeRevision<0) throw new Error("runtimeRevision must be a non-negative safe integer.");
  if(!isRecord(state.definitionStates)) throw new Error("definitionStates must be an object.");
  if(!Array.isArray(state.stateInstances)) throw new Error("stateInstances must be an array.");
  return state;
}

export function createDefinitionState(definition,{initial={}}={}) {
  const capabilityStates={};
  const caps=new Set(definition.capabilities??[]);
  if(caps.has("value")) capabilityStates.value={base:Number(initial["value.base"]??0)};
  if(caps.has("pool")) capabilityStates.pool={
    current:Number(initial["pool.current"]??0),
    minimum:Number(initial["pool.minimum"]??0),
    maximum:Number(initial["pool.maximum"]??initial["pool.current"]??0)
  };
  if(caps.has("collection")) capabilityStates.collection={entries:Array.isArray(initial["collection.entries"])?copyJSON(initial["collection.entries"]):[]};
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
  const record=configurator.getRulesetVersion?.(versionId);
  if(!record)throw new Error(`Ruleset version not found: ${versionId}.`);
  const ruleset=source==="draft"?record.workingDraft:record.publishedSnapshot;
  if(!ruleset)throw new Error(source==="draft"?`Ruleset version has no working draft: ${versionId}.`:`Ruleset version is not published: ${versionId}.`);
  return ruleset;
}
