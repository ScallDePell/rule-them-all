import {copyJSON} from "./configurator-schema.mjs";

const nonempty = value => typeof value === "string" && value.trim().length > 0;

/**
 * Engine-level registry of value types. This registry is not Ruleset content:
 * the MJ may use registered types, but cannot inject executable validators.
 */
export class ValueTypeRegistry {
  #types = new Map();

  register({id, validate, assignableFrom = []}) {
    if (!nonempty(id)) throw new TypeError("ValueType id must be a non-empty string.");
    if (typeof validate !== "function") throw new TypeError(`ValueType ${id} requires a validate function.`);
    if (!Array.isArray(assignableFrom) || assignableFrom.some(value => !nonempty(value))) throw new TypeError(`ValueType ${id} assignableFrom must be an array of ids.`);
    if (this.#types.has(id)) throw new Error(`ValueType already registered: ${id}.`);
    this.#types.set(id, {id, validate, assignableFrom: new Set([id, ...assignableFrom])});
    return this;
  }

  has(id) { return this.#types.has(id); }
  get(id) {
    const type = this.#types.get(id);
    return type ? Object.freeze({id: type.id, assignableFrom: Object.freeze([...type.assignableFrom])}) : null;
  }
  list() { return [...this.#types.values()].map(type => this.get(type.id)); }
  validate(id, value) {
    const type = this.#types.get(id);
    if (!type) return false;
    return type.validate(value) === true;
  }
  isAssignable(sourceType, targetType) {
    const target = this.#types.get(targetType);
    return Boolean(target?.assignableFrom.has(sourceType));
  }
}

export const valueTypeRegistry = new ValueTypeRegistry()
  .register({id: "integer", validate: value => Number.isSafeInteger(value)})
  .register({id: "number", validate: value => typeof value === "number" && Number.isFinite(value), assignableFrom: ["integer"]})
  .register({id: "boolean", validate: value => typeof value === "boolean"})
  .register({id: "string", validate: value => typeof value === "string"})
  .register({id: "reference", validate: value => value !== null && typeof value === "object" && typeof value.objectKind === "string" && typeof value.objectId === "string"})
  .register({id: "duration", validate: value => value !== null && typeof value === "object"})
  .register({id: "dateTime", validate: value => typeof value === "string"});

export const VALUE_CARDINALITIES = Object.freeze(["one", "many"]);

export function validateTypedValue(valueType, cardinality, nullable, value) {
  if (!valueTypeRegistry.has(valueType)) return {valid:false, code:"VALUE_TYPE", message:`Unknown valueType: ${valueType}.`};
  if (!VALUE_CARDINALITIES.includes(cardinality)) return {valid:false, code:"CARDINALITY", message:`Unsupported cardinality: ${cardinality}.`};
  if (value === null) return nullable ? {valid:true} : {valid:false, code:"NULLABLE", message:"Value may not be null."};
  const values = cardinality === "many" ? value : [value];
  if (cardinality === "many" && !Array.isArray(value)) return {valid:false, code:"CARDINALITY", message:"Cardinality many requires an array."};
  for (const entry of values) if (!valueTypeRegistry.validate(valueType, entry)) return {valid:false, code:"VALUE_TYPE", message:`Value does not satisfy ${valueType}.`};
  return {valid:true};
}

export function describeValueTypes() { return copyJSON(valueTypeRegistry.list()); }
