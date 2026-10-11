import {OWNERSHIP_LEVELS,PERMISSION_OPERATIONS} from "../configurator/permission-contract.mjs";

/** 0 = whole Ruleset, 1 = a kind of object, 2 = one object. */
function scopeRank(scope,target){
  if(scope.objectKind==="ruleset")return 0;
  if(scope.objectKind!==target.objectKind)return -1;
  if(!scope.objectId)return 1;
  return scope.objectId===target.objectId?2:-1;
}
function subjectMatches(rule,subject){
  if(rule.roles.length&&!rule.roles.includes(subject.role))return false;
  if(rule.minimumOwnership&&OWNERSHIP_LEVELS.indexOf(subject.ownership??"none")<OWNERSHIP_LEVELS.indexOf(rule.minimumOwnership))return false;
  if(rule.userIds.length&&!rule.userIds.includes(subject.userId))return false;
  return true;
}

/** Decide one operation on one object for one subject.
 * subject: {userId, role, isGM, ownership} where ownership is the subject's level on the container.
 * Precedence: a GM is always allowed; then the most specific scope that has policies decides:
 * among its matching rules, highest priority first, DENY wins a tie; else that scope's default.
 * Without any policy, Foundry ownership decides (owner writes and executes, observer reads). */
export async function resolvePermission(policies,{operation,target,subject,condition=async()=>true}){
  if(!PERMISSION_OPERATIONS.includes(operation))throw new Error(`Unknown permission operation: ${operation}.`);
  if(subject?.isGM)return {allowed:true,reason:"gamemaster",policyId:null,ruleId:null};
  if(operation==="configure")return {allowed:false,reason:"configure",policyId:null,ruleId:null};
  const scoped=(policies??[]).filter(policy=>policy?.enabled!==false).map(policy=>({policy,rank:scopeRank(policy.scope??{objectKind:"ruleset"},target)})).filter(row=>row.rank>=0);
  const ranks=[...new Set(scoped.map(row=>row.rank))].sort((a,b)=>b-a);
  for(const rank of ranks){
    const level=scoped.filter(row=>row.rank===rank).map(row=>row.policy);
    const matching=[];
    for(const policy of level)for(const rule of policy.rules??[]){
      if(!rule.operations.includes(operation)||!subjectMatches(rule,subject))continue;
      if(rule.conditionRef&&!await condition(rule.conditionRef))continue;
      matching.push({policy,rule});
    }
    matching.sort((a,b)=>b.rule.priority-a.rule.priority||(a.rule.effect==="DENY"?-1:1)-(b.rule.effect==="DENY"?-1:1));
    const top=matching[0];
    if(top)return {allowed:top.rule.effect==="ALLOW",reason:"rule",policyId:top.policy.id,ruleId:top.rule.id};
    // Several policies on the same scope: one DENY default is enough to deny.
    const denied=level.find(policy=>policy.defaultEffect!=="ALLOW");
    return {allowed:!denied,reason:"default",policyId:(denied??level[0]).id,ruleId:null};
  }
  const needed=operation==="read"?"observer":"owner";
  return {allowed:OWNERSHIP_LEVELS.indexOf(subject?.ownership??"none")>=OWNERSHIP_LEVELS.indexOf(needed),reason:"ownership",policyId:null,ruleId:null};
}
