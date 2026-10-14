import {DefinitionTypeRegistry, RulesetCollectionRegistry, prepareScaleRef} from "./definition-type-registry.mjs";
import {DependencyIndex} from "./dependency-index.mjs";
import {throwIntegrityError} from "./configurator-registry.mjs";
import {copyJSON} from "./configurator-schema.mjs";
import {resolveFieldContract} from "./capability-type-registry.mjs";
import {applyFieldContract} from "./field-output-contracts.mjs";
import {assertValidRuleset} from "./configurator-validation.mjs";
import {PREPARERS} from "./rule-contracts.mjs";
import {prepareDefinitionSlots, prepareValueBounds} from "./capability-slots.mjs";
import {planRecipe, RECIPES} from "./recipes.mjs";
import {analyzeChangeImpact, rulesetWithout, collectionOfKind} from "./change-impact.mjs";

/** Draft writes accept incomplete entries; validation reports what publish still needs. */
const DRAFT = Object.freeze({get incomplete() { return []; }});

class DefinitionRegistry extends RulesetCollectionRegistry {
  constructor(registry) { super(registry, "definitions", {descriptionKey:"", data:{}, categories:[], enabled:true, order:0, tags:[]}, ["id","key","definitionTypeId"]); }
  prepareEntry(data, ruleset) {
    const next = copyJSON(data);
    const type = ruleset.definitionTypes.find(entry => entry.id === next.definitionTypeId);
    if (!type) return next; // authoritative validation will return the structured error
    if (!Object.hasOwn(next,"capabilities")) next.capabilities = copyJSON(type.defaultCapabilities ?? []);
    if (!Array.isArray(next.capabilities)) throw new TypeError("Definition capabilities must be an array.");
    const capabilities = new Set(next.capabilities);
    if (capabilities.size !== next.capabilities.length) throw new Error("Definition capabilities contain duplicate ids.");
    const allowed = new Set(type.allowedCapabilities ?? []);
    for (const id of capabilities) if (!allowed.has(id)) throw new Error(`Capability is not allowed by DefinitionType: ${id}.`);
    // A missing required capability or value is a completeness diagnostic, reported by validation.
    const fields = resolveFieldContract(type, next.capabilities);
    next.data = applyFieldContract(next.data ?? {}, fields, DRAFT);
    if (Object.hasOwn(next, "slots")) next.slots = prepareDefinitionSlots(next.slots, next.capabilities, DRAFT);
    prepareScaleRef(next, "Definition");
    prepareValueBounds(next, "Definition", DRAFT);
    return next;
  }
}

export function createGraphAPI(registry) {
  const types = new DefinitionTypeRegistry(registry);
  const definitions = new DefinitionRegistry(registry);
  class ContentTypeRegistry extends RulesetCollectionRegistry {
    constructor(){super(registry,"contentTypes",{});}
    prepareEntry(data){return PREPARERS.contentTypes(data,DRAFT);}
  }
  class ContentTemplateRegistry extends RulesetCollectionRegistry {
    constructor(){super(registry,"contentTemplates",{});}
    prepareEntry(data,ruleset){
      const next=PREPARERS.contentTemplates(data,DRAFT);
      const type=(ruleset.contentTypes??[]).find(entry=>entry.id===next.contentTypeId);
      if(type) next.data=applyFieldContract(next.data??{},type.fields??{},DRAFT);
      return next;
    }
  }
  const contentTypes=new ContentTypeRegistry();
  const contentTemplates=new ContentTemplateRegistry();
  const collections = Object.fromEntries(["parameters","formulas","formulaBindings","conditions","rolls","outcomes","tests","effects","actions","permissionPolicies","eventTypes","triggers","modifiers","durations","dice","tables","scales","creationSystems","progressionSystems","sheetDefinitions","sheetTemplates","categories","tags"]
    .map(name => [name, new RulesetCollectionRegistry(registry, name, {})]));
  collections.contentTypes=contentTypes; collections.contentTemplates=contentTemplates;
  for (const [name, collection] of Object.entries(collections)) {
    const prepare = PREPARERS[name];
    if (prepare) collection.prepareEntry = data => prepare(data, DRAFT);
  }
  const consumers = (rulesetId, id, kind) => new DependencyIndex(definitions.ruleset(rulesetId)).getConsumers(id, kind);
  /** CP-31: required (and metadata) consumers block the deletion. Optional
   * consumers allow it only with {clearOptionalReferences:true}: the caller
   * confirms that those references are cleared in the same write. */
  const protectedDelete = (collection, kind) => (rulesetId, id, {clearOptionalReferences = false} = {}) => {
    if (!collection.get(rulesetId,id)) throw new Error(`${kind} not found: ${id}.`);
    const used = consumers(rulesetId,id,kind);
    if (used.some(edge => edge.strength !== "optional")) throwIntegrityError(kind,id,used);
    if (!used.length) return collection.delete(rulesetId,id);
    if (!clearOptionalReferences) {
      const error = new Error(`Deleting ${kind} ${id} clears ${used.length} optional reference(s): ${used.map(edge => edge.path).join(", ")}. Pass {clearOptionalReferences:true} to confirm.`);
      error.code = "OPTIONAL_REFERENCES";
      error.consumers = copyJSON(used);
      throw error;
    }
    const candidate = rulesetWithout(collection.ruleset(rulesetId), kind, id, {clearOptionalReferences:true});
    assertValidRuleset(candidate);
    const changed = new Set([collection.collectionName, ...used.map(edge => collectionOfKind(edge.consumerRef.objectKind))]);
    registry.update(rulesetId, Object.fromEntries([...changed].map(name => [name, candidate[name]])));
    return true;
  };
  /** One atomic write: the listed entries take orders 10, 20, 30... in that sequence. */
  const reorderEntries = (rulesetId, kind, ids) => {
    const collection = collectionOfKind(kind);
    if (!collection) throw new Error(`${kind} entries cannot be reordered.`);
    if (!Array.isArray(ids) || new Set(ids).size !== ids.length) throw new Error("reorderEntries requires distinct ids.");
    const ruleset = definitions.ruleset(rulesetId), entries = ruleset[collection] ?? [];
    for (const id of ids) if (!entries.some(entry => entry.id === id)) throw new Error(`${kind} not found: ${id}.`);
    const next = entries.map(entry => { const index = ids.indexOf(entry.id); return index < 0 ? entry : {...entry, order: (index + 1) * 10}; });
    assertValidRuleset({...ruleset, [collection]: next});
    registry.update(rulesetId, {[collection]: next});
    return copyJSON(ids);
  };
  /** ChangeImpactReport for {delete:{kind,id}, clearOptionalReferences?}, {update:{kind,id,patch}} or {ruleset}. */
  const analyzeImpact = (rulesetId, change = {}) => {
    const current = definitions.ruleset(rulesetId);
    let candidate;
    if (change.delete) candidate = rulesetWithout(current, change.delete.kind, change.delete.id, {clearOptionalReferences: change.clearOptionalReferences === true});
    else if (change.update) {
      const collection = collectionOfKind(change.update.kind);
      if (!collection || !(current[collection] ?? []).some(entry => entry.id === change.update.id)) throw new Error(`${change.update.kind} not found: ${change.update.id}.`);
      candidate = copyJSON(current);
      candidate[collection] = candidate[collection].map(entry => entry.id === change.update.id ? {...entry, ...copyJSON(change.update.patch ?? {}), id: entry.id} : entry);
    } else if (change.ruleset) candidate = copyJSON(change.ruleset);
    else throw new Error("analyzeChangeImpact requires delete, update or ruleset.");
    return analyzeChangeImpact(current, candidate);
  };
  /** CP-31: removing a field never deletes stored values silently. When entries
   * still hold a value for a removed field, the caller must pass
   * {pruneRemovedFields:true}, i.e. an explicit, confirmed data removal. */
  const assertExplicitFieldPrune = (removedFieldIds, entries, {pruneRemovedFields = false} = {}, kind) => {
    if (!removedFieldIds.length || pruneRemovedFields) return;
    const affected = entries.filter(entry => removedFieldIds.some(fieldId => Object.hasOwn(entry.data ?? {}, fieldId)));
    if (!affected.length) return;
    const error = new Error(`Removing field(s) ${removedFieldIds.join(", ")} would delete data from ${affected.length} ${kind}(s): ${affected.map(entry => entry.id).join(", ")}. Pass {pruneRemovedFields:true} to confirm.`);
    error.code = "FIELD_REMOVAL_DATA_LOSS";
    error.affected = affected.map(entry => entry.id);
    throw error;
  };
  const updateDefinitionType = (v, id, patch, options = {}) => {
    const current = types.get(v, id);
    if (!current) throw new Error(`definitionTypes entry not found: ${id}.`);
    const input = copyJSON(patch);
    for (const key of ["id", "key"]) {
      if (Object.hasOwn(input, key) && input[key] !== current[key]) throw new Error(`${key} is immutable.`);
    }
    const ruleset = types.ruleset(v);
    const next = types.prepareEntry({...current, ...input}, ruleset);
    const removedFieldIds = Object.keys(current.fields ?? {}).filter(fieldId => !Object.hasOwn(next.fields ?? {}, fieldId));
    assertExplicitFieldPrune(removedFieldIds, (ruleset.definitions ?? []).filter(definition => definition.definitionTypeId === id), options, "Definition");
    const definitions = removedFieldIds.length ? (ruleset.definitions ?? []).map(definition => {
      if (definition.definitionTypeId !== id) return definition;
      const data = copyJSON(definition.data ?? {});
      for (const fieldId of removedFieldIds) delete data[fieldId];
      return {...definition, data};
    }) : (ruleset.definitions ?? []);
    const definitionTypes = (ruleset.definitionTypes ?? []).map(entry => entry.id === id ? next : entry);
    const candidate = {...ruleset, definitionTypes, definitions};
    // Confirmed field removal prunes the removed values from every Definition of
    // this type in the same aggregate update. Nothing else cascades.
    // All other contract changes remain subject to normal strict validation.
    assertValidRuleset(candidate);
    registry.update(v, {definitionTypes, definitions});
    return copyJSON(next);
  };
  const updateContentType = (v,id,patch,options={}) => {
    const current=contentTypes.get(v,id);
    if(!current)throw new Error(`contentTypes entry not found: ${id}.`);
    const ruleset=contentTypes.ruleset(v),next=contentTypes.prepareEntry({...current,...copyJSON(patch)},ruleset);
    const removedFieldIds=Object.keys(current.fields??{}).filter(fieldId=>!Object.hasOwn(next.fields??{},fieldId));
    assertExplicitFieldPrune(removedFieldIds,(ruleset.contentTemplates??[]).filter(template=>template.contentTypeId===id),options,"Content Template");
    const templates=(ruleset.contentTemplates??[]).map(template=>{
      if(template.contentTypeId!==id)return template;
      const data=copyJSON(template.data??{});for(const fieldId of removedFieldIds)delete data[fieldId];
      return contentTemplates.prepareEntry({...template,data},{...ruleset,contentTypes:(ruleset.contentTypes??[]).map(entry=>entry.id===id?next:entry)});
    });
    const typesNext=(ruleset.contentTypes??[]).map(entry=>entry.id===id?next:entry);
    const candidate={...ruleset,contentTypes:typesNext,contentTemplates:templates};
    assertValidRuleset(candidate);registry.update(v,{contentTypes:typesNext,contentTemplates:templates});return copyJSON(next);
  };
  const api = {
    registerDefinitionType:(v,d)=>types.create(v,d), getDefinitionType:(v,id)=>types.get(v,id), listDefinitionTypes:v=>types.list(v), updateDefinitionType, deleteDefinitionType:(v,id)=>types.delete(v,id),
    createDefinition:(v,d)=>definitions.create(v,d), getDefinition:(v,id)=>definitions.get(v,id), listDefinitions:v=>definitions.list(v), updateDefinition:(v,id,p)=>definitions.update(v,id,p), deleteDefinition:protectedDelete(definitions,"definition"),
    getConsumers: consumers,
    listDependencies: v => new DependencyIndex(definitions.ruleset(v)).list(),
    analyzeChangeImpact: analyzeImpact,
    reorderEntries,
    listRecipes: () => RECIPES.map(recipe => ({id: recipe.id, steps: [...recipe.steps]})),
    /** Add a recipe's objects to a draft in one validated write; names maps text keys to localized names. */
    applyRecipe: (rulesetId, recipeId, names = {}) => {
      const {patch, created} = planRecipe(definitions.ruleset(rulesetId), recipeId, key => names[key] ?? key);
      registry.update(rulesetId, patch);
      return created;
    },
    getDeletionStatus:(v,id,kind="definition")=>{ const used=consumers(v,id,kind), blocking=used.filter(edge=>edge.strength!=="optional"), optional=used.filter(edge=>edge.strength==="optional"); return {canDelete:blocking.length===0,kind,id,code:blocking.length?"REFERENTIAL_INTEGRITY":optional.length?"OPTIONAL_REFERENCES":null,consumers:copyJSON(used),optionalReferences:copyJSON(optional)}; }
  };
  const singular = {parameters:"Parameter",formulas:"Formula",formulaBindings:"FormulaBinding",conditions:"Condition",rolls:"Roll",outcomes:"Outcome",tests:"Test",effects:"Effect",actions:"Action",permissionPolicies:"PermissionPolicy",eventTypes:"EventType",triggers:"Trigger",contentTypes:"ContentType",contentTemplates:"ContentTemplate",modifiers:"Modifier",durations:"Duration",dice:"Die",tables:"Table",scales:"Scale",creationSystems:"CreationSystem",progressionSystems:"ProgressionSystem",sheetDefinitions:"SheetDefinition",sheetTemplates:"SheetTemplate",categories:"Category",tags:"Tag"};
  for (const [name, collection] of Object.entries(collections)) {
    const label=singular[name];
    api[`create${label}`]=(v,d)=>collection.create(v,d); api[`get${label}`]=(v,id)=>collection.get(v,id); api[`list${label}s`]=v=>collection.list(v); if(label.endsWith("y"))api[`list${label.slice(0,-1)}ies`]=api[`list${label}s`]; if(label==="Die")api.listDice=api.listDies; api[`update${label}`]=(v,id,p)=>collection.update(v,id,p); api[`delete${label}`]=protectedDelete(collection,label.charAt(0).toLowerCase()+label.slice(1));
  }
  api.updateContentType=updateContentType;
  return api;
}
