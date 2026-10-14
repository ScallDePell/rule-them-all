/** Form model and reader for "what an Action puts in the events it emits": one row per payload field of every
 * Event Type that declares some; the editor shows the rows of the ticked Event Types. A field is left unset,
 * takes a fixed value, or the value of a Formula computed in the Action's context. */
import {typedLiteral} from "./trigger-filter-form.mjs";

const FIXED = "__fixed";

export function eventPayloadContext(data, {eventTypes = [], formulas = [], withColors = () => ({})} = {}) {
  const emitted = new Set(data.eventTypeRefs ?? []);
  const groups = eventTypes.filter(type => Object.keys(type.payloadFields ?? {}).length).map(type => ({
    eventTypeId: type.id, label: type.nameKey, shown: emitted.has(type.id),
    rows: Object.entries(type.payloadFields).map(([fieldId, field]) => {
      const source = data.eventPayloads?.[type.id]?.[fieldId], fixed = Boolean(source) && Object.hasOwn(source, "literal");
      return {fieldId, label: field.name ?? fieldId, valueType: field.valueType ?? "string", fixed, isNumber: ["integer", "number"].includes(field.valueType),
        literalText: fixed ? String(source.literal) : "",
        sourceChoices: [{id: "", labelKey: "RTA.Action.EventValueNone", selected: !source}, {id: FIXED, labelKey: "RTA.DynamicUI.FixedValue", selected: fixed},
          ...formulas.map(x => ({id: x.id, label: x.nameKey, ...withColors("formula", x), selected: x.id === source?.formulaRef}))]};
    })
  }));
  return {eventPayloadGroups: groups, hasEventPayloads: groups.some(group => group.shown)};
}

/** groups: the [data-event-payload-group] elements; emitted: the ticked Event Type ids. Unset fields store nothing. */
export function collectEventPayloads(groups, emitted) {
  const payloads = {};
  for (const group of groups) {
    const eventTypeId = group.dataset.eventPayloadGroup;
    if (!emitted.includes(eventTypeId)) continue;
    const values = {};
    for (const row of group.querySelectorAll("[data-event-payload-field]")) {
      const source = String(row.querySelector("[data-event-payload-source]")?.value ?? "");
      if (!source) continue;
      if (source !== FIXED) { values[row.dataset.eventPayloadField] = {formulaRef: source}; continue; }
      const valueType = row.dataset.valueType, text = String(row.querySelector("[data-event-payload-literal]")?.value ?? ""), literal = typedLiteral(valueType, text);
      if (typeof literal === "number" && (!text.trim() || !Number.isFinite(literal))) throw new Error(`${row.dataset.label ?? row.dataset.eventPayloadField}: the fixed value must be a number.`);
      values[row.dataset.eventPayloadField] = {literal};
    }
    if (Object.keys(values).length) payloads[eventTypeId] = values;
  }
  return payloads;
}
