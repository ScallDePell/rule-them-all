import {copyJSON, isRecord} from "./configurator-schema.mjs";
import {prepareFieldMap, prepareOutputMap} from "./field-output-contracts.mjs";

const CATEGORIES = Object.freeze(["structural","association","compatibility","semantic"]);
const nonempty = value => typeof value === "string" && value.trim().length > 0;

/** Engine/plugin registry. Rulesets reference these contracts; they do not own executable CapabilityTypes. */
export class CapabilityTypeRegistry {
  #types = new Map();

  register(data) {
    if (!isRecord(data)) throw new TypeError("CapabilityType must be a plain object.");
    const input = copyJSON(data);
    const allowed = ["id","category","fields","outputs","presentationHints"];
    for (const key of Object.keys(input)) if (!allowed.includes(key)) throw new Error(`CapabilityType contains unsupported field: ${key}.`);
    if (!nonempty(input.id)) throw new Error("CapabilityType id must be a non-empty string.");
    if (!CATEGORIES.includes(input.category)) throw new Error(`CapabilityType ${input.id} has unsupported category.`);
    if (this.#types.has(input.id)) throw new Error(`CapabilityType already registered: ${input.id}.`);
    const entry = {
      id: input.id,
      category: input.category,
      fields: prepareFieldMap(input.fields ?? {}),
      outputs: prepareOutputMap(input.outputs ?? {}),
      presentationHints: input.presentationHints === undefined ? null : copyJSON(input.presentationHints)
    };
    if (entry.presentationHints !== null && !isRecord(entry.presentationHints)) throw new Error(`CapabilityType ${input.id} presentationHints must be an object or null.`);
    this.#types.set(entry.id, entry);
    return this;
  }

  has(id) { return this.#types.has(id); }
  get(id) { const entry=this.#types.get(id); return entry ? copyJSON(entry) : null; }
  list() { return [...this.#types.values()].map(entry => copyJSON(entry)); }
}

export const capabilityTypeRegistry = new CapabilityTypeRegistry()
  .register({id:"value", category:"structural", fields:{}, outputs:{
    "value.base":{id:"value.base",valueType:"number",cardinality:"one",nullable:false,source:"value.base",readable:true,mutable:true,derived:false},
    "value.final":{id:"value.final",valueType:"number",cardinality:"one",nullable:false,source:"value.final",readable:true,mutable:false,derived:true}
  },presentationHints:{renderer:"value"}})
  .register({id:"pool", category:"structural", fields:{}, outputs:{
    "pool.current":{id:"pool.current",valueType:"number",cardinality:"one",nullable:false,source:"pool.current",readable:true,mutable:true,derived:false},
    "pool.minimum":{id:"pool.minimum",valueType:"number",cardinality:"one",nullable:false,source:"pool.minimum",readable:true,mutable:false,derived:true},
    "pool.maximum":{id:"pool.maximum",valueType:"number",cardinality:"one",nullable:false,source:"pool.maximum",readable:true,mutable:false,derived:true}
  },presentationHints:{renderer:"pool"}})
  .register({id:"collection", category:"structural", fields:{}, outputs:{
    "collection.count":{id:"collection.count",valueType:"integer",cardinality:"one",nullable:false,source:"collection.count",readable:true,mutable:false,derived:true}
  },presentationHints:{renderer:"collection"}})
  .register({id:"state", category:"structural", fields:{}, outputs:{
    "state.active":{id:"state.active",valueType:"boolean",cardinality:"one",nullable:false,source:"state.active",readable:true,mutable:true,derived:false}
  },presentationHints:{renderer:"state"}})
  .register({id:"tests", category:"association", fields:{}, outputs:{}})
  .register({id:"actions", category:"association", fields:{}, outputs:{}})
  .register({id:"progression", category:"association", fields:{}, outputs:{}})
  .register({id:"formulaSource", category:"compatibility", fields:{}, outputs:{}})
  .register({id:"conditionSource", category:"compatibility", fields:{}, outputs:{}})
  .register({id:"effectTarget", category:"compatibility", fields:{}, outputs:{}});

export function resolveFieldContract(definitionType, capabilityIds = []) {
  const merged = {};
  const add = (fields, owner) => {
    for (const [id, field] of Object.entries(fields)) {
      if (Object.hasOwn(merged,id)) throw new Error(`FieldDefinition collision for ${id} between ${merged[id].__owner} and ${owner}.`);
      merged[id] = {...copyJSON(field), __owner: owner};
    }
  };
  add(definitionType.fields ?? {}, `DefinitionType ${definitionType.id}`);
  for (const capabilityId of capabilityIds) {
    const capability = capabilityTypeRegistry.get(capabilityId);
    if (!capability) throw new Error(`Unknown CapabilityType: ${capabilityId}.`);
    add(capability.fields, `CapabilityType ${capabilityId}`);
  }
  return Object.fromEntries(Object.entries(merged).map(([id, field]) => { const {__owner,...clean}=field; return [id,clean]; }));
}

export const CAPABILITY_CATEGORIES = CATEGORIES;
