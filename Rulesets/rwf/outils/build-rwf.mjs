// Builds the Real World Fantasy Ruleset for Rule Them'All from the RWF rules
// (system v0.1.475, data constants only) and the RWF Super Pack v0.4.1.
// Usage: node build-rwf.mjs <repo> <systemDir> <packDir> <outDir>
import {readFileSync, writeFileSync, mkdirSync} from "node:fs";
import {pathToFileURL} from "node:url";

const [repo, sysDir, packDir, outDir] = process.argv.slice(2);
const imp = p => import(pathToFileURL(p).href);
const {createConfiguratorAPI} = await imp(`${repo}/src/configurator/configurator-api.mjs`);
const {emptyStorageSnapshot} = await imp(`${repo}/src/configurator/configurator-storage.mjs`);
const {RWF_DEFAULT_CREATION_RULES, RWF_DEFAULT_LIFE_EVENTS} = await imp(`${sysDir}/module/creation-config.mjs`);
const {RWF_DEFAULT_AGE_GROUPS, RWF_DEFAULT_BACKGROUNDS} = await imp(`${sysDir}/module/age-backgrounds.mjs`);
const {RWF_BASE_PROFESSIONS} = await imp(`${sysDir}/module/professions.mjs`);
const pack = name => JSON.parse(readFileSync(`${packDir}/${name}`, "utf8"));

const R = {id: "rwf", nameKey: "Real World Fantasy", descriptionKey: "Jeu de rôle contemporain fantastique : notre monde, plus les Fantaisies que le MJ rend vraies. Règles extraites du système RWF v0.1.475, contenus du RWF Super Pack v0.4.1.", version: "2.1.0", color: "#2f6f8f",
  // COMBAT-01: 1d20 + Agilité + Esprit, rerolled every round; ties go to Agilité, then Esprit.
  initiative: {testRef: "initiative", tableRef: null, tieBreakFormulaRef: "departage-initiative", eachRound: true, bySide: false, passes: null}};
const C = Object.fromEntries(["definitionTypes","definitions","parameters","formulas","formulaBindings","conditions","rolls","outcomes","tests","effects","actions","permissionPolicies","eventTypes","triggers","contentTypes","contentTemplates","modifiers","durations","creationSystems","progressionSystems","sheetDefinitions","scales","tags"].map(k => [k, []]));
const orders = {};
const add = (collection, entry) => {
  orders[collection] = (orders[collection] ?? 0) + 10;
  if (C[collection].some(x => x.id === entry.id)) throw new Error(`duplicate ${collection}/${entry.id}`);
  C[collection].push({order: orders[collection], ...entry});
  return entry.id;
};
const generic = extra => ({descriptionKey: "", enabled: true, tags: [], ...extra});
const slug = s => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/* ---------- References and AST helpers ---------- */
const val = id => ({objectKind: "definition", objectId: id, capabilityId: "value", outputId: "value.final"});
const base = id => ({objectKind: "definition", objectId: id, capabilityId: "value", outputId: "value.base"});
const pool = (id, out = "pool.current") => ({objectKind: "definition", objectId: id, capabilityId: "pool", slotId: "points", outputId: out});
const ref = (reference, container) => container ? {type: "reference", reference, container} : {type: "reference", reference};
const lit = value => ({type: "literal", value});
const par = id => ({type: "parameter", id});
const ctx = path => ({type: "context", path});
const sum = (...args) => ({type: "add", args});
const cf = (field, fallback) => fallback === undefined ? {type: "contentField", field} : {type: "contentField", field, default: lit(fallback)};
const defVal = definition => ({type: "definitionValue", definition, capabilityId: "value", outputId: "value.final"});
const defField = (definition, field) => ({type: "definitionField", definition, field});
const iff = (condition, then, otherwise) => ({type: "if", condition, then, else: otherwise});
const cmp = (type, left, right) => ({type, left, right});

/* ---------- Parameters ---------- */
const P = (id, nameKey, value, descriptionKey = "", valueType = "integer") => add("parameters", generic({id, nameKey, descriptionKey, valueType, value, scope: "ruleset"}));
P("dd-facile", "DD Facile", 10); P("dd-standard", "DD Standard", 13); P("dd-difficile", "DD Difficile", 16); P("dd-extreme", "DD Extrême", 19); P("dd-heroique", "DD Héroïque", 22);
P("base-vitalite", "Base de Vitalité", RWF_DEFAULT_CREATION_RULES.vitalityBase);
P("base-endurance", "Base d'Endurance", RWF_DEFAULT_CREATION_RULES.enduranceBase);
P("base-energie", "Base d'Énergie", RWF_DEFAULT_CREATION_RULES.energyBase);
P("defense-base", "Base de Défense", 10);
P("marche-metres", "Marche (mètres par round)", RWF_DEFAULT_CREATION_RULES.walkMeters);
P("sprint-metres", "Sprint (mètres par round)", RWF_DEFAULT_CREATION_RULES.sprintMeters);
P("caracteristique-depart", "Caractéristique de départ", RWF_DEFAULT_CREATION_RULES.baseAttribute);
P("caracteristique-plafond-libre", "Plafond libre des caractéristiques", RWF_DEFAULT_CREATION_RULES.attributeFreeMax);
P("caracteristique-plafond-age", "Plafond des caractéristiques après l'âge", RWF_DEFAULT_CREATION_RULES.attributeAgeMax);
P("competence-plafond-libre", "Plafond libre des compétences", RWF_DEFAULT_CREATION_RULES.skillFreeMax);
P("competence-plafond-creation", "Plafond des compétences à la création", RWF_DEFAULT_CREATION_RULES.skillCreationMax);
P("points-martiaux", "Points martiaux personnels", RWF_DEFAULT_CREATION_RULES.baseMartialPoints);
P("especes-part", "Part d'espèces du capital", RWF_DEFAULT_CREATION_RULES.cashDefaultRatio, "", "number");
P("especes-maximum", "Part d'espèces maximale", RWF_DEFAULT_CREATION_RULES.cashMaxRatio, "", "number");
P("protection-maximum", "Protection maximale", 10);
P("pj-caracteristique-minimum", "Caractéristique minimale d'un PJ", 1); P("pj-caracteristique-maximum", "Caractéristique maximale d'un PJ", 5); P("pj-competence-maximum", "Compétence ou maîtrise maximale d'un PJ", 5);
P("seuil-pratique-1", "Pratique : 0 vers 1", 5); P("seuil-pratique-2", "Pratique : 1 vers 2", 10); P("seuil-pratique-3", "Pratique : 2 vers 3", 20); P("seuil-pratique-4", "Pratique : 3 vers 4", 40); P("seuil-pratique-5", "Pratique : 4 vers 5", 80);
P("pratique-reussite", "Pratique gagnée sur une réussite", 1); P("pratique-critique", "Pratique gagnée sur un critique", 2);
P("poursuite-borne", "Borne de la jauge de poursuite", 3, "À +3 le poursuivant rattrape (ou le fuyard s'échappe) ; à −3 il perd la cible (ou le fuyard est rattrapé).");
P("dd-poursuite", "DD d'un test de poursuite", 13); P("bonus-raccourci", "Bonus d'un raccourci", 2); P("malus-risque", "Malus d'une prise de risque", 2);
P("maniabilite-a-pied", "Maniabilité de la course à pied", 2, "Profil natif Course à pied (OBJ-05).");

/* ---------- Definition Types ---------- */
const DT = (id, nameKey, caps, fields = {}, descriptionKey = "", color = null) => add("definitionTypes", {id, key: id, nameKey, descriptionKey, color, allowedCapabilities: caps, defaultCapabilities: caps, requiredCapabilities: caps, fields, constraints: []});
const refField = (id, name, definitionTypeId, required = true) => ({id, name, valueType: "reference", cardinality: "one", required, nullable: false, constraints: [], referenceTarget: {objectKind: "definition", definitionTypeId}});
DT("caracteristique", "Caractéristique", ["value"], {}, "Cinq caractéristiques. Un personnage joueur va de 1 à 5 ; un PNJ ou une créature peut dépasser 5.", "#b5523b");
const practiceField = () => refField("pratique", "Pratique", "pratique", false);
DT("competence", "Compétence", ["value"], {caracteristique: refField("caracteristique", "Caractéristique associée", "caracteristique"), pratique: practiceField()}, "Savoir-faire de 0 à 5 pour un personnage joueur ; progresse par la pratique.", "#3b7fb5");
DT("maitrise-combat", "Maîtrise de combat", ["value"], {caracteristique: refField("caracteristique", "Caractéristique associée", "caracteristique"), pratique: practiceField()}, "Technique de combat de 0 à 5 pour un personnage joueur ; fixe aussi le nombre d'attaques par round.", "#8f3b3b");
DT("maitrise-deplacement", "Maîtrise de déplacement", ["value"], {caracteristique: refField("caracteristique", "Caractéristique associée", "caracteristique"), pratique: practiceField()}, "Moyen de déplacement maîtrisé, de 0 à 5 pour un personnage joueur.", "#3b8f5a");
DT("ressource", "Ressource", ["pool"], {}, "Réserve courante bornée par un maximum calculé.", "#c99a2e");
DT("valeur-derivee", "Valeur dérivée", ["value"], {}, "Valeur calculée à partir d'autres définitions.", "#6a6a8f");
DT("etat", "État", ["state"], {}, "État appliqué à un personnage.", "#7a4f8f");
DT("statut", "Statut", ["state"], {}, "Ce qu'est le personnage pour les règles.", "#4f6a8f");
DT("pratique", "Pratique", ["value"], {}, "Points de pratique d'une compétence ou d'une maîtrise : une réussite à un test demandé par le MJ en rapporte 1, un critique 2. Ils paient le niveau suivant dans la progression.", "#5f7f9f");
DT("compteur", "Compteur", ["value"], {}, "Compte tenu par les règles pendant le jeu.", "#6a6a6a");
DT("poursuite", "Poursuite", ["value"], {}, "Jauge individuelle d'une poursuite, de −3 à +3.", "#3b8f5a");

/* ---------- Definitions ---------- */
const D = (id, typeId, nameKey, data = {}, extra = {}) => {
  const capabilities = C.definitionTypes.find(t => t.id === typeId).allowedCapabilities;
  return add("definitions", {id, key: id, definitionTypeId: typeId, nameKey, descriptionKey: "", data, capabilities, enabled: true, tags: [], ...extra});
};
const ATTR = {strength: "force", agility: "agilite", constitution: "constitution", mind: "esprit", presence: "presence"};
D("force", "caracteristique", "Force"); D("agilite", "caracteristique", "Agilité"); D("constitution", "caracteristique", "Constitution"); D("esprit", "caracteristique", "Esprit"); D("presence", "caracteristique", "Présence");
const attrRef = key => ({objectKind: "definition", objectId: ATTR[key] ?? key});

const SKILLS = [ // [system key, id, label, attribute]
  ["athletics", "athletisme", "Athlétisme", "agility"], ["stealth", "discretion", "Discrétion", "agility"], ["perception", "vigilance", "Vigilance", "mind"],
  ["investigation", "investigation", "Investigation", "mind"], ["survival", "survie", "Survie", "mind"], ["technology", "technique", "Technique", "mind"],
  ["computing", "informatique", "Informatique", "mind"], ["science", "sciences", "Sciences", "mind"], ["medicine", "medecine", "Médecine", "mind"],
  ["culture", "culture", "Culture", "mind"], ["influence", "influence", "Influence", "presence"], ["empathy", "empathie", "Empathie", "presence"],
  ["languages", "langues", "Langues", "mind"], ["arts", "arts", "Arts", "presence"],
  ["occult", "occultisme", "Occultisme", "mind"] // 15th skill (Luca 2026-10-11): 40 powers of the Super Pack use it.
];
const SKILL = Object.fromEntries(SKILLS.map(([k, id]) => [k, id]));
SKILL.knowledge = "culture"; // Connaissances is folded into Culture (Luca 2026-10-11)
for (const [, id, label, attr] of SKILLS) D(id, "competence", label, {caracteristique: attrRef(attr)});

const COMBAT = [["unarmed", "corps-a-corps", "Corps à corps", "strength"], ["melee", "armes-de-melee", "Armes de mêlée", "strength"], ["handgun", "armes-de-poing", "Armes de poing", "agility"], ["shoulderArms", "armes-d-epaule", "Armes d'épaule", "agility"], ["heavyWeapons", "armes-lourdes", "Armes lourdes", "agility"], ["thrown", "armes-de-jet", "Armes de jet", "agility"], ["bow", "armes-de-trait", "Armes de trait", "agility"]];
const MASTERY = Object.fromEntries(COMBAT.map(([k, id]) => [k, id]));
MASTERY.shortMelee = MASTERY.longMelee = "armes-de-melee"; // Super Pack keys absent from the rules
for (const [, id, label, attr] of COMBAT) D(id, "maitrise-combat", label, {caracteristique: attrRef(attr)});
const MOVES = [["running", "course-a-pied", "Course à pied"], ["lightVehicle", "vehicules-legers", "Véhicules légers"], ["motorcycle", "deux-roues-motorises", "Deux-roues motorisés"], ["heavyVehicle", "poids-lourds", "Poids lourds"], ["publicTransport", "transport-collectif", "Transport collectif"], ["cycling", "cyclisme", "Cyclisme"], ["riding", "equitation", "Équitation / Monture"], ["nautical", "navigation", "Navigation"], ["ski", "ski-glisse", "Ski / Glisse"], ["air", "pilotage-aerien", "Pilotage aérien"], ["specialized", "engins-specialises", "Engins spécialisés"]];
const MOVE = Object.fromEntries(MOVES.map(([k, id]) => [k, id]));
MOVE.automobile = "vehicules-legers"; // Super Pack key absent from the rules
for (const [, id, label] of MOVES) D(id, "maitrise-deplacement", label, {caracteristique: attrRef("agility")}, id === "course-a-pied" ? {descriptionKey: "Profil natif : sa valeur est celle d'Athlétisme."} : {});

// The reserve follows its maximum: when Constitution rises, the missing points stay missing (keepMissing).
const POOL = (id, label, formulaId, descriptionKey) => D(id, "ressource", label, {}, {descriptionKey, slots: {pool: [{id: "points", name: label, valueType: "integer", minimum: {literal: 0}, maximum: {formulaRef: formulaId}, underflowPolicy: "clamp", overflowPolicy: "clamp", maximumPolicy: "keepMissing", order: 0}]}});
POOL("vitalite", "Vitalité", "vitalite-maximum", "Santé physique. À 0, le personnage est hors de combat.");
POOL("endurance", "Endurance", "endurance-maximum", "Souffle et fatigue. À 0, incapacité physique temporaire jusqu'à un long repos.");
POOL("energie", "Énergie", "energie-maximum", "Ressource dépensée par les Pouvoirs.");
D("protection", "valeur-derivee", "Protection", {}, {descriptionKey: "Armure naturelle (valeur de base) + armures des équipements portés, plafonnée à 10."});
D("defense", "valeur-derivee", "Défense", {}, {descriptionKey: "10 + Agilité + Protection. La perforation d'une arme réduit la Protection de la cible."});
D("personnage-joueur", "statut", "Personnage joueur", {}, {descriptionKey: "Coché : caractéristiques de 1 à 5, compétences et maîtrises de 0 à 5. Décoché (PNJ, créature) : sans plafond. Un pouvoir dépasse ces plafonds par un Modificateur."});
const ST = (id, label, descriptionKey) => D(id, "etat", label, {}, {descriptionKey});
ST("hors-de-combat", "Hors de combat", "Vitalité à 0. Le MJ choisit ensuite Stabilisé, Coma ou Mort.");
ST("stabilise", "Stabilisé", "Hors de combat mais stabilisé.");
ST("coma", "Coma", "Hors de combat et inconscient.");
ST("mort", "Mort", "Le personnage est mort. Aucun soin ne l'en fait sortir sans décision du MJ.");
ST("incapacite-physique", "Incapacité physique", "Endurance à 0 : pas d'attaque physique, de sprint ni d'effort soutenu ; parler, réfléchir et utiliser un pouvoir sans effort restent possibles. Se termine par un long repos.");
ST("blessure", "Blessure", "Blessure reçue sur un coup critique.");
ST("blessure-grave", "Blessure grave", "Blessure reçue sur des dégâts d'au moins 75 % de la Vitalité maximale.");
D("en-combat", "statut", "En combat", {}, {descriptionKey: "Actif pendant un combat engagé dans Foundry : les attaques comptent dans le budget du round et rapportent de la pratique."});
D("attaques-utilisees", "compteur", "Attaques utilisées ce round", {}, {descriptionKey: "Remis à 0 à chaque round. Une attaque n'est possible que tant qu'il reste moins d'attaques utilisées que la maîtrise de l'arme n'en permet (passes 1 / 2 / 3)."});
D("progression-poursuite", "poursuite", "Progression de poursuite", {}, {descriptionKey: "De −3 à +3. Continuer, prendre un risque ou un raccourci la fait avancer selon le résultat (+2 critique, +1 réussite, −1 échec, −2 complication) et l'avantage de vitesse ; s'arrêter retire 1."});
// PROG-01: every skill and mastery has its own practice; Course à pied gives its practice to Athlétisme (PROG-03).
const PRACTISED = [...SKILLS.map(([, id]) => id), ...COMBAT.map(([, id]) => id), ...MOVES.map(([, id]) => id).filter(id => id !== "course-a-pied")];
for (const id of PRACTISED) {
  const practised = C.definitions.find(d => d.id === id);
  D(`pratique-${id}`, "pratique", `Pratique : ${practised.nameKey}`);
  practised.data.pratique = {objectKind: "definition", objectId: `pratique-${id}`};
}
C.definitions.find(d => d.id === "course-a-pied").data.pratique = {objectKind: "definition", objectId: "pratique-athletisme"};

/* ---------- Formulas, bindings, conditions ---------- */
const F = (id, nameKey, expression, _resultType = "number", descriptionKey = "") => add("formulas", generic({id, nameKey, descriptionKey, resultType: "number", expression}));
F("vitalite-maximum", "Vitalité maximale", sum(par("base-vitalite"), ref(val("force")), ref(val("constitution"))), "integer", "Base de Vitalité + Force + Constitution.");
F("endurance-maximum", "Endurance maximale", sum(par("base-endurance"), ref(val("constitution"))), "integer", "Base d'Endurance + Constitution.");
F("energie-maximum", "Énergie maximale", sum(par("base-energie"), ref(val("esprit")), ref(val("presence"))), "integer", "Base d'Énergie + Esprit + Présence.");
F("protection-calcul", "Protection", {type: "min", args: [par("protection-maximum"), sum(ref(base("protection")), {type: "contentAggregate", operation: "sum", contentTypeId: "equipement", field: "protection", whereField: "equipe"})]}, "integer", "Armure naturelle + armures des équipements portés, plafonnée à 10.");
F("defense-calcul", "Défense", sum(par("defense-base"), ref(val("agilite")), {type: "max", args: [lit(0), ref(val("protection"))]}), "integer", "10 + Agilité + Protection.");
F("course-a-pied-valeur", "Course à pied", ref(val("athletisme")), "integer", "Course à pied vaut Athlétisme.");
F("endurance-pourcentage", "Endurance restante (%)", {type: "divide", args: [{type: "multiply", args: [ref(pool("endurance")), lit(100)]}, ref(pool("endurance", "pool.maximum"))]});
F("malus-endurance", "Malus physique d'Endurance", {type: "rangeLookup", value: {type: "formula", id: "endurance-pourcentage"}, ranges: [{max: 25, value: 3}, {max: 50, value: 2}, {max: 75, value: 1}, {value: 0}]}, "integer", "0 au-dessus de 75 %, 1 jusqu'à 75 %, 2 jusqu'à 50 %, 3 jusqu'à 25 %.");
// COMBAT-02: attacks per round by mastery, resolved in passes 1, 2 and 3.
const attacksFor = mastery => iff(cmp("lte", mastery, lit(2)), lit(1), iff(cmp("lte", mastery, lit(4)), lit(2), lit(3)));
F("attaques-arme", "Attaques par round avec l'arme", attacksFor(defVal(cf("maitrise"))), "integer", "Selon la maîtrise de l'arme : 0–2 une attaque, 3–4 deux, 5 trois.");
F("attaques-mains-nues", "Attaques par round à mains nues", attacksFor(ref(val("corps-a-corps"))), "integer", "Selon Corps à corps : 0–2 une attaque, 3–4 deux, 5 trois.");
F("attaques-meilleure", "Meilleur nombre d'attaques par round", attacksFor({type: "max", args: COMBAT.map(([, id]) => ref(val(id)))}), "integer", "Selon la meilleure maîtrise de combat : le budget d'un sprint ou d'une action générale.");
F("dd-demandee", "DD demandée", ctx("variables.input.dd"), "number", "DD annoncée par le MJ (13 par défaut).");
F("couverture-demandee", "Couverture de la cible", ctx("variables.input.couverture"), "number", "Couverture ajoutée à la difficulté d'une attaque (0 par défaut).");
F("dd-du-test", "DD du test", ctx("variables.test.inputs.dd"));
// COMBAT-04: the weapon's perforation lowers the target's Protection, never below 0.
F("difficulte-attaque", "Difficulté d'attaque", sum(par("defense-base"), ref(val("agilite"), "target"), {type: "max", args: [lit(0), {type: "subtract", args: [ref(val("protection"), "target"), cf("perforation", 0)]}]}, ctx("variables.test.inputs.couverture")), "number", "10 + Agilité de la cible + max(0, sa Protection − perforation de l'arme) + couverture.");
F("capital-suggere", "Capital de départ suggéré", {type: "multiply", args: [{type: "round", value: {type: "divide", args: [{type: "multiply", args: [{type: "divide", args: [sum(ctx("variables.financeMin"), ctx("variables.financeMax")), lit(2)]}, {type: "max", args: [lit(0.05), sum(lit(1), ctx("variables.modificateurFinancier"))]}]}, lit(50)]}}, lit(50)]}, "number", "Milieu de la fourchette du Parcours × (1 + modificateurs des backgrounds et événements), arrondi à 50.");
// A binding holds for every Actor read, the attacker as well as the target.
const FB = (id, nameKey, formulaRef, targetRef) => add("formulaBindings", generic({id, nameKey, formulaRef, targetRef}));
FB("lien-defense", "Défense calculée", "defense-calcul", val("defense"));
FB("lien-course-a-pied", "Course à pied = Athlétisme", "course-a-pied-valeur", val("course-a-pied"));
FB("lien-protection", "Protection calculée", "protection-calcul", val("protection"));
// One Test for every skill or mastery: the Definition asked for (variables.definition) and its own attribute.
const asked = ctx("variables.test.inputs.definition");
add("formulas", generic({id: "definition-demandee", nameKey: "Définition demandée", descriptionKey: "Compétence, maîtrise ou caractéristique choisie pour le test.", resultType: "reference", expression: ctx("variables.definition")}));
F("bonus-caracteristique", "Bonus de caractéristique", defVal(asked), "integer", "Valeur de la caractéristique testée.");
F("bonus-competence", "Bonus de compétence", sum(defVal(asked), defVal(defField(asked, "caracteristique"))), "integer", "Compétence ou maîtrise testée + sa caractéristique associée.");
// Weapons: the attack reads the weapon used (its attribute, mastery, bonus); melee loses the Endurance penalty (TEST-02, END-02).
const melee = cmp("eq", cf("portee", 0), lit(0));
F("bonus-attaque-arme", "Bonus d'attaque de l'arme", {type: "subtract", args: [sum(defVal(cf("caracteristique")), defVal(cf("maitrise")), cf("bonus", 0)), iff(melee, {type: "formula", id: "malus-endurance"}, lit(0))]}, "integer", "Caractéristique + maîtrise de l'arme + son bonus, moins l'essoufflement en mêlée.");
F("bonus-mains-nues", "Bonus d'attaque à mains nues", {type: "subtract", args: [sum(ref(val("force")), ref(val("corps-a-corps"))), {type: "formula", id: "malus-endurance"}]}, "integer", "Force + Corps à corps, moins l'essoufflement.");
// COMBAT-05: a critical doubles the dice, not the constants; Force is added when the weapon says so.
F("multiplicateur-critique", "Dés doublés au critique", iff(cmp("eq", ctx("variables.test.outcome.resultKey"), lit("critique")), lit(2), lit(1)), "integer", "2 sur une réussite critique, sinon 1.");
F("degats-force-arme", "Force ajoutée aux dégâts", iff(cf("ajouteForce", false), ref(val("force")), lit(0)), "integer", "Force si l'arme l'ajoute à ses dégâts.");
F("valeur-force", "Force", ref(val("force")), "integer");
// Powers: the power used gives its attribute, skill, difficulty and cost.
F("bonus-pouvoir", "Bonus de pouvoir", sum(defVal(cf("caracteristique")), defVal(cf("competence"))), "integer", "Caractéristique + compétence du pouvoir.");
F("dd-pouvoir", "DD du pouvoir", cf("difficulte"), "integer");
F("cout-pouvoir", "Coût du pouvoir", cf("cout", 0), "integer");
// COMBAT-07 (Luca 2026-10-11, armour behaviour kept): power damage loses max(0, armour − perforation).
F("armure-contre-pouvoir", "Armure contre le pouvoir", {type: "subtract", args: [lit(0), {type: "max", args: [lit(0), {type: "subtract", args: [ref(val("protection"), "target"), cf("perforation", 0)]}]}]}, "integer", "Retire max(0, Protection de la cible − perforation) aux dégâts d'un pouvoir.");
F("jours-ecoules", "Jours écoulés", ctx("event.payload.days"), "integer", "Nombre de minuits passés quand le temps du monde avance.");
/* Bornes d'un personnage joueur (règle RWF) : seule la valeur de base est bornée, un pouvoir passe au-dessus par un Modificateur.
   Sans le statut Personnage joueur (PNJ, créature), la Formula ne donne rien : pas de borne. */
const estPJ = {type: "reference", reference: {objectKind: "definition", objectId: "personnage-joueur", capabilityId: "state", outputId: "state.active"}};
F("pj-caracteristique-minimum", "Minimum d'une caractéristique", iff(estPJ, par("pj-caracteristique-minimum"), lit(null)), "integer", "1 pour un personnage joueur ; rien pour un PNJ ou une créature.");
F("pj-caracteristique-maximum", "Maximum d'une caractéristique", iff(estPJ, par("pj-caracteristique-maximum"), lit(null)), "integer", "5 pour un personnage joueur ; rien pour un PNJ ou une créature.");
F("pj-competence-minimum", "Minimum d'une compétence ou maîtrise", iff(estPJ, lit(0), lit(null)), "integer", "0 pour un personnage joueur ; rien pour un PNJ ou une créature.");
F("pj-competence-maximum", "Maximum d'une compétence ou maîtrise", iff(estPJ, par("pj-competence-maximum"), lit(null)), "integer", "5 pour un personnage joueur ; rien pour un PNJ ou une créature.");
F("poursuite-minimum", "Minimum de la jauge de poursuite", {type: "subtract", args: [lit(0), par("poursuite-borne")]}, "integer");
F("poursuite-maximum", "Maximum de la jauge de poursuite", par("poursuite-borne"), "integer");
C.definitionTypes.find(t => t.id === "poursuite").valueBounds = {minimum: {formulaRef: "poursuite-minimum"}, maximum: {formulaRef: "poursuite-maximum"}};
C.definitionTypes.find(t => t.id === "caracteristique").valueBounds = {minimum: {formulaRef: "pj-caracteristique-minimum"}, maximum: {formulaRef: "pj-caracteristique-maximum"}};
for (const id of ["competence", "maitrise-combat", "maitrise-deplacement"]) C.definitionTypes.find(t => t.id === id).valueBounds = {minimum: {formulaRef: "pj-competence-minimum"}, maximum: {formulaRef: "pj-competence-maximum"}};

const K = (id, nameKey, expression, descriptionKey = "") => add("conditions", generic({id, nameKey, descriptionKey, expression}));
K("est-critique", "20 naturel", {type: "eq", left: ctx("variables.test.natural"), right: lit(20)});
K("est-complication", "1 naturel", {type: "eq", left: ctx("variables.test.natural"), right: lit(1)});
K("atteint-la-dd", "Total au moins égal à la DD", {type: "gte", left: ctx("variables.test.margin"), right: lit(0)});
K("vitalite-a-zero", "Vitalité à 0", {type: "lte", left: ref(pool("vitalite")), right: lit(0)});
K("endurance-a-zero", "Endurance à 0", {type: "lte", left: ref(pool("endurance")), right: lit(0)});
K("endurance-disponible", "Endurance au-dessus de 0", {type: "gt", left: ref(pool("endurance")), right: lit(0)});
K("attaque-possible", "Attaque possible", {type: "or", args: [cmp("gt", ref(pool("endurance")), lit(0)), cmp("gt", cf("portee", 0), lit(0))]}, "À Endurance 0, plus d'attaque physique : seules les armes à distance restent utilisables.");
K("energie-suffisante", "Énergie suffisante", cmp("gte", ref(pool("energie")), cf("cout", 0)), "L'Énergie couvre le coût du pouvoir.");
K("pouvoir-connu", "Pouvoir révélé", cmp("gte", ref(val("esprit")), cf("seuilEsprit", 0)), "Un pouvoir latent se révèle quand l'Esprit atteint son seuil.");
K("troisieme-round", "Tous les trois rounds", cmp("eq", {type: "mod", args: [ctx("event.payload.round"), lit(3)]}, lit(0)));

/* ---------- Rolls, outcomes ---------- */
add("rolls", generic({id: "d20", nameKey: "1d20", formula: "1d20", data: {}}));
add("rolls", generic({id: "degats-contenu", nameKey: "Dés de dégâts de l'arme ou du pouvoir", descriptionKey: "Les dés écrits sur l'arme ou le pouvoir utilisé.", formula: "@content.degats", data: {}}));
add("rolls", generic({id: "degats-mains-nues", nameKey: "1d4", formula: "1d4", data: {}}));
// A test the GM asks for (module RWF tools): the player rolls the d20 or reads it from the table, the result arrives as input.
add("rolls", generic({id: "d20-annonce", nameKey: "d20 annoncé", descriptionKey: "Le d20 que le joueur a lancé, avec les dés de Foundry ou sur la table.", formula: "@input.de", data: {}}));
const O = (id, nameKey, resultKey, conditionRef, descriptionKey) => add("outcomes", generic({id, nameKey, descriptionKey, resultKey, conditionRef, labelKey: nameKey}));
O("reussite-critique", "Réussite critique", "critique", "est-critique", "20 naturel : réussite automatique et spectaculaire. Double les dés de dégâts d'une attaque.");
O("complication", "Complication", "complication", "est-complication", "1 naturel : échec avec complication, même si le total suffisait.");
O("reussite", "Réussite", "reussite", "atteint-la-dd", "Total au moins égal à la DD.");
O("echec", "Échec", "echec", null, "Total inférieur à la DD.");
const OUTCOMES = {outcomeRefs: ["reussite-critique", "complication", "reussite"], fallbackOutcomeRef: "echec"};
const DD_INPUT = {id: "dd", source: {formulaRef: "dd-demandee"}, valueType: "number", required: true, defaultValue: 13};
const COVER_INPUT = {id: "couverture", source: {formulaRef: "couverture-demandee"}, valueType: "number", required: true, defaultValue: 0};

/* ---------- Tests ---------- */
const bonusFormula = (parts, extra = 0) => {
  const id = `bonus-${parts.join("-")}${extra ? `-${extra > 0 ? "plus" : "moins"}${Math.abs(extra)}` : ""}`;
  if (!C.formulas.some(f => f.id === id)) {
    const label = parts.map(p => C.definitions.find(d => d.id === p).nameKey).join(" + ") + (extra ? ` ${extra > 0 ? "+" : "−"} ${Math.abs(extra)}` : "");
    F(id, `Bonus ${label}`, sum(...parts.map(p => ref(val(p))), ...(extra ? [lit(extra)] : [])), "integer");
  }
  return id;
};
const T = (id, nameKey, bonusFormulaRef, more = {}) => add("tests", generic({id, nameKey, rollRef: "d20", inputBindings: [DD_INPUT], bonusFormulaRef, totalFormulaRef: null, targetFormulaRef: "dd-du-test", targetValue: null, marginFormulaRef: null, ...OUTCOMES, ...more}));
const attrOf = id => C.definitions.find(d => d.id === id).data.caracteristique.objectId;
const ASKED_INPUT = {id: "definition", source: {formulaRef: "definition-demandee"}, valueType: "reference", required: true};
T("test-caracteristique", "Test de caractéristique", "bonus-caracteristique", {descriptionKey: "1d20 + la caractéristique choisie contre la DD.", inputBindings: [ASKED_INPUT, DD_INPUT]});
T("test-competence", "Test de compétence ou de maîtrise", "bonus-competence", {descriptionKey: "1d20 + la compétence ou maîtrise choisie + sa caractéristique, contre la DD.", inputBindings: [ASKED_INPUT, DD_INPUT]});
T("test-competence-demande", "Test de compétence demandé par le MJ", "bonus-competence", {descriptionKey: "Le d20 annoncé par le joueur + la compétence + sa caractéristique, contre la DD choisie par le MJ.", rollRef: "d20-annonce", inputBindings: [ASKED_INPUT, DD_INPUT]});
add("tests", generic({id: "initiative", nameKey: "Initiative", descriptionKey: "1d20 + Agilité + Esprit. Le plus haut agit en premier.", rollRef: "d20", inputBindings: [], bonusFormulaRef: bonusFormula(["agilite", "esprit"]), totalFormulaRef: null, targetFormulaRef: null, targetValue: null, marginFormulaRef: null, outcomeRefs: [], fallbackOutcomeRef: null}));
// Opposed: hiding against the target's Vigilance; the margin is between the two totals.
const fixedSkill = id => ({id: "definition", source: {literal: {objectKind: "definition", objectId: id}}, valueType: "reference", required: true});
T("reperer", "Repérer (Vigilance)", "bonus-competence", {descriptionKey: "Vigilance de la cible contre une Discrétion.", inputBindings: [fixedSkill("vigilance")], targetFormulaRef: null, outcomeRefs: [], fallbackOutcomeRef: null});
T("se-cacher", "Se cacher (Discrétion contre Vigilance)", "bonus-competence", {descriptionKey: "Test en opposition : Discrétion contre la Vigilance de la cible.", inputBindings: [fixedSkill("discretion")], targetFormulaRef: null, opposedTestRef: "reperer"});
T("attaque-arme", "Attaque avec une arme", "bonus-attaque-arme", {descriptionKey: "1d20 + caractéristique + maîtrise + bonus de l'arme utilisée, contre la Défense de la cible + couverture.", inputBindings: [COVER_INPUT], targetFormulaRef: "difficulte-attaque"});
T("attaque-mains-nues", "Attaque à mains nues", "bonus-mains-nues", {descriptionKey: "1d20 + Force + Corps à corps, contre la Défense de la cible + couverture.", inputBindings: [COVER_INPUT], targetFormulaRef: "difficulte-attaque"});
T("pouvoir", "Utilisation d'un pouvoir", "bonus-pouvoir", {descriptionKey: "1d20 + caractéristique + compétence du pouvoir utilisé, contre sa DD.", inputBindings: [], targetFormulaRef: "dd-pouvoir"});

/* ---------- Effects, durations, actions ---------- */
const E = (id, nameKey, targetRef, operation, operand, targetRole = "self", descriptionKey = "") => add("effects", generic({id, nameKey, descriptionKey, targetRef, targetRole, operation, operand}));
add("durations", generic({id: "un-round", nameKey: "Un round", mode: "fixed", amount: 1, unit: "round"}));
add("durations", generic({id: "un-jour", nameKey: "Un jour", mode: "fixed", amount: 1, unit: "day"}));
add("durations", generic({id: "jusqu-au-retrait", nameKey: "Jusqu'au retrait", mode: "untilRemoved"}));
E("long-repos-endurance", "Endurance au maximum", pool("endurance"), "set", {kind: "reference", reference: pool("endurance", "pool.maximum")}, "self", "Le long repos efface l'essoufflement.");
E("degats-arme", "Dégâts de l'arme", pool("vitalite"), "subtract", {kind: "roll", rollRef: "degats-contenu", multiplierFormulaRef: "multiplicateur-critique", bonusFormulaRef: "degats-force-arme"}, "target", "Dés de l'arme (doublés au critique) + Force si l'arme l'indique, retirés à la Vitalité de la cible.");
E("degats-mains-nues", "Dégâts à mains nues", pool("vitalite"), "subtract", {kind: "roll", rollRef: "degats-mains-nues", multiplierFormulaRef: "multiplicateur-critique", bonusFormulaRef: "valeur-force"}, "target", "1d4 (2d4 au critique) + Force.");
E("cout-pouvoir", "Coût en Énergie", pool("energie"), "subtract", {kind: "formula", id: "cout-pouvoir"}, "self", "L'Énergie est payée avant le test, même en cas d'échec.");
E("degats-pouvoir", "Dégâts du pouvoir", pool("vitalite"), "subtract", {kind: "roll", rollRef: "degats-contenu", bonusFormulaRef: "armure-contre-pouvoir", minimum: 0}, "target", "Dés du pouvoir moins max(0, armure − perforation) ; jamais de soin.");
E("soins-pouvoir", "Soins du pouvoir", pool("vitalite"), "add", {kind: "roll", rollRef: "degats-contenu"}, "target", "Dés du pouvoir rendus en Vitalité.");
E("essoufflement", "Essoufflement", pool("endurance"), "subtract", {kind: "literal", value: 1}, "self", "−1 Endurance.");
E("recuperation-naturelle", "Récupération naturelle", pool("vitalite"), "add", {kind: "formula", id: "jours-ecoules"}, "self", "+1 Vitalité par jour écoulé.");
const A = (id, nameKey, more = {}) => add("actions", generic({id, nameKey, conditionRefs: [], costEffectRefs: [], acquisitions: [], stateRemovals: [], stateApplications: [], modifierApplications: [], effectRefs: [], testRef: null, outcomeMappings: [], eventTypeRefs: [], ...more}));
const stateApply = (definitionId, targetRole = "target") => ({definitionId, targetRole, durationRef: "jusqu-au-retrait", stacking: "ignore", stacks: 1, severity: null, modifierRefs: []});
const stateRemove = (definitionId, targetRole = "target") => ({definitionId, targetRole});
A("long-repos", "Long repos", {descriptionKey: "Efface l'essoufflement et met fin à l'incapacité physique.", effectRefs: ["long-repos-endurance"], stateRemovals: [stateRemove("incapacite-physique", "self")]});
A("sprinter", "Sprinter", {descriptionKey: "Déplacement doublé pendant le round. Impossible à Endurance 0 ; consomme une attaque en combat.", conditionRefs: ["endurance-disponible"]});
A("mettre-hors-de-combat", "Mettre hors de combat", {stateApplications: [stateApply("hors-de-combat")]});
for (const [id, label] of [["stabilise", "Stabiliser"], ["coma", "Plonger dans le coma"], ["mort", "Déclarer mort"]]) {
  A(`etat-${id}`, label, {descriptionKey: "Choix du MJ pour un personnage à 0 Vitalité ; les trois états s'excluent.", stateRemovals: ["stabilise", "coma", "mort"].filter(x => x !== id).map(x => stateRemove(x)), stateApplications: [stateApply(id)]});
}
A("declarer-incapacite", "Incapacité physique", {stateApplications: [stateApply("incapacite-physique")]});
A("infliger-blessure", "Infliger une blessure", {stateApplications: [{...stateApply("blessure"), stacking: "separate"}]});
A("infliger-blessure-grave", "Infliger une blessure grave", {stateApplications: [{...stateApply("blessure-grave"), stacking: "separate"}]});
A("tester-caracteristique", "Tester une caractéristique", {descriptionKey: "Choisir la caractéristique au moment du test.", testRef: "test-caracteristique"});
A("tester-competence", "Tester une compétence ou une maîtrise", {descriptionKey: "Choisir la compétence ou la maîtrise au moment du test.", testRef: "test-competence"});
A("se-cacher", "Se cacher", {testRef: "se-cacher"});
const missed = [{outcomeId: "complication", effectRefs: []}, {outcomeId: "echec", effectRefs: []}];
A("attaquer", "Attaquer", {descriptionKey: "Avec l'arme qui porte l'action. Dégâts retirés à la Vitalité de la cible si l'attaque touche.", conditionRefs: ["attaque-possible"], testRef: "attaque-arme", effectRefs: ["degats-arme"], outcomeMappings: missed});
A("attaquer-mains-nues", "Attaquer à mains nues", {conditionRefs: ["endurance-disponible"], testRef: "attaque-mains-nues", effectRefs: ["degats-mains-nues"], outcomeMappings: missed});
A("utiliser-pouvoir", "Utiliser le pouvoir", {descriptionKey: "Paie l'Énergie puis teste le pouvoir.", conditionRefs: ["energie-suffisante"], costEffectRefs: ["cout-pouvoir"], testRef: "pouvoir"});
A("pouvoir-degats", "Utiliser le pouvoir (dégâts)", {descriptionKey: "Paie l'Énergie, teste le pouvoir, puis retire ses dégâts à la cible.", conditionRefs: ["energie-suffisante"], costEffectRefs: ["cout-pouvoir"], testRef: "pouvoir", effectRefs: ["degats-pouvoir"], outcomeMappings: missed});
A("pouvoir-soins", "Utiliser le pouvoir (soins)", {descriptionKey: "Paie l'Énergie, teste le pouvoir, puis rend sa Vitalité à la cible.", conditionRefs: ["energie-suffisante"], costEffectRefs: ["cout-pouvoir"], testRef: "pouvoir", effectRefs: ["soins-pouvoir"], outcomeMappings: missed});
A("s-essouffler", "S'essouffler", {effectRefs: ["essoufflement"]});
A("recuperer", "Récupérer", {effectRefs: ["recuperation-naturelle"]});
// END-03 (simplified: every third combat round, not only physical rounds) and SANTE-05.
add("triggers", generic({id: "essoufflement-en-combat", nameKey: "Essoufflement en combat", descriptionKey: "Tous les trois rounds de combat, chaque combattant perd 1 Endurance.", eventTypeId: "rta.combat.round", eventFilter: null, conditionRefs: ["troisieme-round"], actionRefs: ["s-essouffler"]}));
add("triggers", generic({id: "recuperation-quotidienne", nameKey: "Récupération quotidienne", descriptionKey: "Chaque jour qui passe rend 1 Vitalité.", eventTypeId: "rta.time.elapsed", eventFilter: null, conditionRefs: [], actionRefs: ["recuperer"]}));
A("action-initiative", "Lancer l'initiative", {testRef: "initiative"});

/* ---------- Combat budget, practice and pursuits (RWF 2.0.0) ---------- */
const enCombat = {type: "reference", reference: {objectKind: "definition", objectId: "en-combat", capabilityId: "state", outputId: "state.active"}};
const usedAttacks = ref(val("attaques-utilisees"));
F("departage-initiative", "Départage de l'initiative", sum({type: "multiply", args: [ref(val("agilite")), lit(10)]}, ref(val("esprit"))), "integer", "Agilité puis Esprit départagent deux initiatives égales.");
K("est-en-combat", "En combat", cmp("eq", enCombat, lit(true)), "Un combat est engagé dans Foundry et le personnage y participe.");
K("hors-combat", "Hors combat", cmp("neq", enCombat, lit(true)));
const budget = formulaId => ({type: "or", args: [cmp("neq", enCombat, lit(true)), cmp("lt", usedAttacks, {type: "formula", id: formulaId})]});
K("attaque-arme-disponible", "Attaque disponible avec l'arme", budget("attaques-arme"), "Hors combat toujours ; en combat, tant que les attaques du round n'atteignent pas ce que permet la maîtrise de l'arme (COMBAT-03).");
K("attaque-mains-nues-disponible", "Attaque disponible à mains nues", budget("attaques-mains-nues"));
K("action-physique-disponible", "Action disponible ce round", budget("attaques-meilleure"), "Un sprint consomme une attaque ou une passe en combat (DEP-01).");
F("attaque-comptee", "Attaque comptée", iff(enCombat, lit(1), lit(0)), "integer", "1 en combat, 0 hors combat.");
E("compter-attaque", "Attaque du round utilisée", base("attaques-utilisees"), "add", {kind: "formula", id: "attaque-comptee"}, "self", "En combat, chaque attaque ou sprint utilise une passe du round.");
E("remise-attaques", "Nouveau round", base("attaques-utilisees"), "set", {kind: "literal", value: 0}, "self", "Les attaques du round repartent de zéro.");
A("nouveau-round", "Nouveau round", {descriptionKey: "Remet à zéro les attaques utilisées.", effectRefs: ["remise-attaques"]});
A("entrer-en-combat", "Entrer en combat", {effectRefs: ["remise-attaques"], stateApplications: [stateApply("en-combat", "self")]});
A("sortir-du-combat", "Sortir du combat", {effectRefs: ["remise-attaques"], stateRemovals: [stateRemove("en-combat", "self")]});
add("triggers", generic({id: "debut-de-combat", nameKey: "Début de combat", descriptionKey: "Chaque combattant entre en combat : ses attaques comptent dans le budget du round et rapportent de la pratique.", eventTypeId: "rta.combat.start", eventFilter: null, conditionRefs: [], actionRefs: ["entrer-en-combat"]}));
add("triggers", generic({id: "nouveau-round", nameKey: "Nouveau round", descriptionKey: "Les attaques du round repartent de zéro.", eventTypeId: "rta.combat.round", eventFilter: null, conditionRefs: [], actionRefs: ["nouveau-round"]}));
add("triggers", generic({id: "fin-de-combat", nameKey: "Fin de combat", eventTypeId: "rta.combat.end", eventFilter: null, conditionRefs: [], actionRefs: ["sortir-du-combat"]}));
Object.assign(C.actions.find(a => a.id === "sprinter"), {conditionRefs: ["endurance-disponible", "action-physique-disponible"], costEffectRefs: ["compter-attaque"]});

// PROG-03: a success on a test asked by the GM gives 1 practice, a critical 2; in an engaged combat, every attack counts.
F("pratique-gagnee", "Pratique gagnée", iff(cmp("eq", ctx("variables.test.outcome.resultKey"), lit("critique")), par("pratique-critique"), par("pratique-reussite")), "integer", "2 sur une réussite critique, 1 sur une réussite.");
add("formulas", generic({id: "pratique-de-la-definition", nameKey: "Pratique de la définition testée", descriptionKey: "La pratique de la compétence ou de la maîtrise testée.", resultType: "reference", expression: defField(asked, "pratique")}));
add("formulas", generic({id: "pratique-de-l-arme", nameKey: "Pratique de la maîtrise de l'arme", resultType: "reference", expression: defField(cf("maitrise"), "pratique")}));
K("est-pj", "Personnage joueur", cmp("eq", estPJ, lit(true)));
K("maitrise-pratiquee", "La maîtrise ou compétence progresse", cmp("neq", defField(asked, "pratique"), lit(null)), "Une caractéristique ne progresse pas par la pratique.");
E("gain-pratique", "Pratique de la compétence testée", base("pratique-athletisme"), "add", {kind: "formula", id: "pratique-gagnee"}, "self", "La pratique va à la compétence ou à la maîtrise testée.");
C.effects.at(-1).targetDefinitionFormulaRef = "pratique-de-la-definition";
E("gain-pratique-arme", "Pratique de la maîtrise de l'arme", base("pratique-armes-de-poing"), "add", {kind: "formula", id: "pratique-gagnee"}, "self");
C.effects.at(-1).targetDefinitionFormulaRef = "pratique-de-l-arme";
E("gain-pratique-mains-nues", "Pratique du Corps à corps", base("pratique-corps-a-corps"), "add", {kind: "formula", id: "pratique-gagnee"}, "self");
A("pratique-test", "Pratique d'un test demandé", {conditionRefs: ["est-pj", "maitrise-pratiquee"], effectRefs: ["gain-pratique"]});
A("pratique-arme", "Pratique d'une attaque en combat", {conditionRefs: ["est-pj", "est-en-combat"], effectRefs: ["gain-pratique-arme"]});
A("pratique-mains-nues", "Pratique d'une attaque à mains nues en combat", {conditionRefs: ["est-pj", "est-en-combat"], effectRefs: ["gain-pratique-mains-nues"]});
const DD_ASKED = {id: "dd", labelKey: "DD", valueType: "number", required: true, defaultValue: 13};
const D20_ANNOUNCED = {id: "de", labelKey: "Résultat du d20", valueType: "number", required: true, defaultValue: 10};
const COVER_ASKED = {id: "couverture", labelKey: "Couverture de la cible", valueType: "number", required: true, defaultValue: 0};
const succeeded = actionRefs => [{outcomeId: "reussite-critique", actionRefs}, {outcomeId: "reussite", actionRefs}];
Object.assign(C.actions.find(a => a.id === "tester-competence"), {inputs: [DD_ASKED]});
// Only a test the GM asked for gives practice: the GM's client runs it (module RWF tools), with the d20 the player announced.
A("test-demande", "Test demandé par le MJ", {descriptionKey: "Lancé par le module RWF tools quand le joueur répond à la demande du MJ. Une réussite rapporte de la pratique.", testRef: "test-competence-demande", inputs: [DD_ASKED, D20_ANNOUNCED], outcomeMappings: succeeded(["pratique-test"])});
Object.assign(C.actions.find(a => a.id === "tester-caracteristique"), {inputs: [DD_ASKED]});
// COMBAT-05: a critical hit doubles the dice and leaves a wound.
const hit = (damage, practice) => [{outcomeId: "reussite-critique", effectRefs: [damage], actionRefs: [practice, "infliger-blessure"]}, {outcomeId: "reussite", effectRefs: [damage], actionRefs: [practice]}, ...missed];
Object.assign(C.actions.find(a => a.id === "attaquer"), {inputs: [COVER_ASKED], conditionRefs: ["attaque-possible", "attaque-arme-disponible"], costEffectRefs: ["compter-attaque"], effectRefs: [], outcomeMappings: hit("degats-arme", "pratique-arme")});
Object.assign(C.actions.find(a => a.id === "attaquer-mains-nues"), {inputs: [COVER_ASKED], conditionRefs: ["endurance-disponible", "attaque-mains-nues-disponible"], costEffectRefs: ["compter-attaque"], effectRefs: [], outcomeMappings: hit("degats-mains-nues", "pratique-mains-nues")});

// POUR-02/03: pursuit tests at DD 13 with the means' attribute and mastery, its handling and the move's bonus;
// the gauge moves by the outcome and the speed advantage the GM announces.
F("delta-poursuite", "Avancée dans la poursuite", sum(ctx("variables.input.vitesse"), {type: "rangeLookup", value: {type: "formula", id: "rang-resultat"}, ranges: [{max: 0, value: -2}, {max: 1, value: -1}, {max: 2, value: 1}, {value: 2}]}), "integer", "Avantage de vitesse + 2 critique, +1 réussite, −1 échec, −2 complication.");
F("rang-resultat", "Rang du résultat", iff(cmp("eq", ctx("variables.test.outcome.resultKey"), lit("complication")), lit(0), iff(cmp("eq", ctx("variables.test.outcome.resultKey"), lit("echec")), lit(1), iff(cmp("eq", ctx("variables.test.outcome.resultKey"), lit("reussite")), lit(2), lit(3)))), "integer", "0 complication, 1 échec, 2 réussite, 3 critique.");
const moveBonus = {continuer: lit(0), raccourci: par("bonus-raccourci"), risque: {type: "subtract", args: [lit(0), par("malus-risque")]}};
const MOVES_LABEL = {continuer: "Continuer", risque: "Prise de risque", raccourci: "Raccourci"};
const vehicleMastery = cf("maitrise");
for (const [move, bonus] of Object.entries(moveBonus)) {
  F(`bonus-poursuite-vehicule-${move}`, `Poursuite en véhicule : ${MOVES_LABEL[move]}`, sum(defVal(defField(vehicleMastery, "caracteristique")), defVal(vehicleMastery), cf("maniabilite", 0), bonus), "integer", "Caractéristique + maîtrise du véhicule + sa maniabilité + le bonus de la manœuvre.");
  F(`bonus-poursuite-a-pied-${move}`, `Poursuite à pied : ${MOVES_LABEL[move]}`, {type: "subtract", args: [sum(ref(val("agilite")), ref(val("course-a-pied")), par("maniabilite-a-pied"), bonus), {type: "formula", id: "malus-endurance"}]}, "integer", "Agilité + Course à pied + maniabilité 2 + le bonus de la manœuvre, moins l'essoufflement.");
  for (const means of ["vehicule", "a-pied"]) add("tests", generic({id: `poursuite-${means}-${move}`, nameKey: `Poursuite ${means === "a-pied" ? "à pied" : "en véhicule"} : ${MOVES_LABEL[move]}`, rollRef: "d20", inputBindings: [], bonusFormulaRef: `bonus-poursuite-${means}-${move}`, totalFormulaRef: null, targetFormulaRef: "dd-de-poursuite", targetValue: null, marginFormulaRef: null, ...OUTCOMES}));
}
F("dd-de-poursuite", "DD de poursuite", par("dd-poursuite"), "integer");
E("avancer-poursuite", "Avancée dans la poursuite", base("progression-poursuite"), "add", {kind: "formula", id: "delta-poursuite"}, "self");
E("arret-poursuite", "S'arrêter", base("progression-poursuite"), "subtract", {kind: "literal", value: 1}, "self");
E("remise-poursuite", "Nouvelle poursuite", base("progression-poursuite"), "set", {kind: "literal", value: 0}, "self");
const SPEED_ASKED = {id: "vitesse", labelKey: "Vitesse face à la cible de référence", valueType: "integer", required: true, defaultValue: 0, options: [{value: 1, labelKey: "Plus rapide (+1)"}, {value: 0, labelKey: "Aussi rapide (0)"}, {value: -1, labelKey: "Moins rapide (−1)"}]};
for (const move of Object.keys(moveBonus)) {
  A(`poursuite-vehicule-${move}`, `Poursuite : ${MOVES_LABEL[move]}`, {descriptionKey: "Test de poursuite avec ce véhicule (DD 13). À +3 on rattrape ou on s'échappe, à −3 on perd la cible ou on est rattrapé.", inputs: [SPEED_ASKED], testRef: `poursuite-vehicule-${move}`, effectRefs: ["avancer-poursuite"]});
  A(`poursuite-a-pied-${move}`, `Poursuite à pied : ${MOVES_LABEL[move]}`, {descriptionKey: "Test de poursuite en courant (DD 13). Impossible à Endurance 0. À +3 on rattrape ou on s'échappe, à −3 on perd la cible ou on est rattrapé.", inputs: [SPEED_ASKED], conditionRefs: ["endurance-disponible"], testRef: `poursuite-a-pied-${move}`, effectRefs: ["avancer-poursuite"]});
}
A("poursuite-arret", "Poursuite : s'arrêter", {descriptionKey: "La jauge de poursuite perd 1.", effectRefs: ["arret-poursuite"]});
A("poursuite-nouvelle", "Nouvelle poursuite", {descriptionKey: "Remet la jauge de poursuite à 0.", effectRefs: ["remise-poursuite"]});

// PROG-02: the practice of the level reached pays the next one; the threshold is divided by the age group's learning speed.
const threshold = current => iff(cmp("lte", current, lit(0)), par("seuil-pratique-1"), iff(cmp("lte", current, lit(1)), par("seuil-pratique-2"), iff(cmp("lte", current, lit(2)), par("seuil-pratique-3"), iff(cmp("lte", current, lit(3)), par("seuil-pratique-4"), par("seuil-pratique-5")))));
F("multiplicateur-apprentissage", "Multiplicateur d'apprentissage", {type: "max", args: [lit(1), {type: "contentAggregate", operation: "max", contentTypeId: "tranche-age", field: "apprentissage"}]}, "number", "Celui de la tranche d'âge du personnage (1 sans tranche d'âge).");
F("cout-pratique", "Pratique pour le niveau suivant", {type: "max", args: [lit(1), {type: "ceil", value: {type: "divide", args: [threshold(ctx("variables.advance.current")), {type: "formula", id: "multiplicateur-apprentissage"}]}}]}, "integer", "max(1, plafond(seuil du niveau actuel / multiplicateur d'apprentissage)) : 5, 10, 20, 40, 80 pour un adulte.");
add("progressionSystems", generic({id: "pratique", nameKey: "Progression par la pratique", descriptionKey: "Chaque compétence et maîtrise monte de 0 à 5 en dépensant sa propre pratique. Le reliquat reste acquis.", advancements: PRACTISED.map(id => ({id: `progresser-${id}`, labelKey: C.definitions.find(d => d.id === id).nameKey, definitionTypeId: null, definitionIds: [id], currencyRef: base(`pratique-${id}`), costFormulaRef: "cout-pratique", step: 1, maximumFormulaRef: "pj-competence-maximum", conditionRef: null})), milestones: []}));

/* ---------- Categories and tags ---------- */
const fantasies = pack("fantasies/fantasies.json");
const TAG = (id, nameKey, color = null) => add("tags", {id, nameKey, descriptionKey: "", color});
// The DDs the GM picks from when asking for a test (module RWF tools).
TAG("difficulte", "Difficulté de test");
for (const id of ["dd-facile", "dd-standard", "dd-difficile", "dd-extreme", "dd-heroique"]) C.parameters.find(p => p.id === id).tags = ["difficulte"];
const TRAD = {magic: ["tradition-magie", "Magie"], psychic: ["tradition-psychique", "Psychique"], fantasy: ["tradition-fantaisie", "Fantaisie"], other: ["tradition-autre", "Autre tradition"]};
for (const [id, label] of Object.values(TRAD)) TAG(id, label, "#7a4f8f");
const WCAT = {unarmed: ["arme-mains-nues", "Mains nues"], melee: ["arme-melee", "Mêlée"], ranged: ["arme-distance", "Distance"], firearm: ["arme-a-feu", "Arme à feu"]};
for (const [id, label] of Object.values(WCAT)) TAG(id, label, "#8f3b3b");
// A Fantasy's category is a tag: the tag of that name when there is one (Magie), else one of its own.
const FCAT = {};
for (const category of [...new Set(fantasies.map(f => f.category))]) {
  const same = C.tags.find(tag => tag.nameKey.toLowerCase() === category.toLowerCase());
  FCAT[category] = same?.id ?? `fantaisie-${slug(category)}`;
  if (!same) add("tags", {id: FCAT[category], nameKey: category, descriptionKey: "Catégorie de Fantaisie.", color: null});
}
TAG("pnj-humain", "Humain"); TAG("pnj-creature", "Créature"); TAG("pnj-animal", "Animal");
TAG("contenu-a-illustrer", "Image à produire");

/* ---------- Content Types ---------- */
const field = (id, name, valueType, more = {}) => ({id, name, valueType, cardinality: "one", required: false, nullable: false, constraints: [], ...more});
const intF = (id, name, more = {}) => field(id, name, "integer", more);
const txt = (id, name, more = {}) => field(id, name, "string", more);
const CT = (id, nameKey, storageKind, fields, descriptionKey = "", runtimeMode = "unique", color = null) => add("contentTypes", generic({id, nameKey, descriptionKey, image: "", color, storageKind, documentSubtype: "", runtimeMode, fields}));
CT("socle", "Socle", "item", {}, "Base commune d'un personnage joueur : statut Personnage joueur, caractéristiques à 1, ressources, compétences et maîtrises connues.");
CT("tranche-age", "Tranche d'âge", "item", {ageMinimum: intF("ageMinimum", "Âge minimum"), ageMaximum: intF("ageMaximum", "Âge maximum"), pointsCaracteristiques: intF("pointsCaracteristiques", "Points de caractéristiques"), pointsCompetences: intF("pointsCompetences", "Points de compétences"), backgrounds: intF("backgrounds", "Backgrounds"), evenementsMinimum: intF("evenementsMinimum", "Événements minimum"), evenementsMaximum: intF("evenementsMaximum", "Événements maximum"), apprentissage: field("apprentissage", "Multiplicateur d'apprentissage", "number"), bonusAge: intF("bonusAge", "Bonus d'âge (Esprit, Présence)"), malusAge: intF("malusAge", "Malus d'âge (Force, Agilité, Constitution)")}, "Tranche d'âge du personnage joueur : réserves de création et vitesse d'apprentissage.");
CT("parcours", "Parcours", "item", {trait: txt("trait", "Trait"), ageMinimum: intF("ageMinimum", "Âge minimum"), ageMaximum: intF("ageMaximum", "Âge maximum", {nullable: true}), capitalMinimum: intF("capitalMinimum", "Capital minimum (€)"), capitalMaximum: intF("capitalMaximum", "Capital maximum (€)")}, "Situation actuelle du personnage : métier, études ou mode de vie.");
CT("background", "Background", "item", {ageMinimum: intF("ageMinimum", "Âge minimum"), modificateurFinancier: field("modificateurFinancier", "Modificateur financier", "number"), atoutNarratif: txt("atoutNarratif", "Atout narratif")}, "Milieu ou expérience passée qui a laissé des acquis.");
CT("evenement-vie", "Événement de vie", "item", {ageMinimum: intF("ageMinimum", "Âge minimum"), modificateurFinancier: field("modificateurFinancier", "Modificateur financier", "number"), questions: txt("questions", "Questions au joueur", {cardinality: "many"}), accrochesMJ: txt("accrochesMJ", "Accroches pour le MJ", {cardinality: "many"})}, "Moment marquant du passé du personnage.");
CT("acquis", "Acquis de création", "item", {}, "Acquis choisi pendant la création : point martial, permis.");
const masteryField = (id, name, typeId) => refField(id, name, typeId, false);
CT("arme", "Arme", "item", {categorie: txt("categorie", "Catégorie"), degats: txt("degats", "Dés de dégâts"), ajouteForce: field("ajouteForce", "Ajoute la Force aux dégâts", "boolean"), caracteristique: masteryField("caracteristique", "Caractéristique", "caracteristique"), maitrise: masteryField("maitrise", "Maîtrise", "maitrise-combat"), portee: intF("portee", "Portée (m)"), bonus: intF("bonus", "Bonus"), perforation: intF("perforation", "Perforation"), automatique: field("automatique", "Automatique", "boolean"), chargeur: intF("chargeur", "Chargeur"), munitions: intF("munitions", "Munitions chargées"), reserve: intF("reserve", "Munitions en réserve")}, "Arme. La portée 0 signifie contact pour la mêlée.", "unique", "#8f3b3b");
CT("equipement", "Équipement", "item", {protection: intF("protection", "Protection"), couverture: intF("couverture", "Couverture"), equipable: field("equipable", "Équipable", "boolean"), equipe: field("equipe", "Porté", "boolean")}, "Équipement ; sa protection compte quand il est porté.", "stackable", "#5a7a3b");
CT("vehicule", "Véhicule", "item", {type: txt("type", "Type"), maitrise: masteryField("maitrise", "Maîtrise", "maitrise-deplacement"), vitesse: intF("vitesse", "Vitesse"), acceleration: intF("acceleration", "Accélération"), maniabilite: intF("maniabilite", "Maniabilité"), structure: intF("structure", "Structure"), blindage: intF("blindage", "Blindage")}, "Véhicule ou monture utilisé en poursuite.", "unique", "#3b8f5a");
CT("pouvoir", "Pouvoir", "item", {caracteristique: masteryField("caracteristique", "Caractéristique", "caracteristique"), competence: masteryField("competence", "Compétence", "competence"), difficulte: intF("difficulte", "DD"), cout: intF("cout", "Coût en Énergie"), degats: txt("degats", "Dégâts ou soins"), effet: txt("effet", "Effet"), application: txt("application", "Application"), cible: txt("cible", "Cible"), portee: intF("portee", "Portée (m)"), perforation: intF("perforation", "Perforation"), seuilEsprit: intF("seuilEsprit", "Seuil d'Esprit"), manifestation: txt("manifestation", "Manifestation")}, "Pouvoir rendu vrai par une Fantaisie. Révélé au joueur quand son Esprit atteint le seuil.", "unique", "#7a4f8f");
C.contentTypes.find(t => t.id === "pouvoir").availabilityConditionRef = "pouvoir-connu";
const actorFields = {menace: intF("menace", "Menace"), role: txt("role", "Rôle"), variantes: txt("variantes", "Variantes contextuelles", {cardinality: "many"})};
CT("profil-pnj", "Profil PNJ", "actor", actorFields, "Profil humain réutilisable, à personnaliser selon le contexte.", "unique", "#6a6a8f");
CT("creature", "Créature", "actor", actorFields, "Créature rendue réelle par une Fantaisie.", "unique", "#7a4f8f");
CT("animal", "Animal", "actor", actorFields, "Animal réel.", "unique", "#5a7a3b");
CT("fantaisie", "Fantaisie", "item", {verite: txt("verite", "Vérité"), monde: txt("monde", "Dans le monde"), revelation: txt("revelation", "Révéler"), jeu: txt("jeu", "Faire jouer"), croisements: txt("croisements", "Croisements"), manifestations: txt("manifestations", "Manifestations", {cardinality: "many"})}, "Possibilité extraordinaire que le MJ rend vraie, avec ses manifestations et ses ressources suggérées.", "unique", "#2f6f8f");

const TPL = (id, nameKey, contentTypeId, data, more = {}) => add("contentTemplates", generic({id, nameKey, image: "", data, contentTypeId, acquisitionActionRef: null, choiceGroups: [], capabilities: [], runtimeMode: null, relations: [], ...more}));
const grant = (id, objectKind, objectId, initial) => ({id, operation: "grant", targetRef: {objectKind, objectId}, ...(initial ? {config: {initial}} : {})});
const strip = html => String(html ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

/* Socle: everything a character owns from the start. */
// What every combatant keeps track of in a fight and a pursuit (NPCs and creatures as well).
const COMBAT_STATE = ["en-combat", "attaques-utilisees", "progression-poursuite"];
const allSkills = SKILLS.map(([, id]) => id), allCombat = COMBAT.map(([, id]) => id), allMoves = MOVES.map(([, id]) => id);
TPL("humain", "Humain", "socle", {}, {descriptionKey: "Personnage joueur, caractéristiques à 1, Vitalité, Endurance et Énergie au maximum, Corps à corps et Course à pied natifs.", relations: [
  grant("personnage-joueur", "definition", "personnage-joueur", {"state.active": true}),
  ...["force", "agilite", "constitution", "esprit", "presence"].map(id => grant(id, "definition", id, {"value.base": 1})),
  ...["vitalite", "endurance", "energie", "protection", "defense"].map(id => grant(id, "definition", id)),
  ...allSkills.map(id => grant(id, "definition", id)), ...allCombat.map(id => grant(id, "definition", id)), grant("course-a-pied", "definition", "course-a-pied"),
  grant("attaque-mains-nues", "action", "attaquer-mains-nues"), grant("action-long-repos", "action", "long-repos"), grant("action-sprinter", "action", "sprinter"), grant("action-initiative", "action", "action-initiative"),
  grant("tester-caracteristique", "action", "tester-caracteristique"), grant("tester-competence", "action", "tester-competence"), grant("se-cacher", "action", "se-cacher"),
  ...PRACTISED.map(id => grant(`pratique-${id}`, "definition", `pratique-${id}`)), ...COMBAT_STATE.map(id => grant(id, "definition", id)),
  ...Object.keys(moveBonus).map(move => grant(`poursuite-a-pied-${move}`, "action", `poursuite-a-pied-${move}`)), grant("poursuite-arret", "action", "poursuite-arret"), grant("poursuite-nouvelle", "action", "poursuite-nouvelle")
]});

/* Age groups, Parcours, Backgrounds, life events. */
// An elder spreads 2 bonuses over Esprit/Présence and 2 penalties over Force/Agilité/Constitution, one point at a time.
const ageChoices = g => {
  const point = (id, name, attrs, amount) => ({id, name, min: 1, max: 1, options: attrs.map(key => ({id: ATTR[key], targetRef: {objectKind: "definition", objectId: ATTR[key]}, operation: "grant", config: {add: {"value.base": amount}}}))});
  return [...Array.from({length: g.agePositive ?? 0}, (_, i) => point(`bonus-age-${i + 1}`, `Bonus d'âge ${i + 1} (+1)`, g.agePositiveAttrs, 1)),
    ...Array.from({length: g.ageNegative ?? 0}, (_, i) => point(`malus-age-${i + 1}`, `Malus d'âge ${i + 1} (−1)`, g.ageNegativeAttrs, -1))];
};
for (const [key, g] of Object.entries(RWF_DEFAULT_AGE_GROUPS)) TPL(`age-${slug(key)}`, g.label, "tranche-age", {ageMinimum: g.min, ageMaximum: g.max, pointsCaracteristiques: g.attributePoints, pointsCompetences: g.skillPoints, backgrounds: g.backgroundCount, evenementsMinimum: g.eventMin, evenementsMaximum: g.eventMax, apprentissage: g.learningMultiplier, bonusAge: g.agePositive ?? 0, malusAge: g.ageNegative ?? 0}, {descriptionKey: g.description, choiceGroups: ageChoices(g)});
const choiceGroup = (id, name, count, keys, map, bonus = 1) => {
  const options = [...new Set(keys.map(k => map[k]).filter(Boolean))];
  if (!count || !options.length) return null;
  return {id, name, min: Math.min(count, options.length), max: Math.min(count, options.length), options: options.map(o => ({id: o, targetRef: {objectKind: "definition", objectId: o}, operation: "grant", config: {add: {"value.base": bonus}}}))};
};
const acquisitions = (src, prefix) => [
  choiceGroup(`${prefix}-competences`, src.skillChoiceCount > 1 ? "Compétences (+1 chacune)" : "Compétence (+1)", src.skillChoiceCount ?? 1, src.unlockSkills ?? [], SKILL, src.skillBonus ?? 1),
  choiceGroup(`${prefix}-combat`, "Maîtrise de combat (+1)", src.combatChoiceCount ?? 0, src.combatChoices ?? [], MASTERY, src.combatBonus ?? 1),
  choiceGroup(`${prefix}-deplacement`, "Maîtrise de déplacement (+1)", src.movementChoiceCount ?? 0, src.movementChoices ?? [], MOVE)
].filter(Boolean);
const unlocks = keys => [...new Set(keys.map(k => SKILL[k]))].map(id => ({id: `debloque-${id}`, operation: "unlock", targetRef: {objectKind: "definition", objectId: id}}));
for (const [key, p] of Object.entries(RWF_BASE_PROFESSIONS)) TPL(`parcours-${slug(key)}`, p.label, "parcours", {trait: p.trait, ageMinimum: p.minAge, ageMaximum: p.maxAge ?? null, capitalMinimum: p.financeMin, capitalMaximum: p.financeMax}, {descriptionKey: p.trait, relations: unlocks(p.unlockSkills), choiceGroups: acquisitions(p, "parcours")});
for (const [key, b] of Object.entries(RWF_DEFAULT_BACKGROUNDS)) TPL(`background-${slug(key)}`, b.label, "background", {ageMinimum: b.minAge, modificateurFinancier: b.financeModifier ?? 0, atoutNarratif: b.narrativeAsset ?? ""}, {descriptionKey: b.description, relations: unlocks(b.unlockSkills), choiceGroups: acquisitions(b, "background")});
for (const [key, e] of Object.entries(RWF_DEFAULT_LIFE_EVENTS)) TPL(`evenement-${slug(key)}`, e.label, "evenement-vie", {ageMinimum: e.minAge, modificateurFinancier: e.financeModifier ?? 0, questions: e.questions ?? [], accrochesMJ: e.gmHooks ?? []}, {descriptionKey: e.description});
for (const key of RWF_DEFAULT_CREATION_RULES.baseMartialChoices) TPL(`point-martial-${MASTERY[key]}`, `Point martial : ${C.definitions.find(d => d.id === MASTERY[key]).nameKey}`, "acquis", {}, {descriptionKey: "Point martial personnel de départ.", relations: [{...grant(MASTERY[key], "definition", MASTERY[key]), config: {add: {"value.base": 1}}}]});
TPL("permis-b", "Permis B", "acquis", {}, {descriptionKey: "À partir de 19 ans : au moins 1 en Véhicules légers.", relations: [grant("vehicules-legers", "definition", "vehicules-legers", {"value.base": 1})]});

/* ---------- Super Pack ---------- */
const report = {fixes: []};
const fix = (what) => report.fixes.push(what);
const PLACEHOLDER = {"Arbalète de chasse": ["bow", "ranged", "agility"], "Arme extraterrestre": ["handgun", "firearm", "agility"], "Arme intégrée cybernétique": ["handgun", "firearm", "agility"], "Arme lourde anti-créature": ["heavyWeapons", "firearm", "agility"], "Fusil tranquillisant": ["shoulderArms", "firearm", "agility"]};
const templateId = {};
for (const w of pack("resources/weapons.json")) {
  const s = w.system, id = slug(w.name);
  let mastery = s.mastery, category = s.category, attribute = s.attribute;
  if (PLACEHOLDER[w.name]) { [mastery, category, attribute] = PLACEHOLDER[w.name]; fix(`Arme « ${w.name} » : maîtrise ${s.mastery} → ${MASTERY[mastery]}, catégorie ${category}.`); }
  else if (!COMBAT.some(([k]) => k === mastery)) fix(`Arme « ${w.name} » : maîtrise ${mastery} → ${MASTERY[mastery]}.`);
  const masteryId = MASTERY[mastery], attrId = ATTR[attribute];
  templateId[w.id] = TPL(`arme-${id}`, w.name, "arme", {categorie: WCAT[category][1], degats: s.damage.replace(/\s*\+\s*@attributes\.strength\.value/, ""), ajouteForce: s.damage.includes("@attributes.strength.value"), caracteristique: {objectKind: "definition", objectId: attrId}, maitrise: {objectKind: "definition", objectId: masteryId}, portee: s.range ?? 0, bonus: s.bonus ?? 0, perforation: s.armorPiercing ?? 0, automatique: !!s.automatic, chargeur: s.magazineSize ?? 0, munitions: s.ammo ?? 0, reserve: s.ammoReserve ?? 0}, {descriptionKey: strip(s.description), tags: [WCAT[category][0], "contenu-a-illustrer"], relations: [grant("attaquer", "action", "attaquer")]});
}
for (const g of pack("resources/gear.json")) {
  const s = g.system;
  templateId[g.id] = TPL(`equipement-${slug(g.name)}`, g.name, "equipement", {protection: s.armor ?? 0, couverture: s.cover ?? 0, equipable: !!s.equippable, equipe: false}, {descriptionKey: strip(s.description), tags: ["contenu-a-illustrer"]});
}
const VTYPE = {car: "Voiture", motorcycle: "Moto", bike: "Vélo", boat: "Bateau", personal: "Personnel", mount: "Monture", air: "Aérien", truck: "Camion", atv: "Tout-terrain", other: "Autre"};
for (const v of pack("resources/vehicles.json")) {
  const s = v.system;
  if (!MOVES.some(([k]) => k === s.mastery)) fix(`Véhicule « ${v.name} » : maîtrise ${s.mastery} → ${MOVE[s.mastery]}.`);
  templateId[v.id] = TPL(`vehicule-${slug(v.name)}`, v.name, "vehicule", {type: VTYPE[s.type] ?? s.type, maitrise: {objectKind: "definition", objectId: MOVE[s.mastery]}, vitesse: s.speed ?? 0, acceleration: s.acceleration ?? 0, maniabilite: s.handling ?? 0, structure: s.structure ?? 1, blindage: s.armor ?? 0}, {descriptionKey: strip(s.description), tags: ["contenu-a-illustrer"], relations: Object.keys(moveBonus).map(move => grant(`poursuite-${move}`, "action", `poursuite-vehicule-${move}`))});
}
const APP = {effect: "Effet", damage: "Dégâts", healing: "Soins"}, TARGET = {none: "Aucune", self: "Soi-même", target: "Une cible"};
let occult = 0;
for (const p of pack("resources/powers.json")) {
  const s = p.system, id = slug(p.name), attrId = ATTR[s.attribute], skillId = SKILL[s.skill];
  if (s.skill === "occult") occult++;
  const hasDice = /\d+d\d+/.test(s.damage ?? "");
  const actionId = hasDice && s.application === "damage" ? "pouvoir-degats" : hasDice && s.application === "healing" ? "pouvoir-soins" : "utiliser-pouvoir";
  templateId[p.id] = TPL(`pouvoir-${id}`, p.name, "pouvoir", {caracteristique: {objectKind: "definition", objectId: attrId}, competence: {objectKind: "definition", objectId: skillId}, difficulte: s.difficulty, cout: s.cost ?? 0, degats: s.damage ?? "", effet: s.effect ?? "", application: APP[s.application] ?? s.application, cible: TARGET[s.target] ?? s.target, portee: s.range ?? 0, perforation: s.armorPiercing ?? 0, seuilEsprit: s.mindThreshold ?? 4, manifestation: s.manifestation ?? ""}, {descriptionKey: strip(s.description), tags: [TRAD[s.tradition][0], "contenu-a-illustrer"], relations: [grant("utiliser", "action", actionId)]});
}
if (occult) fix(`${occult} pouvoirs utilisaient la compétence « occult » : reliés à Occultisme.`);
const actorTemplate = (r, typeId, tag) => {
  const s = r.system, rel = [];
  for (const [k, id] of Object.entries(ATTR)) rel.push(grant(id, "definition", id, {"value.base": s.attributes?.[k]?.value ?? 1}));
  for (const id of ["vitalite", "endurance", "energie", "protection", "defense"]) rel.push(grant(id, "definition", id));
  const skills = {};
  for (const [k, v] of Object.entries(s.skills ?? {})) { const id = SKILL[k]; if (id) skills[id] = Math.max(skills[id] ?? 0, v?.value ?? 0); }
  for (const id of allSkills) rel.push(grant(id, "definition", id, skills[id] ? {"value.base": skills[id]} : undefined));
  if (s.armor) rel.find(x => x.id === "protection").config = {initial: {"value.base": s.armor}};
  rel.push(grant("corps-a-corps", "definition", "corps-a-corps"), grant("course-a-pied", "definition", "course-a-pied"), grant("attaque-mains-nues", "action", "attaquer-mains-nues"), ...COMBAT_STATE.map(id => grant(id, "definition", id)));
  return TPL(`${typeId}-${slug(r.name)}`, r.name, typeId, {menace: s.threat ?? 1, role: strip(s.role), variantes: r.profile?.contextualVariants ?? []}, {descriptionKey: strip(s.biography), tags: [tag, "contenu-a-illustrer"], relations: rel});
};
for (const r of pack("resources/npcs.json")) templateId[r.id] = actorTemplate(r, "profil-pnj", "pnj-humain");
for (const r of pack("resources/creatures.json")) templateId[r.id] = actorTemplate(r, "creature", "pnj-creature");
for (const r of pack("resources/animals.json")) templateId[r.id] = actorTemplate(r, "animal", "pnj-animal");
fix("PNJ, Créatures et Animaux : anciennes compétences converties (knowledge → Culture, occult → Occultisme, perception → Vigilance…).");

for (const f of fantasies) {
  const relations = [], seen = new Set();
  for (const [kind, list] of Object.entries(f.suggestedResources ?? {})) for (const s of list) {
    const target = templateId[s.resourceId ?? s.profileId], rid = `suggere-${target}`;
    if (!target || seen.has(rid)) continue;
    seen.add(rid);
    relations.push({id: rid, operation: "link", targetRef: {objectKind: "contentTemplate", objectId: target}, config: s.contextRole ? {roleContextuel: s.contextRole} : {}});
  }
  const manifestations = f.manifestations.map(m => [`${m.name}. ${m.description}`, m.gmAdvice && `Conseil MJ : ${m.gmAdvice}`, m.ideas && `Idées : ${m.ideas}`, m.questions && `Questions : ${m.questions}`].filter(Boolean).join("\n"));
  TPL(`fantaisie-${slug(f.name)}`, f.name, "fantaisie", {verite: f.core?.truth ?? f.truth, monde: f.core?.world ?? "", revelation: f.core?.reveal ?? "", jeu: f.core?.play ?? "", croisements: f.core?.crossovers ?? ""
    , manifestations}, {descriptionKey: f.truth, tags: ["contenu-a-illustrer", FCAT[f.category]], relations});
}

/* ---------- Permissions ---------- */
add("permissionPolicies", {id: "caracteristiques-mj", nameKey: "Caractéristiques réservées au MJ", descriptionKey: "Les caractéristiques restent stables : seul le MJ les modifie.", enabled: true, scope: {objectKind: "definitionType", objectId: "caracteristique"}, defaultEffect: "DENY", rules: [
  {id: "lecture", effect: "ALLOW", operations: ["read", "execute"], priority: 0},
  {id: "ecriture-mj", effect: "ALLOW", operations: ["write", "configure"], roles: ["assistant", "gamemaster"], priority: 10}]});
for (const [id, action] of [["test-demande-mj", "test-demande"], ["pratique-mj", "pratique-test"]]) add("permissionPolicies", {id, nameKey: action === "test-demande" ? "Test demandé lancé par le MJ" : "Pratique donnée par le MJ", descriptionKey: "Seul le client du MJ lance un test demandé : un joueur ne se donne pas de pratique.", enabled: true, scope: {objectKind: "action", objectId: action}, defaultEffect: "DENY", rules: [
  {id: "mj", effect: "ALLOW", operations: ["read", "execute"], roles: ["assistant", "gamemaster"], priority: 10}]});
add("permissionPolicies", {id: "pouvoirs-mj", nameKey: "Pouvoirs attribués par le MJ", descriptionKey: "Un joueur ne s'ajoute pas de pouvoir ; il utilise ceux que le MJ lui a donnés.", enabled: true, scope: {objectKind: "contentType", objectId: "pouvoir"}, defaultEffect: "DENY", rules: [
  {id: "usage", effect: "ALLOW", operations: ["read", "execute"], minimumOwnership: "owner", priority: 0},
  {id: "attribution-mj", effect: "ALLOW", operations: ["read", "write", "execute", "configure"], roles: ["assistant", "gamemaster"], priority: 10}]});

/* ---------- Creation ---------- */
const ids = type => C.contentTemplates.filter(t => t.contentTypeId === type).map(t => t.id);
// The answers so far feed the next steps: the age group sets how many backgrounds, events and points (B6).
const ageField = key => ctx(`variables.creation.age.fields.${key}`);
F("creation-backgrounds", "Backgrounds de la tranche d'âge", ageField("backgrounds"), "integer");
F("creation-evenements-minimum", "Événements minimum de la tranche d'âge", ageField("evenementsMinimum"), "integer");
F("creation-evenements-maximum", "Événements maximum de la tranche d'âge", ageField("evenementsMaximum"), "integer");
F("creation-points-caracteristiques", "Points de caractéristiques de la tranche d'âge", ageField("pointsCaracteristiques"), "integer");
F("creation-points-competences", "Points de compétences de la tranche d'âge", ageField("pointsCompetences"), "integer");
F("creation-plafond-caracteristique", "Points par caractéristique", {type: "subtract", args: [par("caracteristique-plafond-libre"), par("caracteristique-depart")]}, "integer", "Plafond libre − valeur de départ.");
K("option-age-compatible", "Accessible à cet âge", cmp("lte", ctx("variables.option.fields.ageMinimum"), ageField("ageMaximum")), "L'âge minimal de l'option ne dépasse pas la tranche d'âge choisie.");
K("permis-accessible", "19 ans ou plus", cmp("gte", ageField("ageMaximum"), lit(19)));
add("creationSystems", generic({id: "creation-pj", nameKey: "Création d'un personnage joueur", descriptionKey: "Socle, âge, Parcours et ses compétences, Backgrounds et leurs compétences, Événements de vie, base martiale, puis répartition des points libres.", steps: [
  {id: "socle", name: "Socle humain (caractéristiques à 1, compétences connues à 0)", kind: "content", required: true, min: 1, max: 1, options: [], source: {collection: "contentTemplates", objectIds: ["humain"]}},
  {id: "age", name: "Tranche d'âge", kind: "content", required: true, min: 1, max: 1, options: [], source: {collection: "contentTemplates", objectIds: ids("tranche-age")}},
  {id: "effets-age", name: "Effets de l'âge", kind: "contentChoices", source: {stepIds: ["age"]}},
  {id: "parcours", name: "Parcours", kind: "content", required: true, min: 1, max: 1, options: [], source: {collection: "contentTemplates", objectIds: ids("parcours")}, optionConditionRef: "option-age-compatible"},
  {id: "acquis-parcours", name: "Compétences du Parcours", kind: "contentChoices", source: {stepIds: ["parcours"]}},
  {id: "backgrounds", name: "Backgrounds", kind: "content", required: true, min: 1, max: 3, minFormulaRef: "creation-backgrounds", maxFormulaRef: "creation-backgrounds", options: [], source: {collection: "contentTemplates", objectIds: ids("background")}, optionConditionRef: "option-age-compatible"},
  {id: "acquis-backgrounds", name: "Compétences des backgrounds", kind: "contentChoices", source: {stepIds: ["backgrounds"]}},
  {id: "evenements", name: "Événements de vie", kind: "content", required: true, min: 1, max: 4, minFormulaRef: "creation-evenements-minimum", maxFormulaRef: "creation-evenements-maximum", options: [], source: {collection: "contentTemplates", objectIds: ids("evenement-vie")}, optionConditionRef: "option-age-compatible"},
  {id: "choix-evenements", name: "Choix des événements de vie", kind: "contentChoices", source: {stepIds: ["evenements"]}},
  {id: "point-martial", name: "Point martial personnel", kind: "content", required: true, min: 1, max: 1, options: [], source: {collection: "contentTemplates", objectIds: ids("acquis").filter(id => id.startsWith("point-martial"))}},
  {id: "permis", name: "Permis B (19 ans et plus)", kind: "content", required: false, min: 0, max: 1, options: [], source: {collection: "contentTemplates", objectIds: ["permis-b"]}, optionConditionRef: "permis-accessible"},
  {id: "points-caracteristiques", name: "Points de caractéristiques", kind: "allocation", required: true, min: 0, max: 9, minFormulaRef: "creation-points-caracteristiques", maxFormulaRef: "creation-points-caracteristiques", perTargetMaxFormulaRef: "creation-plafond-caracteristique", options: [], source: {collection: "definitions", objectIds: ["force", "agilite", "constitution", "esprit", "presence"]}},
  {id: "points-competences", name: "Points de compétences", kind: "allocation", required: true, min: 0, max: 7, minFormulaRef: "creation-points-competences", maxFormulaRef: "creation-points-competences", perTargetMax: RWF_DEFAULT_CREATION_RULES.skillFreeMax, options: [], source: {collection: "definitions", objectIds: allSkills}},
  {id: "finalisation", name: "Finalisation", kind: "review", required: false, min: 0, max: 0, options: []}
]}));

/* ---------- État de santé (règle RWF) et feuille de PJ ---------- */
// Ce que les autres lisent de la Vitalité d'un personnage, au lieu du nombre : 5 pleine forme … 0 coma, mort ou stabilisé.
add("scales", generic({id: "etat-de-sante", nameKey: "État de santé", descriptionKey: "Ce qu'un observateur lit de la Vitalité d'un personnage, en part de sa Vitalité maximale.", basis: "percent", rows: [
  {id: "pleine-forme", labelKey: "Semble en pleine forme", min: 100, max: null},
  {id: "un-peu-blesse", labelKey: "Un peu blessé", min: 75, max: 99.99},
  {id: "blesse", labelKey: "Blessé", min: 50, max: 74.99},
  {id: "mal-en-point", labelKey: "Mal en point", min: 25, max: 49.99},
  {id: "etat-critique", labelKey: "État critique", min: 0.01, max: 24.99},
  {id: "hors-de-combat", labelKey: "Coma, mort ou stabilisé", min: null, max: 0}
]}));
C.definitions.find(d => d.id === "vitalite").scaleRef = "etat-de-sante";

// Feuille de PJ : le joueur voit sa jauge de Vitalité, un observateur son état de santé, le MJ la jauge et ses − / +.
const each = (capabilityId, outputId) => ({kind: "each", capabilityId, outputId});
const list = (id, typeId, children, columns = 1) => ({id: `liste-${id}`, kind: "repeater", query: {definitionTypeId: typeId}, columns, children});
const gauge = (id, label, style, write = {operation: "adjust"}) => ({id: `jauge-${id}`, kind: "value", labelKey: label, source: {kind: "output", reference: pool(id)}, display: "gauge", write, style: {label: "top", ...style}});
const gmActions = ["mettre-hors-de-combat", "etat-stabilise", "etat-coma", "etat-mort", "infliger-blessure", "infliger-blessure-grave"];
// Actions run by the rules themselves (rounds, practice) or from a Content (a vehicle's pursuit) are not sheet buttons.
const ruleOnly = ["test-demande", "nouveau-round", "entrer-en-combat", "sortir-du-combat", "pratique-test", "pratique-arme", "pratique-mains-nues", "s-essouffler", "recuperer", ...Object.keys(moveBonus).map(move => `poursuite-vehicule-${move}`)];
const actionIds = C.actions.map(a => a.id).filter(id => !ruleOnly.includes(id));
add("sheetDefinitions", generic({id: "feuille-pj", nameKey: "Feuille de PJ", descriptionKey: "Personnage, compétences, équipement et actions. La Vitalité exacte n'est visible que du joueur et du MJ ; les observateurs lisent l'état de santé.", target: "actor", contentTypeIds: [], root: {id: "root", kind: "grid", columns: 1, children: [{id: "onglets", kind: "tabs", children: [
  {id: "onglet-personnage", kind: "tab", labelKey: "Personnage", children: [
    {id: "sante", kind: "section", labelKey: "Santé", columns: 3, children: [
      {...gauge("vitalite", "Vitalité", {fill: "danger", fillTo: "success"}, {operation: "adjust", by: "gm"}), seenBy: ["player", "gm"]},
      {id: "etat-vitalite", kind: "value", labelKey: "État de santé", source: {kind: "output", reference: pool("vitalite")}, display: "description", seenBy: ["observer"], style: {label: "top", italic: true}},
      gauge("endurance", "Endurance", {fill: "warning", fillTo: "success"}),
      gauge("energie", "Énergie", {fill: "highlight", fillTo: "accent"})]},
    {id: "caracteristiques", kind: "section", labelKey: "Caractéristiques", columns: 1, children: [list("caracteristiques", "caracteristique", [
      {id: "valeur-caracteristique", kind: "value", source: each("value", "value.final")},
      {id: "tester-caracteristique", kind: "action", actionRef: "tester-caracteristique", labelKey: "Tester"}], 2)]},
    {id: "derivees", kind: "section", labelKey: "Valeurs dérivées", columns: 1, children: [list("derivees", "valeur-derivee", [{id: "valeur-derivee", kind: "value", source: each("value", "value.final")}])]},
    {id: "etats", kind: "section", labelKey: "États", columns: 1, children: [list("etats", "etat", [{id: "etat-actif", kind: "value", source: each("state", "state.active"), write: {operation: "set", by: "gm"}}])]},
    {id: "combat-poursuite", kind: "section", labelKey: "Combat et poursuite", columns: 2, children: [
      {id: "attaques-utilisees", kind: "value", labelKey: "Attaques utilisées ce round", source: {kind: "output", reference: val("attaques-utilisees")}, write: {operation: "set", by: "gm"}},
      {id: "progression-poursuite", kind: "value", labelKey: "Progression de poursuite (−3 à +3)", source: {kind: "output", reference: val("progression-poursuite")}, write: {operation: "set", by: "gm"}}]}]},
  {id: "onglet-competences", kind: "tab", labelKey: "Compétences", children: [
    {id: "competences", kind: "section", labelKey: "Compétences", columns: 1, children: [list("competences", "competence", [
      {id: "valeur-competence", kind: "value", source: each("value", "value.final")},
      {id: "tester-competence", kind: "action", actionRef: "tester-competence", labelKey: "Tester"}], 2)]},
    {id: "maitrises-combat", kind: "section", labelKey: "Maîtrises de combat", columns: 1, children: [list("maitrises-combat", "maitrise-combat", [{id: "valeur-maitrise-combat", kind: "value", source: each("value", "value.final")}])]},
    {id: "maitrises-deplacement", kind: "section", labelKey: "Maîtrises de déplacement", columns: 1, children: [list("maitrises-deplacement", "maitrise-deplacement", [{id: "valeur-maitrise-deplacement", kind: "value", source: each("value", "value.final")}])]},
    {id: "pratique", kind: "section", labelKey: "Progression par la pratique", columns: 1, children: [
      {id: "texte-pratique", kind: "text", textKey: "Une réussite à un test demandé par le MJ rapporte 1 point de pratique (2 sur un critique) ; en combat, chaque attaque réussie compte. La pratique d'un niveau paie le suivant."},
      list("pratiques", "pratique", [{id: "valeur-pratique", kind: "value", source: each("value", "value.final"), write: {operation: "set", by: "gm"}}], 3),
      {id: "progression-pratique", kind: "progression", progressionSystemRef: "pratique"}]}]},
  {id: "onglet-equipement", kind: "tab", labelKey: "Équipement", children: [{id: "possessions", kind: "contents"}]},
  {id: "onglet-actions", kind: "tab", labelKey: "Actions", children: [
    {id: "actions-joueur", kind: "section", labelKey: "Actions", columns: 3, children: actionIds.filter(id => !gmActions.includes(id) && !["tester-caracteristique", "tester-competence"].includes(id)).map(id => ({id: `action-${id}`, kind: "action", actionRef: id}))},
    {id: "actions-mj", kind: "section", labelKey: "Actions du MJ", columns: 3, seenBy: ["gm"], children: [
      {id: "statut-pj", kind: "value", labelKey: "Personnage joueur (plafonds)", source: {kind: "output", reference: {objectKind: "definition", objectId: "personnage-joueur", capabilityId: "state", outputId: "state.active"}}, write: {operation: "set", by: "gm"}},
      ...gmActions.filter(id => actionIds.includes(id)).map(id => ({id: `action-${id}`, kind: "action", actionRef: id}))]}]}
]}]}}));

/* ---------- Build, validate, publish, export ---------- */
class Storage { constructor() { this.data = emptyStorageSnapshot(); } async load() { return structuredClone(this.data); } async save(d) { this.data = structuredClone(d); } }
const api = await createConfiguratorAPI(new Storage(), {onError: e => { throw e; }});
const {versionId} = await api.createRuleset({...R, ...C, versionId: "rwf-2-1-0"});
const draft = api.validateRuleset(api.getRuleset(versionId), {scope: "publish"});
if (!draft.valid) { console.error(draft.errors.map(e=>`${e.code} ${e.path}: ${e.message}`).join("\n")); process.exit(1); }
await api.publishRuleset(versionId);
const exported = api.exportRuleset(versionId);
mkdirSync(outDir, {recursive: true});
writeFileSync(`${outDir}/rwf-ruleset-2.1.0.json`, JSON.stringify(exported, null, 1));
const counts = Object.fromEntries(Object.entries(C).map(([k, v]) => [k, v.length]).filter(([, n]) => n));
writeFileSync(`${outDir}/build-report.json`, JSON.stringify({counts, warnings: draft.warnings?.length ?? 0, fixes: report.fixes}, null, 1));
console.log(JSON.stringify({counts, warnings: draft.warnings?.slice?.(0, 10)}, null, 1));
