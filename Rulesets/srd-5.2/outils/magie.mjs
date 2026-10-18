// Spellcasting (SRD 5.2, "Spells"): spell slots by caster level and Pact Magic, the spellcasting ability, spell save DC
// and attack bonus, every spell of the SRD as an Item with its Action (attack, saving throw, healing, damage, a state),
// casting at a higher level, cantrip upgrades, concentration and rituals.
import {add, get, srd, tr, clean, slug, AB, CLASS_IDS, CONDITIONS, DAMAGE, PIECES, apt, val, base, pool, ref, lit, ctx, fx, sum, sub, mul, max, min, floor, ceil, and, or, not, cf, defField, iff, eq, neq, gt, gte, lte, holds, value, lookup,
  D, POOL, F, FR, DERIVE, K, R, E, A, CT, TPL, stateApply, stateApplyF, stateRemove, grantAction, intF, txtF, boolF} from "./lib.mjs";
import {SUITE, estPJ, input, inputId, level, incap, damageFactor} from "./regles.mjs";
import {AV, ABRI, INSPIRATION, SPENT, ON_HIT, saveMappings, export_heal} from "./combat.mjs";

const PB = value("bonus-maitrise");
export const FULL_CASTERS = ["barde", "clerc", "druide", "ensorceleur", "magicien"];
export const HALF_CASTERS = ["paladin", "rodeur"];
export const CASTING = {barde: "charisme", clerc: "sagesse", druide: "sagesse", ensorceleur: "charisme", magicien: "intelligence", paladin: "charisme", rodeur: "sagesse", occultiste: "charisme"};
/** Spell slots of a full caster (or a multiclass caster level), by level: count per slot level 1 to 9. */
const SLOTS = [null, [2], [3], [4, 2], [4, 3], [4, 3, 2], [4, 3, 3], [4, 3, 3, 1], [4, 3, 3, 2], [4, 3, 3, 3, 1], [4, 3, 3, 3, 2], [4, 3, 3, 3, 2, 1], [4, 3, 3, 3, 2, 1], [4, 3, 3, 3, 2, 1, 1], [4, 3, 3, 3, 2, 1, 1],
  [4, 3, 3, 3, 2, 1, 1, 1], [4, 3, 3, 3, 2, 1, 1, 1], [4, 3, 3, 3, 2, 1, 1, 1, 1], [4, 3, 3, 3, 3, 1, 1, 1, 1], [4, 3, 3, 3, 3, 2, 1, 1, 1], [4, 3, 3, 3, 3, 2, 2, 1, 1]];
const PACT = {1: [1, 1], 2: [2, 1], 3: [2, 2], 4: [2, 2], 5: [2, 3], 6: [2, 3], 7: [2, 4], 8: [2, 4], 9: [2, 5], 10: [2, 5], 11: [3, 5], 12: [3, 5], 13: [3, 5], 14: [3, 5], 15: [3, 5], 16: [3, 5], 17: [4, 5], 18: [4, 5], 19: [4, 5], 20: [4, 5]};
const SCHOOLS = {};
const statut = (id, nameKey, descriptionKey) => D(id, "statut", nameKey, {immunite: ""}, {descriptionKey});

/** Spell overrides: what a parse of the text cannot tell (the state a buff gives, a spell with no roll). */
const OVERRIDES = {
  "bless": {famille: "etat", etat: "benediction"},
  "bane": {etat: "fleau"},
  "mage-armor": {famille: "etat", etat: "armure-de-mage"},
  "shield": {famille: "etat", etat: "sort-bouclier"},
  "shield-of-faith": {famille: "etat", etat: "bouclier-de-la-foi"},
  "hunters-mark": {famille: "etat", etat: "marque-du-chasseur"},
  "hex": {famille: "etat", etat: "malefice"},
  "divine-favor": {famille: "etat", etat: "faveur-divine"},
  "haste": {famille: "etat", etat: "hate"},
  "slow": {etat: "lenteur"},
  "invisibility": {famille: "etat", etat: "invisible"},
  "greater-invisibility": {famille: "etat", etat: "invisible"},
  "blur": {famille: "etat", etat: "flou"},
  "faerie-fire": {etat: "lueurs-feeriques"},
  "barkskin": {famille: "etat", etat: "peau-d-ecorce"},
  "guidance": {famille: "etat", etat: "assistance"},
  "longstrider": {famille: "etat", etat: "grande-foulee"},
  "heroism": {famille: "etat", etat: "immunite-effraye"},
  "protection-from-poison": {famille: "etat", etat: "resistance-poison"},
  "magic-missile": {famille: "degats", degats: "3d4+3", up: n => `${n + 2}d4+${n + 2}`},
  "heal": {famille: "soins", soins: "70", soinsUp: n => String(70 + 10 * (n - 6))}, "power-word-heal": {famille: "soins", soins: "1000"},
  "dimension-door": {famille: "utilitaire"}, "fire-shield": {famille: "utilitaire"}, "meld-into-stone": {famille: "utilitaire"}, "power-word-kill": {famille: "utilitaire"},
  "spike-growth": {famille: "utilitaire"}, "teleport": {famille: "utilitaire"}, "wish": {famille: "utilitaire"}
};
const CONDITION_NAMES = Object.fromEntries(Object.entries(CONDITIONS).map(([k, id]) => [k[0].toUpperCase() + k.slice(1), id]));

/** Dice of an upcast: the base dice plus n times the added ones (8d6 + 2 × 1d6 = 10d6). */
function addDice(baseDice, extra, times) {
  if (!times) return baseDice;
  const b = /^(\d+)d(\d+)(.*)$/.exec(baseDice), e = /^(\d+)d(\d+)$/.exec(extra);
  if (b && e && b[2] === e[2]) return `${Number(b[1]) + Number(e[1]) * times}d${b[2]}${b[3]}`;
  return `${baseDice} + ${Number(e?.[1] ?? 1) * times}d${e?.[2] ?? 6}`;
}
/** What the rules need from a spell's English text. */
export function parseSpell(s) {
  const text = `${s.description}\n${s.higher_level ?? ""}`, o = OVERRIDES[s.index] ?? {};
  const save = /(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma) saving throw/.exec(text);
  const heal = /regains? (?:a number of )?Hit Points equal to (\d+d\d+|\d+)( plus your spellcasting ability modifier)?/.exec(text) ?? /regain(?:s)? (\d+d\d+(?: \+ \d+)?|\d+) Hit Points/.exec(s.description);
  const condition = /\b(Blinded|Charmed|Deafened|Frightened|Grappled|Incapacitated|Invisible|Paralyzed|Petrified|Poisoned|Prone|Restrained|Stunned|Unconscious) condition/.exec(s.description);
  // The damage upcast: the first "increases by XdY for each slot level above N" that is not about healing.
  const up = [...text.matchAll(/(\w+) (?:\w+ )?increases? by (\d+d\d+) for each (?:spell )?slot level above (\d)/g)].map(m => [m[0], m[2], m[3], m[1]]).find(m => !/healing/i.test(m[0])) ?? null;
  const healUp = /[Hh]ealing increases by (\d+d\d+) for each (?:spell )?slot level above (\d)/.exec(text);
  const tiers = /levels 5 \((\S+?)\), 11 \((\S+?)\),? and 17 \((\S+?)\)/.exec(s.description);
  const dmg = s.damage ? Object.values(s.damage.damage_at_slot_level)[0] : o.degats ?? "0";
  const out = {
    niveau: s.level, attaque: Boolean(s.attack_type), corpsACorps: s.attack_type === "melee",
    sauvegarde: save ? AB[save[1].toLowerCase()] : "", moitie: /half as much damage/.test(text),
    degats: o.degats ?? dmg, typeDegats: s.damage ? DAMAGE[s.damage.damage_type.index] : (o.degats ? "force" : ""),
    etat: o.etat ?? (save && condition ? CONDITION_NAMES[condition[1]] : ""),
    soins: o.soins ?? (heal ? heal[1] : ""), ajouteMod: Boolean(heal?.[2])
  };
  if (s.level > 0) for (let n = s.level; n <= 9; n++) {
    out[`degats${n}`] = o.up ? o.up(n) : up ? addDice(out.degats, up[1], n - Number(up[2])) : out.degats;
    if (out.soins) out[`soins${n}`] = o.soinsUp ? o.soinsUp(n) : healUp ? addDice(out.soins, healUp[1], n - Number(healUp[2])) : out.soins;
  }
  if (s.level === 0 && tiers) [out.degatsPalier2, out.degatsPalier3, out.degatsPalier4] = [tiers[1], tiers[2], tiers[3]];
  out.famille = o.famille ?? (out.soins && !out.attaque && !out.sauvegarde ? "soins" : out.attaque ? "attaque" : out.sauvegarde ? `sauvegarde-${out.sauvegarde}` : s.damage ? "degats" : out.etat ? "etat" : "utilitaire");
  return out;
}

export function magic() {
  /* ---------- Caster level, slots, Pact Magic ---------- */
  D("niveau-lanceur", "valeur-derivee", "Niveau de lanceur de sorts", {}, {descriptionKey: "Niveaux de barde, clerc, druide, ensorceleur et magicien, plus la moitié (arrondie au supérieur) des niveaux de paladin et de rôdeur. Donne les emplacements de sort (l'occultiste a ses emplacements de pacte à part)."});
  DERIVE("niveau-lanceur", sum(...FULL_CASTERS.map(level), ...HALF_CASTERS.map(cls => ceil({type: "divide", args: [level(cls), lit(2)]}))));
  for (let n = 1; n <= 9; n++) {
    const table = Object.fromEntries(SLOTS.map((row, lvl) => [lvl, row?.[n - 1] ?? 0]).slice(1));
    F(`emplacements-${n}-maximum`, `Emplacements de niveau ${n} (maximum)`, iff(estPJ(), lookup(value("niveau-lanceur"), table, 0), ref(base(`emplacements-${n}-monstre`))), "Selon le niveau de lanceur de sorts (table du lanceur multiclassé).");
    D(`emplacements-${n}-monstre`, "compteur", `Emplacements de niveau ${n} (monstre)`, {}, {descriptionKey: "Pour un monstre lanceur de sorts, le nombre d'emplacements de ce niveau."});
    POOL(`emplacements-${n}`, "emplacement-de-sort", `Emplacements de niveau ${n}`, `emplacements-${n}-maximum`, {niveau: n}, {descriptionKey: `Emplacements de sort de niveau ${n}. Tous récupérés au repos long.`});
    PIECES.reposLong.push([`emplacements-${n}`, "max"]);
  }
  D("niveau-emplacements-pacte", "valeur-derivee", "Niveau des emplacements de pacte", {}, {descriptionKey: "Magie de pacte de l'occultiste : tous ses emplacements sont du même niveau (1 à 5)."});
  DERIVE("niveau-emplacements-pacte", lookup(level("occultiste"), Object.fromEntries(Object.entries(PACT).map(([k, [, l]]) => [k, l])), 0));
  F("emplacements-pacte-maximum", "Emplacements de pacte (maximum)", lookup(level("occultiste"), Object.fromEntries(Object.entries(PACT).map(([k, [c]]) => [k, c])), 0));
  POOL("emplacements-pacte", "emplacement-de-sort", "Emplacements de pacte", "emplacements-pacte-maximum", {niveau: 0}, {descriptionKey: "Magie de pacte : emplacements récupérés au repos court comme au repos long."});
  PIECES.reposCourt.push(["emplacements-pacte", "max"]); PIECES.reposLong.push(["emplacements-pacte", "max"]);

  /* ---------- Spellcasting ability, DC, attack ---------- */
  for (const [id, nameKey, descriptionKey] of [["modificateur-incantation", "Modificateur d'incantation", "Le meilleur modificateur parmi les caractéristiques d'incantation des classes du personnage (Charisme : barde, ensorceleur, occultiste, paladin ; Sagesse : clerc, druide, rôdeur ; Intelligence : magicien)."],
    ["dd-sorts", "DD de sauvegarde des sorts", "8 + modificateur d'incantation + bonus de maîtrise."], ["attaque-sorts", "Bonus d'attaque des sorts", "Modificateur d'incantation + bonus de maîtrise."]])
    D(id, "valeur-derivee", nameKey, {}, {descriptionKey});
  const casting = max(lit(0), ...Object.entries(CASTING).map(([cls, ab]) => iff(gt(level(cls), lit(0)), value(`mod-${ab}`), lit(-5))));
  DERIVE("modificateur-incantation", iff(estPJ(), casting, ref(base("modificateur-incantation"))));
  DERIVE("dd-sorts", iff(estPJ(), sum(lit(8), value("modificateur-incantation"), PB), ref(base("dd-sorts"))), "8 + modificateur d'incantation + bonus de maîtrise ; celui du bloc pour un monstre.");
  DERIVE("attaque-sorts", iff(estPJ(), sum(value("modificateur-incantation"), PB), ref(base("attaque-sorts"))), "Modificateur d'incantation + bonus de maîtrise ; celui du bloc pour un monstre.");

  /* ---------- States that spells give ---------- */
  statut("sort-bouclier", "Bouclier (sort)", "+5 à la CA jusqu'au début du prochain tour du lanceur.");
  statut("bouclier-de-la-foi", "Bouclier de la foi", "+2 à la CA tant que dure le sort.");
  statut("faveur-divine", "Faveur divine", "Les attaques avec une arme infligent 1d4 dégâts radiants de plus.");
  statut("hate", "Hâte", "+2 à la CA, Avantage aux sauvegardes de Dextérité, Vitesse doublée, une action supplémentaire limitée.");
  statut("lenteur", "Lenteur", "−2 à la CA et aux sauvegardes de Dextérité, Vitesse divisée par deux, pas de réaction.");
  statut("flou", "Flou", "Les jets d'attaque contre la créature ont le Désavantage.");
  statut("lueurs-feeriques", "Lueurs féeriques", "Les jets d'attaque contre la créature ont l'Avantage ; elle ne peut pas être Invisible.");
  statut("peau-d-ecorce", "Peau d'écorce", "La CA ne peut pas être inférieure à 17.");
  statut("assistance", "Assistance", "Ajoute 1d4 à un test de caractéristique (Assistance).");
  statut("grande-foulee", "Grande foulée", "+3 m de Vitesse.");
  PIECES.caBonus.push(iff(holds("sort-bouclier"), lit(5), lit(0)), iff(holds("bouclier-de-la-foi"), lit(2), lit(0)), iff(holds("hate"), lit(2), lit(0)), iff(holds("lenteur"), lit(-2), lit(0)));
  PIECES.caMinimum.push(iff(holds("peau-d-ecorce"), lit(17), lit(0)));
  PIECES.vitesse.push(iff(holds("grande-foulee"), lit(3), lit(0)));
  get("formulas", "si-desavantage-attaque-brut").expression.args.push(holds("flou", "target"));
  get("formulas", "si-avantage-attaque-brut").expression.args.push(holds("lueurs-feeriques", "target"));
  get("formulas", "si-d20-sauvegarde-dexterite-avantage").expression.args[0].args.push(holds("hate"));
  get("formulas", "si-d20-sauvegarde-sort-dexterite-avantage").expression.args[0].args.push(holds("hate"));
  get("formulas", "bonus-sauvegarde-dexterite").expression.args[0].args.push(iff(holds("lenteur"), lit(-2), lit(0)));
  R("d4-assistance", "1d4 (Assistance)", "1d4"); K("assiste", "Assistance", holds("assistance"));
  for (const id of ["test-de-caracteristique", "test-de-competence", "test-d-outil"]) get("tests", id).extraRolls.push({conditionRef: "assiste", rollRef: "d4-assistance", operation: "add"});
  // Divine Favor rides on weapon hits like the other extra dice.
  R("faveur-divine-des", "Faveur divine", "1d4"); F("facteur-faveur-divine", "Résistance : Faveur divine", damageFactor(lit("radiant")));
  K("faveur-divine-possible", "Faveur divine", and(holds("faveur-divine"), neq(cf("categorie", ""), lit(""))));
  E("faveur-divine-degats", "Faveur divine", base("degats-a-appliquer"), "add", {kind: "roll", rollRef: "faveur-divine-des", multiplierFormulaRef: "multiplicateur-critique", factorFormulaRef: "facteur-faveur-divine"}, "target");
  A("faveur-divine", "Faveur divine", {conditionRefs: ["faveur-divine-possible"], effectRefs: ["faveur-divine-degats"]}); ON_HIT.push("faveur-divine");

  /* ---------- Casting ---------- */
  const SLOT = {id: "emplacement", labelKey: "Emplacement de sort", valueType: "reference", definitionTypeId: "emplacement-de-sort", from: "held", required: true, defaultValue: "emplacements-1"};
  const CRIT = {id: "critique", labelKey: "Après un coup critique (dés doublés)", valueType: "boolean", required: false, defaultValue: false};
  FR("emplacement-choisi", "Emplacement choisi", inputId("emplacement"));
  F("niveau-de-l-emplacement", "Niveau de l'emplacement", iff(eq(inputId("emplacement"), lit("emplacements-pacte")), value("niveau-emplacements-pacte"), defField(input("emplacement"), "niveau")));
  const slotLeft = {type: "definitionValue", definition: input("emplacement"), capabilityId: "pool", slotId: "points", outputId: "pool.current"};
  K("emplacement-disponible", "Un emplacement assez haut", and(gt(slotLeft, lit(0)), gte(fx("niveau-de-l-emplacement"), cf("niveau", 1))), "Il reste un emplacement de ce niveau, au moins égal à celui du sort.");
  E("depenser-emplacement", "Dépenser l'emplacement", pool("emplacements-1"), "subtract", {kind: "literal", value: 1}, "self", "", {targetDefinitionFormulaRef: "emplacement-choisi"});
  K("peut-lancer", "Peut lancer un sort", and(not(incap()), not(holds("mort")), not(holds("rage-active"))), "Pas Neutralisé ni en Rage.");
  FR("concentration-du-sort", "Concentration du sort", iff(cf("concentration", false), lit("concentration"), lit(null)));
  const concentration = stateApplyF("concentration-du-sort", "self");
  // Healing: the spell's dice (more at a higher slot), the spellcasting modifier when it says so, Disciple of Life.
  for (let n = 9; n >= 1; n--) K(`soins-niveau-${n}`, `Soins au niveau ${n}`, and(or(eq(inputId("emplacement"), lit(`emplacements-${n}`)), and(eq(inputId("emplacement"), lit("emplacements-pacte")), eq(value("niveau-emplacements-pacte"), lit(n)))), neq(cf(`soins${n}`, ""), lit(""))));
  R("soins-effet", "Soins du sort", "@content.soins", Array.from({length: 9}, (_, i) => 9 - i).map(n => ({conditionRef: `soins-niveau-${n}`, formula: `@content.soins${n}`})));
  F("bonus-soins-effet", "Bonus de soins", sum(iff(cf("ajouteMod", false), value("modificateur-incantation"), lit(0)),
    iff(and(holds(apt("life-disciple-of-life")), gt(cf("niveau", 0), lit(0))), sum(lit(2), iff(inputId("emplacement"), fx("niveau-de-l-emplacement"), lit(0))), lit(0))), "Modificateur d'incantation quand le sort l'ajoute ; Disciple de la vie : 2 + niveau de l'emplacement.");
  E("soins-effet", "Soins", pool("pv"), "add", {kind: "roll", rollRef: "soins-effet", bonusFormulaRef: "bonus-soins-effet", minimum: 0}, "target");
  FR("etat-du-sort", "État donné par le sort", iff(neq(cf("etat", ""), lit("")), cf("etat", ""), lit(null)));
  const reset = "degats-reinitialises";
  const families = {
    utilitaire: {descriptionKey: "Le sort est lancé ; son texte dit ce qu'il fait."},
    attaque: {inputs: [AV, ABRI, INSPIRATION], testRef: "attaque-sort", targeting: "each", stateRemovals: [...SPENT, stateRemove("invisible", "self")],
      outcomeMappings: ["coup-critique", "critique-au-contact", "touche"].map(outcomeId => ({outcomeId, effectRefs: [reset, "degats-effet"], actionRefs: [...SUITE, "subir-l-etat-de-l-effet"]})),
      descriptionKey: "Jet d'attaque de sort contre la CA de chaque cible ; les dégâts du sort (doublés au critique) si elle est touchée."},
    soins: {targeting: "each", effectRefs: ["soins-effet", "reussites-a-zero", "echecs-a-zero"], stateRemovals: export_heal.removals, descriptionKey: "Chaque cible récupère les points de vie du sort (une créature à 0 reprend conscience)."},
    degats: {inputs: [CRIT], targeting: "each", testRef: "resolution", outcomeMappings: [{outcomeId: "resolu", effectRefs: [reset, "degats-effet"], actionRefs: SUITE}], descriptionKey: "Les dégâts du sort touchent chaque cible sans jet."},
    etat: {targeting: "each", stateApplications: [stateApplyF("etat-du-sort")], descriptionKey: "Chaque cible reçoit l'effet du sort."}
  };
  for (const [, ab] of Object.entries(AB).filter(([k]) => k.length === 3)) families[`sauvegarde-${ab}`] = {testRef: `dd-sort-${ab}`, targeting: "each", outcomeMappings: [...saveMappings.failed, ...saveMappings.saved],
    descriptionKey: `Chaque cible fait un jet de sauvegarde de ${get("definitions", ab).nameKey} contre le DD des sorts : dégâts et état du sort si elle échoue, la moitié des dégâts si elle réussit et que le sort le dit.`};
  for (const [family, more] of Object.entries(families)) {
    const applied = [concentration, ...(more.stateApplications ?? [])];
    A(`sort-mineur-${family}`, family === "utilitaire" ? "Lancer le sort mineur" : "Lancer le sort mineur", {...more, inputs: (more.inputs ?? []).filter(i => i.id !== "critique"), conditionRefs: ["peut-lancer"], stateApplications: applied});
    A(`sort-${family}`, "Lancer le sort", {...more, inputs: [SLOT, ...(more.inputs ?? [])], conditionRefs: ["peut-lancer", "emplacement-disponible"], costEffectRefs: ["depenser-emplacement"], stateApplications: applied,
      descriptionKey: `${more.descriptionKey} Dépense un emplacement du niveau choisi : au-dessus du niveau du sort, ses effets augmentent comme il le dit.`});
  }
  A("sort-rituel", "Lancer en rituel", {conditionRefs: ["peut-lancer"], stateApplications: [concentration], descriptionKey: "Sans dépenser d'emplacement, en 10 minutes de plus que le temps d'incantation."});

  /* ---------- Spells ---------- */
  const classFields = Object.fromEntries(Object.values(CLASS_IDS).map(id => [id, boolF(id, get("definitions", `niveau-${id}`)?.nameKey.replace(/^Niveau de /, "") ?? id)]));
  const dmgFields = Object.fromEntries([...Array.from({length: 9}, (_, i) => [`degats${i + 1}`, `Dégâts au niveau ${i + 1}`]), ...Array.from({length: 9}, (_, i) => [`soins${i + 1}`, `Soins au niveau ${i + 1}`]), ["degatsPalier2", "Dégâts au niveau 5"], ["degatsPalier3", "Dégâts au niveau 11"], ["degatsPalier4", "Dégâts au niveau 17"]].map(([id, name]) => [id, txtF(id, name)]));
  CT("sort", "Sort", "item", {niveau: intF("niveau", "Niveau (0 : sort mineur)"), ecole: txtF("ecole", "École"), tempsIncantation: txtF("tempsIncantation", "Temps d'incantation"), portee: txtF("portee", "Portée"),
    composantes: txtF("composantes", "Composantes"), duree: txtF("duree", "Durée"), concentration: boolF("concentration", "Concentration"), rituel: boolF("rituel", "Rituel"), prepare: boolF("prepare", "Préparé"), ...classFields,
    attaque: boolF("attaque", "Jet d'attaque"), corpsACorps: boolF("corpsACorps", "Attaque au corps à corps"), sauvegarde: txtF("sauvegarde", "Sauvegarde"), moitie: boolF("moitie", "Moitié des dégâts si la sauvegarde réussit"),
    degats: txtF("degats", "Dégâts"), typeDegats: txtF("typeDegats", "Type de dégâts"), ajouteModDegats: boolF("ajouteModDegats", "Ajoute le modificateur d'incantation aux dégâts"), etat: txtF("etat", "État ou effet donné"),
    soins: txtF("soins", "Soins"), ajouteMod: boolF("ajouteMod", "Ajoute le modificateur d'incantation aux soins"), ...dmgFields}, "Un sort connu ou préparé. Son action le lance : emplacement, jet d'attaque ou de sauvegarde, dégâts, soins et concentration.", "unique", "#3b5a8f");
  for (const school of srd("Magic-Schools")) SCHOOLS[school.index] = slug(tr("misc.Magic-Schools", school.index, "name", school.name));
  for (let n = 0; n <= 9; n++) add("tags", {id: `niveau-${n}`, nameKey: n ? `Sort de niveau ${n}` : "Sort mineur", descriptionKey: "", color: null});
  const spellIds = [];
  for (const s of srd("Spells")) {
    const p = parseSpell(s), id = `sort-${slug(tr("spells", s.index, "name", s.name))}`;
    const components = s.components.join(", ") + (s.material ? ` (${tr("spells", s.index, "material", s.material)})` : "");
    const description = clean([tr("spells", s.index, "description", s.description), tr("spells", s.index, "higher_level", s.higher_level ?? "")].filter(Boolean).join("\n\n"));
    const {famille, ...fields} = p;
    for (const key of Object.keys(fields)) if (fields[key] === "" && !["degats", "typeDegats", "etat", "sauvegarde", "soins"].includes(key)) delete fields[key];
    const data = {...fields, ecole: SCHOOLS[s.school.index], tempsIncantation: tr("spells", s.index, "casting_time", s.casting_time), portee: tr("spells", s.index, "range", s.range), composantes: components,
      duree: tr("spells", s.index, "duration", s.duration), concentration: s.concentration, rituel: s.ritual, prepare: false, ajouteModDegats: false,
      ...Object.fromEntries(Object.values(CLASS_IDS).map(cls => [cls, false])), ...Object.fromEntries(s.classes.map(c => [CLASS_IDS[c.index], true]))};
    const relations = [grantAction(s.level === 0 ? `sort-mineur-${famille}` : `sort-${famille}`), ...(s.ritual ? [grantAction("sort-rituel")] : [])];
    TPL(id, tr("spells", s.index, "name", s.name), "sort", data, {descriptionKey: description, relations, tags: [`niveau-${s.level}`]});
    spellIds.push(id); SPELLS[s.index] = id;
  }
  return spellIds;
}
export const SPELLS = {};
