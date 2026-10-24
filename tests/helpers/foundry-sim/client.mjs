/* One connected Foundry client (worker thread): the globals rule-them-all.mjs reads, its documents kept in sync by the
   simulated server, then the real module through init, i18nInit, setup and ready. Only what the module uses is here,
   with Foundry's own rules where they matter to several clients: who may write what, which client runs a hook,
   in which order a combat signals its changes. */
import {parentPort, workerData} from "node:worker_threads";
import {applyChanges, clone, FORCED, getProperty, OWNERSHIP, ROLES, seededRandom, userLevel} from "./documents.mjs";

const {userId, snapshot, options = {}} = workerData;
const ROOT = new URL("../../../", import.meta.url);
const post = message => parentPort.postMessage(message);

// Console and notifications are kept by the test: an error logged by any client is a failure to look at.
const log = (level, args) => post({kind: "log", entry: {level, message: args.map(arg => arg instanceof Error ? `${arg.message}\n${arg.stack}` : typeof arg === "string" ? arg : (() => { try { return JSON.stringify(arg); } catch { return String(arg); } })()).join(" ")}});
for (const level of ["error", "warn"]) console[level] = (...args) => log(level, args);
console.log = () => {};
process.on("unhandledRejection", error => log("error", ["Unhandled rejection", error]));

let requests = 0;
const pending = new Map();
function request(op, payload) {
  const requestId = ++requests;
  return new Promise((resolve, reject) => { pending.set(requestId, {resolve, reject}); post({kind: "request", requestId, op, payload: clone(payload)}); });
}

class Collection extends Map {
  *[Symbol.iterator]() { yield* this.values(); }
  get contents() { return [...this.values()]; }
  find(fn) { for (const value of this.values()) if (fn(value)) return value; return undefined; }
  filter(fn) { return this.contents.filter(fn); }
  map(fn) { return this.contents.map(fn); }
  some(fn) { return this.contents.some(fn); }
  reduce(fn, initial) { return this.contents.reduce(fn, initial); }
}

/* Hooks: callAll runs every listener and logs a failing one, as Foundry does. */
const listeners = new Map();
const Hooks = {
  on(name, fn, {once = false} = {}) { const id = Symbol(name); (listeners.get(name) ?? listeners.set(name, []).get(name)).push({id, fn, once}); return id; },
  once(name, fn) { return Hooks.on(name, fn, {once: true}); },
  off(name, fn) { listeners.set(name, (listeners.get(name) ?? []).filter(entry => entry.fn !== fn && entry.id !== fn)); },
  callAll(name, ...args) {
    for (const entry of [...(listeners.get(name) ?? [])]) {
      if (entry.once) Hooks.off(name, entry.id);
      try { entry.fn(...args); } catch (error) { console.error(`Error thrown in hooked function ${name}`, error); }
    }
    return true;
  },
  call(name, ...args) {
    for (const entry of [...(listeners.get(name) ?? [])]) {
      if (entry.once) Hooks.off(name, entry.id);
      try { if (entry.fn(...args) === false) return false; } catch (error) { console.error(`Error thrown in hooked function ${name}`, error); }
    }
    return true;
  }
};

class User {
  constructor(data) { this._source = data; this.targets = new Set(); }
  get id() { return this._source._id; }
  get _id() { return this._source._id; }
  get name() { return this._source.name; }
  get role() { return this._source.role; }
  get active() { return this._source.active; }
  get isGM() { return this.role >= ROLES.ASSISTANT; }
  get isSelf() { return this.id === userId; }
  get character() { return this._source.character ? game.actors.get(this._source.character) ?? null : null; }
  get flags() { return this._source.flags ?? {}; }
  get uuid() { return `User.${this.id}`; }
  get documentName() { return "User"; }
  getFlag(scope, key) { return clone(getProperty(this._source.flags?.[scope], key)); }
  async update(changes, updateOptions = {}) { await request("update", {documentName: "User", id: this.id, changes, options: updateOptions}); return this; }
  setFlag(scope, key, value) { return this.update({[`flags.${scope}.${key}`]: value}); }
  can() { return this.isGM; }
}
class Users extends Collection {
  /** Foundry: the connected GM of highest role, then lowest id, answers for all GMs. */
  get activeGM() { return this.filter(user => user.active && user.isGM).sort((a, b) => (b.role - a.role) || a.id.localeCompare(b.id))[0] ?? null; }
  get current() { return this.get(userId) ?? null; }
}

/* Documents. Writes go to the server; local data changes only when the server broadcasts them. */
class Document {
  static documentName = "Document";
  constructor(data, parent = null) { this._source = data; this.parent = parent; }
  get documentName() { return this.constructor.documentName; }
  get id() { return this._source._id; }
  get _id() { return this._source._id; }
  get name() { return this._source.name; }
  get type() { return this._source.type; }
  get flags() { return this._source.flags; }
  get system() { return this._source.system; }
  get ownership() { return this._source.ownership; }
  get uuid() { return this.parent ? `${this.parent.uuid}.${this.documentName}.${this.id}` : `${this.documentName}.${this.id}`; }
  get collectionName() { return this.documentName; }
  toObject() { return clone(this._source); }
  toJSON() { return this.toObject(); }
  getFlag(scope, key) { return clone(getProperty(this._source.flags?.[scope], key)); }
  setFlag(scope, key, value) { return this.update({[`flags.${scope}.${key}`]: value}); }
  unsetFlag(scope, key) { const parts = String(key).split("."); parts[parts.length - 1] = `-=${parts.at(-1)}`; return this.update({[`flags.${scope}.${parts.join(".")}`]: null}); }
  async update(changes, updateOptions = {}) { await request("update", {documentName: this.documentName, id: this.id, parentId: this.parent?.id ?? null, changes, options: updateOptions}); return this; }
  async delete(deleteOptions = {}) { await request("delete", {documentName: this.documentName, id: this.id, parentId: this.parent?.id ?? null, options: deleteOptions}); return this; }
  ownerData() { return this.parent && this.documentName !== "Combatant" ? this.parent._source : this._source; }
  getUserLevel(user) { return userLevel(this.ownerData(), user?._source ?? user); }
  testUserPermission(user, level) { const needed = typeof level === "string" ? OWNERSHIP[level] : Number(level); return this.getUserLevel(user) >= needed; }
  canUserModify(user) { return Boolean(user?.isGM) || this.getUserLevel(user) >= OWNERSHIP.OWNER; }
  get isOwner() { return this.testUserPermission(game.user, OWNERSHIP.OWNER); }
  static async create(data, createOptions = {}) {
    const [id] = await request("create", {documentName: this.documentName, data, options: createOptions});
    return find(this.documentName, id);
  }
}
class Item extends Document { static documentName = "Item"; get actor() { return this.parent; } }
class ActiveEffect extends Document { static documentName = "ActiveEffect"; }
class Actor extends Document {
  static documentName = "Actor";
  constructor(data) { super(data); this.items = new Collection((data.items ?? []).map(item => [item._id, new Item(item, this)])); this.effects = new Collection(); }
  get prototypeToken() { return {disposition: this._source.prototypeToken?.disposition ?? 0}; }
  get statuses() { return new Set(this._source.statuses ?? []); }
  getActiveTokens() { return []; }
  async toggleStatusEffect(status, {active} = {}) { const next = new Set(this._source.statuses ?? []); (active ?? !next.has(status)) ? next.add(status) : next.delete(status); return this.update({statuses: [...next]}); }
  async createEmbeddedDocuments(name, data) { const ids = await request("create", {documentName: name, parentId: this.id, data}); return ids.map(id => find(name, id, this.id)); }
  async updateEmbeddedDocuments(name, updates) { for (const {_id, ...changes} of updates) await request("update", {documentName: name, id: _id, parentId: this.id, changes}); return updates.map(({_id}) => find(name, _id, this.id)); }
}
class Combatant extends Document {
  static documentName = "Combatant";
  get combat() { return this.parent; }
  get actor() { return game.actors.get(this._source.actorId) ?? null; }
  get actorId() { return this._source.actorId; }
  get token() { return null; }
  get initiative() { return this._source.initiative; }
  get isDefeated() { return Boolean(this._source.defeated); }
  get name() { return this._source.name ?? this.actor?.name ?? this.id; }
  ownerData() { return this.actor?._source ?? this._source; }
}
const sortCombatants = (a, b) => {
  const score = c => Number.isFinite(Number(c.initiative)) && c.initiative !== null ? Number(c.initiative) : -Infinity;
  return (score(b) - score(a)) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
};
/** The parts of Foundry's Combat the module reads and wraps (rollInitiative, nextTurn, nextRound). */
class Combat extends Document {
  static documentName = "Combat";
  constructor(data) { super(data); this.combatants = new Collection((data.combatants ?? []).map(entry => [entry._id, new Combatant(entry, this)])); this.setupTurns(); this.previous = null; }
  get round() { return Number(this._source.round ?? 0); }
  get turn() { return this._source.turn ?? null; }
  get active() { return Boolean(this._source.active); }
  get started() { return this.round > 0; }
  get combatant() { return this.turn === null ? null : this.turns[this.turn] ?? null; }
  get current() { return {round: this.round, turn: this.turn, combatantId: this.combatant?.id ?? null, tokenId: null}; }
  setupTurns() { this.turns = this.combatants.contents.sort(sortCombatants); return this.turns; }
  async createEmbeddedDocuments(name, data) { const ids = await request("create", {documentName: name, parentId: this.id, data}); return ids.map(id => this.combatants.get(id)); }
  async updateEmbeddedDocuments(name, updates) { for (const {_id, ...changes} of updates) await request("update", {documentName: name, id: _id, parentId: this.id, changes}); return updates.map(({_id}) => this.combatants.get(_id)); }
  /** The game system's initiative: 1d20 for each combatant. */
  async rollInitiative(ids) {
    const updates = [];
    for (const id of typeof ids === "string" ? [ids] : ids) { const roll = await new Roll("1d20").evaluate(); updates.push({_id: id, initiative: roll.total}); }
    if (updates.length) await this.updateEmbeddedDocuments("Combatant", updates);
    return this;
  }
  async startCombat() { const data = {round: 1, turn: 0}; Hooks.callAll("combatStart", this, data); await this.update(data); return this; }
  async nextTurn() {
    const next = (this.turn ?? -1) + 1;
    if (next >= this.turns.length) return this.nextRound();
    const data = {round: this.round, turn: next};
    Hooks.callAll("combatTurn", this, data, {direction: 1});
    await this.update(data, {direction: 1});
    return this;
  }
  async nextRound() {
    const data = {round: this.round + 1, turn: this.turn === null ? null : 0};
    Hooks.callAll("combatRound", this, data, {direction: 1});
    await this.update(data, {direction: 1});
    return this;
  }
  async previousTurn() { if ((this.turn ?? 0) === 0) return this.previousRound(); await this.update({turn: this.turn - 1}, {direction: -1}); return this; }
  async previousRound() { await this.update({round: Math.max(this.round - 1, 0), turn: 0}, {direction: -1}); return this; }
}
class ChatMessage extends Document {
  static documentName = "ChatMessage";
  static getSpeaker({actor = null} = {}) { return {actor: actor?.id ?? null, alias: actor?.name ?? game.user.name}; }
  static applyRollMode(data) { return data; }
  get content() { return this._source.content; }
  get author() { return game.users.get(this._source.author) ?? null; }
}
const CLASSES = {Actor, Item, ActiveEffect, Combat, Combatant, ChatMessage};
const COLLECTION = name => ({Actor: game.actors, Combat: game.combats, ChatMessage: game.messages, Item: game.items, User: game.users})[name];
function find(documentName, id, parentId = null) {
  if (!parentId) return COLLECTION(documentName)?.get(id) ?? null;
  if (documentName === "Combatant") return game.combats.get(parentId)?.combatants.get(id) ?? null;
  const parent = game.actors.get(parentId);
  return (documentName === "Item" ? parent?.items : parent?.effects)?.get(id) ?? null;
}
function fromUuidSync(uuid) {
  const parts = String(uuid ?? "").split(".");
  let doc = COLLECTION(parts[0])?.get(parts[1]) ?? null;
  for (let i = 2; doc && i < parts.length; i += 2) doc = find(parts[i], parts[i + 1], doc.id);
  return doc ?? null;
}

/* Settings: world values come from the server, client values stay on this client. */
const registered = new Map(), clientValues = new Map(), worldValues = new Map(Object.entries(snapshot.settings ?? {}));
const settingKey = (namespace, key) => `${namespace}.${key}`;
const settings = {
  register(namespace, key, config) { registered.set(settingKey(namespace, key), {scope: "client", ...config}); },
  /** Foundry refuses a menu whose type is not an Application class, and the error ends the module's init. */
  registerMenu(namespace, key, config) {
    const ApplicationV2 = foundry.applications.api.ApplicationV2;
    if (!(typeof config?.type === "function" && (config.type === ApplicationV2 || config.type.prototype instanceof ApplicationV2))) throw new Error("You must provide a menu type that is a FormApplication or ApplicationV2 instance or subclass");
    settings.menus.set(settingKey(namespace, key), config);
  },
  menus: new Map(),
  get(namespace, key) {
    const id = settingKey(namespace, key), config = registered.get(id);
    if (!config) throw new Error(`"${id}" is not a registered game setting`);
    const values = config.scope === "world" ? worldValues : clientValues;
    return clone(values.has(id) ? values.get(id) : config.default);
  },
  async set(namespace, key, value) {
    const id = settingKey(namespace, key), config = registered.get(id);
    if (!config) throw new Error(`"${id}" is not a registered game setting`);
    if (config.scope === "world") return request("setting", {key: id, value});
    clientValues.set(id, clone(value));
    config.onChange?.(clone(value));
    return value;
  }
};

/* Dice: a test may queue the results of the next dice on this client (simDice); otherwise seeded. */
const random = seededRandom(options.seed ?? [...userId].reduce((sum, c) => sum + c.charCodeAt(0), 1));
globalThis.simDice = [];
class DiceTerm { constructor({number = 1, faces = 6, flavor = null, modifiers = []} = {}) { Object.assign(this, {number, faces, flavor, modifiers, results: []}); } get total() { return this.results.filter(r => r.active !== false).reduce((sum, r) => sum + r.result, 0); } get expression() { return `${this.number}d${this.faces}`; } }
class Die extends DiceTerm {}
class OperatorTerm { constructor(operator) { this.operator = operator; } }
class NumericTerm { constructor(number) { this.number = number; } get total() { return this.number; } }
class Roll {
  constructor(formula, data = {}) {
    this._formula = String(formula ?? "");
    const resolved = this._formula.replace(/@([\w.-]+)/g, (_, path) => String(Number(getProperty(data, path) ?? 0)));
    this.terms = Roll.parse(resolved);
    this.data = data;
  }
  static parse(formula) {
    const terms = [];
    for (const token of formula.replace(/\s+/g, "").match(/\d*d\d+(?:\[[^\]]*\])?|\d+(?:\.\d+)?|[+-]|./g) ?? []) {
      const dice = /^(\d*)d(\d+)(?:\[([^\]]*)\])?$/.exec(token);
      if (dice) terms.push(new Die({number: Number(dice[1] || 1), faces: Number(dice[2]), flavor: dice[3] ?? null}));
      else if (/^[+-]$/.test(token)) terms.push(new OperatorTerm(token));
      else if (/^\d/.test(token)) terms.push(new NumericTerm(Number(token)));
      else throw new Error(`The simulated Roll cannot read "${formula}".`);
    }
    return terms;
  }
  get formula() { return this._formula; }
  get dice() { return this.terms.filter(term => term instanceof DiceTerm); }
  async evaluate() {
    for (const die of this.dice) if (!die.results.length) for (let i = 0; i < die.number; i++) die.results.push({result: globalThis.simDice.length ? globalThis.simDice.shift() : 1 + Math.floor(random() * die.faces), active: true});
    let total = 0, sign = 1;
    for (const term of this.terms) { if (term instanceof OperatorTerm) { sign = term.operator === "-" ? -1 : 1; continue; } total += sign * term.total; sign = 1; }
    this._total = total; this._evaluated = true;
    return this;
  }
  get total() { return this._total; }
  get result() { return this.terms.map(term => term instanceof OperatorTerm ? term.operator : term.total).join(" "); }
  toJSON() { return {class: "Roll", formula: this._formula, data: clone(this.data), total: this._total, evaluated: true, terms: this.terms.map(term => term instanceof DiceTerm ? {class: "Die", number: term.number, faces: term.faces, flavor: term.flavor, results: clone(term.results)} : term instanceof OperatorTerm ? {class: "OperatorTerm", operator: term.operator} : {class: "NumericTerm", number: term.number})}; }
  static fromData(json) {
    const roll = new Roll(json.formula, json.data ?? {});
    roll.dice.forEach((die, index) => { die.results = clone(json.terms?.filter(term => term.class === "Die")[index]?.results ?? []); });
    roll._total = json.total; roll._evaluated = true;
    return roll;
  }
}

class ApplicationV2 {
  static DEFAULT_OPTIONS = {};
  constructor(options = {}) { this.options = options; this.rendered = false; }
  async render() { this.rendered = true; return this; }
  async close() { this.rendered = false; return this; }
}
const HandlebarsApplicationMixin = Base => class extends Base { static PARTS = {}; };
/** Dialogs: a test answers them by queueing values in simDialogs; with none queued a dialog is dismissed (null). */
globalThis.simDialogs = [];
const dialogs = [];
class DialogV2 extends ApplicationV2 {
  static async ask(kind, config) { dialogs.push({kind, title: config?.window?.title ?? null, content: config?.content ?? null}); return globalThis.simDialogs.length ? globalThis.simDialogs.shift() : null; }
  static prompt(config) { return DialogV2.ask("prompt", config); }
  static confirm(config) { return DialogV2.ask("confirm", config); }
  static wait(config) { return DialogV2.ask("wait", config); }
}
globalThis.simShownDialogs = dialogs;
const sheets = [];

class Combats extends Collection { get active() { return this.find(combat => combat.active) ?? null; } }
const users = new Users(Object.values(snapshot.users).map(data => [data._id, new User(data)]));
const socketListeners = new Map();
const game = {
  userId,
  get user() { return users.get(userId); },
  users,
  actors: new Collection(Object.values(snapshot.actors).map(data => [data._id, new Actor(data)])),
  combats: new Combats(Object.values(snapshot.combats).map(data => [data._id, new Combat(data)])),
  get combat() { return this.combats.active; },
  messages: new Collection(Object.values(snapshot.messages).map(data => [data._id, new ChatMessage(data)])),
  items: new Collection(),
  scenes: new Collection(),
  settings,
  socket: {
    on(channel, fn) { (socketListeners.get(channel) ?? socketListeners.set(channel, []).get(channel)).push(fn); },
    off(channel) { socketListeners.delete(channel); },
    emit(channel, message) { post({kind: "socket", channel, message: clone(message)}); }
  },
  i18n: {lang: "en", localize: key => key, format: key => key, has: () => false, translations: {}},
  modules: new Map([["rule-them-all", {id: "rule-them-all", active: true, api: null}]]),
  system: {id: "sim-system", documentTypes: {Actor: {character: {}, npc: {}}, Item: {gear: {}}}},
  world: {id: "sim-world", title: "Simulated world"},
  time: {get worldTime() { return worldTime; }, advance: delta => request("worldTime", {delta})},
  clipboard: {copyPlainText: async () => {}},
  ready: false
};
let worldTime = Number(snapshot.worldTime ?? 0);

Object.assign(globalThis, {
  game, Hooks, Actor, Item, Combat, Combatant, ChatMessage, Roll, User,
  CONST: {DOCUMENT_OWNERSHIP_LEVELS: OWNERSHIP, USER_ROLES: ROLES},
  CONFIG: {
    Actor: {documentClass: Actor, typeLabels: {}, dataModels: {}}, Item: {documentClass: Item, typeLabels: {}, dataModels: {}}, Combat: {documentClass: Combat},
    Token: {documentClass: class {}}, Dice: {terms: {d: Die}, termTypes: {DiceTerm, Die}, randomUniform: random},
    time: {roundTime: 6, turnTime: 0}, sounds: {dice: null}, specialStatusEffects: {DEFEATED: "dead"}, fontDefinitions: {}
  },
  foundry: {
    applications: {
      api: {ApplicationV2, HandlebarsApplicationMixin, DialogV2},
      sheets: {ActorSheetV2: class extends ApplicationV2 {}, ItemSheetV2: class extends ApplicationV2 {}},
      apps: {DocumentSheetConfig: {registerSheet: (document, scope, SheetClass, config) => sheets.push({document: document.documentName, scope, name: SheetClass.name, label: config?.label}), unregisterSheet: () => {}}, FilePicker: {implementation: class {}}},
      instances: new Map(),
      ux: {TextEditor: {implementation: {enrichHTML: async html => html}}},
      elements: {}
    },
    utils: {deepClone: clone, getProperty, randomID: () => Math.random().toString(36).slice(2, 18), saveDataToFile: () => {}, isEmpty: value => !value || !Object.keys(value).length},
    data: {operators: {ForcedReplacement: {create: value => ({[FORCED]: clone(value)})}}},
    dice: {Roll, terms: {Die, DiceTerm}}
  },
  ui: {notifications: Object.fromEntries(["info", "warn", "error"].map(level => [level, message => log(level === "info" ? "notify" : `notify-${level}`, [message])])), actors: {render: () => {}}},
  TextEditor: {enrichHTML: async html => html},
  fromUuid: async uuid => fromUuidSync(uuid),
  fromUuidSync,
  canvas: null
});
globalThis.simSheets = sheets;

/* What the server broadcasts, applied as Foundry's clients apply it: data first, then the hooks. */
function onCreate({documentName, parentId, data, options: createOptions, userId: author}) {
  for (const entry of data) {
    let doc;
    if (documentName === "Combatant") { const combat = game.combats.get(parentId); combat._source.combatants.push(entry); doc = new Combatant(entry, combat); combat.combatants.set(entry._id, doc); combat.setupTurns(); }
    else if (parentId) { const actor = game.actors.get(parentId); actor._source[documentName === "Item" ? "items" : "effects"].push(entry); doc = new CLASSES[documentName](entry, actor); (documentName === "Item" ? actor.items : actor.effects).set(entry._id, doc); }
    else { doc = new CLASSES[documentName](entry); COLLECTION(documentName).set(entry._id, doc); }
    Hooks.callAll(`create${documentName}`, doc, createOptions, author);
  }
}
function onUpdate({documentName, id, parentId, changes, options: updateOptions, userId: author}) {
  const doc = find(documentName, id, parentId);
  if (!doc) return;
  if (documentName === "Combat") {
    const prior = doc.current;
    const plain = applyChanges(doc._source, changes);
    doc.setupTurns();
    const turnChanged = "round" in plain || "turn" in plain;
    if (turnChanged) doc.previous = prior;
    // Foundry signals a turn change with two hooks; scenarios run with either order.
    const turnHook = () => { if (turnChanged) Hooks.callAll("combatTurnChange", doc, prior, doc.current); };
    if (options.turnHooks === "turnChangeFirst") turnHook();
    Hooks.callAll("updateCombat", doc, plain, updateOptions, author);
    if (options.turnHooks !== "turnChangeFirst") turnHook();
    return;
  }
  if (documentName === "Combatant") {
    const combat = doc.parent, acting = combat.combatant;
    const plain = applyChanges(doc._source, changes);
    combat.setupTurns();
    Hooks.callAll("updateCombatant", doc, plain, updateOptions, author);
    // Foundry keeps the turn on the combatant acting when an initiative reorders the turns; the active GM writes it.
    if (combat.started && acting && combat.combatant !== acting && users.activeGM?.isSelf) combat.update({turn: combat.turns.indexOf(acting)});
    return;
  }
  const plain = applyChanges(doc._source, changes);
  Hooks.callAll(`update${documentName}`, doc, plain, updateOptions, author);
}
function onDelete({documentName, id, parentId, options: deleteOptions, userId: author}) {
  const doc = find(documentName, id, parentId);
  if (!doc) return;
  if (documentName === "Combatant") { const combat = doc.parent; combat.combatants.delete(id); combat._source.combatants = combat._source.combatants.filter(entry => entry._id !== id); combat.setupTurns(); }
  else if (parentId) { const actor = doc.parent, key = documentName === "Item" ? "items" : "effects"; actor[key].delete(id); actor._source[key] = actor._source[key].filter(entry => entry._id !== id); }
  else COLLECTION(documentName).delete(id);
  Hooks.callAll(`delete${documentName}`, doc, deleteOptions, author);
}

let resolveBoot;
const booted = new Promise(resolve => { resolveBoot = resolve; });
parentPort.on("message", async message => {
  switch (message.kind) {
    case "response": { const entry = pending.get(message.requestId); pending.delete(message.requestId); return message.ok ? entry?.resolve(message.result) : entry?.reject(new Error(message.error.message)); }
    case "create": return onCreate(message);
    case "update": return onUpdate(message);
    case "delete": return onDelete(message);
    case "setting": { worldValues.set(message.key, clone(message.value)); registered.get(message.key)?.onChange?.(clone(message.value)); return; }
    case "worldTime": { worldTime = message.worldTime; Hooks.callAll("updateWorldTime", worldTime, message.delta); return; }
    case "users": { for (const data of Object.values(message.users)) users.has(data._id) ? users.get(data._id)._source = data : users.set(data._id, new User(data)); return; }
    case "socket": { for (const fn of socketListeners.get(message.channel) ?? []) fn(clone(message.message)); return; }
    case "run": {
      await booted;
      try {
        const fn = (0, eval)(`(${message.source})`);
        const result = await fn(message.args);
        post({kind: "result", callId: message.callId, ok: true, result: result === undefined ? null : JSON.parse(JSON.stringify(result))});
      } catch (error) { post({kind: "result", callId: message.callId, ok: false, error: {message: error?.message ?? String(error), code: error?.code ?? null, stack: error?.stack ?? null}}); }
    }
  }
});

// Foundry's boot: the module script, then init, i18nInit, setup and ready.
await import(new URL("rule-them-all.mjs", ROOT).href);
Hooks.callAll("init");
Hooks.callAll("i18nInit");
Hooks.callAll("setup");
game.ready = true;
Hooks.callAll("ready");
resolveBoot();
