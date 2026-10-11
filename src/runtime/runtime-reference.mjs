/* RuntimeReference (CP-24): a logical Reference read or written on one
   container. The container is an EvaluationContext role ("self", "target",
   any declared role) or an explicit RuntimeContainerRef; never a raw Foundry
   UUID inside a Ruleset. */
import {isRecord} from "../configurator/configurator-schema.mjs";
import {normalizeRuntimeContainerRef} from "./runtime-contracts.mjs";

const ROLE = /^[A-Za-z][A-Za-z0-9_-]*$/;

export const isRuntimeReference = value => isRecord(value) && isRecord(value.reference) && Object.hasOwn(value, "container");

/** {container, reference} from a RuntimeReference, or from a logical Reference read on `role`. */
export function toRuntimeReference(target, role = "self") {
  const runtime = isRuntimeReference(target) ? target : {container: role, reference: target};
  return prepareRuntimeReference({...runtime, container: runtime.container ?? role});
}

export function prepareRuntimeReference({container, reference} = {}) {
  if (!isRecord(reference) || typeof reference.objectKind !== "string" || typeof reference.objectId !== "string") throw new Error("RuntimeReference.reference must be a logical Reference.");
  if (typeof container === "string") {
    if (!ROLE.test(container)) throw new Error(`RuntimeReference.container is not a valid role: ${container}.`);
    return {container, reference};
  }
  if (!isRecord(container)) throw new Error("RuntimeReference.container must be a role or a RuntimeContainerRef.");
  return {container: normalizeRuntimeContainerRef(container), reference};
}

/** The physical container and the role its derived values are computed for. */
export function resolveContainer({container}, context) {
  if (typeof container !== "string") return {containerRef: normalizeRuntimeContainerRef(container), role: "self", context: {...context, roles: {...context?.roles, self: container}}};
  const ref = context?.roles?.[container];
  if (!ref) throw new Error(`EvaluationContext role is missing: ${container}.`);
  return {containerRef: normalizeRuntimeContainerRef(ref), role: container, context};
}
