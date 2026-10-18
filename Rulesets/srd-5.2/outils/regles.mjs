// Core rules of D&D 2024 (SRD 5.2, "Playing the Game" and "Rules Glossary"): abilities, proficiency, D20 Tests with
// Advantage and Disadvantage, conditions, damage and its resistances, dropping to 0 Hit Points and death saves,
// concentration, the basic actions of combat and the GM's tools.
import {C, add, get, srd, tr, clean, slug, ABILITIES, AB, CONDITIONS, DAMAGE, PIECES, apt,
  val, base, pool, st, ref, lit, par, ctx, fx, sum, sub, mul, max, min, floor, ceil, and, or, not, cf, defVal, defField, iff, eq, neq, gt, gte, lt, lte, holds, value,
  P, DT, D, POOL, F, FR, DERIVE, K, KF, is, R, O, T, E, A, TRIG, stateApply, stateApplyF, stateRemove, stateRemoveF, generic} from "./lib.mjs";

export const estPJ = (c) => holds("personnage-joueur", c);
export const dist = {type: "distance", from: "self", to: "target", default: lit(1.5)};
export const nearbyEnemies = (of = "self", within = 1.5) => ({type: "nearby", of, within: lit(within), side: "enemy", default: lit(0)});
export const outcome = ctx("variables.test.outcome.resultKey");
export const input = id => ctx(`variables.input.${id}`);
export const inputId = id => ctx(`variables.input.${id}.objectId`);
export const level = cls => value(`niveau-${cls}`);
/** Incapacitated, by itself or through a condition that includes it. */
export const incap = c => or(...["neutralise", "paralyse", "etourdi", "inconscient", "petrifie"].map(id => holds(id, c)));
export const exhaustion = mul(lit(2), value("epuisement"));

export function rules() {
  /* ---------- Parameters ---------- */
  P("dd-tres-facile", "DD Très facile", 5); P("dd-facile", "DD Facile", 10); P("dd-moyen", "DD Moyen", 15); P("dd-difficile", "DD Difficile", 20); P("dd-tres-difficile", "DD Très difficile", 25); P("dd-presque-impossible", "DD Presque impossible", 30);
  P("dd-concentration-minimum", "DD minimal de concentration", 10, "Le DD d'un jet de sauvegarde de Constitution pour maintenir sa concentration est de 10 ou la moitié des dégâts subis, au plus 30.");
  P("dd-se-cacher", "DD pour se cacher", 15, "L'action Se cacher demande un test de Dextérité (Discrétion) DD 15.");

  /* ---------- Definition Types ---------- */
  DT("caracteristique", "Caractéristique", ["value"], {}, "Six caractéristiques, de 1 à 30 (20 au plus pour un personnage, sauf faveur épique).", "#b5523b", {valueBounds: {minimum: {literal: 1}, maximum: {literal: 30}}});
  DT("modificateur", "Modificateur de caractéristique", ["value"], {}, "(valeur − 10) / 2, arrondi à l'inférieur.", "#c4704f");
  DT("sauvegarde", "Maîtrise de sauvegarde", ["value"], {}, "1 si le personnage maîtrise ce jet de sauvegarde.", "#8f5a3b", {valueBounds: {minimum: {literal: 0}, maximum: {literal: 1}}});
  DT("competence", "Compétence", ["value"], {}, "0 sans maîtrise, 1 maîtrise (bonus de maîtrise ajouté), 2 Expertise (bonus doublé).", "#3b7fb5", {valueBounds: {minimum: {literal: 0}, maximum: {literal: 2}}});
  DT("outil", "Maîtrise d'outil", ["value"], {}, "1 maîtrise de l'outil, 2 Expertise.", "#3b8fa5", {valueBounds: {minimum: {literal: 0}, maximum: {literal: 2}}});
  DT("niveau-de-classe", "Niveau de classe", ["value"], {}, "Niveau dans une classe, de 0 à 20.", "#5a3b8f", {valueBounds: {minimum: {literal: 0}, maximum: {literal: 20}}});
  DT("valeur-derivee", "Valeur dérivée", ["value"], {}, "Calculée par les règles.", "#6a6a8f");
  DT("compteur", "Compteur", ["value"], {}, "Nombre tenu par les règles.", "#6a6a6a");
  DT("monnaie", "Monnaie", ["value"], {}, "1 pp = 10 po ; 1 po = 2 pe = 10 pa = 100 pc.", "#c9a22e");
  DT("ressource", "Ressource", ["pool"], {}, "Réserve dépensée puis récupérée, bornée par un maximum.", "#c99a2e");
  DT("de-de-vie", "Dés de vie", ["pool"], {}, "Dés de vie d'une taille, un par niveau des classes qui les donnent.", "#a5523b");
  DT("emplacement-de-sort", "Emplacements de sort", ["pool"], {}, "Emplacements de sort d'un niveau.", "#3b5a8f");
  DT("etat", "État", ["state"], {}, "Les quinze états du glossaire des règles (l'Épuisement est un compteur).", "#7a4f8f");
  DT("statut", "Statut", ["state"], {}, "Situation tenue par les règles.", "#4f6a8f");
  DT("resistance", "Résistance", ["state"], {}, "Dégâts de ce type divisés par deux (arrondi à l'inférieur).", "#5a8f3b");
  DT("vulnerabilite", "Vulnérabilité", ["state"], {}, "Dégâts de ce type doublés.", "#8f3b3b");
  DT("immunite", "Immunité aux dégâts", ["state"], {}, "Aucun dégât de ce type.", "#3b8f8f");
  DT("immunite-etat", "Immunité à un état", ["state"], {}, "L'état ne peut pas être subi.", "#3b6f8f");
  DT("maitrise-equipement", "Maîtrise d'armes et d'armures", ["state"], {}, "Armes et armures que le personnage sait utiliser.", "#8f6a3b");
  DT("langue", "Langue", ["state"], {}, "Langue parlée, lue et écrite.", "#6a8f3b");
  DT("don", "Don", ["state"], {}, "Don d'origine, général, de style de combat ou faveur épique.", "#8f3b6a");
  DT("style-de-combat", "Style de combat", ["state"], {}, "Don de style de combat choisi par un guerrier, un paladin ou un rôdeur.", "#8f4f3b");
  DT("aptitude", "Aptitude", ["state"], {}, "Aptitude de classe, de sous-classe ou d'espèce. Son texte donne la règle ; les plus courantes sont appliquées par le Ruleset.", "#3b6a8f");
  DT("sous-classe", "Sous-classe", ["state"], {}, "Sous-classe choisie au niveau 3.", "#5a3b6a");
  DT("classe-de-depart", "Classe de départ", ["state"], {}, "La classe de niveau 1 du personnage : elle donne ses maîtrises de sauvegarde.", "#5a5a8f");
  DT("option-de-classe", "Option de classe", ["state"], {}, "Choix fait dans une aptitude de classe (Ordre divin, Ordre primitif).", "#4f5a8f");
  DT("inspiration-recue", "Inspiration bardique reçue", ["state"], {}, "Un dé d'Inspiration bardique à ajouter à un test de d20.", "#8f7a3b");

  /* ---------- Abilities, saves, skills ---------- */
  for (const [k, id, name, abbr] of ABILITIES) {
    D(id, "caracteristique", name, {abreviation: abbr, modificateur: `mod-${id}`, sauvegarde: `sauvegarde-${id}`}, {descriptionKey: tr("misc.Ability-Scores", k, "description", "")});
    D(`mod-${id}`, "modificateur", `Modificateur de ${name}`, {caracteristique: id});
    DERIVE(`mod-${id}`, floor(div2(sub(value(id), lit(10)))), "(valeur − 10) / 2, arrondi à l'inférieur.");
    D(`sauvegarde-${id}`, "sauvegarde", `Sauvegarde de ${name}`, {caracteristique: id, modificateur: `mod-${id}`});
  }
  for (const s of srd("Skills")) {
    const id = slug(tr("misc.Skills", s.index, "name", s.name)), ab = AB[s.ability_score.index];
    SKILL[s.index] = id;
    D(id, "competence", tr("misc.Skills", s.index, "name", s.name), {caracteristique: ab, modificateur: `mod-${ab}`}, {descriptionKey: tr("misc.Skills", s.index, "description", "")});
  }

  /* ---------- Status, conditions, damage types ---------- */
  D("personnage-joueur", "statut", "Personnage joueur", {}, {descriptionKey: "Coché pour un personnage : ses valeurs viennent de sa classe, de son espèce et de son niveau. Décoché (monstre, PNJ du bestiaire) : ses valeurs sont celles du bloc de statistiques."});
  const S = (id, nameKey, descriptionKey) => D(id, "statut", nameKey, {immunite: ""}, {descriptionKey});
  S("mourant", "À 0 point de vie", "Inconscient à 0 point de vie : jets de sauvegarde contre la mort au début de chaque tour. Des soins y mettent fin.");
  S("stabilise", "Stabilisé", "À 0 point de vie mais stable : plus de jets contre la mort. Reprend 1 point de vie au bout de 1d4 heures.");
  S("mort", "Mort", "Trois échecs contre la mort, des dégâts massifs ou une créature réduite à 0 point de vie.");
  S("concentration", "Concentration", "Maintient un sort ou un effet de concentration. Des dégâts demandent un jet de sauvegarde de Constitution ; être neutralisé ou mourir y met fin.");
  S("esquive", "Esquive", "Action Esquiver : jusqu'au début du prochain tour, les attaques contre la créature ont le Désavantage et elle a l'Avantage aux sauvegardes de Dextérité.");
  S("desengage", "Désengagé", "Action Se désengager : pas d'attaque d'opportunité contre la créature jusqu'à la fin du tour.");
  S("foncer", "Fonce", "Action Foncer : déplacement supplémentaire égal à la Vitesse ce tour-ci.");
  S("aide", "Aidé", "Action Aider : le prochain test de caractéristique ou jet d'attaque de la créature a l'Avantage.");
  S("inspiration-heroique", "Inspiration héroïque", "Permet de relancer un dé immédiatement après l'avoir lancé ; la nouvelle valeur doit être gardée.");
  S("attaque-temeraire", "Attaque téméraire", "Jusqu'au début du prochain tour : Avantage aux jets d'attaque utilisant la Force, et les attaques contre la créature ont l'Avantage.");
  S("rage-active", "En rage", "Rage du barbare active.");
  S("sournoise-utilisee", "Attaque sournoise utilisée ce tour", "L'Attaque sournoise ne s'applique qu'une fois par tour.");
  S("armure-de-mage", "Armure du mage", "Sans armure : CA de base 13 + modificateur de Dextérité.");
  S("benediction", "Bénédiction", "Ajoute 1d4 aux jets d'attaque et de sauvegarde (Bénédiction).");
  S("fleau", "Fléau", "Retire 1d4 aux jets d'attaque et de sauvegarde (Fléau).");
  S("resistance-magie", "Résistance à la magie", "Avantage aux jets de sauvegarde contre les sorts et effets magiques.");
  S("surpris", "Surpris", "Désavantage au jet d'initiative.");
  for (const [k, id] of Object.entries(CONDITIONS)) D(id, "etat", tr("misc.Conditions", k, "name", k), {cle: id, immunite: `immunite-${id}`}, {descriptionKey: clean(tr("misc.Conditions", k, "description", ""))});
  D("epuisement", "compteur", tr("misc.Conditions", "exhaustion", "name", "Épuisement"), {}, {descriptionKey: clean(tr("misc.Conditions", "exhaustion", "description", "")), valueBounds: {minimum: {literal: 0}, maximum: {literal: 6}}});
  for (const [k, id] of Object.entries(CONDITIONS)) D(`immunite-${id}`, "immunite-etat", `Immunité : ${get("definitions", id).nameKey}`, {etat: id, immunite: ""});
  D("immunite-epuisement", "immunite-etat", "Immunité : Épuisement", {etat: "epuisement", immunite: ""});
  for (const [k, id] of Object.entries(DAMAGE)) {
    const name = tr("misc.Damage-Types", k, "name", k);
    for (const [type, label] of [["resistance", "Résistance"], ["vulnerabilite", "Vulnérabilité"], ["immunite", "Immunité"]]) D(`${type}-${id}`, type, `${label} : ${name.toLowerCase()}`, {typeDegats: id});
  }

  /* ---------- Counters, pools, derived values ---------- */
  D("xp", "compteur", "Points d'expérience", {}, {descriptionKey: "Le niveau total d'un personnage ne dépasse pas celui que donnent ses points d'expérience."});
  D("degats-a-appliquer", "compteur", "Dégâts reçus (dernier coup)", {}, {descriptionKey: "Dégâts du dernier coup, après résistance, avant les points de vie temporaires. Tenu par les règles."});
  D("pv-avant-degats", "compteur", "Points de vie avant le dernier coup", {}, {descriptionKey: "Tenu par les règles."});
  D("degats-excedentaires", "compteur", "Dégâts au-delà de 0 point de vie", {}, {descriptionKey: "Si le reste des dégâts égale ou dépasse le maximum de points de vie, la mort est instantanée. Tenu par les règles."});
  for (const [id, name] of [["pp", "Pièces de platine"], ["po", "Pièces d'or"], ["pe", "Pièces d'électrum"], ["pa", "Pièces d'argent"], ["pc", "Pièces de cuivre"]]) D(id, "monnaie", name);
  for (const [id, name, descriptionKey] of [
    ["niveau-total", "Niveau de personnage", "Somme des niveaux de classe (pour un monstre : sa valeur)."],
    ["bonus-maitrise", "Bonus de maîtrise", "+2 aux niveaux 1 à 4, +3 de 5 à 8, +4 de 9 à 12, +5 de 13 à 16, +6 de 17 à 20 ; celui du bloc de statistiques pour un monstre."],
    ["classe-armure", "Classe d'armure", "Selon l'armure portée, le bouclier et les aptitudes ; celle du bloc de statistiques pour un monstre."],
    ["pv-maximum", "Points de vie maximum", "Maximum du dé de vie de la classe de départ au niveau 1, puis la moyenne arrondie au supérieur de chaque dé de vie ; + modificateur de Constitution par niveau."],
    ["vitesse", "Vitesse (m)", "Vitesse de l'espèce (ou du monstre), plus les aptitudes ; 0 si Agrippé, Entravé, Paralysé, Étourdi, Inconscient ou Pétrifié ; −1,50 m par niveau d'Épuisement."],
    ["vision-dans-le-noir", "Vision dans le noir (m)", "Portée de la vision dans le noir."],
    ["perception-passive", "Perception passive", "10 + bonus de Sagesse (Perception)."],
    ["seuil-critique", "Coup critique sur", "Un 20 naturel au jet d'attaque est un coup critique (19 ou 18 avec Critique amélioré ou supérieur)."],
    ["bonus-ca", "Bonus de CA (manuel)", "Bonus ou malus de CA ajouté à la main par le MJ (sort Bouclier de la foi, abri…)."],
    ["bonus-attaques", "Bonus aux jets d'attaque (manuel)", "Ajouté par le MJ à tous les jets d'attaque."],
    ["bonus-sauvegardes", "Bonus aux sauvegardes (manuel)", "Ajouté par le MJ à tous les jets de sauvegarde."],
    ["bonus-initiative", "Bonus d'initiative (manuel)", "Ajouté par le MJ au jet d'initiative."]
  ]) D(id, "valeur-derivee", name, {}, {descriptionKey});
  POOL("pv", "ressource", "Points de vie", "pv-maximum-calcul", {}, {descriptionKey: "Points de vie actuels, de 0 au maximum."});
  POOL("pv-temporaires", "ressource", "Points de vie temporaires", 999, {}, {descriptionKey: "Perdus en premier ; ne se cumulent pas (on garde le plus grand total). Disparaissent au repos long."}, {initial: {literal: 0}});
  POOL("reussites-contre-la-mort", "ressource", "Réussites contre la mort", 3, {}, {}, {initial: {literal: 0}});
  POOL("echecs-contre-la-mort", "ressource", "Échecs contre la mort", 3, {}, {}, {initial: {literal: 0}});
  F("pv-maximum-calcul", "Maximum de points de vie", value("pv-maximum"));

  /* Proficiency bonus, total level, passive perception, critical threshold. */
  const PB = value("bonus-maitrise");
  DERIVE("niveau-total", iff(estPJ(), fx("somme-des-niveaux"), ref(base("niveau-total"))), "Somme des niveaux de classe pour un personnage, valeur du bloc pour un monstre.");
  DERIVE("bonus-maitrise", iff(estPJ(), max(lit(2), sum(ceil(div2b(value("niveau-total"), 4)), lit(1))), ref(base("bonus-maitrise"))));
  DERIVE("perception-passive", sum(lit(10), fx("bonus-competence-perception")));
  DERIVE("vision-dans-le-noir", ref(base("vision-dans-le-noir")));
  for (const id of ["bonus-ca", "bonus-attaques", "bonus-sauvegardes", "bonus-initiative"]) DERIVE(id, ref(base(id)));

  /* ---------- Advantage and Disadvantage ---------- */
  // The GM's call (Help, cover from fog, a clever idea) comes with each roll as an input; the rest comes from the rules.
  const asked = which => eq(input("avantage"), lit(which));
  const luck = holds(apt("luck"));
  const d20Roll = (id, nameKey, adv, dis, extraVariants = []) => {
    const a = KF(`${id}-avantage`, `${nameKey} : avantage`, and(adv, not(dis)));
    const d = KF(`${id}-desavantage`, `${nameKey} : désavantage`, and(dis, not(adv)));
    const l = `${id}-chance`;
    K(`${l}-avantage`, `${nameKey} : avantage (Chance)`, and(luck, is(a)));
    K(`${l}-desavantage`, `${nameKey} : désavantage (Chance)`, and(luck, is(d)));
    K(l, `${nameKey} : Chance`, luck);
    R(id, nameKey, "1d20", [...extraVariants, {conditionRef: `${l}-avantage`, formula: "2d20r1kh"}, {conditionRef: `${l}-desavantage`, formula: "2d20r1kl"}, {conditionRef: a, formula: "2d20kh"}, {conditionRef: d, formula: "2d20kl"}, {conditionRef: l, formula: "1d20r1"}],
      "1d20 ; deux dés en gardant le meilleur (Avantage) ou le pire (Désavantage) ; la Chance des halfelins relance un 1.");
  };
  // Attack rolls: Invisible, the target's conditions, Prone at 5 feet or beyond, Dodge, ranged with an enemy adjacent, long range.
  const advAttaque = or(asked("avantage"), holds("invisible"), holds("aide"), ...["aveugle", "paralyse", "etourdi", "inconscient", "entrave", "petrifie"].map(id => holds(id, "target")),
    and(holds("a-terre", "target"), lte(dist, lit(1.5))), and(holds("attaque-temeraire"), cf("corpsACorps", true)), holds("attaque-temeraire", "target"));
  const disAttaque = or(asked("desavantage"), ...["aveugle", "empoisonne", "entrave", "effraye", "a-terre"].map(id => holds(id)), holds("invisible", "target"),
    and(holds("esquive", "target"), not(incap("target"))), and(holds("a-terre", "target"), gt(dist, lit(1.5))),
    and(not(cf("corpsACorps", true)), gt(nearbyEnemies(), lit(0))), and(gt(cf("porteeNormale", 0), lit(0)), gt(dist, cf("porteeNormale", 0))));
  F("si-avantage-attaque-brut", "Une source d'Avantage à l'attaque", advAttaque, "", "boolean");
  F("si-desavantage-attaque-brut", "Une source de Désavantage à l'attaque", disAttaque, "", "boolean");
  d20Roll("d20-attaque", "Jet d'attaque", fx("si-avantage-attaque-brut"), fx("si-desavantage-attaque-brut"));
  // Ability checks and skills: the ability tested comes from the input (caracteristique) or the skill's (competence).
  const checkAbility = iff(inputId("competence"), defField(input("competence"), "caracteristique"), iff(inputId("outil"), defField(input("outil"), "caracteristique"), inputId("caracteristique")));
  FR("caracteristique-du-test", "Caractéristique du test", checkAbility, "Celle de la compétence ou de l'outil testé, sinon la caractéristique choisie.");
  const testedAbility = fx("caracteristique-du-test");
  const advTest = or(asked("avantage"), holds("aide"), and(holds("rage-active"), eq(testedAbility, lit("force"))),
    and(holds(apt("champion-remarkable-athlete")), eq(inputId("competence"), lit(SKILL.athletics))));
  const disTest = or(asked("desavantage"), holds("empoisonne"), holds("effraye"),
    and(eq(inputId("competence"), lit(SKILL.stealth)), gt({type: "contentAggregate", operation: "max", contentTypeId: "armure", field: "desavantageDiscretion", whereField: "equipe"}, lit(0))));
  d20Roll("d20-test", "Test de caractéristique", advTest, disTest, [{conditionRef: "talent-fiable", formula: "1d20min10"}]);
  K("talent-fiable", "Talent fiable", and(holds(apt("rogue-reliable-talent")), inputId("competence"), gte(defVal(input("competence")), lit(1)), not(asked("desavantage"))), "Un roublard de niveau 7 traite un résultat de 9 ou moins au d20 comme un 10 dans une compétence qu'il maîtrise.");
  // Saving throws, one Roll per ability: Dodge and Danger Sense for Dexterity, Rage for Strength, Gnomish Cunning, Restrained.
  for (const [, id, name] of ABILITIES) {
    const adv = or(asked("avantage"), ...(id === "force" ? [holds("rage-active")] : []),
      ...(id === "dexterite" ? [holds("esquive"), and(holds(apt("barbarian-danger-sense")), not(incap()))] : []),
      ...(["intelligence", "sagesse", "charisme"].includes(id) ? [holds(apt("gnomish-cunning"))] : []));
    const dis = or(asked("desavantage"), ...(id === "dexterite" ? [holds("entrave")] : []));
    d20Roll(`d20-sauvegarde-${id}`, `Sauvegarde de ${name}`, adv, dis);
    // Against a spell: the same, plus Magic Resistance.
    d20Roll(`d20-sauvegarde-sort-${id}`, `Sauvegarde de ${name} contre un sort`, or(adv, holds("resistance-magie")), dis);
  }
  d20Roll("d20-initiative", "Initiative", or(holds("invisible"), holds(apt("barbarian-feral-instinct")), holds(apt("champion-remarkable-athlete"))), or(incap(), holds("surpris")));
  d20Roll("d20-mort", "Sauvegarde contre la mort", lit(false), lit(false));

  /* ---------- Bonuses of the D20 Tests ---------- */
  const bardJoat = iff(and(holds(apt("bard-jack-of-all-trades"))), floor(div2(PB)), lit(0));
  const manual = id => value(id);
  F("bonus-test-caracteristique", "Bonus d'un test de caractéristique", sub(sum(defVal(defField(input("caracteristique"), "modificateur")), bardJoat), exhaustion), "Modificateur de la caractéristique (+ moitié du bonus de maîtrise avec Touche-à-tout), − 2 par niveau d'Épuisement.");
  const proficiencyBonus = proficiency => iff(eq(proficiency, lit(0)), bardJoat, mul(PB, proficiency));
  F("bonus-test-competence", "Bonus d'un test de compétence", sub(sum(defVal(defField(input("competence"), "modificateur")), proficiencyBonus(defVal(input("competence")))), exhaustion), "Modificateur de la caractéristique + bonus de maîtrise (doublé avec l'Expertise ; moitié avec Touche-à-tout), − 2 par niveau d'Épuisement.");
  F("bonus-test-outil", "Bonus d'un test d'outil", sub(sum(defVal(defField(input("outil"), "modificateur")), proficiencyBonus(defVal(input("outil")))), exhaustion), "Modificateur de la caractéristique de l'outil + bonus de maîtrise (doublé avec l'Expertise).");
  for (const s of srd("Skills")) {
    const id = SKILL[s.index], ab = AB[s.ability_score.index];
    F(`bonus-competence-${id}`, `Bonus de ${get("definitions", id).nameKey}`, sum(value(`mod-${ab}`), proficiencyBonus(value(id))));
  }
  const auraProtection = iff(holds(apt("paladin-aura-of-protection")), max(lit(1), value("mod-charisme")), lit(0));
  for (const [, id, name] of ABILITIES)
    F(`bonus-sauvegarde-${id}`, `Bonus de sauvegarde de ${name}`, sub(sum(value(`mod-${id}`), mul(PB, value(`sauvegarde-${id}`)), value("bonus-sauvegardes"), auraProtection,
      {type: "contentAggregate", operation: "sum", contentTypeId: "objet-magique", field: "bonusSauvegardes", whereField: "equipe"}), exhaustion),
      "Modificateur + bonus de maîtrise si maîtrisée + objets magiques portés + Aura de protection, − 2 par niveau d'Épuisement.");
  F("bonus-initiative-calcul", "Bonus d'initiative", sub(sum(value("mod-dexterite"), value("bonus-initiative"), iff(holds("don-vigilant"), PB, lit(0))), exhaustion), "Modificateur de Dextérité (+ bonus de maîtrise avec le don Vigilant), − 2 par niveau d'Épuisement.");
  F("departage-initiative", "Départage de l'initiative", value("dexterite"), "À égalité, la plus haute Dextérité agit en premier.");

  /* ---------- Outcomes ---------- */
  const natural = ctx("variables.test.natural"), margin = ctx("variables.test.margin");
  K("marge-positive", "Total au moins égal au DD", gte(margin, lit(0)));
  K("marge-strictement-positive", "Total au-dessus du DD", gt(margin, lit(0)));
  K("vingt-naturel", "20 naturel", eq(natural, lit(20)));
  K("un-naturel", "1 naturel", eq(natural, lit(1)));
  K("critique-naturel", "Coup critique (dé naturel)", gte(natural, value("seuil-critique")));
  K("critique-au-contact", "Touche au contact d'une cible paralysée ou inconsciente", and(gte(margin, lit(0)), or(holds("paralyse", "target"), holds("inconscient", "target")), lte(dist, lit(1.5))));
  O("reussite", "Réussite", "reussite", "marge-positive", "Total au moins égal au DD.");
  O("echec", "Échec", "echec", null, "Total inférieur au DD.");
  O("echec-critique", "Échec automatique (1 naturel)", "echec-critique", "un-naturel", "Un 1 naturel au jet d'attaque rate toujours.");
  O("coup-critique", "Coup critique", "coup-critique", "critique-naturel", "Touche automatiquement ; les dés de dégâts sont lancés deux fois.");
  O("critique-au-contact", "Coup critique (cible sans défense)", "coup-critique", "critique-au-contact", "Une attaque qui touche une cible Paralysée ou Inconsciente à 1,50 m ou moins est un coup critique.");
  O("touche", "Touché", "touche", "marge-positive", "Total au moins égal à la CA.");
  O("rate", "Raté", "rate", null, "Total inférieur à la CA.");
  // A save against an effect: the effect's DC is the total of the one who makes it, the target's save its target.
  O("sauvegarde-ratee", "Sauvegarde ratée", "sauvegarde-ratee", "marge-strictement-positive", "Le jet de sauvegarde de la cible est inférieur au DD.");
  O("sauvegarde-reussie", "Sauvegarde réussie", "sauvegarde-reussie", null, "Le jet de sauvegarde égale ou dépasse le DD.");
  K("echec-automatique-force-dex", "Échec automatique (Force ou Dextérité)", or(...["paralyse", "etourdi", "inconscient", "petrifie"].map(id => holds(id, "target"))), "Paralysé, Étourdi, Inconscient ou Pétrifié : échec automatique aux sauvegardes de Force et de Dextérité.");
  O("sauvegarde-ratee-automatique", "Sauvegarde ratée (automatique)", "sauvegarde-ratee", "echec-automatique-force-dex", "Échec automatique aux sauvegardes de Force et de Dextérité.");
  K("echec-automatique-soi", "Échec automatique (Force ou Dextérité)", or(...["paralyse", "etourdi", "inconscient", "petrifie"].map(id => holds(id))));
  O("echec-automatique", "Échec automatique", "echec", "echec-automatique-soi", "Paralysé, Étourdi, Inconscient ou Pétrifié : échec automatique aux sauvegardes de Force et de Dextérité.");
  O("resolu", "Appliqué", "resolu", null);

  /* ---------- Tests ---------- */
  const DD = {id: "dd", source: {formulaRef: "dd-demande"}, valueType: "number", required: true, defaultValue: 10};
  F("dd-demande", "DD demandé", input("dd"), "DD annoncé par le MJ.");
  F("dd-du-test", "DD du test", ctx("variables.test.inputs.dd"));
  const extras = [{conditionRef: "beni", rollRef: "d4-benediction", operation: "add"}, {conditionRef: "maudit", rollRef: "d4-benediction", operation: "subtract"},
    ...[6, 8, 10, 12].map(faces => ({conditionRef: `inspiration-d${faces}-utilisee`, rollRef: `d${faces}-inspiration`, operation: "add"}))];
  R("d4-benediction", "1d4 (Bénédiction ou Fléau)", "1d4");
  K("beni", "Béni", holds("benediction")); K("maudit", "Maudit", holds("fleau"));
  for (const faces of [6, 8, 10, 12]) {
    D(`inspiration-d${faces}`, "inspiration-recue", `Inspiration bardique (d${faces})`, {faces}, {descriptionKey: `Ajouter 1d${faces} à un test de d20 ; le dé est perdu une fois utilisé.`});
    R(`d${faces}-inspiration`, `1d${faces} (Inspiration bardique)`, `1d${faces}`);
    K(`inspiration-d${faces}-utilisee`, `Inspiration bardique d${faces} utilisée`, and(eq(input("inspiration"), lit(true)), holds(`inspiration-d${faces}`)));
    FR(`inspiration-d${faces}-depensee`, `Inspiration bardique d${faces} dépensée`, iff(eq(input("inspiration"), lit(true)), lit(`inspiration-d${faces}`), lit(null)));
  }
  const checkOutcomes = {outcomeRefs: ["reussite"], fallbackOutcomeRef: "echec"};
  T("test-de-caracteristique", "Test de caractéristique", {rollRef: "d20-test", inputBindings: [DD], bonusFormulaRef: "bonus-test-caracteristique", targetFormulaRef: "dd-du-test", extraRolls: extras.slice(2), ...checkOutcomes, descriptionKey: "1d20 + modificateur contre le DD."});
  T("test-de-competence", "Test de compétence", {rollRef: "d20-test", inputBindings: [DD], bonusFormulaRef: "bonus-test-competence", targetFormulaRef: "dd-du-test", extraRolls: extras.slice(2), ...checkOutcomes, descriptionKey: "1d20 + modificateur + bonus de maîtrise si la compétence est maîtrisée."});
  T("test-d-outil", "Test d'outil", {rollRef: "d20-test", inputBindings: [DD], bonusFormulaRef: "bonus-test-outil", targetFormulaRef: "dd-du-test", extraRolls: extras.slice(2), ...checkOutcomes});
  for (const [, id, name] of ABILITIES) {
    T(`sauvegarde-${id}`, `Jet de sauvegarde de ${name}`, {rollRef: `d20-sauvegarde-${id}`, inputBindings: [DD], bonusFormulaRef: `bonus-sauvegarde-${id}`, targetFormulaRef: "dd-du-test", extraRolls: extras, outcomeRefs: ["force", "dexterite"].includes(id) ? ["echec-automatique", "reussite"] : ["reussite"], fallbackOutcomeRef: "echec"});
    // Opposed by an effect's DC: made by the target, against the DC of the one who uses the effect.
    T(`contre-${id}`, `Sauvegarde de ${name} contre un effet`, {rollRef: `d20-sauvegarde-${id}`, bonusFormulaRef: `bonus-sauvegarde-${id}`, extraRolls: extras.slice(0, 2)});
    T(`contre-sort-${id}`, `Sauvegarde de ${name} contre un sort`, {rollRef: `d20-sauvegarde-sort-${id}`, bonusFormulaRef: `bonus-sauvegarde-${id}`, extraRolls: extras.slice(0, 2)});
  }
  T("initiative", "Initiative", {rollRef: "d20-initiative", bonusFormulaRef: "bonus-initiative-calcul", descriptionKey: "1d20 + modificateur de Dextérité. Avantage si Invisible, Désavantage si Neutralisé ou surpris."});
  F("bonus-mort", "Bonus de sauvegarde contre la mort", sum(value("bonus-sauvegardes"), {type: "contentAggregate", operation: "sum", contentTypeId: "objet-magique", field: "bonusSauvegardes", whereField: "equipe"}));
  K("dix-ou-plus", "10 ou plus", gte(ctx("variables.test.total"), lit(10)));
  O("mort-vingt", "20 naturel : 1 point de vie", "vingt", "vingt-naturel", "Reprend conscience avec 1 point de vie.");
  O("mort-un", "1 naturel : deux échecs", "un", "un-naturel", "Compte comme deux échecs.");
  O("mort-reussite", "Réussite", "reussite", "dix-ou-plus", "10 ou plus : une réussite. Trois réussites stabilisent.");
  O("mort-echec", "Échec", "echec", null, "Moins de 10 : un échec. Trois échecs : la mort.");
  T("sauvegarde-contre-la-mort", "Jet de sauvegarde contre la mort", {rollRef: "d20-mort", bonusFormulaRef: "bonus-mort", extraRolls: extras.slice(0, 2), outcomeRefs: ["mort-vingt", "mort-un", "mort-reussite"], fallbackOutcomeRef: "mort-echec"});
  F("zero", "Zéro", lit(0));
  T("resolution", "Résolution", {totalFormulaRef: "zero", fallbackOutcomeRef: "resolu", descriptionKey: "Sans jet : enchaîne les règles qui suivent."});

  /* ---------- Durations ---------- */
  add("durations", generic({id: "jusqu-au-retrait", nameKey: "Jusqu'au retrait", mode: "untilRemoved"}));
  add("durations", generic({id: "un-round", nameKey: "Un round", mode: "fixed", amount: 1, unit: "round"}));
  add("durations", generic({id: "une-minute", nameKey: "Une minute", mode: "fixed", amount: 1, unit: "minute"}));
  add("durations", generic({id: "dix-minutes", nameKey: "Dix minutes", mode: "fixed", amount: 10, unit: "minute"}));
  add("durations", generic({id: "une-heure", nameKey: "Une heure", mode: "fixed", amount: 1, unit: "hour"}));
  add("durations", generic({id: "huit-heures", nameKey: "Huit heures", mode: "fixed", amount: 8, unit: "hour"}));
}

/* ---------- Damage ---------- */
/** The factor of a damage type on the target: 0 immune, ×½ resistant (Rage for B/P/S, Petrified for all), ×2 vulnerable. */
export function damageFactor(typeAst) {
  const forType = id => {
    const resistant = or(holds(`resistance-${id}`, "target"), holds("petrifie", "target"), ...(["contondant", "perforant", "tranchant"].includes(id) ? [holds("rage-active", "target")] : []));
    const vulnerable = holds(`vulnerabilite-${id}`, "target");
    return iff(holds(`immunite-${id}`, "target"), lit(0), iff(and(resistant, vulnerable), lit(1), iff(resistant, lit(0.5), iff(vulnerable, lit(2), lit(1)))));
  };
  return Object.values(DAMAGE).reduceRight((otherwise, id) => iff(eq(typeAst, lit(id)), forType(id), otherwise), lit(1));
}
export const SKILL = {};
const div2 = value => ({type: "divide", args: [value, lit(2)]});
const div2b = (value, n) => ({type: "divide", args: [value, lit(n)]});

/** What follows damage, in order: a hit at 0 HP (a failed death save), the loss of Hit Points (temporary ones first),
 * Relentless Endurance, massive damage, dropping to 0 (a character falls Unconscious, a monster dies), three failures,
 * concentration. Each step is a follow-up Action refused by its Conditions when it does not apply. */
export const SUITE = ["echec-mort-sur-degats", "subir-degats", "endurance-implacable", "mort-par-degats-massifs", "tomber-a-zero-pj", "tomber-a-zero-creature", "mourir-sur-echecs", "test-de-concentration"];
export function damageRules() {
  const dmg = value("degats-a-appliquer", "target"), hp = ref(pool("pv"), "target"), temp = ref(pool("pv-temporaires"), "target");
  F("type-degats", "Type de dégâts", cf("typeDegats", "contondant"), "Celui de l'arme, du sort ou de l'attaque utilisée (contondant à mains nues).", "string");
  F("type-degats-2", "Type des dégâts supplémentaires", cf("typeDegats2", "contondant"), "", "string");
  F("facteur-degats", "Résistance, vulnérabilité ou immunité", damageFactor(fx("type-degats")), "×0 immunité, ×½ résistance (Rage : contondant, perforant, tranchant ; Pétrifié : tout), ×2 vulnérabilité.");
  F("facteur-degats-2", "Résistance aux dégâts supplémentaires", damageFactor(fx("type-degats-2")));
  F("facteur-degats-moitie", "Moitié des dégâts (sauvegarde réussie)", iff(cf("moitie", false), mul(lit(0.5), fx("facteur-degats")), lit(0)), "La moitié des dégâts sur une sauvegarde réussie quand l'effet le dit, sinon rien.");
  F("facteur-degats-demande", "Résistance au type choisi", damageFactor(input("typeDegats")));
  F("multiplicateur-critique", "Dés doublés au critique", iff(or(eq(outcome, lit("coup-critique")), eq(input("critique"), lit(true))), lit(2), lit(1)), "Un coup critique lance deux fois les dés de dégâts, pas les bonus (aussi pour un Châtiment lancé après un coup critique).");
  E("degats-reinitialises", "Nouveau coup", base("degats-a-appliquer"), "set", {kind: "literal", value: 0}, "target", "Le compteur de dégâts du coup repart de 0.");
  E("degats-demandes", "Dégâts choisis par le MJ", base("degats-a-appliquer"), "set", {kind: "formula", id: "degats-demandes-calcul"}, "target");
  F("degats-demandes-calcul", "Dégâts choisis, après résistance", floor(mul(input("montant"), fx("facteur-degats-demande"))));
  // A hit while at 0 Hit Points: a failure, two on a critical hit; damage at least the HP maximum kills outright.
  F("echecs-sur-degats", "Échecs dus aux dégâts", iff(eq(outcome, lit("coup-critique")), lit(2), lit(1)));
  E("echec-sur-degats", "Échec contre la mort (dégâts)", pool("echecs-contre-la-mort"), "add", {kind: "formula", id: "echecs-sur-degats"}, "target");
  K("touche-a-zero", "Touché à 0 point de vie", and(estPJ("target"), lte(hp, lit(0)), gt(dmg, lit(0)), holds("mourant", "target"), not(holds("mort", "target"))));
  A("echec-mort-sur-degats", "Dégâts à 0 point de vie", {conditionRefs: ["touche-a-zero"], effectRefs: ["echec-sur-degats"], stateRemovals: [stateRemove("stabilise")]});
  F("pv-avant", "Points de vie avant le coup", hp);
  F("excedent", "Dégâts au-delà de 0", max(lit(0), sub(dmg, temp, hp)));
  F("perte-pv", "Points de vie perdus", max(lit(0), sub(dmg, temp)));
  F("perte-pv-temporaires", "Points de vie temporaires perdus", dmg);
  E("noter-pv-avant", "Points de vie avant le coup", base("pv-avant-degats"), "set", {kind: "formula", id: "pv-avant"}, "target");
  E("noter-excedent", "Dégâts au-delà de 0", base("degats-excedentaires"), "set", {kind: "formula", id: "excedent"}, "target");
  E("perdre-pv", "Perte de points de vie", pool("pv"), "subtract", {kind: "formula", id: "perte-pv"}, "target", "Les points de vie temporaires absorbent d'abord les dégâts.");
  E("perdre-pv-temporaires", "Perte de points de vie temporaires", pool("pv-temporaires"), "subtract", {kind: "formula", id: "perte-pv-temporaires"}, "target");
  K("des-degats", "Des dégâts", gt(dmg, lit(0)));
  A("subir-degats", "Subir les dégâts", {conditionRefs: ["des-degats"], effectRefs: ["noter-pv-avant", "noter-excedent", "perdre-pv", "perdre-pv-temporaires"]});
  // Orc: Relentless Endurance (0 HP without being killed outright: 1 HP instead, once per long rest).
  POOL("endurance-implacable-utilisation", "ressource", "Endurance implacable (utilisation)", "endurance-implacable-maximum", {}, {descriptionKey: "Orc : une fois par repos long, tomber à 1 point de vie au lieu de 0."});
  F("endurance-implacable-maximum", "Endurance implacable (utilisations)", iff(holds(apt("relentless-endurance")), lit(1), lit(0)));
  PIECES.reposLong.push(["endurance-implacable-utilisation", "max"]);
  K("endurance-implacable-possible", "Endurance implacable", and(holds(apt("relentless-endurance"), "target"), gt(ref(pool("endurance-implacable-utilisation"), "target"), lit(0)), lte(hp, lit(0)), gt(value("pv-avant-degats", "target"), lit(0)), lt(value("degats-excedentaires", "target"), value("pv-maximum", "target"))));
  E("un-pv", "1 point de vie", pool("pv"), "set", {kind: "literal", value: 1}, "target");
  E("utiliser-endurance-implacable", "Endurance implacable utilisée", pool("endurance-implacable-utilisation"), "subtract", {kind: "literal", value: 1}, "target");
  A("endurance-implacable", "Endurance implacable", {conditionRefs: ["endurance-implacable-possible"], effectRefs: ["un-pv", "utiliser-endurance-implacable"]});
  K("degats-massifs", "Dégâts massifs", and(lte(hp, lit(0)), gte(value("degats-excedentaires", "target"), value("pv-maximum", "target")), not(holds("mort", "target"))), "Le reste des dégâts après 0 égale ou dépasse le maximum de points de vie.");
  A("mort-par-degats-massifs", "Mort par dégâts massifs", {conditionRefs: ["degats-massifs"], stateApplications: [stateApply("mort")], stateRemovals: [stateRemove("mourant")]});
  E("reussites-a-zero", "Réussites contre la mort remises à 0", pool("reussites-contre-la-mort"), "set", {kind: "literal", value: 0}, "target");
  E("echecs-a-zero", "Échecs contre la mort remis à 0", pool("echecs-contre-la-mort"), "set", {kind: "literal", value: 0}, "target");
  K("tombe-a-zero-pj", "Un personnage tombe à 0", and(estPJ("target"), lte(hp, lit(0)), gt(value("pv-avant-degats", "target"), lit(0)), not(holds("mort", "target"))));
  A("tomber-a-zero-pj", "Tomber à 0 point de vie", {conditionRefs: ["tombe-a-zero-pj"], effectRefs: ["reussites-a-zero", "echecs-a-zero"], stateApplications: [stateApply("inconscient"), stateApply("mourant")], stateRemovals: [stateRemove("stabilise"), stateRemove("concentration")],
    descriptionKey: "Inconscient et mourant : jets contre la mort à chaque tour."});
  K("tombe-a-zero-creature", "Un monstre tombe à 0", and(not(estPJ("target")), lte(hp, lit(0)), not(holds("mort", "target"))));
  A("tomber-a-zero-creature", "Monstre à 0 point de vie", {conditionRefs: ["tombe-a-zero-creature"], stateApplications: [stateApply("mort")], stateRemovals: [stateRemove("concentration")], descriptionKey: "Un monstre meurt à 0 point de vie (le MJ peut le laisser inconscient)."});
  K("trois-echecs", "Trois échecs contre la mort", and(gte(ref(pool("echecs-contre-la-mort"), "target"), lit(3)), not(holds("mort", "target"))));
  A("mourir-sur-echecs", "Mort", {conditionRefs: ["trois-echecs"], stateApplications: [stateApply("mort")], stateRemovals: [stateRemove("mourant")]});
  // Concentration: a Constitution save, DC 10 or half the damage (at most 30).
  F("dd-concentration", "DD de concentration", min(lit(30), max(par("dd-concentration-minimum"), floor({type: "divide", args: [dmg, lit(2)]}))), "10 ou la moitié des dégâts subis, au plus 30.");
  K("concentration-menacee", "Concentration menacée", and(holds("concentration", "target"), gt(dmg, lit(0)), gt(hp, lit(0))));
  O("concentration-rompue", "Concentration rompue", "rompue", "marge-strictement-positive");
  O("concentration-maintenue", "Concentration maintenue", "maintenue", null);
  T("concentration", "Sauvegarde de concentration", {totalFormulaRef: "dd-concentration", opposedTestRef: "contre-constitution", outcomeRefs: ["concentration-rompue"], fallbackOutcomeRef: "concentration-maintenue", descriptionKey: "La cible fait un jet de sauvegarde de Constitution contre ce DD."});
  A("perdre-concentration", "Perdre sa concentration", {stateRemovals: [stateRemove("concentration")]});
  A("test-de-concentration", "Maintenir sa concentration", {conditionRefs: ["concentration-menacee"], testRef: "concentration", outcomeMappings: [{outcomeId: "concentration-rompue", actionRefs: ["perdre-concentration"]}]});
}
