/** Form model and reader for a Trigger's event filter: "payload field equals value" rows.
 * Only the fields of the Trigger's Event Type are offered; the value is typed by the field. */

/** Every payload field of every Event Type; the editor enables those of the selected Event Type.
 * An event an Action emits also carries the key of the Action's Outcome (outcomeKey). */
function fieldChoices(eventTypes, eventTypeId, selectedKey, outcomeKeyLabel) {
  return eventTypes.flatMap(type => [...(type.system ? [] : [["outcomeKey", {name: outcomeKeyLabel, valueType: "string"}]]), ...Object.entries(type.payloadFields ?? {})].map(([id, field]) => ({
    id, label: field.name ?? id, eventTypeId: type.id, valueType: field.valueType ?? "string",
    selected: type.id === eventTypeId && id === selectedKey, disabled: type.id !== eventTypeId
  })));
}

export function triggerFilterContext(data, {eventTypes = [], outcomeKeyLabel = "Outcome key"} = {}) {
  const matches = Object.entries(data.eventFilter?.payloadMatches ?? {});
  return {
    triggerFilterRows: matches.map(([key, value]) => ({key, valueText: String(value), fieldChoices: fieldChoices(eventTypes, data.eventTypeId, key, outcomeKeyLabel)})),
    newTriggerFilterRow: {key: "", valueText: "", fieldChoices: fieldChoices(eventTypes, data.eventTypeId, null, outcomeKeyLabel), isNew: true}
  };
}

/** A typed value from the text of a field (a filter value, a fixed payload value). */
export const typedLiteral = (valueType, text) => valueType === "number" || valueType === "integer" ? Number(text)
  : valueType === "boolean" ? text.trim().toLowerCase() === "true" : text;

/** rows: [data-trigger-filter-row] elements. No complete row means no filter. */
export function collectTriggerFilter(rows) {
  const payloadMatches = {};
  for (const row of rows) {
    const select = row.querySelector("[data-filter-field]"), option = select?.selectedOptions?.[0], text = String(row.querySelector("[data-filter-value]")?.value ?? "");
    if (!select?.value || option?.disabled) continue;
    payloadMatches[select.value] = typedLiteral(option?.dataset.valueType, text);
  }
  return Object.keys(payloadMatches).length ? {payloadMatches} : null;
}
