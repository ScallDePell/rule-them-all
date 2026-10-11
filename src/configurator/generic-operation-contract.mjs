// Experimental generic operation-plan contract (not a runtime executor).
// No game-specific terminology, and no changes to existing Creation/Progression data.
import {copyJSON, isRecord} from "./configurator-schema.mjs";

export const OPERATION_KINDS = Object.freeze(["choose", "draw", "allocate", "check", "calculate", "assign", "spend", "trigger", "review"]);
const kinds = new Set(OPERATION_KINDS);
const nonempty = x => typeof x === "string" && x.trim().length > 0;

/** Validate a proposed, versioned plan without executing it or mutating its input.
 *  `config` is deliberately opaque until each operation's semantics are specified.
 *  This prevents the validator from silently claiming runtime support.
 */
export function prepareOperationPlan(input) {
  const plan = copyJSON(input);
  if (!isRecord(plan) || plan.contractVersion !== 1 || !Array.isArray(plan.operations))
    throw new Error("Operation plan requires contractVersion 1 and operations array.");
  const seen = new Set();
  for (const [i, op] of plan.operations.entries()) {
    if (!isRecord(op) || !nonempty(op.id) || !kinds.has(op.kind) || !isRecord(op.config))
      throw new Error(`Operation plan operations[${i}] requires id, known kind and config object.`);
    if (seen.has(op.id)) throw new Error(`Duplicate operation id: ${op.id}.`);
    seen.add(op.id);
    if (op.when !== undefined && !(isRecord(op.when) && nonempty(op.when.conditionId)))
      throw new Error(`Operation plan operations[${i}].when requires conditionId.`);
  }
  return plan;
}
