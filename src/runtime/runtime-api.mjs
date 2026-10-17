import {RuntimeEngine} from "./runtime-engine.mjs";
import {FoundryRuntimeAdapter} from "./foundry-runtime-adapter.mjs";
import {serveRuntimeRelay} from "./runtime-relay.mjs";
import {projectSheet} from "./sheet-projection.mjs";
import {describeShared, setSharedValue} from "./shared-resources.mjs";

/** relay: {request(method,args)}; a write this client cannot make on a Document goes to the GM client. */
export function createRuntimeAPI(configurator,{adapter=new FoundryRuntimeAdapter(),hooks=globalThis.Hooks,rulesetSource="published",relay=null}={}){
  const engine=new RuntimeEngine({configurator,adapter,hooks,rulesetSource});
  const relayed=async(method,args)=>Boolean(relay)&&!(method==="executeAction"&&args[3]?.preview)&&await engine.needsGM(method,args);
  const write=method=>async(...args)=>await relayed(method,args)?relay.request(method,args):engine[method](...args);
  return Object.freeze({
    getContainerState:(ref,o)=>engine.getContainerState(ref,o),
    instantiateDefinition:write("instantiateDefinition"),
    removeDefinitionState:write("removeDefinitionState"),
    setDefinitionState:write("setDefinitionState"),
    /** The lowest and highest base of a value Definition on a container (null when unbounded). */
    valueBounds:(versionId,ref,definitionId)=>engine.valueBounds(versionId,ref,definitionId),
    /** What a sheet shows for an Actor ({actor}) or an Item ({actor?, content: {key} | {templateId}}), Permission applied. */
    projectSheet:(versionId,sheet,subject)=>projectSheet(engine,versionId,sheet,subject),
    writeSheetValue:write("writeSheetValue"),
    addCollectionEntry:write("addCollectionEntry"),
    removeCollectionEntry:write("removeCollectionEntry"),
    transferCollectionEntry:write("transferCollectionEntry"),
    evaluateFormula:(versionId,id,context)=>engine.evaluateFormula(versionId,id,context),
    evaluateCondition:(versionId,id,context)=>engine.evaluateCondition(versionId,id,context),
    resolveModifiers:(versionId,targetRef,baseValue,context)=>engine.resolveModifiers(versionId,targetRef,baseValue,context),
    roll:(formula,data)=>engine.roll(formula,data),
    executeTest:(versionId,id,context)=>engine.executeTest(versionId,id,context),
    createTestActors:options=>adapter.createTestActors(options),
    resetContainer:ref=>adapter.reset(ref),
    initializeContainer:write("initializeContainer"),
    rebindContainer:write("rebindContainer"),
    /** Runs a character creation's writes on that container (see RuntimeEngine.duringCreation). */
    duringCreation:(ref,build)=>engine.duringCreation(ref,build),
    emitEvent:(versionId,eventTypeId,payload,context,options)=>engine.emitEvent(versionId,eventTypeId,payload,context,options),
    emitSystemEvent:(eventTypeId,payload,refs)=>engine.emitSystemEvent(eventTypeId,payload,refs),
    previewAction:(versionId,id,context)=>engine.previewAction(versionId,id,context),
    rollTable:(versionId,id,context)=>engine.rollTable(versionId,id,context),
    describeActionInputs:(versionId,id,context)=>engine.describeActionInputs(versionId,id,context),
    userTargets:()=>adapter.userTargets?.()??[],
    executeAction:write("executeAction"),
    rerollAction:write("rerollAction"),
    chooseActions:write("chooseActions"),
    rollInitiative:(versionId,ref,options)=>engine.rollInitiative(versionId,ref,options),
    /** The world's shared Definitions, and a combat's ({kind: "combat", id}); versionId defaults to the active Ruleset. */
    initializeShared:(versionId=configurator.getActiveVersionId?.(),{combat=null}={})=>versionId?engine.initializeShared(versionId,{combat}):{},
    /** The shared resources as the GM panel shows them, and one changed (see shared-resources.mjs). */
    describeShared:(versionId,options)=>describeShared(engine,versionId,options),
    setSharedValue:(versionId,ref,definitionId,slotId,value)=>setSharedValue(engine,versionId,ref,definitionId,slotId,value),
    initiativePasses:versionId=>{try{const passes=engine.ruleset(versionId).initiative?.passes;return passes?{step:passes.step,threshold:passes.threshold??0}:null;}catch{return null;}},
    initiativeEachRound:versionId=>{try{return engine.ruleset(versionId).initiative?.eachRound===true;}catch{return false;}},
    describeProgression:(versionId,id,ref)=>engine.describeProgression(versionId,id,ref),
    advance:write("advance"),
    applyMilestones:write("applyMilestones"),
    describeContainer:ref=>adapter.describe(ref),
    getLedger:ref=>engine.getLedger(ref),
    compensate:write("compensate"),
    acquire:write("acquire"),
    listOwnedContents:(versionId,ref,context)=>engine.listOwnedContents(versionId,ref,context),
    setContentField:write("setContentField"),
    releaseContent:write("releaseContent"),
    removeStateInstance:write("removeStateInstance"),
    expireStates:write("expireStates"),
    expireAll:options=>engine.expireAll(options),
    authorize:(versionId,operation,target,ref,context)=>engine.authorize(versionId,operation,target,ref,context),
    /** GM client: serve a relayed request from another user. */
    serveRelay:message=>serveRuntimeRelay(engine,message),
    rulesetSource,
    adapter
  });
}
