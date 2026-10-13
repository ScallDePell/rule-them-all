import {CONSTRAINT_KINDS,validateConstraintContract,evaluateConstraints,validatePresentationContract} from "./declarative-contracts.mjs";
import {RULESET_SECTIONS,isHexColor} from "./ruleset-colors.mjs";
import {COLLECTION_FIELDS, ENGINE_CONTRACT_VERSION, RULESET_FIELDS, isRecord} from "./configurator-schema.mjs";
import {capabilityTypeRegistry, resolveFieldContract} from "./capability-type-registry.mjs";
import {prepareFieldMap, applyFieldContract} from "./field-output-contracts.mjs";
import {PREPARERS} from "./rule-contracts.mjs";
import {DependencyIndex} from "./dependency-index.mjs";
import {normalizeRelations} from "./generic-relations.mjs";
import {DiagnosticCollector} from "./diagnostics.mjs";
import {checkRulesetTypes} from "./type-checks.mjs";
import {prepareDefinitionSlots} from "./capability-slots.mjs";
import {checkReferenceLevels, checkUnsetReferences} from "./reference-checks.mjs";

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
  exactFields(entry, ["id","key","nameKey","descriptionKey","color","order","allowedCapabilities","defaultCapabilities","requiredCapabilities","fields","constraints","presentation","relations","scaleRef"], path, issue);
  if (!nonempty(entry.key)) issue("REQUIRED_STRING", `${path}.key`, "key must be a non-empty string.");
  if (!nonempty(entry.nameKey)) d.incomplete("REQUIRED_STRING", `${path}.nameKey`, "nameKey must be a non-empty string.");
  if (typeof entry.descriptionKey !== "string") issue("STRING_TYPE", `${path}.descriptionKey`, "descriptionKey must be a string.");
  if (!(entry.color === null || nonempty(entry.color))) issue("COLOR", `${path}.color`, "color must be null or a non-empty string.");
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
  exactFields(entry, ["id","key","definitionTypeId","nameKey","descriptionKey","data","categories","capabilities","slots","enabled","order","tags","presentationProfile","relations","scaleRef"], path, issue);
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
  // Dice: one Die per letter; a Formula or Condition reading a counter reads one some Die declares.
  const letters = new Map(), counters = new Set();
  for (const [index, die] of (ruleset.dice ?? []).entries()) {
    if (!isRecord(die)) continue;
    for (const counter of die.counters ?? []) counters.add(counter?.id);
    if (!nonempty(die.denomination)) continue;
    if (letters.has(die.denomination)) issue("DUPLICATE_ID", `dice[${index}].denomination`, `Dice ${letters.get(die.denomination)} and ${die.id} both use the letter ${die.denomination}.`);
    else letters.set(die.denomination, die.id);
  }
  const counterReads = (node, path) => {
    if (Array.isArray(node)) return node.forEach((child, i) => counterReads(child, `${path}[${i}]`));
    if (!isRecord(node)) return;
    if (node.type === "dice" && node.read === "counter" && !counters.has(node.counter)) issue("REFERENCE", `${path}.counter`, `No Die counts ${node.counter}.`);
    for (const [key, child] of Object.entries(node)) if (typeof child === "object") counterReads(child, `${path}.${key}`);
  };
  for (const collection of ["formulas", "conditions"]) for (const [index, entry] of (ruleset[collection] ?? []).entries()) if (isRecord(entry)) counterReads(entry.expression, `${collection}[${index}].expression`);
  // initiative: the Test whose total orders the Foundry combat tracker, an optional tie-break Formula, rerolled each round or not.
  const initiative = ruleset.initiative ?? null;
  if (initiative !== null) {
    if (!isRecord(initiative)) issue("OBJECT_TYPE", "initiative", "initiative must be an object or null.");
    else {
      // A Test rolled by each combatant, or a Table drawn without replacement each round (a deck of cards); bySide: one roll per disposition.
      exactFields(initiative, ["testRef", "tableRef", "tieBreakFormulaRef", "eachRound", "bySide", "passes"], "initiative", issue);
      // passes: {step, threshold}: another pass for those whose initiative minus step per pass stays above threshold.
      const passes = initiative.passes ?? null;
      if (passes !== null) {
        if (!isRecord(passes)) issue("OBJECT_TYPE", "initiative.passes", "initiative.passes must be an object or null.");
        else {
          exactFields(passes, ["step", "threshold"], "initiative.passes", issue);
          if (!(typeof passes.step === "number" && passes.step > 0)) issue("NUMBER_TYPE", "initiative.passes.step", "initiative.passes.step must be a number above 0.");
          if (!(passes.threshold === undefined || Number.isFinite(passes.threshold))) issue("NUMBER_TYPE", "initiative.passes.threshold", "initiative.passes.threshold must be a number.");
        }
      }
      const hasTest = nonempty(initiative.testRef), hasTable = nonempty(initiative.tableRef);
      if (hasTest === hasTable) issue("REQUIRED_STRING", "initiative.testRef", "initiative needs a Test or a Table, not both.");
      if (hasTest && !(ruleset.tests ?? []).some(test => test?.id === initiative.testRef)) issue("REFERENCE", "initiative.testRef", `Missing reference: test/${initiative.testRef}.`);
      if (hasTable && !(ruleset.tables ?? []).some(table => table?.id === initiative.tableRef)) issue("REFERENCE", "initiative.tableRef", `Missing reference: table/${initiative.tableRef}.`);
      if (!(initiative.bySide === undefined || typeof initiative.bySide === "boolean")) issue("BOOLEAN_TYPE", "initiative.bySide", "initiative.bySide must be true or false.");
      if (!(initiative.tieBreakFormulaRef === undefined || initiative.tieBreakFormulaRef === null)) {
        if (!(ruleset.formulas ?? []).some(formula => formula?.id === initiative.tieBreakFormulaRef)) issue("REFERENCE", "initiative.tieBreakFormulaRef", `Missing reference: formula/${initiative.tieBreakFormulaRef}.`);
      }
      if (!(initiative.eachRound === undefined || typeof initiative.eachRound === "boolean")) issue("BOOLEAN_TYPE", "initiative.eachRound", "initiative.eachRound must be true or false.");
    }
  }
  // sharedDefinitions: the Definitions the world holds (a GM's reserve, faction clocks) and each combat holds (an escalation die).
  const shared = ruleset.sharedDefinitions ?? {world: [], combat: []};
  if (!isRecord(shared)) issue("OBJECT_TYPE", "sharedDefinitions", "sharedDefinitions must be an object.");
  else {
    exactFields(shared, ["world", "combat"], "sharedDefinitions", issue);
    for (const holder of ["world", "combat"]) {
      const ids = shared[holder] ?? [];
      if (!Array.isArray(ids)) { issue("ARRAY_TYPE", `sharedDefinitions.${holder}`, `sharedDefinitions.${holder} must be an array.`); continue; }
      ids.forEach((id, i) => { if (!(ruleset.definitions ?? []).some(definition => definition?.id === id)) issue("REFERENCE", `sharedDefinitions.${holder}[${i}]`, `Missing reference: definition/${id}.`); });
    }
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
    ["action", new Set((ruleset.actions ?? []).map(x => x?.id))], ["permissionPolicy", new Set((ruleset.permissionPolicies ?? []).map(x => x?.id))], ["contentType", new Set((ruleset.contentTypes ?? []).map(x => x?.id))], ["tag", new Set((ruleset.tags ?? []).map(x => x?.id))], ["category", new Set((ruleset.categories ?? []).map(x => x?.id))], ["eventType", new Set((ruleset.eventTypes ?? []).map(x => x?.id))], ["trigger", new Set((ruleset.triggers ?? []).map(x => x?.id))], ["contentTemplate", new Set((ruleset.contentTemplates ?? []).map(x => x?.id))], ["modifier", new Set((ruleset.modifiers ?? []).map(x => x?.id))], ["duration", new Set((ruleset.durations ?? []).map(x => x?.id))], ["die", new Set((ruleset.dice ?? []).map(x => x?.id))], ["table", new Set((ruleset.tables ?? []).map(x => x?.id))], ["scale", new Set((ruleset.scales ?? []).map(x => x?.id))], ["creationSystem", new Set((ruleset.creationSystems ?? []).map(x => x?.id))], ["progressionSystem", new Set((ruleset.progressionSystems ?? []).map(x => x?.id))], ["sheetDefinition", new Set((ruleset.sheetDefinitions ?? []).map(x => x?.id))]
  ]);
  const definitionsById = new Map((ruleset.definitions ?? []).filter(isRecord).map(entry => [entry.id, entry]));
  // Generic relation scanning re-finds AST references one level deeper (".reference"): report each once.
  const reported = new Set();
  for (const dep of new DependencyIndex(ruleset).list()) {
    const key = `${dep.consumerRef.objectKind}|${dep.consumerRef.objectId}|${JSON.stringify(dep.targetRef)}|${dep.path.replace(/\.reference$/, "")}`;
    if (reported.has(key)) continue;
    reported.add(key);
    const ids=known.get(dep.targetRef.objectKind);
    if(ids && !ids.has(dep.targetRef.objectId)) { issue("DEPENDENCY_TARGET", dep.path, `Dependency target does not exist: ${dep.targetRef.objectKind}/${dep.targetRef.objectId}.`); continue; }
    checkReferenceLevels(dep, definitionsById, d);
  }
  checkUnsetReferences(ruleset, d);
  checkRulesetTypes(ruleset, d);
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
