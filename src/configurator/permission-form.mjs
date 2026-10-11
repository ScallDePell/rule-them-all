/** Form model and reader for the Permission editor: a scope select and one row per rule.
 * Pure: the editor passes the catalogs in and the DOM rows out. */
import {PERMISSION_OPERATIONS, PERMISSION_ROLES, OWNERSHIP_LEVELS} from "./permission-contract.mjs";

const scopeToken = scope => scope?.objectKind && scope.objectKind !== "ruleset" ? `${scope.objectKind}:${scope.objectId ?? ""}` : "ruleset";
export function parseScopeToken(token) {
  const [objectKind, objectId = ""] = String(token || "ruleset").split(":");
  return objectKind === "ruleset" ? {objectKind} : {objectKind, objectId: objectId || null};
}

/** The scopes the engine checks: the whole Ruleset, Definitions (read, write) and Actions (execute). */
function scopeChoices(scope, {definitions = [], actions = [], withColors = () => ({})}) {
  const current = scopeToken(scope), row = (token, labelKey, name = "", extra = {}) => ({token, labelKey, name, selected: token === current, ...extra});
  return [row("ruleset", "RTA.Permission.ScopeRuleset"),
    row("definition:", "RTA.Permission.ScopeAllDefinitions"), ...definitions.map(x => row(`definition:${x.id}`, "RTA.Permission.ScopeDefinition", x.nameKey, withColors("definition", x))),
    row("action:", "RTA.Permission.ScopeAllActions"), ...actions.map(x => row(`action:${x.id}`, "RTA.Permission.ScopeAction", x.nameKey, withColors("action", x)))];
}

export function permissionRuleRow(rule, {conditions = [], withColors = () => ({})} = {}) {
  return {
    id: rule.id, original: JSON.stringify(rule), isAllow: rule.effect === "ALLOW", priority: rule.priority ?? 0, messageKey: rule.messageKey ?? "",
    operationChoices: PERMISSION_OPERATIONS.map(id => ({id, labelKey: `RTA.Permission.Operation.${id}`, selected: (rule.operations ?? []).includes(id)})),
    roleChoices: PERMISSION_ROLES.map(id => ({id, labelKey: `RTA.Permission.Role.${id}`, selected: (rule.roles ?? []).includes(id)})),
    ownershipChoices: [{id: "", labelKey: "RTA.Permission.AnyOwnership", selected: !rule.minimumOwnership},
      ...OWNERSHIP_LEVELS.map(id => ({id, labelKey: `RTA.Permission.Ownership.${id}`, selected: rule.minimumOwnership === id}))],
    conditionChoices: [{id: "", label: "", selected: !rule.conditionRef},
      ...conditions.map(x => ({id: x.id, label: x.nameKey, ...withColors("condition", x), selected: x.id === rule.conditionRef}))]
  };
}

export const NEW_PERMISSION_RULE_ID = "__rta-new-rule__";

export function permissionFormContext(data, catalogs) {
  return {
    permissionScopeChoices: scopeChoices(data.scope, catalogs),
    permissionRuleRows: (data.rules ?? []).map(rule => permissionRuleRow(rule, catalogs)),
    newPermissionRule: {...permissionRuleRow({id: NEW_PERMISSION_RULE_ID, effect: "ALLOW", operations: ["read"]}, catalogs), original: "{}", isNew: true}
  };
}

/** rows: [data-permission-rule] elements, in display order. userIds have no editor and are kept. */
export function collectPermissionRules(rows) {
  return [...rows].map(row => {
    const value = name => row.querySelector(`[data-rule-prop="${name}"]`)?.value ?? "";
    const checked = name => [...row.querySelectorAll(`[data-rule-prop="${name}"]:checked`)].map(input => input.value);
    const original = JSON.parse(row.dataset.ruleOriginal || "{}");
    return {...original, id: row.dataset.ruleId, effect: value("effect") === "ALLOW" ? "ALLOW" : "DENY", operations: checked("operations"), roles: checked("roles"),
      minimumOwnership: value("minimumOwnership") || null, conditionRef: value("conditionRef") || null,
      priority: Number(value("priority")) || 0, messageKey: value("messageKey").trim()};
  });
}
