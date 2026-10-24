// Acceptance of the Ruleset assistant: rebuilds the rules of an exported RWF Ruleset with the assistant's paths only
// (api.applyAssistant, one entry per call, each answer read from the entry it must rebuild), copies what is not a rule
// (Contents, tags, colors, sheets), then compares every entry with the original and writes the rebuilt package.
// Usage: node rebuild-with-assistant.mjs <repo> <rwf-package.json> <rebuilt-package.json> [report.md]
import {readFileSync, writeFileSync} from "node:fs";
import {pathToFileURL} from "node:url";
const [repo, source, target, reportFile] = process.argv.slice(2);
if (!repo || !source || !target) { console.error("Usage: node rebuild-with-assistant.mjs <repo> <rwf-package.json> <rebuilt-package.json> [report.md]"); process.exit(2); }
const imp = p => import(pathToFileURL(`${repo}/src/${p}`).href);
const {createConfiguratorAPI} = await imp("configurator/configurator-api.mjs");
const {emptyStorageSnapshot, storageFingerprint} = await imp("configurator/configurator-storage.mjs");
const {PREPARERS} = await imp("configurator/rule-contracts.mjs");
const {prepareDefinitionSlots} = await imp("configurator/capability-slots.mjs");
const {prepareFieldMap} = await imp("configurator/field-output-contracts.mjs");
const {kindOfCollection} = await imp("configurator/ruleset-parts.mjs");

const original = JSON.parse(readFileSync(source, "utf8")).versionRecord.workingDraft;
const fr = JSON.parse(readFileSync(`${repo}/lang/fr.json`, "utf8"));
const lookup = key => key.split(".").reduce((node, part) => node?.[part], fr);
class Storage { data = emptyStorageSnapshot(); async load() { return structuredClone(this.data); } async save(d) { this.data = structuredClone(d); } }
const api = await createConfiguratorAPI(new Storage());
const v = (await api.createRuleset({id: original.id, nameKey: original.nameKey, version: original.version})).versionId;
const texts = Object.fromEntries(api.assistantTextKeys().map(key => [key, lookup(key) ?? key]));
const ruleset = () => api.getRuleset(v);

const calls = [], unsupported = [], failures = [];
const use = id => ({use: id});
const named = entry => ({name: entry.nameKey, id: entry.id});
const formulaNode = id => ({type: "formula", id});
const described = entry => entry.descriptionKey ? {description: entry.descriptionKey} : {};
const has = value => Array.isArray(value) ? value.length > 0 : value !== undefined && value !== null && value !== "" && !(typeof value === "object" && !Object.keys(value).length);
const gap = (collection, entry, what) => unsupported.push(`${collection} ${entry.id}: ${what}`);
/** The assistant's calls, run once every entry they name exists: a call refused for a missing entry is tried again
 * after the others, until a round adds nothing. */
let jobs = [];
const apply = (collection, entry, pathId, answers) => { jobs.push({collection, entry, pathId, answers}); };
async function run() {
  let pending = jobs; jobs = [];
  while (pending.length) {
    const left = [];
    for (const job of pending) {
      try { const result = await api.applyAssistant(v, job.pathId, job.answers, {texts}); calls.push({collection: job.collection, id: job.entry.id, pathId: job.pathId, created: result.created.length}); }
      catch (error) { job.error = error.message; left.push(job); }
    }
    if (left.length === pending.length) { for (const job of left) failures.push(`${job.collection} ${job.entry.id} (${job.pathId}): ${job.error}`); break; }
    pending = left;
  }
}
/** Copies of what is not a rule, in the same way: tried again until a round adds nothing. */
async function copy(entries, create) {
  let pending = entries;
  while (pending.length) {
    const left = [];
    for (const entry of pending) { try { await create(entry); } catch (error) { entry.__error = error.message; left.push(entry); } }
    if (left.length === pending.length) { for (const entry of left) failures.push(`copy ${entry.id}: ${entry.__error.slice(0, 300)}`); break; }
    pending = left;
  }
  return entries.length - pending.length;
}
/** Entries of a collection in an order where each comes after those it names (deps), so an answer can use them. */
function ordered(list, deps) {
  const done = new Set(), out = [], byId = new Map(list.map(entry => [entry.id, entry]));
  const visit = (entry, path = new Set()) => {
    if (done.has(entry.id) || path.has(entry.id)) return;
    path.add(entry.id);
    for (const id of deps(entry)) if (byId.has(id) && id !== entry.id) visit(byId.get(id), path);
    done.add(entry.id); out.push(entry);
  };
  for (const entry of list) visit(entry);
  return out;
}

/* ---- What is not a rule, needed first: tags (entries name them), copied as they are. */
for (const tag of original.tags ?? []) await api.createTag(v, tag);

/* ---- Rules, through the assistant. */
for (const p of original.parameters) {
  await apply("parameters", p, "parameter", {name: named(p), valueType: p.valueType, ...(p.valueType === "boolean" ? {flag: p.value} : p.valueType === "string" ? {text: p.value} : {number: p.value}), ...described(p)});
  if (p.scope !== "ruleset") gap("parameters", p, `scope ${p.scope}`);
}
for (const f of original.formulas) await apply("formulas", f, "formula", {name: named(f), resultType: f.resultType, expression: f.expression, ...described(f)});
for (const c of original.conditions) await apply("conditions", c, "condition", {name: named(c), expression: c.expression, ...described(c)});
for (const s of original.scales) await apply("scales", s, "scale", {name: named(s), basis: s.basis, rows: s.rows.map(row => ({min: row.min, max: row.max, words: row.labelKey, id: row.id})), ...described(s)});

const fieldRows = (collection, entry) => Object.values(entry.fields ?? {}).map(field => {
  if (has(field.constraints) || field.defaultValue !== undefined) gap(collection, entry, `field ${field.id} constraints or default`);
  return {name: {name: field.name, id: field.id}, valueType: field.valueType, ...(field.referenceTarget?.definitionTypeId ? {referenceType: use(field.referenceTarget.definitionTypeId)} : {}),
    many: field.cardinality === "many", required: field.required === true, nullable: field.nullable === true};
});
const bound = source => source === undefined ? undefined : Object.hasOwn(source, "literal") ? {type: "literal", value: source.literal} : formulaNode(source.formulaRef);
for (const t of ordered(original.definitionTypes, t => Object.values(t.fields ?? {}).map(field => field.referenceTarget?.definitionTypeId).filter(Boolean))) {
  const [capability] = t.allowedCapabilities;
  if (t.allowedCapabilities.length !== 1 || t.defaultCapabilities.join() !== capability || t.requiredCapabilities.join() !== capability) gap("definitionTypes", t, "several capabilities");
  if (has(t.constraints) || t.presentation || t.relations || t.scaleRef) gap("definitionTypes", t, "constraints, presentation, relations or scale");
  await apply("definitionTypes", t, "definitionType", {name: named(t), capability, ...(t.valueBounds?.minimum ? {minimum: bound(t.valueBounds.minimum)} : {}),
    ...(t.valueBounds?.maximum ? {maximum: bound(t.valueBounds.maximum)} : {}), fields: fieldRows("definitionTypes", t), ...described(t)});
}

const dataDeps = d => Object.values(d.data ?? {}).map(value => value?.objectId).filter(Boolean);
for (const d of ordered(original.definitions, dataDeps)) {
  const common = {name: named(d), type: use(d.definitionTypeId), ...described(d)};
  const scale = d.scaleRef ? {scale: use(d.scaleRef)} : {};
  if (d.capabilities.length !== 1) { gap("definitions", d, "several capabilities"); continue; }
  if (d.valueBounds || d.relations || d.presentationProfile) gap("definitions", d, "own bounds, relations or presentation");
  const [capability] = d.capabilities;
  if (capability === "value") {
    const data = Object.entries(d.data ?? {}).map(([field, value]) => value?.objectKind === "definition" ? {field, entry: use(value.objectId)} : {field, value: String(value)});
    await apply("definitions", d, "value", {...common, ...scale, data});
  } else if (capability === "pool") {
    const [slot, ...others] = d.slots.pool;
    if (others.length || slot.id !== "points" || slot.name !== d.nameKey || !Object.hasOwn(slot.minimum ?? {}, "literal")) gap("definitions", d, "pool slots the resource path does not make");
    const maximum = Object.hasOwn(slot.maximum, "literal") ? {maximum: "fixed", maxValue: slot.maximum.literal} : {maximum: "formula", maxFormula: formulaNode(slot.maximum.formulaRef)};
    await apply("definitions", d, "resource", {...common, ...scale, ...maximum, minimum: slot.minimum.literal, initial: slot.initial ? "minimum" : "maximum", integer: slot.valueType === "integer"});
  } else if (capability === "state") {
    if (d.scaleRef || has(d.data)) gap("definitions", d, "state with a scale or data");
    await apply("definitions", d, "state", {...common, applyAction: false, removeAction: false});
  } else gap("definitions", d, `capability ${capability}`);
}
for (const b of original.formulaBindings) await apply("formulaBindings", b, "derivedValue", {target: "existing", existing: use(b.targetRef.objectId), expression: formulaNode(b.formulaRef), binding: named(b)});
for (const r of original.rolls) {
  if (has(r.data)) gap("rolls", r, "data");
  await apply("rolls", r, "roll", {name: named(r), formula: r.formula, variants: (r.variants ?? []).map(variant => ({condition: use(variant.conditionRef), formula: variant.formula})), ...described(r)});
}
for (const o of original.outcomes) {
  if (o.labelKey !== o.nameKey) gap("outcomes", o, "a label other than its name");
  await apply("outcomes", o, "outcome", {name: named(o), resultKey: o.resultKey, ...(o.conditionRef ? {condition: use(o.conditionRef)} : {}), ...described(o)});
}
for (const d of original.durations) {
  const duration = d.mode === "fixed" ? d.unit : d.mode;
  if (!["untilRemoved", "untilEvent", "fixed"].includes(d.mode)) gap("durations", d, `mode ${d.mode}`);
  await apply("durations", d, "duration", {name: named(d), duration, ...(d.mode === "fixed" ? {amount: d.amount} : {}), ...(d.mode === "untilEvent" ? {event: d.eventTypeRef} : {}), ...described(d)});
}
for (const t of ordered(original.tests, t => [t.opposedTestRef].filter(Boolean))) {
  if (t.totalFormulaRef || t.marginFormulaRef || has(t.extraRolls)) gap("tests", t, "total, margin or extra rolls");
  const target = t.opposedTestRef ? {target: "opposed", opposed: use(t.opposedTestRef)} : t.targetFormulaRef ? {target: "formula", targetFormula: formulaNode(t.targetFormulaRef)}
    : t.targetValue !== null ? {target: "fixed", targetValue: t.targetValue} : {target: "none"};
  const inputs = t.inputBindings.map(binding => {
    const source = Object.hasOwn(binding.source, "formulaRef") ? {from: "formula", formula: formulaNode(binding.source.formulaRef)}
      : binding.source.literal?.objectKind === "definition" ? {from: "definition", definition: use(binding.source.literal.objectId)} : {from: "value", value: String(binding.source.literal)};
    if (Object.hasOwn(binding.source, "reference")) gap("tests", t, `input ${binding.id} read from a reference`);
    return {name: {name: binding.id, id: binding.id}, valueType: binding.valueType, ...source, ...(binding.defaultValue !== undefined ? {default: String(binding.defaultValue)} : {}), required: binding.required};
  });
  await apply("tests", t, "test", {name: named(t), roll: use(t.rollRef), ...(t.bonusFormulaRef ? {bonus: formulaNode(t.bonusFormulaRef)} : {}), ...target, inputs,
    outcomes: t.outcomeRefs.map(use), ...(t.fallbackOutcomeRef ? {fallback: use(t.fallbackOutcomeRef)} : {}), action: false, ...described(t)});
}
const operandAnswers = (e, operand) => {
  if (operand.kind === "literal") return {operand: "number", amount: operand.value};
  if (operand.kind === "formula") return {operand: "formula", expression: formulaNode(operand.id)};
  if (operand.kind === "parameter") return {operand: "formula", expression: {type: "parameter", id: operand.id}};
  if (operand.kind === "reference") return {operand: "formula", expression: {type: "reference", reference: operand.reference}};
  return {operand: "roll", roll: use(operand.rollRef), ...(operand.bonusFormulaRef ? {bonus: formulaNode(operand.bonusFormulaRef)} : {}), ...(operand.multiplierFormulaRef ? {multiplier: formulaNode(operand.multiplierFormulaRef)} : {}),
    ...(operand.factorFormulaRef ? {factor: formulaNode(operand.factorFormulaRef)} : {}), ...(operand.minimum !== undefined ? {minimum: operand.minimum} : {})};
};
for (const e of original.effects) {
  const writes = e.targetContentField ? {writes: "contentField", field: e.targetContentField}
    : {writes: "definition", target: {use: e.targetRef.objectId, ...(e.targetRef.slotId ? {slotId: e.targetRef.slotId} : {})}, ...(e.targetDefinitionFormulaRef ? {chosenBy: formulaNode(e.targetDefinitionFormulaRef)} : {})};
  await apply("effects", e, "effect", {name: named(e), ...writes, role: e.targetRole, operation: e.operation, ...operandAnswers(e, e.operand), ...described(e)});
}
const actionDeps = a => (a.outcomeMappings ?? []).flatMap(mapping => mapping.actionRefs ?? []);
const ACTION_EXTRAS = ["acquisitions", "modifierApplications", "eventTypeRefs", "roleLinks", "chatActions"];
for (const a of ordered(original.actions, actionDeps)) {
  for (const key of ACTION_EXTRAS) if (has(a[key])) gap("actions", a, key);
  for (const key of ["tableRef", "reroll", "forEach", "group", "turnOrder"]) if (a[key]) gap("actions", a, key);
  if (has(a.eventPayloads)) gap("actions", a, "eventPayloads");
  const roles = new Set([...a.stateApplications, ...a.stateRemovals].map(item => item.targetRole));
  if (roles.size > 1) gap("actions", a, "states applied to several roles");
  for (const application of a.stateApplications) if (application.stacks !== 1 || application.severity !== null || has(application.modifierRefs) || application.definitionFormulaRef) gap("actions", a, "state stacks, severity, modifiers or chosen state");
  const inputs = (a.inputs ?? []).map(input => ({name: {name: input.labelKey, id: input.id}, valueType: input.valueType, ...(input.definitionTypeId ? {definitionType: use(input.definitionTypeId)} : {}),
    ...(input.defaultValue !== undefined ? {default: String(input.defaultValue)} : {}), required: input.required, options: (input.options ?? []).map(option => ({label: option.labelKey, value: String(option.value)}))}));
  const results = a.outcomeMappings.map(mapping => {
    if (mapping.block || mapping.choice) gap("actions", a, "a result that blocks or offers a choice");
    return {...(mapping.outcomeId ? {outcome: use(mapping.outcomeId)} : {resultKey: mapping.resultKey}), replace: Array.isArray(mapping.effectRefs), effects: (mapping.effectRefs ?? []).map(use), actions: (mapping.actionRefs ?? []).map(use)};
  });
  await apply("actions", a, "action", {name: named(a), inputs, conditions: a.conditionRefs.map(use), costs: a.costEffectRefs.map(use), ...(a.testRef ? {test: use(a.testRef)} : {}),
    effects: a.effectRefs.map(use), applyStates: a.stateApplications.map(item => ({state: use(item.definitionId), ...(item.durationRef ? {duration: use(item.durationRef)} : {}), stacking: item.stacking})),
    removeStates: a.stateRemovals.map(item => use(item.definitionId)), role: [...roles][0] ?? "target", results, targeting: a.targeting ?? "one", ...described(a)});
}
for (const t of original.triggers) {
  if (t.eventFilter) gap("triggers", t, "eventFilter");
  await apply("triggers", t, "trigger", {name: named(t), event: t.eventTypeId, conditions: t.conditionRefs.map(use), actions: t.actionRefs.map(use), holder: t.holder ?? "actor", mode: t.mode ?? "automatic", actingRole: t.actingRole ?? "self", ...described(t)});
}
for (const c of original.contentTypes) {
  if (c.image || c.documentSubtype) gap("contentTypes", c, "image or document subtype");
  await apply("contentTypes", c, "contentType", {name: named(c), storage: c.storageKind, stackable: c.runtimeMode === "stackable", fields: fieldRows("contentTypes", c),
    ...(c.availabilityConditionRef ? {availability: use(c.availabilityConditionRef)} : {}), ...described(c)});
}
const LIST_OF = {action: "actions", definition: "definitions", definitionType: "types", contentType: "contentTypes"};
for (const p of original.permissionPolicies) {
  const roles = p.rules.find(rule => rule.roles)?.roles ?? [];
  const who = roles.includes("trusted") ? "trusted" : roles.includes("assistant") ? "assistant" : "gamemaster";
  if (!LIST_OF[p.scope.objectKind]) { gap("permissionPolicies", p, `scope ${p.scope.objectKind}`); continue; }
  await apply("permissionPolicies", p, "permission", {kind: p.scope.objectKind, [LIST_OF[p.scope.objectKind]]: [use(p.scope.objectId)], who, name: named(p), ...described(p)});
}
for (const s of original.progressionSystems) {
  if (has(s.milestones)) gap("progressionSystems", s, "milestones with advancements");
  const costs = new Set(s.advancements.map(a => a.costFormulaRef)), maxima = new Set(s.advancements.map(a => a.maximumFormulaRef));
  if (costs.size > 1 || maxima.size > 1) gap("progressionSystems", s, "several cost or maximum Formulas");
  for (const a of s.advancements) if (a.definitionTypeId || a.conditionRef || a.step !== 1 || a.definitionIds.length !== 1) gap("progressionSystems", s, `advancement ${a.id} by type, condition, step or several values`);
  const [first] = s.advancements;
  await apply("progressionSystems", s, "progression", {name: named(s), mode: "advance", values: s.advancements.map(a => ({value: use(a.definitionIds[0]), currency: use(a.currencyRef.objectId)})),
    cost: "formula", costFormula: formulaNode(first.costFormulaRef), ...(first.maximumFormulaRef ? {maximum: formulaNode(first.maximumFormulaRef)} : {}), ...described(s)});
}
if (original.initiative) {
  const i = original.initiative, entry = {id: "initiative"};
  if (i.tableRef) gap("initiative", entry, "a table");
  await apply("initiative", entry, "initiative", {test: use(i.testRef), eachRound: i.eachRound, bySide: i.bySide, ...(i.tieBreakFormulaRef ? {tieBreak: formulaNode(i.tieBreakFormulaRef)} : {}),
    ...(i.passes?.countFormulaRef ? {passes: formulaNode(i.passes.countFormulaRef)} : {}), ...(i.defeatedConditionRef ? {defeated: use(i.defeatedConditionRef)} : {})});
}

await run();

/* ---- Contents and sheets: not rules, copied as they are. */
const copied = {contentTemplates: await copy(original.contentTemplates, template => api.createContentTemplate(v, template))};

/* ---- Character creation, through the assistant: its steps choose Contents. */
for (const c of original.creationSystems) {
  const covered = new Set(c.steps.filter(step => step.kind === "contentChoices").flatMap(step => step.source.stepIds));
  const steps = c.steps.map(step => {
    if (step.draw || step.repeat || step.conditionRef || step.costFormulaRef || has(step.options)) gap("creationSystems", c, `step ${step.id}: draw, repeat, condition, cost or options`);
    const row = {kind: step.kind, name: {name: step.name, id: step.id}};
    if (step.kind === "content") Object.assign(row, {templates: step.source.objectIds.map(use), choicesLater: covered.has(step.id)});
    if (["choice", "allocation"].includes(step.kind)) row.definitions = step.source.objectIds.map(use);
    if (["content", "choice", "allocation"].includes(step.kind)) {
      Object.assign(row, {min: step.min, max: step.max, required: step.required});
      if (step.minFormulaRef) row.minFormula = formulaNode(step.minFormulaRef);
      if (step.maxFormulaRef) row.maxFormula = formulaNode(step.maxFormulaRef);
      if (step.optionConditionRef) row.optionCondition = use(step.optionConditionRef);
    }
    if (step.kind === "allocation") {
      if (step.perTargetMax !== undefined) row.perTargetMax = step.perTargetMax;
      if (step.perTargetMaxFormulaRef) row.perTargetMaxFormula = formulaNode(step.perTargetMaxFormulaRef);
    }
    return row;
  });
  await apply("creationSystems", c, "creation", {mode: "new", name: named(c), steps, ...described(c)});
}
await run();
for (const [collection, create] of [["sheetTemplates", "createSheetTemplate"], ["sheetThemes", "createSheetTheme"], ["sheetDefinitions", "createSheetDefinition"]]) {
  copied[collection] = await copy(original[collection] ?? [], entry => api[create](v, entry));
}
// Tags and colors of the rebuilt entries, and the Ruleset's own fields.
const UPDATE = {definitionTypes: "updateDefinitionType", definitions: "updateDefinition", parameters: "updateParameter", formulas: "updateFormula", conditions: "updateCondition", scales: "updateScale",
  formulaBindings: "updateFormulaBinding", rolls: "updateRoll", outcomes: "updateOutcome", durations: "updateDuration", tests: "updateTest", effects: "updateEffect", actions: "updateAction",
  triggers: "updateTrigger", contentTypes: "updateContentType", permissionPolicies: "updatePermissionPolicy", progressionSystems: "updateProgressionSystem", creationSystems: "updateCreationSystem"};
let decorated = 0;
for (const [collection, update] of Object.entries(UPDATE)) for (const entry of original[collection] ?? []) {
  const patch = {...(has(entry.tags) ? {tags: entry.tags} : {}), ...(entry.color ? {color: entry.color} : {})};
  if (!Object.keys(patch).length || !ruleset()[collection].some(item => item.id === entry.id)) continue;
  await api[update](v, entry.id, patch); decorated++;
}
// The order of the cards, as the GM drags them in the configurator: it decides which Trigger of an event runs first.
const sequence = list => [...(list ?? [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).map(entry => entry.id);
let reordered = 0;
for (const collection of Object.keys(UPDATE)) {
  const ids = sequence(original[collection]).filter(id => ruleset()[collection].some(item => item.id === id));
  if (ids.length < 2 || sequence(ruleset()[collection]).filter(id => ids.includes(id)).join() === ids.join()) continue;
  await api.reorderEntries(v, kindOfCollection(collection), ids); reordered++;
}
const RULESET_DECORATION = ["descriptionKey", "color", "sectionColors", "sectionColorOverrides", "familyColors"];
await api.updateRuleset(v, Object.fromEntries(RULESET_DECORATION.filter(key => original[key] !== undefined).map(key => [key, original[key]])));

/* ---- Entry by entry: the rebuilt Ruleset against the original. */
const prepare = (collection, entry) => {
  let x = structuredClone(entry);
  if (collection === "definitions") x = {key: x.id, data: {}, ...x, slots: prepareDefinitionSlots(x.slots, x.capabilities)};
  else if (collection === "definitionTypes") x = {key: x.id, allowedCapabilities: [], defaultCapabilities: [], requiredCapabilities: [], color: null, fields: {}, constraints: [], ...x, fields: prepareFieldMap(x.fields ?? {})};
  else if (PREPARERS[collection]) x = PREPARERS[collection](x);
  delete x.order;
  return x;
};
const differences = (a, b, path = "") => {
  if (storageFingerprint(a) === storageFingerprint(b)) return [];
  const object = value => value !== null && typeof value === "object";
  if (!object(a) || !object(b) || Array.isArray(a) !== Array.isArray(b)) return [`${path || "."}: ${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`];
  return [...new Set([...Object.keys(a), ...Object.keys(b)])].flatMap(key => differences(a[key], b[key], path ? `${path}.${key}` : key));
};
const RULE_COLLECTIONS = ["parameters", "formulas", "conditions", "scales", "definitionTypes", "definitions", "formulaBindings", "rolls", "outcomes", "durations", "tests", "effects", "actions",
  "triggers", "contentTypes", "permissionPolicies", "progressionSystems", "creationSystems", "modifiers", "eventTypes", "tables", "dice"];
const rebuilt = ruleset(), rows = [], mismatches = [];
for (const collection of RULE_COLLECTIONS) {
  const before = original[collection] ?? [], after = rebuilt[collection] ?? [];
  let same = 0;
  for (const entry of before) {
    const twin = after.find(item => item.id === entry.id);
    if (!twin) { mismatches.push(`${collection} ${entry.id}: missing`); continue; }
    const diff = differences(prepare(collection, entry), prepare(collection, twin));
    if (diff.length) mismatches.push(`${collection} ${entry.id}: ${diff.join("; ")}`); else same++;
  }
  const kept = sequence(after).filter(id => before.some(entry => entry.id === id));
  if (kept.join() !== sequence(before).filter(id => kept.includes(id)).join()) mismatches.push(`${collection}: order ${kept.join(", ")}`);
  const extra = after.filter(item => !before.some(entry => entry.id === item.id)).map(item => item.id);
  for (const id of extra) mismatches.push(`${collection} ${id}: created by the assistant, not in the original`);
  rows.push({collection, original: before.length, identical: same, extra: extra.length});
}
const initiativeDiff = differences(original.initiative ?? null, rebuilt.initiative ?? null);
if (initiativeDiff.length) mismatches.push(`initiative: ${initiativeDiff.join("; ")}`);

// Published like the original, when nothing is left to complete.
const publishable = api.validateRuleset(ruleset(), {scope: "publish"});
if (publishable.valid) await api.publishRuleset(v);
else for (const diagnostic of publishable.errors) failures.push(`publish: ${diagnostic.path}: ${diagnostic.message}`);
writeFileSync(target, JSON.stringify(api.exportRuleset(v), null, 1));
const total = rows.reduce((n, row) => n + row.original, 0), identical = rows.reduce((n, row) => n + row.identical, 0);
const report = [
  "# RWF rebuilt with the Ruleset assistant", "",
  `Published: ${publishable.valid ? "yes" : "no"}. Assistant calls: ${calls.length} (${calls.reduce((n, call) => n + call.created, 0)} entries created). Rule entries identical to the original: ${identical} / ${total}.`, "",
  "| Collection | Original | Identical | Extra |", "|---|---:|---:|---:|",
  ...rows.filter(row => row.original || row.extra).map(row => `| ${row.collection} | ${row.original} | ${row.identical} | ${row.extra} |`), "",
  `Initiative: ${initiativeDiff.length ? "different" : "identical"}.`, "",
  `Copied, not rules: ${Object.entries(copied).map(([collection, n]) => `${n} ${collection}`).join(", ") || "nothing"}; ${(original.tags ?? []).length} tags; tags and colors on ${decorated} entries; card order set by drag in ${reordered} collections; the Ruleset's colors and description.`, "",
  "## Refused by the assistant", "", ...(failures.length ? failures.map(line => `- ${line}`) : ["None."]), "",
  "## Not expressible by the assistant's questions", "", ...(unsupported.length ? unsupported.map(line => `- ${line}`) : ["None."]), "",
  "## Differences", "", ...(mismatches.length ? mismatches.map(line => `- ${line}`) : ["None."]), ""
].join("\n");
if (reportFile) writeFileSync(reportFile, report);
console.log(report.split("\n## Differences")[0]);
console.log(`differences: ${mismatches.length}`);
if (failures.length || mismatches.length || unsupported.length) process.exitCode = 1;
