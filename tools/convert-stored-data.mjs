/** One-shot conversion of a World saved before the 2026-10-11 UI simplification, the RWF gap fixes, the 2026-10-12 progression
 * or the 2026-10-13 sheet audiences (gmOnly becomes seenBy).
 * The module itself reads only the current format; this tool rewrites stored data once.
 * In the Foundry console, as GM:
 *   const {convertWorld}=await import("/modules/rule-them-all/tools/convert-stored-data.mjs");
 *   await convertWorld();          // report only
 *   await convertWorld({write:true});  // downloads a backup, then saves the converted data
 * then reload the World. */
import {copyJSON, isRecord} from "../src/configurator/configurator-schema.mjs";
import {readStorageSnapshot} from "../src/configurator/configurator-storage.mjs";
import {PERMISSION_OPERATIONS} from "../src/configurator/permission-contract.mjs";

const REMOVED_CAPABILITIES = new Set(["tests", "actions", "progression", "formulaSource", "conditionSource", "effectTarget"]);
const REMOVED_COLLECTIONS = ["references", "restrictions"];
const FIELD_KEYS = ["id", "name", "valueType", "cardinality", "required", "nullable", "defaultValue", "constraints", "referenceTarget"];
const SECTION_RENAMES = {advanced: "organization"};
const REMOVED_SECTIONS = new Set(["runtime"]);

const pick = (value, keys) => Object.fromEntries(keys.filter(key => Object.hasOwn(value, key)).map(key => [key, value[key]]));
const without = (value, keys) => Object.fromEntries(Object.entries(value).filter(([key]) => !keys.includes(key)));

function convertField(field, notes, path) {
  if (!isRecord(field)) return field;
  const next = pick(field, FIELD_KEYS);
  const dropped = Object.keys(field).filter(key => !FIELD_KEYS.includes(key) && key !== "editable");
  if (dropped.length) notes.push(`${path}: ${dropped.join(", ")} removed.`);
  if (Array.isArray(next.constraints)) {
    const numeric = ["integer", "number"].includes(next.valueType);
    const kept = next.constraints.filter(c => numeric && isRecord(c) && ["min", "max", "step"].includes(c.kind));
    if (kept.length !== next.constraints.length) notes.push(`${path}: ${next.constraints.length - kept.length} constraint(s) other than min, max or step removed.`);
    next.constraints = kept;
  }
  if (isRecord(next.referenceTarget)) {
    const {objectKind, definitionTypeId} = next.referenceTarget;
    next.referenceTarget = objectKind === "definition" && definitionTypeId ? {objectKind, definitionTypeId} : {objectKind};
  }
  return next;
}
const convertFields = (fields, notes, path) => isRecord(fields)
  ? Object.fromEntries(Object.entries(fields).map(([id, field]) => [id, convertField(field, notes, `${path}.${id}`)])) : fields;

/** A named Reference pointed at a capability output; its users now point at that output directly. */
function resolveReferences(value, references) {
  if (Array.isArray(value)) return value.map(item => resolveReferences(item, references));
  if (!isRecord(value)) return value;
  if (value.objectKind === "reference" && references.has(value.objectId)) {
    const target = references.get(value.objectId);
    return {...without(value, ["objectKind", "objectId"]), ...pick(target, ["objectKind", "objectId", "capabilityId", "slotId", "outputId"])};
  }
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, resolveReferences(item, references)]));
}

/** Relations to removed families point nowhere now. */
function dropDeadRelations(entry) {
  if (!Array.isArray(entry?.relations)) return entry;
  return {...entry, relations: entry.relations.filter(r => !["reference", "restriction"].includes(r?.targetRef?.objectKind))};
}

function initialOf(template, definitionId, binding) {
  if (isRecord(binding?.initial) && Object.keys(binding.initial).length) return copyJSON(binding.initial);
  const rule = (template.initialStateRules ?? []).find(r => r?.definitionId === definitionId);
  if (isRecord(rule?.initial)) return copyJSON(rule.initial);
  if (isRecord(rule?.values)) return copyJSON(rule.values);
  return {};
}

function convertTemplate(template) {
  const relations = [...(template.relations ?? [])];
  const has = (kind, id) => relations.some(r => r?.operation === "grant" && r.targetRef?.objectKind === kind && r.targetRef?.objectId === id);
  for (const binding of template.definitionBindings ?? []) {
    if (!binding?.definitionId || has("definition", binding.definitionId)) continue;
    relations.push({id: binding.id ?? `definition-${binding.definitionId}`, operation: "grant",
      targetRef: {objectKind: "definition", objectId: binding.definitionId}, config: {initial: initialOf(template, binding.definitionId, binding)}});
  }
  for (const binding of template.actionBindings ?? []) {
    if (!binding?.actionId || has("action", binding.actionId)) continue;
    relations.push({id: binding.id ?? `action-${binding.actionId}`, operation: "grant", targetRef: {objectKind: "action", objectId: binding.actionId}, config: {}});
  }
  const choiceGroups = (template.choiceGroups ?? []).map(group => ({...group, options: (group.options ?? []).map(option => {
    if (option?.targetRef) return without(option, ["kind", "definitionId", "actionId", "initial"]);
    const objectKind = option?.kind, objectId = objectKind === "definition" ? option.definitionId : option?.actionId;
    const config = {...(option?.config ?? {}), ...(option?.initial !== undefined && objectKind === "definition" ? {initial: option.initial} : {})};
    return {...without(option, ["kind", "definitionId", "actionId", "initial"]), id: option?.id ?? `${objectKind}-${objectId}`,
      operation: "grant", targetRef: {objectKind, objectId}, config};
  })}));
  return {...without(template, ["definitionBindings", "actionBindings", "initialStateRules"]), relations, choiceGroups};
}

/** Restrictions were never enforced; each becomes a rule of one ruleset-wide Permission policy,
 * kept disabled (and ALLOW by default) so nothing changes until the GM reviews it. */
function restrictionPolicy(restrictions, notes) {
  if (!restrictions.length) return null;
  const rules = restrictions.map(r => {
    const operations = (r.operationKinds ?? []).filter(op => PERMISSION_OPERATIONS.includes(op));
    if ((r.conditionRefs ?? []).length > 1) notes.push(`restrictions.${r.id}: only the first Condition kept.`);
    return {id: r.id, effect: r.effect === "allow" ? "ALLOW" : "DENY", operations: operations.length ? operations : ["execute"],
      roles: [], minimumOwnership: null, userIds: [], conditionRef: r.conditionRefs?.[0] ?? null, priority: r.priority ?? 0, messageKey: r.messageKey ?? ""};
  });
  notes.push(`${restrictions.length} Restriction(s) moved to the disabled Permission policy "Restrictions".`);
  return {id: "converted-restrictions", nameKey: "Restrictions", descriptionKey: "", enabled: false, order: 0, tags: [], scope: {objectKind: "ruleset"}, defaultEffect: "ALLOW", rules};
}

function convertColors(map) {
  if (!isRecord(map)) return map;
  const next = {};
  for (const [section, value] of Object.entries(map)) {
    if (REMOVED_SECTIONS.has(section)) continue;
    next[SECTION_RENAMES[section] ?? section] = value;
  }
  return next;
}

// 2026-10-12: a SheetDefinition is a LayoutNode tree {target, contentTypeIds, root}. Only the plain old components
// (section, text, spacer) carry over; the bound ones never rendered and must be rebuilt in the sheet editor.
// 2026-10-13: a block "for the GM only" (gmOnly: true) is now one seen by the GM (seenBy: ["gm"]).
function convertSeenBy(node) {
  if (!isRecord(node)) return node;
  const next = without(node, ["gmOnly"]);
  if (node.gmOnly === true) next.seenBy = ["gm"];
  if (Array.isArray(node.children)) next.children = node.children.map(convertSeenBy);
  return next;
}

function convertSheet(sheet, notes) {
  if (!Object.hasOwn(sheet, "layout") && !Object.hasOwn(sheet, "viewType")) return isRecord(sheet?.root) ? {...sheet, root: convertSeenBy(sheet.root)} : sheet;
  const columns = sheet.layout?.direction === "grid" ? 2 : 1;
  const used = new Set(["root"]);
  const children = [];
  for (const [i, c] of (sheet.layout?.components ?? []).entries()) {
    let id = String(c?.id ?? "").replace(/[^A-Za-z0-9_-]/g, "-").replace(/^[^A-Za-z0-9]+/, "") || `node-${i + 1}`;
    while (used.has(id)) id = `${id}-${i + 1}`;
    used.add(id);
    const span = c?.width === "full" && columns > 1 ? {span: columns} : {};
    if (c?.kind === "section") children.push({id, kind: "section", labelKey: String(c.label ?? ""), columns: 1, children: [], ...span});
    else if (c?.kind === "text") children.push({id, kind: "text", textKey: String(c.label ?? ""), ...span});
    else if (c?.kind === "spacer") children.push({id, kind: "spacer", ...span});
    else notes.push(`sheetDefinitions.${sheet.id}: the ${c?.kind ?? "unknown"} component ${c?.id ?? i} was removed; add it again in the sheet editor.`);
  }
  return {...without(sheet, ["viewType", "renderer", "layout"]), target: sheet.viewType === "item" || sheet.viewType === "content" ? "item" : "actor",
    contentTypeIds: sheet.contentTypeIds ?? [], root: {id: "root", kind: "grid", columns, children}};
}

export function convertRuleset(source) {
  const notes = [];
  let r = copyJSON(source);
  const references = new Map((r.references ?? []).filter(x => x?.id).map(x => [x.id, x]));
  const restrictions = r.restrictions ?? [];
  r = without(r, REMOVED_COLLECTIONS);
  if (references.size) notes.push(`${references.size} Reference(s) replaced by their target.`);
  r = resolveReferences(r, references);
  r.sectionColors = convertColors(r.sectionColors);
  r.sectionColorOverrides = convertColors(r.sectionColorOverrides);
  if (isRecord(r.familyColors)) r.familyColors = without(r.familyColors, REMOVED_COLLECTIONS);
  for (const collection of Object.keys(r)) if (Array.isArray(r[collection])) r[collection] = r[collection].map(dropDeadRelations);

  const cap = list => (list ?? []).filter(id => !REMOVED_CAPABILITIES.has(id));
  r.definitionTypes = (r.definitionTypes ?? []).map(t => ({...without(t, ["enabled"]),
    allowedCapabilities: cap(t.allowedCapabilities), defaultCapabilities: cap(t.defaultCapabilities), requiredCapabilities: cap(t.requiredCapabilities),
    fields: convertFields(t.fields, notes, `definitionTypes.${t.id}.fields`)}));
  r.definitions = (r.definitions ?? []).map(d => ({...d, capabilities: cap(d.capabilities)}));
  r.contentTypes = (r.contentTypes ?? []).map(t => ({...t, fields: convertFields(t.fields, notes, `contentTypes.${t.id}.fields`)}));
  r.eventTypes = (r.eventTypes ?? []).map(t => ({...t, payloadFields: convertFields(t.payloadFields, notes, `eventTypes.${t.id}.payloadFields`)}));
  r.parameters = (r.parameters ?? []).map(p => without(p, ["nullable"]));
  r.actions = (r.actions ?? []).map(a => without(a, ["purpose"]));
  r.tags = (r.tags ?? []).map(t => without(t, ["enabled"]));
  r.categories = (r.categories ?? []).map(c => without(c, ["enabled"]));

  // The engine used to try Outcomes by priority (highest first); the Test's list order now decides.
  const priority = new Map((r.outcomes ?? []).map(o => [o.id, o.priority ?? 0]));
  r.tests = (r.tests ?? []).map(t => ({...t, outcomeRefs: (t.outcomeRefs ?? []).map((id, index) => ({id, index}))
    .sort((a, b) => (priority.get(b.id) ?? 0) - (priority.get(a.id) ?? 0) || a.index - b.index).map(x => x.id)}));
  r.outcomes = (r.outcomes ?? []).map(o => without(o, ["priority"]));
  r.contentTemplates = (r.contentTemplates ?? []).map(convertTemplate);

  // 2026-10-11 (RWF gaps): a FormulaBinding holds for every role. Of the copies made per role, the self one stays.
  const bindings = new Map();
  for (const b of [...(r.formulaBindings ?? [])].sort((a, b) => Number((b?.targetRole ?? "self") === "self") - Number((a?.targetRole ?? "self") === "self"))) {
    const key = JSON.stringify(pick(b?.targetRef ?? {}, ["objectId", "capabilityId", "slotId", "outputId"]));
    if (bindings.has(key)) { notes.push(`formulaBindings.${b.id}: duplicate of ${bindings.get(key).id} for another role, removed.`); continue; }
    bindings.set(key, without(b, ["targetRole"]));
  }
  if (r.formulaBindings) r.formulaBindings = r.formulaBindings.map(b => [...bindings.values()].find(x => x.id === b?.id)).filter(Boolean);

  // 2026-10-12: Progression Systems hold advancements and milestones; the old tracks were never run.
  r.progressionSystems = (r.progressionSystems ?? []).map(system => {
    if (!Object.hasOwn(system, "tracks")) return system;
    if ((system.tracks ?? []).length) notes.push(`progressionSystems.${system.id}: ${system.tracks.length} track(s) removed; rebuild them as advancements or milestones.`);
    return {...without(system, ["tracks"]), advancements: system.advancements ?? [], milestones: system.milestones ?? []};
  });
  r.sheetDefinitions = (r.sheetDefinitions ?? []).map(sheet => convertSheet(sheet, notes));
  const policy = restrictionPolicy(restrictions, notes);
  if (policy) r.permissionPolicies = [...(r.permissionPolicies ?? []), policy];
  return {ruleset: r, notes};
}

export function convertSnapshot(source) {
  const snapshot = copyJSON(source), notes = [];
  for (const family of snapshot.rulesetFamilies ?? []) for (const record of family.versions ?? []) {
    for (const key of ["workingDraft", "publishedSnapshot"]) {
      if (!isRecord(record[key])) continue;
      const result = convertRuleset(record[key]);
      record[key] = result.ruleset;
      if (key === "workingDraft") notes.push(...result.notes.map(note => `${record.versionId}: ${note}`));
    }
  }
  return {snapshot, notes};
}

export async function convertWorld({write = false} = {}) {
  if (!game.user?.isGM) throw new Error("Only a GM can convert Rule Them'All data.");
  const stored = game.settings.get("rule-them-all", "configuratorStorage");
  const {snapshot, notes} = convertSnapshot(stored);
  snapshot.storageRevision = (stored.storageRevision ?? 0) + 1;
  let error = null;
  try { readStorageSnapshot(snapshot); } catch (e) { error = e; }
  console.log("Rule Them'All | conversion notes", notes);
  if (error) { console.error("Rule Them'All | still invalid after conversion, nothing written", error); return {ok: false, notes, error: error.message}; }
  if (!write) { console.log("Rule Them'All | conversion OK. Run convertWorld({write:true}) to save it."); return {ok: true, notes}; }
  foundry.utils.saveDataToFile(JSON.stringify(stored, null, 2), "application/json", "rule-them-all-backup-before-conversion.json");
  await game.settings.set("rule-them-all", "configuratorStorage", snapshot);
  console.log("Rule Them'All | converted data saved. Reload the World.");
  return {ok: true, notes};
}
