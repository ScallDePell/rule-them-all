// Plays the exported RWF Ruleset through the Rule Them'All engine (memory adapter).
// Usage: node verify-rwf.mjs <repo> <package.json>
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
const {timeElapsedPayload} = await imp("configurator/system-events.mjs");

class Storage { data = emptyStorageSnapshot(); async load() { return structuredClone(this.data); } async save(d) { this.data = structuredClone(d); } }
const actors = new Map();
const makeActor = (name) => { const uuid = `Actor.${actors.size + 1}`; const a = {uuid, documentName: "Actor", name, type: "character", flags: {}, getFlag(s, k) { return this.flags[s]?.[k]; }, async setFlag(s, k, v) { (this.flags[s] ??= {})[k] = structuredClone(v); }, async delete() { actors.delete(uuid); }}; actors.set(uuid, a); return a; };
// d20: the next natural; damage dice: each die rolls 3 (2d6 = 6).
let nextNatural = 10; const rolled = [];
class Adapter extends MemoryRuntimeAdapter {
  async resolveDocument(uuid) { const a = actors.get(uuid); if (!a) throw new Error("Actor not found"); return a; }
  async canWrite() { return true; }
  async roll(formula) {
    rolled.push(formula);
    if (formula === "1d20") return {formula, result: String(nextNatural), total: nextNatural, natural: nextNatural};
    if (/^\d+$/.test(formula)) return {formula, result: formula, total: Number(formula)};
    const dice = [...formula.matchAll(/(\d+)d\d+/g)].reduce((n, m) => n + Number(m[1]), 0);
    return {formula, result: String(dice * 3), total: dice * 3};
  }
}
const api = await createConfiguratorAPI(new Storage());
const imported = await api.importRuleset(readFileSync(file, "utf8"), "NEW");
const v = imported.versionId;
const runtime = createRuntimeAPI(api, {adapter: new Adapter(), hooks: null});
const bridge = new FoundryContentBridge(api, runtime, {hooks: null, documentTypeResolver: () => "character"});
globalThis.Actor = {create: data => makeActor(data.name)};
const log = (...a) => console.log("✓", ...a);
const def = id => ({objectKind: "definition", objectId: id});

// 1. Creation: Socle first, adult police officer, two backgrounds, one life event, martial point, free points.
// The skills a Parcours or a background gives are chosen on the screen after it.
const answers = {
  socle: ["humain"], age: ["age-adult"],
  parcours: {selectedIds: ["parcours-police"]},
  "acquis-parcours": {contentChoices: {"parcours-police": {"parcours-competences": ["investigation", "vigilance"], "parcours-combat": ["armes-de-poing"], "parcours-deplacement": ["vehicules-legers"]}}},
  backgrounds: {selectedIds: ["background-workingclass", "background-urban"]},
  "acquis-backgrounds": {contentChoices: {"background-workingclass": {"background-competences": ["athletisme"]}, "background-urban": {"background-competences": ["vigilance"]}}},
  evenements: ["evenement-savedlife"], "point-martial": ["point-martial-corps-a-corps"], permis: ["permis-b"],
  "points-caracteristiques": {allocations: {force: 1, agilite: 2, constitution: 2, esprit: 2, presence: 2}},
  "points-competences": {allocations: {investigation: 2, vigilance: 1, medecine: 1, culture: 1, occultisme: 1, discretion: 1}},
  finalisation: []
};
// Fixed bounds are gone: the adult age group asks for exactly two backgrounds and nine attribute points.
await assert.rejects(bridge.createActorFromCreationSystem(v, "creation-pj", {name: "X", actorType: "character", answers: {...answers, backgrounds: ["background-workingclass"]}}), /backgrounds/i);
await assert.rejects(bridge.createActorFromCreationSystem(v, "creation-pj", {name: "X", actorType: "character", answers: {...answers, "points-caracteristiques": {allocations: {force: 4, agilite: 2, constitution: 1, esprit: 1, presence: 1}}}}), /at most 3/);
await assert.rejects(bridge.createActorFromCreationSystem(v, "creation-pj", {name: "X", actorType: "character", answers: {...answers, age: ["age-young"]}}), /parcours-police is not available/);
await assert.rejects(bridge.createActorFromCreationSystem(v, "creation-pj", {name: "X", actorType: "character", answers: {...answers, "acquis-parcours": undefined}}), /acquis-parcours/);
const {analyzeCreationSystem} = await imp("runtime/creation-plan.mjs");
const steps = (await analyzeCreationSystem(api.getRuleset(v), "creation-pj", answers)).steps;
assert.deepEqual(steps.filter(step => step.skipped).map(step => step.id), ["effets-age", "choix-evenements"], "an adult has no age effect, a life event no choice");
const teen = {variables: {creation: {age: {fields: {ageMaximum: 18}}}}};
assert.equal(await runtime.evaluateCondition(v, "permis-accessible", teen), false);
log("création : bornes selon l'âge, plafond par caractéristique, Parcours Police et permis refusés avant 19 ans");
const {actor} = await bridge.createActorFromCreationSystem(v, "creation-pj", {name: "Inspectrice Moreau", actorType: "character", answers});
const state = await runtime.getContainerState(actor.uuid);
const baseOf = id => state.definitionStates[id]?.capabilityStates?.value?.base;
console.log(JSON.stringify(Object.fromEntries(["force", "agilite", "constitution", "esprit", "presence", "investigation", "vigilance", "athletisme", "armes-de-poing", "corps-a-corps", "vehicules-legers"].map(k => [k, baseOf(k)]))));
assert.deepEqual(["force", "agilite", "constitution", "esprit", "presence"].map(baseOf), [2, 3, 3, 3, 3]);
assert.equal(baseOf("vigilance"), 3, "Parcours +1, background +1, point libre +1");
assert.equal(baseOf("investigation"), 3); assert.equal(baseOf("athletisme"), 1); assert.equal(baseOf("armes-de-poing"), 1); assert.equal(baseOf("corps-a-corps"), 1); assert.equal(baseOf("vehicules-legers"), 1);
log("création : Socle d'abord, compétences du Parcours et des backgrounds sur leur écran, +1 cumulés, points libres répartis");

// An elder spreads 2 bonuses over Esprit/Présence and 2 penalties over Force/Agilité/Constitution.
const elder = {...answers, age: ["age-veteran"], backgrounds: {selectedIds: ["background-workingclass", "background-urban", "background-rural"]},
  "acquis-backgrounds": {contentChoices: {...answers["acquis-backgrounds"].contentChoices, "background-rural": {"background-competences": ["survie"]}}},
  "effets-age": {contentChoices: {"age-veteran": {"bonus-age-1": ["esprit"], "bonus-age-2": ["esprit"], "malus-age-1": ["force"], "malus-age-2": ["agilite"]}}},
  "points-caracteristiques": {allocations: {force: 2, agilite: 2, constitution: 2, esprit: 1, presence: 2}}};
assert.match((await analyzeCreationSystem(api.getRuleset(v), "creation-pj", {...elder, "effets-age": undefined})).steps.find(step => step.id === "effets-age").errors.join(" "), /not been answered/);
const {actor: grandpa} = await bridge.createActorFromCreationSystem(v, "creation-pj", {name: "Ancien", actorType: "character", answers: elder});
const grandpaState = await runtime.getContainerState(grandpa.uuid);
assert.deepEqual(["force", "agilite", "constitution", "esprit", "presence"].map(id => grandpaState.definitionStates[id].capabilityStates.value.base), [2, 2, 3, 4, 3]);
log("âge : une personne âgée répartit +2 sur Esprit/Présence et −2 sur Force/Agilité/Constitution");

// Bornes d'un PJ : caractéristiques 1 à 5, compétences 0 à 5 ; un PNJ (sans le statut) n'a pas de plafond.
assert.equal(state.definitionStates["personnage-joueur"]?.capabilityStates?.state?.active, true, "le Socle donne le statut Personnage joueur");
assert.deepEqual(await runtime.valueBounds(v, actor.uuid, "force"), {minimum: 1, maximum: 5});
assert.deepEqual(await runtime.valueBounds(v, actor.uuid, "investigation"), {minimum: 0, maximum: 5});
await runtime.setDefinitionState(v, actor.uuid, "force", {base: 8});
await runtime.setDefinitionState(v, actor.uuid, "investigation", {base: -2});
const bounded = await runtime.getContainerState(actor.uuid);
assert.deepEqual([bounded.definitionStates.force.capabilityStates.value.base, bounded.definitionStates.investigation.capabilityStates.value.base], [5, 0]);
await runtime.setDefinitionState(v, actor.uuid, "force", {base: 2});
await runtime.setDefinitionState(v, actor.uuid, "investigation", {base: 3});
const npc = makeActor("Créature");
await runtime.initializeContainer(v, npc.uuid, {definitionIds: ["force", "investigation"]});
await runtime.setDefinitionState(v, npc.uuid, "force", {base: 9});
assert.equal((await runtime.getContainerState(npc.uuid)).definitionStates.force.capabilityStates.value.base, 9);
assert.deepEqual(await runtime.valueBounds(v, npc.uuid, "force"), {minimum: null, maximum: null});
log("bornes : PJ Force plafonnée à 5 et Investigation à 0 minimum ; une créature sans statut monte à 9");

const self = {roles: {self: actor.uuid}};
const formula = id => runtime.evaluateFormula(v, id, self);
const poolOf = async (uuid, id) => (await runtime.getContainerState(uuid)).definitionStates[id].capabilityStates.pool.points.current;
assert.equal(await formula("vitalite-maximum"), 12); assert.equal(await formula("endurance-maximum"), 10); assert.equal(await formula("energie-maximum"), 13);
assert.deepEqual([await poolOf(actor.uuid, "vitalite"), await poolOf(actor.uuid, "endurance"), await poolOf(actor.uuid, "energie")], [12, 10, 13]);
log("ressources pleines après la création : Vitalité 12, Endurance 10, Énergie 13");
await runtime.setDefinitionState(v, actor.uuid, "vitalite", {pools: {points: 10}});
await runtime.setDefinitionState(v, actor.uuid, "constitution", {base: 4});
assert.equal(await poolOf(actor.uuid, "vitalite"), 11, "max 13, il manquait toujours 2");
await runtime.setDefinitionState(v, actor.uuid, "constitution", {base: 3});
await runtime.setDefinitionState(v, actor.uuid, "vitalite", {pools: {points: 12}});
log("la Vitalité suit son maximum en gardant les points manquants");
assert.equal(await runtime.evaluateFormula(v, "defense-calcul", self), 13);
log("Défense 13 (10 + Agilité 3 + Protection 0)");

// 2. One Test for every skill: Investigation 3 + Esprit 3.
const skill = (id, dd) => runtime.executeTest(v, "test-competence", {...self, variables: {definition: def(id), input: dd ? {dd} : {}}});
nextNatural = 10; let r = await skill("investigation", 13);
assert.equal(r.total, 16); assert.equal(r.outcome.id, "reussite");
nextNatural = 9; r = await skill("investigation", 19); assert.equal(r.outcome.id, "echec");
nextNatural = 20; r = await skill("investigation", 30); assert.equal(r.outcome.id, "reussite-critique");
nextNatural = 1; r = await skill("investigation", 5); assert.equal(r.outcome.id, "complication");
nextNatural = 10; r = await skill("investigation"); assert.equal(r.target, 13);
r = await skill("armes-de-poing", 13); assert.equal(r.bonus, 1 + 3, "maîtrise + Agilité");
r = await runtime.executeTest(v, "test-caracteristique", {...self, variables: {definition: def("presence")}}); assert.equal(r.bonus, 3);
log("un seul test de compétence : réussite, échec, critique, complication, DD 13 par défaut, maîtrise + sa caractéristique");

// 3. A creature from the Super Pack, an opposed Test, then weapons.
const foe = makeActor("Loup-garou");
await bridge.acquireTemplate(v, foe.uuid, "creature-loup-garou", {sourceItemId: "tpl-foe"});
const both = {roles: {self: actor.uuid, target: foe.uuid}};
nextNatural = 12; r = await runtime.executeTest(v, "se-cacher", both);
assert.equal(r.opposed.testId, "reperer"); assert.equal(r.margin, r.total - r.target);
log(`opposition : Discrétion ${r.total} contre Vigilance ${r.target}, marge ${r.margin}`);

await bridge.acquireTemplate(v, actor.uuid, "arme-pistolet-9-mm", {sourceItemId: "pistolet"});
const foeVitality = () => poolOf(foe.uuid, "vitalite");
const foeAgility = await runtime.evaluateFormula(v, "bonus-caracteristique", {roles: {self: foe.uuid}, variables: {test: {inputs: {definition: def("agilite")}}}});
const foeProtection = await runtime.evaluateFormula(v, "protection-calcul", {roles: {self: foe.uuid}});
let before = await foeVitality();
nextNatural = 15; let used = await bridge.executeAcquiredAction(v, actor.uuid, "attaquer", {...both, variables: {input: {couverture: 2}}}, {contentKey: "pistolet"});
assert.equal(used.testResult.target, 10 + foeAgility + foeProtection + 2);
assert.equal(used.testResult.bonus, 3 + 1, "Agilité + Armes de poing");
assert.equal(rolled.at(-1), "2d6"); assert.equal(await foeVitality(), Math.max(0, before - 6));
log(`attaque au pistolet : DD ${used.testResult.target} (Défense + couverture 2), 2d6 retirés à la Vitalité`);
await runtime.setDefinitionState(v, foe.uuid, "vitalite", {pools: {points: 40}});
before = await foeVitality();
nextNatural = 20; used = await bridge.executeAcquiredAction(v, actor.uuid, "attaquer", both, {contentKey: "pistolet"});
assert.equal(rolled.at(-1), "4d6"); assert.equal(await foeVitality(), Math.max(0, before - 12));
log("critique : dés doublés (4d6)");
nextNatural = 2; before = await foeVitality(); used = await bridge.executeAcquiredAction(v, actor.uuid, "attaquer", both, {contentKey: "pistolet"});
assert.equal(await foeVitality(), before, "échec : pas de dégâts");
await bridge.acquireTemplate(v, actor.uuid, "arme-poing-americain", {sourceItemId: "poing"});
await runtime.setDefinitionState(v, foe.uuid, "vitalite", {pools: {points: 40}});
nextNatural = 15; before = await foeVitality(); used = await bridge.executeAcquiredAction(v, actor.uuid, "attaquer", both, {contentKey: "poing"});
assert.equal(rolled.at(-1), "1d6"); assert.equal(await foeVitality(), before - (3 + 2), "1d6 + Force");
log("poing américain : 1d6 + Force ; échec sans dégâts");

// 4. Protection from worn armour, and perforation.
await bridge.acquireTemplate(v, actor.uuid, "equipement-gilet-pare-balles", {sourceItemId: "gilet"});
assert.equal(await runtime.evaluateFormula(v, "defense-calcul", self), 13, "porté seulement s'il est équipé");
await runtime.setContentField(v, actor.uuid, "gilet", "equipe", true);
assert.equal(await runtime.evaluateFormula(v, "protection-calcul", self), 2);
assert.equal(await runtime.evaluateFormula(v, "defense-calcul", self), 15);
nextNatural = 10; r = await runtime.executeTest(v, "attaque-mains-nues", {roles: {self: foe.uuid, target: actor.uuid}});
assert.equal(r.target, 10 + 3 + 2);
log("Protection : gilet porté +2, Défense 15");

// 5. Powers: revealed by Esprit, Energy paid before the test, damage reduced by armour.
await bridge.acquireTemplate(v, actor.uuid, "pouvoir-pyrokinesie", {sourceItemId: "pyro"});
let [power] = (await runtime.listOwnedContents(v, actor.uuid)).filter(row => row.key === "pyro");
assert.equal(power.available, false, "Esprit 3 sous le seuil 4");
await assert.rejects(bridge.executeAcquiredAction(v, actor.uuid, "pouvoir-degats", both, {contentKey: "pyro"}), /not available/);
await runtime.setDefinitionState(v, actor.uuid, "esprit", {base: 4});
[power] = (await runtime.listOwnedContents(v, actor.uuid)).filter(row => row.key === "pyro");
assert.equal(power.available, true);
const energy = await poolOf(actor.uuid, "energie");
await runtime.setDefinitionState(v, foe.uuid, "vitalite", {pools: {points: 40}});
before = await foeVitality();
nextNatural = 15; used = await bridge.executeAcquiredAction(v, actor.uuid, "pouvoir-degats", both, {contentKey: "pyro"});
assert.equal(await poolOf(actor.uuid, "energie"), energy - 2);
assert.equal(used.testResult.target, 16);
assert.equal(await foeVitality(), before - Math.max(0, 6 - foeProtection));
nextNatural = 2; await bridge.executeAcquiredAction(v, actor.uuid, "pouvoir-degats", both, {contentKey: "pyro"});
assert.equal(await poolOf(actor.uuid, "energie"), energy - 4, "payée même en cas d'échec");
await runtime.setDefinitionState(v, actor.uuid, "energie", {pools: {points: 1}});
used = await bridge.executeAcquiredAction(v, actor.uuid, "pouvoir-degats", both, {contentKey: "pyro"});
assert.equal(used.allowed, false);
log("pouvoir : révélé à Esprit 4, Énergie payée avant le test, refusé sans Énergie, dégâts moins l'armure");

// 6. Endurance penalty, combat rounds, rest, daily recovery.
await runtime.setDefinitionState(v, actor.uuid, "endurance", {pools: {points: 2}});
assert.equal(await formula("malus-endurance"), 3);
nextNatural = 10; r = await runtime.executeTest(v, "attaque-mains-nues", both);
assert.equal(r.total, 10 + 2 + 1 - 3);
used = await bridge.executeAcquiredAction(v, actor.uuid, "attaquer", both, {contentKey: "pistolet"});
assert.equal(used.testResult.bonus, 4, "pas d'essoufflement à distance");
log("essoufflement : malus 3 en mêlée, aucun à distance");
for (const round of [1, 2, 3]) await runtime.emitSystemEvent("rta.combat.round", {combatId: "c", round}, [actor.uuid, foe.uuid]);
assert.equal(await poolOf(actor.uuid, "endurance"), 1);
log("combat : −1 Endurance au troisième round");
await runtime.setDefinitionState(v, actor.uuid, "endurance", {pools: {points: 0}});
assert.equal((await runtime.executeAction(v, "sprinter", self)).allowed, false);
assert.equal((await bridge.executeAcquiredAction(v, actor.uuid, "attaquer", both, {contentKey: "poing"})).allowed, false);
assert.notEqual((await bridge.executeAcquiredAction(v, actor.uuid, "attaquer", both, {contentKey: "pistolet"})).allowed, false);
log("Endurance 0 : sprint et mêlée refusés, tir possible");
await runtime.executeAction(v, "long-repos", self);
assert.equal(await poolOf(actor.uuid, "endurance"), 10);
log("long repos : Endurance remise à 10");
await runtime.setDefinitionState(v, actor.uuid, "vitalite", {pools: {points: 5}});
await runtime.emitSystemEvent("rta.time.elapsed", timeElapsedPayload(86400 * 3, 86400 * 2), [actor.uuid]);
assert.equal(await poolOf(actor.uuid, "vitalite"), 7);
log("temps : +1 Vitalité par jour écoulé");

// 7. Practice: only a test the GM asks for (module RWF tools, run on the GM's client with the announced d20) gives
// practice, 1 on a success, 2 on a critical; a free roll from the sheet gives nothing, and a player cannot run it.
const practice = async id => (await runtime.getContainerState(actor.uuid)).definitionStates[`pratique-${id}`].capabilityStates.value.base;
const free = id => runtime.executeAction(v, "tester-competence", {...self, variables: {definition: def(id), input: {dd: 13}}});
const asked = (id, de) => runtime.executeAction(v, "test-demande", {...self, variables: {definition: def(id), input: {dd: 13, de}}});
nextNatural = 20; await free("investigation");
assert.equal(await practice("investigation"), 0, "jet libre");
await asked("investigation", 12);
assert.equal(await practice("investigation"), 1);
await asked("investigation", 20);
assert.equal(await practice("investigation"), 3);
await asked("investigation", 2);
assert.equal(await practice("investigation"), 3, "échec : rien");
assert.ok(!rolled.slice(-3).includes("1d20"), "le d20 annoncé n'est pas relancé");
runtime.adapter.users.set("joueur", {role: "player", isGM: false}); runtime.adapter.ownership.set(`${actor.uuid}|joueur`, "owner"); runtime.adapter.currentUserId = "joueur";
await assert.rejects(() => asked("investigation", 20));
assert.equal(await practice("investigation"), 3, "un joueur ne lance pas un test demandé");
runtime.adapter.currentUserId = "gm";
await runtime.executeAction(v, "tester-caracteristique", {...self, variables: {definition: def("presence"), input: {dd: 13}}});
const dds = api.getRuleset(v).parameters.filter(p => p.tags.includes("difficulte")).map(p => p.value).sort((a, b) => a - b);
assert.deepEqual(dds, [10, 13, 16, 19, 22]);
log("pratique : seul un test demandé par le MJ rapporte (+1, +2 critique), jamais un jet libre ni un joueur seul ; DD 10 à 22");
// Investigation 3 → 4 costs 40 for an adult; a teenager (×1,5) pays 27.
await runtime.setDefinitionState(v, actor.uuid, "pratique-investigation", {base: 39});
let progress = await runtime.advance(v, "pratique", actor.uuid, "progresser-investigation", "investigation");
assert.equal(progress.allowed, false);
await runtime.setDefinitionState(v, actor.uuid, "pratique-investigation", {base: 45});
progress = await runtime.advance(v, "pratique", actor.uuid, "progresser-investigation", "investigation");
assert.deepEqual([progress.allowed, progress.after, progress.cost, await practice("investigation")], [true, 4, 40, 5]);
await runtime.setDefinitionState(v, actor.uuid, "investigation", {base: 5});
await runtime.setDefinitionState(v, actor.uuid, "pratique-investigation", {base: 500});
assert.equal((await runtime.advance(v, "pratique", actor.uuid, "progresser-investigation", "investigation")).allowed, false, "5 au plus");
log("progression : 40 points de 3 à 4 pour un adulte, reliquat gardé, plafond 5");

// 8. Combat: initiative rerolled each round, attacks per round by mastery, practice and wounds in combat.
const initiative = api.getRuleset(v).initiative;
assert.deepEqual([initiative.testRef, initiative.eachRound], ["initiative", true]);
assert.equal(await runtime.evaluateFormula(v, "departage-initiative", self), 3 * 10 + 4);
await runtime.executeAction(v, "long-repos", self);
await runtime.setDefinitionState(v, foe.uuid, "vitalite", {pools: {points: 200}});
await runtime.emitSystemEvent("rta.combat.start", {combatId: "c2", round: 1}, [actor.uuid, foe.uuid]);
await runtime.emitSystemEvent("rta.combat.round", {combatId: "c2", round: 1}, [actor.uuid, foe.uuid]);
assert.equal(await runtime.evaluateCondition(v, "est-en-combat", self), true);
const pistolPractice = await practice("armes-de-poing");
nextNatural = 15; assert.notEqual((await bridge.executeAcquiredAction(v, actor.uuid, "attaquer", both, {contentKey: "pistolet"})).allowed, false);
assert.equal(await practice("armes-de-poing"), pistolPractice + 1, "une attaque réussie en combat rapporte 1");
used = await bridge.executeAcquiredAction(v, actor.uuid, "attaquer", both, {contentKey: "pistolet"});
assert.equal(used.allowed, false, "Armes de poing 1 : une seule attaque par round");
await runtime.setDefinitionState(v, actor.uuid, "armes-de-poing", {base: 3});
nextNatural = 20; used = await bridge.executeAcquiredAction(v, actor.uuid, "attaquer", both, {contentKey: "pistolet"});
assert.notEqual(used.allowed, false, "maîtrise 3 : deux attaques par round");
assert.ok(((await runtime.getContainerState(foe.uuid)).stateInstances ?? []).some(s => s.definitionId === "blessure"), "le critique blesse");
assert.equal((await bridge.executeAcquiredAction(v, actor.uuid, "attaquer", both, {contentKey: "pistolet"})).allowed, false);
await runtime.emitSystemEvent("rta.combat.round", {combatId: "c2", round: 2}, [actor.uuid, foe.uuid]);
assert.notEqual((await bridge.executeAcquiredAction(v, actor.uuid, "attaquer", both, {contentKey: "pistolet"})).allowed, false, "nouveau round");
await runtime.emitSystemEvent("rta.combat.end", {combatId: "c2", round: 2}, [actor.uuid, foe.uuid]);
assert.equal(await runtime.evaluateCondition(v, "est-en-combat", self), false);
log("combat : initiative relancée chaque round, 1 / 2 / 3 attaques selon la maîtrise, pratique et blessure au critique");

// 9. Pursuit: DD 13, gauge from −3 to +3.
const gauge = async () => (await runtime.getContainerState(actor.uuid)).definitionStates["progression-poursuite"].capabilityStates.value.base;
await runtime.executeAction(v, "poursuite-nouvelle", self);
nextNatural = 10; used = await runtime.executeAction(v, "poursuite-a-pied-continuer", {...self, variables: {input: {vitesse: 1}}});
assert.equal(used.testResult.bonus, 3 + 1 + 2 - 0, "Agilité + Course à pied + maniabilité 2");
assert.equal(await gauge(), 2, "réussite +1, plus rapide +1");
nextNatural = 20; await runtime.executeAction(v, "poursuite-a-pied-raccourci", {...self, variables: {input: {vitesse: 1}}});
assert.equal(await gauge(), 3, "bornée à +3");
nextNatural = 1; await runtime.executeAction(v, "poursuite-a-pied-risque", {...self, variables: {input: {vitesse: 0}}});
assert.equal(await gauge(), 1);
await runtime.executeAction(v, "poursuite-arret", self);
assert.equal(await gauge(), 0);
await bridge.acquireTemplate(v, actor.uuid, "vehicule-citadine", {sourceItemId: "auto"});
nextNatural = 10; used = await bridge.executeAcquiredAction(v, actor.uuid, "poursuite-vehicule-raccourci", {...self, variables: {input: {vitesse: -1}}}, {contentKey: "auto"});
const car = api.getRuleset(v).contentTemplates.find(t => t.id === "vehicule-citadine").data;
assert.equal(used.testResult.bonus, 3 + 1 + car.maniabilite + 2, "Agilité + Véhicules légers + maniabilité + raccourci");
log(`poursuite : DD 13, jauge −3 à +3, raccourci +2, risque −2, véhicule (bonus ${used.testResult.bonus})`);

// 10. GM states are exclusive.
await runtime.executeAction(v, "etat-coma", both);
await runtime.executeAction(v, "etat-mort", both);
const foeStates = ((await runtime.getContainerState(foe.uuid)).stateInstances ?? []).filter(s => ["stabilise", "coma", "mort"].includes(s.definitionId));
assert.deepEqual(foeStates.map(s => s.definitionId), ["mort"]);
log("états MJ exclusifs :", JSON.stringify(foeStates.map(s => s.definitionId)));
console.log("OK");
