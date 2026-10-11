/** Stable RTA identity and compatibility boundaries.
 * Legacy identifiers are deliberately retained only where persisted data or public integrations depend on them.
 */
export const MODULE_ID = "rule-them-all";
export const RULESET_PACKAGE_FORMAT = "rta-ruleset";
export const LEGACY_RULESET_PACKAGE_FORMAT = "rwf-ruleset";
export const RULESET_PACKAGE_FORMAT_VERSION = 3;
export const RULESET_PACKAGE_FORMATS = Object.freeze([RULESET_PACKAGE_FORMAT, LEGACY_RULESET_PACKAGE_FORMAT]);
// Existing hook names are public integration points; never silently rename them.
export const RUNTIME_HOOKS = Object.freeze({testResolved:"rwfTestResolved", event:"rwfEvent", actionExecuted:"rwfActionExecuted"});
