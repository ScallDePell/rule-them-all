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
      // What decided the changes: the Test (per target when there are several), the Table row, the Actions that followed.
      const outcomeOf = test => test?.outcome ? `${nameOf("outcomes", test.outcome.id)} (${test.total})` : null;
      const followed = list => (list ?? []).filter(follow => follow.allowed).flatMap(follow => [nameOf("actions", follow.actionId), ...followed(follow.followUps)]);
      const after = followed([...(data.followUps ?? []), ...(data.targets ?? []).flatMap(run => run.followUps ?? [])]);
      const rows = [
        ...(data.testResult ? [row(i18n("RTA.Lab.Outcome"), outcomeOf(data.testResult))] : []),
        ...(data.targets ?? []).map(run => row(i18n("RTA.Lab.TargetOutcome", {name: run.target?.id ?? ""}), run.allowed ? outcomeOf(run.testResult) ?? "✓" : i18n("RTA.Lab.BlockedByOutcome"))),
        ...(data.tableResult ? [row(nameOf("tables", data.tableResult.tableId), `${data.tableResult.total} → ${data.tableResult.row?.labelKey || data.tableResult.row?.id || "—"}`)] : []),
        ...(after.length ? [row(i18n("RTA.Lab.FollowUps"), after.join(", "))] : []),
        ...(data.rerollCount ? [row(i18n("RTA.Lab.RerollCount"), data.rerollCount)] : [])
      ];
      return card(data.preview ? "ActionPreview" : "ActionExecuted", {
        tone: "success",
        message: i18n(changes.length ? "RTA.Lab.ChangeCount" : "RTA.Lab.NoChange", {count: changes.length}),
        rows,
        changes
      });
    }
    case "progression": return data.allowed === false
      ? card("Progression", {tone: "failure", message: i18n(`RTA.Lab.AdvanceRefused.${data.reason}`)})
      : card("Progression", {tone: "success", message: `${data.name ?? data.definitionId}: ${data.before} → ${data.after}`, rows: [row(i18n("RTA.Lab.Cost"), data.cost)]});
    case "milestones": return card("Milestones", {tone: data.applied.length ? "success" : "info",
      message: i18n("RTA.Lab.MilestonesApplied", {count: data.applied.length}),
      rows: data.stopped ? [row(i18n("RTA.Lab.MilestoneStopped"), data.stopped.milestoneId)] : []});
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

/** Progression tool rows: one per Definition an advancement can raise (with its next cost), one per milestone,
 *  and the choices a reached milestone still asks for. chosen: the Lab's answers, "<milestoneId>|<inputId>" -> value. */
export function progressionLabRows(described, {nameOf = id => id, text = key => key, i18n = key => key, chosen = {}} = {}) {
  const advances = described.advancements.flatMap(advancement => advancement.targets.map(target => ({
    advancementId: advancement.id, definitionId: target.definitionId, name: `${text(advancement.labelKey)} · ${nameOf(target.definitionId)}`,
    detail: `${target.current} → ${target.next} · ${i18n("RTA.Lab.Cost")} ${target.cost}`, allowed: target.allowed,
    reason: target.allowed ? "" : i18n(`RTA.Lab.AdvanceRefused.${target.reason}`)
  })));
  const milestones = described.milestones.map(milestone => ({
    name: text(milestone.labelKey), state: i18n(milestone.applied ? "RTA.Lab.MilestoneApplied" : milestone.reached ? "RTA.Lab.MilestoneReached" : "RTA.Lab.MilestoneNotReached"),
    inputs: milestone.applied || !milestone.reached ? [] : milestone.inputs.map(input => {
      const key = `${milestone.id}|${input.id}`, value = String(chosen[key] ?? "");
      return {key, name: text(input.labelKey), options: [{value: "", name: "—", selected: value === ""}, ...input.options.map(option => ({value: String(option.value), name: text(option.labelKey || String(option.value)), selected: String(option.value) === value}))]};
    })
  }));
  return {advances, milestones, canApply: described.milestones.some(milestone => milestone.reached && !milestone.applied)};
}
