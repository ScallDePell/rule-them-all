/** Stable RTA identity. The module only ever writes RTA identifiers. */
export const MODULE_ID = "rule-them-all";
export const RULESET_PACKAGE_FORMAT = "rta-ruleset";
export const RULESET_PACKAGE_FORMAT_VERSION = 3;
export const RULESET_PACKAGE_FORMATS = Object.freeze([RULESET_PACKAGE_FORMAT]);
export const READABLE_PACKAGE_FORMATS = RULESET_PACKAGE_FORMATS;
// Foundry hooks, named like ruleThemAllInit / ruleThemAllReady.
export const RUNTIME_HOOKS = Object.freeze({testResolved:"ruleThemAllTestResolved", event:"ruleThemAllEvent", actionExecuted:"ruleThemAllActionExecuted", ledgerEntry:"ruleThemAllLedgerEntry", reactionOffered:"ruleThemAllReactionOffered", choiceOffered:"ruleThemAllChoiceOffered"});
/** Fired once on Foundry "setup" with the open engine registries
 * ({valueTypes, formulaNodes, effectOperations}); other modules register their types there. */
export const REGISTER_TYPES_HOOK = "ruleThemAllRegisterTypes";
