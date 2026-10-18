// Shared builder for the D&D 2024 (SRD 5.2) Ruleset: the collections being filled, the AST helpers and the
// constructors of every kind of entry. Every other file of outils/ adds its part through these.
import {readFileSync} from "node:fs";

export const C = Object.fromEntries(["definitionTypes", "definitions", "parameters", "formulas", "formulaBindings", "conditions", "rolls", "outcomes", "tests", "effects", "actions", "permissionPolicies", "eventTypes", "triggers", "contentTypes", "contentTemplates", "modifiers", "durations", "tables", "scales", "creationSystems", "progressionSystems", "sheetDefinitions", "tags"].map(k => [k, []]));
const orders = {};
const index = {};
export const add = (collection, entry) => {
  orders[collection] = (orders[collection] ?? 0) + 10;
  index[collection] ??= new Map();
  if (index[collection].has(entry.id)) throw new Error(`duplicate ${collection}/${entry.id}`);
  const row = {order: orders[collection], ...entry};
  C[collection].push(row); index[collection].set(entry.id, row);
  return entry.id;
};
export const get = (collection, id) => index[collection]?.get(id);
export const has = (collection, id) => index[collection]?.has(id) ?? false;
export const generic = extra => ({descriptionKey: "", enabled: true, tags: [], ...extra});
export const slug = s => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/* ---------- SRD 5.2 data and its French translation ---------- */
let srdDir = null, fr = null;
export function loadSources(dir, frFile) { srdDir = dir; fr = JSON.parse(readFileSync(frFile, "utf8")); }
const cache = {};
export const srd = name => cache[name] ??= JSON.parse(readFileSync(`${srdDir}/5e-SRD-${name}.json`, "utf8"));
/** tr("spells", "fireball", "name", "Fireball"): the French text, else the fallback (English). */
export const tr = (category, key, field, fallback = "") => {
  const table = category.startsWith("misc.") ? fr.misc[category.slice(5)] : fr[category];
  const value = table?.[key]?.[field];
  return typeof value === "string" && value.trim() ? value : fallback;
};
export const trEntry = (category, key) => (category.startsWith("misc.") ? fr.misc[category.slice(5)] : fr[category])?.[key] ?? null;
export const ft = feet => Math.round(feet * 0.3 * 100) / 100; // feet to metres, as the French books do (5 ft = 1.5 m)

/* ---------- References and AST helpers ---------- */
export const val = id => ({objectKind: "definition", objectId: id, capabilityId: "value", outputId: "value.final"});
export const base = id => ({objectKind: "definition", objectId: id, capabilityId: "value", outputId: "value.base"});
export const pool = (id, out = "pool.current") => ({objectKind: "definition", objectId: id, capabilityId: "pool", slotId: "points", outputId: out});
export const st = id => ({objectKind: "definition", objectId: id, capabilityId: "state", outputId: "state.active"});
export const ref = (reference, container) => container ? {type: "reference", reference, container} : {type: "reference", reference};
export const lit = value => ({type: "literal", value});
export const par = id => ({type: "parameter", id});
export const ctx = path => ({type: "context", path});
export const fx = id => ({type: "formula", id});
export const sum = (...args) => ({type: "add", args});
export const sub = (...args) => ({type: "subtract", args});
export const mul = (...args) => ({type: "multiply", args});
export const div = (...args) => ({type: "divide", args});
export const max = (...args) => ({type: "max", args});
export const min = (...args) => ({type: "min", args});
export const floor = value => ({type: "floor", value});
export const ceil = value => ({type: "ceil", value});
export const and = (...args) => ({type: "and", args});
export const or = (...args) => ({type: "or", args});
export const not = value => ({type: "not", value});
export const cf = (field, fallback) => fallback === undefined ? {type: "contentField", field} : {type: "contentField", field, default: lit(fallback)};
export const defVal = (definition, container) => ({type: "definitionValue", definition, capabilityId: "value", outputId: "value.final", ...(container ? {container} : {})});
export const defState = (definition, container) => ({type: "definitionValue", definition, capabilityId: "state", outputId: "state.active", ...(container ? {container} : {})});
export const defField = (definition, field) => ({type: "definitionField", definition, field});
export const iff = (condition, then, otherwise) => ({type: "if", condition, then, else: otherwise});
export const cmp = (type, left, right) => ({type, left, right});
export const eq = (a, b) => cmp("eq", a, b), neq = (a, b) => cmp("neq", a, b), gt = (a, b) => cmp("gt", a, b), gte = (a, b) => cmp("gte", a, b), lt = (a, b) => cmp("lt", a, b), lte = (a, b) => cmp("lte", a, b);
export const lookup = (key, table, fallback = null) => ({type: "lookup", key, table: Object.entries(table).map(([k, value]) => ({key: /^-?\d+$/.test(k) ? Number(k) : k, value})), default: lit(fallback)});
export const range = (value, ranges) => ({type: "rangeLookup", value, ranges});
export const holds = (id, container) => ref(st(id), container); // a state Definition held (active) on the role
export const value = (id, container) => ref(val(id), container);

/* ---------- Constructors ---------- */
export const P = (id, nameKey, value, descriptionKey = "", valueType = "integer") => add("parameters", generic({id, nameKey, descriptionKey, valueType, value, scope: "ruleset"}));
export const DT = (id, nameKey, caps, fields = {}, descriptionKey = "", color = null, more = {}) => add("definitionTypes", {id, key: id, nameKey, descriptionKey, color, allowedCapabilities: caps, defaultCapabilities: caps, requiredCapabilities: caps, fields, constraints: [], ...more});
export const textField = (id, name) => ({id, name, valueType: "string", cardinality: "one", required: false, nullable: false, constraints: []});
export const numberField = (id, name) => ({id, name, valueType: "integer", cardinality: "one", required: false, nullable: false, constraints: []});
export const D = (id, typeId, nameKey, data = {}, extra = {}) => {
  const type = get("definitionTypes", typeId);
  if (!type) throw new Error(`unknown Definition Type ${typeId}`);
  return add("definitions", {id, key: id, definitionTypeId: typeId, nameKey, descriptionKey: "", data, capabilities: type.allowedCapabilities, enabled: true, tags: [], ...extra});
};
/** A pool Definition: its current points between 0 (or minimum) and a maximum Formula or number. */
export const POOL = (id, typeId, nameKey, maximum, data = {}, extra = {}, slot = {}) => D(id, typeId, nameKey, data, {...extra, slots: {pool: [{id: "points", name: nameKey, valueType: "integer", minimum: {literal: 0}, maximum: typeof maximum === "number" ? {literal: maximum} : {formulaRef: maximum}, underflowPolicy: "clamp", overflowPolicy: "clamp", maximumPolicy: "keepMissing", order: 0, ...slot}]}});
export const F = (id, nameKey, expression, descriptionKey = "", resultType = "number") => add("formulas", generic({id, nameKey, descriptionKey, resultType, expression}));
/** A Formula naming a Definition: its branches' ids become Definition references (null names none). */
const asDefinition = v => typeof v === "string" ? {objectKind: "definition", objectId: v} : v;
const asRef = e => {
  if (!e || typeof e !== "object") return e;
  if (e.type === "literal") return {...e, value: asDefinition(e.value)};
  if (e.type === "if") return {...e, then: asRef(e.then), else: asRef(e.else)};
  // Tables hold scalars only: a table of ids becomes a chain of if.
  const lit_ = v => ({type: "literal", value: asDefinition(v)});
  if (e.type === "lookup") return e.table.reduceRight((otherwise, row) => ({type: "if", condition: {type: "eq", left: e.key, right: {type: "literal", value: row.key}}, then: lit_(row.value), else: otherwise}), asRef(e.default));
  if (e.type === "rangeLookup") return e.ranges.reduceRight((otherwise, row) => row.max === undefined ? lit_(row.value) : {type: "if", condition: {type: "lte", left: e.value, right: {type: "literal", value: row.max}}, then: lit_(row.value), else: otherwise}, {type: "literal", value: null});
  return e;
};
export const FR = (id, nameKey, expression, descriptionKey = "") => F(id, nameKey, asRef(expression), descriptionKey, "reference");
export const FB = (id, nameKey, formulaRef, targetRef) => add("formulaBindings", generic({id, nameKey, formulaRef, targetRef}));
/** A derived value: its Formula, bound to its value.final. */
export const DERIVE = (definitionId, expression, descriptionKey = "") => {
  const formulaId = `calcul-${definitionId}`;
  F(formulaId, `Calcul : ${get("definitions", definitionId).nameKey}`, expression, descriptionKey);
  FB(`lien-${definitionId}`, get("definitions", definitionId).nameKey, formulaId, val(definitionId));
  return formulaId;
};
export const K = (id, nameKey, expression, descriptionKey = "") => add("conditions", generic({id, nameKey, descriptionKey, expression}));
/** A predicate used by several rules: a boolean Formula (si-<id>, readable inside other Formulas) and the Condition reading it. */
export const KF = (id, nameKey, expression, descriptionKey = "") => { F(`si-${id}`, nameKey, expression, descriptionKey, "boolean"); return K(id, nameKey, fx(`si-${id}`), descriptionKey); };
export const is = id => fx(`si-${id}`);
export const R = (id, nameKey, formula, variants = [], descriptionKey = "") => add("rolls", generic({id, nameKey, descriptionKey, formula, data: {}, variants}));
export const O = (id, nameKey, resultKey, conditionRef, descriptionKey = "") => add("outcomes", generic({id, nameKey, descriptionKey, resultKey, conditionRef, labelKey: nameKey}));
export const T = (id, nameKey, more) => add("tests", generic({id, nameKey, rollRef: null, inputBindings: [], bonusFormulaRef: null, totalFormulaRef: null, targetFormulaRef: null, targetValue: null, marginFormulaRef: null, outcomeRefs: [], fallbackOutcomeRef: null, ...more}));
export const E = (id, nameKey, targetRef, operation, operand, targetRole = "self", descriptionKey = "", more = {}) => add("effects", generic({id, nameKey, descriptionKey, targetRef, targetRole, operation, operand, ...more}));
export const M = (id, nameKey, targetRef, operation, valueSource, conditionRefs = [], descriptionKey = "", more = {}) => add("modifiers", generic({id, nameKey, descriptionKey, targetRef, operation, valueSource, conditionRefs, stacking: {mode: "stack", group: ""}, priority: 0, ...more}));
export const A = (id, nameKey, more = {}) => add("actions", generic({id, nameKey, conditionRefs: [], costEffectRefs: [], acquisitions: [], stateRemovals: [], stateApplications: [], modifierApplications: [], effectRefs: [], testRef: null, outcomeMappings: [], eventTypeRefs: [], ...more}));
export const stateApply = (definitionId, targetRole = "target", more = {}) => ({definitionId, targetRole, durationRef: "jusqu-au-retrait", stacking: "ignore", stacks: 1, severity: null, modifierRefs: [], ...more});
export const stateApplyF = (definitionFormulaRef, targetRole = "target", more = {}) => ({definitionFormulaRef, targetRole, durationRef: "jusqu-au-retrait", stacking: "ignore", stacks: 1, severity: null, modifierRefs: [], ...more});
export const stateRemove = (definitionId, targetRole = "target") => ({definitionId, targetRole});
export const stateRemoveF = (definitionFormulaRef, targetRole = "target") => ({definitionFormulaRef, targetRole});
export const TRIG = (id, nameKey, eventTypeId, actionRefs, more = {}) => add("triggers", generic({id, nameKey, eventTypeId, eventFilter: null, conditionRefs: [], actionRefs, ...more}));
export const field = (id, name, valueType, more = {}) => ({id, name, valueType, cardinality: "one", required: false, nullable: false, constraints: [], ...more});
export const intF = (id, name, more = {}) => field(id, name, "integer", more);
export const txtF = (id, name, more = {}) => field(id, name, "string", more);
export const boolF = (id, name, more = {}) => field(id, name, "boolean", more);
export const numF = (id, name, more = {}) => field(id, name, "number", more);
export const CT = (id, nameKey, storageKind, fields, descriptionKey = "", runtimeMode = "unique", color = null, more = {}) => add("contentTypes", generic({id, nameKey, descriptionKey, image: "", color, storageKind, documentSubtype: "", runtimeMode, fields, ...more}));
export const TPL = (id, nameKey, contentTypeId, data, more = {}) => add("contentTemplates", generic({id, nameKey, image: "", data, contentTypeId, acquisitionActionRef: null, choiceGroups: [], capabilities: [], runtimeMode: null, relations: [], ...more}));
export const grant = (id, objectKind, objectId, initial, more = {}) => ({id, operation: "grant", targetRef: {objectKind, objectId}, ...(initial ? {config: {initial}} : {}), ...more});
export const grantDef = (id, initial) => grant(id, "definition", id, initial);
export const grantAdd = (id, amount) => ({id, operation: "grant", targetRef: {objectKind: "definition", objectId: id}, config: {add: {"value.base": amount}}});
export const grantAction = id => grant(`action-${id}`, "action", id);
export const grantItem = (id, templateId, count = 1, fields) => ({id, operation: "grant", targetRef: {objectKind: "contentTemplate", objectId: templateId}, config: {count, ...(fields ? {fields} : {})}});
export const link = (id, objectKind, objectId) => ({id, operation: "link", targetRef: {objectKind, objectId}});
/** Markdown and stray spaces of the SRD texts, kept readable as plain text. */
export const clean = text => String(text ?? "").replace(/\r/g, "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();

/* ---------- Shared ids ---------- */
export const ABILITIES = [["str", "force", "Force", "For"], ["dex", "dexterite", "Dextérité", "Dex"], ["con", "constitution", "Constitution", "Con"], ["int", "intelligence", "Intelligence", "Int"], ["wis", "sagesse", "Sagesse", "Sag"], ["cha", "charisme", "Charisme", "Cha"]];
export const AB = Object.fromEntries(ABILITIES.map(([k, id]) => [k, id]));
for (const [, id, name] of ABILITIES) AB[name.toLowerCase()] = id;
Object.assign(AB, {strength: "force", dexterity: "dexterite", constitution: "constitution", intelligence: "intelligence", wisdom: "sagesse", charisma: "charisme"});
export const CLASS_IDS = {barbarian: "barbare", bard: "barde", cleric: "clerc", druid: "druide", fighter: "guerrier", monk: "moine", paladin: "paladin", ranger: "rodeur", rogue: "roublard", sorcerer: "ensorceleur", warlock: "occultiste", wizard: "magicien"};
export const CONDITIONS = {blinded: "aveugle", charmed: "charme", deafened: "assourdi", frightened: "effraye", grappled: "agrippe", incapacitated: "neutralise", invisible: "invisible", paralyzed: "paralyse", petrified: "petrifie", poisoned: "empoisonne", prone: "a-terre", restrained: "entrave", stunned: "etourdi", unconscious: "inconscient"};
export const DAMAGE = {acid: "acide", bludgeoning: "contondant", cold: "froid", fire: "feu", force: "force", lightning: "foudre", necrotic: "necrotique", piercing: "perforant", poison: "poison", psychic: "psychique", radiant: "radiant", slashing: "tranchant", thunder: "tonnerre"};
/** Pieces other files add to the rules built last (derived values, rests, the socle of a character). */
export const PIECES = {vitesse: [], pvMaximum: [], caBonus: [], caMinimum: [], caSansArmure: [], reposCourt: [], reposLong: [], reposLongEtats: [], socle: [], communs: [], creatureCommuns: []};

/** Aptitude ids (class and subclass features, species traits), from their French names, by SRD index. */
const APT = new Map();
export function registerAptitudes() {
  const used = new Set();
  const unique = id => { let out = id, n = 2; while (used.has(out)) out = `${id}-${n++}`; used.add(out); return out; };
  const classOf = index => slug(tr("misc.Classes", index, "name", index));
  for (const f of srd("Features")) {
    const name = slug(tr("features", f.index, "name", f.name));
    const owner = f.subclass ? slug(tr("misc.Subclasses", f.subclass.index, "name", f.subclass.index)).replace(/^(voie|college|domaine|cercle|serment|protecteur|sorcellerie|guerrier)-(du-|de-la-|de-l-|des-|de-|d-)?/, "") : classOf(f.class.index);
    APT.set(f.index, unique(name.includes(owner) ? name : `${name}-${owner}`));
  }
  for (const t of srd("Traits")) APT.set(t.index, unique(`${slug(tr("traits", t.index, "name", t.name))}${t.index.startsWith("lineage-spell-") ? "-lignage" : ""}`));
}
export const apt = index => { const id = APT.get(index); if (!id) throw new Error(`unknown aptitude ${index}`); return id; };
export const aptIndexes = () => [...APT.keys()];
