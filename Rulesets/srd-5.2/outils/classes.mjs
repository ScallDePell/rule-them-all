// The twelve classes of the SRD 5.2: class levels and experience, Hit Points and Hit Dice, proficiencies, every class
// and subclass feature as a Definition, the class resources (Rage, Bardic Inspiration, Channel Divinity, Focus…) and
// their Actions, the class Items used at creation and to multiclass, and the "Niveaux" progression (level up by
// experience, the features and choices of each level).
import {add, get, srd, tr, clean, slug, AB, CLASS_IDS, PIECES, apt, aptIndexes, ft, base, pool, ref, lit, ctx, fx, sum, sub, mul, max, min, floor, ceil, and, or, not, cf, defVal, defField, iff, eq, neq, gt, gte, lt, lte, holds, value, lookup, range,
  P, D, POOL, F, FR, DERIVE, K, KF, is, R, O, T, E, A, TRIG, CT, TPL, stateApply, stateApplyF, stateRemove, stateRemoveF, grant, grantDef, grantAdd, grantAction, grantItem, intF, txtF, boolF} from "./lib.mjs";
import {SUITE, SKILL, estPJ, input, inputId, level, incap, damageFactor} from "./regles.mjs";
import {ON_HIT, extraDamage, export_heal} from "./combat.mjs";
import {FULL_CASTERS, HALF_CASTERS, CASTING} from "./magie.mjs";

const PB = value("bonus-maitrise");
export const DIE = {};
const NAME = cls => tr("misc.Classes", Object.keys(CLASS_IDS).find(k => CLASS_IDS[k] === cls), "name", cls);
export const PROF = {}; // SRD proficiency index -> Definition id(s)
const levelsOf = index => srd("Levels").filter(l => l.class?.index === index && !l.subclass);
const tableOf = (index, key) => Object.fromEntries(levelsOf(index).map(l => [l.level, l.class_specific?.[key] ?? 0]));
const agg = (field, operation = "max") => ({type: "contentAggregate", operation, contentTypeId: "armure", field, whereField: "equipe"});

/** Class levels, experience, Hit Dice, proficiencies and the Definitions of every feature. Run before the spells. */
export function classLevels() {
  for (const c of srd("Classes")) {
    const id = CLASS_IDS[c.index], name = NAME(id);
    DIE[id] = c.hit_die;
    D(`niveau-${id}`, "niveau-de-classe", `Niveau de ${name}`, {cle: id, deVie: c.hit_die, lanceur: FULL_CASTERS.includes(id) ? "complet" : HALF_CASTERS.includes(id) ? "moitie" : id === "occultiste" ? "pacte" : "", caracteristiqueIncantation: CASTING[id] ?? ""},
      {descriptionKey: `Dé de vie : d${c.hit_die}. Caractéristique principale : ${primaryAbilities(c).map(a => get("definitions", AB[a.index]).nameKey).join(c.primary_ability.desc.includes(" or ") ? " ou " : " et ")}.`});
    D(`classe-de-depart-${id}`, "classe-de-depart", `Classe de départ : ${name}`, {classe: id}, {descriptionKey: `Le personnage a commencé ${name.toLowerCase()} : ses points de vie de niveau 1 sont le maximum du d${c.hit_die}.`});
  }
  F("somme-des-niveaux", "Somme des niveaux de classe", sum(...Object.values(CLASS_IDS).map(level)));
  P("progression-par-experience", "Montée de niveau par l'expérience (1 oui, 0 non)", 1, "À 0, le MJ fait monter de niveau sans regarder les points d'expérience (progression par étapes).");
  D("niveau-par-xp", "valeur-derivee", "Niveau permis par l'expérience", {}, {descriptionKey: "Niveau que les points d'expérience permettent d'atteindre."});
  const XP = [0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000, 85000, 100000, 120000, 140000, 165000, 195000, 225000, 265000, 305000, 355000];
  DERIVE("niveau-par-xp", range(value("xp"), XP.map((min, i) => ({min, ...(i < 19 ? {max: XP[i + 1] - 1} : {}), value: i + 1}))), "300 PX pour le niveau 2, 900 pour le 3… 355 000 pour le 20.");
  // Hit Points: the starting class's die at its maximum, then its average (rounded up) per level, plus Constitution.
  const avg = cls => DIE[cls] / 2 + 1;
  PIECES.pvMaximum.push(...Object.keys(DIE).map(cls => mul(level(cls), lit(avg(cls)))), ...Object.keys(DIE).map(cls => iff(holds(`classe-de-depart-${cls}`), lit(DIE[cls] - avg(cls)), lit(0))), mul(value("mod-constitution"), value("niveau-total")));
  // Hit Dice: one per level of the classes that give that die; all of them come back after a Long Rest.
  for (const faces of [6, 8, 10, 12]) {
    const classes = Object.keys(DIE).filter(cls => DIE[cls] === faces);
    F(`des-de-vie-d${faces}-maximum`, `Dés de vie d${faces} (maximum)`, sum(...classes.map(level)));
    POOL(`des-de-vie-d${faces}`, "de-de-vie", `Dés de vie (d${faces})`, `des-de-vie-d${faces}-maximum`, {faces}, {descriptionKey: `Dés de vie de ${classes.map(NAME).join(", ")}. Dépensés au repos court, tous récupérés au repos long.`});
    PIECES.reposLong.push([`des-de-vie-d${faces}`, "max"]);
  }

  /* ---------- Proficiencies ---------- */
  const equipment = new Map(srd("Equipment").map(e => [e.index, e]));
  for (const p of srd("Proficiencies")) {
    const name = tr("misc.Proficiencies", p.index, "name", p.name).replace(/^(Outil|Compétence) : /, "");
    if (p.type === "Skills") { PROF[p.index] = SKILL[p.index.slice(6)]; continue; }
    if (p.type === "Saving Throws") { PROF[p.index] = `sauvegarde-${AB[p.index.slice(-3)]}`; continue; }
    if (p.index === "all-armor") continue;
    const id = slug(name);
    if (["Armor", "Weapons"].includes(p.type)) D(id, "maitrise-equipement", name, {}, {descriptionKey: p.type === "Armor" ? "Sans maîtrise, porter cette armure donne le Désavantage aux tests et jets d'attaque utilisant la Force ou la Dextérité, et empêche de lancer des sorts." : "Le bonus de maîtrise s'ajoute aux jets d'attaque avec ces armes."});
    else D(id, "outil", name, {caracteristique: AB[equipment.get(p.reference?.index ?? p.index)?.ability?.index ?? "dex"], modificateur: `mod-${AB[equipment.get(p.reference?.index ?? p.index)?.ability?.index ?? "dex"]}`}, {descriptionKey: "Maîtrise d'outil : le bonus de maîtrise s'ajoute aux tests faits avec cet outil (doublé avec l'Expertise)."});
    PROF[p.index] = id;
  }
  PROF["all-armor"] = [PROF["light-armor"], PROF["medium-armor"], PROF["heavy-armor"]];
  for (const t of ["cartographers-tools"]) if (!PROF[t]) PROF[t] = PROF["cartographer-tools"];

  /* ---------- Features, subclasses, class options ---------- */
  for (const f of srd("Features")) {
    const cls = CLASS_IDS[f.class.index], lvl = Number(/(\d+)$/.exec(f.level.index)[1]);
    D(apt(f.index), "aptitude", tr("features", f.index, "name", f.name), {classe: cls, niveau: lvl, sousClasse: f.subclass ? slug(tr("misc.Subclasses", f.subclass.index, "name", f.subclass.index)) : ""},
      {descriptionKey: clean(tr("features", f.index, "description", f.description)), tags: [`classe-${cls}`]});
  }
  for (const t of srd("Traits")) D(apt(t.index), "aptitude", tr("traits", t.index, "name", t.name), {espece: t.species?.[0]?.index ?? ""}, {descriptionKey: clean(tr("traits", t.index, "description", t.description)), tags: ["espece"]});
  for (const s of srd("Subclasses")) D(slug(tr("misc.Subclasses", s.index, "name", s.name)), "sous-classe", tr("misc.Subclasses", s.index, "name", s.name), {classe: CLASS_IDS[s.class.index]}, {descriptionKey: clean(tr("misc.Subclasses", s.index, "description", s.description))});
  for (const cls of Object.values(CLASS_IDS)) add("tags", {id: `classe-${cls}`, nameKey: NAME(cls), descriptionKey: "", color: null});
  add("tags", {id: "espece", nameKey: "Espèce", descriptionKey: "", color: null});
  for (const [id, nameKey, descriptionKey] of [["ordre-protecteur", "Ordre divin : Protecteur", "Maîtrise des armes de guerre et des armures lourdes."], ["ordre-thaumaturge", "Ordre divin : Thaumaturge", "Un sort mineur de clerc de plus ; + modificateur de Sagesse (au moins +1) aux tests d'Intelligence (Arcanes ou Religion)."],
    ["ordre-magicien", "Ordre primitif : Magicien", "Un sort mineur de druide de plus ; + modificateur de Sagesse (au moins +1) aux tests d'Intelligence (Arcanes ou Nature)."], ["ordre-gardien", "Ordre primitif : Gardien", "Maîtrise des armes de guerre et des armures intermédiaires."]])
    D(id, "option-de-classe", nameKey, {}, {descriptionKey});
  // Spells prepared and cantrips known, per caster class.
  for (const c of srd("Classes")) {
    const id = CLASS_IDS[c.index], levels = levelsOf(c.index).filter(l => l.spellcasting);
    if (!levels.length) continue;
    for (const [key, field, label] of [["sorts-prepares", "prepared_spells", "Sorts préparés"], ["sorts-mineurs", "cantrips_known", "Sorts mineurs connus"]]) {
      const table = Object.fromEntries(levels.map(l => [l.level, l.spellcasting[field] ?? 0]));
      if (!Object.values(table).some(Boolean)) continue;
      D(`${key}-${id}`, "valeur-derivee", `${label} (${NAME(id)})`, {}, {descriptionKey: `Selon le niveau de ${NAME(id).toLowerCase()}.`});
      DERIVE(`${key}-${id}`, lookup(level(id), table, 0));
    }
  }
}

/* ---------- Class features in play ---------- */
const resource = (id, nameKey, maximum, descriptionKey, short, long = ["max"]) => {
  F(`${id}-maximum`, `${nameKey} (maximum)`, maximum);
  POOL(id, "ressource", nameKey, `${id}-maximum`, {}, {descriptionKey});
  if (short) PIECES.reposCourt.push([id, ...short]);
  if (long) PIECES.reposLong.push([id, ...long]);
};
const spend = (id, poolId, amount = 1) => E(id, `Dépense : ${get("definitions", poolId).nameKey}`, pool(poolId), "subtract", typeof amount === "number" ? {kind: "literal", value: amount} : {kind: "formula", id: amount}, "self");
const has = (poolId, amount = 1) => gte(ref(pool(poolId)), typeof amount === "number" ? lit(amount) : amount);
const statut = (id, nameKey, descriptionKey) => D(id, "statut", nameKey, {immunite: ""}, {descriptionKey});
const CLASS_ACTIONS = Object.fromEntries(Object.values(CLASS_IDS).map(id => [id, []]));
const classAction = (cls, id, nameKey, more) => { A(id, nameKey, more); CLASS_ACTIONS[cls].push(id); return id; };

export function classFeatures() {
  const wis = value("mod-sagesse"), cha = value("mod-charisme"), con = value("mod-constitution"), dex = value("mod-dexterite");
  KF("peut-agir", "Peut agir", and(not(incap()), not(holds("mort"))));
  F("si-armure-portee", "Porte une armure", gt(sum(agg("caLegere"), agg("caIntermediaire"), agg("caLourde")), lit(0)), "", "boolean");
  F("si-armure-lourde-portee", "Porte une armure lourde", gt(agg("caLourde"), lit(0)), "", "boolean");
  F("si-bouclier-porte", "Porte un bouclier", gt(agg("caBouclier"), lit(0)), "", "boolean");
  // Unarmored Defense, Draconic Resilience, Mage Armor: other ways to compute AC without armor.
  PIECES.caSansArmure.push(iff(holds(apt("barbarian-unarmored-defense")), sum(lit(10), dex, con), lit(0)),
    iff(and(holds(apt("monk-unarmored-defense")), not(fx("si-bouclier-porte"))), sum(lit(10), dex, wis), lit(0)),
    iff(holds(apt("draconic-sorcery-draconic-resilience")), sum(lit(10), dex, cha), lit(0)), iff(holds("armure-de-mage"), sum(lit(13), dex), lit(0)));
  PIECES.pvMaximum.push(iff(holds(apt("draconic-sorcery-draconic-resilience")), level("ensorceleur"), lit(0)));
  PIECES.vitesse.push(iff(and(gte(level("barbare"), lit(5)), not(fx("si-armure-lourde-portee"))), lit(3), lit(0)),
    iff(and(not(fx("si-armure-portee")), not(fx("si-bouclier-porte"))), lookup(level("moine"), Object.fromEntries(Object.entries(tableOf("monk", "unarmored_movement_bonus")).map(([k, v]) => [k, ft(v)])), 0), lit(0)));
  DERIVE("seuil-critique", iff(holds(apt("champion-superior-critical")), lit(18), iff(holds(apt("champion-improved-critical")), lit(19), lit(20))), "20 ; 19 avec Critique amélioré, 18 avec Critique supérieur (champion).");
  // Evasion: a Dexterity save for half damage deals none on a success and half on a failure. Potent Cantrip: a cantrip deals half on a success.
  const evasion = and(or(holds(apt("rogue-evasion"), "target"), holds(apt("monk-evasion"), "target")), not(incap("target")), eq(cf("sauvegarde", ""), lit("dexterite")), cf("moitie", false));
  F("si-esquive-totale", "Dérobade", evasion, "", "boolean");
  const half = get("formulas", "facteur-degats-moitie");
  half.expression = iff(fx("si-esquive-totale"), lit(0), iff(or(cf("moitie", false), and(holds(apt("evoker-potent-cantrip")), eq(cf("niveau", -1), lit(0)))), mul(lit(0.5), fx("facteur-degats")), lit(0)));
  F("facteur-degats-effet", "Dégâts de l'effet sur un échec", iff(fx("si-esquive-totale"), mul(lit(0.5), fx("facteur-degats")), fx("facteur-degats")), "Toute la résistance de la cible ; la moitié avec la Dérobade.");
  get("effects", "degats-effet").operand.factorFormulaRef = "facteur-degats-effet";

  /* ---------- Barbarian ---------- */
  resource("rage", "Rages", lookup(level("barbare"), tableOf("barbarian", "rage_count"), 0), "Utilisations de la Rage : une récupérée au repos court, toutes au repos long.", ["add", lit(1)]);
  K("peut-entrer-en-rage", "Peut entrer en rage", and(is("peut-agir"), has("rage"), not(holds("rage-active")), not(fx("si-armure-lourde-portee"))), "Il reste une Rage et le barbare ne porte pas d'armure lourde.");
  spend("depenser-rage", "rage");
  classAction("barbare", "entrer-en-rage", "Entrer en rage", {conditionRefs: ["peut-entrer-en-rage"], costEffectRefs: ["depenser-rage"], stateApplications: [stateApply("rage-active", "self", {durationRef: "dix-minutes"})], stateRemovals: [stateRemove("concentration", "self")],
    descriptionKey: "Action Bonus. Résistance aux dégâts contondants, perforants et tranchants, bonus de dégâts de rage, Avantage aux tests et sauvegardes de Force ; pas de sort ni de concentration. Jusqu'à 10 minutes."});
  classAction("barbare", "terminer-la-rage", "Terminer la rage", {stateRemovals: [stateRemove("rage-active", "self")]});
  K("peut-attaquer-temerairement", "Attaque téméraire", holds(apt("barbarian-reckless-attack")));
  classAction("barbare", "attaque-temeraire", "Attaque téméraire", {conditionRefs: ["peut-attaquer-temerairement"], stateApplications: [stateApply("attaque-temeraire", "self", {durationRef: "un-round"})], descriptionKey: "Avantage aux attaques de Force ce tour-ci ; les attaques contre le barbare ont l'Avantage jusqu'à son prochain tour."});

  /* ---------- Bard ---------- */
  resource("inspiration-bardique", "Inspiration bardique", iff(gt(level("barde"), lit(0)), max(lit(1), cha), lit(0)), "Autant d'utilisations que le modificateur de Charisme (au moins 1) ; récupérées au repos long, ou au repos court dès le niveau 5 (Source d'inspiration).", ["max", gte(level("barde"), lit(5))]);
  FR("de-d-inspiration-bardique", "Dé d'Inspiration bardique", range(level("barde"), [{max: 4, value: "inspiration-d6"}, {max: 9, value: "inspiration-d8"}, {max: 14, value: "inspiration-d10"}, {value: "inspiration-d12"}]), "d6, d8 au niveau 5, d10 au 10, d12 au 15.");
  K("peut-inspirer", "Peut inspirer", and(is("peut-agir"), holds(apt("bard-bardic-inspiration")), has("inspiration-bardique")));
  spend("depenser-inspiration-bardique", "inspiration-bardique");
  classAction("barde", "inspiration-bardique", "Inspiration bardique", {conditionRefs: ["peut-inspirer"], costEffectRefs: ["depenser-inspiration-bardique"], stateApplications: [stateApplyF("de-d-inspiration-bardique", "target", {durationRef: "une-heure"})],
    descriptionKey: "Action Bonus : une autre créature à 18 m reçoit un dé d'Inspiration bardique, à ajouter à un test de d20 dans l'heure (case « Ajouter un dé d'Inspiration bardique »)."});

  /* ---------- Cleric ---------- */
  resource("conduit-divin", "Conduit divin", sum(lookup(level("clerc"), tableOf("cleric", "channel_divinity_charges"), 0), lookup(level("paladin"), tableOf("paladin", "channel_divinity_charges"), 0)), "Utilisations de Conduit divin (clerc et paladin) : une récupérée au repos court, toutes au repos long.", ["add", lit(1)]);
  K("peut-conduire", "Conduit divin disponible", and(is("peut-agir"), has("conduit-divin")));
  spend("depenser-conduit-divin", "conduit-divin");
  const spark = [[18, 4], [13, 3], [7, 2], [1, 1]];
  for (const [lvl, dice] of spark) K(`etincelle-${dice}d8`, `Étincelle divine ${dice}d8`, gte(level("clerc"), lit(lvl)));
  R("etincelle-divine", "Étincelle divine", "1d8", spark.map(([, dice]) => ({conditionRef: `etincelle-${dice}d8`, formula: `${dice}d8`})), "1d8, 2d8 au niveau 7, 3d8 au 13, 4d8 au 18.");
  E("etincelle-soins", "Étincelle divine (soins)", pool("pv"), "add", {kind: "roll", rollRef: "etincelle-divine", bonusFormulaRef: "modificateur-de-sagesse", minimum: 0}, "target");
  F("modificateur-de-sagesse", "Modificateur de Sagesse", wis);
  K("etincelle-possible", "Étincelle divine", and(is("peut-agir"), holds(apt("cleric-channel-divinity")), has("conduit-divin")));
  classAction("clerc", "etincelle-divine-soins", "Étincelle divine : soigner", {conditionRefs: ["etincelle-possible"], costEffectRefs: ["depenser-conduit-divin"], effectRefs: ["etincelle-soins", "reussites-a-zero", "echecs-a-zero"], stateRemovals: export_heal.removals,
    descriptionKey: "Conduit divin : une créature à 9 m récupère 1d8 + modificateur de Sagesse points de vie (plus de dés aux niveaux 7, 13 et 18)."});
  F("facteur-radiant", "Résistance aux dégâts radiants", damageFactor(lit("radiant")));
  F("facteur-radiant-moitie", "Moitié des dégâts radiants", mul(lit(0.5), damageFactor(lit("radiant"))));
  E("etincelle-degats", "Étincelle divine (dégâts)", base("degats-a-appliquer"), "add", {kind: "roll", rollRef: "etincelle-divine", bonusFormulaRef: "modificateur-de-sagesse", factorFormulaRef: "facteur-radiant", minimum: 0}, "target");
  E("etincelle-degats-moitie", "Étincelle divine (moitié)", base("degats-a-appliquer"), "add", {kind: "roll", rollRef: "etincelle-divine", bonusFormulaRef: "modificateur-de-sagesse", factorFormulaRef: "facteur-radiant-moitie", minimum: 0}, "target");
  classAction("clerc", "etincelle-divine-degats", "Étincelle divine : blesser", {conditionRefs: ["etincelle-possible"], costEffectRefs: ["depenser-conduit-divin"], testRef: "dd-sort-constitution", outcomeMappings: [
    {outcomeId: "sauvegarde-ratee", effectRefs: ["degats-reinitialises", "etincelle-degats"], actionRefs: SUITE}, {outcomeId: "sauvegarde-reussie", effectRefs: ["degats-reinitialises", "etincelle-degats-moitie"], actionRefs: SUITE}],
    descriptionKey: "Conduit divin : sauvegarde de Constitution contre le DD des sorts ; dégâts radiants (ou nécrotiques) égaux aux soins, la moitié sur une réussite."});
  A("subir-le-renvoi", "Renvoyé", {stateApplications: [stateApply("effraye", "target", {durationRef: "une-minute"}), stateApply("neutralise", "target", {durationRef: "une-minute"})]});
  classAction("clerc", "renvoi-des-morts-vivants", "Renvoi des morts-vivants", {conditionRefs: ["etincelle-possible"], costEffectRefs: ["depenser-conduit-divin"], targeting: "each", testRef: "dd-sort-sagesse", outcomeMappings: [{outcomeId: "sauvegarde-ratee", actionRefs: ["subir-le-renvoi"]}],
    descriptionKey: "Conduit divin : chaque mort-vivant à 9 m fait une sauvegarde de Sagesse ; en cas d'échec il est Effrayé et Neutralisé pendant 1 minute (ou jusqu'à subir des dégâts)."});
  // Life Domain: Preserve Life heals up to half the target's Hit Point maximum.
  F("preservation-de-la-vie", "Préserver la vie", max(lit(0), min(input("montant"), sub(floor({type: "divide", args: [value("pv-maximum", "target"), lit(2)]}), ref(pool("pv"), "target")))));
  E("preservation-soins", "Préserver la vie", pool("pv"), "add", {kind: "formula", id: "preservation-de-la-vie"}, "target");
  K("preservation-possible", "Préserver la vie", and(is("peut-agir"), holds(apt("life-preserve-life")), has("conduit-divin")));
  classAction("clerc", "preserver-la-vie", "Préserver la vie", {inputs: [{id: "montant", labelKey: "Points de vie pour cette cible", valueType: "integer", required: true, defaultValue: 5}], targeting: "each", conditionRefs: ["preservation-possible"], costEffectRefs: ["depenser-conduit-divin"], effectRefs: ["preservation-soins"], stateRemovals: export_heal.removals,
    descriptionKey: "Conduit divin : répartissez 5 × niveau de clerc points de vie entre les créatures Ensanglantées à 9 m, sans dépasser la moitié de leur maximum."});

  /* ---------- Druid ---------- */
  resource("forme-sauvage", "Forme sauvage", lookup(level("druide"), tableOf("druid", "wild_shape_uses"), 0), "Utilisations de la Forme sauvage : une récupérée au repos court, toutes au repos long.", ["add", lit(1)]);
  statut("forme-sauvage-active", "En forme sauvage", "Le druide a pris la forme d'une bête (le MJ utilise son bloc de statistiques pour la Vitesse, la CA et les attaques).");
  K("peut-changer-de-forme", "Forme sauvage", and(is("peut-agir"), has("forme-sauvage"), not(holds("forme-sauvage-active"))));
  spend("depenser-forme-sauvage", "forme-sauvage");
  F("pv-temporaires-forme-sauvage", "Points de vie temporaires de la forme sauvage", max(ref(pool("pv-temporaires")), level("druide")));
  E("pv-forme-sauvage", "Points de vie temporaires (forme sauvage)", pool("pv-temporaires"), "set", {kind: "formula", id: "pv-temporaires-forme-sauvage"}, "self");
  classAction("druide", "forme-sauvage", "Forme sauvage", {conditionRefs: ["peut-changer-de-forme"], costEffectRefs: ["depenser-forme-sauvage"], effectRefs: ["pv-forme-sauvage"], stateApplications: [stateApply("forme-sauvage-active", "self")],
    descriptionKey: "Action Bonus : prendre la forme d'une bête connue, pour la moitié du niveau de druide en heures ; points de vie temporaires égaux au niveau de druide."});
  classAction("druide", "quitter-la-forme-sauvage", "Quitter la forme sauvage", {stateRemovals: [stateRemove("forme-sauvage-active", "self")]});

  /* ---------- Fighter ---------- */
  resource("second-souffle", "Second souffle", lookup(level("guerrier"), tableOf("fighter", "second_wind_uses"), 0), "Une utilisation récupérée au repos court, toutes au repos long.", ["add", lit(1)]);
  R("second-souffle", "Second souffle", "1d10"); F("niveau-de-guerrier", "Niveau de guerrier", level("guerrier"));
  E("soins-second-souffle", "Second souffle", pool("pv"), "add", {kind: "roll", rollRef: "second-souffle", bonusFormulaRef: "niveau-de-guerrier", minimum: 0}, "self");
  spend("depenser-second-souffle", "second-souffle");
  K("peut-reprendre-son-souffle", "Second souffle", and(is("peut-agir"), has("second-souffle")));
  classAction("guerrier", "second-souffle", "Second souffle", {conditionRefs: ["peut-reprendre-son-souffle"], costEffectRefs: ["depenser-second-souffle"], effectRefs: ["soins-second-souffle"], descriptionKey: "Action Bonus : récupérer 1d10 + niveau de guerrier points de vie."});
  resource("fougue", "Fougue", range(level("guerrier"), [{max: 1, value: 0}, {max: 16, value: 1}, {value: 2}]), "Une action de plus ce tour-ci ; récupérée au repos court.", ["max"]);
  spend("depenser-fougue", "fougue");
  K("peut-se-surpasser", "Fougue", and(is("peut-agir"), has("fougue")));
  classAction("guerrier", "fougue", "Fougue", {conditionRefs: ["peut-se-surpasser"], costEffectRefs: ["depenser-fougue"], descriptionKey: "Une action de plus ce tour-ci (pas l'action Magie). Deux utilisations au niveau 17, une seule par tour."});
  resource("inflexible", "Inflexible", range(level("guerrier"), [{max: 8, value: 0}, {max: 12, value: 1}, {max: 16, value: 2}, {value: 3}]), "Relancer une sauvegarde ratée ; récupéré au repos long.");
  spend("depenser-inflexible", "inflexible");
  K("peut-resister", "Inflexible", has("inflexible"));
  classAction("guerrier", "inflexible", "Inflexible", {conditionRefs: ["peut-resister"], costEffectRefs: ["depenser-inflexible"], reroll: {actionRefs: [], keepDice: false, dice: null}, descriptionKey: "Relance une sauvegarde ratée ; ajoutez le niveau de guerrier au nouveau jet, qui doit être gardé."});
  // Champion: Heroic Warrior (Heroic Inspiration at the start of each turn) and Survivor (5 + Con HP while Bloodied).
  K("guerrier-heroique", "Guerrier héroïque", and(holds(apt("champion-heroic-warrior")), not(holds("inspiration-heroique"))));
  A("recevoir-inspiration-heroique", "Guerrier héroïque", {conditionRefs: ["guerrier-heroique"], stateApplications: [stateApply("inspiration-heroique", "self")]});
  TRIG("guerrier-heroique", "Guerrier héroïque", "rta.combat.turn", ["recevoir-inspiration-heroique"], {conditionRefs: ["guerrier-heroique"], descriptionKey: "Champion de niveau 10 : l'Inspiration héroïque au début de chaque tour s'il ne l'a pas."});
  K("survivant", "Survivant", and(holds(apt("champion-survivor")), gt(ref(pool("pv")), lit(0)), lt(mul(ref(pool("pv")), lit(2)), value("pv-maximum")), not(holds("mort"))));
  F("soins-survivant", "Survivant", sum(lit(5), con));
  E("soins-survivant", "Survivant", pool("pv"), "add", {kind: "formula", id: "soins-survivant"}, "self");
  A("survivant", "Survivant", {conditionRefs: ["survivant"], effectRefs: ["soins-survivant"]});
  TRIG("survivant", "Survivant", "rta.combat.turn", ["survivant"], {conditionRefs: ["survivant"], descriptionKey: "Champion de niveau 18 : Ensanglanté avec au moins 1 point de vie, il récupère 5 + modificateur de Constitution points de vie au début de son tour."});

  /* ---------- Monk ---------- */
  resource("points-de-focalisation", "Points de focalisation", lookup(level("moine"), tableOf("monk", "focus_points"), 0), "Points de focalisation (égaux au niveau de moine dès le niveau 2) ; tous récupérés au repos court ou long.", ["max"]);
  spend("depenser-focalisation", "points-de-focalisation");
  K("focalisation-disponible", "Focalisation", and(is("peut-agir"), has("points-de-focalisation")));
  classAction("moine", "deluge-de-coups", "Déluge de coups", {conditionRefs: ["focalisation-disponible"], costEffectRefs: ["depenser-focalisation"], descriptionKey: "1 point de focalisation, Action Bonus : deux frappes à mains nues (trois au niveau 10)."});
  classAction("moine", "defense-patiente", "Défense patiente", {conditionRefs: ["focalisation-disponible"], costEffectRefs: ["depenser-focalisation"], stateApplications: ["esquive", "desengage"].map(s => stateApply(s, "self", {durationRef: "un-round"})), descriptionKey: "1 point de focalisation, Action Bonus : Se désengager et Esquiver."});
  classAction("moine", "pas-du-vent", "Pas du vent", {conditionRefs: ["focalisation-disponible"], costEffectRefs: ["depenser-focalisation"], stateApplications: ["foncer", "desengage"].map(s => stateApply(s, "self", {durationRef: "un-round"})), descriptionKey: "1 point de focalisation, Action Bonus : Se désengager et Foncer ; distance de saut doublée."});
  F("dd-moine", "DD des aptitudes de moine", sum(lit(8), wis, PB), "8 + modificateur de Sagesse + bonus de maîtrise.");
  T("frappe-etourdissante", "Frappe étourdissante", {totalFormulaRef: "dd-moine", opposedTestRef: "contre-constitution", outcomeRefs: ["sauvegarde-ratee-automatique", "sauvegarde-ratee"], fallbackOutcomeRef: "sauvegarde-reussie"});
  A("etre-etourdi", "Étourdi", {stateApplications: [stateApply("etourdi", "target", {durationRef: "un-round"})]});
  K("frappe-etourdissante-possible", "Frappe étourdissante", and(holds(apt("monk-stunning-strike")), has("points-de-focalisation")));
  classAction("moine", "frappe-etourdissante", "Frappe étourdissante", {conditionRefs: ["frappe-etourdissante-possible"], costEffectRefs: ["depenser-focalisation"], testRef: "frappe-etourdissante", outcomeMappings: [{outcomeId: "sauvegarde-ratee", actionRefs: ["etre-etourdi"]}],
    descriptionKey: "Après avoir touché : 1 point de focalisation ; la cible réussit une sauvegarde de Constitution ou est Étourdie jusqu'au début du prochain tour du moine (sinon sa Vitesse est réduite de moitié et la prochaine attaque contre elle a l'Avantage)."});
  resource("metabolisme-surnaturel", "Métabolisme surnaturel", iff(gte(level("moine"), lit(2)), lit(1), lit(0)), "Une fois par repos long.");
  spend("depenser-metabolisme", "metabolisme-surnaturel");
  E("focalisation-recuperee", "Focalisation récupérée", pool("points-de-focalisation"), "set", {kind: "formula", id: "points-de-focalisation-maximum"}, "self");
  R("metabolisme", "Métabolisme surnaturel", "1d6", [12, 10, 8, 6].map(faces => ({conditionRef: `arts-martiaux-d${faces}`, formula: `1d${faces}`})));
  F("niveau-de-moine", "Niveau de moine", level("moine"));
  E("soins-metabolisme", "Métabolisme surnaturel", pool("pv"), "add", {kind: "roll", rollRef: "metabolisme", bonusFormulaRef: "niveau-de-moine", minimum: 0}, "self");
  K("metabolisme-possible", "Métabolisme surnaturel", has("metabolisme-surnaturel"));
  classAction("moine", "metabolisme-surnaturel", "Métabolisme surnaturel", {conditionRefs: ["metabolisme-possible"], costEffectRefs: ["depenser-metabolisme"], effectRefs: ["focalisation-recuperee", "soins-metabolisme"], descriptionKey: "En jetant l'initiative : tous les points de focalisation reviennent et le moine récupère un dé d'Arts martiaux + son niveau de moine en points de vie."});

  /* ---------- Paladin ---------- */
  resource("imposition-des-mains", "Imposition des mains", mul(lit(5), level("paladin")), "Réserve de 5 × niveau de paladin points de vie ; remplie au repos long.");
  F("montant-impose", "Points de la réserve", input("montant"));
  E("depenser-imposition", "Dépense : Imposition des mains", pool("imposition-des-mains"), "subtract", {kind: "formula", id: "montant-impose"}, "self");
  E("soins-imposition", "Imposition des mains", pool("pv"), "add", {kind: "formula", id: "montant-impose"}, "target");
  K("imposition-possible", "Imposition des mains", and(is("peut-agir"), gt(input("montant"), lit(0)), has("imposition-des-mains", input("montant"))));
  classAction("paladin", "imposition-des-mains", "Imposition des mains", {inputs: [{id: "montant", labelKey: "Points de vie rendus", valueType: "integer", required: true, defaultValue: 5}], conditionRefs: ["imposition-possible"], costEffectRefs: ["depenser-imposition"], effectRefs: ["soins-imposition", "reussites-a-zero", "echecs-a-zero"], stateRemovals: export_heal.removals,
    descriptionKey: "Action Bonus : rendre des points de vie pris dans la réserve (5 points retirent aussi l'état Empoisonné)."});
  statut("arme-sacree", "Arme sacrée", "+ modificateur de Charisme (au moins +1) aux jets d'attaque avec l'arme ; elle émet de la lumière. 10 minutes.");
  get("formulas", "bonus-attaque-arme").expression.args[0].args.push(iff(holds("arme-sacree"), max(lit(1), cha), lit(0)));
  K("arme-sacree-possible", "Arme sacrée", and(is("peut-agir"), holds(apt("devotion-sacred-weapon")), has("conduit-divin")));
  classAction("paladin", "arme-sacree", "Arme sacrée", {conditionRefs: ["arme-sacree-possible"], costEffectRefs: ["depenser-conduit-divin"], stateApplications: [stateApply("arme-sacree", "self", {durationRef: "dix-minutes"})], descriptionKey: "Conduit divin (Serment de dévotion) : pendant 10 minutes, + modificateur de Charisme aux attaques avec l'arme tenue."});

  /* ---------- Ranger ---------- */
  resource("ennemi-jure", "Ennemi juré", lookup(level("rodeur"), tableOf("ranger", "favored_enemies"), 0), "Lancers gratuits de Marque du chasseur ; récupérés au repos long.");
  spend("depenser-ennemi-jure", "ennemi-jure");
  K("ennemi-jure-possible", "Ennemi juré", and(is("peut-agir"), has("ennemi-jure"), not(holds("rage-active"))));
  classAction("rodeur", "ennemi-jure", "Ennemi juré (Marque du chasseur)", {conditionRefs: ["ennemi-jure-possible"], costEffectRefs: ["depenser-ennemi-jure"], stateApplications: [stateApply("marque-du-chasseur"), stateApply("concentration", "self")],
    descriptionKey: "Lance Marque du chasseur sans emplacement de sort : 1d6 dégâts de force de plus à chaque coup contre la cible, avec concentration."});
  D("tueur-de-colosses-utilise", "statut", "Tueur de colosses utilisé ce tour", {immunite: ""});
  extraDamage("tueur-de-colosses", "Tueur de colosses", and(holds(apt("hunter-hunters-prey")), lt(ref(pool("pv"), "target"), value("pv-maximum", "target")), not(holds("tueur-de-colosses-utilise"))), "1d8", null,
    "Chasseur (Proie du chasseur) : une fois par tour, 1d8 dégâts de plus à une cible qui n'a pas tous ses points de vie.");
  get("actions", "tueur-de-colosses").stateApplications = [stateApply("tueur-de-colosses-utilise", "self", {durationRef: "un-round"})];
  get("actions", "debut-de-tour").stateRemovals.push(stateRemove("tueur-de-colosses-utilise", "self"));

  /* ---------- Rogue ---------- */
  statut("visee-stable", "Visée stable", "Avantage au prochain jet d'attaque de ce tour ; Vitesse 0 jusqu'à la fin du tour.");
  get("formulas", "si-avantage-attaque-brut").expression.args.push(holds("visee-stable"));
  get("actions", "attaquer-avec-l-arme").stateRemovals.push(stateRemove("visee-stable", "self"));
  K("visee-stable-possible", "Visée stable", and(is("peut-agir"), holds(apt("rogue-steady-aim"))));
  classAction("roublard", "visee-stable", "Visée stable", {conditionRefs: ["visee-stable-possible"], stateApplications: [stateApply("visee-stable", "self", {durationRef: "un-round"})], descriptionKey: "Action Bonus, sans s'être déplacé : Avantage au prochain jet d'attaque du tour."});

  /* ---------- Sorcerer ---------- */
  resource("points-de-sorcellerie", "Points de sorcellerie", lookup(level("ensorceleur"), tableOf("sorcerer", "sorcery_points"), 0), "Points de sorcellerie ; tous récupérés au repos long.");
  resource("sorcellerie-innee", "Sorcellerie innée", iff(gt(level("ensorceleur"), lit(0)), lit(2), lit(0)), "Deux utilisations par repos long.");
  statut("sorcellerie-innee-active", "Sorcellerie innée", "Pendant 1 minute : +1 au DD des sorts d'ensorceleur et Avantage aux jets d'attaque de sort.");
  const dc = get("formulas", "calcul-dd-sorts").expression; dc.then.args.push(iff(holds("sorcellerie-innee-active"), lit(1), lit(0)));
  get("formulas", "si-avantage-attaque-brut").expression.args.push(and(holds("sorcellerie-innee-active"), cf("attaque", false)));
  spend("depenser-sorcellerie-innee", "sorcellerie-innee");
  K("sorcellerie-innee-possible", "Sorcellerie innée", and(is("peut-agir"), has("sorcellerie-innee")));
  classAction("ensorceleur", "sorcellerie-innee", "Sorcellerie innée", {conditionRefs: ["sorcellerie-innee-possible"], costEffectRefs: ["depenser-sorcellerie-innee"], stateApplications: [stateApply("sorcellerie-innee-active", "self", {durationRef: "une-minute"})], descriptionKey: "Action Bonus : pendant 1 minute, +1 au DD des sorts et Avantage aux attaques de sort."});
  const SLOT_LEVEL = {id: "niveau", labelKey: "Niveau de l'emplacement", valueType: "integer", required: true, defaultValue: 1, options: [1, 2, 3, 4, 5].map(n => ({value: n, labelKey: `Niveau ${n}`}))};
  F("cout-emplacement-cree", "Coût de l'emplacement", lookup(input("niveau"), {1: 2, 2: 3, 3: 5, 4: 6, 5: 7}, 99), "2, 3, 5, 6 ou 7 points pour un emplacement de niveau 1 à 5.");
  FR("emplacement-cree", "Emplacement créé", lookup(input("niveau"), {1: "emplacements-1", 2: "emplacements-2", 3: "emplacements-3", 4: "emplacements-4", 5: "emplacements-5"}, "emplacements-1"));
  spend("depenser-points-sorcellerie", "points-de-sorcellerie", "cout-emplacement-cree");
  E("ajouter-emplacement", "Emplacement de sort", pool("emplacements-1"), "add", {kind: "literal", value: 1}, "self", "", {targetDefinitionFormulaRef: "emplacement-cree"});
  K("creation-emplacement-possible", "Créer un emplacement", and(holds(apt("sorcerer-font-of-magic")), has("points-de-sorcellerie", fx("cout-emplacement-cree"))));
  classAction("ensorceleur", "creer-un-emplacement", "Créer un emplacement de sort", {inputs: [SLOT_LEVEL], conditionRefs: ["creation-emplacement-possible"], costEffectRefs: ["depenser-points-sorcellerie"], effectRefs: ["ajouter-emplacement"], descriptionKey: "Action Bonus : dépenser des points de sorcellerie pour un emplacement (il disparaît au repos long s'il dépasse le maximum)."});
  E("rendre-emplacement", "Emplacement converti", pool("emplacements-1"), "subtract", {kind: "literal", value: 1}, "self", "", {targetDefinitionFormulaRef: "emplacement-choisi"});
  E("gagner-points-sorcellerie", "Points de sorcellerie gagnés", pool("points-de-sorcellerie"), "add", {kind: "formula", id: "niveau-de-l-emplacement"}, "self");
  K("conversion-possible", "Convertir un emplacement", and(holds(apt("sorcerer-font-of-magic")), gt({type: "definitionValue", definition: input("emplacement"), capabilityId: "pool", slotId: "points", outputId: "pool.current"}, lit(0))));
  classAction("ensorceleur", "convertir-un-emplacement", "Convertir un emplacement en points", {inputs: [{id: "emplacement", labelKey: "Emplacement de sort", valueType: "reference", definitionTypeId: "emplacement-de-sort", from: "held", required: true, defaultValue: "emplacements-1"}], conditionRefs: ["conversion-possible"], effectRefs: ["rendre-emplacement", "gagner-points-sorcellerie"], descriptionKey: "Dépenser un emplacement pour autant de points de sorcellerie que son niveau."});

  /* ---------- Warlock ---------- */
  resource("astuce-magique", "Astuce magique", iff(gte(level("occultiste"), lit(2)), lit(1), lit(0)), "Une fois par repos long.");
  spend("depenser-astuce-magique", "astuce-magique");
  F("emplacements-pacte-moitie", "La moitié des emplacements de pacte", ceil({type: "divide", args: [fx("emplacements-pacte-maximum"), lit(2)]}));
  E("emplacements-pacte-recuperes", "Emplacements de pacte récupérés", pool("emplacements-pacte"), "add", {kind: "formula", id: "emplacements-pacte-moitie"}, "self");
  K("astuce-possible", "Astuce magique", has("astuce-magique"));
  classAction("occultiste", "astuce-magique", "Astuce magique", {conditionRefs: ["astuce-possible"], costEffectRefs: ["depenser-astuce-magique"], effectRefs: ["emplacements-pacte-recuperes"], descriptionKey: "Rite d'une minute : récupère la moitié (arrondie au supérieur) des emplacements de pacte."});
  F("pv-temporaires-tenebreux", "Bénédiction du Ténébreux", max(ref(pool("pv-temporaires")), sum(cha, level("occultiste"))));
  E("pv-tenebreux", "Bénédiction du Ténébreux", pool("pv-temporaires"), "set", {kind: "formula", id: "pv-temporaires-tenebreux"}, "self");
  K("benediction-du-tenebreux", "Bénédiction du Ténébreux", holds(apt("fiend-patron-dark-ones-blessing")));
  classAction("occultiste", "benediction-du-tenebreux", "Bénédiction du Ténébreux", {conditionRefs: ["benediction-du-tenebreux"], effectRefs: ["pv-tenebreux"], descriptionKey: "Quand un ennemi tombe à 0 point de vie : points de vie temporaires égaux au modificateur de Charisme + niveau d'occultiste."});

  /* ---------- Wizard ---------- */
  resource("restauration-arcanique", "Restauration arcanique", iff(gt(level("magicien"), lit(0)), ceil({type: "divide", args: [level("magicien"), lit(2)]}), lit(0)), "Niveaux d'emplacements récupérables au repos court (moitié du niveau de magicien, arrondie au supérieur) ; une fois par repos long.");
  spend("depenser-restauration", "restauration-arcanique", "niveau-de-l-emplacement");
  E("emplacement-restaure", "Emplacement récupéré", pool("emplacements-1"), "add", {kind: "literal", value: 1}, "self", "", {targetDefinitionFormulaRef: "emplacement-choisi"});
  K("restauration-possible", "Restauration arcanique", and(holds(apt("wizard-arcane-recovery")), neq(inputId("emplacement"), lit("emplacements-pacte")), lte(fx("niveau-de-l-emplacement"), lit(5)), has("restauration-arcanique", fx("niveau-de-l-emplacement"))));
  classAction("magicien", "restauration-arcanique", "Restauration arcanique", {inputs: [{id: "emplacement", labelKey: "Emplacement à récupérer", valueType: "reference", definitionTypeId: "emplacement-de-sort", from: "held", required: true, defaultValue: "emplacements-1"}], conditionRefs: ["restauration-possible"], costEffectRefs: ["depenser-restauration"], effectRefs: ["emplacement-restaure"],
    descriptionKey: "Après un repos court : récupérer des emplacements (niveau 5 au plus) dont la somme des niveaux ne dépasse pas la moitié du niveau de magicien."});

  progression();
  classItems();
}

/* ---------- Level up, and the choices of each level ---------- */
function progression() {
  const advance = ctx("variables.advance.current");
  K("peut-prendre-un-niveau", "Peut prendre un niveau", and(gte(advance, lit(1)), lt(value("niveau-total"), lit(20)), or(eq({type: "parameter", id: "progression-par-experience"}, lit(0)), lt(value("niveau-total"), value("niveau-par-xp")))),
    "Une classe déjà prise (une nouvelle classe s'ajoute avec son objet « multiclasse »), sous le niveau 20 et le niveau permis par l'expérience.");
  F("cout-d-un-niveau", "Coût d'un niveau", lit(0), "Prendre un niveau ne dépense pas l'expérience.");
  // Choices: ability score improvement or a feat, Expertise, a Fighting Style, Divine and Primal Order, Lore's skills.
  const ab = (id, labelKey, defaultValue) => ({id, labelKey, valueType: "reference", definitionTypeId: "caracteristique", from: "all", required: true, defaultValue});
  const skill = (id, labelKey, defaultValue) => ({id, labelKey, valueType: "reference", definitionTypeId: "competence", from: "all", required: true, defaultValue});
  FR("don-choisi", "Don choisi", inputId("don"));
  FR("carac1-choisie", "Première caractéristique", inputId("carac1")); FR("carac2-choisie", "Seconde caractéristique", inputId("carac2"));
  const gain = defField(input("don"), "augmentation"), cap = defField(input("don"), "plafond");
  F("hausse-carac1", "+1 à la première caractéristique", iff(and(neq(gain, lit("aucune")), lt(defVal(input("carac1")), cap)), lit(1), lit(0)));
  F("hausse-carac2", "+1 à la seconde caractéristique", iff(and(eq(gain, lit("deux")), lt(defVal(input("carac2")), cap)), lit(1), lit(0)));
  E("augmenter-carac1", "Augmentation de caractéristique", base("force"), "add", {kind: "formula", id: "hausse-carac1"}, "self", "", {targetDefinitionFormulaRef: "carac1-choisie"});
  E("augmenter-carac2", "Augmentation de caractéristique", base("force"), "add", {kind: "formula", id: "hausse-carac2"}, "self", "", {targetDefinitionFormulaRef: "carac2-choisie"});
  A("amelioration-ou-don", "Amélioration de caractéristique ou don", {inputs: [{id: "don", labelKey: "Don", valueType: "reference", definitionTypeId: "don", from: "all", required: true, defaultValue: "don-amelioration-de-caracteristique"}, ab("carac1", "Caractéristique (+1, ou +2 si choisie deux fois)", "force"), ab("carac2", "Seconde caractéristique (+1, Amélioration de caractéristique)", "force")],
    stateApplications: [stateApplyF("don-choisi", "self")], effectRefs: ["augmenter-carac1", "augmenter-carac2"],
    descriptionKey: "Le don Amélioration de caractéristique (+2 à une caractéristique, ou +1 à deux, 20 au plus) ou un autre don ; un don qui donne +1 l'ajoute à la première caractéristique."});
  for (const n of [1, 2]) {
    FR(`expertise-${n}`, `Expertise ${n}`, inputId(`competence${n}`));
    F(`expertise-${n}-valeur`, `Expertise ${n}`, iff(gte({type: "definitionValue", definition: input(`competence${n}`), capabilityId: "value", outputId: "value.base"}, lit(1)), lit(2), {type: "definitionValue", definition: input(`competence${n}`), capabilityId: "value", outputId: "value.base"}));
    E(`expertise-${n}`, `Expertise ${n}`, base("athletisme"), "set", {kind: "formula", id: `expertise-${n}-valeur`}, "self", "", {targetDefinitionFormulaRef: `expertise-${n}`});
  }
  A("expertise", "Expertise", {inputs: [skill("competence1", "Compétence maîtrisée", SKILL.stealth), skill("competence2", "Seconde compétence maîtrisée", SKILL.perception)], effectRefs: ["expertise-1", "expertise-2"], descriptionKey: "Deux compétences maîtrisées passent en Expertise (bonus de maîtrise doublé)."});
  FR("style-choisi", "Style de combat choisi", inputId("style"));
  A("style-de-combat", "Style de combat", {inputs: [{id: "style", labelKey: "Style de combat", valueType: "reference", definitionTypeId: "style-de-combat", from: "all", required: true, defaultValue: "don-defense"}], stateApplications: [stateApplyF("style-choisi", "self")], descriptionKey: "Un don de style de combat."});
  FR("ordre-choisi", "Ordre choisi", inputId("ordre"));
  FR("ordre-armes-de-guerre", "Armes de guerre de l'ordre", iff(or(eq(inputId("ordre"), lit("ordre-protecteur")), eq(inputId("ordre"), lit("ordre-gardien"))), lit("armes-de-guerre"), lit(null)));
  FR("ordre-armure", "Armure de l'ordre", iff(eq(inputId("ordre"), lit("ordre-protecteur")), lit("armures-lourdes"), iff(eq(inputId("ordre"), lit("ordre-gardien")), lit("armures-intermediaires"), lit(null))));
  const order = (id, nameKey, options, defaultValue) => A(id, nameKey, {inputs: [{id: "ordre", labelKey: nameKey, valueType: "reference", definitionTypeId: "option-de-classe", from: "all", required: true, defaultValue}], conditionRefs: [],
    stateApplications: [stateApplyF("ordre-choisi", "self"), stateApplyF("ordre-armes-de-guerre", "self"), stateApplyF("ordre-armure", "self")], descriptionKey: options});
  order("ordre-divin", "Ordre divin", "Protecteur (armes de guerre, armures lourdes) ou Thaumaturge (un sort mineur de plus, Sagesse aux tests d'Arcanes et de Religion).", "ordre-protecteur");
  order("ordre-primitif", "Ordre primitif", "Magicien (un sort mineur de plus, Sagesse aux tests d'Arcanes et de Nature) ou Gardien (armes de guerre, armures intermédiaires).", "ordre-gardien");
  const lore = (skills, ids) => iff(and(...ids.map((id, i) => i === 0 ? or(...skills.map(s => eq(inputId("competence"), lit(s)))) : lit(true))), max(lit(1), value("mod-sagesse")), lit(0));
  get("formulas", "bonus-test-competence").expression.args[0].args.push(iff(holds("ordre-thaumaturge"), lore([SKILL.arcana, SKILL.religion], [0]), lit(0)), iff(holds("ordre-magicien"), lore([SKILL.arcana, SKILL.nature], [0]), lit(0)));
  for (const n of [1, 2, 3]) {
    FR(`competence-supplementaire-${n}`, `Compétence ${n}`, inputId(`competence${n}`));
    F(`competence-supplementaire-${n}-valeur`, `Compétence ${n}`, max(lit(1), {type: "definitionValue", definition: input(`competence${n}`), capabilityId: "value", outputId: "value.base"}));
    E(`competence-supplementaire-${n}`, `Compétence ${n}`, base("athletisme"), "set", {kind: "formula", id: `competence-supplementaire-${n}-valeur`}, "self", "", {targetDefinitionFormulaRef: `competence-supplementaire-${n}`});
  }
  A("maitrises-supplementaires", "Maîtrises supplémentaires", {inputs: [skill("competence1", "Compétence", SKILL.history), skill("competence2", "Compétence", SKILL.insight), skill("competence3", "Compétence", SKILL.persuasion)], effectRefs: [1, 2, 3].map(n => `competence-supplementaire-${n}`), descriptionKey: "Collège du savoir : maîtrise de trois compétences au choix."});
  const CHOICE = [[/-ability-score-improvement(-\d+)?$/, "amelioration-ou-don"], [/-epic-boon$/, "amelioration-ou-don"], [/-expertise(-\d+)?$/, "expertise"], [/fighting-style$/, "style-de-combat"], [/^cleric-divine-order$/, "ordre-divin"], [/^druid-primal-order$/, "ordre-primitif"], [/^lore-bonus-proficiencies$/, "maitrises-supplementaires"]];
  const milestones = [];
  for (const c of srd("Classes")) {
    const cls = CLASS_IDS[c.index], subclass = srd("Subclasses").find(s => s.class.index === c.index);
    for (let lvl = 1; lvl <= 20; lvl++) {
      const byIndex = index => srd("Features").find(f => f.index === index);
      const own = srd("Levels").find(l => l.class?.index === c.index && !l.subclass && l.level === lvl)?.features ?? [];
      const sub = subclass ? srd("Levels").find(l => l.subclass?.index === subclass.index && l.level === lvl)?.features ?? [] : [];
      const features = [...own, ...sub].map(f => byIndex(f.index)).filter(Boolean);
      if (!features.length) continue;
      const choices = features.map(f => CHOICE.find(([re]) => re.test(f.index))?.[1]).filter(Boolean);
      K(`niveau-${cls}-${lvl}`, `${NAME(cls)} de niveau ${lvl}`, gte(level(cls), lit(lvl)));
      const definitionIds = [...features.map(f => apt(f.index)), ...(lvl === 3 && subclass ? [slug(tr("misc.Subclasses", subclass.index, "name", subclass.name))] : [])];
      choices.forEach((actionRef, i) => milestones.push({id: `${cls}-${lvl}${i ? `-${i + 1}` : ""}`, labelKey: `${NAME(cls)} ${lvl}${choices.length > 1 ? ` (${i + 1})` : ""}`, conditionRef: `niveau-${cls}-${lvl}`, definitionIds: i ? [] : definitionIds, actionRef}));
      if (!choices.length) milestones.push({id: `${cls}-${lvl}`, labelKey: `${NAME(cls)} ${lvl}`, conditionRef: `niveau-${cls}-${lvl}`, definitionIds, actionRef: null});
    }
  }
  add("progressionSystems", {id: "niveaux", nameKey: "Niveaux", descriptionKey: "Prendre un niveau dans une classe déjà prise, puis « Appliquer les étapes atteintes » : aptitudes du niveau, sous-classe au niveau 3, Amélioration de caractéristique ou don, Expertise, style de combat. Les points de vie, dés de vie, emplacements et ressources suivent les niveaux.", enabled: true, tags: [],
    advancements: [{id: "niveau-de-classe", labelKey: "Prendre un niveau", definitionTypeId: "niveau-de-classe", definitionIds: [], currencyRef: base("xp"), costFormulaRef: "cout-d-un-niveau", step: 1, maximumFormulaRef: null, conditionRef: "peut-prendre-un-niveau"}], milestones});
}

/* ---------- Class Items: the class taken at level 1, and the one added by multiclassing ---------- */
function classItems() {
  CT("classe", "Classe", "item", {de: intF("de", "Dé de vie"), multiclasse: boolF("multiclasse", "Multiclasse"), caracteristiquePrincipale: txtF("caracteristiquePrincipale", "Caractéristique principale")},
    "La classe du personnage : au niveau 1 (création) elle donne ses sauvegardes, maîtrises, compétences et équipement de départ ; en multiclasse, les maîtrises réduites. Son objet porte les actions de la classe.", "unique", "#5a3b8f");
  const prereq = {barbare: [["force"]], barde: [["charisme"]], clerc: [["sagesse"]], druide: [["sagesse"]], guerrier: [["force", "dexterite"]], moine: [["dexterite"], ["sagesse"]], paladin: [["force"], ["charisme"]], rodeur: [["dexterite"], ["sagesse"]], roublard: [["dexterite"]], ensorceleur: [["charisme"]], occultiste: [["charisme"]], magicien: [["intelligence"]]};
  for (const [cls, groups] of Object.entries(prereq)) KF(`prerequis-${cls}`, `Prérequis du multiclassage : ${NAME(cls)}`, and(...groups.map(group => or(...group.map(id => gte(value(id), lit(13)))))), groups.map(g => g.map(id => `${get("definitions", id).nameKey} 13`).join(" ou ")).join(" et "));
  for (const c of srd("Classes")) {
    const cls = CLASS_IDS[c.index], name = NAME(cls);
    const principal = primaryAbilities(c).map(a => get("definitions", AB[a.index]).nameKey).join(c.primary_ability.desc.includes(" or ") ? " ou " : " et ");
    const profIds = p => [PROF[p.index]].flat().filter(Boolean);
    const states = c.proficiencies.filter(p => !/^saving-throw|^skill-/.test(p.index)).flatMap(profIds);
    const grantProf = id => get("definitions", id).definitionTypeId === "outil" ? grantAdd(id, 1) : grant(id, "definition", id, {"state.active": true});
    const skills = c.proficiency_choices.filter(p => p.type === "proficiencies")[0];
    const skillGroup = (group, groupId) => group ? [{id: groupId, name: `Compétences (${group.choose})`, min: group.choose, max: group.choose, options: (group.from.options ?? []).map(o => o.item?.index).filter(i => PROF[i]).map(i => ({id: PROF[i], targetRef: {objectKind: "definition", objectId: PROF[i]}, operation: "grant", config: {add: {"value.base": 1}}}))}] : [];
    const actions = CLASS_ACTIONS[cls].map(grantAction);
    // Starting equipment: the class's package A (its Items and gold) or B (gold).
    const equipment = c.starting_equipment_options[0];
    const gold = o => o.option_type === "money" ? o.count : (o.items ?? []).filter(i => i.option_type === "money").reduce((n, i) => n + i.count, 0);
    const equipGroup = equipment ? [{id: "equipement", name: "Équipement de départ", min: 1, max: 1, options: equipment.from.options.map((o, i) => o.option_type === "money"
      ? {id: `po-${o.count}`, targetRef: {objectKind: "definition", objectId: "po"}, operation: "grant", config: {add: {"value.base": o.count}}}
      : {id: lotId(cls, i), targetRef: {objectKind: "contentTemplate", objectId: `lot-${lotId(cls, i)}`}, operation: "grant", config: {count: 1}})}] : [];
    (equipment?.from.options ?? []).forEach((o, i) => { if (o.option_type === "multiple") LOTS[lotId(cls, i)] = {name, letter: "ABCDEF"[i], options: o.items ?? [], gold: gold(o), desc: equipment?.desc ?? ""}; });
    TPL(`classe-${cls}`, name, "classe", {de: c.hit_die, multiclasse: false, caracteristiquePrincipale: principal}, {descriptionKey: `${name} de niveau 1 : sauvegardes de ${c.saving_throws.map(s => get("definitions", AB[s.index]).nameKey).join(" et ")}, d${c.hit_die} par niveau. ${tr("misc.Classes", c.index, "description", "")}`.trim(),
      relations: [grantAdd(`niveau-${cls}`, 1), grant(`classe-de-depart-${cls}`, "definition", `classe-de-depart-${cls}`, {"state.active": true}), ...c.saving_throws.map(s => grantAdd(`sauvegarde-${AB[s.index]}`, 1)), ...states.map(grantProf), ...actions],
      choiceGroups: [...skillGroup(skills, "competences"), ...equipGroup], tags: [`classe-${cls}`]});
    // Multiclassing: the prerequisites of the new class and of those already taken; a few proficiencies.
    const mc = c.multi_classing ?? {};
    for (const other of Object.values(CLASS_IDS)) if (!has_(`prerequis-si-${other}`)) K(`prerequis-si-${other}`, `Prérequis tenus : ${NAME(other)}`, or(eq(level(other), lit(0)), is(`prerequis-${other}`)));
    K(`pas-encore-${cls}`, `Pas encore ${name.toLowerCase()}`, eq(level(cls), lit(0)));
    A(`multiclasser-${cls}`, `Multiclasser : ${name}`, {conditionRefs: [`pas-encore-${cls}`, `prerequis-${cls}`, ...Object.values(CLASS_IDS).map(other => `prerequis-si-${other}`)], descriptionKey: `Prérequis : ${get("conditions", `prerequis-${cls}`).descriptionKey}, et ceux des classes déjà prises.`});
    const mcStates = (mc.proficiencies ?? []).flatMap(profIds);
    TPL(`multiclasse-${cls}`, `${name} (multiclasse)`, "classe", {de: c.hit_die, multiclasse: true, caracteristiquePrincipale: principal}, {acquisitionActionRef: `multiclasser-${cls}`,
      descriptionKey: `Ajouter ${name.toLowerCase()} à un personnage d'une autre classe : niveau 1 de ${name.toLowerCase()} (puis « Appliquer les étapes atteintes »). Prérequis : ${get("conditions", `prerequis-${cls}`).descriptionKey} et ceux des classes déjà prises.`,
      relations: [grantAdd(`niveau-${cls}`, 1), ...mcStates.map(grantProf), ...actions], choiceGroups: skillGroup((mc.proficiency_choices ?? [])[0], "competences"), tags: [`classe-${cls}`]});
  }
}
const has_ = id => get("conditions", id) !== undefined;
export const LOTS = {};
const lotId = (cls, i) => i ? `${cls}-${"abcdef"[i]}` : cls;
const primaryAbilities = c => c.primary_ability.ability_scores ?? c.primary_ability.ability_score_options.from.options.map(o => o.item);
