import {RuntimeEngine} from "./runtime-engine.mjs";
import {FoundryRuntimeAdapter} from "./foundry-runtime-adapter.mjs";
import {serveRuntimeRelay} from "./runtime-relay.mjs";

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
    emitEvent:(versionId,eventTypeId,payload,context,options)=>engine.emitEvent(versionId,eventTypeId,payload,context,options),
    previewAction:(versionId,id,context)=>engine.previewAction(versionId,id,context),
    executeAction:write("executeAction"),
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
