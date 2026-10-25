/* The fields of a Ruleset's sheets that another module may read or fill (integrations.listBindableFields): the
   Document's image, name and token, notes, text fields of a Content, and pictures of the sheet itself. A field is named
   by a FieldRef {rulesetId, sheetId ("auto" for the AUTO sheet), target, contentTypeId?, nodeId? | slot?}; slots are
   the standard header's "header.img" and "header.name", and, on an Item sheet, "template.image" (its Content
   Template's picture). Numbers and states are never fields here: mechanics are not written this way.
   Pure: reads a Ruleset, no Foundry access. */
import {layoutNodes} from "../configurator/layout-contract.mjs";
import {sheetFor} from "../configurator/sheet-auto-layout.mjs";

export const FIELD_SLOTS = Object.freeze(["header.img", "header.name", "template.image"]);
const enabled = entry => entry?.enabled !== false;

/** The sheets of a Ruleset, with the AUTO sheet of each target. */
export function listSheets(ruleset) {
  const own = (ruleset?.sheetDefinitions ?? []).map(sheet => ({id: sheet.id, nameKey: sheet.nameKey ?? sheet.id, target: sheet.target, contentTypeIds: [...(sheet.contentTypeIds ?? [])],
    enabled: enabled(sheet), hasStandardHeader: (sheet.header ?? "standard") !== "none"}));
  return [...own, ...["actor", "item"].map(target => ({id: "auto", nameKey: "", target, contentTypeIds: [], enabled: true, hasStandardHeader: true}))];
}

/** The sheet a FieldRef names, or null. */
export function sheetOfRef(ruleset, {sheetId, target = "actor", contentTypeId = null} = {}) {
  if (!ruleset) return null;
  if (sheetId === "auto") return sheetFor({...ruleset, sheetDefinitions: []}, {target, contentTypeId});
  return (ruleset.sheetDefinitions ?? []).find(sheet => sheet.id === sheetId && sheet.target === target) ?? null;
}

/** A node with what its ancestors decide: who gets it, whether a Condition may hide it, whether it sits in a list. */
function placedNodes(root) {
  const out = new Map();
  const walk = (node, inherited) => {
    if (!node || typeof node !== "object") return;
    const seenBy = node.seenBy ? (inherited.seenBy ? inherited.seenBy.filter(who => node.seenBy.includes(who)) : [...node.seenBy]) : inherited.seenBy;
    const placed = {node, seenBy, conditional: inherited.conditional || Boolean(node.visibleIf), inRepeater: inherited.inRepeater};
    out.set(node.id, placed);
    for (const child of node.children ?? []) walk(child, {seenBy, conditional: placed.conditional, inRepeater: inherited.inRepeater || node.kind === "repeater"});
  };
  walk(root, {seenBy: null, conditional: false, inRepeater: false});
  return out;
}

/** What a node is as a field, or null when it is not one. */
function nodeField(ruleset, sheet, placed) {
  const {node} = placed;
  const base = {nodeKind: node.kind, label: node.labelKey || null, seenBy: placed.seenBy ? [...placed.seenBy] : null, conditional: placed.conditional, inRepeater: placed.inRepeater};
  const writes = node.write ? {writable: !placed.inRepeater, ...(node.write.by ? {writeBy: node.write.by} : {})} : {writable: false};
  switch (node.kind) {
    case "portrait": return {...base, valueKind: "image", scope: "instance", storage: "documentImg", writable: true};
    case "token": return sheet.target === "actor" ? {...base, valueKind: "image", scope: "instance", storage: "tokenImg", writable: true, ...(node.updatePlaced ? {updatePlaced: true} : {})} : null;
    case "name": return {...base, valueKind: "text", scope: "instance", storage: "documentName", writable: true};
    case "notes": return sheet.target === "actor" ? {...base, valueKind: node.format === "rich" ? "richText" : "text", scope: "instance", storage: "runtimeNote", ...writes} : null;
    case "value": {
      if (node.source?.kind !== "field" || sheet.target !== "item") return null;
      const types = (ruleset.contentTypes ?? []).filter(type => !(sheet.contentTypeIds ?? []).length || sheet.contentTypeIds.includes(type.id));
      const field = types.map(type => type.fields?.[node.source.fieldId]).find(Boolean);
      if (field?.valueType !== "string" || (field.cardinality ?? "one") !== "one") return null;
      return {...base, label: base.label ?? field.name ?? node.source.fieldId, valueKind: "text", scope: "instance", storage: "contentField", fieldId: node.source.fieldId, ...writes};
    }
    case "image": return {...base, valueKind: "image", scope: "definition", storage: "sheetNodeSrc", writable: !placed.inRepeater};
    case "separator": return node.look === "image" ? {...base, valueKind: "image", scope: "definition", storage: "sheetNodeSrc", writable: !placed.inRepeater} : null;
    default: return null;
  }
}
function slotField(sheet, slot) {
  const base = {nodeKind: "header", label: null, seenBy: null, conditional: false, inRepeater: false};
  const header = (sheet.header ?? "standard") !== "none";
  if (slot === "header.img" && header) return {...base, valueKind: "image", scope: "instance", storage: "documentImg", writable: true};
  if (slot === "header.name" && header) return {...base, valueKind: "text", scope: "instance", storage: "documentName", writable: true};
  if (slot === "template.image" && sheet.target === "item") return {...base, nodeKind: "template", valueKind: "image", scope: "definition", storage: "contentTemplateImage", writable: true};
  return null;
}
const refOf = (rulesetId, sheet, contentTypeId, at) => ({rulesetId, sheetId: sheet.id, target: sheet.target, ...(contentTypeId ? {contentTypeId} : {}), ...at});

/** The fields of one sheet, in the order of the sheet (header first). */
export function listBindableFields(ruleset, {rulesetId = ruleset?.id ?? null, sheetId, target = "actor", contentTypeId = null} = {}) {
  const sheet = sheetOfRef(ruleset, {sheetId, target, contentTypeId});
  if (!sheet) return [];
  const fields = [];
  for (const slot of FIELD_SLOTS) { const field = slotField(sheet, slot); if (field) fields.push({ref: refOf(rulesetId, sheet, contentTypeId, {slot}), ...field}); }
  const placed = placedNodes(sheet.root);
  for (const {node} of layoutNodes(sheet.root)) {
    const field = nodeField(ruleset, sheet, placed.get(node.id));
    if (field) fields.push({ref: refOf(rulesetId, sheet, contentTypeId, {nodeId: node.id}), ...field});
  }
  return fields;
}

/** One field: {status: "ok", ...descriptor}, {status: "missing", reason} when its sheet or node is gone, or
 * {status: "typeChanged", previous, current} when its node is now another kind (expected: ref.nodeKind or options.nodeKind).
 * Never another node in its place. */
export function describeField(ruleset, ref = {}, {nodeKind = ref.nodeKind ?? null} = {}) {
  const sheet = sheetOfRef(ruleset, ref);
  if (!sheet) return {status: "missing", reason: "sheet"};
  if (ref.slot) {
    const field = slotField(sheet, ref.slot);
    return field ? {status: "ok", ref: {...ref}, ...field} : {status: "missing", reason: "slot"};
  }
  const placed = placedNodes(sheet.root).get(ref.nodeId);
  if (!placed) return {status: "missing", reason: "node"};
  const field = nodeField(ruleset, sheet, placed);
  if (nodeKind && placed.node.kind !== nodeKind) return {status: "typeChanged", previous: nodeKind, current: placed.node.kind};
  if (!field) return {status: "typeChanged", previous: nodeKind, current: placed.node.kind};
  return {status: "ok", ref: {...ref}, ...field};
}
