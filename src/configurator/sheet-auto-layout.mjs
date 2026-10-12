/* AUTO sheets (CP-14): the layout a Ruleset gets when it has no SheetDefinition for an Actor or an Item,
   and the starting point the sheet editor offers. Built from the Ruleset alone, so it follows its changes.
   Actor: one section per Definition Type, listing the Definitions the Actor holds with what their capabilities give
   (value, pools, active state, collection size), then the Actions a player starts.
   Item: every field of its Content Types. */
import {prepareLayout} from "./layout-contract.mjs";

const enabled = entry => entry?.enabled !== false;
const nodeId = (...parts) => parts.join("-").replace(/[^A-Za-z0-9_-]/g, "-").replace(/^[^A-Za-z0-9]+/, "") || "node";
/** Capability outputs a row shows, in this order; the writable ones are edited in place. */
const ROW_OUTPUTS = [
  {capabilityId: "value", outputId: "value.final", write: true},
  {capabilityId: "pool", outputId: "pool.current", write: true},
  {capabilityId: "state", outputId: "state.active", write: true},
  {capabilityId: "collection", outputId: "collection.count", write: false}
];

/** Actions a player starts from a sheet: not a follow-up of another Action, a Trigger, a Table, an acquisition or a Progression. */
export function sheetActionIds(ruleset) {
  const followUps = new Set();
  for (const action of ruleset.actions ?? []) {
    for (const mapping of action.outcomeMappings ?? []) for (const id of [...(mapping?.actionRefs ?? []), ...(mapping?.choice?.actionRefs ?? [])]) followUps.add(id);
    for (const id of action.reroll?.actionRefs ?? []) followUps.add(id);
  }
  for (const trigger of ruleset.triggers ?? []) for (const id of trigger.actionRefs ?? []) followUps.add(id);
  for (const table of ruleset.tables ?? []) for (const row of table.rows ?? []) for (const id of row.actionRefs ?? []) followUps.add(id);
  for (const entry of [...(ruleset.definitions ?? []), ...(ruleset.contentTemplates ?? []), ...(ruleset.contentTypes ?? [])]) if (entry?.acquisitionActionRef) followUps.add(entry.acquisitionActionRef);
  for (const system of ruleset.progressionSystems ?? []) for (const advancement of system.advancements ?? []) if (advancement?.actionRef) followUps.add(advancement.actionRef);
  return (ruleset.actions ?? []).filter(action => enabled(action) && !followUps.has(action.id) && !action.reroll).map(action => action.id);
}

function actorLayout(ruleset) {
  const shared = new Set([...(ruleset.sharedDefinitions?.world ?? []), ...(ruleset.sharedDefinitions?.combat ?? [])]);
  const sections = [];
  for (const type of ruleset.definitionTypes ?? []) {
    const definitions = (ruleset.definitions ?? []).filter(d => enabled(d) && d.definitionTypeId === type.id && !shared.has(d.id));
    if (!definitions.length) continue;
    const held = new Set(definitions.flatMap(d => d.capabilities ?? []));
    const values = ROW_OUTPUTS.filter(output => held.has(output.capabilityId)).map(output => ({
      id: nodeId("each", type.id, output.capabilityId), kind: "value",
      source: {kind: "each", capabilityId: output.capabilityId, outputId: output.outputId},
      ...(output.write ? {write: {operation: "set"}} : {})
    }));
    if (!values.length) continue;
    sections.push({id: nodeId("type", type.id), kind: "section", labelKey: type.nameKey ?? type.id, columns: 1, children: [
      {id: nodeId("list", type.id), kind: "repeater", query: {definitionTypeId: type.id}, columns: values.length, children: values}
    ]});
  }
  const actions = sheetActionIds(ruleset).map(id => ({id: nodeId("action", id), kind: "action", actionRef: id}));
  if (actions.length) sections.push({id: "actions", kind: "section", labelKey: "RTA.Sheet.Actions", columns: Math.min(3, actions.length), children: actions});
  return {id: "root", kind: "grid", columns: sections.length > 1 ? 2 : 1, children: sections};
}

function itemLayout(ruleset, contentTypeIds) {
  const types = (ruleset.contentTypes ?? []).filter(type => !contentTypeIds.length || contentTypeIds.includes(type.id));
  const fieldIds = [...new Set(types.flatMap(type => Object.keys(type.fields ?? {})))];
  return {id: "root", kind: "section", labelKey: "", columns: fieldIds.length > 1 ? 2 : 1, children: fieldIds.map(fieldId => ({id: nodeId("field", fieldId), kind: "value", source: {kind: "field", fieldId}, write: {operation: "set"}}))};
}

/** The AUTO layout for an Actor or an Item sheet (contentTypeIds narrows an Item sheet; none means every Content Type). */
export function autoLayout(ruleset, {target = "actor", contentTypeIds = []} = {}) {
  return prepareLayout(target === "item" ? itemLayout(ruleset, contentTypeIds) : actorLayout(ruleset));
}
