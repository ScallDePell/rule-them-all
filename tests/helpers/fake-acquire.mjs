/** runtime.acquire for bridge tests whose runtime fake records instantiateDefinition calls:
 * the absent bindings are instantiated one by one (no acquisition Action). */
export async function fakeAcquire(versionId,actorRef,{definitionBindings=[]}={}){
  const state=await this.getContainerState(actorRef,{rulesetVersionId:versionId}),acquiredDefinitionIds=[];
  for(const binding of definitionBindings){
    if(state.definitionStates?.[binding.definitionId]||acquiredDefinitionIds.includes(binding.definitionId))continue;
    await this.instantiateDefinition(versionId,actorRef,binding.definitionId,{initial:binding.initial});
    acquiredDefinitionIds.push(binding.definitionId);
  }
  return {allowed:true,reason:null,acquiredDefinitionIds,transactionId:'fake',ledgerEntryIds:[],duplicate:false,action:null};
}
