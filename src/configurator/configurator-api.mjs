import {ConfiguratorRegistry} from "./configurator-registry.mjs";
import {validateRuleset} from "./configurator-validation.mjs";
import {exportRulesetData, readRulesetPayload} from "./configurator-serialization.mjs";
import {createGraphAPI} from "./configurator-graph.mjs";
import {copyJSON} from "./configurator-schema.mjs";
import {readStorageSnapshot, storageConflict, storageFingerprint} from "./configurator-storage.mjs";
import {capabilityTypeRegistry} from "./capability-type-registry.mjs";
import {valueTypeRegistry} from "./value-type-registry.mjs";
import {ENTRY_OPERATIONS} from "./entry-operations.mjs";
import {duplicateEntryData} from "./entry-duplication.mjs";
import {applyRulesetPartImport, collectDependencies, exportRulesetPart, planRulesetPartImport} from "./ruleset-parts.mjs";
import {applyExtensionInstall, planExtensionInstall, removeExtension} from "./ruleset-extensions.mjs";

function registryAPI(registry) {
  const api={...createGraphAPI(registry),
    listCapabilityTypes:()=>capabilityTypeRegistry.list(), getCapabilityType:id=>capabilityTypeRegistry.get(id),
    listValueTypes:()=>valueTypeRegistry.list(), getValueType:id=>valueTypeRegistry.get(id), isValueTypeAssignable:(source,target)=>valueTypeRegistry.isAssignable(source,target),
    listRulesetFamilies:()=>registry.listFamilies(), listRulesetVersions:id=>registry.listVersions(id), getRulesetVersion:id=>registry.getRecord(id), getRuntimeRuleset:(id,source)=>registry.getRuntimeRuleset(id,source), getRuleset:id=>registry.get(id), getPublishedRuleset:id=>registry.getPublished(id),
    getStorageRevision:()=>registry.getStorageRevision(), getActiveVersionId:()=>registry.getActiveVersionId(), setActiveVersionId:id=>registry.setActiveVersionId(id),
    getWorldOverride:(v,l,k)=>registry.getWorldOverride(v,l,k), getVersionWorldOverrides:v=>registry.getVersionWorldOverrides(v), resolveLocalizedText:(v,l,k,f)=>registry.resolveLocalizedText(v,l,k,f), setWorldOverride:(v,l,k,x)=>registry.setWorldOverride(v,l,k,x), deleteWorldOverride:(v,l,k)=>registry.deleteWorldOverride(v,l,k),
    createRuleset:d=>registry.create(d), updateRuleset:(v,p)=>registry.update(v,p), deleteRulesetVersion:v=>registry.delete(v), validateRuleset,
    diagnoseRuleset:(v,{scope="publish"}={})=>{const r=registry.get(v); if(!r) throw new Error(`RulesetVersion not found: ${v}.`); return validateRuleset(r,{scope});},
    publishRuleset:v=>registry.publish(v), validateRulesetVersion:v=>registry.validateVersion(v), createNewRulesetVersion:(v,n,o)=>registry.createNewVersion(v,n,o),
    exportRuleset:(v,{includeWorldLocalizations=false}={})=>{const r=registry.getRecord(v); if(!r) throw new Error(`RulesetVersion not found: ${v}.`); return exportRulesetData(r,includeWorldLocalizations?{worldLocalizations:registry.getVersionWorldOverrides(v)}:{});},
    importRuleset:(payload,mode)=>{const d=readRulesetPayload(payload); return registry.import(d.record,mode,d.worldLocalizations);}
  };
  const draftOf=v=>{const r=registry.getRecord(v); if(!r) throw new Error(`RulesetVersion not found: ${v}.`); return r.workingDraft;};
  /** Parts of a Ruleset: what a selection needs, the part itself, and reading a part into a draft. */
  api.listPartDependencies=(v,selection,{stop=[]}={})=>collectDependencies(draftOf(v),selection,{stop});
  api.exportRulesetPart=(v,{selection,expect=[],name="",extension=null}={})=>exportRulesetPart(draftOf(v),{selection,expect,name,extension,worldLocalizations:registry.getVersionWorldOverrides(v)});
  api.planRulesetPartImport=(v,payload)=>planRulesetPartImport(draftOf(v),payload);
  // The part's world translations fill texts this Ruleset has none for.
  const addTranslations=(v,localizations)=>{for(const [locale,translations] of Object.entries(localizations))for(const [key,text] of Object.entries(translations))
    if(typeof text==="string"&&registry.getWorldOverride(v,locale,key)===undefined)registry.setWorldOverride(v,locale,key,text);};
  api.importRulesetPart=(v,payload,decisions={})=>{
    const result=applyRulesetPartImport(draftOf(v),payload,decisions);
    registry.update(v,result.patch);addTranslations(v,result.localizations);
    return {created:result.created,replaced:result.replaced,renamed:result.renamed};
  };
  /** Extensions: parts with a header, installed, updated and removed as a whole. */
  api.planExtensionInstall=(v,payload)=>planExtensionInstall(draftOf(v),payload);
  api.installExtension=(v,payload,decisions={})=>{
    const result=applyExtensionInstall(draftOf(v),payload,decisions);
    registry.update(v,result.patch);addTranslations(v,result.localizations);
    return {record:result.record,created:result.created,replaced:result.replaced,removed:result.removed};
  };
  api.removeExtension=(v,id)=>{const result=removeExtension(draftOf(v),id);registry.update(v,result.patch);return {removed:result.removed,restored:result.restored};};
  /** A copy of one entry under a new name, created in the same Ruleset; returns the new entry. */
  api.duplicateEntry=(v,kind,id,name)=>{const ops=ENTRY_OPERATIONS[kind]; if(!ops)throw new Error(`Entries of kind ${kind} cannot be duplicated.`); const source=api[ops.get](v,id); if(!source)throw new Error(`Entry not found: ${kind} ${id}.`); return api[ops.create](v,duplicateEntryData(registry.get(v),kind,source,name));};
  return api;
}
const MUTATIONS=new Set(["duplicateEntry","createRuleset","updateRuleset","deleteRulesetVersion","publishRuleset","validateRulesetVersion","createNewRulesetVersion","importRuleset","importRulesetPart","installExtension","removeExtension","setActiveVersionId","setWorldOverride","deleteWorldOverride","registerDefinitionType","updateDefinitionType","deleteDefinitionType","createDefinition","updateDefinition","deleteDefinition","createParameter","updateParameter","deleteParameter","createFormula","updateFormula","deleteFormula","createFormulaBinding","updateFormulaBinding","deleteFormulaBinding","createCondition","updateCondition","deleteCondition","createRoll","updateRoll","deleteRoll","createOutcome","updateOutcome","deleteOutcome","createTest","updateTest","deleteTest","createEffect","updateEffect","deleteEffect","createAction","updateAction","deleteAction","createPermissionPolicy","updatePermissionPolicy","deletePermissionPolicy","createEventType","updateEventType","deleteEventType","createTrigger","updateTrigger","deleteTrigger","createContentType","updateContentType","deleteContentType","createContentTemplate","updateContentTemplate","deleteContentTemplate","createModifier","updateModifier","deleteModifier","createDuration","updateDuration","deleteDuration","createDie","updateDie","deleteDie","createTable","updateTable","deleteTable","createScale","updateScale","deleteScale","createCreationSystem","updateCreationSystem","deleteCreationSystem","createProgressionSystem","updateProgressionSystem","deleteProgressionSystem","createSheetDefinition","updateSheetDefinition","deleteSheetDefinition","createSheetTemplate","updateSheetTemplate","deleteSheetTemplate","createSheetTheme","updateSheetTheme","deleteSheetTheme","createTag","updateTag","deleteTag","reorderEntries","applyRecipe"]);
export async function createConfiguratorAPI(storage,{onError=error=>console.error("Rule Them'All | Configurator storage",error)}={}) {
  if(!storage||typeof storage.load!=="function"||typeof storage.save!=="function") throw new TypeError("Configurator requires a load/save storage adapter.");
  const registry=new ConfiguratorRegistry(), listeners=new Set(); let loading=true,saving=false,pending=[],queue=Promise.resolve();
  const report=e=>{try{onError(e);}catch{}}; const notify=()=>{for(const f of listeners)try{f();}catch(e){report(e);}};
  const applyIncoming=s=>{const c=registry.snapshot(); if(s.storageRevision<c.storageRevision)return; if(storageFingerprint(s)===storageFingerprint(c))return; if(s.storageRevision===c.storageRevision)report(storageConflict(c.storageRevision,s.storageRevision)); registry.hydrate(s); notify();};
  const receive=v=>{try{const s=readStorageSnapshot(v); if(loading||saving)pending.push(s);else applyIncoming(s);}catch(e){report(e);}}; const unsubscribe=storage.subscribe?.(receive);
  try{registry.hydrate(await storage.load());}catch(e){unsubscribe?.();report(e);throw e;} loading=false; for(const s of pending)applyIncoming(s); pending=[];
  const mutate=async(name,args)=>{const input=copyJSON(args); const operation=queue.then(async()=>{const expected=registry.snapshot(),actual=readStorageSnapshot(await storage.load()),current=registry.snapshot(); if(storageFingerprint(expected)!==storageFingerprint(current)||storageFingerprint(expected)!==storageFingerprint(actual))throw storageConflict(expected.storageRevision,Math.max(current.storageRevision,actual.storageRevision)); const candidate=new ConfiguratorRegistry();candidate.hydrate(expected); const result=registryAPI(candidate)[name](...input),snapshot=candidate.snapshot(); snapshot.storageRevision++; readStorageSnapshot(snapshot); saving=true;let committed=false;try{await storage.save(copyJSON(snapshot));registry.hydrate(snapshot);committed=true;notify();return copyJSON(result);}finally{saving=false;const deferred=pending;pending=[];for(const incoming of deferred){if(!committed&&storageFingerprint(incoming)===storageFingerprint(snapshot))continue;applyIncoming(incoming);}}}); queue=operation.catch(()=>{}); return operation;};
  const api=registryAPI(registry); for(const name of MUTATIONS)api[name]=(...args)=>mutate(name,args); api.subscribe=f=>{if(typeof f!=="function")throw new TypeError("Subscriber must be a function.");listeners.add(f);return()=>listeners.delete(f);}; return Object.freeze(api);
}
