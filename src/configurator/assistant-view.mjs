/** The assistant window's models: the form of a path (its visible questions, sub-paths drawn inline) and the preview of
 * its plan, for src/ui/assistant-markup.mjs. Pure: words come from t(key) (module text) and entryName(nameKey) (Ruleset
 * text); answers are addressed by dotted paths ("test.create.dice", "items.0.name"), the same as the form's controls. */

const isRecord = value => value !== null && typeof value === "object" && !Array.isArray(value);
const empty = value => value === undefined || value === null || value === "";
const segments = path => String(path).split(".").filter(Boolean);

/** Collections an entry of the preview may be opened in, by editor kind. */
export const ASSISTANT_ENTRY_KINDS = Object.freeze({definitionTypes: "definitionType", definitions: "definition", parameters: "parameter", formulas: "formula", formulaBindings: "formulaBinding",
  conditions: "condition", rolls: "roll", outcomes: "outcome", tests: "test", effects: "effect", actions: "action", permissionPolicies: "permissionPolicy", eventTypes: "eventType",
  triggers: "trigger", contentTypes: "contentType", modifiers: "modifier", durations: "duration", dice: "die", tables: "table", scales: "scale", creationSystems: "creationSystem",
  progressionSystems: "progressionSystem"});
/** Font Awesome icons of the path list: each group, and each path. */
export const ASSISTANT_GROUP_ICONS = Object.freeze({core: "fa-cubes", systems: "fa-gears", bricks: "fa-puzzle-piece"});
export const ASSISTANT_PATH_ICONS = Object.freeze({
  characteristics: "fa-dumbbell", skills: "fa-graduation-cap", derivedValue: "fa-calculator", resource: "fa-heart-pulse", test: "fa-dice-d20",
  attack: "fa-crosshairs", state: "fa-face-dizzy", cost: "fa-coins", consumable: "fa-flask", level: "fa-stairs", encumbrance: "fa-weight-hanging",
  advantage: "fa-scale-unbalanced", damageTypes: "fa-fire", power: "fa-hat-wizard", threshold: "fa-skull", rest: "fa-bed", initiative: "fa-list-ol",
  creation: "fa-user-plus", progression: "fa-arrow-trend-up", scale: "fa-ruler", contentType: "fa-box-open", permission: "fa-lock",
  definitionType: "fa-shapes", value: "fa-hashtag", parameter: "fa-sliders", formula: "fa-square-root-variable", condition: "fa-code-branch",
  roll: "fa-dice", outcome: "fa-flag-checkered", duration: "fa-hourglass-half", effect: "fa-bolt", action: "fa-hand-pointer", trigger: "fa-bell",
  table: "fa-table", die: "fa-dice-six", counter: "fa-list-check", bounds: "fa-arrows-up-to-line"});
/** The collection whose section color a path card takes: what it produces, else Systems (initiative). */
export const pathCollection = path => path?.produces?.collection ?? "creationSystems";
const NAV_KEYS = {permissionPolicies: "Permissions", eventTypes: "Events"};
/** The navigation title of a collection (RTA.Nav.*). */
export const collectionTitleKey = collection => `RTA.Nav.${NAV_KEYS[collection] ?? collection.charAt(0).toUpperCase() + collection.slice(1)}`;

/** The answer at a dotted path. */
export const answerAt = (answers, path) => segments(path).reduce((value, key) => value?.[key], answers);
/** Set the answer at a dotted path; a numeric segment is a row of a list. */
export function setAnswer(answers, path, value) {
  const keys = segments(path);
  let node = answers;
  keys.forEach((key, i) => {
    if (i === keys.length - 1) { node[key] = value; return; }
    if (!isRecord(node[key]) && !Array.isArray(node[key])) node[key] = /^\d+$/.test(keys[i + 1]) ? [] : {};
    node = node[key];
  });
  return answers;
}
/** An engine path (items[0].name) as a form path (items.0.name). */
export const formPath = path => String(path ?? "").replace(/\[(\d+)\]/g, ".$1");

/** The answer a question starts with: an entry question with nothing to choose from creates a new entry. */
function startingAnswer(question) {
  if (!empty(question.default)) return question.default;
  if (question.kind === "entry" && question.create && question.required && !question.choices.length) return {create: {}};
  return undefined;
}
/** Lists a GM must fill start with one row, so the form shows its fields. */
export function seedAnswers(path, answers) {
  const seeded = structuredClone(answers ?? {});
  for (const question of path.questions) if (question.kind === "list" && (question.min ?? 0) > 0 && !Array.isArray(seeded[question.id])) seeded[question.id] = [{}];
  return seeded;
}

/**
 * The form of a path. describe(pathId, answers) is the API's describeAssistantPath; errors maps form paths to messages.
 * Returns {path, fields, answers, labels}: answers are seeded (lists, defaults of entry questions), labels map each
 * form path to its question's words (for the preview's errors).
 */
export function assistantFormModel(pathId, answers, {describe, paths, t, entryName, errors = {}, prefix = "", depth = 0}) {
  const pathDef = paths.find(path => path.id === pathId);
  const seeded = seedAnswers(pathDef, answers);
  const view = describe(pathId, seeded);
  const labels = {};
  const field = (question, at, answer, rowValues) => {
    const label = t(question.labelKey), model = {path: at, kind: question.kind, label, required: question.required, error: errors[at] ?? ""};
    labels[at] = label;
    const value = empty(answer) ? startingAnswer(question) : answer;
    switch (question.kind) {
      case "name":
        model.value = isRecord(value) ? (value.name ?? (value.nameKey ? t(value.nameKey) : "")) : value ?? "";
        if (question.withId) model.id = isRecord(value) ? value.id ?? "" : "";
        break;
      case "text": case "dice": model.value = value ?? ""; break;
      case "number": case "integer": model.value = value ?? ""; model.min = question.min; model.max = question.max; model.step = question.kind === "integer" ? "1" : "any"; break;
      case "boolean": model.checked = value === true; break;
      case "choice": model.options = question.options.map(option => ({value: option.value, label: t(option.labelKey), selected: option.value === value})); break;
      case "event": model.options = question.choices.map(choice => ({value: choice.id, label: entryName(choice.nameKey), selected: choice.id === value})); break;
      case "entries": {
        const chosen = new Set((Array.isArray(value) ? value : []).map(item => typeof item === "string" ? item : item?.use));
        model.options = question.choices.map(choice => ({value: choice.id, label: entryName(choice.nameKey), selected: chosen.has(choice.id)}));
        break;
      }
      case "entry": {
        const use = typeof value === "string" ? value : value?.use, creating = isRecord(value?.create);
        model.options = question.choices.map(choice => ({value: `use:${choice.id}`, label: entryName(choice.nameKey), selected: choice.id === use}));
        if (question.create) {
          const sub = paths.find(path => path.id === question.create);
          model.create = {value: "create", label: t("RTA.Assistant.CreateNew").replace("{path}", t(`RTA.Assistant.Path.${sub.id}.Title`)), selected: creating};
          if (creating && depth < 3) {
            // What the question imposes on the new entry (a type's capability) is not asked again.
            model.fixed = Object.fromEntries((question.fixed ?? []).map(key => [key, question.default?.create?.[key]]));
            const inner = assistantFormModel(sub.id, {...value.create, ...model.fixed}, {describe, paths, t, entryName, errors, prefix: `${at}.create`, depth: depth + 1});
            model.sub = inner.fields.filter(item => !Object.hasOwn(model.fixed, item.path.split(".").at(-1))); Object.assign(labels, inner.labels);
          }
        }
        break;
      }
      case "formula": case "condition": {
        const node = typeof value === "number" || typeof value === "boolean" ? {type: "literal", value} : value;
        model.enabled = question.required || isRecord(node);
        model.expression = isRecord(node) ? node : question.kind === "condition" ? {type: "gte", left: {type: "literal", value: 0}, right: {type: "literal", value: 0}} : {type: "literal", value: 0};
        break;
      }
      case "list": {
        const rows = Array.isArray(value) ? value : [];
        model.rows = rows.map((row, i) => {
          const shown = new Set(question.rows[i] ?? question.fields.map(item => item.id));
          return {path: `${at}.${i}`, removable: rows.length > (question.min ?? 0), fields: question.fields.filter(item => shown.has(item.id)).map(item => field(item, `${at}.${i}.${item.id}`, row?.[item.id], row))};
        });
        break;
      }
    }
    return model;
  };
  const fields = view.questions.map(question => field(question, prefix ? `${prefix}.${question.id}` : question.id, seeded[question.id]));
  return {path: view, fields, answers: answersOf(fields), labels};
}

/** The answers a form shows, as the window reads them back from its controls: what the plan is made of. */
export function answersOf(fields) {
  const answers = {};
  for (const field of fields) {
    const key = field.path.split(".").at(-1);
    let value;
    switch (field.kind) {
      case "name": value = field.value === "" ? undefined : field.id ? {name: field.value, id: field.id} : field.value; break;
      case "text": case "dice": case "number": case "integer": value = field.value === "" ? undefined : field.value; break;
      case "boolean": value = field.checked; break;
      case "choice": case "event": value = field.options.find(option => option.selected)?.value; break;
      case "entries": value = field.options.filter(option => option.selected).map(option => ({use: option.value})); break;
      case "entry": {
        const used = field.options.find(option => option.selected);
        value = used ? {use: used.value.slice(4)} : field.create?.selected ? {create: {...answersOf(field.sub ?? []), ...field.fixed}} : undefined;
        break;
      }
      case "formula": case "condition": value = field.enabled ? field.expression : undefined; break;
      case "list": value = field.rows.map(row => answersOf(row.fields)); break;
    }
    if (value !== undefined) answers[key] = value;
  }
  return answers;
}

/** The shape of a form (which controls it shows), to tell whether an answer changed what is shown. */
export function formShape(fields) {
  return JSON.stringify(fields.map(field => [field.path, field.kind, field.create?.selected ?? null, field.enabled ?? null, field.sub ? JSON.parse(formShape(field.sub)) : null,
    field.rows ? field.rows.map(row => JSON.parse(formShape(row.fields))) : null]));
}

/** Errors whose detail is data the GM recognises (an id, bounds, a field); the others' detail is the engine's own wording. */
const SHOWN_DETAILS = ["RANGE", "OPTION", "NOT_FOUND", "NOT_ACCEPTED", "TOO_MANY", "ID_TAKEN", "ALREADY_SET", "BUILD", "INVALID"];

/** The preview of a plan: what it creates, uses, adds, fills and changes, its errors (by question) and the warnings left for publishing. */
export function assistantPreviewModel(plan, {t, entryName, labels = {}, ruleset = {}}) {
  const nameOf = (collection, id) => entryName((ruleset[collection] ?? []).find(entry => entry.id === id)?.nameKey ?? id);
  const fieldLabel = field => { const key = `RTA.Assistant.Field.${String(field).replace(/\./g, "_")}`, words = t(key); return words === key ? field : words; };
  return {
    valid: plan.valid,
    errors: plan.errors.map(error => {
      const at = formPath(error.path), label = labels[at] ?? "", message = t(`RTA.Assistant.Error.${error.code}`);
      return {path: at, label, message: error.detail && SHOWN_DETAILS.includes(error.code) ? `${message} (${error.detail})` : message};
    }),
    created: plan.created.map(item => ({collection: item.collection, id: item.id, kind: ASSISTANT_ENTRY_KINDS[item.collection] ?? null, name: entryName(item.nameKey), type: t(collectionTitleKey(item.collection))})),
    reused: plan.reused.map(item => {
      const collection = Object.keys(ASSISTANT_ENTRY_KINDS).find(name => (ruleset[name] ?? []).some(entry => entry.id === item.id));
      return {id: item.id, name: collection ? nameOf(collection, item.id) : item.id, type: collection ? t(collectionTitleKey(collection)) : ""};
    }),
    added: plan.added.map(item => ({name: nameOf(item.collection, item.id), field: fieldLabel(item.field), count: item.count})),
    filled: plan.filled.map(item => ({name: item.collection ? nameOf(item.collection, item.id) : "", field: fieldLabel(item.field)})),
    // A changed setting, before and after: a number, a Formula by its name (one this plan creates too), or none.
    changed: (plan.changed ?? []).map(item => {
      const shown = source => !source ? t("RTA.Assistant.Word.None") : Object.hasOwn(source, "literal") ? String(source.literal)
        : entryName((ruleset.formulas ?? []).find(entry => entry.id === source.formulaRef)?.nameKey ?? plan.created.find(entry => entry.collection === "formulas" && entry.id === source.formulaRef)?.nameKey ?? source.formulaRef);
      return {name: nameOf(item.collection, item.id), field: fieldLabel(item.field), before: shown(item.before), after: shown(item.after)};
    }),
    warnings: plan.warnings.map(warning => warning.detail)
  };
}
