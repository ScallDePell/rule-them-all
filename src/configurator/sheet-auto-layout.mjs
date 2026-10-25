/* AUTO sheets (CP-14): the layout a Ruleset gets when it has no SheetDefinition for an Actor or an Item,
   and the starting point the sheet editor offers. Built from the Ruleset alone, so it follows its changes.
   Actor: one section per Definition Type, listing the Definitions the Actor holds with what their capabilities give
   (value, pools, active state, collection size), then the Contents it holds (its Items), then what it buys with each
   Progression System, then the Actions a player starts.
   Item: every field of its Content Types, then the Actions their Content Templates grant (used from the Item). */
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

/** The Actions Content Templates grant (of these Content Types; none listed: all), by relation or choice option. */
export function contentGrantedActionIds(ruleset, contentTypeIds = []) {
  const ids = new Set();
  for (const template of ruleset.contentTemplates ?? []) {
    if (!enabled(template) || contentTypeIds.length && !contentTypeIds.includes(template.contentTypeId)) continue;
    for (const relation of [...(template.relations ?? []), ...(template.choiceGroups ?? []).flatMap(group => group?.options ?? [])])
      if (relation?.operation === "grant" && relation.targetRef?.objectKind === "action") ids.add(relation.targetRef.objectId);
  }
  return ids;
}

/** Actions a player starts from a sheet: not a follow-up of another Action, a Trigger, a Table, an acquisition or a milestone. */
export function sheetActionIds(ruleset) {
  const followUps = new Set();
  for (const action of ruleset.actions ?? []) {
    for (const mapping of action.outcomeMappings ?? []) for (const id of [...(mapping?.actionRefs ?? []), ...(mapping?.choice?.actionRefs ?? [])]) followUps.add(id);
    for (const id of action.reroll?.actionRefs ?? []) followUps.add(id);
  }
  for (const trigger of ruleset.triggers ?? []) for (const id of trigger.actionRefs ?? []) followUps.add(id);
  for (const table of ruleset.tables ?? []) for (const row of table.rows ?? []) for (const id of row.actionRefs ?? []) followUps.add(id);
  for (const entry of [...(ruleset.definitions ?? []), ...(ruleset.contentTemplates ?? []), ...(ruleset.contentTypes ?? [])]) if (entry?.acquisitionActionRef) followUps.add(entry.acquisitionActionRef);
  for (const system of ruleset.progressionSystems ?? []) for (const milestone of system.milestones ?? []) if (milestone?.actionRef) followUps.add(milestone.actionRef);
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
    // A long list (skills) takes the sheet's whole width, in two columns.
    const long = definitions.length > 6;
    sections.push({id: nodeId("type", type.id), kind: "section", labelKey: type.nameKey ?? type.id, columns: 1, ...(long ? {span: 2} : {}), children: [
      {id: nodeId("list", type.id), kind: "repeater", query: {definitionTypeId: type.id}, columns: long ? 2 : 1, children: values}
    ]});
  }
  // The Actor's Items: what it carries and what made it (a background, a career…). Dropping an Item on the sheet adds one.
  if ((ruleset.contentTypes ?? []).some(type => enabled(type) && type.storageKind !== "actor")) sections.push({id: "contents", kind: "section", labelKey: "RTA.Sheet.Contents", columns: 1, span: 2, children: [{id: "contents-list", kind: "contents"}]});
  for (const system of (ruleset.progressionSystems ?? []).filter(enabled)) sections.push({id: nodeId("progression", system.id), kind: "section", labelKey: system.nameKey ?? system.id, columns: 1, span: 2,
    children: [{id: nodeId("progression", system.id, "purchases"), kind: "progression", progressionSystemRef: system.id}]});
  // An Action a Content grants is used from that Content's Item (a weapon's attack), not from the Actor's buttons.
  const fromContents = contentGrantedActionIds(ruleset);
  const actions = sheetActionIds(ruleset).filter(id => !fromContents.has(id)).map(id => ({id: nodeId("action", id), kind: "action", actionRef: id}));
  if (actions.length) sections.push({id: "actions", kind: "section", labelKey: "RTA.Sheet.Actions", columns: Math.min(4, actions.length), span: 2, children: actions});
  const columns = sections.length > 1 ? 2 : 1;
  return {id: "root", kind: "grid", columns, children: columns === 1 ? sections.map(({span: _span, ...section}) => section) : sections};
}

function itemLayout(ruleset, contentTypeIds) {
  const types = (ruleset.contentTypes ?? []).filter(type => !contentTypeIds.length || contentTypeIds.includes(type.id));
  const fieldIds = [...new Set(types.flatMap(type => Object.keys(type.fields ?? {})))];
  const fields = fieldIds.map(fieldId => ({id: nodeId("field", fieldId), kind: "value", source: {kind: "field", fieldId}, write: {operation: "set"}}));
  // Each Item shows the Actions of its own template only (the sheet leaves out those another template grants).
  const actions = [...contentGrantedActionIds(ruleset, types.map(type => type.id))].filter(id => (ruleset.actions ?? []).some(action => action.id === id && enabled(action)))
    .map(id => ({id: nodeId("action", id), kind: "action", actionRef: id}));
  if (!actions.length) return {id: "root", kind: "section", labelKey: "", columns: fieldIds.length > 1 ? 2 : 1, children: fields};
  return {id: "root", kind: "grid", columns: 1, children: [
    ...(fields.length ? [{id: "fields", kind: "section", labelKey: "", columns: fieldIds.length > 1 ? 2 : 1, children: fields}] : []),
    {id: "actions", kind: "section", labelKey: "RTA.Sheet.Actions", columns: Math.min(4, actions.length), children: actions}]};
}

/** The starting layout of a sheet made for Items of these Content Types (the editor's "Start from the Content Type"):
    one section per Content Type, titled with its name, holding its fields (each shown and edited as its value type
    says; a field two types share is shown once), then the buttons of the Actions their Content Templates grant. The
    standard header already shows the Item's picture and name; actionsLabel titles the Actions (the editor gives it in words). Empty when no Content Type of the Ruleset is given. */
export function contentTypeSheetLayout(ruleset, contentTypeIds = [], {actionsLabel = "RTA.Sheet.Actions"} = {}) {
  const types = (ruleset.contentTypes ?? []).filter(type => contentTypeIds.includes(type.id));
  const seen = new Set(), sections = [];
  for (const type of types) {
    const fieldIds = Object.keys(type.fields ?? {}).filter(fieldId => !seen.has(fieldId));
    fieldIds.forEach(fieldId => seen.add(fieldId));
    if (!fieldIds.length) continue;
    sections.push({id: nodeId("type", type.id), kind: "section", labelKey: type.nameKey || type.id, columns: fieldIds.length > 1 ? 2 : 1,
      children: fieldIds.map(fieldId => ({id: nodeId("field", fieldId), kind: "value", source: {kind: "field", fieldId}, write: {operation: "set"}}))});
  }
  const actions = types.length ? [...contentGrantedActionIds(ruleset, types.map(type => type.id))].filter(id => (ruleset.actions ?? []).some(action => action.id === id && enabled(action)))
    .map(id => ({id: nodeId("action", id), kind: "action", actionRef: id})) : [];
  if (actions.length) sections.push({id: "actions", kind: "section", labelKey: actionsLabel, columns: Math.min(4, actions.length), children: actions});
  return prepareLayout({id: "root", kind: "grid", columns: 1, children: sections});
}

/** The AUTO layout for an Actor or an Item sheet (contentTypeIds narrows an Item sheet; none means every Content Type). */
export function autoLayout(ruleset, {target = "actor", contentTypeIds = []} = {}) {
  return prepareLayout(target === "item" ? itemLayout(ruleset, contentTypeIds) : actorLayout(ruleset));
}

/** The sheet an Actor or an Item of this Content Type shows: the first enabled SheetDefinition for it, else AUTO (id "auto"). */
export function sheetFor(ruleset, {target = "actor", contentTypeId = null} = {}) {
  const found = (ruleset.sheetDefinitions ?? []).find(sheet => enabled(sheet) && sheet.target === target
    && (target !== "item" || !(sheet.contentTypeIds ?? []).length || (sheet.contentTypeIds ?? []).includes(contentTypeId)));
  if (found) return found;
  const contentTypeIds = target === "item" && contentTypeId ? [contentTypeId] : [];
  return {id: "auto", nameKey: "", target, contentTypeIds, root: autoLayout(ruleset, {target, contentTypeIds})};
}

/** The sheet a window shows: the SheetDefinition it was chosen for (Foundry's sheet choice) when this Ruleset still
   has it for this target, otherwise the first that fits (or AUTO). */
export function chosenSheet(ruleset, sheetId, {target, contentTypeId = null}) {
  const sheet = sheetId ? (ruleset.sheetDefinitions ?? []).find(entry => entry.id === sheetId && entry.enabled !== false && entry.target === target
    && (target !== "item" || !(entry.contentTypeIds ?? []).length || (entry.contentTypeIds ?? []).includes(contentTypeId))) : null;
  return sheet ?? sheetFor(ruleset, {target, contentTypeId});
}
