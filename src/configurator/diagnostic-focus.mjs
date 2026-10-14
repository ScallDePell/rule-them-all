/* From a diagnostic to the editor field that fixes it. A diagnostic path such
   as "formulas[3].expression.args[1].reference" names the object (formulas[3])
   and, inside it, the property. The editor resolves the property to a control
   with diagnosticFocusTargets(); pure, no DOM. */

const OBJECT = /^([A-Za-z]+)\[(\d+)\]\.?/;

/** The path inside the object: "formulas[3].expression.args[1]" -> "expression.args[1]". */
export const pathInObject = path => String(path ?? "").replace(OBJECT, "");

/** Which editor opens for a diagnostic: {kind, id}, or null when nothing can be opened. */
export function diagnosticEditor(diagnostic, versionId) {
  if (!diagnostic) return null;
  if (diagnostic.objectKind === "ruleset" || !OBJECT.test(String(diagnostic.path ?? ""))) return {kind: "ruleset", id: versionId};
  return diagnostic.objectId ? {kind: diagnostic.objectKind, id: diagnostic.objectId} : null;
}

const css = value => String(value).replace(/["\\]/g, "\\$&");

/** Candidate {selector, index} targets, most precise first. index picks the nth match. */
export function diagnosticFocusTargets(kind, relativePath) {
  const path = String(relativePath ?? "");
  const segments = path.split(/\.|\[|\]/).filter(Boolean);
  const [first = "", second = ""] = segments;
  const targets = [];
  const add = (selector, index = 0) => targets.push({selector, index});
  // Formula/Condition builders: each slot and table row carries its path in the expression, the nearest one is focused.
  if (first === "expression") {
    const parts = path.replace(/^expression\.?/, "").split(".").filter(Boolean);
    for (let n = parts.length; n > 0; n--) add(`[data-expr-path="${css(parts.slice(0, n).join("."))}"]`);
    add(kind === "condition" ? '[name="conditionOperator"]' : '[name="formulaOperator"]');
    add('[name="expressionJson"]');
  }
  // Effects keep their operand in dedicated controls.
  if (first === "operand") add(second === "reference" ? '[name="operandReference"]' : '[name="operandKind"]');
  if (first === "valueSource") add('[name="genericJson"]');
  // Definitions: typed data fields and capability slots.
  if (first === "data" && second) add(`[data-definition-field="${css(second)}"]`);
  if (first === "slots" && second) {
    const slot = /^slots\.(pool|collection)\[(\d+)\]/.exec(path);
    add(`[data-slot-card="${css(second)}"]`, slot ? Number(slot[2]) : 0);
  }
  if (first === "capabilities") add('[name^="cap:"]');
  if (first === "inputBindings") add("[data-test-input]", Number(second) || 0);
  if (first) {
    add(`[name="${css(first)}"]`);
    add(`[data-step-prop="${css(first)}"]`);
  }
  // Editors without a dedicated control keep the raw JSON.
  add('[name="genericJson"]');
  return targets;
}

const MESSAGE_PATH = /^[A-Z][A-Za-z]*\.([A-Za-z]+(?:\[\d+\])?(?:\.[A-Za-z]+(?:\[\d+\])?)*)/;

/** Path, inside the edited object, of the first blocking problem a refused save reports; null when none applies. */
export function saveErrorFocusPath(error, {kind, id} = {}) {
  const diagnostics = error?.validation?.errors ?? [];
  const own = diagnostics.find(d => d.objectKind === kind && (!id || d.objectId === id)) ?? (kind === "ruleset" ? diagnostics.find(d => d.objectKind === "ruleset") : null);
  if (own) {
    const relative = pathInObject(own.path);
    const fromMessage = MESSAGE_PATH.exec(String(own.message ?? ""))?.[1];
    return relative || fromMessage || "";
  }
  if (diagnostics.length) return null;
  return MESSAGE_PATH.exec(String(error?.message ?? ""))?.[1] ?? null;
}
