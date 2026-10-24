/* Change impact analysis (CP-31). Before a structural change is written, the
   Core compares the current Ruleset with the candidate and says what the
   change breaks. Pure: no storage, no Foundry. */
import {COLLECTION_FIELDS, copyJSON, isRecord} from "./configurator-schema.mjs";
import {DependencyIndex} from "./dependency-index.mjs";
import {validateRuleset} from "./configurator-validation.mjs";

/** collection -> objectKind ("tags" -> "tag", "permissionPolicies" -> "permissionPolicy", "dice" -> "die"). */
export const kindOfCollection = collection => collection === "dice" ? "die" : collection.replace(/ies$/, "y").replace(/s$/, "");
// Tags name their holders by the collection less its "s", which leaves "dice": read as "die".
const COLLECTION_OF_KIND = new Map([...COLLECTION_FIELDS.map(collection => [kindOfCollection(collection), collection]), ["dice", "dice"]]);
export const collectionOfKind = kind => COLLECTION_OF_KIND.get(kind) ?? null;

const list = value => Array.isArray(value) ? value : [];
const exists = (ruleset, ref) => {
  const collection = collectionOfKind(ref.objectKind);
  return !collection || list(ruleset[collection]).some(entry => entry?.id === ref.objectId);
};
const edgeKey = edge => `${edge.consumerRef.objectKind}|${edge.consumerRef.objectId}|${edge.targetRef.objectKind}|${edge.targetRef.objectId}|${edge.kind}`;
// Paths shift when an earlier entry of the same collection is removed: compare by object, not by index.
const diagnosticKey = d => `${d.code}|${d.objectKind}|${d.objectId}|${String(d.path).replace(/^[A-Za-z]+\[\d+\]/, "")}|${d.message}`;
const TYPE_CODES = /^(REFERENCE_|FORMULA_TYPE|CONDITION_TYPE|EFFECT_|BINDING_TYPE|TEST_TYPE|TEST_INPUT_TYPE|MODIFIER_TYPE|SLOT_|FIELD_)/;

function runtimeImpacts(current, candidate) {
  const impacts = [], next = new Map(list(candidate.definitions).filter(isRecord).map(entry => [entry.id, entry]));
  for (const before of list(current.definitions).filter(isRecord)) {
    const after = next.get(before.id);
    if (!after) { impacts.push({kind: "orphanState", definitionId: before.id}); continue; }
    if (before.enabled !== false && after.enabled === false) impacts.push({kind: "inactiveState", definitionId: before.id});
    for (const capabilityId of list(before.capabilities)) if (!list(after.capabilities).includes(capabilityId)) impacts.push({kind: "capabilityRemoved", definitionId: before.id, capabilityId});
    for (const capabilityId of ["pool", "collection"]) {
      const kept = new Set(list(after.slots?.[capabilityId]).map(slot => slot?.id));
      for (const slot of list(before.slots?.[capabilityId])) if (!kept.has(slot?.id)) impacts.push({kind: "slotRemoved", definitionId: before.id, capabilityId, slotId: slot?.id});
    }
  }
  return impacts;
}

/**
 * ChangeImpactReport for replacing `current` by `candidate`:
 * {brokenReferences, incompatibleConsumers, runtimeImpacts, warnings, blockingDiagnostics, blocking}.
 * Only what the change introduces is reported; problems already present are not.
 */
export function analyzeChangeImpact(current, candidate, {scope = "save"} = {}) {
  const brokenBefore = new Set(new DependencyIndex(current).list().filter(edge => !exists(current, edge.targetRef)).map(edgeKey));
  const brokenReferences = new DependencyIndex(candidate).list()
    .filter(edge => !exists(candidate, edge.targetRef) && !brokenBefore.has(edgeKey(edge)))
    .filter((edge, index, all) => all.findIndex(other => edgeKey(other) === edgeKey(edge)) === index);
  const known = new Set(validateRuleset(current, {scope}).diagnostics.map(diagnosticKey));
  const introduced = validateRuleset(candidate, {scope}).diagnostics.filter(d => !known.has(diagnosticKey(d)) && d.code !== "DEPENDENCY_TARGET");
  const incompatibleConsumers = introduced.filter(d => TYPE_CODES.test(d.code));
  const report = {
    brokenReferences: copyJSON(brokenReferences),
    incompatibleConsumers,
    runtimeImpacts: runtimeImpacts(current, candidate),
    warnings: introduced.filter(d => !d.blocking),
    blockingDiagnostics: introduced.filter(d => d.blocking)
  };
  report.blocking = report.brokenReferences.length > 0 || report.blockingDiagnostics.length > 0;
  return report;
}

/** Set the value at a dependency path ("tests[2].bonusFormulaRef") to null, in place. */
export function clearReferenceAt(ruleset, path) {
  const parts = String(path).match(/[^.[\]]+/g) ?? [];
  const last = parts.pop();
  let node = ruleset;
  for (const part of parts) { node = node?.[/^\d+$/.test(part) ? Number(part) : part]; if (!isRecord(node) && !Array.isArray(node)) throw new Error(`Reference path not found: ${path}.`); }
  if (!Object.hasOwn(node, last)) throw new Error(`Reference path not found: ${path}.`);
  node[last] = null;
}

/** Candidate Ruleset without one object; optional references to it are cleared when asked. */
export function rulesetWithout(ruleset, kind, id, {clearOptionalReferences = false} = {}) {
  const collection = collectionOfKind(kind);
  if (!collection) throw new Error(`Unknown object kind: ${kind}.`);
  const candidate = copyJSON(ruleset);
  if (clearOptionalReferences) {
    for (const edge of new DependencyIndex(ruleset).getConsumers(id, kind)) if (edge.strength === "optional") clearReferenceAt(candidate, edge.path);
  }
  candidate[collection] = list(candidate[collection]).filter(entry => entry?.id !== id);
  return candidate;
}
