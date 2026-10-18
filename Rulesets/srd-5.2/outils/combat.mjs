// Combat (SRD 5.2): attack rolls with weapons, unarmed strikes, spells and monsters; damage and the extra dice that
// ride on a hit (Sneak Attack, Rage, Radiant Strikes, Hunter's Mark, Hex); weapon masteries; effects that call for a
// saving throw; the actions of combat and the GM's tools.
import {add, get, ABILITIES, DAMAGE, PIECES, apt, val, base, pool, ref, lit, ctx, fx, sum, sub, mul, max, min, floor, and, or, not, cf, defVal, iff, eq, neq, gt, gte, lte, holds, value, is,
  D, F, FR, K, KF, R, O, T, E, A, TRIG, stateApply, stateApplyF, stateRemove, stateRemoveF} from "./lib.mjs";
import {SUITE, damageFactor, estPJ, dist, nearbyEnemies, outcome, input, inputId, level, incap, exhaustion, SKILL} from "./regles.mjs";

const PB = value("bonus-maitrise");
export const AV = {id: "avantage", labelKey: "Avantage ou Désavantage (décision du MJ)", valueType: "string", required: true, defaultValue: "normal", options: [{value: "normal", labelKey: "Normal"}, {value: "avantage", labelKey: "Avantage"}, {value: "desavantage", labelKey: "Désavantage"}]};
export const INSPIRATION = {id: "inspiration", labelKey: "Ajouter un dé d'Inspiration bardique", valueType: "boolean", required: false, defaultValue: false};
export const ABRI = {id: "abri", labelKey: "Abri de la cible", valueType: "integer", required: true, defaultValue: 0, options: [{value: 0, labelKey: "Aucun"}, {value: 2, labelKey: "Abri partiel (+2)"}, {value: 5, labelKey: "Abri important (+5)"}]};
export const DD = (defaultValue = 10) => ({id: "dd", labelKey: "DD", valueType: "integer", required: true, defaultValue});
/** What a D20 Test spends: the Help it had, the Bardic Inspiration die used. */
export const SPENT = [stateRemove("aide", "self"), ...[6, 8, 10, 12].map(faces => stateRemoveF(`inspiration-d${faces}-depensee`, "self"))];
const reset = "degats-reinitialises";

/* Extra damage on a hit: added to the same blow, before it is taken. */
export const ON_HIT = [];
export const AFTER_HIT = [];
export function extraDamage(id, nameKey, condition, formula, typeId, descriptionKey, variants = []) {
  K(`${id}-possible`, nameKey, condition, descriptionKey);
  R(`${id}-des`, nameKey, formula, variants);
  if (typeId) F(`facteur-${id}`, `Résistance : ${nameKey}`, damageFactor(lit(typeId)));
  E(`${id}-degats`, nameKey, base("degats-a-appliquer"), "add", {kind: "roll", rollRef: `${id}-des`, multiplierFormulaRef: "multiplicateur-critique", factorFormulaRef: typeId ? `facteur-${id}` : "facteur-degats"}, "target", descriptionKey);
  A(id, nameKey, {conditionRefs: [`${id}-possible`], effectRefs: [`${id}-degats`], descriptionKey});
  ON_HIT.push(id);
  return id;
}

export function combat() {
  /* ---------- Attack bonuses ---------- */
  const str = value("mod-force"), dex = value("mod-dexterite");
  const monkWeapon = and(holds(apt("monk-martial-arts")), or(eq(cf("categorie", ""), lit("courante")), cf("legere", false)), cf("corpsACorps", true), not(cf("lourde", false)));
  F("modificateur-arme", "Modificateur de l'arme", iff(cf("finesse", false), max(str, dex), iff(cf("corpsACorps", true), iff(monkWeapon, max(str, dex), str), dex)),
    "Force au corps à corps, Dextérité à distance, la meilleure des deux avec Finesse (et pour les armes de moine avec Arts martiaux).");
  const proficient = or(...["maitriseRequise", "maitriseArme"].map(f => ({type: "definitionValue", definition: cf(f, "armes-courantes"), capabilityId: "state", outputId: "state.active"})));
  const archery = iff(and(holds("don-archerie"), not(cf("corpsACorps", true))), lit(2), lit(0));
  F("bonus-attaque-arme", "Bonus d'attaque de l'arme", sub(sum(fx("modificateur-arme"), iff(proficient, PB, lit(0)), cf("bonusMagique", 0), archery, value("bonus-attaques")), exhaustion),
    "Modificateur + bonus de maîtrise si l'arme est maîtrisée + bonus magique (+2 à distance avec Archerie), − 2 par niveau d'Épuisement.");
  F("modificateur-mains-nues", "Modificateur à mains nues", iff(holds(apt("monk-martial-arts")), max(str, dex), str));
  F("bonus-attaque-mains-nues", "Bonus d'attaque à mains nues", sub(sum(fx("modificateur-mains-nues"), PB, value("bonus-attaques")), exhaustion), "Force (ou Dextérité pour un moine) + bonus de maîtrise.");
  F("bonus-attaque-sort", "Bonus d'attaque de sort", sub(sum(value("attaque-sorts"), value("bonus-attaques")), exhaustion), "Modificateur de la caractéristique d'incantation + bonus de maîtrise.");
  F("bonus-attaque-creature", "Bonus d'attaque du monstre", sub(sum(cf("bonusAttaque", 0), value("bonus-attaques")), exhaustion), "Celui de son bloc de statistiques.");
  F("ca-de-la-cible", "Classe d'armure de la cible", sum(value("classe-armure", "target"), iff(input("abri"), input("abri"), lit(0))), "CA de la cible + abri (+2 partiel, +5 important).");
  const extras = [{conditionRef: "beni", rollRef: "d4-benediction", operation: "add"}, {conditionRef: "maudit", rollRef: "d4-benediction", operation: "subtract"},
    ...[6, 8, 10, 12].map(faces => ({conditionRef: `inspiration-d${faces}-utilisee`, rollRef: `d${faces}-inspiration`, operation: "add"}))];
  const attackOutcomes = {outcomeRefs: ["echec-critique", "coup-critique", "critique-au-contact", "touche"], fallbackOutcomeRef: "rate", extraRolls: extras};
  for (const [id, nameKey, bonus] of [["attaque-arme", "Attaque avec une arme", "bonus-attaque-arme"], ["attaque-mains-nues", "Frappe à mains nues", "bonus-attaque-mains-nues"], ["attaque-sort", "Attaque de sort", "bonus-attaque-sort"], ["attaque-creature", "Attaque de monstre", "bonus-attaque-creature"]])
    T(id, nameKey, {rollRef: "d20-attaque", bonusFormulaRef: bonus, targetFormulaRef: "ca-de-la-cible", ...attackOutcomes, descriptionKey: "1d20 + bonus contre la CA de la cible. 1 naturel : raté ; 20 naturel (ou le seuil de critique) : coup critique."});

  /* ---------- Weapon damage ---------- */
  K("deux-mains", "Arme polyvalente tenue à deux mains", and(eq(input("deuxMains"), lit(true)), neq(cf("degatsDeuxMains", ""), lit(""))));
  K("arme-a-deux-mains-gam", "Arme à deux mains (Arme à deux mains)", and(holds("don-combat-avec-une-arme-a-deux-mains"), cf("corpsACorps", true), or(cf("deuxMains", false), eq(input("deuxMains"), lit(true)))), "Style Arme à deux mains : un 1 ou un 2 aux dés de dégâts compte comme un 3.");
  K("polyvalente-gam", "Arme polyvalente à deux mains (Arme à deux mains)", and(holds("don-combat-avec-une-arme-a-deux-mains"), eq(input("deuxMains"), lit(true)), neq(cf("degatsDeuxMains", ""), lit(""))));
  R("degats-arme", "Dés de dégâts de l'arme", "@content.degats", [{conditionRef: "polyvalente-gam", formula: "@content.degatsDeuxMainsGAM"}, {conditionRef: "arme-a-deux-mains-gam", formula: "@content.degatsGAM"}, {conditionRef: "deux-mains", formula: "@content.degatsDeuxMains"}]);
  const rageBonus = iff(and(holds("rage-active"), cf("corpsACorps", true), not(and(cf("finesse", false), gt(dex, str)))), {type: "rangeLookup", value: level("barbare"), ranges: [{max: 8, value: 2}, {max: 15, value: 3}, {value: 4}]}, lit(0));
  F("bonus-rage", "Dégâts de rage", rageBonus, "Rage active, attaque de Force : +2, +3 au niveau 9, +4 au niveau 16 de barbare.");
  F("bonus-degats-arme", "Bonus de dégâts de l'arme", sum(fx("modificateur-arme"), cf("bonusMagique", 0), fx("bonus-rage")), "Modificateur de l'arme + bonus magique + Rage.");
  F("bonus-degats-main-secondaire", "Bonus de dégâts de la main secondaire", sum(iff(holds("don-combat-a-deux-armes"), fx("modificateur-arme"), min(lit(0), fx("modificateur-arme"))), cf("bonusMagique", 0), fx("bonus-rage")), "Pas de modificateur positif, sauf avec le style Combat à deux armes.");
  E("degats-arme", "Dégâts de l'arme", base("degats-a-appliquer"), "add", {kind: "roll", rollRef: "degats-arme", multiplierFormulaRef: "multiplicateur-critique", bonusFormulaRef: "bonus-degats-arme", factorFormulaRef: "facteur-degats", minimum: 0}, "target", "Dés de l'arme (deux fois au critique) + modificateur, après résistance.");
  E("degats-main-secondaire", "Dégâts de la main secondaire", base("degats-a-appliquer"), "add", {kind: "roll", rollRef: "degats-arme", multiplierFormulaRef: "multiplicateur-critique", bonusFormulaRef: "bonus-degats-main-secondaire", factorFormulaRef: "facteur-degats", minimum: 0}, "target");
  // Unarmed Strike: 1 + Strength; a monk rolls its Martial Arts die.
  K("arts-martiaux-d12", "Arts martiaux d12", gte(level("moine"), lit(17))); K("arts-martiaux-d10", "Arts martiaux d10", gte(level("moine"), lit(11)));
  K("arts-martiaux-d8", "Arts martiaux d8", gte(level("moine"), lit(5))); K("arts-martiaux-d6", "Arts martiaux d6", gte(level("moine"), lit(1)));
  R("degats-mains-nues", "Dégâts à mains nues", "1", [12, 10, 8, 6].map(faces => ({conditionRef: `arts-martiaux-d${faces}`, formula: `1d${faces}`})), "1 (dé d'Arts martiaux pour un moine).");
  F("bonus-degats-mains-nues", "Bonus de dégâts à mains nues", sum(fx("modificateur-mains-nues"), fx("bonus-rage")));
  E("degats-mains-nues", "Dégâts à mains nues", base("degats-a-appliquer"), "add", {kind: "roll", rollRef: "degats-mains-nues", multiplierFormulaRef: "multiplicateur-critique", bonusFormulaRef: "bonus-degats-mains-nues", factorFormulaRef: "facteur-degats", minimum: 0}, "target");
  // Monsters: the dice of their stat block (bonus included), and a second damage type when they have one.
  R("degats-creature", "Dégâts du monstre", "@content.degats"); R("degats-creature-2", "Dégâts supplémentaires du monstre", "@content.degats2");
  E("degats-creature", "Dégâts du monstre", base("degats-a-appliquer"), "add", {kind: "roll", rollRef: "degats-creature", multiplierFormulaRef: "multiplicateur-critique", factorFormulaRef: "facteur-degats", minimum: 0}, "target");
  E("degats-creature-2", "Dégâts supplémentaires du monstre", base("degats-a-appliquer"), "add", {kind: "roll", rollRef: "degats-creature-2", multiplierFormulaRef: "multiplicateur-critique", factorFormulaRef: "facteur-degats-2", minimum: 0}, "target");

  /* ---------- Extra dice on a hit ---------- */
  const allyNearTarget = gte(sub(nearbyEnemies("target"), iff(lte(dist, lit(1.5)), lit(1), lit(0))), lit(1));
  const sneakVariants = [];
  for (let dice = 10; dice >= 1; dice--) { K(`sournoise-${dice}d6`, `Attaque sournoise ${dice}d6`, gte(level("roublard"), lit(dice * 2 - 1))); sneakVariants.push({conditionRef: `sournoise-${dice}d6`, formula: `${dice}d6`}); }
  extraDamage("attaque-sournoise", "Attaque sournoise", and(holds(apt("rogue-sneak-attack")), neq(cf("categorie", ""), lit("")), or(cf("finesse", false), not(cf("corpsACorps", true))), not(holds("sournoise-utilisee")),
    or(is("avantage-de-l-attaque"), allyNearTarget), not(is("desavantage-de-l-attaque"))), "1d6", null,
    "Une fois par tour, avec une arme de Finesse ou à distance, si l'attaque a l'Avantage ou qu'un allié est à 1,50 m de la cible (sans Désavantage) : 1d6 de plus par tranche de deux niveaux de roublard.", sneakVariants);
  get("actions", "attaque-sournoise").stateApplications = [stateApply("sournoise-utilisee", "self", {durationRef: "un-round"})];
  F("si-avantage-de-l-attaque", "L'attaque a l'Avantage", and(fx("si-avantage-attaque-brut"), not(fx("si-desavantage-attaque-brut"))), "", "boolean");
  F("si-desavantage-de-l-attaque", "L'attaque a le Désavantage", and(fx("si-desavantage-attaque-brut"), not(fx("si-avantage-attaque-brut"))), "", "boolean");
  D("frenesie-utilisee", "statut", "Frénésie utilisée ce tour", {}, {descriptionKey: "Les dégâts de Frénésie ne s'appliquent qu'à la première cible touchée du tour."});
  K("frenesie-d4", "Frénésie 4d6", gte(level("barbare"), lit(16))); K("frenesie-d3", "Frénésie 3d6", gte(level("barbare"), lit(9)));
  extraDamage("frenesie", "Frénésie", and(holds(apt("berserker-frenzy")), holds("rage-active"), holds("attaque-temeraire"), cf("corpsACorps", true), not(holds("frenesie-utilisee"))), "2d6", null,
    "Berserker : en Rage avec Attaque téméraire, la première cible touchée du tour subit autant de d6 que le bonus de dégâts de rage.", [{conditionRef: "frenesie-d4", formula: "4d6"}, {conditionRef: "frenesie-d3", formula: "3d6"}]);
  get("actions", "frenesie").stateApplications = [stateApply("frenesie-utilisee", "self", {durationRef: "un-round"})];
  extraDamage("frappes-radieuses", "Frappes radieuses", and(holds(apt("paladin-radiant-strikes")), cf("corpsACorps", true), neq(cf("degats", ""), lit(""))), "1d8", "radiant", "Paladin de niveau 11 : +1d8 dégâts radiants aux attaques au corps à corps avec une arme (ou à mains nues).");
  D("marque-du-chasseur", "statut", "Marque du chasseur", {}, {descriptionKey: "Le lanceur qui maintient sa concentration inflige 1d6 dégâts de force de plus quand il touche la cible avec une attaque."});
  D("malefice", "statut", "Maléfice", {}, {descriptionKey: "Le lanceur qui maintient sa concentration inflige 1d6 dégâts nécrotiques de plus quand il touche la cible avec une attaque."});
  extraDamage("degats-marque-du-chasseur", "Marque du chasseur", and(holds("marque-du-chasseur", "target"), holds("concentration")), "1d6", "force", "Cible marquée par le lanceur concentré.");
  extraDamage("degats-malefice", "Maléfice", and(holds("malefice", "target"), holds("concentration")), "1d6", "necrotique", "Cible maudite par le lanceur concentré.");

  /* ---------- Weapon masteries ---------- */
  const mastery = or(...["barbarian-weapon-mastery", "fighter-weapon-mastery", "paladin-weapon-mastery", "ranger-weapon-mastery", "rogue-weapon-mastery"].map(index => holds(apt(index))));
  F("si-botte-d-arme", "Maîtrise les bottes d'arme", mastery, "", "boolean");
  const masteryOf = key => and(fx("si-botte-d-arme"), eq(cf("botte", ""), lit(key)));
  F("dd-botte", "DD d'une botte", sum(lit(8), fx("modificateur-arme"), PB), "8 + modificateur de l'arme + bonus de maîtrise.");
  T("botte-renversement", "Renversement", {totalFormulaRef: "dd-botte", opposedTestRef: "contre-constitution", outcomeRefs: ["sauvegarde-ratee"], fallbackOutcomeRef: "sauvegarde-reussie"});
  A("mettre-a-terre", "Mettre à terre", {stateApplications: [stateApply("a-terre")]});
  K("botte-renversement-possible", "Botte : Renversement", and(masteryOf("renversement"), not(holds("mort", "target"))));
  A("botte-renversement", "Renversement", {conditionRefs: ["botte-renversement-possible"], testRef: "botte-renversement", outcomeMappings: [{outcomeId: "sauvegarde-ratee", actionRefs: ["mettre-a-terre"]}], descriptionKey: "La cible touchée réussit un jet de sauvegarde de Constitution ou tombe À terre."});
  D("sape", "statut", "Sapé", {}, {descriptionKey: "Botte Sape : Désavantage au prochain jet d'attaque (jusqu'au prochain round)."});
  D("ralenti", "statut", "Ralenti", {}, {descriptionKey: "Botte Ralentissement : Vitesse réduite de 3 m (jusqu'au prochain round)."});
  D("ouverture", "statut", "Ouverture", {}, {descriptionKey: "Botte Ouverture : Avantage au prochain jet d'attaque (jusqu'au prochain round)."});
  K("botte-sape-possible", "Botte : Sape", masteryOf("sape")); A("botte-sape", "Sape", {conditionRefs: ["botte-sape-possible"], stateApplications: [stateApply("sape")]});
  K("botte-ralentissement-possible", "Botte : Ralentissement", and(masteryOf("ralentissement"), gt(value("degats-a-appliquer", "target"), lit(0)))); A("botte-ralentissement", "Ralentissement", {conditionRefs: ["botte-ralentissement-possible"], stateApplications: [stateApply("ralenti")]});
  K("botte-ouverture-possible", "Botte : Ouverture", and(masteryOf("ouverture"), gt(value("degats-a-appliquer", "target"), lit(0)))); A("botte-ouverture", "Ouverture", {conditionRefs: ["botte-ouverture-possible"], stateApplications: [stateApply("ouverture", "self")]});
  AFTER_HIT.push("botte-renversement", "botte-sape", "botte-ralentissement", "botte-ouverture");
  // Graze: a miss still deals the ability modifier.
  F("degats-ecorchure", "Dégâts d'Écorchure", max(lit(0), floor(mul(fx("modificateur-arme"), fx("facteur-degats")))));
  E("degats-ecorchure", "Écorchure", base("degats-a-appliquer"), "set", {kind: "formula", id: "degats-ecorchure"}, "target");
  K("botte-ecorchure-possible", "Botte : Écorchure", masteryOf("ecorchure"));
  A("botte-ecorchure", "Écorchure", {conditionRefs: ["botte-ecorchure-possible"], effectRefs: ["degats-ecorchure"], descriptionKey: "Une attaque ratée inflige quand même le modificateur de l'arme."});
  // Sap and Vex in play: a Sapped attacker has Disadvantage, an attacker with an opening Advantage; both last until used or the next round.
  const sapRule = get("formulas", "si-desavantage-attaque-brut"); sapRule.expression.args.push(holds("sape"));
  const vexRule = get("formulas", "si-avantage-attaque-brut"); vexRule.expression.args.push(holds("ouverture"));
  PIECES.vitesse.push(iff(holds("ralenti"), lit(-3), lit(0)));

  /* ---------- Attack Actions ---------- */
  const DEUX_MAINS = {id: "deuxMains", labelKey: "Tenue à deux mains (arme polyvalente)", valueType: "boolean", required: false, defaultValue: false};
  const attackSpent = [...SPENT, stateRemove("sape", "self"), stateRemove("ouverture", "self"), stateRemove("invisible", "self")];
  const onHit = damage => [...ON_HIT, ...SUITE, ...AFTER_HIT];
  const mappings = (effectRefs, miss = []) => [
    {outcomeId: "coup-critique", effectRefs: [reset, ...effectRefs], actionRefs: onHit()}, {outcomeId: "critique-au-contact", effectRefs: [reset, ...effectRefs], actionRefs: onHit()},
    {outcomeId: "touche", effectRefs: [reset, ...effectRefs], actionRefs: onHit()},
    {outcomeId: "rate", effectRefs: [reset], actionRefs: [...miss, ...(miss.length ? SUITE : [])]}, {outcomeId: "echec-critique", effectRefs: [reset], actionRefs: [...miss, ...(miss.length ? SUITE : [])]}];
  KF("peut-attaquer", "Peut attaquer", and(not(incap()), not(holds("mort"))), "Une créature Neutralisée ne peut pas agir.");
  A("attaquer-avec-l-arme", "Attaquer", {inputs: [AV, ABRI, DEUX_MAINS, INSPIRATION], conditionRefs: ["peut-attaquer"], testRef: "attaque-arme", outcomeMappings: mappings(["degats-arme"], ["botte-ecorchure"]), stateRemovals: attackSpent,
    descriptionKey: "Jet d'attaque avec cette arme contre la CA de la cible ; dégâts, résistances, Attaque sournoise et bottes appliqués."});
  K("arme-legere", "Arme légère", cf("legere", false), "Une seconde attaque, Action Bonus, avec une autre arme légère.");
  A("attaquer-main-secondaire", "Attaque de la main secondaire", {inputs: [AV, ABRI, INSPIRATION], conditionRefs: ["peut-attaquer", "arme-legere"], testRef: "attaque-arme", outcomeMappings: mappings(["degats-main-secondaire"], ["botte-ecorchure"]), stateRemovals: attackSpent,
    descriptionKey: "Action Bonus après une attaque avec une arme légère : sans modificateur positif aux dégâts (sauf Combat à deux armes)."});
  A("frappe-a-mains-nues", "Frappe à mains nues", {inputs: [AV, ABRI, INSPIRATION], conditionRefs: ["peut-attaquer"], testRef: "attaque-mains-nues", outcomeMappings: mappings(["degats-mains-nues"]), stateRemovals: attackSpent,
    descriptionKey: "1 + modificateur de Force en dégâts contondants (dé d'Arts martiaux et Dextérité pour un moine)."});
  A("attaque-de-creature", "Attaquer", {inputs: [AV, ABRI, INSPIRATION], conditionRefs: ["peut-attaquer"], testRef: "attaque-creature", outcomeMappings: mappings(["degats-creature", "degats-creature-2"]), stateRemovals: attackSpent,
    descriptionKey: "L'attaque du bloc de statistiques : jet d'attaque, dégâts et dégâts supplémentaires."});

  /* ---------- Effects that call for a saving throw ---------- */
  // Its DC: the one written on it (a monster's ability), 8 + an ability modifier + proficiency (a breath), or the spell save DC.
  const abilityDc = {type: "definitionValue", definition: {type: "definitionField", definition: cf("caracteristiqueDD", "constitution"), field: "modificateur"}, capabilityId: "value", outputId: "value.final"};
  F("dd-effet", "DD de l'effet", iff(gt(cf("dd", 0), lit(0)), cf("dd", 0), iff(neq(cf("caracteristiqueDD", ""), lit("")), sum(lit(8), abilityDc, PB), value("dd-sorts"))),
    "Le DD écrit sur l'effet ; sinon 8 + modificateur de sa caractéristique + bonus de maîtrise ; sinon le DD de sauvegarde des sorts.");
  for (const [, id, name] of ABILITIES) {
    T(`dd-${id}`, `Sauvegarde de ${name} contre l'effet`, {totalFormulaRef: "dd-effet", opposedTestRef: `contre-${id}`, outcomeRefs: [...(["force", "dexterite"].includes(id) ? ["sauvegarde-ratee-automatique"] : []), "sauvegarde-ratee"], fallbackOutcomeRef: "sauvegarde-reussie"});
    T(`dd-sort-${id}`, `Sauvegarde de ${name} contre le sort`, {totalFormulaRef: "dd-effet", opposedTestRef: `contre-sort-${id}`, outcomeRefs: [...(["force", "dexterite"].includes(id) ? ["sauvegarde-ratee-automatique"] : []), "sauvegarde-ratee"], fallbackOutcomeRef: "sauvegarde-reussie"});
  }
  // Damage of an effect: its dice at the slot level or character level it is used at (sorts, souffles, capacités de monstre).
  const slotVariants = [];
  for (let n = 9; n >= 1; n--) {
    K(`emplacement-niveau-${n}`, `Lancé au niveau ${n}`, and(or(eq(inputId("emplacement"), lit(`emplacements-${n}`)), and(eq(inputId("emplacement"), lit("emplacements-pacte")), eq(value("niveau-emplacements-pacte"), lit(n)))), neq(cf(`degats${n}`, ""), lit(""))));
    slotVariants.push({conditionRef: `emplacement-niveau-${n}`, formula: `@content.degats${n}`});
  }
  const tierVariants = [];
  for (const [tier, minimum] of [[4, 17], [3, 11], [2, 5]]) {
    K(`palier-${tier}`, `Palier ${tier} d'un sort mineur ou d'un souffle (niveau ${minimum})`, and(eq(cf("niveau", -1), lit(0)), gte(value("niveau-total"), lit(minimum)), neq(cf(`degatsPalier${tier}`, ""), lit(""))));
    tierVariants.push({conditionRef: `palier-${tier}`, formula: `@content.degatsPalier${tier}`});
  }
  R("degats-effet", "Dégâts de l'effet", "@content.degats", [...slotVariants, ...tierVariants], "Dés de l'effet ; plus au niveau d'emplacement choisi, ou selon le niveau du personnage pour un sort mineur.");
  F("bonus-degats-effet", "Bonus de dégâts de l'effet", sum(iff(cf("ajouteModDegats", false), value("modificateur-incantation"), lit(0)),
    iff(and(holds(apt("evoker-empowered-evocation")), eq(cf("ecole", ""), lit("evocation"))), value("mod-intelligence"), lit(0))), "Modificateur d'incantation quand le sort l'ajoute ; Évocation renforcée.");
  E("degats-effet", "Dégâts de l'effet", base("degats-a-appliquer"), "add", {kind: "roll", rollRef: "degats-effet", multiplierFormulaRef: "multiplicateur-critique", bonusFormulaRef: "bonus-degats-effet", factorFormulaRef: "facteur-degats", minimum: 0}, "target");
  E("degats-effet-moitie", "Moitié des dégâts de l'effet", base("degats-a-appliquer"), "add", {kind: "roll", rollRef: "degats-effet", bonusFormulaRef: "bonus-degats-effet", factorFormulaRef: "facteur-degats-moitie", minimum: 0}, "target", "La moitié sur une sauvegarde réussie, si l'effet le dit.");
  FR("etat-de-l-effet", "État infligé par l'effet", iff(neq(cf("etat", ""), lit("")), cf("etat", ""), lit(null)), "L'état que l'effet inflige sur une sauvegarde ratée (s'il en inflige un).");
  const immunity = {type: "definitionValue", definition: {type: "definitionField", definition: cf("etat", ""), field: "immunite"}, capabilityId: "state", outputId: "state.active", container: "target"};
  K("effet-inflige-un-etat", "L'effet inflige un état", and(neq(cf("etat", ""), lit("")), not(holds("mort", "target")), or(eq({type: "definitionField", definition: cf("etat", ""), field: "immunite"}, lit("")), not(immunity))), "Pas si la cible est immunisée à cet état.");
  A("subir-l-etat-de-l-effet", "Subir l'état", {conditionRefs: ["effet-inflige-un-etat"], stateApplications: [stateApplyF("etat-de-l-effet")]});
  // The steps of a saving throw effect, shared by spells and monsters.
  saveMappings.failed = [{outcomeId: "sauvegarde-ratee", effectRefs: [reset, "degats-effet"], actionRefs: [...SUITE, "subir-l-etat-de-l-effet"]}];
  saveMappings.saved = [{outcomeId: "sauvegarde-reussie", effectRefs: [reset, "degats-effet-moitie"], actionRefs: SUITE}];

  /* ---------- Basic actions ---------- */
  const self = (id, nameKey, states, descriptionKey, more = {}) => A(id, nameKey, {stateApplications: states.map(s => stateApply(s, "self", {durationRef: "un-round"})), descriptionKey, ...more});
  self("esquiver", "Esquiver", ["esquive"], "Jusqu'au début du prochain tour : les attaques contre soi ont le Désavantage, Avantage aux sauvegardes de Dextérité (pas si Neutralisé ou Vitesse 0).", {conditionRefs: ["peut-attaquer"]});
  self("se-desengager", "Se désengager", ["desengage"], "Pas d'attaque d'opportunité contre soi jusqu'à la fin du tour.", {conditionRefs: ["peut-attaquer"]});
  self("foncer", "Foncer", ["foncer"], "Déplacement supplémentaire égal à la Vitesse ce tour-ci.", {conditionRefs: ["peut-attaquer"]});
  A("aider", "Aider", {conditionRefs: ["peut-attaquer"], stateApplications: [stateApply("aide")], descriptionKey: "La cible (un allié) a l'Avantage à son prochain test de caractéristique ou jet d'attaque."});
  A("se-relever", "Se relever", {stateRemovals: [stateRemove("a-terre", "self")], descriptionKey: "Coûte la moitié de la Vitesse."});
  A("devenir-invisible", "Devenir invisible", {stateApplications: [stateApply("invisible", "self")]});
  F("dd-se-cacher", "DD pour se cacher", {type: "parameter", id: "dd-se-cacher"});
  const fixedSkill = (skill, nameKey) => ({id: "competence", source: {literal: {objectKind: "definition", objectId: skill}}, valueType: "reference", required: true});
  // Hide: Dexterity (Stealth) DC 15, then Invisible until found, an attack or a noise.
  T("se-cacher", "Se cacher (Discrétion DD 15)", {rollRef: "d20-test", bonusFormulaRef: "bonus-test-competence", targetFormulaRef: "dd-se-cacher", outcomeRefs: ["reussite"], fallbackOutcomeRef: "echec"});
  A("se-cacher", "Se cacher", {inputs: [AV, INSPIRATION, {id: "competence", labelKey: "Compétence", valueType: "reference", definitionTypeId: "competence", from: "all", required: true, defaultValue: SKILL.stealth}], conditionRefs: ["peut-attaquer"], testRef: "se-cacher",
    outcomeMappings: [{outcomeId: "reussite", actionRefs: ["devenir-invisible"]}], stateRemovals: SPENT, descriptionKey: "Test de Dextérité (Discrétion) DD 15, hors de vue : réussite, l'état Invisible jusqu'à être découvert ou faire du bruit."});
  // Grapple and Shove (Unarmed Strike options): the target's Strength or Dexterity save against 8 + Strength + proficiency.
  F("dd-frappe-a-mains-nues", "DD de la frappe à mains nues", sum(lit(8), value("mod-force"), PB), "8 + modificateur de Force + bonus de maîtrise.");
  F("bonus-se-degager", "Bonus pour se dégager", max(fx("bonus-sauvegarde-force"), fx("bonus-sauvegarde-dexterite")));
  T("contre-agrippement", "Sauvegarde de Force ou de Dextérité", {rollRef: "d20-sauvegarde-force", bonusFormulaRef: "bonus-se-degager"});
  T("agrippement", "Agripper ou pousser", {totalFormulaRef: "dd-frappe-a-mains-nues", opposedTestRef: "contre-agrippement", outcomeRefs: ["sauvegarde-ratee-automatique", "sauvegarde-ratee"], fallbackOutcomeRef: "sauvegarde-reussie"});
  A("etre-agrippe", "Agrippé", {stateApplications: [stateApply("agrippe")]});
  A("agripper", "Agripper", {conditionRefs: ["peut-attaquer"], testRef: "agrippement", outcomeMappings: [{outcomeId: "sauvegarde-ratee", actionRefs: ["etre-agrippe"]}], descriptionKey: "La cible (une taille au plus de plus que soi, à portée) réussit une sauvegarde de Force ou de Dextérité (la meilleure) ou devient Agrippée."});
  A("pousser", "Pousser à terre", {conditionRefs: ["peut-attaquer"], testRef: "agrippement", outcomeMappings: [{outcomeId: "sauvegarde-ratee", actionRefs: ["mettre-a-terre"]}], descriptionKey: "La cible réussit une sauvegarde de Force ou de Dextérité ou tombe À terre (ou est repoussée de 1,50 m, au choix)."});
  A("se-degager", "Se dégager", {inputs: [DD(10)], testRef: "test-de-competence", stateRemovals: [], outcomeMappings: [{outcomeId: "reussite", actionRefs: ["liberation"]}], descriptionKey: "Test de Force (Athlétisme) ou de Dextérité (Acrobaties) contre le DD de l'agrippement."});
  A("liberation", "Libéré", {stateRemovals: [stateRemove("agrippe", "self")]});
  get("actions", "se-degager").inputs.push({id: "competence", labelKey: "Compétence", valueType: "reference", definitionTypeId: "competence", from: "all", required: true, defaultValue: SKILL.athletics});

  /* ---------- D20 Tests from the sheet ---------- */
  A("test-de-caracteristique", "Test de caractéristique", {inputs: [{id: "caracteristique", labelKey: "Caractéristique", valueType: "reference", definitionTypeId: "caracteristique", from: "all", required: true}, DD(10), AV, INSPIRATION], testRef: "test-de-caracteristique", stateRemovals: SPENT});
  A("test-de-competence", "Test de compétence", {inputs: [{id: "competence", labelKey: "Compétence", valueType: "reference", definitionTypeId: "competence", from: "all", required: true}, DD(10), AV, INSPIRATION], testRef: "test-de-competence", stateRemovals: SPENT});
  A("test-d-outil", "Test d'outil", {inputs: [{id: "outil", labelKey: "Outil", valueType: "reference", definitionTypeId: "outil", from: "held", required: true}, DD(10), AV, INSPIRATION], testRef: "test-d-outil", stateRemovals: SPENT});
  for (const [, id, name] of ABILITIES) A(`jet-de-sauvegarde-${id}`, `Sauvegarde de ${name}`, {inputs: [DD(10), AV, INSPIRATION], testRef: `sauvegarde-${id}`, stateRemovals: SPENT.slice(1)});
  A("jet-d-initiative", "Initiative", {testRef: "initiative"});
  A("stabilisation", "Stabilisé", {effectRefs: ["reussites-a-zero", "echecs-a-zero"], stateApplications: [stateApply("stabilise")]});
  K("cible-mourante", "Cible mourante", and(holds("mourant", "target"), not(holds("stabilise", "target")), not(holds("mort", "target"))));
  A("stabiliser", "Stabiliser", {inputs: [DD(10), AV, INSPIRATION, {id: "competence", labelKey: "Compétence", valueType: "reference", definitionTypeId: "competence", from: "all", required: true, defaultValue: SKILL.medicine}], conditionRefs: ["cible-mourante"], testRef: "test-de-competence",
    outcomeMappings: [{outcomeId: "reussite", actionRefs: ["stabilisation"]}], stateRemovals: SPENT, descriptionKey: "Test de Sagesse (Médecine) DD 10 sur une créature à 0 point de vie : elle est stabilisée."});

  /* ---------- Death saving throws ---------- */
  K("doit-jeter-contre-la-mort", "Mourant", and(holds("mourant"), not(holds("stabilise")), not(holds("mort"))), "À 0 point de vie, ni stabilisé ni mort.");
  E("reussite-contre-la-mort", "Réussite contre la mort", pool("reussites-contre-la-mort"), "add", {kind: "literal", value: 1}, "self");
  E("echec-contre-la-mort", "Échec contre la mort", pool("echecs-contre-la-mort"), "add", {kind: "literal", value: 1}, "self");
  E("deux-echecs-contre-la-mort", "Deux échecs contre la mort", pool("echecs-contre-la-mort"), "add", {kind: "literal", value: 2}, "self");
  E("reprendre-un-pv", "1 point de vie", pool("pv"), "set", {kind: "literal", value: 1}, "self");
  E("reussites-a-zero-soi", "Réussites remises à 0", pool("reussites-contre-la-mort"), "set", {kind: "literal", value: 0}, "self");
  E("echecs-a-zero-soi", "Échecs remis à 0", pool("echecs-contre-la-mort"), "set", {kind: "literal", value: 0}, "self");
  A("reprendre-conscience", "Reprendre conscience", {effectRefs: ["reprendre-un-pv", "reussites-a-zero-soi", "echecs-a-zero-soi"], stateRemovals: ["mourant", "stabilise", "inconscient"].map(s => stateRemove(s, "self"))});
  K("trois-reussites", "Trois réussites contre la mort", gte(ref(pool("reussites-contre-la-mort")), lit(3)));
  A("stable-sur-reussites", "Stabilisé", {conditionRefs: ["trois-reussites"], effectRefs: ["reussites-a-zero-soi", "echecs-a-zero-soi"], stateApplications: [stateApply("stabilise", "self")]});
  K("trois-echecs-soi", "Trois échecs contre la mort", and(gte(ref(pool("echecs-contre-la-mort")), lit(3)), not(holds("mort"))));
  A("mourir", "Mort", {conditionRefs: ["trois-echecs-soi"], stateApplications: [stateApply("mort", "self")], stateRemovals: [stateRemove("mourant", "self")]});
  A("jet-contre-la-mort", "Jet de sauvegarde contre la mort", {conditionRefs: ["doit-jeter-contre-la-mort"], testRef: "sauvegarde-contre-la-mort", outcomeMappings: [
    {outcomeId: "mort-vingt", actionRefs: ["reprendre-conscience"]}, {outcomeId: "mort-un", effectRefs: ["deux-echecs-contre-la-mort"], actionRefs: ["mourir"]},
    {outcomeId: "mort-reussite", effectRefs: ["reussite-contre-la-mort"], actionRefs: ["stable-sur-reussites"]}, {outcomeId: "mort-echec", effectRefs: ["echec-contre-la-mort"], actionRefs: ["mourir"]}],
    descriptionKey: "Au début de son tour à 0 point de vie : 10 ou plus réussit, 1 compte double, 20 rend 1 point de vie. Trois réussites stabilisent, trois échecs tuent."});
  // Turn start: what lasted "until the start of your next turn" ends; a dying character rolls (offered).
  A("debut-de-tour", "Début de tour", {stateRemovals: ["esquive", "attaque-temeraire", "desengage", "foncer", "sournoise-utilisee", "frenesie-utilisee"].map(s => stateRemove(s, "self"))});
  TRIG("debut-de-tour", "Début de tour", "rta.combat.turn", ["debut-de-tour"], {descriptionKey: "Fin d'Esquiver, d'Attaque téméraire, de Foncer ; l'Attaque sournoise et la Frénésie redeviennent possibles."});
  TRIG("jet-contre-la-mort", "Jet contre la mort", "rta.combat.turn", ["jet-contre-la-mort"], {mode: "offer", conditionRefs: ["doit-jeter-contre-la-mort"], descriptionKey: "Au début du tour d'un personnage mourant, le jet contre la mort est proposé."});
  A("nouveau-round", "Nouveau round", {stateRemovals: ["sape", "ralenti", "ouverture"].map(s => stateRemove(s, "self"))});
  TRIG("nouveau-round", "Nouveau round", "rta.combat.round", ["nouveau-round"], {descriptionKey: "Les effets des bottes Sape, Ralentissement et Ouverture se terminent."});
  A("fin-de-combat", "Fin du combat", {stateRemovals: ["esquive", "attaque-temeraire", "desengage", "foncer", "sournoise-utilisee", "frenesie-utilisee", "sape", "ralenti", "ouverture", "surpris"].map(s => stateRemove(s, "self"))});
  TRIG("fin-de-combat", "Fin du combat", "rta.combat.end", ["fin-de-combat"]);

  /* ---------- Heroic Inspiration ---------- */
  K("a-l-inspiration-heroique", "Inspiration héroïque", holds("inspiration-heroique"));
  A("utiliser-inspiration-heroique", "Utiliser l'Inspiration héroïque", {conditionRefs: ["a-l-inspiration-heroique"], reroll: {actionRefs: [], keepDice: false, dice: null}, stateRemovals: [stateRemove("inspiration-heroique", "self")], descriptionKey: "Relance le dernier jet ; le nouveau résultat est gardé."});

  /* ---------- The GM's tools ---------- */
  const TYPES = {id: "typeDegats", labelKey: "Type de dégâts", valueType: "string", required: true, defaultValue: "contondant", options: Object.values(DAMAGE).map(id => ({value: id, labelKey: get("definitions", `resistance-${id}`).nameKey.replace(/^Résistance : /, "")}))};
  const AMOUNT = {id: "montant", labelKey: "Montant", valueType: "integer", required: true, defaultValue: 1};
  A("infliger-des-degats", "Infliger des dégâts", {inputs: [AMOUNT, TYPES], targeting: "each", testRef: "resolution", outcomeMappings: [{outcomeId: "resolu", effectRefs: ["degats-demandes"], actionRefs: SUITE}],
    descriptionKey: "Dégâts d'un piège, d'une chute, d'un effet : résistances, points de vie temporaires, chute à 0 et concentration appliqués."});
  E("soins-demandes", "Soins", pool("pv"), "add", {kind: "formula", id: "montant-demande"}, "target");
  F("montant-demande", "Montant choisi", input("montant"));
  FR("reveil-par-les-soins", "Inconscient à cause des points de vie", iff(holds("mourant", "target"), lit("inconscient"), lit(null)));
  export_heal.removals = [stateRemove("mourant"), stateRemove("stabilise"), stateRemoveF("reveil-par-les-soins")];
  A("soigner", "Rendre des points de vie", {inputs: [AMOUNT], targeting: "each", effectRefs: ["soins-demandes", "reussites-a-zero", "echecs-a-zero"], stateRemovals: export_heal.removals, descriptionKey: "Rend des points de vie (une créature à 0 reprend conscience)."});
  F("pv-temporaires-demandes", "Points de vie temporaires (le plus grand)", max(ref(pool("pv-temporaires"), "target"), input("montant")));
  E("pv-temporaires-demandes", "Points de vie temporaires", pool("pv-temporaires"), "set", {kind: "formula", id: "pv-temporaires-demandes"}, "target", "Ils ne se cumulent pas : on garde le plus grand.");
  A("donner-pv-temporaires", "Donner des points de vie temporaires", {inputs: [AMOUNT], targeting: "each", effectRefs: ["pv-temporaires-demandes"]});
  const CONDITION = {id: "etat", labelKey: "État", valueType: "reference", definitionTypeId: "etat", from: "all", required: true};
  FR("etat-demande", "État choisi", inputId("etat"));
  K("pas-immunise-a-l-etat", "Pas immunisé à cet état", not({type: "definitionValue", definition: {type: "definitionField", definition: input("etat"), field: "immunite"}, capabilityId: "state", outputId: "state.active", container: "target"}));
  A("infliger-un-etat", "Infliger un état", {inputs: [CONDITION], targeting: "each", conditionRefs: ["pas-immunise-a-l-etat"], stateApplications: [stateApplyF("etat-demande")]});
  A("retirer-un-etat", "Retirer un état", {inputs: [CONDITION], targeting: "each", stateRemovals: [stateRemoveF("etat-demande")]});
  E("epuisement-plus", "Un niveau d'Épuisement", base("epuisement"), "add", {kind: "literal", value: 1}, "target");
  E("epuisement-moins", "Un niveau d'Épuisement en moins", base("epuisement"), "subtract", {kind: "literal", value: 1}, "target");
  K("epuisement-mortel", "Épuisement 6", and(gte(value("epuisement", "target"), lit(6)), not(holds("mort", "target"))));
  A("mort-d-epuisement", "Mort d'épuisement", {conditionRefs: ["epuisement-mortel"], stateApplications: [stateApply("mort")]});
  K("pas-immunise-a-l-epuisement", "Pas immunisé à l'Épuisement", not(holds("immunite-epuisement", "target")));
  A("gagner-epuisement", "Gagner un niveau d'Épuisement", {targeting: "each", conditionRefs: ["pas-immunise-a-l-epuisement"], effectRefs: ["epuisement-plus"], testRef: "resolution", outcomeMappings: [{outcomeId: "resolu", actionRefs: ["mort-d-epuisement"]}], descriptionKey: "−2 aux tests de d20 et −1,50 m de Vitesse par niveau ; mort au niveau 6."});
  A("perdre-epuisement", "Perdre un niveau d'Épuisement", {targeting: "each", effectRefs: ["epuisement-moins"]});
  E("xp-gagnes", "Points d'expérience gagnés", base("xp"), "add", {kind: "formula", id: "montant-demande"}, "target");
  A("donner-xp", "Donner des points d'expérience", {inputs: [AMOUNT], targeting: "each", effectRefs: ["xp-gagnes"], descriptionKey: "Puis « Appliquer les étapes atteintes » dans la progression pour passer de niveau."});
  A("donner-inspiration-heroique", "Donner l'Inspiration héroïque", {targeting: "each", stateApplications: [stateApply("inspiration-heroique")]});
  A("surprendre", "Surpris", {targeting: "each", stateApplications: [stateApply("surpris")], descriptionKey: "Désavantage à l'initiative."});
  A("terminer-la-concentration", "Terminer la concentration", {stateRemovals: [stateRemove("concentration", "self"), stateRemove("marque-du-chasseur", "target"), stateRemove("malefice", "target")]});
}
export const saveMappings = {failed: [], saved: []};
/** Once every module has added its extra dice: a hit runs them all, then the damage, then the masteries. */
export function finalizeAttacks() {
  for (const id of ["attaquer-avec-l-arme", "attaquer-main-secondaire", "frappe-a-mains-nues", "attaque-de-creature"])
    for (const m of get("actions", id).outcomeMappings) if (["coup-critique", "critique-au-contact", "touche"].includes(m.outcomeId)) m.actionRefs = [...ON_HIT, ...SUITE, ...AFTER_HIT];
}
export const export_heal = {removals: []};
