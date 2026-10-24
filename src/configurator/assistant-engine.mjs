/* Ruleset assistant: guided paths that turn a GM's answers into new entries of a draft, written at once.
   A path asks questions (assistant-paths.mjs); its build turns the visible answers into entries to create, references
   appended to entries already there, and Ruleset fields filled while empty. Nothing existing is changed or removed.
   Pure: no Foundry access; text comes from the injected text(key) function. */
import {copyJSON, isRecord, COLLECTION_FIELDS} from "./configurator-schema.mjs";
import {PREPARERS} from "./rule-contracts.mjs";
import {prepareDefinitionSlots} from "./capability-slots.mjs";
import {validateRuleset} from "./configurator-validation.mjs";
import {validateFormulaAst} from "./operation-registries.mjs";
import {assertSafeRollFormula} from "./roll-grammar.mjs";
import {storageFingerprint} from "./configurator-storage.mjs";
import {readableId, freeId} from "./identity.mjs";
import {nextOrder} from "./definition-type-registry.mjs";
import {SYSTEM_EVENT_TYPES} from "./system-events.mjs";

export const QUESTION_KINDS = Object.freeze(["name", "text", "number", "integer", "boolean", "choice", "dice", "formula", "condition", "entry", "entries", "list", "event"]);
/** Bounds on what one plan reads: rows of a list, nesting of sub-paths and lists. */
export const ASSISTANT_LIMITS = Object.freeze({rows: 500, depth: 4});
/** Ruleset fields a path may fill while they are empty. */
const FILLABLE_RULESET_FIELDS = Object.freeze(["initiative", "initiative.defeatedConditionRef"]);

export const pathKey = (pathId, suffix) => `RTA.Assistant.Path.${pathId}.${suffix}`;
const optionValue = option => isRecord(option) ? option.value : option;
const nonempty = value => typeof value === "string" && value.trim().length > 0;
const literalNode = value => ({type: "literal", value});

/** Whether an entry answers an entry question: {collection, capability?, definitionTypeId?}. */
export function acceptsEntry(accept, entry) {
  if (!isRecord(entry)) return false;
  // A Definition Type answers for a capability it allows; a Definition, for one it has.
  const capabilities = accept.collection === "definitionTypes" ? entry.allowedCapabilities : entry.capabilities;
  if (accept.capability && !(capabilities ?? []).includes(accept.capability)) return false;
  if (accept.definitionTypeId && entry.definitionTypeId !== accept.definitionTypeId) return false;
  return true;
}
/** Entries of the Ruleset an entry question may use, for its picker. */
export function entryChoices(ruleset, accept) {
  return (ruleset?.[accept.collection] ?? []).filter(entry => acceptsEntry(accept, entry)).map(entry => ({id: entry.id, nameKey: entry.nameKey ?? entry.id}));
}
/** The event ids a Trigger may hear: the module's own, then the Ruleset's Event Types. */
export function eventChoices(ruleset) {
  return [...SYSTEM_EVENT_TYPES.map(type => ({id: type.id, nameKey: type.nameKey, system: true})), ...(ruleset?.eventTypes ?? []).map(type => ({id: type.id, nameKey: type.nameKey, system: false}))];
}

class AnswerReader {
  constructor(ruleset, paths, text = key => key) { this.ruleset = ruleset; this.paths = paths; this.text = text; this.errors = []; }
  error(path, code, detail = "") { this.errors.push({path, code, detail}); }
  path(id) { return this.paths.find(path => path.id === id) ?? null; }
  /** The visible questions of a path and their answers, defaults applied, in order. */
  read(path, answers, at = "", depth = 0) {
    const values = {};
    if (depth > ASSISTANT_LIMITS.depth) { this.error(at, "DEPTH"); return values; }
    if (answers !== undefined && !isRecord(answers)) { this.error(at, "TYPE", "answers must be an object"); return values; }
    for (const question of path.questions) {
      if (question.visible && !question.visible(values)) continue;
      const where = at ? `${at}.${question.id}` : question.id;
      let answer = answers?.[question.id];
      if (answer === undefined || answer === null || answer === "") answer = typeof question.default === "function" ? question.default(values) : question.default;
      if (answer === undefined || answer === null || answer === "") {
        if (question.required !== false) this.error(where, "MISSING");
        continue;
      }
      const value = this.value(path, question, answer, where, depth);
      if (value !== undefined) values[question.id] = value;
    }
    return values;
  }
  value(path, question, answer, where, depth) {
    const fail = (code, detail) => { this.error(where, code, detail); return undefined; };
    switch (question.kind) {
      case "name": {
        // {nameKey}: a name the path proposes, in the GM's language.
        const name = isRecord(answer) ? (answer.name ?? (nonempty(answer.nameKey) ? this.text(answer.nameKey) : undefined)) : answer;
        if (!nonempty(name)) return fail("TYPE", "a name");
        const id = isRecord(answer) && nonempty(answer.id) ? answer.id.trim() : null;
        if (id !== null && !/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(id)) return fail("TYPE", "an id of letters, digits, - or _");
        return {name: name.trim(), id};
      }
      case "text": return typeof answer === "string" ? answer : fail("TYPE", "text");
      case "number": case "integer": {
        const n = typeof answer === "string" && answer.trim() !== "" ? Number(answer) : answer;
        if (typeof n !== "number" || !Number.isFinite(n)) return fail("TYPE", "a number");
        if (question.kind === "integer" && !Number.isSafeInteger(n)) return fail("TYPE", "a whole number");
        if ((question.min !== undefined && n < question.min) || (question.max !== undefined && n > question.max)) return fail("RANGE", `${question.min ?? ""}..${question.max ?? ""}`);
        return n;
      }
      case "boolean": return typeof answer === "boolean" ? answer : fail("TYPE", "true or false");
      case "choice": return question.options.some(option => optionValue(option) === answer) ? answer : fail("OPTION", String(answer));
      case "dice": {
        if (typeof answer === "number" && Number.isFinite(answer)) answer = String(answer);
        if (!nonempty(answer)) return fail("TYPE", "a dice formula");
        try { assertSafeRollFormula(answer.trim()); } catch (error) { return fail("DICE", error.message); }
        return answer.trim();
      }
      case "formula": case "condition": {
        const node = typeof answer === "number" || typeof answer === "boolean" ? literalNode(answer) : answer;
        if (!isRecord(node)) return fail("FORMULA", "an expression");
        try { validateFormulaAst(node, where); } catch (error) { return fail("FORMULA", error.message); }
        return copyJSON(node);
      }
      case "event": return eventChoices(this.ruleset).some(choice => choice.id === answer) ? answer : fail("NOT_FOUND", String(answer));
      case "entry": return this.entry(question, answer, where, depth);
      case "entries": {
        if (!Array.isArray(answer)) return fail("TYPE", "a list");
        const values = answer.map((item, i) => this.entry(question, item, `${where}[${i}]`, depth)).filter(Boolean);
        if (question.min !== undefined && values.length < question.min) return fail("RANGE", `at least ${question.min}`);
        return values;
      }
      case "list": {
        if (!Array.isArray(answer)) return fail("TYPE", "a list of rows");
        if (answer.length > ASSISTANT_LIMITS.rows) return fail("TOO_MANY", String(ASSISTANT_LIMITS.rows));
        if (question.min !== undefined && answer.length < question.min) return fail("RANGE", `at least ${question.min}`);
        if (depth >= ASSISTANT_LIMITS.depth) return fail("DEPTH");
        return answer.map((row, i) => this.read({id: path.id, questions: question.fields}, row, `${where}[${i}]`, depth + 1));
      }
      default: return fail("TYPE", `unknown question kind ${question.kind}`);
    }
  }
  entry(question, answer, where, depth) {
    const fail = (code, detail) => { this.error(where, code, detail); return undefined; };
    const item = typeof answer === "string" ? {use: answer} : answer;
    if (!isRecord(item)) return fail("TYPE", "{use} or {create}");
    if (nonempty(item.use)) {
      const entry = (this.ruleset?.[question.accept.collection] ?? []).find(candidate => candidate.id === item.use);
      if (!entry) return fail("NOT_FOUND", item.use);
      if (!acceptsEntry(question.accept, entry)) return fail("NOT_ACCEPTED", item.use);
      const slotId = nonempty(item.slotId) ? item.slotId : null;
      // A slot of the capability asked for, or of any capability when the question takes any Definition.
      const slots = question.accept.capability ? entry.slots?.[question.accept.capability] : Object.values(entry.slots ?? {}).flat();
      if (slotId && !(slots ?? []).some(slot => slot.id === slotId)) return fail("NOT_FOUND", `${item.use}/${slotId}`);
      return {use: item.use, slotId: slotId ?? (question.accept.capability ? slots?.[0]?.id : null) ?? null};
    }
    if (isRecord(item.create)) {
      const sub = this.path(question.create);
      if (!sub) return fail("NOT_ACCEPTED", "this question only uses existing entries");
      if (depth >= ASSISTANT_LIMITS.depth) return fail("DEPTH");
      // Answers the question imposes on what it creates (a type of the capability it needs) win over the GM's.
      const imposed = Object.fromEntries((question.fixed ?? []).map(key => [key, question.default?.create?.[key]]));
      return {create: this.read(sub, {...item.create, ...imposed}, `${where}.create`, depth + 1), path: sub.id};
    }
    return fail("TYPE", "{use} or {create}");
  }
}

/** What one plan builds: entries to create, references appended, fields filled; ids unique in the Ruleset. */
class PlanBuilder {
  constructor(ruleset, paths, text) {
    this.ruleset = ruleset; this.paths = paths; this.text = text;
    this.created = []; this.additions = []; this.fills = []; this.reused = []; this.errors = [];
    this.taken = new Set(COLLECTION_FIELDS.flatMap(collection => (ruleset?.[collection] ?? []).map(entry => entry?.id)));
  }
  /** A new id: the one an answer gives (unique in its collection, checked when the entry is added), else one made from
   * the name and free in every collection. */
  newId(name, explicit = null) {
    if (explicit) { this.taken.add(explicit); return explicit; }
    const id = freeId(readableId(name) || "entry", this.taken);
    this.taken.add(id); return id;
  }
  find(collection, id) {
    return this.created.find(item => item.collection === collection && item.entry.id === id)?.entry
      ?? (this.ruleset?.[collection] ?? []).find(entry => entry.id === id) ?? null;
  }
  run(path, values) {
    const ctx = this.context(path, values);
    const main = path.build(ctx);
    return main ?? null;
  }
  context(path, values) {
    const builder = this;
    const resolved = new Map();
    const words = (key, vars) => String(builder.text(key)).replace(/\{(\w+)\}/g, (all, name) => vars[name] ?? all);
    return {
      values, ruleset: builder.ruleset,
      /** A name the path gives one of its entries (RTA.Assistant.Path.<path>.Text.<key>), and one all paths share (RTA.Assistant.Text.<key>). */
      t: (key, vars = {}) => words(pathKey(path.id, `Text.${key}`), vars),
      shared: (key, vars = {}) => words(`RTA.Assistant.Text.${key}`, vars),
      /** A name answer's display name, and a new id for it (its own id when the answer gives one). */
      name: value => value?.name ?? String(value ?? ""),
      id: value => builder.newId(value?.name ?? String(value ?? ""), value?.id ?? null),
      newId: name => builder.newId(name),
      find: (collection, id) => builder.find(collection, id),
      /** The first entry of a collection, existing or created by this plan, that the predicate accepts. */
      findWhere: (collection, predicate) => [...(builder.ruleset?.[collection] ?? []), ...builder.created.filter(item => item.collection === collection).map(item => item.entry)].find(predicate) ?? null,
      same: (a, b) => storageFingerprint(a) === storageFingerprint(b),
      /** Create an entry; meta fields are defaulted. Returns its id. */
      add(collection, entry) {
        if (!COLLECTION_FIELDS.includes(collection)) throw new Error(`Unknown collection: ${collection}.`);
        const siblings = [...(builder.ruleset?.[collection] ?? []), ...builder.created.filter(item => item.collection === collection).map(item => item.entry)];
        if (siblings.some(sibling => sibling?.id === entry.id)) { builder.errors.push({path: path.id, code: "ID_TAKEN", detail: entry.id}); return entry.id; }
        const order = nextOrder(siblings);
        const meta = collection === "definitionTypes" ? {descriptionKey: "", color: null, order, fields: {}, constraints: []} : collection === "tags" ? {descriptionKey: "", order}
          : collection === "permissionPolicies" ? {descriptionKey: "", enabled: true, order} : {descriptionKey: "", enabled: true, order, tags: []};
        builder.created.push({collection, entry: {...meta, ...copyJSON(entry)}, path: path.id});
        return entry.id;
      },
      /** Append items to a list field of an entry (created or existing). Nothing already there is changed. */
      append(collection, id, field, items) { builder.additions.push({collection, id, field, items: copyJSON(items), path: path.id}); },
      /** Set a Ruleset field (collection null) or an entry field that is still empty. */
      fill(collection, id, field, value) { builder.fills.push({collection, id, field, value: copyJSON(value), path: path.id}); },
      /** An entry answer: the entry used, or the one its sub-path created. {id, slotId, collection}. */
      entry(answer) {
        if (!answer) return null;
        if (answer.use) {
          if (!builder.reused.some(item => item.id === answer.use)) builder.reused.push({id: answer.use});
          return {id: answer.use, slotId: answer.slotId ?? null};
        }
        if (resolved.has(answer)) return resolved.get(answer);
        const sub = builder.paths.find(candidate => candidate.id === answer.path);
        const main = builder.run(sub, answer.create);
        resolved.set(answer, main);
        return main;
      }
    };
  }
  /** The patch: each touched collection whole, created entries prepared, additions and fills applied. */
  patch() {
    const patch = {};
    const collection = name => patch[name] ??= copyJSON(this.ruleset?.[name] ?? []);
    for (const item of this.created) {
      try {
        const entry = prepareCreated(item.collection, item.entry);
        collection(item.collection).push(entry);
        item.entry = entry;
      } catch (error) { this.errors.push({path: item.path, code: "BUILD", detail: `${item.collection} ${item.entry.id}: ${error.message}`}); }
    }
    for (const addition of this.additions) {
      const target = collection(addition.collection).find(entry => entry.id === addition.id);
      const list = target ? readPath(target, addition.field) : undefined;
      if (!Array.isArray(list)) { this.errors.push({path: addition.path, code: "ADD_TARGET", detail: `${addition.collection} ${addition.id}.${addition.field}`}); continue; }
      const present = new Set(list.map(item => storageFingerprint(item)));
      addition.added = 0;
      for (const item of addition.items) if (!present.has(storageFingerprint(item))) { list.push(item); present.add(storageFingerprint(item)); addition.added++; }
    }
    for (const fill of this.fills) {
      if (fill.collection === null) {
        if (!FILLABLE_RULESET_FIELDS.includes(fill.field)) { this.errors.push({path: fill.path, code: "FILL_TARGET", detail: fill.field}); continue; }
        const [field, child] = fill.field.split(".");
        const current = Object.hasOwn(patch, field) ? patch[field] : copyJSON(this.ruleset?.[field] ?? null);
        if (child) {
          if (!isRecord(current)) { this.errors.push({path: fill.path, code: "FILL_TARGET", detail: field}); continue; }
          if (!isEmpty(current[child])) { this.errors.push({path: fill.path, code: "ALREADY_SET", detail: fill.field}); continue; }
          patch[field] = {...current, [child]: fill.value};
          continue;
        }
        if (!isEmpty(current)) { this.errors.push({path: fill.path, code: "ALREADY_SET", detail: fill.field}); continue; }
        patch[field] = fill.value;
        continue;
      }
      const target = collection(fill.collection).find(entry => entry.id === fill.id);
      if (!target) { this.errors.push({path: fill.path, code: "FILL_TARGET", detail: `${fill.collection} ${fill.id}`}); continue; }
      if (!isEmpty(target[fill.field])) { this.errors.push({path: fill.path, code: "ALREADY_SET", detail: `${fill.id}.${fill.field}`}); continue; }
      target[fill.field] = fill.value;
    }
    return patch;
  }
}
const isEmpty = value => value === undefined || value === null || value === "";
function readPath(object, path) { return String(path).split(".").reduce((value, key) => value?.[key], object); }
function prepareCreated(collection, entry) {
  if (collection === "definitions") return {key: entry.id, data: {}, ...entry, slots: prepareDefinitionSlots(entry.slots, entry.capabilities)};
  if (collection === "definitionTypes") return {key: entry.id, allowedCapabilities: [], defaultCapabilities: [], requiredCapabilities: [], ...entry};
  return PREPARERS[collection] ? PREPARERS[collection](entry) : copyJSON(entry);
}
const diagnosticKey = diagnostic => `${diagnostic.code}|${diagnostic.path}|${diagnostic.message}`;

/**
 * Plan a path on a Ruleset draft without writing anything. text(key) gives the words of the entries a path names
 * itself (a Test's "Success"). Returns {valid, errors, warnings, created, added, filled, reused, main, patch, fingerprint}:
 * errors block applying it; warnings are what the new entries still lack before the Ruleset can be published.
 */
export function planAssistant(ruleset, pathId, answers, {paths, text = key => key} = {}) {
  const path = paths.find(candidate => candidate.id === pathId);
  if (!path) throw new Error(`Unknown assistant path: ${pathId}.`);
  const reader = new AnswerReader(ruleset, paths, text);
  const values = reader.read(path, answers ?? {});
  const result = {pathId, valid: false, errors: reader.errors, warnings: [], created: [], added: [], filled: [], reused: [], main: null, patch: {}, fingerprint: storageFingerprint(ruleset)};
  if (reader.errors.length) return result;
  const builder = new PlanBuilder(ruleset, paths, text);
  try { result.main = builder.run(path, values); } catch (error) { builder.errors.push({path: "", code: "BUILD", detail: error.message}); }
  const patch = builder.patch();
  result.errors = builder.errors;
  result.created = builder.created.map(item => ({collection: item.collection, id: item.entry.id, nameKey: item.entry.nameKey ?? item.entry.id}));
  result.added = builder.additions.filter(item => item.added).map(item => ({collection: item.collection, id: item.id, field: item.field, count: item.added}));
  result.filled = builder.fills.map(item => ({collection: item.collection, id: item.id, field: item.field}));
  result.reused = builder.reused;
  result.patch = patch;
  if (result.errors.length) return result;
  const candidate = {...copyJSON(ruleset), ...copyJSON(patch)};
  const saved = validateRuleset(candidate, {scope: "save"});
  for (const diagnostic of saved.errors) result.errors.push({path: diagnostic.path, code: "INVALID", detail: diagnostic.message});
  const before = new Set(validateRuleset(ruleset, {scope: "publish"}).errors.map(diagnosticKey));
  result.warnings = validateRuleset(candidate, {scope: "publish"}).errors.filter(diagnostic => !before.has(diagnosticKey(diagnostic))).map(diagnostic => ({path: diagnostic.path, code: diagnostic.code, detail: diagnostic.message}));
  result.valid = result.errors.length === 0;
  return result;
}

const labelOf = (pathId, keyAt, question) => question.labelKey ?? pathKey(pathId, `Q.${keyAt}.Label`);
const optionLabelOf = (pathId, keyAt, option) => option?.labelKey ?? pathKey(pathId, `Q.${keyAt}.Option.${optionValue(option)}`);
const fallbackOf = (question, values) => typeof question.default === "function" ? question.default(values) : question.default;

/** The questions a path shows now (visible ones, with their words and the entries they may use), for the interface.
 * A list field also says, row by row, which of its fields that row shows. */
export function describeAssistantPath(ruleset, pathId, answers = {}, {paths, text = key => key}) {
  const path = paths.find(candidate => candidate.id === pathId);
  if (!path) throw new Error(`Unknown assistant path: ${pathId}.`);
  const reader = new AnswerReader(ruleset, paths, text);
  const visibleIn = (questions, answers) => {
    const values = {}, shown = [];
    for (const question of questions) {
      if (question.visible && !question.visible(values)) continue;
      shown.push(question);
      const answer = answers?.[question.id] ?? fallbackOf(question, values);
      if (answer === undefined || answer === null || answer === "") continue;
      const value = reader.value(path, question, answer, question.id, 1);
      if (value !== undefined) values[question.id] = value;
    }
    return {shown, values};
  };
  const describe = (question, keyAt, values, answer) => {
    const view = {id: question.id, kind: question.kind, labelKey: labelOf(path.id, keyAt, question), required: question.required !== false};
    // A name whose id other rules read (an input read by Formulas): the GM may give that id.
    if (question.withId) view.withId = true;
    if (question.kind === "choice") view.options = question.options.map(option => ({value: optionValue(option), labelKey: optionLabelOf(path.id, keyAt, option)}));
    if (question.kind === "entry" || question.kind === "entries") { view.accept = copyJSON(question.accept); view.choices = entryChoices(ruleset, question.accept); view.create = question.create ?? null; view.fixed = [...(question.fixed ?? [])]; }
    if (question.kind === "event") view.choices = eventChoices(ruleset);
    if (question.kind === "list") {
      view.fields = question.fields.map(field => describe(field, `${keyAt}.Field.${field.id}`, {}, undefined));
      view.rows = (Array.isArray(answer) ? answer : []).map(row => visibleIn(question.fields, row).shown.map(field => field.id));
    }
    for (const key of ["min", "max"]) if (question[key] !== undefined) view[key] = question[key];
    const fallback = fallbackOf(question, values);
    if (fallback !== undefined) view.default = copyJSON(fallback);
    return view;
  };
  const {shown, values} = visibleIn(path.questions, answers);
  return {id: path.id, group: path.group, titleKey: pathKey(path.id, "Title"), summaryKey: pathKey(path.id, "Summary"), limitsKey: pathKey(path.id, "Limits"),
    questions: shown.map(question => describe(question, question.id, values, answers?.[question.id]))};
}

/** Every text key a path uses: its card, its questions and options, the names it gives its own entries. */
export function assistantPathTextKeys(path) {
  const keys = new Set(["Title", "Summary", "Limits"].map(suffix => pathKey(path.id, suffix)));
  const walk = (questions, prefix) => {
    for (const question of questions) {
      const keyAt = prefix ? `${prefix}.Field.${question.id}` : question.id;
      keys.add(labelOf(path.id, keyAt, question));
      if (question.kind === "choice") for (const option of question.options) keys.add(optionLabelOf(path.id, keyAt, option));
      if (question.kind === "list") walk(question.fields, keyAt);
    }
  };
  walk(path.questions, "");
  for (const key of path.texts ?? []) keys.add(pathKey(path.id, `Text.${key}`));
  return [...keys];
}
