/* Reference contract (CP-24): a logical Reference stops at the object,
   Capability, slot or output level. The validator checks that each level it
   names exists, and that consumers reading or writing a value designate an
   output of a Definition. */
import {isRecord} from "./configurator-schema.mjs";
import {capabilityTypeRegistry} from "./capability-type-registry.mjs";
import {SLOT_CAPABILITIES, findSlot} from "./capability-slots.mjs";

const nonempty = value => typeof value === "string" && value.trim().length > 0;

/** Dependency kinds whose target is a value: a Definition target must name an output. */
export const VALUE_REFERENCE_KINDS = Object.freeze(["formula", "condition", "bindingTarget", "effectTarget", "effectOperand", "testInput", "modifierValue"]);
const VALUE_KINDS = new Set(VALUE_REFERENCE_KINDS);

/** Check one DependencyIndex edge whose target exists. */
export function checkReferenceLevels(dep, definitionsById, d) {
  const target = dep.targetRef, path = dep.path;
  const hasCapability = nonempty(target.capabilityId), hasOutput = nonempty(target.outputId);
  if (target.objectKind !== "definition") {
    if (hasCapability || hasOutput || nonempty(target.slotId)) d.error("REFERENCE_LEVEL", path, `Only a Definition Reference may name a capability, slot or output (${target.objectKind}/${target.objectId}).`);
    return;
  }
  if (hasOutput && !hasCapability) { d.error("REFERENCE_LEVEL", path, `Reference to output ${target.outputId} requires capabilityId.`); return; }
  if (!hasCapability) {
    if (VALUE_KINDS.has(dep.kind)) d.incomplete("REFERENCE_LEVEL", path, `Reference to ${target.objectId} must designate an output.`);
    return;
  }
  const capability = capabilityTypeRegistry.get(target.capabilityId);
  if (!capability) { d.error("REFERENCE_CAPABILITY", path, `Unknown CapabilityType: ${target.capabilityId}.`); return; }
  const definition = definitionsById.get(target.objectId);
  if (!(definition?.capabilities ?? []).includes(target.capabilityId)) { d.error("REFERENCE_CAPABILITY", path, `Definition ${target.objectId} does not have capability ${target.capabilityId}.`); return; }
  if (SLOT_CAPABILITIES.includes(target.capabilityId)) {
    if (!nonempty(target.slotId)) d.incomplete("REFERENCE_SLOT", path, `Reference to ${target.objectId}/${target.capabilityId} requires a slot.`);
    else if (!findSlot(definition, target.capabilityId, target.slotId)) d.error("REFERENCE_SLOT", path, `Slot does not exist: ${target.objectId}/${target.capabilityId}/${target.slotId}.`);
  } else if (nonempty(target.slotId)) d.error("REFERENCE_SLOT", path, `Capability ${target.capabilityId} has no slots.`);
  if (hasOutput) {
    if (!capability.outputs?.[target.outputId]) d.error("REFERENCE_OUTPUT", path, `Output does not exist: ${target.capabilityId}/${target.outputId}.`);
  } else if (VALUE_KINDS.has(dep.kind)) d.incomplete("REFERENCE_LEVEL", path, `Reference to ${target.objectId}/${target.capabilityId} must designate an output.`);
}

const scan = (node, path, visit) => {
  if (Array.isArray(node)) { node.forEach((child, i) => scan(child, `${path}[${i}]`, visit)); return; }
  if (!isRecord(node)) return;
  if (node.type === "reference") visit(node, path);
  for (const [key, value] of Object.entries(node)) if (key !== "reference") scan(value, `${path}.${key}`, visit);
};

/** A reference operand the GM has not chosen yet: tolerated in a draft, not at publish. */
export function checkUnsetReferences(ruleset, d) {
  for (const collection of ["formulas", "conditions"]) {
    (Array.isArray(ruleset[collection]) ? ruleset[collection] : []).forEach((entry, index) => scan(entry?.expression, `${collection}[${index}].expression`, (node, path) => {
      if (!nonempty(node.reference?.objectKind) || !nonempty(node.reference?.objectId)) d.incomplete("REFERENCE_UNSET", `${path}.reference`, "Reference operand has no target.");
    }));
  }
}
