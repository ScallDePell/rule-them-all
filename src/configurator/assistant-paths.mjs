/* The assistant's paths (assistant-engine.mjs): each asks a few questions and builds the entries of one rule.
   Concept paths build a whole mechanism (a skill list, an attack, a rest); brick paths build one entry each and serve
   as the sub-paths ("create a new one") of the others. Every name, option and default is a text key:
   RTA.Assistant.Path.<path>.Q.<question>.Label, .Option.<value>, list fields under .Field.<field>, and
   RTA.Assistant.Path.<path>.Text.<key> for the names a path gives its own entries. No game rule is written here. */
import {pathKey} from "./assistant-engine.mjs";

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
/** A Formula of the expression when it is more than a number: {kind, value|id} to use as an operand. */
function operandOf(ctx, expression, name) {
  if (expression?.type === "literal" && typeof expression.value === "number") return {kind: "literal", value: expression.value};
  return {kind: "formula", id: formulaOf(ctx, expression, name)};
}
/** A roll operand throwing new dice named after the entry they serve. */
function rollOperand(ctx, dice, name, {minimum, bonusFormulaRef, multiplierFormulaRef, factorFormulaRef} = {}) {
  const rollRef = ctx.add("rolls", {id: ctx.newId(ctx.shared("Dice", {name})), nameKey: ctx.shared("Dice", {name}), formula: dice});
  return {kind: "roll", rollRef, ...(bonusFormulaRef ? {bonusFormulaRef} : {}), ...(multiplierFormulaRef ? {multiplierFormulaRef} : {}), ...(factorFormulaRef ? {factorFormulaRef} : {}), ...(minimum !== undefined ? {minimum} : {})};
}
/** A Formula or Condition of this expression: one already in the Ruleset (or this plan) is used again, not doubled. */
const formulaOf = (ctx, expression, name, resultType = "number") => ctx.findWhere("formulas", entry => entry.resultType === resultType && ctx.same(entry.expression, expression))?.id
  ?? ctx.add("formulas", {id: ctx.newId(name), nameKey: name, resultType, expression});
const conditionOf = (ctx, expression, name) => ctx.findWhere("conditions", entry => ctx.same(entry.expression, expression))?.id
  ?? ctx.add("conditions", {id: ctx.newId(name), nameKey: name, expression});
const typeQuestion = (pathId, capability, textKey) => ({id: "type", kind: "entry", accept: {collection: "definitionTypes", capability}, create: "definitionType", fixed: ["capability"], default: {create: {name: proposed(pathId, textKey), capability}}});
const nameQuestion = (pathId, textKey) => ({id: "name", kind: "name", ...(textKey ? {default: proposed(pathId, textKey)} : {})});
const ROLES = ["target", "self"];
const DURATIONS = ["untilRemoved", "round", "turn", "minute", "hour", "day", "untilEvent"];

/* ---------------------------------------------------------------- bricks */

const definitionType = {
  id: "definitionType", group: "bricks", keywords: ["type"], produces: {collection: "definitionTypes"},
  questions: [
    nameQuestion("definitionType"),
    {id: "capability", kind: "choice", options: ["value", "pool", "state"], default: "value"},
    {id: "minimum", kind: "number", required: false, visible: v => v.capability === "value"},
    {id: "maximum", kind: "number", required: false, visible: v => v.capability === "value"}
  ],
  build(ctx) {
    const {name, capability, minimum, maximum} = ctx.values;
    const bounds = {...(minimum !== undefined ? {minimum: {literal: minimum}} : {}), ...(maximum !== undefined ? {maximum: {literal: maximum}} : {})};
    const id = ctx.add("definitionTypes", {id: ctx.id(name), nameKey: ctx.name(name), allowedCapabilities: [capability], defaultCapabilities: [capability], requiredCapabilities: [capability], ...(Object.keys(bounds).length ? {valueBounds: bounds} : {})});
    return {collection: "definitionTypes", id};
  }
};

const value = {
  id: "value", group: "bricks", keywords: ["value", "counter"], produces: {collection: "definitions", capability: "value"},
  questions: [nameQuestion("value"), typeQuestion("value", "value", "Type")],
  texts: ["Type"],
  build(ctx) {
    const type = ctx.entry(ctx.values.type);
    const id = ctx.add("definitions", {id: ctx.id(ctx.values.name), definitionTypeId: type.id, nameKey: ctx.name(ctx.values.name), capabilities: ["value"]});
    return {collection: "definitions", id};
  }
};

const formulaBrick = {
  id: "formula", group: "bricks", keywords: ["formula", "calculation"], produces: {collection: "formulas"},
  questions: [nameQuestion("formula"), {id: "resultType", kind: "choice", options: ["number", "integer", "boolean", "string"], default: "number"}, {id: "expression", kind: "formula"}],
  build(ctx) { return {collection: "formulas", id: formulaOf(ctx, ctx.values.expression, ctx.name(ctx.values.name), ctx.values.resultType)}; }
};

const conditionBrick = {
  id: "condition", group: "bricks", keywords: ["condition", "requirement"], produces: {collection: "conditions"},
  questions: [nameQuestion("condition"), {id: "expression", kind: "condition"}],
  build(ctx) { return {collection: "conditions", id: conditionOf(ctx, ctx.values.expression, ctx.name(ctx.values.name))}; }
};

const effectBrick = {
  id: "effect", group: "bricks", keywords: ["effect", "damage", "heal"], produces: {collection: "effects"},
  questions: [
    nameQuestion("effect"),
    {id: "target", kind: "entry", accept: {collection: "definitions"}},
    {id: "role", kind: "choice", options: ROLES, default: "target"},
    {id: "operation", kind: "choice", options: ["subtract", "add", "set", "multiply"], default: "subtract"},
    {id: "operand", kind: "choice", options: ["number", "formula", "dice"], default: "number"},
    {id: "amount", kind: "number", default: 1, visible: v => v.operand === "number"},
    {id: "expression", kind: "formula", visible: v => v.operand === "formula"},
    {id: "dice", kind: "dice", visible: v => v.operand === "dice"},
    {id: "minimum", kind: "number", required: false, visible: v => v.operand === "dice"}
  ],
  build(ctx) {
    const v = ctx.values, name = ctx.name(v.name), id = ctx.id(v.name), target = ctx.entry(v.target);
    let operandValue = {kind: "literal", value: v.amount};
    if (v.operand === "formula") operandValue = operandOf(ctx, v.expression, ctx.shared("Amount", {name}));
    if (v.operand === "dice") operandValue = rollOperand(ctx, v.dice, name, {minimum: v.minimum});
    return {collection: "effects", id: ctx.add("effects", {id, nameKey: name, targetRef: valueOut(ctx, target, {write: true}), targetRole: v.role, operation: v.operation, operand: operandValue})};
  }
};

const actionBrick = {
  id: "action", group: "bricks", keywords: ["action", "button"], produces: {collection: "actions"},
  questions: [
    nameQuestion("action"),
    {id: "inputs", kind: "list", required: false, fields: [
      {id: "name", kind: "name"}, {id: "valueType", kind: "choice", options: ["number", "integer", "boolean", "string"], default: "number"},
      {id: "default", kind: "text", required: false}
    ]},
    {id: "conditions", kind: "entries", required: false, accept: {collection: "conditions"}},
    {id: "costs", kind: "entries", required: false, accept: {collection: "effects"}},
    {id: "test", kind: "entry", required: false, accept: {collection: "tests"}},
    {id: "effects", kind: "entries", required: false, accept: {collection: "effects"}},
    {id: "applyStates", kind: "entries", required: false, accept: {collection: "definitions", capability: "state"}},
    {id: "removeStates", kind: "entries", required: false, accept: {collection: "definitions", capability: "state"}},
    {id: "role", kind: "choice", options: ROLES, default: "target"},
    {id: "results", kind: "list", required: false, visible: v => Boolean(v.test), fields: [
      {id: "resultKey", kind: "text"}, {id: "effects", kind: "entries", required: false, accept: {collection: "effects"}},
      {id: "actions", kind: "entries", required: false, accept: {collection: "actions"}}
    ]},
    {id: "targeting", kind: "choice", options: ["one", "each", "shared"], default: "one"}
  ],
  build(ctx) {
    const v = ctx.values, ids = list => (list ?? []).map(answer => ctx.entry(answer).id);
    const inputs = (v.inputs ?? []).map(row => {
      const id = inputId(ctx.name(row.name));
      const typed = row.default === undefined || row.default === "" ? undefined : row.valueType === "boolean" ? row.default === "true" : ["number", "integer"].includes(row.valueType) ? Number(row.default) : row.default;
      return {id, labelKey: ctx.name(row.name), valueType: row.valueType, required: typed === undefined, ...(typed !== undefined && !Number.isNaN(typed) ? {defaultValue: typed} : {})};
    });
    const action = {id: ctx.id(v.name), nameKey: ctx.name(v.name), inputs, conditionRefs: ids(v.conditions), costEffectRefs: ids(v.costs), effectRefs: ids(v.effects),
      testRef: v.test ? ctx.entry(v.test).id : null, targeting: v.targeting,
      stateApplications: ids(v.applyStates).map(definitionId => ({definitionId, targetRole: v.role})),
      stateRemovals: ids(v.removeStates).map(definitionId => ({definitionId, targetRole: v.role}))};
    // Per result of the Test (by its result key): the Effects instead of the Action's own, then other Actions.
    action.outcomeMappings = (v.results ?? []).map(row => ({resultKey: row.resultKey, effectRefs: ids(row.effects), actionRefs: ids(row.actions)}));
    return {collection: "actions", id: ctx.add("actions", action)};
  }
};
/** An Action input id from its name: letters, digits and _. */
function inputId(name) {
  const id = String(name).normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "").toLowerCase();
  return /^[a-z]/.test(id) ? id : `v_${id || "input"}`;
}


const triggerBrick = {
  id: "trigger", group: "bricks", keywords: ["trigger", "event", "automatic", "round", "turn"], produces: {collection: "triggers"},
  questions: [
    nameQuestion("trigger"),
    {id: "event", kind: "event", default: "rta.combat.round"},
    {id: "conditions", kind: "entries", required: false, accept: {collection: "conditions"}},
    {id: "actions", kind: "entries", min: 1, accept: {collection: "actions"}},
    {id: "holder", kind: "choice", options: ["actor", "combat", "world"], default: "actor"},
    {id: "mode", kind: "choice", options: ["automatic", "offer"], default: "automatic"},
    {id: "actingRole", kind: "choice", options: ["self", "target"], default: "self"}
  ],
  build(ctx) {
    const v = ctx.values, ids = list => (list ?? []).map(answer => ctx.entry(answer).id);
    return {collection: "triggers", id: ctx.add("triggers", {id: ctx.id(v.name), nameKey: ctx.name(v.name), eventTypeId: v.event, conditionRefs: ids(v.conditions), actionRefs: ids(v.actions), holder: v.holder, mode: v.mode, actingRole: v.actingRole})};
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
    {id: "expression", kind: "formula"}
  ],
  texts: ["Type"],
  build(ctx) {
    const v = ctx.values;
    const id = v.target === "new" ? ctx.add("definitions", {id: ctx.id(v.name), definitionTypeId: ctx.entry(v.type).id, nameKey: ctx.name(v.name), capabilities: ["value"]}) : ctx.entry(v.existing).id;
    const name = ctx.find("definitions", id)?.nameKey ?? id;
    const formulaRef = formulaOf(ctx, v.expression, name);
    ctx.add("formulaBindings", {id: ctx.newId(name), nameKey: name, formulaRef, targetRef: out(id, "value", "value.final")});
    return {collection: "definitions", id};
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
    {id: "integer", kind: "boolean", default: true}
  ],
  texts: ["Type", "Maximum"],
  build(ctx) {
    const v = ctx.values, name = ctx.name(v.name), id = ctx.id(v.name);
    const maximum = v.maximum === "fixed" ? {literal: v.maxValue} : {formulaRef: formulaOf(ctx, v.maxFormula, ctx.t("Maximum", {name}))};
    const slot = {id: "points", name, valueType: v.integer ? "integer" : "number", minimum: {literal: v.minimum}, maximum, initial: v.initial === "maximum" ? maximum : {literal: v.minimum}};
    ctx.add("definitions", {id, definitionTypeId: ctx.entry(v.type).id, nameKey: name, capabilities: ["pool"], slots: {pool: [slot]}});
    return {collection: "definitions", id, slotId: "points"};
  }
};

const COMPARE = {atLeast: "gte", above: "gt", atMost: "lte", below: "lt", equal: "eq"};
const testPath = {
  id: "test", group: "core", keywords: ["test", "check", "roll", "saving throw", "difficulty", "opposed"], produces: {collection: "tests"},
  questions: [
    nameQuestion("test"),
    {id: "dice", kind: "dice"},
    {id: "bonus", kind: "formula", required: false},
    {id: "target", kind: "choice", options: ["asked", "fixed", "formula", "opposed", "none"], default: "asked"},
    {id: "targetValue", kind: "number", visible: v => v.target === "fixed"},
    {id: "askedDefault", kind: "number", required: false, visible: v => v.target === "asked"},
    {id: "targetFormula", kind: "formula", visible: v => v.target === "formula"},
    {id: "opposed", kind: "entry", accept: {collection: "tests"}, visible: v => v.target === "opposed"},
    {id: "success", kind: "choice", options: ["atLeast", "above", "atMost", "below"], default: "atLeast", visible: v => v.target !== "none"},
    {id: "critical", kind: "integer", required: false},
    {id: "criticalCompare", kind: "choice", options: ["atLeast", "atMost"], default: "atLeast", visible: v => v.critical !== undefined},
    {id: "fumble", kind: "integer", required: false},
    {id: "fumbleCompare", kind: "choice", options: ["atMost", "atLeast"], default: "atMost", visible: v => v.fumble !== undefined},
    {id: "action", kind: "boolean", default: true}
  ],
  build(ctx) {
    const v = ctx.values, name = ctx.name(v.name), id = ctx.id(v.name);
    const rollRef = ctx.findWhere("rolls", roll => roll.formula === v.dice && !(roll.variants ?? []).length)?.id ?? ctx.add("rolls", {id: ctx.newId(v.dice), nameKey: v.dice, formula: v.dice});
    const test = {id, nameKey: name, rollRef, bonusFormulaRef: v.bonus ? formulaOf(ctx, v.bonus, ctx.shared("Bonus", {name})) : null, outcomeRefs: [], fallbackOutcomeRef: null, inputBindings: []};
    const inputs = [];
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
    if (v.critical !== undefined) test.outcomeRefs.push(outcome("critical", natural(v.criticalCompare, v.critical)));
    if (v.fumble !== undefined) test.outcomeRefs.push(outcome("fumble", natural(v.fumbleCompare, v.fumble)));
    if (v.target !== "none") {
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
    {id: "role", kind: "choice", options: ROLES, default: "target"},
    {id: "applyAction", kind: "boolean", default: true},
    {id: "removeAction", kind: "boolean", default: true}
  ],
  texts: ["Type", "Active", "Apply", "Remove", "Modifier"],
  build(ctx) {
    const v = ctx.values, name = ctx.name(v.name), id = ctx.id(v.name);
    ctx.add("definitions", {id, definitionTypeId: ctx.entry(v.type).id, nameKey: name, capabilities: ["state"]});
    if (v.modifiers?.length) {
      // While the state is active, however it was applied, its Modifiers change the values they name.
      const active = conditionOf(ctx, ref(out(id, "state", "state.active")), ctx.t("Active", {name}));
      for (const row of v.modifiers) {
        const target = ctx.entry(row.target), modifierName = ctx.t("Modifier", {name, value: ctx.find("definitions", target.id)?.nameKey ?? target.id});
        const amount = operandOf(ctx, row.amount, modifierName);
        ctx.add("modifiers", {id: ctx.newId(modifierName), nameKey: modifierName, targetRef: out(target.id, "value", "value.final"), operation: row.operation,
          valueSource: amount.kind === "formula" ? {kind: "formula", id: amount.id} : {kind: "literal", value: amount.value}, conditionRefs: [active], stacking: {mode: "stack", group: ""}, priority: 0});
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
/** The Duration of a state's answers: one with the same rule is used again. */
function durationOf(ctx, v) {
  const rule = v.duration === "untilRemoved" ? {mode: "untilRemoved", amount: null, unit: null, eventTypeRef: null} : v.duration === "untilEvent" ? {mode: "untilEvent", amount: null, unit: null, eventTypeRef: v.event} : {mode: "fixed", amount: v.amount, unit: v.duration, eventTypeRef: null};
  const found = ctx.findWhere("durations", entry => entry.mode === rule.mode && (entry.amount ?? null) === rule.amount && (entry.unit ?? null) === rule.unit && (entry.eventTypeRef ?? null) === rule.eventTypeRef);
  if (found) return found.id;
  const name = ctx.shared(`Duration.${v.duration}`, {amount: v.amount});
  return ctx.add("durations", {id: ctx.newId(name), nameKey: name, ...rule});
}

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

const creation = {
  id: "creation", group: "systems", keywords: ["character creation", "creation", "point buy", "background", "class"], produces: {collection: "creationSystems"},
  questions: [
    {id: "mode", kind: "choice", options: ["new", "existing"], default: "new"},
    {id: "name", kind: "name", default: proposed("creation", "Creation"), visible: v => v.mode === "new"},
    {id: "system", kind: "entry", accept: {collection: "creationSystems"}, visible: v => v.mode === "existing"},
    {id: "steps", kind: "list", min: 1, fields: [
      {id: "kind", kind: "choice", options: ["content", "contentChoices", "allocation", "choice", "review"], default: "content"},
      {id: "name", kind: "name"},
      {id: "templates", kind: "entries", min: 1, accept: {collection: "contentTemplates"}, visible: row => row.kind === "content"},
      {id: "definitions", kind: "entries", min: 1, accept: {collection: "definitions"}, visible: row => ["allocation", "choice"].includes(row.kind)},
      {id: "min", kind: "integer", min: 0, default: 1, visible: row => ["content", "choice"].includes(row.kind)},
      {id: "max", kind: "integer", min: 0, default: 1, visible: row => ["content", "choice"].includes(row.kind)},
      {id: "points", kind: "integer", min: 0, visible: row => row.kind === "allocation"},
      {id: "perTargetMax", kind: "integer", min: 0, required: false, visible: row => row.kind === "allocation"}
    ]}
  ],
  texts: ["Creation"],
  build(ctx) {
    const v = ctx.values, existing = v.mode === "existing" ? ctx.find("creationSystems", ctx.entry(v.system).id) : null;
    const taken = new Set((existing?.steps ?? []).map(step => step.id)), uncovered = [];
    const stepId = name => { let base = String(name).normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "step", id = base, n = 2; while (taken.has(id)) id = `${base}-${n++}`; taken.add(id); return id; };
    for (const step of existing?.steps ?? []) if (step.kind === "content") uncovered.push(step.id); else if (step.kind === "contentChoices") for (const id of step.source.stepIds) uncovered.splice(uncovered.indexOf(id), 1);
    const steps = v.steps.map(row => {
      const step = {id: stepId(ctx.name(row.name)), kind: row.kind, name: ctx.name(row.name), required: row.kind !== "review", options: [], min: 0, max: 0};
      if (row.kind === "content") { Object.assign(step, {min: row.min, max: row.max, source: {collection: "contentTemplates", objectIds: row.templates.map(answer => ctx.entry(answer).id)}}); uncovered.push(step.id); }
      if (row.kind === "choice") Object.assign(step, {min: row.min, max: row.max, source: {collection: "definitions", objectIds: row.definitions.map(answer => ctx.entry(answer).id)}});
      if (row.kind === "allocation") Object.assign(step, {min: row.points, max: row.points, source: {collection: "definitions", objectIds: row.definitions.map(answer => ctx.entry(answer).id)}, ...(row.perTargetMax !== undefined ? {perTargetMax: row.perTargetMax} : {})});
      // The choices of the Contents picked in the content steps before it, not yet asked.
      if (row.kind === "contentChoices") step.source = {stepIds: uncovered.splice(0)};
      return step;
    });
    if (existing) { ctx.append("creationSystems", existing.id, "steps", steps); return {collection: "creationSystems", id: existing.id}; }
    return {collection: "creationSystems", id: ctx.add("creationSystems", {id: ctx.id(v.name), nameKey: ctx.name(v.name), steps})};
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
    {id: "costs", kind: "list", min: 1, visible: v => v.mode === "advance", fields: [{id: "level", kind: "integer"}, {id: "cost", kind: "number", min: 0}]},
    {id: "maximum", kind: "integer", required: false, visible: v => v.mode === "advance"},
    {id: "level", kind: "entry", accept: {collection: "definitions", capability: "value"}, create: "level", visible: v => v.mode === "milestones"},
    {id: "milestones", kind: "list", min: 1, visible: v => v.mode === "milestones", fields: [
      {id: "level", kind: "integer"}, {id: "grants", kind: "entries", required: false, accept: {collection: "definitions"}},
      {id: "action", kind: "entry", required: false, accept: {collection: "actions"}}
    ]}
  ],
  texts: ["Progression", "Cost", "Maximum", "Reached"],
  build(ctx) {
    const v = ctx.values, system = {advancements: [], milestones: []};
    if (v.mode === "advance") {
      // The cost of the next level, from the table; a level the table does not list cannot be bought.
      const cost = formulaOf(ctx, {type: "lookup", key: ctxNode("variables.advance.next"), table: v.costs.map(row => ({key: row.level, value: row.cost})), default: lit(Number.MAX_SAFE_INTEGER)}, ctx.t("Cost"));
      const maximumFormulaRef = v.maximum !== undefined ? formulaOf(ctx, lit(v.maximum), ctx.t("Maximum", {value: v.maximum})) : null;
      for (const row of v.values) {
        const valueId = ctx.entry(row.value).id, currencyAnswer = row.currency ? ctx.entry(row.currency) : v.currency ? ctx.entry(v.currency) : null;
        if (!currencyAnswer) throw new Error(`No currency pays for ${valueId}.`);
        const currency = valueOut(ctx, currencyAnswer, {write: true});
        system.advancements.push({id: `advance-${valueId}`, labelKey: ctx.find("definitions", valueId)?.nameKey ?? valueId, definitionIds: [valueId], currencyRef: currency, costFormulaRef: cost, step: 1, maximumFormulaRef});
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
    return {collection: "progressionSystems", id: ctx.add("progressionSystems", {id: ctx.id(v.name), nameKey: ctx.name(v.name), ...system})};
  }
};

const scale = {
  id: "scale", group: "systems", keywords: ["scale", "description", "words", "observable", "ladder"], produces: {collection: "scales"},
  questions: [
    nameQuestion("scale"),
    {id: "basis", kind: "choice", options: ["value", "percent"], default: "value"},
    {id: "rows", kind: "list", min: 1, fields: [{id: "min", kind: "number", required: false}, {id: "max", kind: "number", required: false}, {id: "words", kind: "text"}]},
    {id: "definitions", kind: "entries", required: false, accept: {collection: "definitions"}},
    {id: "types", kind: "entries", required: false, accept: {collection: "definitionTypes"}}
  ],
  build(ctx) {
    const v = ctx.values, id = ctx.id(v.name);
    ctx.add("scales", {id, nameKey: ctx.name(v.name), basis: v.basis, rows: v.rows.map((row, i) => ({id: `row-${i + 1}`, labelKey: row.words, min: row.min ?? null, max: row.max ?? null}))});
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
    {id: "fields", kind: "list", required: false, fields: [{id: "name", kind: "name"}, {id: "valueType", kind: "choice", options: ["number", "integer", "boolean", "string"], default: "number"}]}
  ],
  build(ctx) {
    const v = ctx.values, fields = {};
    for (const row of v.fields ?? []) {
      let id = inputId(ctx.name(row.name)).replace(/_([a-z0-9])/g, (all, letter) => letter.toUpperCase()), base = id, n = 2;
      while (fields[id]) id = `${base}${n++}`;
      fields[id] = {id, name: ctx.name(row.name), valueType: row.valueType, cardinality: "one", required: false, nullable: false, constraints: []};
    }
    return {collection: "contentTypes", id: ctx.add("contentTypes", {id: ctx.id(v.name), nameKey: ctx.name(v.name), storageKind: v.storage, runtimeMode: v.stackable ? "stackable" : "unique", fields})};
  }
};

const ROLE_LADDER = {gamemaster: ["gamemaster"], assistant: ["assistant", "gamemaster"], trusted: ["trusted", "assistant", "gamemaster"]};
const permission = {
  id: "permission", group: "systems", keywords: ["permission", "gm only", "rights", "lock"], produces: {collection: "permissionPolicies"},
  questions: [
    {id: "kind", kind: "choice", options: ["action", "definition", "definitionType"], default: "action"},
    {id: "actions", kind: "entries", min: 1, accept: {collection: "actions"}, visible: v => v.kind === "action"},
    {id: "definitions", kind: "entries", min: 1, accept: {collection: "definitions"}, visible: v => v.kind === "definition"},
    {id: "types", kind: "entries", min: 1, accept: {collection: "definitionTypes"}, visible: v => v.kind === "definitionType"},
    {id: "who", kind: "choice", options: ["gamemaster", "assistant", "trusted"], default: "assistant"}
  ],
  texts: ["Policy"],
  build(ctx) {
    const v = ctx.values, list = v.kind === "action" ? v.actions : v.kind === "definition" ? v.definitions : v.types;
    const collection = {action: "actions", definition: "definitions", definitionType: "definitionTypes"}[v.kind];
    let first = null;
    for (const answer of list) {
      const id = ctx.entry(answer).id, entryName = ctx.find(collection, id)?.nameKey ?? id, name = ctx.t("Policy", {name: entryName});
      // An Action: only these roles may use it. A value: everyone reads it, only these roles change it.
      const rules = v.kind === "action" ? [{id: "allowed", effect: "ALLOW", operations: ["read", "execute"], priority: 10, roles: ROLE_LADDER[v.who]}]
        : [{id: "read", effect: "ALLOW", operations: ["read", "execute"], priority: 0}, {id: "write", effect: "ALLOW", operations: ["write", "configure"], priority: 10, roles: ROLE_LADDER[v.who]}];
      const policy = ctx.add("permissionPolicies", {id: ctx.newId(name), nameKey: name, scope: {objectKind: v.kind, objectId: id}, defaultEffect: "DENY", rules});
      first ??= policy;
    }
    return {collection: "permissionPolicies", id: first};
  }
};

export const ASSISTANT_PATHS = Object.freeze([
  characteristics, skills, derivedValue, resource, testPath, attack, state, cost, consumable, level, encumbrance,
  advantage, damageTypes, power, threshold, rest, initiative, creation, progression, scale, contentType, permission,
  definitionType, value, formulaBrick, conditionBrick, effectBrick, actionBrick, counterBrick, triggerBrick, tableBrick, dieBrick
]);
export const getAssistantPath = pathId => ASSISTANT_PATHS.find(path => path.id === pathId) ?? null;
