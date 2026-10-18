// Plays the exported SRD 5.2 Ruleset through the Rule Them'All engine (memory adapter).
// Usage: node verify-srd.mjs <repo> <ruleset.json>
import {readFileSync} from "node:fs";
import {pathToFileURL} from "node:url";
import assert from "node:assert/strict";
const [repo, file] = process.argv.slice(2);
const imp = p => import(pathToFileURL(`${repo}/src/${p}`).href);
const {createConfiguratorAPI} = await imp("configurator/configurator-api.mjs");
const {emptyStorageSnapshot} = await imp("configurator/configurator-storage.mjs");
const {MemoryRuntimeAdapter} = await imp("runtime/memory-runtime-adapter.mjs");
const {createRuntimeAPI} = await imp("runtime/runtime-api.mjs");
const {FoundryContentBridge} = await imp("runtime/foundry-content-bridge.mjs");
const {analyzeCreationSystem} = await imp("runtime/creation-plan.mjs");

class Storage { data = emptyStorageSnapshot(); async load() { return structuredClone(this.data); } async save(d) { this.data = structuredClone(d); } }
const actors = new Map();
let actorCount = 0;
const makeActor = name => { const uuid = `Actor.${++actorCount}`; const a = {uuid, documentName: "Actor", name, type: "character", flags: {}, getFlag(s, k) { return this.flags[s]?.[k]; }, async setFlag(s, k, v) { (this.flags[s] ??= {})[k] = structuredClone(v); }, async delete() { actors.delete(uuid); }}; actors.set(uuid, a); return a; };
// d20: the next natural (a queue, else 10); other dice: each die rolls `die` (default 3).
let naturals = [], die = 3; const rolled = [];
class Adapter extends MemoryRuntimeAdapter {
  async resolveDocument(uuid) { const a = actors.get(uuid); if (!a) throw new Error(`Actor not found: ${uuid}`); return a; }
  async canWrite() { return true; }
  async roll(formula) {
    rolled.push(formula);
    if (/^\s*1d20\s*$/.test(formula)) { const n = naturals.length ? naturals.shift() : 10; return {formula, result: String(n), total: n, natural: n}; }
    if (/^\s*2d20k[hl]1?\s*$/.test(formula)) { const n = naturals.length ? naturals.shift() : 10; return {formula, result: String(n), total: n, natural: n}; }
    const dice = [...formula.matchAll(/(\d+)d(\d+)(kh\d+)?/g)].reduce((n, m) => n + (m[3] ? Number(m[3].slice(2)) : Number(m[1])) * die, 0);
    const flat = [...formula.replace(/\d+d\d+(kh\d+)?/g, "").matchAll(/([+-])\s*(\d+)/g)].reduce((n, m) => n + (m[1] === "-" ? -1 : 1) * Number(m[2]), 0);
    return {formula, result: String(dice + flat), total: dice + flat};
  }
}
const api = await createConfiguratorAPI(new Storage());
const {versionId: v} = await api.importRuleset(readFileSync(file, "utf8"), "NEW");
const adapter = new Adapter(), runtime = createRuntimeAPI(api, {adapter, hooks: null});
const {RuntimeEngine} = await imp("runtime/runtime-engine.mjs");
const engine = new RuntimeEngine({configurator: api, adapter, hooks: null});
const bridge = new FoundryContentBridge(api, runtime, {hooks: null, documentTypeResolver: () => "character"});
globalThis.Actor = {create: data => makeActor(data.name)};
const log = (...a) => console.log("✓", ...a);
const def = id => ({objectKind: "definition", objectId: id});
const stateOf = async uuid => (await runtime.getContainerState(uuid)).definitionStates;
const baseOf = async (uuid, id) => (await stateOf(uuid))[id]?.capabilityStates?.value?.base;
const valueOf = (uuid, id) => engine.resolveReference(v, {objectKind: "definition", objectId: id, capabilityId: "value", outputId: "value.final"}, {roles: {self: uuid}, defaultRole: "self"});
const poolOf = async (uuid, id) => (await stateOf(uuid))[id]?.capabilityStates?.pool?.points?.current;
const active = async (uuid, id) => engine.resolveReference(v, {objectKind: "definition", objectId: id, capabilityId: "state", outputId: "state.active"}, {roles: {self: uuid}, defaultRole: "self"});

// An Actor made from a monster: its stat block, then the Items it grants (Foundry creates them as the Actor's Items).
const creature = async (uuid, templateId, key) => {
  await bridge.acquireTemplate(v, uuid, templateId, {sourceItemId: key});
  await bridge.acquireTemplate(v, uuid, "valeurs-de-creature", {sourceItemId: `${key}-valeurs`});
};

/* ---------- 1. Creation: human fighter, soldier, standard array through the point buy ---------- */
const answers = {
  socle: ["personnage"], classe: ["classe-guerrier"],
  "choix-classe": {contentChoices: {"classe-guerrier": {competences: ["athletisme", "perception"], equipement: ["guerrier"]}}},
  historique: ["historique-soldat"],
  "choix-historique": {contentChoices: {"historique-soldat": {"plus-deux": ["force"], "plus-un": ["constitution"], langues: ["langue-nain", "langue-orc"], "outil-1": ["des"], equipement: ["po-50"]}}},
  espece: ["espece-humain"], "don-d-origine": ["don-vigilant"],
  "choix-origine": {contentChoices: {"espece-humain": {doue: ["intimidation"]}}},
  methode: ["methode-achat"],
  "achat-de-points": {allocations: {force: 7, dexterite: 5, constitution: 6, intelligence: 0, sagesse: 4, charisme: 2}},
  finalisation: []
};
const analysis = await analyzeCreationSystem(api.getRuleset(v), "creation-pj", answers);
for (const step of analysis.steps) if (step.errors.length) console.log(step.id, step.errors);
assert.deepEqual(analysis.steps.filter(step => step.skipped).map(step => step.id), ["lignage", "tirage"]);
await assert.rejects(bridge.createActorFromCreationSystem(v, "creation-pj", {name: "X", actorType: "character", answers: {...answers, "achat-de-points": {allocations: {force: 7, dexterite: 7, constitution: 7, intelligence: 1, sagesse: 0, charisme: 0}}}}), /costs 28/);
const {actor} = await bridge.createActorFromCreationSystem(v, "creation-pj", {name: "Brienne", actorType: "character", answers});
const pc = actor.uuid;
assert.deepEqual(await Promise.all(["force", "dexterite", "constitution", "intelligence", "sagesse", "charisme"].map(id => baseOf(pc, id))), [17, 13, 15, 8, 12, 10]);
assert.equal(await valueOf(pc, "mod-force"), 3);
assert.equal(await baseOf(pc, "niveau-guerrier"), 1);
assert.equal(await valueOf(pc, "bonus-maitrise"), 2);
assert.equal(await valueOf(pc, "pv-maximum"), 12, "d10 + Constitution 2");
assert.equal(await poolOf(pc, "pv"), 12);
assert.equal(await baseOf(pc, "sauvegarde-force"), 1);
assert.equal(await baseOf(pc, "athletisme"), 2 - 1 + 1, "class +1 and soldier +1");
assert.equal(await baseOf(pc, "intimidation"), 2, "soldier +1, Skillful +1");
assert.equal(await active(pc, "don-vigilant"), true);
assert.equal(await active(pc, "langue-nain"), true);
assert.equal(await baseOf(pc, "po"), 50);
assert.equal(await valueOf(pc, "vitesse"), 9);
assert.equal(await valueOf(pc, "classe-armure"), 11, "10 + Dex 1, no armor");
log("création : guerrier humain soldat, tableau standard par l'achat de points, +2/+1, Compétent, Vigilant, 12 PV, CA 11, 9 m");

/* ---------- 2. Level 1 features: the milestones reached ---------- */
const applied = await runtime.applyMilestones(v, "niveaux", pc, {choices: {"guerrier-1": {style: def("don-defense")}}});
assert.equal(applied.stopped ?? null, null, JSON.stringify(applied.stopped));
assert.equal(await active(pc, "don-defense"), true);
assert.equal(await active(pc, "second-souffle-guerrier"), true);
assert.equal(await active(pc, "fougue-guerrier"), false, "level 2 not reached");
assert.equal(await poolOf(pc, "second-souffle"), 2);
log("niveau 1 : style Défense choisi, Second souffle (2 utilisations), Botte d'arme");

/* ---------- 3. Equipment and Armor Class ---------- */
for (const [key, id] of [["epee", "epee-longue"], ["cotte", "cotte-de-mailles"], ["bouclier", "bouclier"]]) await bridge.acquireTemplate(v, pc, id, {sourceItemId: key});
assert.equal(await valueOf(pc, "classe-armure"), 11, "armor not worn yet");
await runtime.setContentField(v, pc, "cotte", "equipe", true);
await runtime.setContentField(v, pc, "bouclier", "equipe", true);
assert.equal(await valueOf(pc, "classe-armure"), 19, "chain mail 16 + shield 2 + Defense 1");
assert.equal(await valueOf(pc, "vitesse"), 9, "Strength 17, chain mail asks 13");
log("CA : cotte de mailles 16 + bouclier 2 + Défense 1 = 19, portées seulement une fois équipées");

/* ---------- 4. A monster from the bestiary ---------- */
const ogre = makeActor("Ogre").uuid;
await creature(ogre, "creature-ogre", "tpl-ogre");
await bridge.acquireTemplate(v, ogre, "ogre-massue", {sourceItemId: "massue"});
assert.equal(await valueOf(ogre, "classe-armure"), 11);
assert.equal(await poolOf(ogre, "pv"), 68);
assert.equal(await valueOf(ogre, "mod-force"), 4);
assert.equal(await valueOf(ogre, "vitesse"), 12);
assert.equal(await active(ogre, "personnage-joueur"), false);
log("bestiaire : ogre CA 11, 68 PV, Force +4, 12 m, Massue en objet");

/* ---------- 5. Attacks ---------- */
const both = (self, target, input = {}) => ({roles: {self, target}, variables: {input}});
const hp = uuid => poolOf(uuid, "pv");
naturals = [15]; let before = await hp(ogre);
let result = await bridge.executeAcquiredAction(v, pc, "attaquer-avec-l-arme", both(pc, ogre), {contentKey: "epee"});
assert.equal(result.allowed, true, JSON.stringify(result));
assert.equal(await hp(ogre), before - (3 + 3), "1d8 + Strength 3");
naturals = [20]; before = await hp(ogre);
await bridge.executeAcquiredAction(v, pc, "attaquer-avec-l-arme", both(pc, ogre), {contentKey: "epee"});
assert.equal(await hp(ogre), before - (6 + 3), "critical: 2d8 + 3");
naturals = [1]; before = await hp(ogre);
await bridge.executeAcquiredAction(v, pc, "attaquer-avec-l-arme", both(pc, ogre), {contentKey: "epee"});
assert.equal(await hp(ogre), before, "a natural 1 misses");
naturals = [12]; before = await hp(ogre);
await bridge.executeAcquiredAction(v, pc, "attaquer-avec-l-arme", both(pc, ogre, {deuxMains: true}), {contentKey: "epee"});
assert.equal(await hp(ogre), before - (3 + 3), "versatile 1d10 two-handed");
assert.match(rolled.filter(f => /d10/.test(f)).at(-1) ?? "", /1d10/);
log("attaques : touche 1d8+3, critique 2d8+3, 1 naturel raté, Polyvalente à deux mains 1d10");

/* ---------- 6. Falling to 0, death saving throws, healing ---------- */
await runtime.setContentField(v, pc, "cotte", "equipe", false); await runtime.setContentField(v, pc, "bouclier", "equipe", false);
naturals = [15]; await bridge.executeAcquiredAction(v, ogre, "attaque-de-creature", both(ogre, pc), {contentKey: "massue"});
assert.equal(await hp(pc), 2, "2d8 + 4 = 10");
naturals = [15]; await bridge.executeAcquiredAction(v, ogre, "attaque-de-creature", both(ogre, pc), {contentKey: "massue"});
assert.equal(await hp(pc), 0);
assert.equal(await active(pc, "inconscient"), true); assert.equal(await active(pc, "mourant"), true); assert.equal(await active(pc, "mort"), false);
const self = uuid => ({roles: {self: uuid}, defaultRole: "self"});
naturals = [5]; await runtime.executeAction(v, "jet-contre-la-mort", self(pc));
assert.equal(await poolOf(pc, "echecs-contre-la-mort"), 1);
naturals = [12]; await runtime.executeAction(v, "jet-contre-la-mort", self(pc));
assert.equal(await poolOf(pc, "reussites-contre-la-mort"), 1);
naturals = [20]; await runtime.executeAction(v, "jet-contre-la-mort", self(pc));
assert.equal(await hp(pc), 1, "a 20 brings back 1 HP");
assert.equal(await active(pc, "inconscient"), false); assert.equal(await active(pc, "mourant"), false);
assert.equal(await poolOf(pc, "echecs-contre-la-mort"), 0);
log("0 PV : Inconscient et mourant, échec sur 5, réussite sur 12, un 20 rend 1 PV et la conscience");
// Massive damage: the rest beyond 0 at least the HP maximum kills outright.
await runtime.executeAction(v, "infliger-des-degats", {roles: {self: ogre, target: pc}, targets: [pc], variables: {input: {montant: 14, typeDegats: "contondant"}}});
assert.equal(await active(pc, "mort"), true, "1 HP, 14 damage: 13 beyond 0 ≥ 12");
log("dégâts massifs : 13 au-delà de 0 avec 12 PV maximum, mort instantanée");

/* ---------- 7. Resistance, vulnerability, immunity ---------- */
const skeleton = makeActor("Squelette").uuid;
await creature(skeleton, "creature-squelette", "tpl-squelette");
const deal = (target, montant, typeDegats) => runtime.executeAction(v, "infliger-des-degats", {roles: {self: ogre, target}, targets: [target], variables: {input: {montant, typeDegats}}});
before = await hp(skeleton); await deal(skeleton, 4, "contondant"); assert.equal(await hp(skeleton), before - 8, "vulnerable: doubled");
before = await hp(skeleton); await deal(skeleton, 4, "poison"); assert.equal(await hp(skeleton), before, "immune");
before = await hp(skeleton); await deal(skeleton, 3, "tranchant"); assert.equal(await hp(skeleton), before - 3);
const poisoned = await runtime.executeAction(v, "infliger-un-etat", {roles: {self: ogre, target: skeleton}, targets: [skeleton], variables: {input: {etat: def("empoisonne")}}});
assert.equal(await active(skeleton, "empoisonne"), false, JSON.stringify(poisoned.reason));
log("squelette : contondant doublé, poison ignoré, tranchant normal, immunisé à Empoisonné");

/* ---------- 8. A high elf wizard, abilities rolled ---------- */
const {drawCreationStep} = await imp("runtime/creation-plan.mjs");
const wizAnswers = {
  socle: ["personnage"], classe: ["classe-magicien"],
  "choix-classe": {contentChoices: {"classe-magicien": {competences: ["arcanes", "investigation"], equipement: ["po-55"]}}},
  historique: ["historique-sage"],
  "choix-historique": {contentChoices: {"historique-sage": {"plus-deux": ["intelligence"], "plus-un": ["constitution"], langues: ["langue-draconique", "langue-nain"], "sorts-mineurs": ["sort-trait-de-feu", "sort-aspersion-acide"], "sort-niveau-1": ["sort-mains-brulantes"], equipement: ["po-50"]}}},
  espece: ["espece-elfe"], lignage: ["lignage-elfique-haut-elfe"],
  "choix-origine": {contentChoices: {"espece-elfe": {"sens-aiguises": ["perception"]}}},
  methode: ["methode-tirage"], finalisation: []
};
await assert.rejects(bridge.createActorFromCreationSystem(v, "creation-pj", {name: "X", actorType: "character", answers: {...wizAnswers, lignage: ["lignage-elfique-drow", "lignage-ascendance-draconique-rouge"]}}), /lignage/);
wizAnswers.tirage = (await drawCreationStep(api.getRuleset(v), "creation-pj", wizAnswers, "tirage", {roll: async () => ({total: 6, result: "6"})})).answer;
const wiz = (await bridge.createActorFromCreationSystem(v, "creation-pj", {name: "Elrond", actorType: "character", answers: wizAnswers})).actor.uuid;
assert.deepEqual(await Promise.all(["force", "dexterite", "constitution", "intelligence", "sagesse", "charisme"].map(id => baseOf(wiz, id))), [14, 14, 15, 16, 14, 14]);
await runtime.applyMilestones(v, "niveaux", wiz, {});
assert.equal(await valueOf(wiz, "pv-maximum"), 8, "d6 + Constitution 2");
assert.equal(await valueOf(wiz, "vision-dans-le-noir"), 18);
assert.equal(await valueOf(wiz, "dd-sorts"), 13); assert.equal(await valueOf(wiz, "attaque-sorts"), 5);
assert.equal(await poolOf(wiz, "emplacements-1"), 2);
assert.equal(await poolOf(wiz, "emplacements-2"), 0);
log("magicien haut-elfe : caractéristiques tirées (4d6), Initié à la magie, vision dans le noir 18 m, DD 13, +5, 2 emplacements de niveau 1");

/* ---------- 9. Spells ---------- */
for (const [key, id] of [["trait", "sort-trait-de-feu"], ["mains", "sort-mains-brulantes"], ["boule", "sort-boule-de-feu"]]) await bridge.acquireTemplate(v, wiz, id, {sourceItemId: key});
const ogre2 = makeActor("Ogre 2").uuid; await creature(ogre2, "creature-ogre", "tpl-ogre");
naturals = [15]; before = await hp(ogre2);
await bridge.executeAcquiredAction(v, wiz, "sort-mineur-attaque", both(wiz, ogre2), {contentKey: "trait"});
assert.equal(await hp(ogre2), before - 3, "Fire Bolt 1d10");
naturals = [5]; before = await hp(ogre2);
result = await bridge.executeAcquiredAction(v, wiz, "sort-sauvegarde-dexterite", {roles: {self: wiz}, targets: [ogre2], variables: {input: {emplacement: def("emplacements-1")}}}, {contentKey: "mains"});
assert.equal(result.allowed, true, JSON.stringify(result));
assert.equal(await hp(ogre2), before - 9, "Burning Hands 3d6, failed save");
assert.equal(await poolOf(wiz, "emplacements-1"), 1);
naturals = [18]; before = await hp(ogre2);
await bridge.executeAcquiredAction(v, wiz, "sort-sauvegarde-dexterite", {roles: {self: wiz}, targets: [ogre2], variables: {input: {emplacement: def("emplacements-1")}}}, {contentKey: "mains"});
assert.equal(await hp(ogre2), before - 4, "half on a success");
assert.equal(await poolOf(wiz, "emplacements-1"), 0);
result = await bridge.executeAcquiredAction(v, wiz, "sort-sauvegarde-dexterite", {roles: {self: wiz}, targets: [ogre2], variables: {input: {emplacement: def("emplacements-1")}}}, {contentKey: "mains"});
assert.equal(result.allowed, false, "no slot left");
result = await bridge.executeAcquiredAction(v, wiz, "sort-sauvegarde-dexterite", {roles: {self: wiz}, targets: [ogre2], variables: {input: {emplacement: def("emplacements-3")}}}, {contentKey: "boule"});
assert.equal(result.allowed, false, "no level 3 slot at level 1");
log("sorts : Trait de feu 1d10, Mains brûlantes 3d6 (moitié sur réussite), emplacements dépensés, refus sans emplacement");

/* ---------- 10. Rests and levels ---------- */
await runtime.setDefinitionState(v, wiz, "pv", {pools: {points: 3}});
await runtime.executeAction(v, "repos-long", self(wiz));
assert.equal(await hp(wiz), 8); assert.equal(await poolOf(wiz, "emplacements-1"), 2);
await runtime.setDefinitionState(v, wiz, "pv", {pools: {points: 3}});
result = await runtime.executeAction(v, "depenser-un-de-de-vie", {...self(wiz), variables: {input: {deDeVie: def("des-de-vie-d6")}}});
assert.equal(result.allowed, true, JSON.stringify(result));
assert.equal(await hp(wiz), 3 + 3 + 2, "1d6 + Constitution 2");
assert.equal(await poolOf(wiz, "des-de-vie-d6"), 0);
assert.equal((await runtime.executeAction(v, "depenser-un-de-de-vie", {...self(wiz), variables: {input: {deDeVie: def("des-de-vie-d6")}}})).allowed, false);
log("repos : long (PV et emplacements), dé de vie d6 + Constitution, refusé sans dé restant");
let refused = await runtime.advance(v, "niveaux", wiz, "niveau-de-classe", "niveau-magicien").catch(e => e);
assert.ok(refused instanceof Error || refused.allowed === false, "300 XP needed for level 2");
await runtime.executeAction(v, "donner-xp", {roles: {self: wiz, target: wiz}, targets: [wiz], variables: {input: {montant: 300}}});
await runtime.advance(v, "niveaux", wiz, "niveau-de-classe", "niveau-magicien");
await runtime.applyMilestones(v, "niveaux", wiz, {});
assert.equal(await baseOf(wiz, "niveau-magicien"), 2);
assert.equal(await valueOf(wiz, "pv-maximum"), 14, "8 + 4 + 2");
assert.equal(await poolOf(wiz, "emplacements-1"), 3);
log("niveau 2 : refusé sans 300 PX, puis 14 PV maximum et 3 emplacements de niveau 1");

/* ---------- 12 (before the dragon). Initiative ---------- */
naturals = [10]; let test = await runtime.executeTest(v, "initiative", self(pc));
assert.equal(test.total, 13, "10 + Dexterity 1 + Alert (proficiency 2)");
log("initiative : d20 + Dextérité + bonus de maîtrise avec Vigilant");

/* ---------- 11. A dragon's breath and spells ---------- */
const dragon = makeActor("Dragon rouge").uuid;
await creature(dragon, "creature-dragon-rouge-adulte", "tpl-dragon");
for (const [key, id] of [["souffle", "dragon-rouge-adulte-souffle-de-feu"], ["boule", "sort-boule-de-feu"]]) await bridge.acquireTemplate(v, dragon, id, {sourceItemId: key});
assert.equal(await active(dragon, "immunite-feu"), true);
const ogre3 = makeActor("Ogre 3").uuid; await creature(ogre3, "creature-ogre", "tpl-ogre");
naturals = [3]; before = await hp(ogre3);
await bridge.executeAcquiredAction(v, dragon, "capacite-sauvegarde-dexterite", {roles: {self: dragon}, targets: [ogre3, dragon], variables: {input: {}}}, {contentKey: "souffle"});
assert.equal(await hp(ogre3), before - 51, "17d6, DC 21 failed");
assert.equal(await poolOf(dragon, "pv"), 256, "immune to its own fire");
naturals = [19];
await bridge.executeAcquiredAction(v, dragon, "capacite-sauvegarde-dexterite", {roles: {self: dragon}, targets: [wiz], variables: {input: {}}}, {contentKey: "souffle"});
assert.equal(await hp(wiz), 0, "19 + 2 = 21 saves: half of 51 is 25, more than 14 HP");
assert.equal(await active(wiz, "mourant"), true); assert.equal(await active(wiz, "mort"), false, "11 beyond 0 is below 14");
naturals = [3];
result = await bridge.executeAcquiredAction(v, dragon, "sort-sauvegarde-dexterite", {roles: {self: dragon}, targets: [ogre3], variables: {input: {emplacement: def("emplacements-3")}}}, {contentKey: "boule"});
assert.equal(result.allowed, true, "a monster casts without slots");
assert.equal(await hp(ogre3), 0, "Fireball 8d6 = 24 against 17 HP");
assert.equal(await active(ogre3, "mort"), true, "a monster dies at 0");
log("dragon rouge : souffle 17d6 DD 21 (moitié sur réussite, immunisé à son feu), Boule de feu sans emplacement, l'ogre meurt à 0");

/* ---------- 13. Barbarian, rogue, cleric ---------- */
const human = (cls, competences, extra = {}) => ({socle: ["personnage"], classe: [`classe-${cls}`], "choix-classe": {contentChoices: {[`classe-${cls}`]: {competences, equipement: [`po-${{barbare: 75, roublard: 100, clerc: 110}[cls]}`]}}},
  historique: ["historique-soldat"], "choix-historique": {contentChoices: {"historique-soldat": {"plus-deux": [extra.deux ?? "force"], "plus-un": [extra.un ?? "constitution"], langues: ["langue-nain", "langue-orc"], "outil-1": ["des"], equipement: ["po-50"]}}},
  espece: ["espece-humain"], "don-d-origine": ["don-doue"], "choix-origine": {contentChoices: {"espece-humain": {doue: ["histoire"]}, "don-doue": {competences: ["arcanes", "nature", "religion"]}}},
  methode: ["methode-achat"], "achat-de-points": {allocations: extra.points ?? {force: 7, dexterite: 5, constitution: 6, intelligence: 0, sagesse: 4, charisme: 2}}, finalisation: []});
const barb = (await bridge.createActorFromCreationSystem(v, "creation-pj", {name: "Conan", actorType: "character", answers: human("barbare", ["athletisme", "survie"])})).actor.uuid;
await runtime.applyMilestones(v, "niveaux", barb, {});
assert.equal(await valueOf(barb, "pv-maximum"), 14, "d12 + 2");
assert.equal(await valueOf(barb, "classe-armure"), 13, "Unarmored Defense: 10 + Dex 1 + Con 2");
await bridge.acquireTemplate(v, barb, "hache-a-deux-mains", {sourceItemId: "hache"});
const ogre4 = makeActor("Ogre 4").uuid; await creature(ogre4, "creature-ogre", "tpl-ogre"); await bridge.acquireTemplate(v, ogre4, "ogre-massue", {sourceItemId: "massue"});
result = await runtime.executeAction(v, "entrer-en-rage", self(barb));
assert.equal(result.allowed, true, JSON.stringify(result)); assert.equal(await active(barb, "rage-active"), true);
assert.equal(await poolOf(barb, "rage"), 1);
naturals = [15]; before = await hp(ogre4);
await bridge.executeAcquiredAction(v, barb, "attaquer-avec-l-arme", both(barb, ogre4), {contentKey: "hache"});
assert.equal(await hp(ogre4), before - (3 + 3 + 2), "1d12 + Strength 3 + Rage 2");
naturals = [15]; before = await hp(barb);
await bridge.executeAcquiredAction(v, ogre4, "attaque-de-creature", both(ogre4, barb), {contentKey: "massue"});
assert.equal(await hp(barb), before - 5, "Rage: bludgeoning halved (10 → 5)");
log("barbare : Défense sans armure 13, Rage (+2 aux dégâts de Force, contondant réduit de moitié)");

const rogue = (await bridge.createActorFromCreationSystem(v, "creation-pj", {name: "Arya", actorType: "character", answers: human("roublard", ["acrobaties", "supercherie", "discretion", "escamotage"], {deux: "dexterite", un: "constitution", points: {force: 2, dexterite: 7, constitution: 6, intelligence: 4, sagesse: 5, charisme: 0}})})).actor.uuid;
const rogueMilestones = await runtime.applyMilestones(v, "niveaux", rogue, {});
assert.equal(rogueMilestones.stopped ?? null, null, JSON.stringify(rogueMilestones.stopped));
await bridge.acquireTemplate(v, rogue, "rapiere", {sourceItemId: "rapiere"});
naturals = [15]; before = await hp(ogre4);
await bridge.executeAcquiredAction(v, rogue, "attaquer-avec-l-arme", both(rogue, ogre4), {contentKey: "rapiere"});
assert.equal(await hp(ogre4), before - (3 + 3), "no Sneak Attack without Advantage or an ally");
naturals = [15]; before = await hp(ogre4);
await bridge.executeAcquiredAction(v, rogue, "attaquer-avec-l-arme", both(rogue, ogre4, {avantage: "avantage"}), {contentKey: "rapiere"});
assert.equal(await hp(ogre4), before - (3 + 3 + 3), "Advantage: Sneak Attack 1d6");
naturals = [15]; before = await hp(ogre4);
await bridge.executeAcquiredAction(v, rogue, "attaquer-avec-l-arme", both(rogue, ogre4, {avantage: "avantage"}), {contentKey: "rapiere"});
assert.equal(await hp(ogre4), before - (3 + 3), "once per turn");
log("roublard : rapière 1d8 + Dextérité 3, Attaque sournoise 1d6 avec l'Avantage, une fois par tour");

const cleric = (await bridge.createActorFromCreationSystem(v, "creation-pj", {name: "Jaheira", actorType: "character", answers: human("clerc", ["medecine", "religion"], {points: {force: 5, dexterite: 2, constitution: 6, intelligence: 0, sagesse: 7, charisme: 4}})})).actor.uuid;
await runtime.applyMilestones(v, "niveaux", cleric, {});
for (const [key, id] of [["mot", "sort-mot-de-guerison"], ["benediction", "sort-benediction"]]) await bridge.acquireTemplate(v, cleric, id, {sourceItemId: key});
await runtime.setDefinitionState(v, barb, "pv", {pools: {points: 1}});
before = await hp(barb);
result = await bridge.executeAcquiredAction(v, cleric, "sort-soins", {roles: {self: cleric}, targets: [barb], variables: {input: {emplacement: def("emplacements-1")}}}, {contentKey: "mot"});
assert.equal(result.allowed, true, JSON.stringify(result));
assert.equal(await hp(barb), before + 6 + 2, "Healing Word 2d4 + Wisdom 2");
await bridge.executeAcquiredAction(v, cleric, "sort-etat", {roles: {self: cleric}, targets: [barb, rogue], variables: {input: {emplacement: def("emplacements-1")}}}, {contentKey: "benediction"});
assert.equal(await active(cleric, "concentration"), true); assert.equal(await active(rogue, "benediction"), true);
naturals = [2];
await runtime.executeAction(v, "infliger-des-degats", {roles: {self: ogre4, target: cleric}, targets: [cleric], variables: {input: {montant: 3, typeDegats: "contondant"}}});
assert.equal(await active(cleric, "concentration"), false, "Constitution save 2 + 2 < 10");
log("clerc : Mot de guérison 2d4 + Sagesse, Bénédiction sous concentration, rompue par un jet de Constitution raté");

/* ---------- 14. Every class from level 1 to 20, every creature ---------- */
const skillsOf = cls => api.getRuleset(v).contentTemplates.find(t => t.id === `classe-${cls}`).choiceGroups.find(g => g.id === "competences");
const gold = cls => api.getRuleset(v).contentTemplates.find(t => t.id === `classe-${cls}`).choiceGroups.find(g => g.id === "equipement").options.find(o => o.id.startsWith("po-")).id;
for (const cls of ["barbare", "barde", "clerc", "druide", "guerrier", "moine", "paladin", "rodeur", "roublard", "ensorceleur", "occultiste", "magicien"]) {
  const group = skillsOf(cls), answers = human(cls, group.options.slice(0, group.min).map(o => o.id).filter(id => id !== "histoire").concat(group.options.slice(group.min, group.min + 1).map(o => o.id)).slice(0, group.min));
  answers["choix-classe"].contentChoices[`classe-${cls}`].equipement = [gold(cls)];
  const hero = (await bridge.createActorFromCreationSystem(v, "creation-pj", {name: cls, actorType: "character", answers})).actor.uuid;
  await runtime.executeAction(v, "donner-xp", {roles: {self: hero, target: hero}, targets: [hero], variables: {input: {montant: 355000}}});
  for (let lvl = 1; lvl <= 20; lvl++) {
    if (lvl > 1) await runtime.advance(v, "niveaux", hero, "niveau-de-classe", `niveau-${cls}`);
    const step = await runtime.applyMilestones(v, "niveaux", hero, {});
    assert.equal(step.stopped ?? null, null, `${cls} ${lvl}: ${JSON.stringify(step.stopped)}`);
  }
  assert.equal(await baseOf(hero, `niveau-${cls}`), 20);
  assert.equal(await valueOf(hero, "bonus-maitrise"), 6);
  assert.ok(await valueOf(hero, "pv-maximum") > 100, `${cls} HP ${await valueOf(hero, "pv-maximum")}`);
}
log("les 12 classes du niveau 1 au niveau 20 : toutes les étapes appliquées, bonus de maîtrise +6");
let count = 0;
for (const t of api.getRuleset(v).contentTemplates.filter(t => t.contentTypeId === "creature")) {
  const uuid = makeActor(t.id).uuid; await creature(uuid, t.id, `tpl-${t.id}`);
  assert.equal(await poolOf(uuid, "pv"), await valueOf(uuid, "pv-maximum")); assert.ok(await valueOf(uuid, "classe-armure") >= 5, t.id); count++;
}
log(`bestiaire : les ${count} créatures prennent leurs valeurs (PV au maximum, CA)`);
