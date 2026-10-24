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

/** Version of the public API (game.ruleThemAll, docs/architecture.md §6), semantic: the major goes up when a stable
 * member is removed or changes incompatibly (a CHANGELOG "Breaking" line says how to adapt), the minor when one is
 * added. It is independent of the module's version. */
export const API_VERSION = "1.0.0";
/** What other modules may rely on until the next API major. Anything else (other members of game.ruleThemAll, the
 * module's files, its flags and settings, its CSS) is internal and may change in any release.
 * configurator also offers, for each entry collection, get<Kind>, list<Collection>, create<Kind> (registerDefinitionType
 * for Definition Types), update<Kind> and delete<Kind>: they are stable too. */
export const STABLE_API = Object.freeze({
  members: Object.freeze(["apiVersion", "configurator", "configuratorReady", "runtime", "chat", "registries"]),
  configurator: Object.freeze(["listRulesetFamilies", "listRulesetVersions", "getRulesetVersion", "getRuleset", "getPublishedRuleset", "getActiveVersionId", "setActiveVersionId", "createRuleset", "publishRuleset", "validateRuleset", "diagnoseRuleset", "analyzeChangeImpact", "exportRuleset", "importRuleset", "listPartDependencies", "exportRulesetPart", "planRulesetPartImport", "importRulesetPart", "planExtensionInstall", "installExtension", "removeExtension", "subscribe"]),
  runtime: Object.freeze(["getContainerState", "describeContainer", "initializeContainer", "setDefinitionState", "writeSheetValue", "projectSheet", "evaluateFormula", "evaluateCondition", "roll", "executeTest", "previewAction", "describeActionInputs", "executeAction", "emitEvent", "rollInitiative", "describeShared", "setSharedValue", "tokenBarValue", "advance", "acquire", "getLedger", "compensate"]),
  chat: Object.freeze(["postActionCard"]),
  registries: Object.freeze(["valueTypes", "formulaNodes", "effectOperations"]),
  hooks: Object.freeze(["ruleThemAllInit", REGISTER_TYPES_HOOK, "ruleThemAllReady", ...Object.values(RUNTIME_HOOKS), "ruleThemAllCreationCompleted", "ruleThemAllContentAcquired", "ruleThemAllContentReleased", "ruleThemAllContentLibrariesSynchronized"])
});
