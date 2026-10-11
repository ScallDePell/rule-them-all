import {CONSTRAINT_KINDS,validateConstraintContract,evaluateConstraints,validatePresentationContract} from "./declarative-contracts.mjs";
import {RULESET_SECTIONS,isHexColor} from "./ruleset-colors.mjs";
import {COLLECTION_FIELDS, ENGINE_CONTRACT_VERSION, RULESET_FIELDS, isRecord} from "./configurator-schema.mjs";
import {capabilityTypeRegistry, resolveFieldContract} from "./capability-type-registry.mjs";
import {prepareFieldMap, applyFieldContract} from "./field-output-contracts.mjs";
import {PREPARERS} from "./rule-contracts.mjs";
import {DependencyIndex} from "./dependency-index.mjs";
import {normalizeRelations} from "./generic-relations.mjs";
import {DiagnosticCollector} from "./diagnostics.mjs";
import {SLOT_CAPABILITIES, findSlot, prepareDefinitionSlots} from "./capability-slots.mjs";

const nonempty = value => typeof value === "string" && value.trim().length > 0;

function exactFields(data, allowed, path, issue) {
  for (const key of Object.keys(data)) if (!allowed.includes(key)) issue("UNKNOWN_FIELD", `${path}.${key}`, `Unsupported field: ${key}.`);
}
function checkIdentity(entry, path, issue) {
  if (!isRecord(entry)) { issue("ENTRY_TYPE", path, "Entry must be a plain object."); return false; }
  if (!nonempty(entry.id)) issue("REQUIRED_STRING", `${path}.id`, "id must be a non-empty string.");
  return true;
}
function checkUnique(collection, path, issue) {
  const ids = new Set();
  collection.forEach((entry, index) => {
    if (!checkIdentity(entry, `${path}[${index}]`, issue)) return;
    if (ids.has(entry.id)) issue("DUPLICATE_ID", `${path}[${index}].id`, `Duplicate id: ${entry.id}.`);
    ids.add(entry.id);
  });
  return ids;
}
/** Run a contract helper that collects completeness issues instead of throwing them. */
function collecting(d, code, path, run) {
  const options = {incomplete: []};
  try { run(options); } catch (error) { d.thrown(code, path, error); }
  for (const message of options.incomplete) d.incomplete("INCOMPLETE", path, message);
}
function checkDefinitionType(entry, path, d) {
  const issue = d.issue;
  if (!checkIdentity(entry, path, issue)) return;
  exactFields(entry, ["id","key","nameKey","descriptionKey","color","enabled","order","allowedCapabilities","defaultCapabilities","requiredCapabilities","fields","constraints","presentation","relations"], path, issue);
  if (!nonempty(entry.key)) issue("REQUIRED_STRING", `${path}.key`, "key must be a non-empty string.");
  if (!nonempty(entry.nameKey)) d.incomplete("REQUIRED_STRING", `${path}.nameKey`, "nameKey must be a non-empty string.");
  if (typeof entry.descriptionKey !== "string") issue("STRING_TYPE", `${path}.descriptionKey`, "descriptionKey must be a string.");
  if (!(entry.color === null || nonempty(entry.color))) issue("COLOR", `${path}.color`, "color must be null or a non-empty string.");
  if (typeof entry.enabled !== "boolean") issue("BOOLEAN_TYPE", `${path}.enabled`, "enabled must be boolean.");
  if (!Number.isSafeInteger(entry.order)) issue("ORDER", `${path}.order`, "order must be a safe integer.");
  for (const key of ["allowedCapabilities","defaultCapabilities","requiredCapabilities","constraints"]) if (!Array.isArray(entry[key] ?? [])) issue("ARRAY_TYPE", `${path}.${key}`, `${key} must be an array.`);
  for (const key of ["allowedCapabilities","defaultCapabilities","requiredCapabilities"]) {
    if (Array.isArray(entry[key])) {
      const seen = new Set();
      entry[key].forEach((id,index)=>{
        if (!nonempty(id)) issue("CAPABILITY_CONTRACT", `${path}.${key}[${index}]`, "CapabilityType id must be a non-empty string.");
        else if (!capabilityTypeRegistry.has(id)) issue("CAPABILITY_CONTRACT", `${path}.${key}[${index}]`, `Unknown CapabilityType: ${id}.`);
        if (seen.has(id)) issue("CAPABILITY_CONTRACT", `${path}.${key}[${index}]`, `Duplicate CapabilityType: ${id}.`);
        seen.add(id);
      });
    }
  }
  if (!isRecord(entry.fields ?? {})) issue("OBJECT_TYPE", `${path}.fields`, "fields must be an object.");
  else { try { prepareFieldMap(entry.fields); } catch (error) { issue("FIELD_DEFINITION", `${path}.fields`, error.message); } }
  const allowed = new Set(entry.allowedCapabilities ?? []);
  for (const id of entry.requiredCapabilities ?? []) if (!allowed.has(id)) issue("CAPABILITY_CONTRACT", `${path}.requiredCapabilities`, `Required capability must also be allowed: ${id}.`);
  for (const id of entry.defaultCapabilities ?? []) if (!allowed.has(id)) issue("CAPABILITY_CONTRACT", `${path}.defaultCapabilities`, `Default capability must also be allowed: ${id}.`);
  for (const error of validateConstraintContract(entry.constraints??[],{path:`${path}.constraints`})) {if(error.code==="CONSTRAINT_UNKNOWN")d.warning(error.code,error.path,error.message);else issue(error.code,error.path,error.message);}
  for (const error of validatePresentationContract(entry.presentation,{path:`${path}.presentation`})) issue(error.code,error.path,error.message);
  try { resolveFieldContract(entry, entry.allowedCapabilities ?? []); } catch (error) { issue("FIELD_DEFINITION", `${path}.fields`, error.message); }
}
function checkDefinition(entry, types, path, d) {
  const issue = d.issue;
  if (!checkIdentity(entry, path, issue)) return;
  exactFields(entry, ["id","key","definitionTypeId","nameKey","descriptionKey","data","categories","capabilities","slots","enabled","order","tags","presentationProfile","relations"], path, issue);
  if (!nonempty(entry.key)) issue("REQUIRED_STRING", `${path}.key`, "key must be a non-empty string.");
  if (!nonempty(entry.definitionTypeId) || !types.has(entry.definitionTypeId)) issue("DEFINITION_TYPE", `${path}.definitionTypeId`, "definitionTypeId must target an existing DefinitionType.");
  if (!nonempty(entry.nameKey)) d.incomplete("REQUIRED_STRING", `${path}.nameKey`, "nameKey must be a non-empty string.");
  if (typeof entry.descriptionKey !== "string") issue("STRING_TYPE", `${path}.descriptionKey`, "descriptionKey must be a string.");
  if (!isRecord(entry.data ?? {})) issue("OBJECT_TYPE", `${path}.data`, "data must be an object.");
  for (const key of ["categories","capabilities","tags"]) if (!Array.isArray(entry[key] ?? [])) issue("ARRAY_TYPE", `${path}.${key}`, `${key} must be an array.`);
  if (typeof entry.enabled !== "boolean") issue("BOOLEAN_TYPE", `${path}.enabled`, "enabled must be boolean.");
  if (!Number.isSafeInteger(entry.order)) issue("ORDER", `${path}.order`, "order must be a safe integer.");
  for (const error of validatePresentationContract(entry.presentationProfile,{path:`${path}.presentationProfile`})) issue(error.code,error.path,error.message);
  collecting(d, "SLOT_CONTRACT", `${path}.slots`, options => prepareDefinitionSlots(entry.slots, Array.isArray(entry.capabilities) ? entry.capabilities : [], options));
  const type = types.get(entry.definitionTypeId);
  if (type) {
    const capabilities = new Set(entry.capabilities ?? []), allowed = new Set(type.allowedCapabilities ?? []);
    for (const id of capabilities) if (!allowed.has(id)) issue("CAPABILITY_CONTRACT", `${path}.capabilities`, `Capability is not allowed by DefinitionType: ${id}.`);
    for (const id of type.requiredCapabilities ?? []) if (!capabilities.has(id)) d.incomplete("CAPABILITY_CONTRACT", `${path}.capabilities`, `Required capability is missing: ${id}.`);
    // A value a draft has not filled in yet is incomplete; a value that breaks a rule is invalid.
    for (const error of evaluateConstraints((type.constraints??[]).filter(rule=>CONSTRAINT_KINDS.includes(rule?.kind)),{...entry.data,relations:entry.relations??[]},{path:`${path}.data`})) {
      if (error.kind === "required") d.incomplete(error.code,error.path,error.message); else issue(error.code,error.path,error.message);
    }
    collecting(d, "FIELD_VALUE", `${path}.data`, options => applyFieldContract(entry.data ?? {}, resolveFieldContract(type, entry.capabilities ?? []), options));
  }
}
/** A Reference into a slotted capability (pool, collection) must name an existing slot (CP-24). */
function checkSlotTarget(dep, definitionsById, d) {
  const target = dep.targetRef;
  if (target.objectKind !== "definition" || !SLOT_CAPABILITIES.includes(target.capabilityId)) return;
  const definition = definitionsById.get(target.objectId);
  if (!(definition?.capabilities ?? []).includes(target.capabilityId)) { d.error("REFERENCE_CAPABILITY", dep.path, `Definition ${target.objectId} does not have capability ${target.capabilityId}.`); return; }
  if (!nonempty(target.slotId)) { d.incomplete("REFERENCE_SLOT", dep.path, `Reference to ${target.objectId}/${target.capabilityId} requires a slot.`); return; }
  if (!findSlot(definition, target.capabilityId, target.slotId)) d.error("REFERENCE_SLOT", dep.path, `Slot does not exist: ${target.objectId}/${target.capabilityId}/${target.slotId}.`);
}
function checkReference(entry, known, path, d) {
  const issue = d.issue;
  if (!checkIdentity(entry, path, issue)) return;
  exactFields(entry, ["id","objectKind","objectId","capabilityId","slotId","outputId","relations"], path, issue);
  if (!nonempty(entry.objectKind) || !nonempty(entry.objectId)) issue("REFERENCE", path, "Reference requires objectKind and objectId.");
  const ids = known.get(entry.objectKind);
  if (ids && !ids.has(entry.objectId)) issue("REFERENCE_TARGET", `${path}.objectId`, `Reference target does not exist: ${entry.objectKind}/${entry.objectId}.`);
}

/**
 * Validate a Ruleset in one CP-10 scope. Structural problems block every scope;
 * completeness problems (missing names, references, required values) are
 * warnings in a draft ("edit"/"save") and errors for "publish"/"activate".
 */
export function validateRuleset(ruleset, {scope = "save"} = {}) {
  const d = new DiagnosticCollector(ruleset, scope), issue = d.issue;
  if (!isRecord(ruleset)) { issue("RULESET_TYPE", "", "Ruleset must be a plain object."); return d.result(); }
  exactFields(ruleset, RULESET_FIELDS, "ruleset", issue);
  for (const key of ["id","version"]) if (!nonempty(ruleset[key])) issue("REQUIRED_STRING", key, `${key} must be a non-empty string.`);
  if (!nonempty(ruleset.nameKey)) d.incomplete("REQUIRED_STRING", "nameKey", "nameKey must be a non-empty string.");
  if (typeof ruleset.descriptionKey !== "string") issue("STRING_TYPE", "descriptionKey", "descriptionKey must be a string.");
  if (ruleset.engineContractVersion !== ENGINE_CONTRACT_VERSION) issue("ENGINE_CONTRACT", "engineContractVersion", `Expected engine contract ${ENGINE_CONTRACT_VERSION}.`);
  const colorFamilies = new Set(COLLECTION_FIELDS);
  if (!(ruleset.color === undefined || ruleset.color === null || isHexColor(ruleset.color))) issue('RULESET_COLOR','color','Ruleset color must be a hex RGB color or null.');
  const sectionIds=new Set(RULESET_SECTIONS.map(section=>section.id));
  for(const [key,field] of [['sectionColors','SECTION_COLOR'],['sectionColorOverrides','SECTION_OVERRIDE']]) {
    const values=ruleset[key]??{};
    if(!isRecord(values)) { issue('OBJECT_TYPE',key,`${key} must be an object.`); continue; }
    for(const [section,value] of Object.entries(values)){
      if(!sectionIds.has(section)) issue(field,`${key}.${section}`,`Unknown Ruleset section: ${section}.`);
      if(key==='sectionColors' && !(value===null || isHexColor(value))) issue(field,`${key}.${section}`,'Color must be null or a #RRGGBB hex value.');
      if(key==='sectionColorOverrides' && typeof value!=='boolean') issue(field,`${key}.${section}`,'Override permission must be boolean.');
    }
  }
  if (!isRecord(ruleset.familyColors ?? {})) issue("OBJECT_TYPE", "familyColors", "familyColors must be an object.");
  else for (const [family,color] of Object.entries(ruleset.familyColors ?? {})) {
    if (!colorFamilies.has(family)) issue("FAMILY_COLOR", `familyColors.${family}`, `Unsupported top-level family: ${family}.`);
    if (!(color === null || nonempty(color))) issue("FAMILY_COLOR", `familyColors.${family}`, "Family color must be null or a non-empty string.");
  }
  if (!Number.isSafeInteger(ruleset.revision) || ruleset.revision < 0) issue("REVISION", "revision", "revision must be a non-negative safe integer.");
  if (!["draft","ready","validated"].includes(ruleset.status)) issue("STATUS", "status", "Unsupported Ruleset status.");
  const idsByKind = new Map();
  for (const key of COLLECTION_FIELDS) {
    if (!Array.isArray(ruleset[key])) { issue("COLLECTION_TYPE", key, `${key} must be an array.`); continue; }
    idsByKind.set(key.replace(/s$/, ""), checkUnique(ruleset[key], key, issue));
  }
  const types = new Map((ruleset.definitionTypes ?? []).filter(isRecord).map(x => [x.id, x]));
  (ruleset.definitionTypes ?? []).forEach((x,i) => checkDefinitionType(x, `definitionTypes[${i}]`, d));
  (ruleset.definitions ?? []).forEach((x,i) => checkDefinition(x, types, `definitions[${i}]`, d));
  for (const [collection, prepare] of Object.entries(PREPARERS)) {
    (ruleset[collection] ?? []).forEach((entry,index)=>collecting(d, "RULE_CONTRACT", `${collection}[${index}]`, options => prepare(entry, options)));
  }
  // One relation contract for every Ruleset object, including families that
  // have no dedicated editor or Runtime executor.
  for(const collection of COLLECTION_FIELDS){
    for(const [index,entry] of (ruleset[collection]??[]).entries()){
      try{normalizeRelations(entry?.relations??[],{ruleset});}
      catch(error){issue('RELATIONS',`${collection}[${index}].relations`,error.message);}
    }
  }
  const contentTypesById=new Map((ruleset.contentTypes??[]).filter(isRecord).map(entry=>[entry.id,entry]));
  (ruleset.contentTemplates??[]).forEach((entry,index)=>{
    const type=contentTypesById.get(entry?.contentTypeId);
    if(!type)return;
    collecting(d,"CONTENT_FIELD_CONTRACT",`contentTemplates[${index}].data`,options=>applyFieldContract(entry.data??{},type.fields??{},options));
  });
  const known = new Map([
    ["definitionType", new Set(types.keys())], ["definition", new Set((ruleset.definitions ?? []).map(x => x?.id))],
    ["parameter", new Set((ruleset.parameters ?? []).map(x => x?.id))], ["formula", new Set((ruleset.formulas ?? []).map(x => x?.id))], ["formulaBinding", new Set((ruleset.formulaBindings ?? []).map(x => x?.id))],
    ["condition", new Set((ruleset.conditions ?? []).map(x => x?.id))], ["roll", new Set((ruleset.rolls ?? []).map(x => x?.id))], ["outcome", new Set((ruleset.outcomes ?? []).map(x => x?.id))], ["test", new Set((ruleset.tests ?? []).map(x => x?.id))], ["effect", new Set((ruleset.effects ?? []).map(x => x?.id))],
    ["action", new Set((ruleset.actions ?? []).map(x => x?.id))], ["permissionPolicy", new Set((ruleset.permissionPolicies ?? []).map(x => x?.id))], ["contentType", new Set((ruleset.contentTypes ?? []).map(x => x?.id))], ["tag", new Set((ruleset.tags ?? []).map(x => x?.id))], ["category", new Set((ruleset.categories ?? []).map(x => x?.id))], ["eventType", new Set((ruleset.eventTypes ?? []).map(x => x?.id))], ["trigger", new Set((ruleset.triggers ?? []).map(x => x?.id))], ["contentTemplate", new Set((ruleset.contentTemplates ?? []).map(x => x?.id))], ["modifier", new Set((ruleset.modifiers ?? []).map(x => x?.id))], ["restriction", new Set((ruleset.restrictions ?? []).map(x => x?.id))], ["duration", new Set((ruleset.durations ?? []).map(x => x?.id))], ["creationSystem", new Set((ruleset.creationSystems ?? []).map(x => x?.id))], ["progressionSystem", new Set((ruleset.progressionSystems ?? []).map(x => x?.id))], ["sheetDefinition", new Set((ruleset.sheetDefinitions ?? []).map(x => x?.id))]
  ]);
  (ruleset.references ?? []).forEach((x,i) => checkReference(x, known, `references[${i}]`, d));
  const definitionsById = new Map((ruleset.definitions ?? []).filter(isRecord).map(entry => [entry.id, entry]));
  for (const dep of new DependencyIndex(ruleset).list()) {
    const ids=known.get(dep.targetRef.objectKind);
    if(ids && !ids.has(dep.targetRef.objectId)) { issue("DEPENDENCY_TARGET", dep.path, `Dependency target does not exist: ${dep.targetRef.objectKind}/${dep.targetRef.objectId}.`); continue; }
    checkSlotTarget(dep, definitionsById, d);
  }
  return d.result();
}

/** Throws INVALID_RULESET, carrying the validation result, when a blocking diagnostic exists. */
export function assertValidRuleset(ruleset, {scope = "save"} = {}) {
  const validation = validateRuleset(ruleset, {scope});
  if (validation.valid) return validation;
  const error = new Error(`Invalid Ruleset (${scope}): ${validation.errors.map(x => `${x.path}: ${x.message}`).join("; ")}`);
  error.code = "INVALID_RULESET";
  error.validation = validation;
  throw error;
}
