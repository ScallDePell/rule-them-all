import {RuntimeEngine} from "./runtime-engine.mjs";
import {FoundryRuntimeAdapter} from "./foundry-runtime-adapter.mjs";

export function createRuntimeAPI(configurator,{adapter=new FoundryRuntimeAdapter(),hooks=globalThis.Hooks,rulesetSource="published"}={}){
  const engine=new RuntimeEngine({configurator,adapter,hooks,rulesetSource});
  return Object.freeze({
    getContainerState:(ref,o)=>engine.getContainerState(ref,o),
    instantiateDefinition:(versionId,ref,definitionId,o)=>engine.instantiateDefinition(versionId,ref,definitionId,o),
    removeDefinitionState:(versionId,ref,definitionId)=>engine.removeDefinitionState(versionId,ref,definitionId),
    setDefinitionState:(versionId,ref,definitionId,o)=>engine.setDefinitionState(versionId,ref,definitionId,o),
    addCollectionEntry:(versionId,ref,definitionId,slotId,entry)=>engine.addCollectionEntry(versionId,ref,definitionId,slotId,entry),
    removeCollectionEntry:(versionId,ref,definitionId,slotId,entryId)=>engine.removeCollectionEntry(versionId,ref,definitionId,slotId,entryId),
    transferCollectionEntry:(versionId,options)=>engine.transferCollectionEntry(versionId,options),
    evaluateFormula:(versionId,id,context)=>engine.evaluateFormula(versionId,id,context),
    evaluateCondition:(versionId,id,context)=>engine.evaluateCondition(versionId,id,context),
    resolveModifiers:(versionId,targetRef,baseValue,context)=>engine.resolveModifiers(versionId,targetRef,baseValue,context),
    checkRestrictions:(versionId,operationKind,context)=>engine.checkRestrictions(versionId,operationKind,context),
    roll:(formula,data)=>engine.roll(formula,data),
    executeTest:(versionId,id,context)=>engine.executeTest(versionId,id,context),
    createTestActors:options=>adapter.createTestActors(options),
    resetContainer:ref=>adapter.reset(ref),
    initializeContainer:(versionId,ref,o)=>engine.initializeContainer(versionId,ref,o),
    emitEvent:(versionId,eventTypeId,payload,context,options)=>engine.emitEvent(versionId,eventTypeId,payload,context,options),
    previewAction:(versionId,id,context)=>engine.previewAction(versionId,id,context),
    executeAction:(versionId,id,context,options)=>engine.executeAction(versionId,id,context,options),
    describeContainer:ref=>adapter.describe(ref),
    rulesetSource,
    adapter
  });
}
