/** Stable RTA identity. The module only ever writes RTA identifiers. */
export const MODULE_ID = "rule-them-all";
export const RULESET_PACKAGE_FORMAT = "rta-ruleset";
/** Read-only alias: packages exported before the module was extracted from the
 * original system may still be imported. RTA never writes this format. */
export const IMPORT_ONLY_PACKAGE_FORMAT = "rwf-ruleset";
export const RULESET_PACKAGE_FORMAT_VERSION = 3;
export const RULESET_PACKAGE_FORMATS = Object.freeze([RULESET_PACKAGE_FORMAT]);
export const READABLE_PACKAGE_FORMATS = Object.freeze([RULESET_PACKAGE_FORMAT, IMPORT_ONLY_PACKAGE_FORMAT]);
// Foundry hooks, named like ruleThemAllInit / ruleThemAllReady.
export const RUNTIME_HOOKS = Object.freeze({testResolved:"ruleThemAllTestResolved", event:"ruleThemAllEvent", actionExecuted:"ruleThemAllActionExecuted", ledgerEntry:"ruleThemAllLedgerEntry", reactionOffered:"ruleThemAllReactionOffered", choiceOffered:"ruleThemAllChoiceOffered"});
/** Fired once on Foundry "setup" with the open engine registries
 * ({valueTypes, formulaNodes, effectOperations}); other modules register their types there. */
export const REGISTER_TYPES_HOOK = "ruleThemAllRegisterTypes";
