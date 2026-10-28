/* The assistant's paths (assistant-engine.mjs): each asks a few questions and builds the entries of one rule.
   Concept paths build a whole mechanism (a skill list, an attack, a rest); brick paths build one entry each and serve
   as the sub-paths ("create a new one") of the others. Every name, option and default is a text key:
   RTA.Assistant.Path.<path>.Q.<question>.Label, .Option.<value>, list fields under .Field.<field>, and
   RTA.Assistant.Path.<path>.Text.<key> for the names a path gives its own entries. No game rule is written here. */
import {pathKey} from "./assistant-engine.mjs";
import {readableId} from "./identity.mjs";
import {SYSTEM_CHANGE_TYPES} from "./system-changes-contract.mjs";

export const ASSISTANT_GROUPS = Object.freeze(["core", "systems", "bricks"]);
/** Names every path may give its entries: RTA.Assistant.Text.<key>. */
export const ASSISTANT_SHARED_TEXTS = Object.freeze(["Dice", "Amount", "Bonus", "Roll", "Difficulty", "AskedDifficulty", "TestDifficulty", "DifficultyInput",
  "Result.critical", "Result.fumble", "Result.success", "Result.failure", "CriticalMultiplier", "Half", "InputAmount", "AmountInput",
  ...["untilRemoved", "round", "turn", "minute", "hour", "day", "untilEvent"].map(key => `Duration.${key}`)]);

const lit = value => ({type: "literal", value});
const out = (objectId, capabilityId, outputId, slotId = null) => ({objectKind: "definition", objectId, capabilityId, ...(slotId ? {slotId} : {}), outputId});
const ref = (reference, container = null) => ({type: "reference", reference, ...(container ? {container} : {})});
const ctxNode = path => ({type: "context", path});
const formula = id => ({type: "formula", id});
const proposed = (pathId, key) => ({nameKey: pathKey(pathId, `Text.${key}`)});
const slotOf = (ctx, answer) => answer.slotId ?? ctx.find("definitions", answer.id)?.slots?.pool?.[0]?.id ?? null;
/** The output a path reads or writes on an entry answer: a value's final value (base to write), a pool's current points. */
const valueOut = (ctx, answer, {write = false} = {}) => {
  const definition = ctx.find("definitions", answer.id);
  if ((definition?.capabilities ?? []).includes("pool")) return out(answer.id, "pool", "pool.current", slotOf(ctx, answer));
  if ((definition?.capabilities ?? []).includes("state")) return out(answer.id, "state", "state.active");
  return out(answer.id, "value", write ? "value.base" : "value.final");
};
/** The simplest operand of an expression: a number, a Parameter, a Reference or a Formula as they are, else a new Formula. */
function operandOf(ctx, expression, name) {
  if (expression?.type === "literal" && typeof expression.value === "number") return {kind: "literal", value: expression.value};
  if (expression?.type === "parameter") return {kind: "parameter", id: expression.id};
  if (expression?.type === "reference" && !expression.container) return {kind: "reference", reference: expression.reference};
  return {kind: "formula", id: formulaOf(ctx, expression, name)};
}
/** A bound of a value or a pool: a number as it is, else a Formula. */
const boundOf = (ctx, expression, name) => expression?.type === "literal" && typeof expression.value === "number" ? {literal: expression.value} : {formulaRef: formulaOf(ctx, expression, name)};
/** A roll operand throwing new dice named after the entry they serve. */
function rollOperand(ctx, dice, name, extras = {}) {
  const rollRef = ctx.add("rolls", {id: ctx.newId(ctx.shared("Dice", {name})), nameKey: ctx.shared("Dice", {name}), formula: dice});
  return rollExtras({kind: "roll", rollRef}, extras);
}
const rollExtras = (operand, {minimum, bonusFormulaRef, multiplierFormulaRef, factorFormulaRef} = {}) => ({...operand, ...(bonusFormulaRef ? {bonusFormulaRef} : {}), ...(multiplierFormulaRef ? {multiplierFormulaRef} : {}),
  ...(factorFormulaRef ? {factorFormulaRef} : {}), ...(minimum !== undefined ? {minimum} : {})});
/** A Formula or Condition of this expression: a Formula node is that Formula; one already in the Ruleset (or this plan)
 * with the same expression is used again, not doubled. */
const formulaOf = (ctx, expression, name, resultType = "number") => expression?.type === "formula" && typeof expression.id === "string" ? expression.id
  : ctx.findWhere("formulas", entry => entry.resultType === resultType && ctx.same(entry.expression, expression))?.id
  ?? ctx.add("formulas", {id: ctx.newId(name), nameKey: name, resultType, expression});
const conditionOf = (ctx, expression, name) => ctx.findWhere("conditions", entry => ctx.same(entry.expression, expression))?.id
  ?? ctx.add("conditions", {id: ctx.newId(name), nameKey: name, expression});
const typeQuestion = (pathId, capability, textKey) => ({id: "type", kind: "entry", accept: {collection: "definitionTypes", capability}, create: "definitionType", fixed: ["capability"], default: {create: {name: proposed(pathId, textKey), capability}}});
const nameQuestion = (pathId, textKey) => ({id: "name", kind: "name", ...(textKey ? {default: proposed(pathId, textKey)} : {})});
/** The description of the entry a path creates, shown under its name. */
const descriptionQuestion = {id: "description", kind: "text", required: false};
const described = v => v.description ? {descriptionKey: v.description} : {};
const ROLES = ["target", "self"];
const DURATIONS = ["untilRemoved", "round", "turn", "minute", "hour", "day", "untilEvent"];
const VALUE_TYPES = ["number", "integer", "boolean", "string"];
const FIELD_TYPES = [...VALUE_TYPES, "reference"];
/** A typed value from the text a GM typed: a number, true or false, or the text. */
function typedValue(valueType, text) {
  if (valueType === "boolean") return text === true || text === "true";
  if (["number", "integer"].includes(valueType)) { const n = Number(text); if (!Number.isFinite(n)) throw new Error(`${text} is not a number.`); return n; }
  return String(text);
}
/** An Action input id from its name: letters, digits and _. */
function inputId(name) {
  const id = String(name).normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "").toLowerCase();
  return /^[a-z]/.test(id) ? id : `v_${id || "input"}`;
}
/** A field id from its name: camelCase letters and digits. */
const fieldId = name => inputId(name).replace(/_([a-z0-9])/g, (all, letter) => letter.toUpperCase());

/** The fields of a Definition Type or a Content Type: typed, a reference naming the type it points at. */
const FIELD_QUESTIONS = [
  {id: "name", kind: "name", withId: true}, {id: "valueType", kind: "choice", options: FIELD_TYPES, default: "number"},
  {id: "referenceType", kind: "entry", required: false, accept: {collection: "definitionTypes"}, visible: row => row.valueType === "reference"},
  {id: "many", kind: "boolean", default: false}, {id: "required", kind: "boolean", default: false}, {id: "nullable", kind: "boolean", default: false}
];
function fieldMap(ctx, rows) {
  const fields = {};
  for (const row of rows ?? []) {
    const name = ctx.name(row.name), base = row.name.id ?? fieldId(name);
    let id = base, n = 2;
    while (fields[id]) id = `${base}${n++}`;
    fields[id] = {id, name, valueType: row.valueType, cardinality: row.many ? "many" : "one", required: row.required, nullable: row.nullable, constraints: [],
      ...(row.valueType === "reference" ? {referenceTarget: {objectKind: "definition", ...(row.referenceType ? {definitionTypeId: ctx.entry(row.referenceType).id} : {})}} : {})};
  }
  return fields;
}

/* ---------------------------------------------------------------- bricks */

const definitionType = {
  id: "definitionType", group: "bricks", keywords: ["type"], produces: {collection: "definitionTypes"},
  questions: [
    nameQuestion("definitionType"),
    {id: "capability", kind: "choice", options: ["value", "pool", "state"], default: "value"},
    {id: "minimum", kind: "formula", required: false, visible: v => v.capability === "value"},
    {id: "maximum", kind: "formula", required: false, visible: v => v.capability === "value"},
    {id: "fields", kind: "list", required: false, fields: FIELD_QUESTIONS},
    descriptionQuestion
  ],
  texts: ["Minimum", "Maximum"],
  build(ctx) {
    const v = ctx.values, name = ctx.name(v.name), {capability} = v;
    const bounds = {...(v.minimum ? {minimum: boundOf(ctx, v.minimum, ctx.t("Minimum", {name}))} : {}), ...(v.maximum ? {maximum: boundOf(ctx, v.maximum, ctx.t("Maximum", {name}))} : {})};
    const id = ctx.add("definitionTypes", {id: ctx.id(v.name), nameKey: name, allowedCapabilities: [capability], defaultCapabilities: [capability], requiredCapabilities: [capability],
      fields: fieldMap(ctx, v.fields), ...(Object.keys(bounds).length ? {valueBounds: bounds} : {}), ...described(v)});
    return {collection: "definitionTypes", id};
  }
};

const value = {
  id: "value", group: "bricks", keywords: ["value", "counter"], produces: {collection: "definitions", capability: "value"},
  questions: [
    nameQuestion("value"), typeQuestion("value", "value", "Type"),
    {id: "scale", kind: "entry", required: false, accept: {collection: "scales"}},
    {id: "data", kind: "list", required: false, fields: [
      {id: "field", kind: "text"}, {id: "entry", kind: "entry", required: false, accept: {collection: "definitions"}},
      {id: "value", kind: "text", required: false, visible: row => !row.entry}
    ]},
    descriptionQuestion
  ],
  texts: ["Type"],
  build(ctx) {
    const v = ctx.values, type = ctx.entry(v.type), fields = ctx.find("definitionTypes", type.id)?.fields ?? {}, data = {};
    // A field of the type takes a Definition (a reference) or a typed value.
    for (const row of v.data ?? []) {
      if (row.entry) { data[row.field] = {objectKind: "definition", objectId: ctx.entry(row.entry).id}; continue; }
      if (row.value !== undefined) data[row.field] = typedValue(fields[row.field]?.valueType ?? "string", row.value);
    }
    const id = ctx.add("definitions", {id: ctx.id(v.name), definitionTypeId: type.id, nameKey: ctx.name(v.name), capabilities: ["value"], data,
      ...(v.scale ? {scaleRef: ctx.entry(v.scale).id} : {}), ...described(v)});
    return {collection: "definitions", id};
  }
};

const parameterBrick = {
  id: "parameter", group: "bricks", keywords: ["parameter", "constant", "setting", "difficulty"], produces: {collection: "parameters"},
  questions: [
    nameQuestion("parameter"),
    {id: "valueType", kind: "choice", options: VALUE_TYPES, default: "integer"},
    {id: "number", kind: "number", visible: v => ["number", "integer"].includes(v.valueType)},
    {id: "flag", kind: "boolean", default: false, visible: v => v.valueType === "boolean"},
    {id: "text", kind: "text", visible: v => v.valueType === "string"},
    descriptionQuestion
  ],
  build(ctx) {
    const v = ctx.values, given = v.valueType === "boolean" ? v.flag : v.valueType === "string" ? v.text : v.number;
    return {collection: "parameters", id: ctx.add("parameters", {id: ctx.id(v.name), nameKey: ctx.name(v.name), valueType: v.valueType, value: given, scope: "ruleset", ...described(v)})};
  }
};

const formulaBrick = {
  id: "formula", group: "bricks", keywords: ["formula", "calculation"], produces: {collection: "formulas"},
  questions: [nameQuestion("formula"), {id: "resultType", kind: "choice", options: FIELD_TYPES, default: "number"}, {id: "expression", kind: "formula"}, descriptionQuestion],
  build(ctx) {
    // A Formula named with its own id, or described, is always a new one; otherwise the same calculation is used again.
    const v = ctx.values, name = ctx.name(v.name);
    if (v.name.id || v.description) return {collection: "formulas", id: ctx.add("formulas", {id: ctx.id(v.name), nameKey: name, resultType: v.resultType, expression: v.expression, ...described(v)})};
    return {collection: "formulas", id: formulaOf(ctx, v.expression, name, v.resultType)};
  }
};

const conditionBrick = {
  id: "condition", group: "bricks", keywords: ["condition", "requirement"], produces: {collection: "conditions"},
  questions: [nameQuestion("condition"), {id: "expression", kind: "condition"}, descriptionQuestion],
  build(ctx) {
    const v = ctx.values, name = ctx.name(v.name);
    if (v.name.id || v.description) return {collection: "conditions", id: ctx.add("conditions", {id: ctx.id(v.name), nameKey: name, expression: v.expression, ...described(v)})};
    return {collection: "conditions", id: conditionOf(ctx, v.expression, name)};
  }
};

const rollBrick = {
  id: "roll", group: "bricks", keywords: ["roll", "dice", "variant"], produces: {collection: "rolls"},
  questions: [
    {id: "name", kind: "name", required: false},
    {id: "formula", kind: "dice"},
    {id: "variants", kind: "list", required: false, fields: [
      {id: "condition", kind: "entry", accept: {collection: "conditions"}, create: "condition"}, {id: "formula", kind: "dice"}
    ]},
    descriptionQuestion
  ],
  build(ctx) {
    // Unnamed plain dice: a Roll of the same dice is used again.
    const v = ctx.values, variants = (v.variants ?? []).map(row => ({conditionRef: ctx.entry(row.condition).id, formula: row.formula}));
    if (!v.name && !variants.length && !v.description) {
      const same = ctx.findWhere("rolls", roll => roll.formula === v.formula && !(roll.variants ?? []).length);
      if (same) return {collection: "rolls", id: same.id};
    }
    const name = v.name ? ctx.name(v.name) : v.formula;
    return {collection: "rolls", id: ctx.add("rolls", {id: v.name ? ctx.id(v.name) : ctx.newId(name), nameKey: name, formula: v.formula, variants, ...described(v)})};
  }
};

const outcomeBrick = {
  id: "outcome", group: "bricks", keywords: ["outcome", "result", "success", "critical"], produces: {collection: "outcomes"},
  questions: [
    nameQuestion("outcome"),
    {id: "resultKey", kind: "text"},
    {id: "condition", kind: "entry", required: false, accept: {collection: "conditions"}, create: "condition"},
    descriptionQuestion
  ],
  build(ctx) {
    const v = ctx.values, name = ctx.name(v.name);
    return {collection: "outcomes", id: ctx.add("outcomes", {id: ctx.id(v.name), nameKey: name, labelKey: name, resultKey: v.resultKey, conditionRef: v.condition ? ctx.entry(v.condition).id : null, ...described(v)})};
  }
};

const durationBrick = {
  id: "duration", group: "bricks", keywords: ["duration", "rounds", "until"], produces: {collection: "durations"},
  questions: [
    nameQuestion("duration"),
    {id: "duration", kind: "choice", options: DURATIONS, default: "round"},
    {id: "amount", kind: "integer", min: 1, default: 1, visible: v => !["untilRemoved", "untilEvent"].includes(v.duration)},
    {id: "event", kind: "event", visible: v => v.duration === "untilEvent"},
    descriptionQuestion
  ],
  build(ctx) {
    const v = ctx.values;
    return {collection: "durations", id: ctx.add("durations", {id: ctx.id(v.name), nameKey: ctx.name(v.name), ...durationRule(v), ...described(v)})};
  }
};

const effectBrick = {
  id: "effect", group: "bricks", keywords: ["effect", "damage", "heal"], produces: {collection: "effects"},
  questions: [
    nameQuestion("effect"),
    {id: "writes", kind: "choice", options: ["definition", "contentField"], default: "definition"},
    {id: "target", kind: "entry", accept: {collection: "definitions"}, visible: v => v.writes === "definition"},
    {id: "chosenBy", kind: "formula", required: false, visible: v => v.writes === "definition"},
    {id: "field", kind: "text", visible: v => v.writes === "contentField"},
    {id: "role", kind: "choice", options: ROLES, default: "target"},
    {id: "operation", kind: "choice", options: ["subtract", "add", "set", "multiply"], default: "subtract"},
    {id: "operand", kind: "choice", options: ["number", "formula", "dice", "roll"], default: "number"},
    {id: "amount", kind: "number", default: 1, visible: v => v.operand === "number"},
    {id: "expression", kind: "formula", visible: v => v.operand === "formula"},
    {id: "dice", kind: "dice", visible: v => v.operand === "dice"},
    {id: "roll", kind: "entry", accept: {collection: "rolls"}, create: "roll", visible: v => v.operand === "roll"},
    {id: "bonus", kind: "formula", required: false, visible: v => ["dice", "roll"].includes(v.operand)},
    {id: "multiplier", kind: "formula", required: false, visible: v => ["dice", "roll"].includes(v.operand)},
    {id: "factor", kind: "formula", required: false, visible: v => ["dice", "roll"].includes(v.operand)},
    {id: "minimum", kind: "number", required: false, visible: v => ["dice", "roll"].includes(v.operand)},
    descriptionQuestion
  ],
  texts: ["Bonus", "Multiplier", "Factor", "Target"],
  build(ctx) {
    const v = ctx.values, name = ctx.name(v.name), id = ctx.id(v.name);
    let operandValue = {kind: "literal", value: v.amount};
    if (v.operand === "formula") operandValue = operandOf(ctx, v.expression, ctx.shared("Amount", {name}));
    if (["dice", "roll"].includes(v.operand)) {
      const extras = {minimum: v.minimum, bonusFormulaRef: v.bonus ? formulaOf(ctx, v.bonus, ctx.t("Bonus", {name})) : null,
        multiplierFormulaRef: v.multiplier ? formulaOf(ctx, v.multiplier, ctx.t("Multiplier", {name})) : null, factorFormulaRef: v.factor ? formulaOf(ctx, v.factor, ctx.t("Factor", {name})) : null};
      operandValue = v.operand === "dice" ? rollOperand(ctx, v.dice, name, extras) : rollExtras({kind: "roll", rollRef: ctx.entry(v.roll).id}, extras);
    }
    // A Content field (a weapon's ammunition), or a Definition: the one named, or the one a Formula chooses (the skill tested).
    const target = v.writes === "contentField" ? {targetRef: null, targetContentField: v.field} : {targetRef: valueOut(ctx, ctx.entry(v.target), {write: true}),
      ...(v.chosenBy ? {targetDefinitionFormulaRef: formulaOf(ctx, v.chosenBy, ctx.t("Target", {name}), "reference")} : {})};
    return {collection: "effects", id: ctx.add("effects", {id, nameKey: name, ...target, targetRole: v.role, operation: v.operation, operand: operandValue, ...described(v)})};
  }
};

const actionBrick = {
  id: "action", group: "bricks", keywords: ["action", "button"], produces: {collection: "actions"},
  questions: [
    nameQuestion("action"),
    {id: "inputs", kind: "list", required: false, fields: [
      {id: "name", kind: "name", withId: true}, {id: "valueType", kind: "choice", options: FIELD_TYPES, default: "number"},
      {id: "definitionType", kind: "entry", accept: {collection: "definitionTypes"}, visible: row => row.valueType === "reference"},
      {id: "default", kind: "text", required: false, visible: row => row.valueType !== "reference"},
      {id: "required", kind: "boolean", default: true},
      {id: "options", kind: "list", required: false, visible: row => row.valueType !== "reference", fields: [{id: "label", kind: "text"}, {id: "value", kind: "text"}]}
    ]},
    {id: "conditions", kind: "entries", required: false, accept: {collection: "conditions"}},
    {id: "costs", kind: "entries", required: false, accept: {collection: "effects"}},
    {id: "test", kind: "entry", required: false, accept: {collection: "tests"}},
    {id: "effects", kind: "entries", required: false, accept: {collection: "effects"}},
    {id: "applyStates", kind: "list", required: false, fields: [
      {id: "state", kind: "entry", accept: {collection: "definitions", capability: "state"}},
      {id: "duration", kind: "entry", required: false, accept: {collection: "durations"}, create: "duration"},
      {id: "stacking", kind: "choice", options: ["refresh", "stack", "separate", "ignore"], default: "refresh"}
    ]},
    {id: "removeStates", kind: "entries", required: false, accept: {collection: "definitions", capability: "state"}},
    {id: "role", kind: "choice", options: ROLES, default: "target"},
    {id: "results", kind: "list", required: false, visible: v => Boolean(v.test), fields: [
      {id: "outcome", kind: "entry", required: false, accept: {collection: "outcomes"}},
      {id: "resultKey", kind: "text", visible: row => !row.outcome},
      {id: "replace", kind: "boolean", default: true},
      {id: "effects", kind: "entries", required: false, accept: {collection: "effects"}, visible: row => row.replace},
      {id: "actions", kind: "entries", required: false, accept: {collection: "actions"}}
    ]},
    {id: "targeting", kind: "choice", options: ["one", "each", "shared"], default: "one"},
    descriptionQuestion
  ],
  build(ctx) {
    const v = ctx.values, ids = list => (list ?? []).map(answer => ctx.entry(answer).id);
    const inputs = (v.inputs ?? []).map(row => {
      const label = ctx.name(row.name), typed = text => typedValue(row.valueType, text);
      const input = {id: row.name.id ?? inputId(label), labelKey: label, valueType: row.valueType, required: row.required};
      if (row.valueType === "reference") input.definitionTypeId = ctx.entry(row.definitionType).id;
      if (row.default !== undefined) input.defaultValue = typed(row.default);
      if (row.options?.length) input.options = row.options.map(option => ({value: typed(option.value), labelKey: option.label}));
      return input;
    });
    const action = {id: ctx.id(v.name), nameKey: ctx.name(v.name), inputs, conditionRefs: ids(v.conditions), costEffectRefs: ids(v.costs), effectRefs: ids(v.effects),
      testRef: v.test ? ctx.entry(v.test).id : null, targeting: v.targeting,
      stateApplications: (v.applyStates ?? []).map(row => ({definitionId: ctx.entry(row.state).id, targetRole: v.role, durationRef: row.duration ? ctx.entry(row.duration).id : null, stacking: row.stacking})),
      stateRemovals: ids(v.removeStates).map(definitionId => ({definitionId, targetRole: v.role})), ...described(v)};
    // Per result of the Test (an Outcome, or a result key): the Effects instead of the Action's own (none listed: no Effect),
    // or the Action's own when they are not replaced; then other Actions.
    action.outcomeMappings = (v.results ?? []).map(row => ({...(row.outcome ? {outcomeId: ctx.entry(row.outcome).id} : {resultKey: row.resultKey}),
      ...(row.replace ? {effectRefs: ids(row.effects)} : {}), ...(row.actions?.length ? {actionRefs: ids(row.actions)} : {})}));
    return {collection: "actions", id: ctx.add("actions", action)};
  }
};

const triggerBrick = {
  id: "trigger", group: "bricks", keywords: ["trigger", "event", "automatic", "round", "turn"], produces: {collection: "triggers"},
  questions: [
    nameQuestion("trigger"),
    {id: "event", kind: "event", default: "rta.combat.round"},
    {id: "conditions", kind: "entries", required: false, accept: {collection: "conditions"}},
    {id: "actions", kind: "entries", min: 1, accept: {collection: "actions"}},
    {id: "holder", kind: "choice", options: ["actor", "combat", "world"], default: "actor"},
    {id: "mode", kind: "choice", options: ["automatic", "offer"], default: "automatic"},
    {id: "actingRole", kind: "choice", options: ["self", "target"], default: "self"},
    descriptionQuestion
  ],
  build(ctx) {
    const v = ctx.values, ids = list => (list ?? []).map(answer => ctx.entry(answer).id);
    return {collection: "triggers", id: ctx.add("triggers", {id: ctx.id(v.name), nameKey: ctx.name(v.name), eventTypeId: v.event, conditionRefs: ids(v.conditions), actionRefs: ids(v.actions),
      holder: v.holder, mode: v.mode, actingRole: v.actingRole, ...described(v)})};
  }
};

const tableBrick = {
  id: "table", group: "bricks", keywords: ["table", "random", "critical", "location"], produces: {collection: "tables"},
  questions: [
    nameQuestion("table"),
    {id: "dice", kind: "dice"},
    {id: "bonus", kind: "formula", required: false},
    {id: "rows", kind: "list", min: 1, fields: [
      {id: "label", kind: "text"}, {id: "min", kind: "integer", required: false}, {id: "max", kind: "integer", required: false},
      {id: "actions", kind: "entries", required: false, accept: {collection: "actions"}}
    ]},
    {id: "action", kind: "boolean", default: true}
  ],
  build(ctx) {
    const v = ctx.values, name = ctx.name(v.name), id = ctx.id(v.name);
    const rollRef = ctx.add("rolls", {id: ctx.newId(ctx.shared("Dice", {name})), nameKey: ctx.shared("Dice", {name}), formula: v.dice});
    const bonusFormulaRef = v.bonus ? formulaOf(ctx, v.bonus, ctx.shared("Bonus", {name})) : null;
    const rows = v.rows.map((row, i) => ({id: `row-${i + 1}`, labelKey: row.label, min: row.min ?? null, max: row.max ?? null, actionRefs: (row.actions ?? []).map(answer => ctx.entry(answer).id)}));
    ctx.add("tables", {id, nameKey: name, rollRef, bonusFormulaRef, rows});
    if (v.action) ctx.add("actions", {id: ctx.newId(ctx.shared("Roll", {name})), nameKey: ctx.shared("Roll", {name}), tableRef: id});
    return {collection: "tables", id};
  }
};

const dieBrick = {
  id: "die", group: "bricks", keywords: ["die", "dice", "narrative", "symbols"], produces: {collection: "dice"},
  questions: [
    nameQuestion("die"),
    {id: "letter", kind: "text"},
    {id: "faces", kind: "list", min: 2, fields: [
      {id: "label", kind: "text"}, {id: "value", kind: "number", required: false},
      {id: "counter", kind: "text", required: false}, {id: "count", kind: "integer", default: 1, visible: row => Boolean(row.counter)}
    ]}
  ],
  build(ctx) {
    const v = ctx.values, counters = [];
    const counterId = label => { const id = counterSlug(label); if (!counters.some(counter => counter.id === id)) counters.push({id, labelKey: label}); return id; };
    const faces = v.faces.map(face => ({labelKey: face.label, value: face.value ?? null, counts: face.counter ? {[counterId(face.counter)]: face.count} : {}}));
    return {collection: "dice", id: ctx.add("dice", {id: ctx.id(v.name), nameKey: ctx.name(v.name), denomination: String(v.letter).trim().toLowerCase(), counters, faces})};
  }
};
const counterSlug = label => { const id = String(label).normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, ""); return /^[a-z]/.test(id) ? id : `c-${id || "counter"}`; };

const counterBrick = {
  id: "counter", group: "bricks", keywords: ["counter", "track", "tally", "reset"], produces: {collection: "definitions", capability: "value"},
  questions: [
    nameQuestion("counter"), typeQuestion("counter", "value", "Type"),
    {id: "increment", kind: "boolean", default: true},
    {id: "resetOn", kind: "event", required: false},
    {id: "resetTo", kind: "number", default: 0, visible: v => Boolean(v.resetOn)}
  ],
  texts: ["Type", "Increment", "Reset"],
  build(ctx) {
    const v = ctx.values, name = ctx.name(v.name), type = ctx.entry(v.type);
    const id = ctx.add("definitions", {id: ctx.id(v.name), definitionTypeId: type.id, nameKey: name, capabilities: ["value"]});
    const base = out(id, "value", "value.base");
    if (v.increment) {
      const effect = ctx.add("effects", {id: ctx.newId(ctx.t("Increment", {name})), nameKey: ctx.t("Increment", {name}), targetRef: base, targetRole: "self", operation: "add", operand: {kind: "literal", value: 1}});
      ctx.add("actions", {id: ctx.newId(ctx.t("Increment", {name})), nameKey: ctx.t("Increment", {name}), effectRefs: [effect]});
    }
    if (v.resetOn) {
      const effect = ctx.add("effects", {id: ctx.newId(ctx.t("Reset", {name})), nameKey: ctx.t("Reset", {name}), targetRef: base, targetRole: "self", operation: "set", operand: {kind: "literal", value: v.resetTo}});
      const action = ctx.add("actions", {id: ctx.newId(ctx.t("Reset", {name})), nameKey: ctx.t("Reset", {name}), effectRefs: [effect]});
      ctx.add("triggers", {id: ctx.newId(ctx.t("Reset", {name})), nameKey: ctx.t("Reset", {name}), eventTypeId: v.resetOn, actionRefs: [action]});
    }
    return {collection: "definitions", id};
  }
};

/* ---------------------------------------------------------------- core */

const characteristics = {
  id: "characteristics", group: "core", keywords: ["characteristic", "attribute", "ability", "stat"], produces: {collection: "definitionTypes"},
  questions: [
    typeQuestion("characteristics", "value", "Type"),
    {id: "items", kind: "list", min: 1, fields: [{id: "name", kind: "name"}]},
    {id: "modifier", kind: "choice", options: ["none", "halfMinusTen"], default: "none"},
    {id: "modifierType", kind: "entry", accept: {collection: "definitionTypes", capability: "value"}, create: "definitionType", fixed: ["capability"], visible: v => v.modifier !== "none",
      default: {create: {name: proposed("characteristics", "ModifierType"), capability: "value"}}}
  ],
  texts: ["Type", "ModifierType", "Modifier"],
  build(ctx) {
    const v = ctx.values, type = ctx.entry(v.type), modifierType = v.modifier !== "none" ? ctx.entry(v.modifierType) : null;
    for (const row of v.items) {
      const name = ctx.name(row.name), id = ctx.add("definitions", {id: ctx.id(row.name), definitionTypeId: type.id, nameKey: name, capabilities: ["value"]});
      if (!modifierType) continue;
      // The modifier of a score: (score - 10) / 2, rounded down.
      const modifierName = ctx.t("Modifier", {name});
      const modifier = ctx.add("definitions", {id: ctx.newId(modifierName), definitionTypeId: modifierType.id, nameKey: modifierName, capabilities: ["value"]});
      const formulaRef = formulaOf(ctx, {type: "floor", value: {type: "divide", args: [{type: "subtract", args: [ref(out(id, "value", "value.final")), lit(10)]}, lit(2)]}}, modifierName);
      ctx.add("formulaBindings", {id: ctx.newId(modifierName), nameKey: modifierName, formulaRef, targetRef: out(modifier, "value", "value.final")});
    }
    return {collection: "definitionTypes", id: type.id};
  }
};

const skills = {
  id: "skills", group: "core", keywords: ["skill", "proficiency", "mastery", "talent"], produces: {collection: "definitionTypes"},
  questions: [
    typeQuestion("skills", "value", "Type"),
    {id: "items", kind: "list", min: 1, fields: [{id: "name", kind: "name"}, {id: "linked", kind: "entry", required: false, accept: {collection: "definitions", capability: "value"}}]},
    {id: "bonus", kind: "choice", options: ["sum", "rankTimes", "rankOnly"], default: "sum"},
    {id: "factor", kind: "formula", default: 1, visible: v => v.bonus === "rankTimes"}
  ],
  texts: ["Type", "Bonus"],
  build(ctx) {
    const v = ctx.values, type = ctx.entry(v.type);
    for (const row of v.items) {
      const name = ctx.name(row.name), id = ctx.add("definitions", {id: ctx.id(row.name), definitionTypeId: type.id, nameKey: name, capabilities: ["value"]});
      const own = ref(out(id, "value", "value.final")), linked = row.linked ? ref(valueOut(ctx, ctx.entry(row.linked))) : null;
      const rank = v.bonus === "rankTimes" ? {type: "multiply", args: [own, v.factor]} : own;
      const expression = v.bonus === "rankOnly" || !linked ? rank : {type: "add", args: [linked, rank]};
      ctx.add("formulas", {id: ctx.newId(ctx.t("Bonus", {name})), nameKey: ctx.t("Bonus", {name}), resultType: "number", expression});
    }
    return {collection: "definitionTypes", id: type.id};
  }
};

const derivedValue = {
  id: "derivedValue", group: "core", keywords: ["derived", "computed", "defense", "armor", "speed"], produces: {collection: "definitions", capability: "value"},
  questions: [
    {id: "target", kind: "choice", options: ["new", "existing"], default: "new"},
    {id: "name", kind: "name", visible: v => v.target === "new"},
    {id: "type", kind: "entry", accept: {collection: "definitionTypes", capability: "value"}, create: "definitionType", fixed: ["capability"], visible: v => v.target === "new",
      default: {create: {name: proposed("derivedValue", "Type"), capability: "value"}}},
    {id: "existing", kind: "entry", accept: {collection: "definitions", capability: "value"}, visible: v => v.target === "existing"},
    {id: "expression", kind: "formula"},
    {id: "binding", kind: "name", required: false}
  ],
  texts: ["Type"],
  build(ctx) {
    const v = ctx.values;
    const id = v.target === "new" ? ctx.add("definitions", {id: ctx.id(v.name), definitionTypeId: ctx.entry(v.type).id, nameKey: ctx.name(v.name), capabilities: ["value"]}) : ctx.entry(v.existing).id;
    const name = ctx.find("definitions", id)?.nameKey ?? id;
    const formulaRef = formulaOf(ctx, v.expression, name);
    // The link computing the value, named after it unless the GM names it.
    ctx.add("formulaBindings", {id: v.binding ? ctx.id(v.binding) : ctx.newId(name), nameKey: v.binding ? ctx.name(v.binding) : name, formulaRef, targetRef: out(id, "value", "value.final")});
    return {collection: "definitions", id};
  }
};

/** A bound as an expression: a number as it is, a Formula as that Formula; none is null. */
const boundNode = source => !source ? null : Object.hasOwn(source, "literal") ? lit(source.literal) : formula(source.formulaRef);
const bounds = {
  id: "bounds", group: "core", keywords: ["bound", "maximum", "minimum", "limit", "cap", "range", "player character", "pc", "npc"], produces: {collection: "definitionTypes"},
  // The only path that changes what exists: the bound it sets replaces the one there, which it may keep for other cases.
  changes: [{collection: "definitionTypes", field: "valueBounds"}, {collection: "definitions", field: "valueBounds"}],
  questions: [
    {id: "target", kind: "choice", options: ["type", "definitions"], default: "type"},
    {id: "type", kind: "entry", accept: {collection: "definitionTypes", capability: "value"}, visible: v => v.target === "type"},
    {id: "definitions", kind: "entries", min: 1, accept: {collection: "definitions", capability: "value"}, visible: v => v.target === "definitions"},
    {id: "bound", kind: "choice", options: ["maximum", "minimum"], default: "maximum"},
    {id: "value", kind: "formula"},
    {id: "when", kind: "condition", required: false}
  ],
  texts: ["maximum", "minimum"],
  build(ctx) {
    const v = ctx.values, field = `valueBounds.${v.bound}`;
    const targets = v.target === "type" ? [{collection: "definitionTypes", id: ctx.entry(v.type).id}] : v.definitions.map(answer => ({collection: "definitions", id: ctx.entry(answer).id}));
    for (const target of targets) {
      const entry = ctx.find(target.collection, target.id), name = entry?.nameKey ?? target.id;
      // The bound in force until now: a Definition's own, else its type's. With a condition, it stays for every other case.
      const typed = target.collection === "definitions" ? ctx.find("definitionTypes", entry?.definitionTypeId)?.valueBounds?.[v.bound] : null;
      const previous = boundNode(entry?.valueBounds?.[v.bound] ?? typed);
      const expression = v.when ? {type: "if", condition: v.when, then: v.value, else: previous ?? lit(null)} : v.value;
      ctx.replace(target.collection, target.id, field, boundOf(ctx, expression, ctx.t(v.bound, {name})));
    }
    return targets[0];
  }
};

const resource = {
  id: "resource", group: "core", keywords: ["resource", "hit points", "health", "mana", "energy", "pool"], produces: {collection: "definitions", capability: "pool"},
  questions: [
    nameQuestion("resource"), typeQuestion("resource", "pool", "Type"),
    {id: "maximum", kind: "choice", options: ["fixed", "formula"], default: "fixed"},
    {id: "maxValue", kind: "number", visible: v => v.maximum === "fixed"},
    {id: "maxFormula", kind: "formula", visible: v => v.maximum === "formula"},
    {id: "minimum", kind: "number", default: 0},
    {id: "initial", kind: "choice", options: ["maximum", "minimum"], default: "maximum"},
    {id: "integer", kind: "boolean", default: true},
    {id: "scale", kind: "entry", required: false, accept: {collection: "scales"}},
    descriptionQuestion
  ],
  texts: ["Type", "Maximum"],
  build(ctx) {
    const v = ctx.values, name = ctx.name(v.name), id = ctx.id(v.name);
    const maximum = v.maximum === "fixed" ? {literal: v.maxValue} : {formulaRef: formulaOf(ctx, v.maxFormula, ctx.t("Maximum", {name}))};
    // A pool starts full unless it starts at its minimum.
    const slot = {id: "points", name, valueType: v.integer ? "integer" : "number", minimum: {literal: v.minimum}, maximum, ...(v.initial === "minimum" ? {initial: {literal: v.minimum}} : {})};
    ctx.add("definitions", {id, definitionTypeId: ctx.entry(v.type).id, nameKey: name, capabilities: ["pool"], slots: {pool: [slot]}, ...(v.scale ? {scaleRef: ctx.entry(v.scale).id} : {}), ...described(v)});
    return {collection: "definitions", id, slotId: "points"};
  }
};

const COMPARE = {atLeast: "gte", above: "gt", atMost: "lte", below: "lt", equal: "eq"};
const testPath = {
  id: "test", group: "core", keywords: ["test", "check", "roll", "saving throw", "difficulty", "opposed"], produces: {collection: "tests"},
  questions: [
    nameQuestion("test"),
    {id: "roll", kind: "entry", required: false, accept: {collection: "rolls"}},
    {id: "dice", kind: "dice", visible: v => !v.roll},
    {id: "bonus", kind: "formula", required: false},
    {id: "target", kind: "choice", options: ["asked", "fixed", "formula", "opposed", "none"], default: "asked"},
    {id: "targetValue", kind: "number", visible: v => v.target === "fixed"},
    {id: "askedDefault", kind: "number", required: false, visible: v => v.target === "asked"},
    {id: "targetFormula", kind: "formula", visible: v => v.target === "formula"},
    {id: "opposed", kind: "entry", accept: {collection: "tests"}, visible: v => v.target === "opposed"},
    {id: "inputs", kind: "list", required: false, fields: [
      {id: "name", kind: "name", withId: true}, {id: "valueType", kind: "choice", options: FIELD_TYPES, default: "number"},
      {id: "from", kind: "choice", options: ["formula", "definition", "value"], default: "formula"},
      {id: "formula", kind: "formula", visible: row => row.from === "formula"},
      {id: "definition", kind: "entry", accept: {collection: "definitions"}, visible: row => row.from === "definition"},
      {id: "value", kind: "text", visible: row => row.from === "value"},
      {id: "default", kind: "text", required: false, visible: row => row.valueType !== "reference"},
      {id: "required", kind: "boolean", default: true}
    ]},
    {id: "outcomes", kind: "entries", required: false, accept: {collection: "outcomes"}},
    {id: "fallback", kind: "entry", required: false, accept: {collection: "outcomes"}, visible: v => Boolean(v.outcomes?.length)},
    {id: "success", kind: "choice", options: ["atLeast", "above", "atMost", "below"], default: "atLeast", visible: v => v.target !== "none" && !v.outcomes?.length},
    {id: "critical", kind: "integer", required: false, visible: v => !v.outcomes?.length},
    {id: "criticalCompare", kind: "choice", options: ["atLeast", "atMost"], default: "atLeast", visible: v => v.critical !== undefined},
    {id: "fumble", kind: "integer", required: false, visible: v => !v.outcomes?.length},
    {id: "fumbleCompare", kind: "choice", options: ["atMost", "atLeast"], default: "atMost", visible: v => v.fumble !== undefined},
    {id: "action", kind: "boolean", default: true},
    descriptionQuestion
  ],
  build(ctx) {
    const v = ctx.values, name = ctx.name(v.name), id = ctx.id(v.name);
    const rollRef = v.roll ? ctx.entry(v.roll).id : ctx.findWhere("rolls", roll => roll.formula === v.dice && !(roll.variants ?? []).length)?.id ?? ctx.add("rolls", {id: ctx.newId(v.dice), nameKey: v.dice, formula: v.dice});
    const test = {id, nameKey: name, rollRef, bonusFormulaRef: v.bonus ? formulaOf(ctx, v.bonus, ctx.shared("Bonus", {name})) : null, outcomeRefs: [], fallbackOutcomeRef: null, inputBindings: [], ...described(v)};
    const inputs = [];
    // Values the Test reads before rolling (test.inputs.<id>): from a Formula, a Definition or a fixed value.
    for (const row of v.inputs ?? []) {
      const source = row.from === "formula" ? {formulaRef: formulaOf(ctx, row.formula, ctx.name(row.name), row.valueType)}
        : {literal: row.from === "definition" ? {objectKind: "definition", objectId: ctx.entry(row.definition).id} : typedValue(row.valueType, row.value)};
      test.inputBindings.push({id: row.name.id ?? inputId(ctx.name(row.name)), valueType: row.valueType, required: row.required, source,
        ...(row.default !== undefined ? {defaultValue: typedValue(row.valueType, row.default)} : {})});
    }
    if (v.target === "fixed") test.targetValue = v.targetValue;
    if (v.target === "formula") test.targetFormulaRef = formulaOf(ctx, v.targetFormula, ctx.shared("Difficulty", {name}));
    if (v.target === "opposed") test.opposedTestRef = ctx.entry(v.opposed).id;
    if (v.target === "asked") {
      // The difficulty is asked when the Action is used, and passed to the Test as its input.
      const asked = formulaOf(ctx, ctxNode("variables.input.difficulty"), ctx.shared("AskedDifficulty"));
      const proposed = v.askedDefault !== undefined ? {defaultValue: v.askedDefault} : {};
      test.inputBindings.push({id: "difficulty", valueType: "number", required: true, source: {formulaRef: asked}, ...proposed});
      test.targetFormulaRef = formulaOf(ctx, ctxNode("variables.test.inputs.difficulty"), ctx.shared("TestDifficulty"));
      inputs.push({id: "difficulty", labelKey: ctx.shared("DifficultyInput"), valueType: "number", required: true, ...proposed});
    }
    const outcome = (key, expression) => {
      const outcomeName = `${name} : ${ctx.shared(`Result.${key}`)}`;
      const conditionRef = expression ? conditionOf(ctx, expression, outcomeName) : null;
      return ctx.add("outcomes", {id: ctx.newId(outcomeName), nameKey: outcomeName, labelKey: ctx.shared(`Result.${key}`), resultKey: key, conditionRef});
    };
    const natural = (compare, value) => ({type: COMPARE[compare], left: ctxNode("variables.test.natural"), right: lit(value)});
    if (v.outcomes?.length) {
      // Outcomes of the Ruleset, tried in order, then the one given when none holds.
      test.outcomeRefs = v.outcomes.map(answer => ctx.entry(answer).id);
      test.fallbackOutcomeRef = v.fallback ? ctx.entry(v.fallback).id : null;
    }
    if (v.critical !== undefined) test.outcomeRefs.push(outcome("critical", natural(v.criticalCompare, v.critical)));
    if (v.fumble !== undefined) test.outcomeRefs.push(outcome("fumble", natural(v.fumbleCompare, v.fumble)));
    if (v.target !== "none" && !v.outcomes?.length) {
      test.outcomeRefs.push(outcome("success", {type: COMPARE[v.success], left: ctxNode("variables.test.margin"), right: lit(0)}));
      test.fallbackOutcomeRef = outcome("failure", null);
    }
    ctx.add("tests", test);
    if (v.action) ctx.add("actions", {id: ctx.newId(ctx.shared("Roll", {name})), nameKey: ctx.shared("Roll", {name}), testRef: id, inputs});
    return {collection: "tests", id};
  }
};
/** The outcomes of a Test that count as hits: those of its results other than failure and fumble. */
const hitOutcomes = (ctx, testId) => (ctx.find("tests", testId)?.outcomeRefs ?? []).map(id => ctx.find("outcomes", id)).filter(outcome => outcome && !["failure", "fumble"].includes(outcome.resultKey));
const criticalMultiplier = ctx => formulaOf(ctx, {type: "if", condition: {type: "eq", left: ctxNode("variables.test.outcome.resultKey"), right: lit("critical")}, then: lit(2), else: lit(1)}, ctx.shared("CriticalMultiplier"));

const attack = {
  id: "attack", group: "core", keywords: ["attack", "weapon", "damage", "hit", "strike"], produces: {collection: "actions"},
  questions: [
    nameQuestion("attack"),
    {id: "test", kind: "entry", accept: {collection: "tests"}, create: "test", default: {create: {name: proposed("attack", "Test"), target: "formula", action: false}}},
    {id: "hits", kind: "entries", required: false, accept: {collection: "outcomes"}, visible: v => Boolean(v.test?.use)},
    {id: "damage", kind: "dice"},
    {id: "damageBonus", kind: "formula", required: false},
    {id: "damageTarget", kind: "entry", accept: {collection: "definitions", capability: "pool"}, create: "resource"},
    {id: "criticalDouble", kind: "boolean", default: true},
    {id: "factor", kind: "entry", required: false, accept: {collection: "formulas"}},
    {id: "minimum", kind: "number", default: 0}
  ],
  texts: ["Test", "Damage"],
  build(ctx) {
    const v = ctx.values, name = ctx.name(v.name), id = ctx.id(v.name), test = ctx.entry(v.test), target = ctx.entry(v.damageTarget);
    const damageName = ctx.t("Damage", {name});
    const effect = ctx.add("effects", {id: ctx.newId(damageName), nameKey: damageName, targetRef: valueOut(ctx, target, {write: true}), targetRole: "target", operation: "subtract",
      operand: rollOperand(ctx, v.damage, damageName, {minimum: v.minimum, bonusFormulaRef: v.damageBonus ? formulaOf(ctx, v.damageBonus, ctx.shared("Bonus", {name: damageName})) : null,
        multiplierFormulaRef: v.criticalDouble ? criticalMultiplier(ctx) : null, factorFormulaRef: v.factor ? ctx.entry(v.factor).id : null})});
    const hits = v.hits?.length ? v.hits.map(answer => ctx.entry(answer).id) : hitOutcomes(ctx, test.id).map(outcome => outcome.id);
    ctx.add("actions", {id, nameKey: name, testRef: test.id, outcomeMappings: hits.map(outcomeId => ({outcomeId, effectRefs: [effect]}))});
    return {collection: "actions", id};
  }
};

const state = {
  id: "state", group: "core", keywords: ["state", "condition", "status", "poisoned", "stunned", "buff"], produces: {collection: "definitions", capability: "state"},
  questions: [
    nameQuestion("state"), typeQuestion("state", "state", "Type"),
    {id: "duration", kind: "choice", options: DURATIONS, default: "untilRemoved"},
    {id: "amount", kind: "integer", min: 1, default: 1, visible: v => !["untilRemoved", "untilEvent"].includes(v.duration)},
    {id: "event", kind: "event", visible: v => v.duration === "untilEvent"},
    {id: "stacking", kind: "choice", options: ["refresh", "stack", "separate", "ignore"], default: "refresh"},
    {id: "modifiers", kind: "list", required: false, fields: [
      {id: "target", kind: "entry", accept: {collection: "definitions", capability: "value"}},
      {id: "operation", kind: "choice", options: ["subtract", "add", "multiply", "set", "min", "max"], default: "subtract"},
      {id: "amount", kind: "formula", default: 1}
    ]},
    // While it is active, a Foundry Active Effect changes the game system's own data (dnd5e's Strength).
    {id: "systemChanges", kind: "list", required: false, fields: [
      {id: "key", kind: "text"},
      {id: "type", kind: "choice", options: SYSTEM_CHANGE_TYPES, default: "add"},
      {id: "value", kind: "text"}
    ]},
    {id: "role", kind: "choice", options: ROLES, default: "target"},
    {id: "applyAction", kind: "boolean", default: true},
    {id: "removeAction", kind: "boolean", default: true},
    descriptionQuestion
  ],
  texts: ["Type", "Active", "Apply", "Remove", "Modifier"],
  build(ctx) {
    const v = ctx.values, name = ctx.name(v.name), id = ctx.id(v.name);
    const systemChanges = (v.systemChanges ?? []).filter(row => row.key?.trim()).map(row => ({key: row.key.trim(), type: row.type,
      value: row.value.trim() !== "" && Number.isFinite(Number(row.value)) ? Number(row.value) : row.value.trim()}));
    ctx.add("definitions", {id, definitionTypeId: ctx.entry(v.type).id, nameKey: name, capabilities: ["state"], ...(systemChanges.length ? {systemChanges} : {}), ...described(v)});
    if (v.modifiers?.length) {
      // While the state is active, however it was applied, its Modifiers change the values they name.
      const active = conditionOf(ctx, ref(out(id, "state", "state.active")), ctx.t("Active", {name}));
      for (const row of v.modifiers) {
        const target = ctx.entry(row.target), modifierName = ctx.t("Modifier", {name, value: ctx.find("definitions", target.id)?.nameKey ?? target.id});
        ctx.add("modifiers", {id: ctx.newId(modifierName), nameKey: modifierName, targetRef: out(target.id, "value", "value.final"), operation: row.operation,
          valueSource: operandOf(ctx, row.amount, modifierName), conditionRefs: [active], stacking: {mode: "stack", group: ""}, priority: 0});
      }
    }
    if (v.applyAction) {
      const durationRef = durationOf(ctx, v);
      ctx.add("actions", {id: ctx.newId(ctx.t("Apply", {name})), nameKey: ctx.t("Apply", {name}), stateApplications: [{definitionId: id, targetRole: v.role, durationRef, stacking: v.stacking}]});
    }
    if (v.removeAction) ctx.add("actions", {id: ctx.newId(ctx.t("Remove", {name})), nameKey: ctx.t("Remove", {name}), stateRemovals: [{definitionId: id, targetRole: v.role}]});
    return {collection: "definitions", id};
  }
};
/** The rule of a Duration answer: until removed, until an event, or a number of rounds, turns, minutes… */
const durationRule = v => v.duration === "untilRemoved" ? {mode: "untilRemoved", amount: null, unit: null, eventTypeRef: null}
  : v.duration === "untilEvent" ? {mode: "untilEvent", amount: null, unit: null, eventTypeRef: v.event} : {mode: "fixed", amount: v.amount, unit: v.duration, eventTypeRef: null};
/** The Duration of a state's answers: one with the same rule is used again. */
function durationOf(ctx, v) {
  const rule = durationRule(v);
  const found = ctx.findWhere("durations", entry => entry.mode === rule.mode && (entry.amount ?? null) === rule.amount && (entry.unit ?? null) === rule.unit && (entry.eventTypeRef ?? null) === rule.eventTypeRef);
  if (found) return found.id;
  const name = ctx.shared(`Duration.${v.duration}`, {amount: v.amount});
  return ctx.add("durations", {id: ctx.newId(name), nameKey: name, ...rule});
}

/* A roll or another moment of the game system, heard through a Foundry hook (dnd5e.rollAttack): an Event Type that
   follows the hook, and a Trigger running Actions when the right item reaches its mark (a hit against the target's AC). */
const systemRoll = {
  id: "systemRoll", group: "systems", keywords: ["system", "hook", "dnd5e", "foundry", "roll", "attack", "hit", "weapon", "on hit", "event"], produces: {collection: "eventTypes"},
  questions: [
    nameQuestion("systemRoll", "Event"),
    {id: "hook", kind: "text"},
    {id: "who", kind: "choice", options: ["local", "gm"], default: "local"},
    {id: "selfPath", kind: "text", required: false},
    {id: "totalPath", kind: "text", required: false},
    {id: "itemPath", kind: "text", required: false},
    {id: "item", kind: "text", required: false, visible: v => Boolean(v.itemPath?.trim())},
    {id: "reach", kind: "formula", required: false, visible: v => Boolean(v.totalPath?.trim())},
    {id: "actions", kind: "entries", min: 1, accept: {collection: "actions"}},
    descriptionQuestion
  ],
  texts: ["Event", "Total", "Item", "When", "Trigger"],
  build(ctx) {
    const v = ctx.values, name = ctx.name(v.name), id = ctx.id(v.name), path = text => String(text ?? "").trim();
    const field = (key, valueType) => ({name: ctx.t(key), valueType, required: false, nullable: false});
    const payloadFields = {...(path(v.totalPath) ? {total: field("Total", "number")} : {}), ...(path(v.itemPath) ? {item: field("Item", "string")} : {})};
    const fieldPaths = {...(path(v.totalPath) ? {total: path(v.totalPath)} : {}), ...(path(v.itemPath) ? {item: path(v.itemPath)} : {})};
    ctx.add("eventTypes", {id, nameKey: name, payloadFields, hook: {name: path(v.hook), who: v.who, selfPath: path(v.selfPath), fieldPaths}, ...described(v)});
    // Only for the item named, and only when the total reaches the mark: one Condition holding both.
    const parts = [...(payloadFields.item && path(v.item) ? [{type: "eq", left: ctxNode("event.payload.item"), right: lit(path(v.item))}] : []),
      ...(payloadFields.total && v.reach ? [{type: "gte", left: ctxNode("event.payload.total"), right: v.reach}] : [])];
    const conditionRefs = parts.length ? [conditionOf(ctx, parts.length === 1 ? parts[0] : {type: "and", args: parts}, ctx.t("When", {name}))] : [];
    const trigger = ctx.t("Trigger", {name});
    ctx.add("triggers", {id: ctx.newId(trigger), nameKey: trigger, eventTypeId: id, conditionRefs, actionRefs: v.actions.map(answer => ctx.entry(answer).id), holder: "actor", mode: "automatic", actingRole: "self"});
    return {collection: "eventTypes", id};
  }
};

const cost = {
  id: "cost", group: "core", keywords: ["cost", "ammunition", "ammo", "mana", "spend", "uses"], produces: {collection: "actions"},
  questions: [
    {id: "action", kind: "entry", accept: {collection: "actions"}, create: "action"},
    {id: "resource", kind: "entry", accept: {collection: "definitions", capability: "pool"}, create: "resource"},
    {id: "amount", kind: "number", min: 0, default: 1},
    {id: "required", kind: "boolean", default: true}
  ],
  texts: ["Enough", "Spend"],
  build(ctx) {
    const v = ctx.values, action = ctx.entry(v.action), resourceAnswer = ctx.entry(v.resource);
    const target = valueOut(ctx, resourceAnswer, {write: true}), resourceName = ctx.find("definitions", resourceAnswer.id)?.nameKey ?? resourceAnswer.id;
    const effect = ctx.add("effects", {id: ctx.newId(ctx.t("Spend", {name: resourceName, amount: v.amount})), nameKey: ctx.t("Spend", {name: resourceName, amount: v.amount}), targetRef: target, targetRole: "self", operation: "subtract", operand: {kind: "literal", value: v.amount}});
    ctx.append("actions", action.id, "costEffectRefs", [effect]);
    if (v.required) ctx.append("actions", action.id, "conditionRefs", [conditionOf(ctx, {type: "gte", left: ref(target), right: lit(v.amount)}, ctx.t("Enough", {name: resourceName, amount: v.amount}))]);
    return {collection: "actions", id: action.id};
  }
};

const consumable = {
  id: "consumable", group: "core", keywords: ["consumable", "potion", "charges", "doses"], produces: {collection: "actions"},
  questions: [
    nameQuestion("consumable"), typeQuestion("consumable", "pool", "Type"),
    {id: "doses", kind: "integer", min: 1},
    {id: "effectTarget", kind: "entry", accept: {collection: "definitions"}, create: "resource"},
    {id: "operation", kind: "choice", options: ["add", "subtract", "set"], default: "add"},
    {id: "amount", kind: "formula"}
  ],
  texts: ["Type", "Doses", "HasDose", "UseDose", "Effect", "Use"],
  build(ctx) {
    const v = ctx.values, name = ctx.name(v.name), id = ctx.id(v.name);
    ctx.add("definitions", {id, definitionTypeId: ctx.entry(v.type).id, nameKey: name, capabilities: ["pool"], slots: {pool: [{id: "doses", name: ctx.t("Doses"), valueType: "integer", minimum: {literal: 0}, maximum: {literal: v.doses}, initial: {literal: v.doses}}]}});
    const doses = out(id, "pool", "pool.current", "doses"), target = ctx.entry(v.effectTarget);
    const has = conditionOf(ctx, {type: "gt", left: ref(doses), right: lit(0)}, ctx.t("HasDose", {name}));
    const use = ctx.add("effects", {id: ctx.newId(ctx.t("UseDose", {name})), nameKey: ctx.t("UseDose", {name}), targetRef: doses, targetRole: "self", operation: "subtract", operand: {kind: "literal", value: 1}});
    const effect = ctx.add("effects", {id: ctx.newId(ctx.t("Effect", {name})), nameKey: ctx.t("Effect", {name}), targetRef: valueOut(ctx, target, {write: true}), targetRole: "self", operation: v.operation, operand: operandOf(ctx, v.amount, ctx.t("Effect", {name}))});
    const action = ctx.add("actions", {id: ctx.newId(ctx.t("Use", {name})), nameKey: ctx.t("Use", {name}), conditionRefs: [has], costEffectRefs: [use], effectRefs: [effect]});
    return {collection: "actions", id: action};
  }
};

const level = {
  id: "level", group: "core", keywords: ["level", "experience", "xp", "rank"], produces: {collection: "definitions", capability: "value"},
  questions: [
    nameQuestion("level", "Level"), typeQuestion("level", "value", "Type"),
    {id: "experience", kind: "entry", accept: {collection: "definitions", capability: "value"}, create: "value", default: {create: {name: proposed("level", "Experience")}}},
    {id: "rule", kind: "choice", options: ["perLevel", "table"], default: "perLevel"},
    {id: "perLevel", kind: "number", min: 1, visible: v => v.rule === "perLevel"},
    {id: "thresholds", kind: "list", min: 1, visible: v => v.rule === "table", fields: [{id: "level", kind: "integer"}, {id: "experience", kind: "number"}]},
    {id: "award", kind: "boolean", default: true}
  ],
  texts: ["Level", "Type", "Experience", "Award"],
  build(ctx) {
    const v = ctx.values, name = ctx.name(v.name), xp = ctx.entry(v.experience), xpValue = ref(out(xp.id, "value", "value.final"));
    const id = ctx.add("definitions", {id: ctx.id(v.name), definitionTypeId: ctx.entry(v.type).id, nameKey: name, capabilities: ["value"]});
    // A table: the highest threshold reached gives the level (ranges from the highest, each open above).
    const sorted = [...(v.thresholds ?? [])].sort((a, b) => b.experience - a.experience);
    const expression = v.rule === "perLevel" ? {type: "add", args: [{type: "floor", value: {type: "divide", args: [xpValue, lit(v.perLevel)]}}, lit(1)]}
      : {type: "rangeLookup", value: xpValue, ranges: sorted.map(row => ({min: row.experience, value: row.level})), default: lit(sorted.at(-1)?.level ?? 1)};
    ctx.add("formulaBindings", {id: ctx.newId(name), nameKey: name, formulaRef: formulaOf(ctx, expression, name), targetRef: out(id, "value", "value.final")});
    if (v.award) {
      const awardName = ctx.t("Award", {name: ctx.find("definitions", xp.id)?.nameKey ?? xp.id});
      const formulaRef = formulaOf(ctx, ctxNode("variables.input.amount"), ctx.shared("InputAmount"));
      const effect = ctx.add("effects", {id: ctx.newId(awardName), nameKey: awardName, targetRef: out(xp.id, "value", "value.base"), targetRole: "self", operation: "add", operand: {kind: "formula", id: formulaRef}});
      ctx.add("actions", {id: ctx.newId(awardName), nameKey: awardName, inputs: [{id: "amount", labelKey: ctx.shared("AmountInput"), valueType: "number", required: true}], effectRefs: [effect]});
    }
    return {collection: "definitions", id};
  }
};

const encumbrance = {
  id: "encumbrance", group: "core", keywords: ["encumbrance", "load", "carry", "weight"], produces: {collection: "conditions"},
  questions: [
    nameQuestion("encumbrance", "Overloaded"),
    {id: "load", kind: "entry", accept: {collection: "definitions", capability: "value"}, create: "value", default: {create: {name: proposed("encumbrance", "Load")}}},
    {id: "capacity", kind: "formula"}
  ],
  texts: ["Overloaded", "Load", "Capacity"],
  build(ctx) {
    const v = ctx.values, name = ctx.name(v.name), load = ctx.entry(v.load);
    const capacity = formulaOf(ctx, v.capacity, ctx.t("Capacity"));
    return {collection: "conditions", id: conditionOf(ctx, {type: "gt", left: ref(out(load.id, "value", "value.final")), right: formula(capacity)}, name)};
  }
};

/* ---------------------------------------------------------------- systems */

const advantage = {
  id: "advantage", group: "systems", keywords: ["advantage", "disadvantage", "bonus die", "situational", "modifier"], produces: {collection: "tests"},
  questions: [
    {id: "tests", kind: "entries", min: 1, accept: {collection: "tests"}},
    {id: "when", kind: "entry", accept: {collection: "conditions"}, create: "condition"},
    {id: "effect", kind: "choice", options: ["advantage", "disadvantage", "extraDie", "bonus", "malus"], default: "advantage"},
    {id: "dice", kind: "dice", visible: v => ["advantage", "disadvantage"].includes(v.effect)},
    {id: "extraDice", kind: "dice", visible: v => v.effect === "extraDie"},
    {id: "amount", kind: "integer", min: 1, visible: v => ["bonus", "malus"].includes(v.effect)}
  ],
  build(ctx) {
    const v = ctx.values, when = ctx.entry(v.when).id, tests = v.tests.map(answer => ctx.entry(answer).id);
    if (["advantage", "disadvantage"].includes(v.effect)) {
      // Another dice formula for the Test's Roll while the Condition holds (the Roll may serve other Tests too).
      for (const rollRef of new Set(tests.map(id => ctx.find("tests", id)?.rollRef).filter(Boolean))) ctx.append("rolls", rollRef, "variants", [{conditionRef: when, formula: v.dice}]);
    } else {
      const dice = v.effect === "extraDie" ? v.extraDice : String(v.amount);
      const rollRef = ctx.findWhere("rolls", roll => roll.formula === dice && !(roll.variants ?? []).length)?.id ?? ctx.add("rolls", {id: ctx.newId(dice), nameKey: dice, formula: dice});
      for (const id of tests) ctx.append("tests", id, "extraRolls", [{conditionRef: when, rollRef, operation: v.effect === "malus" ? "subtract" : "add"}]);
    }
    return {collection: "tests", id: tests[0]};
  }
};

const damageTypes = {
  id: "damageTypes", group: "systems", keywords: ["damage type", "resistance", "vulnerability", "immunity", "armor"], produces: {collection: "definitionTypes"},
  questions: [
    typeQuestion("damageTypes", "state", "Type"),
    {id: "types", kind: "list", min: 1, fields: [{id: "name", kind: "name"}]},
    {id: "immunity", kind: "boolean", default: true},
    {id: "resistance", kind: "boolean", default: true},
    {id: "vulnerability", kind: "boolean", default: true}
  ],
  texts: ["Type", "Immunity", "Resistance", "Vulnerability", "Factor"],
  build(ctx) {
    const v = ctx.values, type = ctx.entry(v.type);
    for (const row of v.types) {
      const name = ctx.name(row.name), held = {};
      for (const kind of ["immunity", "resistance", "vulnerability"]) if (v[kind]) {
        const stateName = ctx.t(kind.charAt(0).toUpperCase() + kind.slice(1), {name});
        held[kind] = ref(out(ctx.add("definitions", {id: ctx.newId(stateName), definitionTypeId: type.id, nameKey: stateName, capabilities: ["state"]}), "state", "state.active"), "target");
      }
      // The factor applied to damage of this type on the target: 0 immune, ½ resistant, 2 vulnerable (both cancel out).
      const no = lit(false), resist = held.resistance ?? no, vulnerable = held.vulnerability ?? no;
      let expression = {type: "if", condition: {type: "and", args: [resist, {type: "not", value: vulnerable}]}, then: lit(0.5), else: {type: "if", condition: {type: "and", args: [vulnerable, {type: "not", value: resist}]}, then: lit(2), else: lit(1)}};
      if (held.immunity) expression = {type: "if", condition: held.immunity, then: lit(0), else: expression};
      formulaOf(ctx, expression, ctx.t("Factor", {name}));
    }
    return {collection: "definitionTypes", id: type.id};
  }
};

const power = {
  id: "power", group: "systems", keywords: ["spell", "power", "magic", "ability", "save"], produces: {collection: "actions"},
  questions: [
    nameQuestion("power"),
    {id: "resolution", kind: "choice", options: ["attack", "save", "automatic", "heal", "state", "utility"], default: "attack"},
    {id: "test", kind: "entry", accept: {collection: "tests"}, create: "test", visible: v => ["attack", "save"].includes(v.resolution)},
    {id: "hits", kind: "entries", required: false, accept: {collection: "outcomes"}, visible: v => ["attack", "save"].includes(v.resolution) && Boolean(v.test?.use)},
    {id: "dice", kind: "dice", visible: v => ["attack", "save", "automatic", "heal"].includes(v.resolution)},
    {id: "target", kind: "entry", accept: {collection: "definitions", capability: "pool"}, create: "resource", visible: v => ["attack", "save", "automatic", "heal"].includes(v.resolution)},
    {id: "halfOnMiss", kind: "boolean", default: true, visible: v => v.resolution === "save"},
    {id: "state", kind: "entry", accept: {collection: "definitions", capability: "state"}, create: "state", visible: v => v.resolution === "state"},
    {id: "duration", kind: "choice", options: DURATIONS, default: "round", visible: v => v.resolution === "state"},
    {id: "amount", kind: "integer", min: 1, default: 1, visible: v => v.resolution === "state" && !["untilRemoved", "untilEvent"].includes(v.duration)},
    {id: "event", kind: "event", visible: v => v.resolution === "state" && v.duration === "untilEvent"},
    {id: "role", kind: "choice", options: ROLES, default: "target"},
    {id: "levels", kind: "boolean", default: false},
    {id: "levelMin", kind: "integer", default: 1, visible: v => v.levels},
    {id: "levelMax", kind: "integer", visible: v => v.levels},
    {id: "cost", kind: "entry", required: false, accept: {collection: "definitions", capability: "pool"}, create: "resource"},
    {id: "costAmount", kind: "number", min: 0, default: 1, visible: v => Boolean(v.cost)}
  ],
  texts: ["Effect", "Half", "Enough", "Spend", "Level"],
  build(ctx) {
    const v = ctx.values, name = ctx.name(v.name), id = ctx.id(v.name);
    const action = {id, nameKey: name, inputs: [], outcomeMappings: [], effectRefs: [], conditionRefs: [], costEffectRefs: []};
    // The level chosen when it is used: read in the dice as @input.level.
    if (v.levels) action.inputs.push({id: "level", labelKey: ctx.t("Level"), valueType: "integer", required: true, defaultValue: v.levelMin,
      options: Array.from({length: Math.max(0, v.levelMax - v.levelMin) + 1}, (_, i) => ({value: v.levelMin + i, labelKey: String(v.levelMin + i)}))});
    const effectName = ctx.t("Effect", {name});
    const damage = (factorFormulaRef = null, label = effectName) => {
      const target = ctx.entry(v.target);
      return ctx.add("effects", {id: ctx.newId(label), nameKey: label, targetRef: valueOut(ctx, target, {write: true}), targetRole: v.role, operation: v.resolution === "heal" ? "add" : "subtract",
        operand: rollOperand(ctx, v.dice, label, {minimum: 0, multiplierFormulaRef: v.resolution === "attack" ? criticalMultiplier(ctx) : null, factorFormulaRef})});
    };
    if (["attack", "save"].includes(v.resolution)) {
      const test = ctx.entry(v.test), full = damage();
      action.testRef = test.id;
      const hits = v.hits?.length ? v.hits.map(answer => ctx.entry(answer).id) : hitOutcomes(ctx, test.id).map(outcome => outcome.id);
      action.outcomeMappings = hits.map(outcomeId => ({outcomeId, effectRefs: [full]}));
      // A failed attempt of a save-based power: half of the dice (rounded down) on the target.
      if (v.resolution === "save" && v.halfOnMiss) action.effectRefs = [damage(formulaOf(ctx, lit(0.5), ctx.shared("Half")), ctx.t("Half", {name}))];
    }
    if (["automatic", "heal"].includes(v.resolution)) action.effectRefs = [damage()];
    if (v.resolution === "state") action.stateApplications = [{definitionId: ctx.entry(v.state).id, targetRole: v.role, durationRef: durationOf(ctx, v), stacking: "refresh"}];
    if (v.cost) {
      const resourceAnswer = ctx.entry(v.cost), target = valueOut(ctx, resourceAnswer, {write: true}), resourceName = ctx.find("definitions", resourceAnswer.id)?.nameKey ?? resourceAnswer.id;
      action.costEffectRefs.push(ctx.add("effects", {id: ctx.newId(ctx.t("Spend", {name: resourceName})), nameKey: ctx.t("Spend", {name: resourceName, amount: v.costAmount}), targetRef: target, targetRole: "self", operation: "subtract", operand: {kind: "literal", value: v.costAmount}}));
      action.conditionRefs.push(conditionOf(ctx, {type: "gte", left: ref(target), right: lit(v.costAmount)}, ctx.t("Enough", {name: resourceName, amount: v.costAmount})));
    }
    ctx.add("actions", action);
    return {collection: "actions", id};
  }
};

const threshold = {
  id: "threshold", group: "systems", keywords: ["threshold", "zero", "unconscious", "dying", "defeated", "automatic state"], produces: {collection: "conditions"},
  questions: [
    nameQuestion("threshold"),
    {id: "watched", kind: "entry", accept: {collection: "definitions"}},
    {id: "compare", kind: "choice", options: ["atMost", "below", "atLeast", "above", "equal"], default: "atMost"},
    {id: "limit", kind: "number", default: 0},
    {id: "state", kind: "entry", accept: {collection: "definitions", capability: "state"}, create: "state", default: undefined},
    {id: "event", kind: "event", default: "rta.combat.turn"},
    {id: "remove", kind: "boolean", default: true},
    {id: "defeated", kind: "boolean", default: false}
  ],
  texts: ["Apply", "Remove", "Check", "Over"],
  build(ctx) {
    const v = ctx.values, name = ctx.name(v.name), watched = ctx.entry(v.watched), stateId = ctx.entry(v.state).id;
    const reached = {type: COMPARE[v.compare], left: ref(valueOut(ctx, watched)), right: lit(v.limit)}, condition = conditionOf(ctx, reached, name);
    const stateName = ctx.find("definitions", stateId)?.nameKey ?? stateId;
    const actions = [ctx.add("actions", {id: ctx.newId(ctx.t("Apply", {name: stateName})), nameKey: ctx.t("Apply", {name: stateName}), conditionRefs: [condition], stateApplications: [{definitionId: stateId, targetRole: "self", stacking: "ignore"}]})];
    if (v.remove) {
      const over = conditionOf(ctx, {type: "not", value: reached}, ctx.t("Over", {name}));
      actions.push(ctx.add("actions", {id: ctx.newId(ctx.t("Remove", {name: stateName})), nameKey: ctx.t("Remove", {name: stateName}), conditionRefs: [over], stateRemovals: [{definitionId: stateId, targetRole: "self"}]}));
    }
    ctx.add("triggers", {id: ctx.newId(ctx.t("Check", {name})), nameKey: ctx.t("Check", {name}), eventTypeId: v.event, actionRefs: actions});
    if (v.defeated) ctx.fill(null, null, "initiative.defeatedConditionRef", condition);
    return {collection: "conditions", id: condition};
  }
};

const rest = {
  id: "rest", group: "systems", keywords: ["rest", "recovery", "sleep", "heal", "regain"], produces: {collection: "actions"},
  questions: [
    {id: "mode", kind: "choice", options: ["new", "existing"], default: "new"},
    {id: "name", kind: "name", default: proposed("rest", "Rest"), visible: v => v.mode === "new"},
    {id: "action", kind: "entry", accept: {collection: "actions"}, visible: v => v.mode === "existing"},
    {id: "resources", kind: "list", min: 1, fields: [
      {id: "resource", kind: "entry", accept: {collection: "definitions"}},
      {id: "recovery", kind: "choice", options: ["full", "amount", "formula", "reset"], default: "full"},
      {id: "amount", kind: "number", default: 1, visible: row => row.recovery === "amount"},
      {id: "expression", kind: "formula", visible: row => row.recovery === "formula"},
      {id: "resetTo", kind: "number", default: 0, visible: row => row.recovery === "reset"}
    ]},
    {id: "clearStates", kind: "entries", required: false, accept: {collection: "definitions", capability: "state"}},
    {id: "daily", kind: "boolean", default: false}
  ],
  texts: ["Rest", "Recover", "Daily", "DayPassed"],
  build(ctx) {
    const v = ctx.values;
    const effects = v.resources.map(row => {
      const answer = ctx.entry(row.resource), definition = ctx.find("definitions", answer.id), resourceName = definition?.nameKey ?? answer.id, target = valueOut(ctx, answer, {write: true});
      const effectName = ctx.t("Recover", {name: resourceName});
      let operation = "add", operandValue = {kind: "literal", value: row.amount};
      if (row.recovery === "full") {
        if (target.capabilityId !== "pool") throw new Error(`${resourceName} has no maximum to recover to.`);
        operation = "set"; operandValue = {kind: "reference", reference: {...target, outputId: "pool.maximum"}};
      }
      if (row.recovery === "formula") operandValue = operandOf(ctx, row.expression, effectName);
      if (row.recovery === "reset") { operation = "set"; operandValue = {kind: "literal", value: row.resetTo}; }
      return ctx.add("effects", {id: ctx.newId(effectName), nameKey: effectName, targetRef: target, targetRole: "self", operation, operand: operandValue});
    });
    const removals = (v.clearStates ?? []).map(answer => ({definitionId: ctx.entry(answer).id, targetRole: "self"}));
    let actionId;
    if (v.mode === "new") actionId = ctx.add("actions", {id: ctx.id(v.name), nameKey: ctx.name(v.name), effectRefs: effects, stateRemovals: removals});
    else {
      actionId = ctx.entry(v.action).id;
      ctx.append("actions", actionId, "effectRefs", effects);
      if (removals.length) ctx.append("actions", actionId, "stateRemovals", removals);
    }
    if (v.daily) {
      // Each time the world clock passes at least one midnight.
      const dayPassed = conditionOf(ctx, {type: "gt", left: ctxNode("event.payload.days"), right: lit(0)}, ctx.t("DayPassed"));
      const actionName = ctx.find("actions", actionId)?.nameKey ?? actionId;
      ctx.add("triggers", {id: ctx.newId(ctx.t("Daily", {name: actionName})), nameKey: ctx.t("Daily", {name: actionName}), eventTypeId: "rta.time.elapsed", conditionRefs: [dayPassed], actionRefs: [actionId]});
    }
    return {collection: "actions", id: actionId};
  }
};

const initiative = {
  id: "initiative", group: "systems", keywords: ["initiative", "turn order", "combat", "round"], produces: null,
  questions: [
    {id: "test", kind: "entry", accept: {collection: "tests"}, create: "test", default: {create: {name: proposed("initiative", "Test"), target: "none", action: false}}},
    {id: "eachRound", kind: "boolean", default: false},
    {id: "tieBreak", kind: "formula", required: false},
    {id: "passes", kind: "formula", required: false},
    {id: "defeated", kind: "entry", required: false, accept: {collection: "conditions"}, create: "condition"},
    {id: "bySide", kind: "boolean", default: false}
  ],
  texts: ["Test", "TieBreak", "Passes"],
  build(ctx) {
    const v = ctx.values;
    ctx.fill(null, null, "initiative", {testRef: ctx.entry(v.test).id, tableRef: null, eachRound: v.eachRound, bySide: v.bySide,
      tieBreakFormulaRef: v.tieBreak ? formulaOf(ctx, v.tieBreak, ctx.t("TieBreak")) : null,
      passes: v.passes ? {countFormulaRef: formulaOf(ctx, v.passes, ctx.t("Passes"))} : null,
      defeatedConditionRef: v.defeated ? ctx.entry(v.defeated).id : null});
    return null;
  }
};

const BOUNDED = ["content", "choice", "allocation"];
const creation = {
  id: "creation", group: "systems", keywords: ["character creation", "creation", "point buy", "background", "class"], produces: {collection: "creationSystems"},
  questions: [
    {id: "mode", kind: "choice", options: ["new", "existing"], default: "new"},
    {id: "name", kind: "name", default: proposed("creation", "Creation"), visible: v => v.mode === "new"},
    {id: "system", kind: "entry", accept: {collection: "creationSystems"}, visible: v => v.mode === "existing"},
    {id: "steps", kind: "list", min: 1, fields: [
      {id: "kind", kind: "choice", options: ["content", "contentChoices", "allocation", "choice", "review"], default: "content"},
      {id: "name", kind: "name", withId: true},
      {id: "templates", kind: "entries", min: 1, accept: {collection: "contentTemplates"}, visible: row => row.kind === "content"},
      {id: "definitions", kind: "entries", min: 1, accept: {collection: "definitions"}, visible: row => ["allocation", "choice"].includes(row.kind)},
      {id: "min", kind: "integer", min: 0, default: 1, visible: row => BOUNDED.includes(row.kind)},
      {id: "max", kind: "integer", min: 0, default: 1, visible: row => BOUNDED.includes(row.kind)},
      {id: "minFormula", kind: "formula", required: false, visible: row => BOUNDED.includes(row.kind)},
      {id: "maxFormula", kind: "formula", required: false, visible: row => BOUNDED.includes(row.kind)},
      {id: "perTargetMax", kind: "integer", min: 0, required: false, visible: row => row.kind === "allocation"},
      {id: "perTargetMaxFormula", kind: "formula", required: false, visible: row => row.kind === "allocation"},
      {id: "optionCondition", kind: "entry", required: false, accept: {collection: "conditions"}, visible: row => ["content", "choice"].includes(row.kind)},
      {id: "choicesLater", kind: "boolean", default: true, visible: row => row.kind === "content"},
      {id: "required", kind: "boolean", default: true, visible: row => BOUNDED.includes(row.kind)}
    ]},
    descriptionQuestion
  ],
  texts: ["Creation", "Min", "Max", "PerTarget"],
  build(ctx) {
    const v = ctx.values, existing = v.mode === "existing" ? ctx.find("creationSystems", ctx.entry(v.system).id) : null;
    const taken = new Set((existing?.steps ?? []).map(step => step.id)), later = [];
    const stepId = (name, explicit) => { let base = explicit ?? (String(name).normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "step"), id = base, n = 2; while (taken.has(id)) id = `${base}-${n++}`; taken.add(id); return id; };
    // The content steps whose Contents' choices a later "choices of the Contents" step asks, not yet asked.
    for (const step of existing?.steps ?? []) if (step.kind === "content") later.push(step.id); else if (step.kind === "contentChoices") for (const id of step.source.stepIds) later.splice(later.indexOf(id), 1);
    const steps = v.steps.map(row => {
      const name = ctx.name(row.name), step = {id: stepId(name, row.name.id), kind: row.kind, name, required: BOUNDED.includes(row.kind) ? row.required : false, options: [], min: 0, max: 0};
      if (BOUNDED.includes(row.kind)) {
        Object.assign(step, {min: row.min, max: row.max});
        if (row.minFormula) step.minFormulaRef = formulaOf(ctx, row.minFormula, ctx.t("Min", {name}));
        if (row.maxFormula) step.maxFormulaRef = formulaOf(ctx, row.maxFormula, ctx.t("Max", {name}));
      }
      if (row.optionCondition) step.optionConditionRef = ctx.entry(row.optionCondition).id;
      if (row.kind === "content") { step.source = {collection: "contentTemplates", objectIds: row.templates.map(answer => ctx.entry(answer).id)}; if (row.choicesLater) later.push(step.id); }
      if (["choice", "allocation"].includes(row.kind)) step.source = {collection: "definitions", objectIds: row.definitions.map(answer => ctx.entry(answer).id)};
      if (row.kind === "allocation") {
        if (row.perTargetMax !== undefined) step.perTargetMax = row.perTargetMax;
        if (row.perTargetMaxFormula) step.perTargetMaxFormulaRef = formulaOf(ctx, row.perTargetMaxFormula, ctx.t("PerTarget", {name}));
      }
      if (row.kind === "contentChoices") step.source = {stepIds: later.splice(0)};
      return step;
    });
    if (existing) { ctx.append("creationSystems", existing.id, "steps", steps); return {collection: "creationSystems", id: existing.id}; }
    return {collection: "creationSystems", id: ctx.add("creationSystems", {id: ctx.id(v.name), nameKey: ctx.name(v.name), steps, ...described(v)})};
  }
};

const progression = {
  id: "progression", group: "systems", keywords: ["progression", "advancement", "level up", "experience", "practice"], produces: {collection: "progressionSystems"},
  questions: [
    {id: "system", kind: "entry", required: false, accept: {collection: "progressionSystems"}},
    {id: "name", kind: "name", default: proposed("progression", "Progression"), visible: v => !v.system},
    {id: "mode", kind: "choice", options: ["advance", "milestones"], default: "advance"},
    {id: "values", kind: "list", min: 1, visible: v => v.mode === "advance", fields: [
      {id: "value", kind: "entry", accept: {collection: "definitions", capability: "value"}},
      {id: "currency", kind: "entry", required: false, accept: {collection: "definitions"}}
    ]},
    {id: "currency", kind: "entry", required: false, accept: {collection: "definitions"}, visible: v => v.mode === "advance"},
    {id: "cost", kind: "choice", options: ["table", "formula"], default: "table", visible: v => v.mode === "advance"},
    {id: "costs", kind: "list", min: 1, visible: v => v.mode === "advance" && v.cost === "table", fields: [{id: "level", kind: "integer"}, {id: "cost", kind: "number", min: 0}]},
    {id: "costFormula", kind: "formula", visible: v => v.mode === "advance" && v.cost === "formula"},
    {id: "maximum", kind: "formula", required: false, visible: v => v.mode === "advance"},
    {id: "level", kind: "entry", accept: {collection: "definitions", capability: "value"}, create: "level", visible: v => v.mode === "milestones"},
    {id: "milestones", kind: "list", min: 1, visible: v => v.mode === "milestones", fields: [
      {id: "level", kind: "integer"}, {id: "grants", kind: "entries", required: false, accept: {collection: "definitions"}},
      {id: "action", kind: "entry", required: false, accept: {collection: "actions"}}
    ]},
    descriptionQuestion
  ],
  texts: ["Progression", "Cost", "Maximum", "Advance", "Reached"],
  build(ctx) {
    const v = ctx.values, system = {advancements: [], milestones: []};
    if (v.mode === "advance") {
      // The cost of the next level, from the table (a level the table does not list cannot be bought) or a Formula.
      const cost = v.cost === "formula" ? formulaOf(ctx, v.costFormula, ctx.t("Cost"))
        : formulaOf(ctx, {type: "lookup", key: ctxNode("variables.advance.next"), table: v.costs.map(row => ({key: row.level, value: row.cost})), default: lit(Number.MAX_SAFE_INTEGER)}, ctx.t("Cost"));
      const maximumFormulaRef = v.maximum ? formulaOf(ctx, v.maximum, ctx.t("Maximum")) : null;
      for (const row of v.values) {
        const valueId = ctx.entry(row.value).id, currencyAnswer = row.currency ? ctx.entry(row.currency) : v.currency ? ctx.entry(v.currency) : null;
        if (!currencyAnswer) throw new Error(`No currency pays for ${valueId}.`);
        const label = ctx.find("definitions", valueId)?.nameKey ?? valueId;
        system.advancements.push({id: readableId(ctx.t("Advance", {name: valueId})) || `advance-${valueId}`, labelKey: label, definitionIds: [valueId], currencyRef: valueOut(ctx, currencyAnswer, {write: true}), costFormulaRef: cost, step: 1, maximumFormulaRef});
      }
    } else {
      const levelId = ctx.entry(v.level).id;
      for (const row of v.milestones) {
        const reached = conditionOf(ctx, {type: "gte", left: ref(out(levelId, "value", "value.final")), right: lit(row.level)}, ctx.t("Reached", {level: row.level}));
        system.milestones.push({id: `level-${row.level}`, labelKey: ctx.t("Reached", {level: row.level}), conditionRef: reached, definitionIds: (row.grants ?? []).map(answer => ctx.entry(answer).id), actionRef: row.action ? ctx.entry(row.action).id : null});
      }
    }
    if (v.system) {
      const id = ctx.entry(v.system).id, current = ctx.find("progressionSystems", id), taken = new Set([...(current?.advancements ?? []), ...(current?.milestones ?? [])].map(entry => entry.id));
      const fresh = list => list.map(entry => { let next = entry.id, n = 2; while (taken.has(next)) next = `${entry.id}-${n++}`; taken.add(next); return {...entry, id: next}; });
      if (system.advancements.length) ctx.append("progressionSystems", id, "advancements", fresh(system.advancements));
      if (system.milestones.length) ctx.append("progressionSystems", id, "milestones", fresh(system.milestones));
      return {collection: "progressionSystems", id};
    }
    return {collection: "progressionSystems", id: ctx.add("progressionSystems", {id: ctx.id(v.name), nameKey: ctx.name(v.name), ...system, ...described(v)})};
  }
};

const scale = {
  id: "scale", group: "systems", keywords: ["scale", "description", "words", "observable", "ladder"], produces: {collection: "scales"},
  questions: [
    nameQuestion("scale"),
    {id: "basis", kind: "choice", options: ["value", "percent"], default: "value"},
    {id: "rows", kind: "list", min: 1, fields: [{id: "min", kind: "number", required: false}, {id: "max", kind: "number", required: false}, {id: "words", kind: "text"}, {id: "id", kind: "text", required: false}]},
    {id: "definitions", kind: "entries", required: false, accept: {collection: "definitions"}},
    {id: "types", kind: "entries", required: false, accept: {collection: "definitionTypes"}},
    descriptionQuestion
  ],
  build(ctx) {
    const v = ctx.values, id = ctx.id(v.name);
    ctx.add("scales", {id, nameKey: ctx.name(v.name), basis: v.basis, rows: v.rows.map((row, i) => ({id: row.id || `row-${i + 1}`, labelKey: row.words, min: row.min ?? null, max: row.max ?? null})), ...described(v)});
    for (const answer of v.definitions ?? []) ctx.fill("definitions", ctx.entry(answer).id, "scaleRef", id);
    for (const answer of v.types ?? []) ctx.fill("definitionTypes", ctx.entry(answer).id, "scaleRef", id);
    return {collection: "scales", id};
  }
};

const contentType = {
  id: "contentType", group: "systems", keywords: ["content", "item", "equipment", "weapon", "spell list", "fields"], produces: {collection: "contentTypes"},
  questions: [
    nameQuestion("contentType"),
    {id: "storage", kind: "choice", options: ["item", "actor"], default: "item"},
    {id: "stackable", kind: "boolean", default: false},
    {id: "fields", kind: "list", required: false, fields: FIELD_QUESTIONS},
    {id: "availability", kind: "entry", required: false, accept: {collection: "conditions"}},
    descriptionQuestion
  ],
  build(ctx) {
    const v = ctx.values;
    return {collection: "contentTypes", id: ctx.add("contentTypes", {id: ctx.id(v.name), nameKey: ctx.name(v.name), storageKind: v.storage, runtimeMode: v.stackable ? "stackable" : "unique",
      fields: fieldMap(ctx, v.fields), ...(v.availability ? {availabilityConditionRef: ctx.entry(v.availability).id} : {}), ...described(v)})};
  }
};

const ROLE_LADDER = {gamemaster: ["gamemaster"], assistant: ["assistant", "gamemaster"], trusted: ["trusted", "assistant", "gamemaster"]};
const PERMISSION_KINDS = {action: "actions", definition: "definitions", definitionType: "definitionTypes", contentType: "contentTypes"};
const permission = {
  id: "permission", group: "systems", keywords: ["permission", "gm only", "rights", "lock"], produces: {collection: "permissionPolicies"},
  questions: [
    {id: "kind", kind: "choice", options: Object.keys(PERMISSION_KINDS), default: "action"},
    {id: "actions", kind: "entries", min: 1, accept: {collection: "actions"}, visible: v => v.kind === "action"},
    {id: "definitions", kind: "entries", min: 1, accept: {collection: "definitions"}, visible: v => v.kind === "definition"},
    {id: "types", kind: "entries", min: 1, accept: {collection: "definitionTypes"}, visible: v => v.kind === "definitionType"},
    {id: "contentTypes", kind: "entries", min: 1, accept: {collection: "contentTypes"}, visible: v => v.kind === "contentType"},
    {id: "who", kind: "choice", options: ["gamemaster", "assistant", "trusted"], default: "assistant"},
    {id: "name", kind: "name", required: false},
    descriptionQuestion
  ],
  texts: ["Policy", "RuleAllowed", "RuleRead", "RuleWrite", "RuleUse", "RuleAssign"],
  build(ctx) {
    const v = ctx.values, list = {action: v.actions, definition: v.definitions, definitionType: v.types, contentType: v.contentTypes}[v.kind], collection = PERMISSION_KINDS[v.kind];
    const rule = (key, fields) => ({id: readableId(ctx.t(key)) || key.toLowerCase(), effect: "ALLOW", ...fields});
    let first = null;
    for (const answer of list) {
      const id = ctx.entry(answer).id, entryName = ctx.find(collection, id)?.nameKey ?? id, named = v.name && list.length === 1;
      const name = named ? ctx.name(v.name) : ctx.t("Policy", {name: entryName});
      // An Action: only these roles may use it. A value: everyone reads it, only these roles change it.
      // A Content Type: its owner uses a Content, only these roles give or change one.
      const rules = v.kind === "action" ? [rule("RuleAllowed", {operations: ["read", "execute"], priority: 10, roles: ROLE_LADDER[v.who]})]
        : v.kind === "contentType" ? [rule("RuleUse", {operations: ["read", "execute"], priority: 0, minimumOwnership: "owner"}), rule("RuleAssign", {operations: ["read", "write", "execute", "configure"], priority: 10, roles: ROLE_LADDER[v.who]})]
        : [rule("RuleRead", {operations: ["read", "execute"], priority: 0}), rule("RuleWrite", {operations: ["write", "configure"], priority: 10, roles: ROLE_LADDER[v.who]})];
      const policy = ctx.add("permissionPolicies", {id: named ? ctx.id(v.name) : ctx.newId(name), nameKey: name, scope: {objectKind: v.kind, objectId: id}, defaultEffect: "DENY", rules, ...described(v)});
      first ??= policy;
    }
    return {collection: "permissionPolicies", id: first};
  }
};

export const ASSISTANT_PATHS = Object.freeze([
  characteristics, skills, derivedValue, bounds, resource, testPath, attack, state, cost, consumable, level, encumbrance,
  advantage, damageTypes, power, threshold, rest, systemRoll, initiative, creation, progression, scale, contentType, permission,
  definitionType, value, parameterBrick, formulaBrick, conditionBrick, rollBrick, outcomeBrick, durationBrick, effectBrick, actionBrick, counterBrick, triggerBrick, tableBrick, dieBrick
]);
export const getAssistantPath = pathId => ASSISTANT_PATHS.find(path => path.id === pathId) ?? null;
