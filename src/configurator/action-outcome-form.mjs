/** Form model and reader for "what the Action does on each Outcome of its Test".
 * One row per Outcome of every Test; the editor shows the rows of the selected Test.
 * A row keeps the Action's own Effects, runs other Effects, or stops the Action. */

const MODES = Object.freeze(["default", "effects", "block"]);

function outcomeIds(test) {
  return [...new Set([...(test.outcomeRefs ?? []), ...(test.fallbackOutcomeRef ? [test.fallbackOutcomeRef] : [])])];
}

export function outcomeMappingContext(data, {tests = [], outcomes = [], effects = [], withColors = () => ({})} = {}) {
  const byId = new Map(outcomes.map(outcome => [outcome.id, outcome]));
  const groups = tests.map(test => ({
    testId: test.id, shown: test.id === data.testRef,
    rows: outcomeIds(test).filter(id => byId.has(id)).map(id => {
      const outcome = byId.get(id);
      const mapping = (data.outcomeMappings ?? []).find(m => m?.outcomeId === id || (!m?.outcomeId && m?.resultKey === outcome.resultKey));
      const mode = mapping?.block === true ? "block" : Array.isArray(mapping?.effectRefs) ? "effects" : "default";
      return {outcomeId: id, label: outcome.nameKey, ...withColors("outcome", outcome), showEffects: mode === "effects",
        modeChoices: MODES.map(m => ({id: m, labelKey: `RTA.OutcomeMapping.${m}`, selected: m === mode})),
        effectChoices: effects.map(x => ({id: x.id, label: x.nameKey, ...withColors("effect", x), selected: (mapping?.effectRefs ?? []).includes(x.id)}))};
    })
  })).filter(group => group.rows.length);
  return {outcomeMappingGroups: groups, hasOutcomeMappings: groups.some(group => group.shown)};
}

/** rows: the [data-outcome-mapping] rows of the selected Test. Rows left on "default" store nothing. */
export function collectOutcomeMappings(rows) {
  const mappings = [];
  for (const row of rows) {
    const mode = row.querySelector("[data-mapping-mode]")?.value ?? "default", outcomeId = row.dataset.outcomeMapping;
    if (mode === "block") mappings.push({outcomeId, block: true});
    if (mode === "effects") mappings.push({outcomeId, effectRefs: [...row.querySelectorAll("[data-mapping-effect]:checked")].map(input => input.value)});
  }
  return mappings;
}
