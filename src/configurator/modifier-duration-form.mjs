/** Form models and readers for the Modifier and Duration editors.
 * Pure: no Foundry window, no saved Ruleset; the editor passes catalogs in. */
import {DURATION_MODES, DURATION_UNITS, MODIFIER_OPERATIONS, STACKING_MODES} from "./rule-contracts.mjs";
import {parseRefToken} from "./reference-token.mjs";

const choices = (ids, current, prefix) => ids.map(id => ({id, labelKey: `${prefix}.${id}`, selected: id === current}));

/** A Modifier changes a value output: target, operation, value source, conditions, stacking. */
export function modifierFormContext(data, {valueTargetChoices = []} = {}) {
  const mode = data.stacking?.mode ?? "stack";
  return {
    modifierOperationChoices: choices(MODIFIER_OPERATIONS, data.operation ?? "add", "RTA.ModifierOperation"),
    stackingModeChoices: choices(STACKING_MODES, mode, "RTA.StackingMode"),
    stackingGroup: data.stacking?.group ?? "", showStackingGroup: mode !== "stack",
    modifierTargetChoices: valueTargetChoices
  };
}

export function collectModifier(fd, current, {bool, checkedIds, operand}) {
  const mode = String(fd.get("stackingMode") ?? "stack");
  return {...current, nameKey: String(fd.get("nameKey") ?? "").trim(), descriptionKey: String(fd.get("descriptionKey") ?? ""),
    enabled: bool("enabled"), targetRef: parseRefToken(fd.get("targetRef")), operation: String(fd.get("operation") ?? "add"),
    valueSource: operand, conditionRefs: checkedIds("conditionRefs"),
    stacking: {mode, group: mode === "stack" ? "" : String(fd.get("stackingGroup") ?? "").trim()},
    priority: Number.parseInt(String(fd.get("priority") ?? "0"), 10) || 0, tags: checkedIds("tags")};
}

/** A Duration shows only the fields of its mode. */
export function durationFormContext(data, {eventTypes = [], conditions = [], withColors = () => ({})} = {}) {
  const mode = data.mode ?? "untilRemoved";
  return {
    durationModeChoices: choices(DURATION_MODES, mode, "RTA.DurationMode"),
    durationUnitChoices: choices(DURATION_UNITS, data.unit ?? "round", "RTA.DurationUnit"),
    durationShows: Object.fromEntries(DURATION_MODES.map(id => [id, id === mode])),
    durationAmount: data.amount ?? "", durationAt: data.at ?? "",
    durationEventChoices: eventTypes.map(x => ({id: x.id, label: x.nameKey, ...withColors("eventType", x), selected: x.id === data.eventTypeRef})),
    durationConditionChoices: conditions.map(x => ({id: x.id, label: x.nameKey, ...withColors("condition", x), selected: x.id === data.conditionRef}))
  };
}

export function collectDuration(fd, current, {bool, checkedIds}) {
  const mode = String(fd.get("durationMode") ?? "untilRemoved"), text = name => String(fd.get(name) ?? "").trim();
  const number = name => text(name) === "" ? null : Number(text(name));
  return {...current, nameKey: text("nameKey"), descriptionKey: String(fd.get("descriptionKey") ?? ""), enabled: bool("enabled"), mode,
    amount: mode === "fixed" ? number("durationAmount") : null, unit: mode === "fixed" ? text("durationUnit") || null : null,
    eventTypeRef: mode === "untilEvent" ? text("durationEventTypeRef") || null : null,
    conditionRef: mode === "whileCondition" ? text("durationConditionRef") || null : null,
    at: mode === "absoluteTime" ? number("durationAt") : null, tags: checkedIds("tags")};
}
