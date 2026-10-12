/** v14 createItem/deleteItem hooks are broadcast to all connected clients.
 * Only the initiating client may write acquisition flags or Runtime state.
 */
import {MODULE_ID} from '../core/module-contract.mjs';
import {foundryJSON} from './foundry-data.mjs';
export function isOwningContentHook(item,userId,currentUserId){
  return Boolean(userId && currentUserId && userId===currentUserId && item?.parent?.documentName==='Actor');
}

/** Synchronous preCreateItem gate: Foundry preCreate hooks cannot await a
 * selection dialog. Cancel the raw create and start a separate, validated
 * guided creation instead. No incomplete owned Item may be committed.
 * Caller schedules the guided flow after the hook returns (not inside it).
 */
export function guardOwnedContentCreation(item,userId,currentUserId,bridge,{requestGuided=()=>{},onError=()=>{}}={}){
  if(!isOwningContentHook(item,userId,currentUserId))return;
  const flag=item.getFlag?.(MODULE_ID,'contentTemplate');
  if(!flag?.managed)return;
  try{
    if(!bridge)throw new Error('Rule Them\'All Content Runtime is not ready.');
    const {contentType}=bridge.assertAcquisitionEligibility(item.parent,flag.versionId,flag.templateId);
    if(contentType.storageKind==='actor')throw new Error('Actor-backed Content cannot be embedded as an Item.');
    if(!Object.hasOwn(flag,'acquisitionSelections')){
      requestGuided({versionId:flag.versionId,actorRef:item.parent.uuid,templateId:flag.templateId,
        sourceData:typeof item.toObject==='function'?foundryJSON(item.toObject()):null});
      return false;
    }
    bridge.preflightAcquisition(flag.versionId,flag.templateId,flag.acquisitionSelections);
  }catch(error){onError(error);return false;}
}
