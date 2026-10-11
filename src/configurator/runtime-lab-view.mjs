/* Runtime Lab presentation: selection defaults and readable result cards.
   Pure functions; the configurator supplies translation and naming. */

/** Unset choices (null) default to an entry; an explicit "" stays cleared;
 *  a choice whose entry disappeared falls back like an unset one. */
export function applyRuntimeChoice(selection, key, list, {fallbackIndex = 0, idOf = entry => entry.id} = {}) {
  const current = selection[key];
  const known = list.some(entry => idOf(entry) === current);
  if (current === null || current === undefined || (current !== "" && !known)) {
    selection[key] = list.length ? idOf(list[Math.min(fallbackIndex, list.length - 1)]) : null;
  }
  return selection[key] || "";
}

const row = (label, value) => ({label, value: value === null || value === undefined || value === "" ? "—" : String(value)});

/** A result card: {title, tone, message, rows, changes, triggered}.
 *  tone is success | failure | info | error; i18n(key, data) translates. */
export function describeRuntimeResult(kind, data, {i18n = key => key, nameOf = (_collection, id) => id} = {}) {
  const card = (titleKey, extra = {}) => ({title: i18n(`RTA.Lab.Result.${titleKey}`), tone: "info", message: "", rows: [], changes: [], triggered: [], ...extra});
  switch (kind) {
    case "test": {
      const outcome = data.outcome ? nameOf("outcomes", data.outcome.id) : i18n("RTA.Lab.NoOutcome");
      return card("Test", {
        tone: data.outcome ? "success" : "info",
        message: outcome,
        rows: [
          row(i18n("RTA.Lab.Roll"), data.roll ? `${data.roll.formula} → ${data.roll.total}` : null),
          ...Object.entries(data.inputs ?? {}).map(([id, value]) => row(id, value)),
          row(i18n("RTA.Lab.Bonus"), data.bonus),
          row(i18n("RTA.Lab.Total"), data.total),
          row(i18n("RTA.Lab.Difficulty"), data.target),
          row(i18n("RTA.Lab.Margin"), data.margin)
        ]
      });
    }
    case "formula": return card("Formula", {message: String(data.value)});
    case "condition": return card("Condition", {tone: data.value ? "success" : "failure", message: i18n(data.value ? "RTA.Lab.True" : "RTA.Lab.False")});
    case "action": {
      if (data.allowed === false) {
        const reason = data.reason === "condition" ? i18n("RTA.Lab.BlockedByCondition", {name: nameOf("conditions", data.conditionId)}) : i18n("RTA.Lab.BlockedByOutcome");
        return card(data.preview ? "ActionPreview" : "ActionExecuted", {tone: "failure", message: reason});
      }
      const changes = (data.changes ?? []).map(change => ({name: nameOf("effects", change.effectId), before: JSON.stringify(change.before ?? null), after: JSON.stringify(change.after ?? null)}));
      return card(data.preview ? "ActionPreview" : "ActionExecuted", {
        tone: "success",
        message: i18n(changes.length ? "RTA.Lab.ChangeCount" : "RTA.Lab.NoChange", {count: changes.length}),
        changes
      });
    }
    case "event": {
      const triggered = (data.triggered ?? []).map(entry => nameOf("triggers", entry.triggerId));
      return card("Event", {tone: triggered.length ? "success" : "info", message: i18n("RTA.Lab.TriggerCount", {count: triggered.length}), triggered});
    }
    case "roll": return card("Roll", {message: `${data.formula} = ${data.total}`, rows: [row(i18n("RTA.Lab.Dice"), data.result)]});
    case "actorsReady": return card("ActorsReady", {tone: "success", message: i18n("RTA.Lab.ActorsReadyMessage", {source: data.source, target: data.target, count: data.created})});
    case "initialized": return card("Initialized", {tone: "success", message: i18n("RTA.Lab.InitializedMessage", {count: data.created, actors: data.actors})});
    case "reset": return card("Reset", {tone: "success", message: i18n("RTA.Lab.ResetMessage", {count: data.created, actors: data.actors})});
    case "saved": return card("Saved", {tone: "success", message: i18n("RTA.Lab.SavedMessage", {name: data.name})});
    case "error": return card("Error", {tone: "error", message: data.message});
    default: return card("Error", {tone: "error", message: String(kind)});
  }
}
