/* Built-in recipes (§8). A recipe is documentation and a
   reproducible scenario at once: its steps explain how the primitives fit
   together, and applying it adds those objects to a draft in one validated
   write. Tests apply every recipe to an empty Ruleset, publish it and play it.
   Pure: names come from the injected text(key) function. */
import {copyJSON} from "./configurator-schema.mjs";
import {PREPARERS} from "./rule-contracts.mjs";
import {prepareDefinitionSlots} from "./capability-slots.mjs";
import {COLLECTION_FIELDS} from "./configurator-schema.mjs";

const lit = value => ({type: "literal", value});
const ref = (objectId, capabilityId, outputId, slotId) => ({type: "reference", reference: {objectKind: "definition", objectId, capabilityId, ...(slotId ? {slotId} : {}), outputId}});
const meta = (order, nameKey) => ({nameKey, descriptionKey: "", enabled: true, order, tags: []});
const type = (id, nameKey, capabilities) => ({id, key: id, nameKey, descriptionKey: "", color: null, enabled: true, order: 10, allowedCapabilities: capabilities, defaultCapabilities: capabilities, requiredCapabilities: capabilities, fields: {}, constraints: []});
const definition = (id, typeId, nameKey, capabilities, slots) => ({id, key: id, definitionTypeId: typeId, nameKey, descriptionKey: "", data: {}, categories: [], capabilities, ...(slots ? {slots} : {}), enabled: true, order: 10, tags: []});
const pool = (id, maximum, initial = maximum) => ({id, minimum: {literal: 0}, maximum: {literal: maximum}, initial: {literal: initial}});
const poolCurrent = (objectId, slotId) => ({objectKind: "definition", objectId, capabilityId: "pool", slotId, outputId: "pool.current"});
const valueBase = objectId => ({objectKind: "definition", objectId, capabilityId: "value", outputId: "value.base"});

/** Each recipe: {id, steps: [step keys], build(id, text)} returning collections. id(x) makes the object ids unique. */
export const RECIPES = Object.freeze([
  {id: "weaponAmmo", steps: ["Type", "Weapon", "Condition", "Cost", "Action"], build: (id, text) => ({
    definitionTypes: [type(id("weapon"), text("Weapon.Type"), ["pool"])],
    definitions: [definition(id("bow"), id("weapon"), text("Weapon.Bow"), ["pool"], {pool: [pool("ammo", 20)]})],
    conditions: [{id: id("has-ammo"), ...meta(10, text("Weapon.HasAmmo")), expression: {type: "gt", left: ref(id("bow"), "pool", "pool.current", "ammo"), right: lit(0)}}],
    effects: [{id: id("spend-ammo"), ...meta(10, text("Weapon.SpendAmmo")), targetRef: poolCurrent(id("bow"), "ammo"), targetRole: "self", operation: "subtract", operand: {kind: "literal", value: 1}}],
    actions: [{id: id("shoot"), ...meta(10, text("Weapon.Shoot")), conditionRefs: [id("has-ammo")], costEffectRefs: [id("spend-ammo")], effectRefs: [], testRef: null, outcomeMappings: [], eventTypeRefs: []}]
  })},
  {id: "consumable", steps: ["Type", "Doses", "Vitality", "CostAndEffect", "Action"], build: (id, text) => ({
    definitionTypes: [type(id("resource"), text("Consumable.Type"), ["pool"])],
    definitions: [
      definition(id("potion"), id("resource"), text("Consumable.Potion"), ["pool"], {pool: [pool("doses", 3)]}),
      definition(id("vitality"), id("resource"), text("Consumable.Vitality"), ["pool"], {pool: [pool("hp", 12, 6)]})
    ],
    conditions: [{id: id("has-dose"), ...meta(10, text("Consumable.HasDose")), expression: {type: "gt", left: ref(id("potion"), "pool", "pool.current", "doses"), right: lit(0)}}],
    effects: [
      {id: id("use-dose"), ...meta(10, text("Consumable.UseDose")), targetRef: poolCurrent(id("potion"), "doses"), targetRole: "self", operation: "subtract", operand: {kind: "literal", value: 1}},
      {id: id("heal"), ...meta(20, text("Consumable.Heal")), targetRef: poolCurrent(id("vitality"), "hp"), targetRole: "self", operation: "add", operand: {kind: "literal", value: 4}}
    ],
    actions: [{id: id("drink"), ...meta(10, text("Consumable.Drink")), conditionRefs: [id("has-dose")], costEffectRefs: [id("use-dose")], effectRefs: [id("heal")], testRef: null, outcomeMappings: [], eventTypeRefs: []}]
  })},
  {id: "xpProgression", steps: ["Type", "Experience", "Level", "Gain", "Action"], build: (id, text) => ({
    definitionTypes: [type(id("progress"), text("Xp.Type"), ["value"])],
    definitions: [definition(id("experience"), id("progress"), text("Xp.Experience"), ["value"])],
    parameters: [{id: id("xp-per-level"), ...meta(10, text("Xp.PerLevel")), valueType: "integer", nullable: false, value: 1000, scope: "ruleset"}],
    formulas: [{id: id("level"), ...meta(10, text("Xp.Level")), resultType: "integer", expression: {type: "add", args: [{type: "floor", value: {type: "divide", args: [ref(id("experience"), "value", "value.final"), {type: "parameter", id: id("xp-per-level")}]}}, lit(1)]}}],
    effects: [{id: id("gain-xp"), ...meta(10, text("Xp.Gain")), targetRef: valueBase(id("experience")), targetRole: "self", operation: "add", operand: {kind: "literal", value: 250}}],
    actions: [{id: id("award-xp"), ...meta(10, text("Xp.Award")), conditionRefs: [], costEffectRefs: [], effectRefs: [id("gain-xp")], testRef: null, outcomeMappings: [], eventTypeRefs: []}]
  })},
  {id: "encumbrance", steps: ["Type", "Strength", "Load", "Capacity", "Overloaded"], build: (id, text) => ({
    definitionTypes: [type(id("attribute"), text("Encumbrance.Type"), ["value"])],
    definitions: [
      definition(id("strength"), id("attribute"), text("Encumbrance.Strength"), ["value"]),
      definition(id("load"), id("attribute"), text("Encumbrance.Load"), ["value"])
    ],
    parameters: [{id: id("capacity-per-strength"), ...meta(10, text("Encumbrance.PerStrength")), valueType: "integer", nullable: false, value: 10, scope: "ruleset"}],
    formulas: [{id: id("capacity"), ...meta(10, text("Encumbrance.Capacity")), resultType: "number", expression: {type: "multiply", args: [ref(id("strength"), "value", "value.final"), {type: "parameter", id: id("capacity-per-strength")}]}}],
    conditions: [{id: id("overloaded"), ...meta(10, text("Encumbrance.Overloaded")), expression: {type: "gt", left: ref(id("load"), "value", "value.final"), right: {type: "formula", id: id("capacity")}}}]
  })}
]);

export const getRecipe = recipeId => RECIPES.find(recipe => recipe.id === recipeId) ?? null;

const prefix = recipeId => recipeId.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`);

/** Collections to write for applying a recipe to a Ruleset: existing entries plus the recipe's, ids made unique. */
export function planRecipe(ruleset, recipeId, text = key => key) {
  const recipe = getRecipe(recipeId);
  if (!recipe) throw new Error(`Unknown recipe: ${recipeId}.`);
  const taken = new Set(COLLECTION_FIELDS.flatMap(collection => (ruleset?.[collection] ?? []).map(entry => entry?.id)));
  let built;
  for (let n = 1; ; n++) {
    const id = local => `${prefix(recipe.id)}-${local}${n > 1 ? `-${n}` : ""}`;
    built = recipe.build(id, key => text(`RTA.Recipe.${recipe.id}.Objects.${key}`));
    if (!Object.values(built).flat().some(entry => taken.has(entry.id))) break;
  }
  const patch = {}, created = [];
  for (const [collection, entries] of Object.entries(built)) {
    const prepared = entries.map(entry => {
      if (collection === "definitions") return {...entry, slots: prepareDefinitionSlots(entry.slots, entry.capabilities)};
      return PREPARERS[collection] ? PREPARERS[collection](entry) : copyJSON(entry);
    });
    patch[collection] = [...copyJSON(ruleset?.[collection] ?? []), ...prepared];
    for (const entry of prepared) created.push({collection, id: entry.id, nameKey: entry.nameKey});
  }
  return {patch, created};
}

/** Every text key a recipe uses, so the UI can localize names before applying it. */
export function recipeTextKeys(recipeId) {
  const recipe = getRecipe(recipeId);
  if (!recipe) throw new Error(`Unknown recipe: ${recipeId}.`);
  const keys = new Set();
  recipe.build(local => local, key => { keys.add(`RTA.Recipe.${recipe.id}.Objects.${key}`); return key; });
  return [...keys];
}

/** View model of the recipe cards: i18n keys only, localized by the template. */
export const recipeCards = (recipes = RECIPES) => recipes.map(recipe => ({
  id: recipe.id, titleKey: `RTA.Recipe.${recipe.id}.Title`, summaryKey: `RTA.Recipe.${recipe.id}.Summary`,
  steps: recipe.steps.map(step => `RTA.Recipe.${recipe.id}.Steps.${step}`)
}));
