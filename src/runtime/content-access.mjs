/** Portable acquisition -> Action grants. A grant is scoped to a Ruleset version
 * and exists only while its acquisition remains on the Actor.
 * This function does not impose any game's notion of class, job or skill.
 */
export function acquiredActionIds(acquisitions, versionId){
  if(!acquisitions || typeof acquisitions !== 'object' || Array.isArray(acquisitions))return [];
  const ids=new Set();
  for(const record of Object.values(acquisitions)){
    if(!record || record.versionId!==versionId)continue;
    for(const actionId of record.actionIds??[]){
      if(typeof actionId==='string' && actionId.trim())ids.add(actionId);
    }
  }
  return [...ids];
}
