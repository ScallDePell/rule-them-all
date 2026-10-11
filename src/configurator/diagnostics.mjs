/* Structured validation diagnostics (CP-10). The Core produces them; the UI
   only displays them. A draft may be incomplete: structural problems block
   every scope, completeness problems only block publish and activate. */

export const DIAGNOSTIC_SEVERITIES = Object.freeze(["ERROR", "WARNING", "INFO", "SUGGESTION"]);
export const VALIDATION_SCOPES = Object.freeze(["edit", "save", "publish", "activate"]);
/** Scopes that require a complete, executable graph. */
const COMPLETE_SCOPES = new Set(["publish", "activate"]);

export const INCOMPLETE = "INCOMPLETE";

/** A missing piece a draft may still lack; strict callers receive it as an error. */
export function incompleteError(message) {
  const error = new Error(message);
  error.code = INCOMPLETE;
  return error;
}

/** Completeness requirement: throws INCOMPLETE, or records it when the caller collects them. */
export function need(ok, message, options) {
  if (ok) return true;
  if (Array.isArray(options?.incomplete)) { options.incomplete.push(message); return false; }
  throw incompleteError(message);
}

export function assertValidationScope(scope) {
  if (!VALIDATION_SCOPES.includes(scope)) throw new Error(`Unknown validation scope: ${scope}.`);
  return scope;
}

const singular = collection => collection.replace(/ies$/, "y").replace(/s$/, "");

/** objectKind/objectId of the Ruleset object a path such as "tests[2].rollRef" points into. */
export function locateObject(ruleset, path) {
  const match = /^([A-Za-z]+)\[(\d+)\]/.exec(String(path ?? ""));
  if (!match) return {objectKind: "ruleset", objectId: typeof ruleset?.id === "string" ? ruleset.id : null};
  const entry = Array.isArray(ruleset?.[match[1]]) ? ruleset[match[1]][Number(match[2])] : null;
  return {objectKind: singular(match[1]), objectId: typeof entry?.id === "string" ? entry.id : null};
}

/** Collects diagnostics for one validation run in one scope. */
export class DiagnosticCollector {
  #ruleset;
  #complete;
  constructor(ruleset, scope) {
    this.scope = assertValidationScope(scope);
    this.#ruleset = ruleset;
    this.#complete = COMPLETE_SCOPES.has(scope);
    this.diagnostics = [];
    /** Bound shorthand for structural errors, for helpers that take an issue callback. */
    this.issue = (code, path, message) => this.error(code, path, message);
  }
  add({code, path = "", message, severity = "ERROR", blocking = severity === "ERROR", relatedRefs = [], details}) {
    const diagnostic = {code, severity, messageKey: `RTA.Diagnostic.${code}`, message, ...locateObject(this.#ruleset, path), path, relatedRefs, blocking};
    if (details !== undefined) diagnostic.details = details;
    this.diagnostics.push(diagnostic);
  }
  /** Structural problem: blocks every scope. */
  error(code, path, message, extra = {}) { this.add({...extra, code, path, message}); }
  warning(code, path, message, extra = {}) { this.add({...extra, code, path, message, severity: "WARNING"}); }
  /** Completeness problem: tolerated in a draft, blocking for publish and activate. */
  incomplete(code, path, message, extra = {}) {
    this.add({...extra, code, path, message, severity: this.#complete ? "ERROR" : "WARNING", details: {...extra.details, incomplete: true}});
  }
  /** Route an error thrown by a contract helper. */
  thrown(code, path, error) {
    if (error?.code === INCOMPLETE) this.incomplete(INCOMPLETE, path, error.message);
    else this.error(code, path, error?.message ?? String(error));
  }
  result() {
    const errors = this.diagnostics.filter(entry => entry.blocking);
    const warnings = this.diagnostics.filter(entry => !entry.blocking);
    return {valid: errors.length === 0, scope: this.scope, diagnostics: this.diagnostics, errors, warnings};
  }
}
