import {copyJSON, isRecord} from "./configurator-schema.mjs";
import {VALUE_CARDINALITIES, validateTypedValue, valueTypeRegistry} from "./value-type-registry.mjs";
import {need} from "./diagnostics.mjs";

const nonempty = value => typeof value === "string" && value.trim().length > 0;
const FIELD_KEYS = Object.freeze(["id","name","valueType","cardinality","required","nullable","defaultValue","constraints","editable","referenceTarget","presentation","description"]);
const OUTPUT_KEYS = Object.freeze(["id","valueType","cardinality","nullable","source","readable","mutable","derived","description"]);

function exactFields(value, allowed, label) {
  for (const key of Object.keys(value)) if (!allowed.includes(key)) throw new Error(`${label} contains unsupported field: ${key}.`);
}
function assertCardinality(value, label) { if (!VALUE_CARDINALITIES.includes(value)) throw new Error(`${label} cardinality must be one or many.`); }
function assertValueType(value, label) { if (!valueTypeRegistry.has(value)) throw new Error(`${label} uses unknown valueType: ${value}.`); }

const NUMERIC_CONSTRAINTS = new Set(["min", "max", "step"]);

function normalizeConstraints(field) {
  const constraints = copyJSON(field.constraints ?? []);
  const seen = new Set();
  for (const [index, constraint] of constraints.entries()) {
    if (!isRecord(constraint) || !nonempty(constraint.kind)) throw new Error(`FieldDefinition ${field.id} constraint ${index} is invalid.`);
    if (NUMERIC_CONSTRAINTS.has(constraint.kind)) {
      if (!["integer", "number"].includes(field.valueType)) throw new Error(`FieldDefinition ${field.id} ${constraint.kind} is only valid for numeric value types.`);
      if (typeof constraint.value !== "number" || !Number.isFinite(constraint.value)) throw new Error(`FieldDefinition ${field.id} ${constraint.kind} must be a finite number.`);
      if (constraint.kind === "step" && constraint.value <= 0) throw new Error(`FieldDefinition ${field.id} step must be greater than zero.`);
      if (seen.has(constraint.kind)) throw new Error(`FieldDefinition ${field.id} contains duplicate ${constraint.kind} constraints.`);
      seen.add(constraint.kind);
    }
  }
  const min = constraints.find(c => c.kind === "min")?.value;
  const max = constraints.find(c => c.kind === "max")?.value;
  if (min !== undefined && max !== undefined && min > max) throw new Error(`FieldDefinition ${field.id} minimum may not exceed maximum.`);
  return constraints;
}

function validateConstraints(field, value) {
  if (value === null) return {valid:true};
  const values = field.cardinality === "many" ? value : [value];
  const min = field.constraints.find(c => c.kind === "min")?.value;
  const max = field.constraints.find(c => c.kind === "max")?.value;
  if (min === undefined && max === undefined) return {valid:true};
  for (const entry of values) {
    if (min !== undefined && entry < min) return {valid:false, message:`Value must be greater than or equal to ${min}.`};
    if (max !== undefined && entry > max) return {valid:false, message:`Value must be less than or equal to ${max}.`};
  }
  return {valid:true};
}

export function prepareFieldDefinition(data, expectedId = null) {
  if (!isRecord(data)) throw new TypeError("FieldDefinition must be a plain object.");
  const field = {cardinality:"one", required:false, nullable:false, constraints:[], editable:true, ...copyJSON(data)};
  exactFields(field, FIELD_KEYS, "FieldDefinition");
  if (!nonempty(field.id)) throw new Error("FieldDefinition id must be a non-empty string.");
  if (Object.hasOwn(field,"name") && !nonempty(field.name)) throw new Error(`FieldDefinition ${field.id} name must be a non-empty string.`);
  if (expectedId !== null && field.id !== expectedId) throw new Error(`FieldDefinition id must match its key: ${expectedId}.`);
  assertValueType(field.valueType, `FieldDefinition ${field.id}`);
  assertCardinality(field.cardinality, `FieldDefinition ${field.id}`);
  if (typeof field.required !== "boolean" || typeof field.nullable !== "boolean" || typeof field.editable !== "boolean") throw new Error(`FieldDefinition ${field.id} boolean contract is invalid.`);
  if (!Array.isArray(field.constraints)) throw new Error(`FieldDefinition ${field.id} constraints must be an array.`);
  field.constraints = normalizeConstraints(field);
  if (Object.hasOwn(field,"referenceTarget") && field.referenceTarget !== null && !isRecord(field.referenceTarget)) throw new Error(`FieldDefinition ${field.id} referenceTarget must be an object or null.`);
  if (Object.hasOwn(field,"presentation") && field.presentation !== null && !isRecord(field.presentation)) throw new Error(`FieldDefinition ${field.id} presentation must be an object or null.`);
  if (Object.hasOwn(field,"description") && typeof field.description !== "string") throw new Error(`FieldDefinition ${field.id} description must be a string.`);
  if (Object.hasOwn(field,"defaultValue")) {
    const result = validateTypedValue(field.valueType, field.cardinality, field.nullable, field.defaultValue);
    if (!result.valid) throw new Error(`FieldDefinition ${field.id} defaultValue invalid: ${result.message}`);
    const constrained = validateConstraints(field, field.defaultValue);
    if (!constrained.valid) throw new Error(`FieldDefinition ${field.id} defaultValue invalid: ${constrained.message}`);
  }
  return field;
}

export function prepareOutputDefinition(data, expectedId = null) {
  if (!isRecord(data)) throw new TypeError("OutputDefinition must be a plain object.");
  const output = {cardinality:"one", nullable:false, readable:true, mutable:false, derived:false, ...copyJSON(data)};
  exactFields(output, OUTPUT_KEYS, "OutputDefinition");
  if (!nonempty(output.id)) throw new Error("OutputDefinition id must be a non-empty string.");
  if (expectedId !== null && output.id !== expectedId) throw new Error(`OutputDefinition id must match its key: ${expectedId}.`);
  assertValueType(output.valueType, `OutputDefinition ${output.id}`);
  assertCardinality(output.cardinality, `OutputDefinition ${output.id}`);
  if (!nonempty(output.source)) throw new Error(`OutputDefinition ${output.id} source must be a non-empty logical source id.`);
  if (typeof output.nullable !== "boolean" || typeof output.readable !== "boolean" || typeof output.mutable !== "boolean" || typeof output.derived !== "boolean") throw new Error(`OutputDefinition ${output.id} boolean contract is invalid.`);
  if (Object.hasOwn(output,"description") && typeof output.description !== "string") throw new Error(`OutputDefinition ${output.id} description must be a string.`);
  return output;
}

export function prepareFieldMap(fields = {}) {
  if (!isRecord(fields)) throw new TypeError("fields must be an object keyed by FieldDefinition id.");
  return Object.fromEntries(Object.entries(copyJSON(fields)).map(([id, field]) => [id, prepareFieldDefinition(field, id)]));
}

export function prepareOutputMap(outputs = {}) {
  if (!isRecord(outputs)) throw new TypeError("outputs must be an object keyed by OutputDefinition id.");
  return Object.fromEntries(Object.entries(copyJSON(outputs)).map(([id, output]) => [id, prepareOutputDefinition(output, id)]));
}

/** Apply a field contract; a missing required value is a completeness issue (see need()). */
export function applyFieldContract(data, fieldMap, options = {}) {
  if (!isRecord(data)) throw new TypeError("Definition data must be an object.");
  const result = copyJSON(data);
  for (const key of Object.keys(result)) if (!Object.hasOwn(fieldMap, key)) throw new Error(`Definition data contains undeclared field: ${key}.`);
  for (const [id, field] of Object.entries(fieldMap)) {
    if (!Object.hasOwn(result,id) && Object.hasOwn(field,"defaultValue")) result[id] = copyJSON(field.defaultValue);
    if (!Object.hasOwn(result,id)) {
      if (field.required) need(false, `Required field is missing: ${id}.`, options);
      continue;
    }
    const check = validateTypedValue(field.valueType, field.cardinality, field.nullable, result[id]);
    if (!check.valid) throw new Error(`Invalid field ${id}: ${check.message}`);
    const constrained = validateConstraints(field, result[id]);
    if (!constrained.valid) throw new Error(`Invalid field ${id}: ${constrained.message}`);
  }
  return result;
}
