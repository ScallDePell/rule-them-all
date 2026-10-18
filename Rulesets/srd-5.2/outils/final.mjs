// Built last, once every other file has added its pieces: the derived values (Hit Point maximum, Speed, Armor Class),
// rests, the socle of a character, the values of each monster, and the creation of a player character.
import {C, add, get, PIECES, ABILITIES, val, base, pool, ref, lit, ctx, fx, sum, sub, mul, max, min, and, or, not, iff, eq, gt, lte, holds, value, defField,
  D, F, DERIVE, K, R, E, A, CT, TPL, grant, stateApply, stateRemove} from "./lib.mjs";
import {estPJ, incap} from "./regles.mjs";
import {armorClass} from "./equipement.mjs";
import {finalizeAttacks} from "./combat.mjs";
import {CREATURES} from "./creatures.mjs";
import {SPECIES, LINEAGES, BACKGROUNDS, ORIGIN_FEATS} from "./origines.mjs";
import {CLASS_IDS} from "./lib.mjs";

export function final() {
  /* ---------- Derived values ---------- */
  DERIVE("pv-maximum", iff(estPJ(), max(lit(1), sum(...PIECES.pvMaximum)), ref(base("pv-maximum"))),
    "Personnage : dé de vie maximal de la classe de départ, puis la moyenne arrondie au supérieur par niveau, + Constitution par niveau (et Robustesse naine, Résilience draconique). Monstre : son bloc de statistiques.");
  const stopped = or(...["agrippe", "entrave", "paralyse", "etourdi", "inconscient", "petrifie"].map(id => holds(id)));
  DERIVE("vitesse", iff(stopped, lit(0), max(lit(0), sum(iff(estPJ(), value("vitesse-de-base"), ref(base("vitesse"))), ...PIECES.vitesse, mul(lit(-1.5), value("epuisement"))))),
    "Vitesse de l'espèce (ou du monstre) + aptitudes et sorts ; 0 si Agrippé, Entravé, Paralysé, Étourdi, Inconscient ou Pétrifié ; −1,50 m par niveau d'Épuisement.");
  armorClass();
  finalizeAttacks();

  /* ---------- Rests ---------- */
  const restEffects = (rest, entries) => entries.map(([poolId, how, extra], i) => {
    const id = `${rest}-${poolId}${i ? "" : ""}`, current = ref(pool(poolId)), maximum = ref(pool(poolId, "pool.maximum"));
    const amount = how === "add" ? sum(current, extra) : extra ? iff(extra, maximum, current) : maximum;
    F(`${id}-calcul`, `${get("definitions", poolId).nameKey} après le repos`, amount);
    return E(id, `${rest === "repos-court" ? "Repos court" : "Repos long"} : ${get("definitions", poolId).nameKey}`, pool(poolId), "set", {kind: "formula", id: `${id}-calcul`}, "self");
  });
  const shortRest = restEffects("repos-court", PIECES.reposCourt);
  K("peut-se-reposer", "Peut se reposer", not(holds("mort")));
  A("repos-court", "Repos court", {conditionRefs: ["peut-se-reposer"], effectRefs: shortRest, descriptionKey: "Une heure au moins : les ressources qui reviennent au repos court sont récupérées (emplacements de pacte, Second souffle, Inspiration bardique au niveau 5…). Dépensez des dés de vie pour récupérer des points de vie."});
  // Spending a Hit Die: its roll + Constitution (at least 0), one die at a time.
  const HD = {id: "deDeVie", labelKey: "Dé de vie à dépenser", valueType: "reference", definitionTypeId: "de-de-vie", from: "held", required: true, defaultValue: "des-de-vie-d8"};
  const dieLeft = {type: "definitionValue", definition: ctx("variables.input.deDeVie"), capabilityId: "pool", slotId: "points", outputId: "pool.current"};
  K("de-de-vie-disponible", "Il reste un dé de vie de cette taille", and(gt(dieLeft, lit(0)), not(holds("mort"))));
  for (const faces of [6, 10, 12]) K(`de-de-vie-d${faces}`, `Dé de vie d${faces}`, eq(ctx("variables.input.deDeVie.objectId"), lit(`des-de-vie-d${faces}`)));
  R("de-de-vie", "Dé de vie", "1d8", [6, 10, 12].map(faces => ({conditionRef: `de-de-vie-d${faces}`, formula: `1d${faces}`})));
  F("bonus-de-de-vie", "Constitution (dé de vie)", value("mod-constitution"));
  F("de-de-vie-choisi", "Dé de vie choisi", ctx("variables.input.deDeVie.objectId"), "", "reference");
  E("depenser-de-de-vie", "Dépenser le dé de vie", pool("des-de-vie-d8"), "subtract", {kind: "literal", value: 1}, "self", "", {targetDefinitionFormulaRef: "de-de-vie-choisi"});
  E("soins-de-de-vie", "Points de vie du dé de vie", pool("pv"), "add", {kind: "roll", rollRef: "de-de-vie", bonusFormulaRef: "bonus-de-de-vie", minimum: 0}, "self");
  A("depenser-un-de-de-vie", "Dépenser un dé de vie", {inputs: [HD], conditionRefs: ["de-de-vie-disponible"], costEffectRefs: ["depenser-de-de-vie"], effectRefs: ["soins-de-de-vie"], descriptionKey: "Pendant un repos court : lancez le dé + modificateur de Constitution et récupérez autant de points de vie."});
  const longRest = restEffects("repos-long", PIECES.reposLong);
  F("pv-apres-repos-long", "Points de vie au maximum", ref(pool("pv", "pool.maximum")));
  E("repos-long-pv", "Repos long : points de vie", pool("pv"), "set", {kind: "formula", id: "pv-apres-repos-long"}, "self");
  E("repos-long-pv-temporaires", "Repos long : points de vie temporaires perdus", pool("pv-temporaires"), "set", {kind: "literal", value: 0}, "self");
  F("epuisement-apres-repos", "Épuisement après le repos long", max(lit(0), sub(ref(base("epuisement")), lit(1))));
  E("repos-long-epuisement", "Repos long : un niveau d'Épuisement en moins", base("epuisement"), "set", {kind: "formula", id: "epuisement-apres-repos"}, "self");
  K("peut-faire-un-repos-long", "Peut faire un repos long", and(not(holds("mort")), gt(ref(pool("pv")), lit(0))), "Il faut au moins 1 point de vie pour commencer un repos long.");
  A("repos-long", "Repos long", {conditionRefs: ["peut-faire-un-repos-long"], effectRefs: ["repos-long-pv", "repos-long-pv-temporaires", "repos-long-epuisement", ...longRest, "reussites-a-zero-soi", "echecs-a-zero-soi"],
    stateApplications: PIECES.reposLongEtats, stateRemovals: ["concentration", "rage-active", "stabilise"].map(id => stateRemove(id, "self")),
    descriptionKey: "Huit heures : tous les points de vie et tous les dés de vie, les emplacements de sort et les ressources ; un niveau d'Épuisement en moins ; les points de vie temporaires sont perdus."});

  /* ---------- What every creature holds ---------- */
  // Every value and pool is held from the start: the rules read them on any creature.
  const capsOf = d => get("definitionTypes", d.definitionTypeId).allowedCapabilities;
  const values = C.definitions.filter(d => capsOf(d).includes("value")).map(d => d.id);
  const pools = C.definitions.filter(d => capsOf(d).includes("pool")).map(d => d.id);
  CT("socle", "Socle", "item", {}, "Base d'un personnage joueur ou d'un monstre : toutes les valeurs et réserves que les règles lisent.");
  const abilities = new Set(ABILITIES.map(([, id]) => id));
  TPL("personnage", "Personnage joueur", "socle", {}, {descriptionKey: "Statut Personnage joueur, caractéristiques à 8 avant l'achat de points ou le tirage, et toutes les valeurs que les règles lisent.",
    relations: [grant("personnage-joueur", "definition", "personnage-joueur", {"state.active": true}), ...values.map(id => grant(id, "definition", id, abilities.has(id) ? {"value.base": 8} : undefined)), ...pools.map(id => grant(id, "definition", id))]});
  // A monster holds the values of its stat block, then the same base as a character (an Item), so the rules can read any value on it.
  TPL("valeurs-de-creature", "Valeurs de créature", "socle", {}, {descriptionKey: "Toutes les valeurs et réserves que les règles lisent, à 0 sauf celles du bloc de statistiques.",
    relations: [...values.map(id => grant(id, "definition", id)), ...pools.map(id => grant(id, "definition", id))]});
  for (const [templateId, {bases, states, items}] of Object.entries(CREATURES)) {
    const template = get("contentTemplates", templateId);
    template.relations = [...Object.entries(bases).map(([id, base]) => grant(id, "definition", id, {"value.base": base})), ...states.map(id => grant(id, "definition", id, {"state.active": true})),
      ...["valeurs-de-creature", ...items].map((id, i) => ({id: `contenu-${i + 1}-${id}`, operation: "grant", targetRef: {objectKind: "contentTemplate", objectId: id}, config: {count: 1}}))];
  }

  /* ---------- Creating a player character ---------- */
  D("methode-achat", "statut", "Caractéristiques : achat de points", {methode: "achat", immunite: ""}, {descriptionKey: "27 points : de 8 à 13 coûte 1 point par point, 14 et 15 coûtent 2. Le tableau standard (15, 14, 13, 12, 10, 8) coûte exactement 27."});
  D("methode-tirage", "statut", "Caractéristiques : tirage", {methode: "tirage", immunite: ""}, {descriptionKey: "4d6 par caractéristique, en gardant les trois meilleurs."});
  K("methode-est-achat", "Achat de points", eq(ctx("variables.creation.methode.fields.methode"), lit("achat")));
  K("methode-est-tirage", "Tirage", eq(ctx("variables.creation.methode.fields.methode"), lit("tirage")));
  F("cout-achat-de-points", "Coût d'un point", iff(lte(ctx("variables.allocation.point"), lit(5)), lit(1), lit(2)), "De 8 à 13 : 1 point ; 14 et 15 : 2 points.");
  R("creation-4d6", "4d6, les trois meilleurs (au-delà de 8)", "4d6kh3 - 8", [], "Ajouté aux 8 du socle : la caractéristique vaut le tirage (8 au moins).");
  K("espece-a-un-lignage", "L'espèce a un lignage", eq(ctx("variables.creation.espece.fields.lignage"), lit(true)));
  K("lignage-de-l-espece", "Lignage de cette espèce", eq(ctx("variables.option.fields.espece"), ctx("variables.creation.espece.fields.cle")));
  K("espece-humaine", "Humain : Polyvalent", eq(ctx("variables.creation.espece.fields.cle"), lit("humain")), "Les humains choisissent un don d'origine de plus.");
  const classes = Object.values(CLASS_IDS).map(cls => `classe-${cls}`);
  add("creationSystems", {enabled: true, tags: [], id: "creation-pj", nameKey: "Création d'un personnage",
    descriptionKey: "Classe, historique, espèce, caractéristiques. Ensuite, sur la feuille, « Niveaux » applique les aptitudes du niveau 1 (et le choix de leurs options).", steps: [
    {id: "socle", name: "Personnage joueur", kind: "content", required: true, min: 1, max: 1, options: [], source: {collection: "contentTemplates", objectIds: ["personnage"]}},
    {id: "classe", name: "Classe", kind: "content", required: true, min: 1, max: 1, options: [], source: {collection: "contentTemplates", objectIds: classes}},
    {id: "choix-classe", name: "Compétences et équipement de la classe", kind: "contentChoices", source: {stepIds: ["classe"]}},
    {id: "historique", name: "Historique", kind: "content", required: true, min: 1, max: 1, options: [], source: {collection: "contentTemplates", objectIds: BACKGROUNDS}},
    {id: "choix-historique", name: "Caractéristiques, langues, outil et équipement de l'historique", kind: "contentChoices", source: {stepIds: ["historique"]}},
    {id: "espece", name: "Espèce", kind: "content", required: true, min: 1, max: 1, options: [], source: {collection: "contentTemplates", objectIds: SPECIES}},
    {id: "lignage", name: "Lignage", kind: "content", required: true, min: 1, max: 1, options: [], source: {collection: "contentTemplates", objectIds: LINEAGES}, conditionRef: "espece-a-un-lignage", optionConditionRef: "lignage-de-l-espece"},
    {id: "don-d-origine", name: "Don d'origine (Polyvalent)", kind: "content", required: true, min: 1, max: 1, options: [], source: {collection: "contentTemplates", objectIds: ORIGIN_FEATS}, conditionRef: "espece-humaine"},
    {id: "choix-origine", name: "Choix de l'espèce et du don", kind: "contentChoices", source: {stepIds: ["espece", "lignage", "don-d-origine"]}},
    {id: "methode", name: "Caractéristiques : méthode", kind: "choice", required: true, min: 1, max: 1, options: [], source: {collection: "definitions", objectIds: ["methode-achat", "methode-tirage"]}},
    {id: "achat-de-points", name: "Achat de points (27)", kind: "allocation", required: true, min: 0, max: 27, perTargetMax: 7, costFormulaRef: "cout-achat-de-points", options: [], source: {collection: "definitions", objectIds: [...abilities]}, conditionRef: "methode-est-achat"},
    {id: "tirage", name: "Tirage (4d6, trois meilleurs)", kind: "allocation", required: false, min: 0, max: 0, draw: {locked: true, rollRef: "creation-4d6"}, options: [], source: {collection: "definitions", objectIds: [...abilities]}, conditionRef: "methode-est-tirage"},
    {id: "finalisation", name: "Finalisation", kind: "review", required: false, min: 0, max: 0, options: []}
  ]});

  return {id: "srd-5-2", nameKey: "SRD 5.2 (5e édition, règles 2024)", version: "1.0.0", color: "#8f2f2f",
    descriptionKey: "Les règles de la 5e édition révisée (2024) du System Reference Document 5.2 : caractéristiques, tests de d20, états, combat, dégâts et mort, magie et 339 sorts, 12 classes et leurs sous-classes, espèces, historiques, dons, équipement, objets magiques et 341 créatures. Textes traduits en français.\n\nThis work includes material from the System Reference Document 5.2 (\"SRD 5.2\") by Wizards of the Coast LLC, available at https://www.dndbeyond.com/srd. The SRD 5.2 is licensed under the Creative Commons Attribution 4.0 International License, available at https://creativecommons.org/licenses/by/4.0/legalcode. Traduction française et adaptation pour Rule Them'All.",
    initiative: {testRef: "initiative", tableRef: null, tieBreakFormulaRef: "departage-initiative", eachRound: false, bySide: false, passes: null}};
}
