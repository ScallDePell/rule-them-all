/* Type checks across Ruleset objects (CP-04, CP-05, CP-24). A Formula must
   produce its resultType, a Condition a boolean, and an Effect must write a
   mutable output with an operation and operand of a compatible type. A draft
   may break them (warnings); publish and activate may not. Types the checker
   cannot infer (context paths, unknown nodes) are never reported. */
import {isRecord} from "./configurator-schema.mjs";
import {valueTypeRegistry} from "./value-type-registry.mjs";
import {capabilityTypeRegistry} from "./capability-type-registry.mjs";
import {inferFormulaType, effectOperationRegistry, UNKNOWN_TYPE} from "./operation-registries.mjs";

/** Whether a value of type `source` may go where `target` is expected; unknown passes. */
export const typeCompatible = (source, target) => source === UNKNOWN_TYPE || target === UNKNOWN_TYPE || source === target || valueTypeRegistry.isAssignable(source, target);

const list = value => Array.isArray(value) ? value : [];
const byId = value => new Map(list(value).filter(isRecord).map(entry => [entry.id, entry]));

/** Type lookups over one Ruleset. */
export function rulesetTypes(ruleset) {
  const parameters = byId(ruleset.parameters), formulas = byId(ruleset.formulas);
  /** Capability output contract a logical Reference designates. */
  const output = reference => {
    if (!isRecord(reference)) return null;
    if (reference.objectKind !== "definition" || !reference.capabilityId || !reference.outputId) return null;
    return capabilityTypeRegistry.get(reference.capabilityId)?.outputs?.[reference.outputId] ?? null;
  };
  const referenceType = reference => {
    if (!isRecord(reference)) return UNKNOWN_TYPE;
    if (reference.objectKind === "parameter") return parameters.get(reference.objectId)?.valueType ?? UNKNOWN_TYPE;
    if (reference.objectKind === "formula") return formulas.get(reference.objectId)?.resultType ?? UNKNOWN_TYPE;
    return output(reference)?.valueType ?? UNKNOWN_TYPE;
  };
  const leaf = (kind, target) => {
    if (kind === "parameter") return parameters.get(target)?.valueType ?? UNKNOWN_TYPE;
    if (kind === "formula") return formulas.get(target)?.resultType ?? UNKNOWN_TYPE;
    if (kind === "reference") return referenceType(target);
    return UNKNOWN_TYPE;
  };
  const infer = node => inferFormulaType(node, leaf);
  const operandType = operand => {
    if (!isRecord(operand)) return UNKNOWN_TYPE;
    if (operand.kind === "literal") return infer({type: "literal", value: operand.value});
    if (operand.kind === "parameter") return leaf("parameter", operand.id);
    if (operand.kind === "formula") return leaf("formula", operand.id);
    if (operand.kind === "reference") return referenceType(operand.reference);
    if (operand.kind === "roll") return "number";
    return UNKNOWN_TYPE;
  };
  return {infer, leaf, output, referenceType, operandType};
}

/** Report type problems on a DiagnosticCollector (strict: warning in draft, error at publish). */
export function checkRulesetTypes(ruleset, d) {
  const types = rulesetTypes(ruleset);
  list(ruleset.actions).forEach((action, index) => {
    // CP-28: a StateInstance is a state Definition; a persistent ModifierState changes a value.
    const definitions = new Map(list(ruleset.definitions).map(definition => [definition?.id, definition])), modifiers = new Map(list(ruleset.modifiers).map(modifier => [modifier?.id, modifier]));
    for (const [key, rows] of [["stateApplications", list(action?.stateApplications)], ["stateRemovals", list(action?.stateRemovals)]]) rows.forEach((row, at) => {
      const definition = definitions.get(row?.definitionId);
      if (definition && !list(definition.capabilities).includes("state")) d.strict("STATE_DEFINITION", `actions[${index}].${key}[${at}].definitionId`, `Definition ${definition.id} has no state capability.`);
    });
    const persistent = [...list(action?.modifierApplications).map(row => row?.modifierRef), ...list(action?.stateApplications).flatMap(row => list(row?.modifierRefs))];
    for (const id of persistent) {
      const modifier = modifiers.get(id);
      if (modifier && modifier.targetRef?.capabilityId !== "value") d.strict("MODIFIER_PERSISTENT", `actions[${index}]`, `Modifier ${modifier.id} must target a value output to be applied persistently.`);
    }
  });
  // A grant's config.add raises value.base (RWF: a +1 from several Contents adds up).
  const definitionsById = new Map(list(ruleset.definitions).map(definition => [definition?.id, definition]));
  list(ruleset.contentTemplates).forEach((template, index) => {
    const rows = [...list(template?.relations).map((row, at) => [row, `contentTemplates[${index}].relations[${at}].config.add`]),
      ...list(template?.choiceGroups).flatMap((group, g) => list(group?.options).map((row, at) => [row, `contentTemplates[${index}].choiceGroups[${g}].options[${at}].config.add`]))];
    for (const [row, path] of rows) {
      const add = row?.config?.add;
      if (add === undefined) continue;
      const definition = definitionsById.get(row?.targetRef?.objectId);
      const valid = isRecord(add) && row?.operation === "grant" && row?.targetRef?.objectKind === "definition" && list(definition?.capabilities).includes("value")
        && Object.entries(add).every(([key, value]) => key === "value.base" && Number.isFinite(Number(value)));
      if (!valid) d.strict("GRANT_ADD", path, "config.add only adds numbers to value.base of a granted value Definition.");
    }
  });
  list(ruleset.formulas).forEach((formula, index) => {
    if (!isRecord(formula) || !valueTypeRegistry.has(formula.resultType)) return;
    const actual = types.infer(formula.expression);
    if (!typeCompatible(actual, formula.resultType)) d.strict("FORMULA_TYPE", `formulas[${index}].expression`, `Formula produces ${actual}, not its resultType ${formula.resultType}.`);
  });
  list(ruleset.conditions).forEach((condition, index) => {
    if (!isRecord(condition)) return;
    const actual = types.infer(condition.expression);
    if (!typeCompatible(actual, "boolean")) d.strict("CONDITION_TYPE", `conditions[${index}].expression`, `Condition must produce a boolean, not ${actual}.`);
  });
  const bound = new Set(list(ruleset.formulaBindings).filter(binding => isRecord(binding?.targetRef) && binding.enabled !== false)
    .map(binding => `${binding.targetRef.objectId}/${binding.targetRef.capabilityId}/${binding.targetRef.slotId ?? ""}/${binding.targetRef.outputId}`));
  list(ruleset.effects).forEach((effect, index) => {
    if (!isRecord(effect) || !isRecord(effect.targetRef)) return;
    const path = `effects[${index}]`, target = types.output(effect.targetRef);
    if (!target) return;
    const ref = effect.targetRef;
    if (!target.mutable) d.strict("EFFECT_TARGET", `${path}.targetRef`, `Effect target is not mutable: ${target.id}.`);
    else if (ref && bound.has(`${ref.objectId}/${ref.capabilityId}/${ref.slotId ?? ""}/${ref.outputId}`)) d.strict("EFFECT_TARGET", `${path}.targetRef`, `Effect target is computed by a FormulaBinding: ${target.id}.`);
    const operation = effectOperationRegistry.get(effect.operation);
    if (!operation) return;
    if (!effectOperationRegistry.accepts(operation.id, target.valueType)) d.strict("EFFECT_OPERATION", `${path}.operation`, `Operation ${operation.id} cannot write a ${target.valueType} output.`);
    else if (operation.operand) {
      const actual = types.operandType(effect.operand);
      if (!typeCompatible(actual, target.valueType)) d.strict("EFFECT_OPERAND", `${path}.operand`, `Effect operand is ${actual}, target expects ${target.valueType}.`);
    }
  });
  list(ruleset.formulaBindings).forEach((binding, index) => {
    if (!isRecord(binding)) return;
    const target = types.output(binding.targetRef), actual = types.leaf("formula", binding.formulaRef);
    if (target && !typeCompatible(actual, target.valueType)) d.strict("BINDING_TYPE", `formulaBindings[${index}].formulaRef`, `Formula produces ${actual}, target output expects ${target.valueType}.`);
  });
  list(ruleset.tests).forEach((test, index) => {
    if (!isRecord(test)) return;
    for (const key of ["bonusFormulaRef", "targetFormulaRef", "totalFormulaRef", "marginFormulaRef"]) {
      if (!test[key]) continue;
      const actual = types.leaf("formula", test[key]);
      if (!typeCompatible(actual, "number")) d.strict("TEST_TYPE", `tests[${index}].${key}`, `Test ${key} must produce a number, not ${actual}.`);
    }
    list(test.inputBindings).forEach((input, j) => {
      if (!isRecord(input?.source) || !valueTypeRegistry.has(input.valueType)) return;
      const actual = input.source.formulaRef ? types.leaf("formula", input.source.formulaRef) : isRecord(input.source.reference) ? types.referenceType(input.source.reference) : UNKNOWN_TYPE;
      if (!typeCompatible(actual, input.valueType)) d.strict("TEST_INPUT_TYPE", `tests[${index}].inputBindings[${j}].source`, `Input ${input.id} is ${input.valueType}, its source produces ${actual}.`);
    });
  });
  list(ruleset.modifiers).forEach((modifier, index) => {
    if (!isRecord(modifier)) return;
    const actual = types.operandType(modifier.valueSource);
    if (!typeCompatible(actual, "number")) d.strict("MODIFIER_TYPE", `modifiers[${index}].valueSource`, `Modifier value must be a number, not ${actual}.`);
  });
}
