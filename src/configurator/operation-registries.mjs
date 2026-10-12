/* Engine registries for executable operations (CP-04, CP-05). A Formula is an
   AST made only of registered FormulaNodeTypes; an Effect applies a registered
   EffectOperation. The GM composes them in the Configurator but cannot invent
   one; other modules register theirs on the ruleThemAllRegisterTypes hook. */
import {copyJSON, isRecord} from "./configurator-schema.mjs";
import {valueTypeRegistry} from "./value-type-registry.mjs";
import {DICE_COMPARATORS, DICE_READS, readDice} from "./dice-reading.mjs";

const nonempty = value => typeof value === "string" && value.trim().length > 0;
const args = node => Array.isArray(node.args) ? node.args : [];
const num = (value, label) => { const n = Number(value); if (!Number.isFinite(n)) throw new Error(`${label} must resolve to a finite number.`); return n; };
const UNKNOWN = "unknown";

/** FormulaNodeType: {id, evaluate(node, kit), resultType?(node, infer), validate?(node, label)}.
 * kit = {ev(child), context, parameter(id), formula(id), reference(ref)}; infer(child) gives a child's type. */
export class FormulaNodeRegistry {
  #types = new Map();
  register({id, evaluate, resultType = () => UNKNOWN, validate = () => {}}) {
    if (!nonempty(id)) throw new TypeError("FormulaNodeType id must be a non-empty string.");
    if (typeof evaluate !== "function") throw new TypeError(`FormulaNodeType ${id} requires an evaluate function.`);
    if (this.#types.has(id)) throw new Error(`FormulaNodeType already registered: ${id}.`);
    const infer = typeof resultType === "function" ? resultType : () => resultType;
    this.#types.set(id, Object.freeze({id, evaluate, resultType: infer, validate}));
    return this;
  }
  has(id) { return this.#types.has(id); }
  get(id) { return this.#types.get(id) ?? null; }
  list() { return [...this.#types.keys()]; }
}

/** EffectOperation: {id, labelKey?, targetTypes[], operand: boolean, apply(current, operand)}.
 * targetTypes lists the output value types it may write ("*" for any). */
export class EffectOperationRegistry {
  #operations = new Map();
  register({id, labelKey = `RTA.EffectOperation.${id}`, targetTypes = ["*"], operand = true, apply}) {
    if (!nonempty(id)) throw new TypeError("EffectOperation id must be a non-empty string.");
    if (typeof apply !== "function") throw new TypeError(`EffectOperation ${id} requires an apply function.`);
    if (!Array.isArray(targetTypes) || !targetTypes.length) throw new TypeError(`EffectOperation ${id} requires targetTypes.`);
    if (this.#operations.has(id)) throw new Error(`EffectOperation already registered: ${id}.`);
    this.#operations.set(id, Object.freeze({id, labelKey, targetTypes: Object.freeze([...targetTypes]), operand: operand !== false, apply}));
    return this;
  }
  has(id) { return this.#operations.has(id); }
  get(id) { return this.#operations.get(id) ?? null; }
  list() { return [...this.#operations.keys()]; }
  /** Whether this operation may write an output of the given value type. */
  accepts(id, valueType) {
    const operation = this.get(id);
    return Boolean(operation) && (operation.targetTypes.includes("*") || operation.targetTypes.some(type => valueTypeRegistry.isAssignable(valueType, type) || type === valueType));
  }
}

const numeric = types => types.every(type => type === "integer") ? "integer" : "number";
const allInteger = (node, infer) => args(node).length && args(node).every(child => infer(child) === "integer") ? "integer" : "number";
const same = (a, b) => a === b || a === UNKNOWN || b === UNKNOWN ? (a === UNKNOWN ? b : a) : (["integer", "number"].includes(a) && ["integer", "number"].includes(b) ? "number" : UNKNOWN);

/** reference: {reference: logical Reference, container?: role}. A Ruleset names containers by role only (CP-24). */
function validateReferenceNode(node, label) {
  if (!isRecord(node.reference)) throw new Error(`${label}.reference must be a logical Reference.`);
  if (node.container !== undefined && node.container !== null && !(typeof node.container === "string" && /^[A-Za-z][A-Za-z0-9_-]*$/.test(node.container))) throw new Error(`${label}.container must be a context role.`);
}
function validateLookup(node, label) {
  const scalar = value => value === null || ["string", "number", "boolean"].includes(typeof value);
  if (!isRecord(node.key)) throw new Error(`${label}.key must be an AST node.`);
  if (!Array.isArray(node.table) || !node.table.length) throw new Error(`${label}.table must be a non-empty array.`);
  const keys = new Set();
  node.table.forEach((row, i) => {
    if (!isRecord(row) || !scalar(row.key) || !scalar(row.value)) throw new Error(`${label}.table[${i}] must be {key, value} with scalar values.`);
    const key = JSON.stringify(row.key); if (keys.has(key)) throw new Error(`${label}.table has a duplicate key: ${key}.`); keys.add(key);
  });
}
function validateRangeLookup(node, label) {
  const scalar = value => value === null || ["string", "number", "boolean"].includes(typeof value);
  const bound = value => value === undefined || value === null || (typeof value === "number" && Number.isFinite(value));
  if (!isRecord(node.value)) throw new Error(`${label}.value must be an AST node.`);
  if (!Array.isArray(node.ranges) || !node.ranges.length) throw new Error(`${label}.ranges must be a non-empty array.`);
  node.ranges.forEach((row, i) => {
    if (!isRecord(row) || !scalar(row.value) || !bound(row.min) || !bound(row.max)) throw new Error(`${label}.ranges[${i}] must be {min?, max?, value} with numeric bounds.`);
    if (typeof row.min === "number" && typeof row.max === "number" && row.min > row.max) throw new Error(`${label}.ranges[${i}] has min greater than max.`);
  });
}
const tableType = values => { const types = new Set(values.map(value => value === null ? UNKNOWN : typeof value === "boolean" ? "boolean" : typeof value === "string" ? "string" : Number.isSafeInteger(value) ? "integer" : "number")); return types.size === 1 ? [...types][0] : types.has("string") || types.has("boolean") ? UNKNOWN : "number"; };
const literalType = value => typeof value === "boolean" ? "boolean" : typeof value === "string" ? "string" : Number.isSafeInteger(value) ? "integer" : typeof value === "number" ? "number" : UNKNOWN;
const compare = op => ({evaluate: async (node, {ev}) => op(await ev(node.left), await ev(node.right)), resultType: "boolean"});

/** contentAggregate: {operation: sum|max|min|count, contentTypeId, field?, whereField?, container?} over a role's owned Contents. */
export const CONTENT_AGGREGATES = Object.freeze(["sum", "max", "min", "count"]);
function validateContentAggregate(node, label) {
  if (!CONTENT_AGGREGATES.includes(node.operation)) throw new Error(`${label}.operation must be ${CONTENT_AGGREGATES.join(", ")}.`);
  if (!nonempty(node.contentTypeId)) throw new Error(`${label}.contentTypeId is required.`);
  if (node.operation !== "count" && !nonempty(node.field)) throw new Error(`${label}.field is required.`);
  for (const key of ["whereField", "container"]) if (node[key] !== undefined && node[key] !== null && !nonempty(node[key])) throw new Error(`${label}.${key} must be an id.`);
}
async function aggregateContents(node, kit) {
  const rows = (await kit.contents(node.container ?? null)).filter(row => row.contentTypeId === node.contentTypeId && (!node.whereField || Boolean(row.fields?.[node.whereField])));
  if (node.operation === "count") return rows.length;
  const values = rows.map(row => num(row.fields?.[node.field] ?? 0, `${node.contentTypeId}.${node.field}`));
  if (!values.length) return 0;
  return node.operation === "sum" ? values.reduce((a, b) => a + b, 0) : node.operation === "max" ? Math.max(...values) : Math.min(...values);
}
/** contentField: {field, default?} of the Content the Action is used from (a weapon's damage). */
async function contentField(node, kit) {
  const content = await kit.content();
  const value = content?.fields?.[node.field];
  if (value !== undefined && value !== null) return copyJSON(value);
  if (node.default !== undefined) return kit.ev(node.default);
  throw new Error(content ? `Content ${content.templateId} has no field ${node.field}.` : `No Content in context for field ${node.field}.`);
}

/** A Definition named by a value: an id, or a reference {objectKind: "definition", objectId} (a Test input, a reference field). */
const definitionIdOf = value => typeof value === "string" ? value : isRecord(value) && value.objectKind === "definition" ? value.objectId : null;
/** definitionValue: {definition: AST, capabilityId, outputId, slotId?, container?}: the output of a Definition chosen at run time (the skill a Test was asked for). */
async function definitionValue(node, kit) {
  const id = definitionIdOf(await kit.ev(node.definition));
  if (!id) throw new Error("definitionValue needs a Definition id or reference.");
  return kit.reference({objectKind: "definition", objectId: id, capabilityId: node.capabilityId, outputId: node.outputId, ...(node.slotId ? {slotId: node.slotId} : {})}, node.container ?? null);
}
/** definitionField: {definition: AST, field}: a data field of a Definition chosen at run time (a skill's associated attribute). */
async function definitionField(node, kit) {
  const id = definitionIdOf(await kit.ev(node.definition)), definition = id ? kit.definition(id) : null;
  if (!definition) throw new Error(`definitionField: Definition not found: ${id}.`);
  const value = definition.data?.[node.field];
  if (value === undefined) throw new Error(`Definition ${id} has no field ${node.field}.`);
  return copyJSON(value);
}
/** dice: {read, group?, compare?, value?: AST, counter?}: the dice of the roll in context (a Test's roll, under variables.roll),
 * e.g. how many 10s among the hunger dice: {read: "count", group: "hunger", compare: "eq", value: {type: "literal", value: 10}}. */
function validateDiceNode(node, label) {
  if (!DICE_READS.includes(node.read)) throw new Error(`${label}.read must be ${DICE_READS.join(", ")}.`);
  if (node.group !== undefined && node.group !== null && !(typeof node.group === "string" && /^[A-Za-z][A-Za-z0-9_-]*$/.test(node.group))) throw new Error(`${label}.group must be a dice group name.`);
  if (node.read === "counter" && !(typeof node.counter === "string" && /^[a-z][a-z0-9_-]*$/.test(node.counter))) throw new Error(`${label}.counter must name a Die counter.`);
  if (node.compare !== undefined && node.compare !== null) {
    if (!DICE_COMPARATORS.includes(node.compare)) throw new Error(`${label}.compare must be ${DICE_COMPARATORS.join(", ")}.`);
    if (!isRecord(node.value)) throw new Error(`${label}.value must be an AST node.`);
  }
}
async function diceNode(node, kit) {
  const roll = kit.context?.variables?.roll;
  if (!roll) throw new Error("No roll in context to read dice from.");
  return readDice(roll.dice ?? [], {read: node.read, group: node.group ?? null, counter: node.counter ?? null, compare: node.compare ?? null, value: node.compare ? num(await kit.ev(node.value), "dice value") : null});
}
/** distance: {from, to} roles, in the scene's distance units. nearby: {of, within: AST, side: ally|enemy|any}: how many
 * other Actors stand within that distance of the role (allies share its disposition), e.g. flanking or a crowd. */
export const NEARBY_SIDES = Object.freeze(["ally", "enemy", "any"]);
const roleName = value => typeof value === "string" && /^[A-Za-z][A-Za-z0-9_-]*$/.test(value);
function validateDistance(node, label) { for (const key of ["from", "to"]) if (!roleName(node[key])) throw new Error(`${label}.${key} must be a role.`); }
function validateNearby(node, label) {
  if (!roleName(node.of)) throw new Error(`${label}.of must be a role.`);
  if (!isRecord(node.within)) throw new Error(`${label}.within must be an AST node.`);
  if (!NEARBY_SIDES.includes(node.side ?? "any")) throw new Error(`${label}.side must be ${NEARBY_SIDES.join(", ")}.`);
}
const needsDefinitionNode = keys => (node, label) => { if (!isRecord(node.definition)) throw new Error(`${label}.definition must be an AST node.`); for (const key of keys) if (!nonempty(node[key])) throw new Error(`${label}.${key} is required.`); };

export const formulaNodeRegistry = new FormulaNodeRegistry()
  .register({id: "literal", evaluate: node => copyJSON(node.value), resultType: node => literalType(node.value)})
  .register({id: "parameter", evaluate: (node, kit) => kit.parameter(node.id), resultType: (node, infer, leaf) => leaf("parameter", node.id)})
  .register({id: "formula", evaluate: (node, kit) => kit.formula(node.id), resultType: (node, infer, leaf) => leaf("formula", node.id)})
  .register({id: "reference", evaluate: (node, kit) => kit.reference(node.reference, node.container ?? null), resultType: (node, infer, leaf) => leaf("reference", node.reference), validate: validateReferenceNode})
  .register({id: "definitionValue", evaluate: definitionValue, resultType: node => node.outputId === "state.active" ? "boolean" : "number", validate: needsDefinitionNode(["capabilityId", "outputId"])})
  .register({id: "definitionField", evaluate: definitionField, validate: needsDefinitionNode(["field"])})
  .register({id: "distance", evaluate: (node, kit) => kit.distance(node.from, node.to), resultType: "number", validate: validateDistance})
  .register({id: "nearby", evaluate: async (node, kit) => kit.nearby(node.of, num(await kit.ev(node.within), "nearby distance"), node.side ?? "any"), resultType: "integer", validate: validateNearby})
  .register({id: "dice", evaluate: diceNode, resultType: "integer", validate: validateDiceNode})
  .register({id: "contentAggregate", evaluate: aggregateContents, resultType: node => node.operation === "count" ? "integer" : "number", validate: validateContentAggregate})
  .register({id: "contentField", evaluate: contentField, validate: (node, label) => { if (!nonempty(node.field)) throw new Error(`${label}.field is required.`); }})
  .register({id: "context", evaluate: (node, kit) => { let value = kit.context; for (const part of String(node.path ?? "").split(".").filter(Boolean)) value = value?.[part]; return value === undefined ? undefined : copyJSON(value); }})
  .register({id: "add", evaluate: async (node, {ev}) => { let out = 0; for (const n of args(node)) out += num(await ev(n), "add operand"); return out; }, resultType: allInteger})
  .register({id: "subtract", evaluate: async (node, {ev}) => { const a = args(node); if (!a.length) return 0; let out = num(await ev(a[0]), "subtract operand"); for (const n of a.slice(1)) out -= num(await ev(n), "subtract operand"); return out; }, resultType: allInteger})
  .register({id: "multiply", evaluate: async (node, {ev}) => { let out = 1; for (const n of args(node)) out *= num(await ev(n), "multiply operand"); return out; }, resultType: allInteger})
  .register({id: "divide", evaluate: async (node, {ev}) => { const a = args(node); if (!a.length) return 0; let out = num(await ev(a[0]), "divide operand"); for (const n of a.slice(1)) { const d = num(await ev(n), "divide operand"); if (d === 0) throw new Error("Division by zero."); out /= d; } return out; }, resultType: "number"})
  .register({id: "min", evaluate: async (node, {ev}) => { const values = []; for (const n of args(node)) values.push(num(await ev(n), "min operand")); return Math.min(...values); }, resultType: allInteger})
  .register({id: "max", evaluate: async (node, {ev}) => { const values = []; for (const n of args(node)) values.push(num(await ev(n), "max operand")); return Math.max(...values); }, resultType: allInteger})
  .register({id: "sum", evaluate: async (node, {ev}) => { let out = 0; for (const n of args(node)) out += num(await ev(n), "sum operand"); return out; }, resultType: allInteger})
  .register({id: "average", evaluate: async (node, {ev}) => { const a = args(node); if (!a.length) return 0; let out = 0; for (const n of a) out += num(await ev(n), "average operand"); return out / a.length; }, resultType: "number"})
  .register({id: "round", evaluate: async (node, {ev}) => Math.round(num(await ev(node.value ?? node.arg), "round operand")), resultType: "integer"})
  // mod: remainder, always from 0 to the divisor (every third round: mod(round, 3) = 0).
  .register({id: "mod", evaluate: async (node, {ev}) => { const a = args(node); if (a.length !== 2) throw new Error("mod needs two operands."); const x = num(await ev(a[0]), "mod operand"), d = num(await ev(a[1]), "mod operand"); if (d === 0) throw new Error("Division by zero."); return ((x % d) + d) % d; }, resultType: "number"})
  .register({id: "floor", evaluate: async (node, {ev}) => Math.floor(num(await ev(node.value ?? node.arg), "floor operand")), resultType: "integer"})
  .register({id: "ceil", evaluate: async (node, {ev}) => Math.ceil(num(await ev(node.value ?? node.arg), "ceil operand")), resultType: "integer"})
  .register({id: "clamp", evaluate: async (node, {ev}) => Math.min(num(await ev(node.max), "clamp max"), Math.max(num(await ev(node.min), "clamp min"), num(await ev(node.value), "clamp value"))), resultType: (node, infer) => numeric([infer(node.value), infer(node.min), infer(node.max)])})
  .register({id: "eq", ...compare((a, b) => a === b)})
  .register({id: "neq", ...compare((a, b) => a !== b)})
  .register({id: "gt", ...compare((a, b) => a > b)})
  .register({id: "gte", ...compare((a, b) => a >= b)})
  .register({id: "lt", ...compare((a, b) => a < b)})
  .register({id: "lte", ...compare((a, b) => a <= b)})
  .register({id: "and", evaluate: async (node, {ev}) => { for (const n of args(node)) if (!Boolean(await ev(n))) return false; return true; }, resultType: "boolean"})
  .register({id: "or", evaluate: async (node, {ev}) => { for (const n of args(node)) if (Boolean(await ev(n))) return true; return false; }, resultType: "boolean"})
  .register({id: "not", evaluate: async (node, {ev}) => !Boolean(await ev(node.value ?? node.arg)), resultType: "boolean"})
  .register({id: "if", evaluate: async (node, {ev}) => Boolean(await ev(node.condition)) ? ev(node.then) : ev(node.else), resultType: (node, infer) => same(infer(node.then), infer(node.else))})
  .register({id: "lookup", validate: validateLookup, resultType: node => tableType((node.table ?? []).map(row => row.value)),
    evaluate: async (node, {ev}) => { const key = await ev(node.key); const row = node.table.find(r => r.key === key); if (row) return copyJSON(row.value); if (node.default !== undefined) return ev(node.default); throw new Error(`Lookup has no entry for key: ${JSON.stringify(key)}.`); }})
  .register({id: "rangeLookup", validate: validateRangeLookup, resultType: node => tableType((node.ranges ?? []).map(row => row.value)),
    evaluate: async (node, {ev}) => { const value = num(await ev(node.value), "rangeLookup value"); const row = node.ranges.find(r => (r.min == null || value >= r.min) && (r.max == null || value <= r.max)); if (row) return copyJSON(row.value); if (node.default !== undefined) return ev(node.default); throw new Error(`Range lookup has no range for value: ${value}.`); }});

export const effectOperationRegistry = new EffectOperationRegistry()
  .register({id: "set", targetTypes: ["*"], apply: (_current, operand) => operand})
  .register({id: "add", targetTypes: ["number"], apply: (current, operand) => Number(current) + Number(operand)})
  .register({id: "subtract", targetTypes: ["number"], apply: (current, operand) => Number(current) - Number(operand)})
  .register({id: "multiply", targetTypes: ["number"], apply: (current, operand) => Number(current) * Number(operand)})
  .register({id: "toggle", targetTypes: ["boolean"], operand: false, apply: current => !Boolean(current)});

/** Structural check of a Formula AST against the registry. */
export function validateFormulaAst(node, label = "expression") {
  if (!isRecord(node) || !nonempty(node.type)) throw new Error(`${label} must be an AST node with a type.`);
  const type = formulaNodeRegistry.get(node.type);
  if (!type) throw new Error(`${label} contains unsupported node type: ${node.type}.`);
  type.validate(node, label);
  for (const [key, value] of Object.entries(node)) {
    if (key === "type") continue;
    if (isRecord(value) && nonempty(value.type)) validateFormulaAst(value, `${label}.${key}`);
    if (Array.isArray(value)) value.forEach((child, i) => { if (isRecord(child) && nonempty(child.type)) validateFormulaAst(child, `${label}.${key}[${i}]`); });
  }
}

/** Inferred value type of an AST, or "unknown". leaf(kind, idOrReference) types parameters, formulas and references. */
export function inferFormulaType(node, leaf = () => UNKNOWN, seen = new Set()) {
  if (!isRecord(node)) return UNKNOWN;
  const type = formulaNodeRegistry.get(node.type);
  if (!type) return UNKNOWN;
  try { return type.resultType(node, child => inferFormulaType(child, leaf, seen), leaf) ?? UNKNOWN; }
  catch { return UNKNOWN; }
}
export const UNKNOWN_TYPE = UNKNOWN;

/** The registries handed to other modules on the ruleThemAllRegisterTypes hook. */
export const engineRegistries = () => ({valueTypes: valueTypeRegistry, formulaNodes: formulaNodeRegistry, effectOperations: effectOperationRegistry});
