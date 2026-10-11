import {copyJSON,isRecord} from "./configurator-schema.mjs";

/** CP-11 business operations; a View never grants any of them. */
export const PERMISSION_OPERATIONS=Object.freeze(["read","write","execute","configure"]);
/** Foundry user roles, lowest first (CONST.USER_ROLES 1..4). */
export const PERMISSION_ROLES=Object.freeze(["player","trusted","assistant","gamemaster"]);
/** Foundry ownership levels, lowest first (CONST.DOCUMENT_OWNERSHIP_LEVELS 0..3). */
export const OWNERSHIP_LEVELS=Object.freeze(["none","limited","observer","owner"]);

const nonempty=value=>typeof value==="string"&&value.trim().length>0;

/** PermissionRule: effect for some operations, for subjects matching every given criterion.
 * {id, effect:ALLOW|DENY, operations[], roles[]?, minimumOwnership?, userIds[]?, conditionRef?, priority} */
export function preparePermissionRule(data,index=0){
  if(!isRecord(data))throw new Error(`PermissionPolicy.rules[${index}] must be an object.`);
  const rule={roles:[],minimumOwnership:null,userIds:[],conditionRef:null,priority:0,...copyJSON(data)};
  if(!nonempty(rule.id))throw new Error(`PermissionPolicy.rules[${index}] requires an id.`);
  if(!["ALLOW","DENY"].includes(rule.effect))throw new Error(`Permission rule ${rule.id}: effect must be ALLOW or DENY.`);
  if(!Array.isArray(rule.operations)||!rule.operations.length||rule.operations.some(op=>!PERMISSION_OPERATIONS.includes(op)))throw new Error(`Permission rule ${rule.id}: operations must list ${PERMISSION_OPERATIONS.join(", ")}.`);
  if(!Array.isArray(rule.roles)||rule.roles.some(role=>!PERMISSION_ROLES.includes(role)))throw new Error(`Permission rule ${rule.id}: roles must be among ${PERMISSION_ROLES.join(", ")}.`);
  if(rule.minimumOwnership!==null&&!OWNERSHIP_LEVELS.includes(rule.minimumOwnership))throw new Error(`Permission rule ${rule.id}: minimumOwnership must be one of ${OWNERSHIP_LEVELS.join(", ")}.`);
  if(!Array.isArray(rule.userIds)||rule.userIds.some(id=>!nonempty(id)))throw new Error(`Permission rule ${rule.id}: userIds must be user ids.`);
  if(rule.conditionRef!==null&&!nonempty(rule.conditionRef))throw new Error(`Permission rule ${rule.id}: conditionRef must be a Condition id or null.`);
  if(!Number.isFinite(rule.priority))throw new Error(`Permission rule ${rule.id}: priority must be a number.`);
  return rule;
}
export function preparePermissionRules(rules){
  if(!Array.isArray(rules))throw new Error("PermissionPolicy.rules must be an array.");
  const prepared=rules.map(preparePermissionRule),ids=new Set();
  for(const rule of prepared){if(ids.has(rule.id))throw new Error(`Duplicate permission rule id: ${rule.id}.`);ids.add(rule.id);}
  return prepared;
}

