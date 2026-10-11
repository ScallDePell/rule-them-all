import {DefinitionTypeRegistry, RulesetCollectionRegistry} from "./definition-type-registry.mjs";
import {DependencyIndex} from "./dependency-index.mjs";
import {throwIntegrityError} from "./configurator-registry.mjs";
import {copyJSON} from "./configurator-schema.mjs";
import {resolveFieldContract} from "./capability-type-registry.mjs";
import {applyFieldContract} from "./field-output-contracts.mjs";
import {assertValidRuleset} from "./configurator-validation.mjs";
import {PREPARERS} from "./rule-contracts.mjs";

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
    for (const id of type.requiredCapabilities ?? []) if (!capabilities.has(id)) throw new Error(`Required capability is missing: ${id}.`);
    const fields = resolveFieldContract(type, next.capabilities);
    next.data = applyFieldContract(next.data ?? {}, fields);
    return next;
  }
}

export function createGraphAPI(registry) {
  const types = new DefinitionTypeRegistry(registry);
  const definitions = new DefinitionRegistry(registry);
  class ContentTypeRegistry extends RulesetCollectionRegistry {
    constructor(){super(registry,"contentTypes",{});}
    prepareEntry(data){return PREPARERS.contentTypes(data);}
  }
  class ContentTemplateRegistry extends RulesetCollectionRegistry {
    constructor(){super(registry,"contentTemplates",{});}
    prepareEntry(data,ruleset){
      const next=PREPARERS.contentTemplates(data);
      const type=(ruleset.contentTypes??[]).find(entry=>entry.id===next.contentTypeId);
      if(type) next.data=applyFieldContract(next.data??{},type.fields??{});
      return next;
    }
  }
  const contentTypes=new ContentTypeRegistry();
  const contentTemplates=new ContentTemplateRegistry();
  const collections = Object.fromEntries(["parameters","formulas","formulaBindings","conditions","rolls","outcomes","tests","effects","actions","permissionPolicies","eventTypes","triggers","modifiers","restrictions","durations","creationSystems","progressionSystems","sheetDefinitions","tags","references"]
    .map(name => [name, new RulesetCollectionRegistry(registry, name, {})]));
  collections.contentTypes=contentTypes; collections.contentTemplates=contentTemplates;
  for (const [name, collection] of Object.entries(collections)) {
    const prepare = PREPARERS[name];
    if (prepare) collection.prepareEntry = data => prepare(data);
  }
  const consumers = (rulesetId, id, kind) => new DependencyIndex(definitions.ruleset(rulesetId)).getConsumers(id, kind);
  const protectedDelete = (collection, kind) => (rulesetId, id) => {
    if (!collection.get(rulesetId,id)) throw new Error(`${kind} not found: ${id}.`);
    const used = consumers(rulesetId,id,kind);
    if (used.length) throwIntegrityError(kind,id,used);
    return collection.delete(rulesetId,id);
  };
  const updateDefinitionType = (v, id, patch) => {
    const current = types.get(v, id);
    if (!current) throw new Error(`definitionTypes entry not found: ${id}.`);
    const input = copyJSON(patch);
    for (const key of ["id", "key"]) {
      if (Object.hasOwn(input, key) && input[key] !== current[key]) throw new Error(`${key} is immutable.`);
    }
    const ruleset = types.ruleset(v);
    const next = types.prepareEntry({...current, ...input}, ruleset);
    const removedFieldIds = Object.keys(current.fields ?? {}).filter(fieldId => !Object.hasOwn(next.fields ?? {}, fieldId));
    const definitions = removedFieldIds.length ? (ruleset.definitions ?? []).map(definition => {
      if (definition.definitionTypeId !== id) return definition;
      const data = copyJSON(definition.data ?? {});
      for (const fieldId of removedFieldIds) delete data[fieldId];
      return {...definition, data};
    }) : (ruleset.definitions ?? []);
    const definitionTypes = (ruleset.definitionTypes ?? []).map(entry => entry.id === id ? next : entry);
    const candidate = {...ruleset, definitionTypes, definitions};
    // Structural field removal is explicit: the removed field values are pruned from
    // every Definition of this type in the same aggregate update. Nothing else cascades.
    // All other contract changes remain subject to normal strict validation.
    assertValidRuleset(candidate);
    registry.update(v, {definitionTypes, definitions});
    return copyJSON(next);
  };
  const updateContentType = (v,id,patch) => {
    const current=contentTypes.get(v,id);
    if(!current)throw new Error(`contentTypes entry not found: ${id}.`);
    const ruleset=contentTypes.ruleset(v),next=contentTypes.prepareEntry({...current,...copyJSON(patch)},ruleset);
    const removedFieldIds=Object.keys(current.fields??{}).filter(fieldId=>!Object.hasOwn(next.fields??{},fieldId));
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
    getDeletionStatus:(v,id,kind="definition")=>{ const used=consumers(v,id,kind); return {canDelete:used.length===0,kind,id,code:used.length?"REFERENTIAL_INTEGRITY":null,consumers:copyJSON(used)}; }
  };
  const singular = {parameters:"Parameter",formulas:"Formula",formulaBindings:"FormulaBinding",conditions:"Condition",rolls:"Roll",outcomes:"Outcome",tests:"Test",effects:"Effect",actions:"Action",permissionPolicies:"PermissionPolicy",eventTypes:"EventType",triggers:"Trigger",contentTypes:"ContentType",contentTemplates:"ContentTemplate",modifiers:"Modifier",restrictions:"Restriction",durations:"Duration",creationSystems:"CreationSystem",progressionSystems:"ProgressionSystem",sheetDefinitions:"SheetDefinition",tags:"Tag",references:"Reference"};
  for (const [name, collection] of Object.entries(collections)) {
    const label=singular[name];
    api[`create${label}`]=(v,d)=>collection.create(v,d); api[`get${label}`]=(v,id)=>collection.get(v,id); api[`list${label}s`]=v=>collection.list(v); if(label.endsWith("y"))api[`list${label.slice(0,-1)}ies`]=api[`list${label}s`]; api[`update${label}`]=(v,id,p)=>collection.update(v,id,p); api[`delete${label}`]=protectedDelete(collection,label.charAt(0).toLowerCase()+label.slice(1));
  }
  api.updateContentType=updateContentType;
  return api;
}
