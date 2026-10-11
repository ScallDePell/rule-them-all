/** Generic, deterministic configuration contracts. No game-specific terms, eval or side effects. */
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const own = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
export const PRESENTATION_KEYS = Object.freeze(['visible','label','order','group','format','color']);
export const CONSTRAINT_KINDS = Object.freeze(['required','min','max','lengthMin','lengthMax','equals','notEquals','fieldEquals','fieldNotEquals','relationCount']);
const pathValue = (data, path) => String(path ?? '').split('.').reduce((value, key) => record(value) && own(value,key) ? value[key] : undefined, data);
const validHex = value => /^#[0-9a-f]{6}$/i.test(value);

/** Returns explicit issues, rather than silently ignoring unknown operations. */
export function validateConstraintContract(rules, {path='constraints'}={}) {
  const errors=[];
  if (!Array.isArray(rules)) return [{code:'CONSTRAINTS_TYPE',path,message:'Constraints must be an array.'}];
  rules.forEach((rule,index)=>{
    const at=`${path}[${index}]`;
    if (!record(rule)) {errors.push({code:'CONSTRAINT_INVALID',path:at,message:'Constraint must be an object.'});return;}
    if (!CONSTRAINT_KINDS.includes(rule.kind)) {errors.push({code:'CONSTRAINT_UNKNOWN',path:at,message:`Unknown constraint kind: ${String(rule.kind)}.`});return;}
    if (typeof rule.field !== 'string' || !rule.field.trim()) errors.push({code:'CONSTRAINT_FIELD',path:at,message:'Constraint requires a field path.'});
    if (['min','max','lengthMin','lengthMax','relationCount'].includes(rule.kind) && (!Number.isFinite(rule.value) || rule.value<0 && ['lengthMin','lengthMax','relationCount'].includes(rule.kind))) errors.push({code:'CONSTRAINT_VALUE',path:at,message:'Numeric constraint requires a valid value.'});
    if (['fieldEquals','fieldNotEquals'].includes(rule.kind) && (typeof rule.otherField!=='string'||!rule.otherField.trim())) errors.push({code:'CONSTRAINT_VALUE',path:at,message:'Cross-field comparison requires another field.'});
    if (['equals','notEquals'].includes(rule.kind) && !own(rule,'value')) errors.push({code:'CONSTRAINT_VALUE',path:at,message:'Comparison requires a value.'});
  });
  return errors;
}
/** Check an object and optionally its relations. No mutation, no implicit repair. */
export function evaluateConstraints(rules, data, {path='data'}={}) {
  const errors=validateConstraintContract(rules);
  if (errors.length) return errors;
  const result=[];
  for (const [index,rule] of rules.entries()) {
    const value=pathValue(data,rule.field), at=`${path}.${rule.field}`;
    let valid=true;
    switch(rule.kind) {
      case 'required': valid=value!==undefined&&value!==null&&value!==''&&(!Array.isArray(value)||value.length>0); break;
      case 'min': valid=typeof value==='number' && value>=rule.value; break;
      case 'max': valid=typeof value==='number' && value<=rule.value; break;
      case 'lengthMin': valid=(typeof value==='string'||Array.isArray(value))&&value.length>=rule.value; break;
      case 'lengthMax': valid=(typeof value==='string'||Array.isArray(value))&&value.length<=rule.value; break;
      case 'fieldEquals': valid=Object.is(value,pathValue(data,rule.otherField)); break;
      case 'fieldNotEquals': valid=!Object.is(value,pathValue(data,rule.otherField)); break;
      case 'equals': valid=Object.is(value,rule.value); break;
      case 'notEquals': valid=!Object.is(value,rule.value); break;
      case 'relationCount': valid=Array.isArray(value)&&value.length===rule.value; break;
    }
    if (!valid) result.push({code:'CONSTRAINT_VIOLATION',path:at,message:`Constraint ${rule.kind} failed at ${rule.field} (rule ${index+1}).`});
  }
  return result;
}
export function validatePresentationContract(value,{path='presentation'}={}) {
  if (value===null || value===undefined) return [];
  if (!record(value)) return [{code:'PRESENTATION_TYPE',path,message:'Presentation must be an object or null.'}];
  const errors=[];
  const checks={visible:v=>typeof v==='boolean',label:v=>typeof v==='string',order:v=>Number.isSafeInteger(v),group:v=>typeof v==='string',format:v=>typeof v==='string',color:v=>v===null||validHex(v)};
  for (const key of PRESENTATION_KEYS) if (own(value,key)&&!checks[key](value[key])) errors.push({code:'PRESENTATION_VALUE',path:`${path}.${key}`,message:`Invalid presentation ${key}.`});
  // Unknown keys survive round trips for compatibility; they cannot affect executable presentation.
  return errors;
}
/** Whitelist-based inheritance; unknown historical metadata is preserved elsewhere, not executed. */
export function resolvePresentation(typePresentation, definitionPresentation, contextPresentation, {canRead=true,canWrite=true}={}) {
  const result={};
  for (const layer of [typePresentation,definitionPresentation,contextPresentation]) if (record(layer)) {
    for (const key of PRESENTATION_KEYS) if (own(layer,key)) result[key]=layer[key];
  }
  if (!canRead) result.visible=false;
  result.editable=Boolean(canWrite); // an appearance preference never grants authorization
  return Object.freeze(result);
}
